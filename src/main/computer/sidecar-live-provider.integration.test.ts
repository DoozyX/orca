import { once } from 'node:events'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { build } from 'esbuild'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { spawnProcess } from '@orca/process-host'
import { describeLiveHelper, isMacOSNativeHelperIdentity } from './macos-native-helper-identity'

type SidecarReply = { id: number; ok: boolean; result?: unknown }

// #14: the status RPC runs in main and the provider in the sidecar, so the peek crosses IPC.
describe.skipIf(process.platform === 'win32')('live provider peek across the sidecar IPC', () => {
  let directory = ''
  let entry = ''
  let helperA = ''

  beforeAll(async () => {
    directory = await mkdtemp(join(tmpdir(), 'orca-sidecar-live-provider-'))
    entry = join(directory, 'sidecar.cjs')
    helperA = join(directory, 'helper-a')
    await writeFile(helperA, 'a')
    await build({
      entryPoints: [join(__dirname, 'sidecar-entry.ts')],
      outfile: entry,
      bundle: true,
      platform: 'node',
      format: 'cjs',
      logLevel: 'silent',
      plugins: [
        {
          name: 'counting-provider-lifecycle',
          setup(builder) {
            builder.onLoad({ filter: /computer-provider-lifecycle\.ts$/ }, () => ({
              resolveDir: __dirname,
              loader: 'ts',
              contents: `
              import { readMacOSNativeHelperIdentity } from './macos-native-helper-identity';
              let created = 0;
              let provider = null;
              export function currentComputerProvider() {
                if (!provider) {
                  created++;
                  provider = { capabilities: async () => ({ created }) };
                }
                return provider;
              }
              export function peekLiveHelperIdentity() {
                return provider ? readMacOSNativeHelperIdentity(process.env.ORCA_TEST_HELPER_A) : null;
              }
              export function shutdownComputerProviders() {
                provider = null;
              }
            `
            }))
          }
        }
      ]
    })
  })

  afterAll(async () => {
    if (directory) {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('answers null until a provider exists, then the helper identity it runs', async () => {
    const sidecar = spawnProcess({
      program: process.execPath,
      args: [entry],
      env: { ...process.env, ORCA_BACKGROUND_LAUNCH: '1', ORCA_TEST_HELPER_A: helperA },
      stdio: ['ignore', 'pipe', 'pipe', 'ipc']
    })
    const sidecarExit = once(sidecar, 'exit')
    const request = async (id: number, method: string): Promise<SidecarReply> => {
      const reply = once(sidecar, 'message')
      sidecar.send({ id, method })
      const [message] = await reply
      return message
    }
    try {
      expect(await request(1, 'liveProvider')).toEqual({ id: 1, ok: true, result: null })
      // Creation count 1 here proves the peek above created no provider.
      expect(await request(2, 'capabilities')).toEqual({ id: 2, ok: true, result: { created: 1 } })

      const reply = await request(3, 'liveProvider')
      const live = reply.result
      if (!isMacOSNativeHelperIdentity(live)) {
        throw new TypeError(`expected a helper identity, got ${JSON.stringify(live)}`)
      }
      expect(live.executablePath).toBe(realpathSync(helperA))
      expect(describeLiveHelper(helperA, live)).toEqual({
        executablePath: realpathSync(helperA),
        matchesCurrentHelper: true
      })

      const helperB = join(directory, 'helper-b')
      await writeFile(helperB, 'b')
      expect(describeLiveHelper(helperB, live).matchesCurrentHelper).toBe(false)

      // A reinstall replaces the file at the same path with a new inode.
      await rm(helperA)
      await writeFile(helperA, 'a2')
      expect(describeLiveHelper(helperA, live).matchesCurrentHelper).toBe(false)
    } finally {
      sidecar.kill('SIGTERM')
      await sidecarExit
    }
  })
})
