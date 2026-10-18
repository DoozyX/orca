#!/bin/bash
# Builds and installs the fork-main candidate on the M1 without an agent; hold the ssh session open for the whole run (keychain).
set -euo pipefail

WT=/Users/skletnikov/DoozyX/tools/orca/.worktrees/orca/m1-daily-upstream-sync
PNPM12=/Users/skletnikov/Library/pnpm/store/v11/links/@/pnpm/12.8.1/0c329c8c347499aa1aead5ea0ee0544c1df985bd99ff0a3083ff1d24a679baf1/bin
RUN=$WT/.orca/$(date +%F)-m1-build
mkdir -p "$RUN/tmp"

cd "$WT"
[ "$(git rev-parse --show-toplevel)" = "$WT" ] || { echo "wrong checkout" >&2; exit 1; }
[ "$(git symbolic-ref --short HEAD)" = DoozyX/m1-daily-upstream-sync ] || { echo "wrong branch" >&2; exit 1; }
git fetch -q fork main
git merge-base --is-ancestor fork/main HEAD || git merge --ff-only fork/main
[ -z "$(git status --porcelain)" ] || { echo "dirty checkout" >&2; git status --short >&2; exit 1; }

export PATH=$PNPM12:/opt/homebrew/opt/node@24/bin:$PATH
# No TMPDIR override: tsx's IPC socket path under a long TMPDIR exceeds the macOS limit.
export ORCA_BACKGROUND_LAUNCH=1 ORCA_MOBILE_WEB_APP_DEPS_REQUIRED=1
want=$(node -p "require('./package.json').packageManager.split('@')[1].split('+')[0]")
[ "$(pnpm --version)" = "$want" ] || { echo "pnpm $(pnpm --version) != $want" >&2; exit 1; }

pnpm install:release
pnpm --dir mobile install --frozen-lockfile
pnpm tc
git checkout -- pnpm-lock.yaml 2>/dev/null || true

(. ~/DoozyX/keys/secrets/credentials.env && security unlock-keychain -p "$CI_KEYCHAIN_PASSWORD" ~/Library/Keychains/doozyx-ci.keychain-db)
CSC_NAME="Apple Distribution: DoozyX FZ-LLC (N59WC8BU7V)" pnpm build:mac:install

app=/Applications/Orca.app
codesign --verify --deep --strict "$app"
codesign -dv "$app" 2>&1 | grep -q 'TeamIdentifier=N59WC8BU7V'
lipo -archs "$app/Contents/MacOS/Orca" | grep -qx arm64
python3 - "$(git rev-parse HEAD)" <<'PY'
import json, sys
d = json.load(open('/Applications/Orca.app/Contents/Resources/orca-local-build.json'))
assert sys.argv[1].startswith(d['commit']), (d['commit'], sys.argv[1])
print('installed', d['version'], d['commit'])
PY

# Restart the headless runtime onto the new build once no agent is working (up to 4h); detached so it outlives this shell.
nohup env self_pane="${ORCA_PANE_KEY:-}" bash -c '
  export PATH=/opt/homebrew/bin:/usr/local/bin:$PATH
  log=$HOME/Library/Logs/orca-m1-restart.log
  for _ in $(seq 1 480); do
    # Only the calling agent blocks: other agents keep their terminals in the daemon across a serve restart.
    busy=$(orca worktree ps --json 2>/dev/null | python3 -c "import json,sys; print(sum(1 for w in json.load(sys.stdin)[\"result\"][\"worktrees\"] for a in w.get(\"agents\",[]) if a[\"state\"]==\"working\" and a[\"paneKey\"]==sys.argv[1]))" "$self_pane" 2>/dev/null) || busy=error
    if [ "$busy" = 0 ]; then
      # kickstart -k alone leaves the old serve alive (the LaunchAgent abandons its process group); stop it so launchd starts the new build.
      old=$(orca status 2>/dev/null | awk "/^pid:/{print \$2}")
      [ -n "$old" ] && kill -TERM "$old"
      for _ in $(seq 1 60); do kill -0 "$old" 2>/dev/null || break; sleep 1; done
      launchctl kickstart gui/$(id -u)/dev.onorca.serve
      sleep 20
      new=$(orca status 2>/dev/null | awk "/^pid:/{print \$2}")
      if [ -n "$new" ] && [ "$new" != "$old" ]; then echo "$(date +%F\ %T) restarted serve $old -> $new" >>"$log"; else echo "$(date +%F\ %T) RESTART FAILED: pid $old -> ${new:-none}" >>"$log"; fi
      exit 0
    fi
    sleep 30
  done
  echo "$(date +%F\ %T) restart skipped: calling agent still working after 4h" >>"$log"
' >/dev/null 2>&1 &
disown
echo "restart waiter started"
