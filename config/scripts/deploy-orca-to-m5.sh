#!/bin/bash
# Starts the M5 laptop's own "Orca sync from fork + install" automation once fork main moves past its installed build; run from the M1 (idempotent).
# The laptop builds itself because its checkout keeps local commits on top of fork main.
set -euo pipefail

REPO=DoozyX/orca
# MagicDNS does not resolve from the M1, so the m5 alias's hostname can't be used.
HOST=doozyx@100.76.212.95
AUTOMATION=074d9ff3-3c35-4261-944d-f0fd1ac88d10
CHECKOUT=/Users/doozyx/DoozyX/tools/orca
LOG=$HOME/Library/Logs/orca-deploy-m5.log
STATE=$HOME/Library/Logs/orca-deploy-m5.triggered
SSH=(ssh -o BatchMode=yes -o ConnectTimeout=15 "$HOST")
ORCA=/Applications/Orca.app/Contents/Resources/bin/orca

log() { echo "$(date '+%F %T') $*" | tee -a "$LOG"; }
fail() { log "FAILED: $*"; exit 1; }

want=$(git ls-remote "git@github.com:$REPO.git" refs/heads/main | cut -f1)
[ -n "$want" ] || fail "cannot read fork main"

have=$("${SSH[@]}" "python3 -c 'import json; print(json.load(open(\"/Applications/Orca.app/Contents/Resources/orca-local-build.json\"))[\"commit\"])'") \
  || fail "laptop unreachable or has no local Orca build"
# A fetch first: the laptop's checkout may not have seen fork main yet.
if "${SSH[@]}" "git -C $CHECKOUT fetch -q fork main && git -C $CHECKOUT merge-base --is-ancestor $want $have"; then
  log "laptop build ${have:0:12} already contains fork main ${want:0:12}"
  exit 0
fi

# Retried after 3h: a run that met the laptop job's lock skips silently; a failed one reports on issue #31.
if [ "$(cat "$STATE" 2>/dev/null)" = "$want" ] && [ -n "$(find "$STATE" -mmin -180)" ]; then
  log "laptop sync for ${want:0:12} started under 3h ago"
  exit 0
fi

"${SSH[@]}" "$ORCA automations run $AUTOMATION --json" >>"$LOG" 2>&1 || fail "could not start the laptop sync automation"
echo "$want" >"$STATE"
log "started laptop sync for fork main ${want:0:12} (installed ${have:0:12})"
