export function getMacHelperBuildTriples({
  args = process.argv.slice(2),
  env = process.env,
  arch = process.arch
} = {}) {
  const isRelease = [
    'ORCA_MAC_RELEASE',
    'ORCA_MAC_HOURLY',
    'ORCA_MAC_DAILY',
    'ORCA_MAC_ADHOC'
  ].some((key) => env[key] === '1')
  const singleArch =
    !isRelease && (args.includes('--single-arch') || env.ORCA_MAC_LOCAL_INSTALL === '1')
  return singleArch
    ? [arch === 'arm64' ? 'arm64-apple-macosx' : 'x86_64-apple-macosx']
    : ['arm64-apple-macosx', 'x86_64-apple-macosx']
}
