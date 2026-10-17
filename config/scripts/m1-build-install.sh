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
git merge --ff-only fork/main
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
