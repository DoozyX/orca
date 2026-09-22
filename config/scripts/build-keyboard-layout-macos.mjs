#!/usr/bin/env node
import { execFileSync } from 'node:child_process'
import { chmodSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { getMacHelperBuildTriples } from './mac-helper-build-targets.mjs'

const repoRoot = path.resolve(import.meta.dirname, '../..')
const sourcePath = path.join(repoRoot, 'native', 'keyboard-layout-macos', 'main.swift')
const defaultOutputPath = path.join(
  repoRoot,
  'native',
  'keyboard-layout-macos',
  '.build',
  'release',
  'orca-keyboard-layout'
)

if (process.platform !== 'darwin') {
  process.exit(0)
}

const args = process.argv.slice(2)
const outputPath = readArg('--output') ?? defaultOutputPath
const workDir = mkdtempSync(path.join(tmpdir(), 'orca-keyboard-layout-'))

try {
  const triples = getMacHelperBuildTriples()
  const builtBinaries = triples.map((triple) => {
    const output = path.join(workDir, `orca-keyboard-layout-${triple}`)
    execFileSync(
      'swiftc',
      [
        '-O',
        sourcePath,
        '-target',
        triple.replace('-apple-macosx', '-apple-macosx11.0'),
        '-o',
        output
      ],
      { stdio: 'inherit' }
    )
    return output
  })
  mkdirSync(path.dirname(outputPath), { recursive: true })
  if (builtBinaries.length === 1) {
    execFileSync('cp', [builtBinaries[0], outputPath])
  } else {
    execFileSync('lipo', ['-create', ...builtBinaries, '-output', outputPath])
  }
  chmodSync(outputPath, 0o755)
} finally {
  rmSync(workDir, { recursive: true, force: true })
}

function readArg(name) {
  const index = args.indexOf(name)
  return index === -1 ? undefined : args[index + 1]
}
