import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const mobileDir = join(fileURLToPath(new URL('../../../..', import.meta.url)), 'mobile')

export const PAGE_ASYNC_STORAGE_MODULE = join(
  mobileDir,
  'src',
  'mobile-web-shell',
  'bridge',
  'page-storage',
  'page-async-storage.ts'
)

// Shared modules otherwise resolve the root copy while the page uses mobile's React.
export const MOBILE_REACT_PACKAGE = join(mobileDir, 'node_modules', 'react')

// nodePaths cannot override shared modules’ root Zod resolution. Alias mobile’s package to match tsconfig and salvage/container instances; esbuild picks its ESM module entry.
export const MOBILE_ZOD_PACKAGE = join(mobileDir, 'node_modules', 'zod')

export const MOBILE_PAGE_PACKAGE_ALIASES = {
  '@react-native-async-storage/async-storage': PAGE_ASYNC_STORAGE_MODULE,
  react: MOBILE_REACT_PACKAGE,
  zod: MOBILE_ZOD_PACKAGE
}
