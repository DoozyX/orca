import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'

if (process.platform !== 'darwin') {
  throw new Error('pnpm build:mac:install requires macOS.')
}

execFileSync('pnpm', ['run', 'build:mac', '--install'], {
  cwd: resolve(import.meta.dirname, '../..'),
  env: { ...process.env, ORCA_BACKGROUND_LAUNCH: '1', ORCA_MAC_LOCAL_INSTALL: '1' },
  stdio: 'inherit'
})
