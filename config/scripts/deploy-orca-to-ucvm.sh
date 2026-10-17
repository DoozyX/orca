#!/bin/bash
# Installs the newest fork-main Linux .deb on the headless uc-vm host; run from the M1 (idempotent).
set -euo pipefail

REPO=DoozyX/orca
HOST=uniqcast@100.122.197.52
KEY=$HOME/.ssh/ucvm_deploy_ed25519
LOG=$HOME/Library/Logs/orca-deploy-ucvm.log
SSH=(ssh -i "$KEY" -o IdentitiesOnly=yes -o BatchMode=yes -o ConnectTimeout=15 "$HOST")

log() { echo "$(date '+%F %T') $*" | tee -a "$LOG"; }
fail() { log "FAILED: $*"; exit 1; }

want_sha=$(git ls-remote "git@github.com:$REPO.git" refs/heads/main | cut -c1-12)
[ -n "$want_sha" ] || fail "cannot read fork main"
tag=linux-deb-$want_sha

have=$("${SSH[@]}" "dpkg-query -W -f='\${Version}' orca-ide" 2>/dev/null) || fail "uc-vm unreachable or orca-ide not installed"
case "$have" in *"-fork.$want_sha") log "uc-vm already on $want_sha"; exit 0 ;; esac

gh release view "$tag" -R "$REPO" >/dev/null 2>&1 || fail "no release $tag yet (the Linux build for fork main $want_sha has not published)"

busy=$("${SSH[@]}" "orca-ide worktree ps --json" | python3 -c '
import json, sys
print(sum(1 for w in json.load(sys.stdin)["result"]["worktrees"] for a in w.get("agents", []) if a["state"] == "working"))') || fail "cannot read agent state on uc-vm"
[ "$busy" = 0 ] || { log "uc-vm has $busy working agent(s); install deferred"; exit 3; }

dir=$(mktemp -d "${TMPDIR:-/tmp}/ucvm-deb.XXXXXX")
trap 'rm -rf "$dir"' EXIT
gh release download "$tag" -R "$REPO" -p 'orca-ide_*.deb' -D "$dir" || fail "download of $tag failed"
deb=$(ls "$dir"/orca-ide_*.deb)
"${SSH[@]}" "rm -f ~/orca-update/orca-ide_*.deb"
scp -i "$KEY" -o IdentitiesOnly=yes -o BatchMode=yes "$deb" "$HOST:orca-update/" || fail "copy to uc-vm failed"
"${SSH[@]}" "sudo -n /usr/local/sbin/orca-install-update" >>"$LOG" 2>&1 || fail "install on uc-vm failed (see $LOG)"
now=$("${SSH[@]}" "dpkg-query -W -f='\${Version}' orca-ide")
case "$now" in *"-fork.$want_sha") log "uc-vm now on $now" ;; *) fail "uc-vm reports $now, expected -fork.$want_sha" ;; esac
