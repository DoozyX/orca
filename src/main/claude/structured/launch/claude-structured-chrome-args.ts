import { claudeInChromeDefaultArgs } from '../../configuration/claude-in-chrome-default'
import { claudeConfigDirEnvPatch } from './claude-config-dir-pin'

/** Reads the config of the account directory the spawn pins, as session acquisition does. */
export function claudeStructuredChromeArgs(
  env: NodeJS.ProcessEnv,
  launchHome: string,
  prefixArgs: readonly string[],
  launchArgs: readonly string[]
): ReturnType<typeof claudeInChromeDefaultArgs> {
  return claudeInChromeDefaultArgs({ ...env, ...claudeConfigDirEnvPatch(launchHome, { env }) }, [
    ...prefixArgs,
    ...launchArgs
  ])
}
