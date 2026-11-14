import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const { buildNativeRebuildArgs } = require('./electron-builder-native-rebuild.cjs')

describe('electron-builder native rebuild hook', () => {
  it.each(['arm64', 'x64'])('probes the prepared runtime for a local %s Mac build', (arch) => {
    expect(
      buildNativeRebuildArgs(
        { platform: { nodeName: 'darwin' }, arch },
        {
          environment: { ORCA_LOCAL_BUILD_VERSION: '1.4.207-local.123.abc' },
          hostPlatform: 'darwin',
          hostArch: arch
        }
      )
    ).toEqual([
      'config/scripts/native-build/node-addons/rebuild-native-deps.mjs',
      '--platform=darwin',
      `--arch=${arch}`
    ])
  })

  it.each([
    { platform: 'darwin', arch: 'x64', environment: {} },
    { platform: 'linux', arch: 'arm64', environment: {} },
    { platform: 'darwin', arch: 'arm64', environment: { ORCA_MAC_RELEASE: '1' } }
  ])('still forces a rebuild for cross-target or release packaging: %j', (target) => {
    expect(
      buildNativeRebuildArgs(
        { platform: { nodeName: target.platform }, arch: target.arch },
        {
          environment: {
            ORCA_LOCAL_BUILD_VERSION: '1.4.207-local.123.abc',
            ...target.environment
          },
          hostPlatform: 'darwin',
          hostArch: 'arm64'
        }
      )
    ).toContain('--force')
  })
})
