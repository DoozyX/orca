// Clear the launching terminal’s inherited Orca identity and published gate state so test branches depend on fixture env, not which agent launched runner.
for (const name of [
  'ORCA_AGENT_SESSION_ID',
  'ORCA_STRUCTURED_SESSION',
  'ORCA_WORKTREE_ID',
  'ORCA_WORKSPACE_ID',
  'ORCA_RUNTIME_SOURCE_ID',
  'ORCA_RUNTIME_SOURCE_INCARNATION',
  'ORCA_RUNTIME_SOURCE_PROFILE_PATH',
  'ORCA_WSL_HOSTS_GATE_STATE'
]) {
  delete process.env[name]
}
