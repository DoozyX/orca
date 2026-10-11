import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import path from 'node:path'
import { z } from 'zod'
import { isDefinitiveAbsence } from '../../shared/definitive-filesystem-absence'
import { readActiveClaudeKeychainCredentialsStrict } from '../claude-accounts/keychain'
import type { ClaudeRuntimeAuthPreparation } from '../claude-accounts/runtime-auth/runtime-auth-types'
import { readUserClaudeConfigDir } from '../claude-accounts/claude-profile-paths'
import { getClaudeProfileRouter } from '../claude-accounts/claude-profile-installed-router'

export type ClaudeOAuthCredentialSource =
  | 'scoped-keychain'
  | 'legacy-keychain'
  | 'credentials-file'
  | 'none'
export type ClaudeOAuthCredentialReadResult = {
  token: string | null
  hasRefreshableCredentials: boolean
  source: ClaudeOAuthCredentialSource
  keychainUnavailable?: boolean
  unavailable?: boolean
  /** Carried for a bound home, which Orca never refreshes; the usage endpoint ignores it. */
  expiresAt?: number
}
type ClaudeOAuthCredentialReadOptions = {
  credentialsFileConfigDir?: string
  keychainConfigDir?: string
  /** System Default only: a managed profile never reads another login's item. */
  unsuffixedKeychainFallback?: boolean
}
const schema = z.object({
  claudeAiOauth: z
    .object({
      accessToken: z.string().optional(),
      refreshToken: z.string().optional(),
      expiresAt: z.number().optional()
    })
    .optional()
})
export function parseClaudeOAuthCredentialsJson(
  raw: string,
  source: ClaudeOAuthCredentialSource
): ClaudeOAuthCredentialReadResult {
  try {
    const oauth = schema.parse(JSON.parse(raw)).claudeAiOauth
    // Why: expiresAt is not authoritative for the usage endpoint; let the server decide.
    return {
      token: oauth?.accessToken || null,
      hasRefreshableCredentials: Boolean(oauth?.refreshToken),
      source,
      ...(oauth?.expiresAt === undefined ? {} : { expiresAt: oauth.expiresAt })
    }
  } catch {
    return { ...emptyClaudeOAuthCredentialReadResult(), unavailable: true }
  }
}
export function emptyClaudeOAuthCredentialReadResult(): ClaudeOAuthCredentialReadResult {
  return { token: null, hasRefreshableCredentials: false, source: 'none' }
}
export async function readClaudeCredentialsFromStrictKeychain(
  configDir: string | undefined,
  source: ClaudeOAuthCredentialSource
): Promise<ClaudeOAuthCredentialReadResult> {
  try {
    const contents = await readActiveClaudeKeychainCredentialsStrict(configDir)
    return contents
      ? parseClaudeOAuthCredentialsJson(contents, source)
      : emptyClaudeOAuthCredentialReadResult()
  } catch {
    return {
      ...emptyClaudeOAuthCredentialReadResult(),
      unavailable: true,
      keychainUnavailable: true
    }
  }
}
async function readClaudeKeychainCredentials(
  options?: ClaudeOAuthCredentialReadOptions
): Promise<ClaudeOAuthCredentialReadResult> {
  if (!options?.keychainConfigDir) {
    return readClaudeCredentialsFromStrictKeychain(undefined, 'legacy-keychain')
  }
  const scoped = await readClaudeCredentialsFromStrictKeychain(
    options.keychainConfigDir,
    'scoped-keychain'
  )
  if (scoped.token || !options.unsuffixedKeychainFallback) {
    return scoped
  }
  const legacy = await readClaudeCredentialsFromStrictKeychain(undefined, 'legacy-keychain')
  // Why: as before profiles, a token wins over an unreadable item.
  const candidates = [scoped, legacy]
  return (
    candidates.find((candidate) => candidate.token) ??
    candidates.find((candidate) => candidate.unavailable) ??
    legacy
  )
}
export async function readClaudeOAuthCredentials(
  options?: ClaudeOAuthCredentialReadOptions
): Promise<ClaudeOAuthCredentialReadResult> {
  const keychain =
    process.platform === 'darwin'
      ? await readClaudeKeychainCredentials(options)
      : emptyClaudeOAuthCredentialReadResult()
  if (keychain.token) {
    return keychain
  }
  try {
    return parseClaudeOAuthCredentialsJson(
      await readFile(
        path.join(
          options?.credentialsFileConfigDir ?? path.join(homedir(), '.claude'),
          '.credentials.json'
        ),
        'utf8'
      ),
      'credentials-file'
    )
  } catch (error) {
    return isDefinitiveAbsence(error) ? keychain : { ...keychain, unavailable: true }
  }
}
export function resolveClaudeOAuthCredentialReadOptions(
  authPreparation?: ClaudeRuntimeAuthPreparation
): ClaudeOAuthCredentialReadOptions | undefined {
  if (!authPreparation) {
    return undefined
  }
  const accountDir = authPreparation.envPatch.CLAUDE_CONFIG_DIR
  return {
    credentialsFileConfigDir: authPreparation.configDir,
    // Why the user's own folder, login shell first: Claude names System default's item from it.
    keychainConfigDir:
      accountDir ??
      getClaudeProfileRouter()?.userConfigDir() ??
      readUserClaudeConfigDir(process.env),
    // An unsuffixed lookup is exclusively System default, never a fallback from an account.
    unsuffixedKeychainFallback: !accountDir
  }
}

function unavailableKeychainResult(): ClaudeOAuthCredentialReadResult {
  return { ...emptyClaudeOAuthCredentialReadResult(), keychainUnavailable: true }
}

/** Exactly this config dir's `.credentials.json`; a bound Claude home is read, never written. */
export async function readClaudeOAuthCredentialsFile(
  configDir?: string
): Promise<ClaudeOAuthCredentialReadResult> {
  try {
    return parseClaudeOAuthCredentialsJson(
      await readFile(
        path.join(configDir ?? path.join(homedir(), '.claude'), '.credentials.json'),
        'utf8'
      ),
      'credentials-file'
    )
  } catch {
    return emptyClaudeOAuthCredentialReadResult()
  }
}

/**
 * Credentials that belong to exactly this config dir: its scoped Keychain item on darwin, then its
 * own `.credentials.json`. No legacy-Keychain fallback: that item answers for System default, so a
 * signed-out bound directory would read as signed in. A locked Keychain is reported as such.
 */
export async function readClaudeConfigDirScopedOAuthCredentials(
  configDir: string,
  options?: {
    platform?: NodeJS.Platform
    readScopedKeychain?: (configDir: string) => Promise<string | null>
  }
): Promise<ClaudeOAuthCredentialReadResult> {
  let keychainUnavailable = false
  if ((options?.platform ?? process.platform) === 'darwin') {
    const scoped = options?.readScopedKeychain
      ? await readInjectedScopedKeychain(configDir, options.readScopedKeychain)
      : await readClaudeCredentialsFromStrictKeychain(configDir, 'scoped-keychain')
    if (scoped.token || scoped.hasRefreshableCredentials) {
      return scoped
    }
    keychainUnavailable = scoped.keychainUnavailable === true
  }
  const file = await readClaudeOAuthCredentialsFile(configDir)
  return !file.token && !file.hasRefreshableCredentials && keychainUnavailable
    ? unavailableKeychainResult()
    : file
}

async function readInjectedScopedKeychain(
  configDir: string,
  read: (configDir: string) => Promise<string | null>
): Promise<ClaudeOAuthCredentialReadResult> {
  try {
    const credentials = await read(configDir)
    return credentials
      ? parseClaudeOAuthCredentialsJson(credentials, 'scoped-keychain')
      : emptyClaudeOAuthCredentialReadResult()
  } catch {
    return unavailableKeychainResult()
  }
}
