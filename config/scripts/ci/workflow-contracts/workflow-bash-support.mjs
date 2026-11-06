import { spawnSync } from 'node:child_process'

// Workflow `run:` scripts target the bash 4+ on CI runners; macOS ships 3.2 without mapfile.
const probe = spawnSync('bash', ['-c', 'echo "${BASH_VERSINFO[0]}"'], { encoding: 'utf8' })

export const hasWorkflowBash = probe.status === 0 && Number(probe.stdout.trim()) >= 4

export const hasRipgrep = spawnSync('rg', ['--version']).status === 0
