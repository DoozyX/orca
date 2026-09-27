import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { resolve } from 'node:path'
import { parse } from 'yaml'
import { z } from 'zod'
import { runProcess } from '../../shared/child-process/run-process'
import { resolveCliCommand, withCliRuntimeOnPath } from '../../shared/node-cli-command-resolution'
import { resolveOmpConfigDirName, resolvePiSourceAgentDir } from '../../relay/plugin-overlay-env'
import { mapOmpUsage, type OmpRateLimits } from './omp-usage-mapping'

const configSchema = z.object({ modelRoles: z.object({ default: z.string().min(1) }) })
const USAGE_TIMEOUT_MS = 12_000

function failure(status: OmpRateLimits['status'], error: string): OmpRateLimits {
  return {
    provider: 'omp',
    session: null,
    daily: null,
    weekly: null,
    buckets: [],
    status,
    error,
    updatedAt: Date.now(),
    usageMetadata: {
      source: 'cli',
      failureKind: status === 'unavailable' ? 'cli-unavailable' : 'unknown'
    }
  }
}

function stringEnvironment(env: NodeJS.ProcessEnv): Record<string, string> {
  return Object.fromEntries(
    Object.entries(env).filter((entry): entry is [string, string] => typeof entry[1] === 'string')
  )
}

/** Read omp's active model and its public usage command on this execution host. */
export async function fetchOmpRateLimits(
  options: {
    env?: NodeJS.ProcessEnv
    signal?: AbortSignal
    command?: string
  } = {}
): Promise<OmpRateLimits> {
  const env = stringEnvironment({ ...process.env, ...options.env })
  const shell = env.SHELL
  const sourceDir = env.OMP_CODING_AGENT_DIR ?? resolvePiSourceAgentDir(env, shell, 'omp')
  const configDir = sourceDir
    ? resolve(sourceDir)
    : resolve(homedir(), (await resolveOmpConfigDirName(env, shell)) ?? '.omp', 'agent')
  let defaultModel: string
  try {
    const config = configSchema.safeParse(
      parse(await readFile(resolve(configDir, 'config.yml'), 'utf8'))
    )
    if (!config.success) {
      return failure('unavailable', 'omp config.yml has no modelRoles.default')
    }
    defaultModel = config.data.modelRoles.default
  } catch {
    return failure('unavailable', 'omp config.yml could not be read')
  }

  const command = options.command ?? resolveCliCommand('omp', { pathEnv: env.PATH ?? env.Path })
  try {
    const output = await runProcess({
      program: command,
      args: ['usage', '--json'],
      env: withCliRuntimeOnPath(command, env),
      timeoutMs: USAGE_TIMEOUT_MS,
      maxOutputBytes: 512_000,
      signal: options.signal
    })
    if (output.timedOut) {
      return failure('error', 'omp usage timed out')
    }
    if (output.outputTruncated) {
      return failure('error', 'omp usage response was too large')
    }
    if (output.code !== 0) {
      return failure('error', `omp usage failed (exit ${output.code ?? 'signal'})`)
    }
    return mapOmpUsage(output.stdout, defaultModel)
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return failure('unavailable', 'omp is not installed')
    }
    return failure('error', 'omp usage could not be started')
  }
}
