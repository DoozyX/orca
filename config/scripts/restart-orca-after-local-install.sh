#!/bin/bash
# Relaunch Orca when /Applications holds a newer build than the running app.
# Run detached from an Orca automation: it waits only for the automation's own agent turn to end.
# Other agents keep running: their terminals live in the terminal daemon, which a quit only disconnects.
set -u

SELF_PANE=${ORCA_PANE_KEY:?must run from an Orca terminal}
APP=/Applications/Orca.app
LOG="$HOME/Library/Logs/orca-restart-after-install.log"
MAX_WAIT=14400
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"

log() { echo "$(date '+%F %T') $*" >>"$LOG"; }

running_version() {
  orca status --json 2>/dev/null | python3 -c '
import json, sys
r = json.load(sys.stdin)["result"]
print(r["runtime"]["appVersion"] if r["app"]["running"] and r["runtime"].get("reachable") else "")
' 2>/dev/null
}

app_pid() {
  pgrep -f "^$APP/Contents/MacOS/Orca\$" | head -1
}

# Prints 1 while the calling agent is still working.
busy_agents() {
  orca worktree ps --json 2>/dev/null | python3 -c '
import json, sys
agents = [a for w in json.load(sys.stdin)["result"]["worktrees"] for a in w.get("agents", [])]
print(sum(1 for a in agents if a["state"] == "working" and a["paneKey"] == sys.argv[1]))
' "$SELF_PANE" 2>/dev/null || echo error
}

installed=$(defaults read "$APP/Contents/Info.plist" CFBundleShortVersionString)
running=$(running_version)
if [ -z "$running" ]; then
  log "Orca is not running; nothing to restart (installed $installed)"
  exit 0
fi
if [ "$installed" = "$running" ]; then
  log "already running $running"
  exit 0
fi
log "running $running, installed $installed; waiting for the calling agent"

sleep 15
start=$SECONDS
while :; do
  busy=$(busy_agents)
  [ "$busy" = 0 ] && break
  if [ $((SECONDS - start)) -ge "$MAX_WAIT" ]; then
    log "gave up after ${MAX_WAIT}s: calling agent still working; restart skipped"
    exit 1
  fi
  sleep 60
done

pid=$(app_pid)
if [ -z "$pid" ]; then
  log "Orca process not found at quit time; restart skipped"
  exit 1
fi
# SIGTERM runs Electron's normal quit path: session is saved and the terminal daemon is only disconnected.
log "quitting Orca pid $pid"
kill -TERM "$pid"
for _ in $(seq 1 120); do
  kill -0 "$pid" 2>/dev/null || break
  sleep 1
done
if kill -0 "$pid" 2>/dev/null; then
  log "Orca pid $pid did not exit within 120s; left running, not relaunched"
  exit 1
fi

open -g "$APP"
for _ in $(seq 1 120); do
  now=$(running_version)
  if [ "$now" = "$installed" ]; then
    log "restarted: now running $now"
    exit 0
  fi
  sleep 2
done
log "relaunched but runtime did not report $installed within 240s (last: ${now:-unreachable})"
exit 1
