import { claudeAccountUsagePreparation } from './claude-account-usage-preparation'
import { claudeProfileSelectionHomes } from './claude-profile-selection-homes'
import { prepareClaudeProfileForLaunch } from './claude-profile-launch-preparation'
import { homedir } from 'node:os'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import {
  CLAUDE_PROFILE_POINTER_ENV,
  CLAUDE_PROFILE_SETUP_FAILED_MESSAGE
} from '../../../../shared/claude-profile-routing'
import {
  assertAssignedClaudeAccountSignedIn,
  claudeProfileMissing
} from './claude-profile-launch-errors'
import type { ClaudeAccountScope } from '../../../../shared/claude-account-assignment'
import {
  claudeRouteLaunchEnv,
  claudeRoutePreparation,
  claudeTerminalBaseEnv,
  publishClaudeScopePointers,
  resolveClaudeRoute,
  type ClaudeRoute,
  type ClaudeRouteSources
} from './claude-profile-route'
import type { GlobalSettings } from '../../../../shared/global-settings-types'
import type { ClaudeManagedAccount } from '../../../../shared/managed-account-types'
import {
  describeClaudeProfile,
  type ClaudeProfileDescriptor,
  readUserClaudeConfigDir,
  resolveClaudeDefaultHome
} from '../claude-profile-paths'
import type { ClaudeProfileSetupReport } from '../setup/claude-profile-setup'
import type { runClaudeProfileSetupInWorker } from '../setup/claude-profile-setup-worker'
import { runClaudeProfileSetup } from '../setup/claude-profile-setup-run'
import type { ClaudeEnvPatch } from '../../runtime-auth/environment'
import type { ClaudeRuntimeAuthPreparation } from '../../runtime-auth/runtime-auth-types'
import {
  findClaudeAccount,
  getSelectedClaudeAccountIdForTarget,
  type ClaudeAccountSelectionTarget
} from '../../selection/runtime-selection'
import { wslClaudeProfilePointer } from '../wsl/claude-profile-wsl-paths'
import { isDirectory, listClaudeProfileHomes } from '../claude-profile-homes'
import {
  claudeStateFile,
  readClaudeFolderLogin,
  removeClaudeAccountFolder,
  isSameClaudeLogin,
  type ClaudeFolderLogin
} from '../../sign-in/claude-account-folder'
import { resolveLoginShellEnvironment } from '../../../startup/shell-environment/login-shell-environment'
import { claudeSystemDefaultRunsAnotherAccount } from './claude-profile-routed-home'
import { syncClaudeProfileHostPointer } from './claude-profile-host-pointer'
import type { ClaudeLaunchScope } from './claude-launch-scope'

export type ClaudeProfileRouterSettings = Pick<
  GlobalSettings,
  | 'claudeManagedAccounts'
  | 'activeClaudeManagedAccountId'
  | 'activeClaudeManagedAccountIdsByRuntime'
  | 'agentStatusHooksEnabled'
  | 'disabledTuiAgents'
>

/** Mirror the settings selection to a pointer file for Claude in existing terminals. */
export class ClaudeProfileRouter {
  readonly pointerPath: string
  private readonly setups = new Map<string, Promise<ClaudeProfileSetupReport>>()
  private env: NodeJS.ProcessEnv
  private readonly envReady: Promise<unknown>
  private envResolved: boolean
  constructor(
    private readonly args: {
      getSettings: () => ClaudeProfileRouterSettings
      dataRoot: string
      userHome?: string
      env?: NodeJS.ProcessEnv
      runSetup?: typeof runClaudeProfileSetupInWorker
      refreshWaitMs?: number
      /** The project a workspace belongs to and the account assigned to it; throws while the catalog is unloaded. */
      assignment?: (workspaceId: string) => ClaudeAccountScope | null
    }
  ) {
    this.pointerPath = join(args.dataRoot, 'claude-profiles', 'selected-host')
    this.env = args.env ?? process.env
    // Dock launches lack CLAUDE_CONFIG_DIR exported by shell startup files.
    this.envResolved = Boolean(args.env)
    this.envReady = args.env
      ? Promise.resolve()
      : resolveLoginShellEnvironment().then((env) => {
          this.env = env
          this.envResolved = true
          // Recompute routing using the resolved System default.
          try {
            this.writePointer()
          } catch (error) {
            console.warn('[claude-profile] Could not update the Claude account pointer:', error)
          }
        })
  }

  get userHome(): string {
    return this.args.userHome ?? homedir()
  }

  /** The account a workspace names; without a scope, the global selection. */
  selectedProfile(scope?: ClaudeLaunchScope): ClaudeProfileDescriptor | null {
    if (scope) {
      return this.route(scope).selected
    }
    const id = getSelectedClaudeAccountIdForTarget(this.args.getSettings(), { runtime: 'host' })
    return id ? this.describe(id) : null
  }

  private get routeSources(): ClaudeRouteSources {
    return {
      assignment: this.args.assignment,
      describe: (accountId) => this.describe(accountId),
      globalProfile: () => this.selectedProfile(),
      globalPointerPath: this.pointerPath,
      scopePointerDir: join(this.args.dataRoot, 'claude-profiles', 'scopes')
    }
  }

  private route(scope?: ClaudeLaunchScope): ClaudeRoute {
    return resolveClaudeRoute(this.routeSources, scope)
  }

  private routedProfile(route: ClaudeRoute = this.route()): ClaudeProfileDescriptor | null {
    const profile = route.selected
    return profile && !this.coveredBySystemDefault(profile.accountId) ? profile : null
  }

  accountLogin(accountId: string): ClaudeFolderLogin | null {
    return readClaudeFolderLogin(claudeStateFile(this.accountHome(accountId), this.userHome))
  }

  systemDefaultLogin(maxAgeMs = 0): ClaudeFolderLogin | null {
    return readClaudeFolderLogin(claudeStateFile(this.userConfigDir(), this.userHome), maxAgeMs)
  }

  /** Reuse a matching System default login until a legacy account signs in separately. */
  coveredBySystemDefault(accountId: string): boolean {
    if (this.accountLogin(accountId)) {
      return false
    }
    const saved = this.savedAccount(accountId)
    const systemDefault = this.systemDefaultLogin()
    return Boolean(saved && systemDefault && isSameClaudeLogin(saved, systemDefault))
  }

  savedAccount(accountId: string): ClaudeManagedAccount | undefined {
    return findClaudeAccount(this.args.getSettings(), accountId)
  }

  systemDefaultHome(): string {
    return resolveClaudeDefaultHome(this.userHome, this.userConfigDir())
  }

  /** Never fall back from a missing folder: that would run the wrong account. `identity` names
   *  the selected route before its folder exists; launches and reads still check availability. */
  routedHome(
    availability: 'checked' | 'identity' = 'checked',
    scope?: ClaudeLaunchScope
  ): string | null {
    return this.homeOf(this.route(scope), availability)
  }

  private homeOf(
    route: ClaudeRoute,
    availability: 'checked' | 'identity' = 'checked'
  ): string | null {
    const home = this.routedProfile(route)?.home ?? null
    if (availability === 'checked' && home !== null && !isDirectory(home)) {
      throw claudeProfileMissing()
    }
    return home
  }

  /** Publish the pointer before starting background setup. */
  publish(): void {
    const managed = this.writePointer()
    void this.publishScopePointers()
    if (!managed) {
      return
    }
    // Create missing or covered folders without a login so they can sign in separately.
    const profile = this.selectedProfile()
    if (profile) {
      this.setUpInBackground(profile)
    }
  }

  /** Rewrite every per-project pointer an open pane may hold. */
  publishScopePointers(): Promise<void> {
    return publishClaudeScopePointers(this.routeSources, (route) => this.writePointer(route))
  }

  private writePointer(route: ClaudeRoute = this.route()): boolean {
    const managed = this.args.getSettings().claudeManagedAccounts.length > 0
    syncClaudeProfileHostPointer(
      route.pointerPath,
      managed ? (this.routedProfile(route)?.home ?? '') : null
    )
    return managed
  }

  private setUpInBackground(profile: ClaudeProfileDescriptor): void {
    this.setUp(profile).catch((error: unknown) => {
      console.warn('[claude-profile] Account setup failed:', error)
    })
  }

  /** Refreshes the routed folder first; only a first setup that fails stops the launch. */
  async prepareLaunch(scope?: ClaudeLaunchScope): Promise<ClaudeRuntimeAuthPreparation> {
    const route = this.route(scope)
    const { selected, assignment } = route
    // Only fallback routing needs the shell env; account setup waits for it separately.
    if (!selected || !this.accountLogin(selected.accountId)) {
      await this.envReady
    }
    assertAssignedClaudeAccountSignedIn(this, assignment)
    // Login changes since publication can change the route.
    this.writePointer(route)
    const profile = this.routedProfile(route)
    if (!profile) {
      return this.preparationOf(route)
    }
    await prepareClaudeProfileForLaunch(
      profile,
      (value) => this.setUp(value),
      this.args.refreshWaitMs
    )
    return this.preparationOf(route)
  }

  accountHome(accountId: string): string {
    return this.describe(accountId).home
  }

  async prepareAccount(accountId: string): Promise<string> {
    const profile = this.describe(accountId)
    const report = await this.setUp(profile).catch(() => null)
    if (report?.outcome !== 'prepared') {
      throw new Error(CLAUDE_PROFILE_SETUP_FAILED_MESSAGE)
    }
    return profile.home
  }

  /** Wait for setup before deleting so it cannot recreate the folder. */
  async removeAccount(accountId: string): Promise<void> {
    await this.setups.get(accountId)?.catch(() => {})
    await removeClaudeAccountFolder(this.args.dataRoot, accountId)
  }

  /** A legacy snapshot records copy-based account switching. */
  copiedLoginIntoSystemDefault(): boolean {
    return existsSync(join(this.args.dataRoot, 'claude-runtime-auth', 'system-default-auth.json'))
  }

  userConfigDir(): string | undefined {
    return readUserClaudeConfigDir(this.env)
  }

  private describe(accountId: string): ClaudeProfileDescriptor {
    return describeClaudeProfile(this.args.dataRoot, accountId, {
      executionHostId: 'local',
      runtime: 'host'
    })
  }

  /** Reuse in-flight setup per account. */
  private setUp(profile: ClaudeProfileDescriptor): Promise<ClaudeProfileSetupReport> {
    const running = this.setups.get(profile.accountId)
    if (running) {
      return running
    }
    const run = this.runSetup(profile).finally(() => this.setups.delete(profile.accountId))
    this.setups.set(profile.accountId, run)
    return run
  }

  private async runSetup(profile: ClaudeProfileDescriptor): Promise<ClaudeProfileSetupReport> {
    await this.envReady
    return runClaudeProfileSetup({
      dataRoot: this.args.dataRoot,
      profile,
      userHome: this.userHome,
      userConfigDir: this.userConfigDir(),
      settings: this.args.getSettings(),
      runSetup: this.args.runSetup
    })
  }

  /** A broken account selection must not prevent opening a terminal. */
  terminalEnv(target?: ClaudeAccountSelectionTarget, scope?: ClaudeLaunchScope): ClaudeEnvPatch {
    // Pass the pointer without waiting on the guest.
    if (target?.runtime === 'wsl') {
      return { [CLAUDE_PROFILE_POINTER_ENV]: `~/${wslClaudeProfilePointer(this.args.dataRoot)}` }
    }
    const base = claudeTerminalBaseEnv(this.pointerPath, this.env)
    // Defer routing until the shell env resolves; the shell function will read the updated pointer.
    if (!this.envResolved) {
      return base
    }
    try {
      const route = this.route(scope)
      this.writePointer(route)
      // Refresh without delaying terminal creation.
      const profile = this.routedProfile(route)
      if (profile) {
        this.setUpInBackground(profile)
      }
      return { ...base, ...claudeRouteLaunchEnv(route, this.homeOf(route)) }
    } catch {
      return base
    }
  }

  preparation(scope?: ClaudeLaunchScope): ClaudeRuntimeAuthPreparation {
    return this.preparationOf(this.route(scope))
  }

  private preparationOf(route: ClaudeRoute): ClaudeRuntimeAuthPreparation {
    const profile = this.routedProfile(route)
    const home = this.homeOf(route)
    return claudeRoutePreparation(
      route,
      profile && home ? { accountId: profile.accountId, home } : null,
      () => this.systemDefaultHome()
    )
  }

  /** Compare pre-routing terminals against the selection; null means no account is selected. */
  systemDefaultRunsAnotherAccount(): boolean | null {
    return claudeSystemDefaultRunsAnotherAccount(this)
  }

  routesToAccount(scope?: ClaudeLaunchScope): boolean {
    return this.routedProfile(this.route(scope)) !== null
  }

  /** Read usage from the same login the account would launch with. */
  accountUsagePreparation(accountId: string): ClaudeRuntimeAuthPreparation {
    return claudeAccountUsagePreparation(this, accountId)
  }

  async accountSelectionHomes(launchEnv: NodeJS.ProcessEnv = process.env): Promise<string[]> {
    return claudeProfileSelectionHomes(this, this.args.getSettings(), this.envReady, launchEnv)
  }

  /** Every account folder on this host, selected or not. */
  accountHomes(): string[] {
    return listClaudeProfileHomes(this.args.dataRoot)
  }
}
