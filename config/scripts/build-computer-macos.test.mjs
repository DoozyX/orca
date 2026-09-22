import {
  chmodSync,
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { runProcess } from '../../src/shared/child-process/run-process'

const roots = []
afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true })
  }
})

describe.skipIf(process.platform !== 'darwin')('computer helper compiler output', () => {
  it.each([false, true])(
    'packages the current Swift output (local install: %s)',
    async (localInstall) => {
      const root = mkdtempSync(join(tmpdir(), 'orca-swift-output-'))
      roots.push(root)
      const scripts = join(root, 'config', 'scripts')
      const bin = join(root, 'bin')
      mkdirSync(scripts, { recursive: true })
      mkdirSync(bin)
      mkdirSync(join(root, 'resources', 'build'), { recursive: true })
      writeFileSync(join(root, 'resources', 'build', 'icon.icns'), 'icon')
      for (const file of [
        'build-computer-macos.mjs',
        'mac-helper-build-targets.mjs',
        'build-and-install-mac.mjs'
      ]) {
        copyFileSync(new URL(file, import.meta.url), join(scripts, file))
      }
      for (const program of ['swift', 'lipo', 'codesign', 'security']) {
        const executable = join(bin, program)
        writeFileSync(
          executable,
          `#!/usr/bin/env node
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import { join, basename } from 'node:path'
const args=process.argv.slice(2), command=basename(process.argv[1])
const value=flag=>args[args.indexOf(flag)+1]
if(command==='swift') {
  const scratch=args.includes('--scratch-path')?value('--scratch-path'):join(value('--package-path'),'.build')
  const output=join(scratch,'out','Products','Release')
  if(args.includes('--show-bin-path')) console.log(output)
  else {mkdirSync(output,{recursive:true});writeFileSync(join(output,'orca-computer-use-macos'),value('--triple'))}
}
if(command==='lipo') writeFileSync(value('-output'),args.slice(1,args.indexOf('-output')).map(file=>readFileSync(file,'utf8')).join('\\n'))
`
        )
        chmodSync(executable, 0o755)
      }
      const pnpm = join(bin, 'pnpm')
      writeFileSync(
        pnpm,
        `#!/usr/bin/env node
import ${JSON.stringify(pathToFileURL(join(scripts, 'build-computer-macos.mjs')).href)}
`
      )
      chmodSync(pnpm, 0o755)
      const result = await runProcess({
        program: process.execPath,
        args: [
          join(scripts, localInstall ? 'build-and-install-mac.mjs' : 'build-computer-macos.mjs')
        ],
        cwd: root,
        env: {
          ...process.env,
          PATH: `${bin}:${process.env.PATH}`,
          ORCA_MAC_LOCAL_INSTALL: '',
          ORCA_MAC_RELEASE: '',
          ORCA_MAC_HOURLY: '',
          ORCA_MAC_DAILY: '',
          ORCA_MAC_ADHOC: '',
          ORCA_COMPUTER_MACOS_SIGN_IDENTITY: '-'
        },
        timeoutMs: 15000
      })
      expect(result.code, result.stderr).toBe(0)
      const artifact = readFileSync(
        join(
          root,
          'native',
          'computer-use-macos',
          '.build',
          'release',
          'Orca Computer Use.app',
          'Contents',
          'MacOS',
          'orca-computer-use-macos'
        ),
        'utf8'
      )
      const hostTriple = process.arch === 'arm64' ? 'arm64-apple-macosx' : 'x86_64-apple-macosx'
      expect(artifact).toBe(localInstall ? hostTriple : 'arm64-apple-macosx\nx86_64-apple-macosx')
    }
  )
})
