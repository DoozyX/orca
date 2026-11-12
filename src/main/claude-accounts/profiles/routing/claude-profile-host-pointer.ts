import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs'
import { dirname } from 'node:path'
import { writeFileAtomically } from '../../../filesystem/atomic-file-publication'

/** Null removes the pointer; an unchanged home is not rewritten, since launches call this often. */
export function syncClaudeProfileHostPointer(pointerPath: string, home: string | null): void {
  if (home === null) {
    rmSync(pointerPath, { force: true })
    return
  }
  if (!existsSync(pointerPath) || readFileSync(pointerPath, 'utf8') !== home) {
    mkdirSync(dirname(pointerPath), { recursive: true, mode: 0o700 })
    writeFileAtomically(pointerPath, home, { mode: 0o600 })
  }
}
