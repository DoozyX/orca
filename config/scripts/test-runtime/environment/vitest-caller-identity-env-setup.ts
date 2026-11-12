// Clear the launching terminal's inherited Orca identity, gate state and TERM_PROGRAM (macOS /etc/{zsh,bash}rc_$TERM_PROGRAM) so tests depend on fixture env only.
for (const name of [
  'ORCA_AGENT_SESSION_ID',
  'ORCA_STRUCTURED_SESSION',
  'ORCA_WORKTREE_ID',
  'ORCA_WORKSPACE_ID',
  'ORCA_RUNTIME_SOURCE_ID',
  'ORCA_RUNTIME_SOURCE_INCARNATION',
  'ORCA_RUNTIME_SOURCE_PROFILE_PATH',
  'ORCA_WSL_HOSTS_GATE_STATE',
  'TERM_PROGRAM',
  'TERM_PROGRAM_VERSION',
  'TERM_SESSION_ID'
]) {
  delete process.env[name]
}
