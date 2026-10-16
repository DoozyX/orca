import { GLOBAL_FLAGS, type CommandSpec } from '../args'

export const ORCHESTRATION_LEASE_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['orchestration', 'lease', 'acquire'],
    summary: 'Take, renew or queue for a shared resource lease',
    usage:
      'orca orchestration lease acquire --resource <key> [--ttl-ms <n>] [--run <run_id>] [--from <handle>] [--retry-request <id>] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'resource', 'ttl-ms', 'run', 'from', 'retry-request'],
    identityFlagRoles: { from: 'caller' },
    notes: [
      'queued means wait: another Run holds the resource, and its release or expiry hands it on in FIFO order.',
      '--ttl-ms defaults to 1800000 (30 minutes); acquiring again as the holder renews it.'
    ]
  },
  {
    path: ['orchestration', 'lease', 'release'],
    summary: 'Release a shared resource lease or leave its queue',
    usage:
      'orca orchestration lease release --resource <key> [--run <run_id>] [--from <handle>] [--retry-request <id>] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'resource', 'run', 'from', 'retry-request'],
    identityFlagRoles: { from: 'caller' },
    notes: ['Releasing hands the resource to the next waiting Run.']
  },
  {
    path: ['orchestration', 'lease', 'show'],
    summary: 'Show who holds a shared resource and who waits for it',
    usage: 'orca orchestration lease show --resource <key> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'resource'],
    notes: [
      'Read-only: an expired holder is reported, and only the next acquire or release hands it on.'
    ]
  }
]
