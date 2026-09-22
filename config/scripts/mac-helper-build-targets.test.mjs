import { describe, expect, it } from 'vitest'
import { getMacHelperBuildTriples } from './mac-helper-build-targets.mjs'

const universal = ['arm64-apple-macosx', 'x86_64-apple-macosx']
describe('macOS helper build targets', () => {
  it.each([
    ['arm64', 'arm64-apple-macosx'],
    ['x64', 'x86_64-apple-macosx']
  ])('builds only %s for local installation', (arch, triple) => {
    expect(
      getMacHelperBuildTriples({ arch, env: { ORCA_MAC_LOCAL_INSTALL: '1' }, args: [] })
    ).toEqual([triple])
    expect(getMacHelperBuildTriples({ arch, env: {}, args: ['--single-arch'] })).toEqual([triple])
  })
  it('keeps ordinary Mac packaging universal', () => {
    expect(getMacHelperBuildTriples({ arch: 'arm64', env: {}, args: [] })).toEqual(universal)
  })
  it.each(['ORCA_MAC_RELEASE', 'ORCA_MAC_HOURLY', 'ORCA_MAC_DAILY', 'ORCA_MAC_ADHOC'])(
    'keeps %s universal even with local flags',
    (channel) => {
      expect(
        getMacHelperBuildTriples({
          arch: 'arm64',
          env: { ORCA_MAC_LOCAL_INSTALL: '1', [channel]: '1' },
          args: ['--single-arch']
        })
      ).toEqual(universal)
    }
  )
})
