#!/bin/bash
# Only exit 1 for a proven no-op; exit 0 dispatches an agent to report errors.
set -u
expected=/Users/skletnikov/DoozyX/tools/orca/.worktrees/orca/m1-daily-upstream-sync
report_error() { printf 'PRECHECK_ERROR: %s; dispatching agent to preserve and report blocker\n' "$*" >&2; exit 0; }
cd -- "$expected" || report_error "dedicated checkout unavailable"
root=$(git rev-parse --show-toplevel) || report_error "cannot resolve checkout"
[ "$root" = "$expected" ] || report_error "wrong checkout: $root"
branch=$(git symbolic-ref --short HEAD) || report_error "detached HEAD"
[ "$branch" = DoozyX/m1-daily-upstream-sync ] || report_error "wrong branch: $branch"
for state in MERGE_HEAD CHERRY_PICK_HEAD REVERT_HEAD rebase-merge rebase-apply; do
  state_path=$(git rev-parse --git-path "$state") || report_error "cannot resolve $state"
  [ ! -e "$state_path" ] || report_error "retained $state needs review"
done
[ ! -e .orca/m1-daily-sync.lock ] || report_error "retained run ownership lock"
origin_url=$(git remote get-url origin) || report_error "origin missing"
fork_url=$(git remote get-url fork) || report_error "fork missing"
[ "$origin_url" = git@github.com:stablyai/orca.git ] || report_error "origin identity differs"
[ "$fork_url" = git@github.com:DoozyX/orca.git ] || report_error "fork identity differs"
status=$(git status --porcelain) || report_error "status failed"
# Untracked mobile *.generated.ts bundles are build output; drop them so they do not read as dirt.
git ls-files --others --exclude-standard -- 'mobile/src/**/*.generated.ts' | while IFS= read -r f; do rm -f -- "$f"; done
status=$(git status --porcelain) || report_error "status failed"
# Known pnpm bootstrap drift: only added @pnpm/exe entries in pnpm-lock.yaml; revert that one file.
if [ "$status" = " M pnpm-lock.yaml" ] && git diff -U0 pnpm-lock.yaml | python3 -c '
import re, sys
ok = re.compile(r"^\+(\s*$|\s+(\x27@pnpm/exe[^\n]*|specifier: [0-9]+\.[0-9]+\.[0-9]+|version: [0-9]+\.[0-9]+\.[0-9]+|resolution: \{integrity: sha512-[^\n]*\}|engines: \{node: [^\n]*\}|hasBin: true|optionalDependencies:))$")
lines = [l.rstrip("\n") for l in sys.stdin if l[:1] in "+-" and not l.startswith(("+++", "---"))]
sys.exit(0 if lines and all(ok.match(l) for l in lines) else 1)
'; then
  git checkout -- pnpm-lock.yaml || report_error "lockfile drift revert failed"
  status=$(git status --porcelain) || report_error "status failed"
fi
[ -z "$status" ] || report_error "dirty owned checkout"
git fetch -q origin main || report_error "fetch origin failed"
git fetch -q fork main || report_error "fetch fork failed"
git merge-base --is-ancestor origin/main fork/main
ancestor=$?
case "$ancestor" in
  0)
    fork_sha=$(git rev-parse fork/main) || report_error "fork SHA unavailable"
    head_sha=$(git rev-parse HEAD) || report_error "HEAD unavailable"
    [ "$head_sha" = "$fork_sha" ] || report_error "owned candidate differs from fork/main; inspect unpublished work or safely fast-forward"
    metadata=/Applications/Orca.app/Contents/Resources/orca-local-build.json
    if python3 - "$metadata" "$fork_sha" <<'CHECK'
import json, plistlib, subprocess, sys
try:
    data = json.load(open(sys.argv[1]))
    commit = data.get('commit', '')
    info = plistlib.load(open('/Applications/Orca.app/Contents/Info.plist', 'rb'))
    signature = subprocess.run(['/usr/bin/codesign', '-dv', '/Applications/Orca.app'], capture_output=True, text=True, check=True)
    valid = len(commit) >= 12 and sys.argv[2].startswith(commit) and data.get('architecture') == 'arm64' and data.get('version') == info.get('CFBundleShortVersionString') and 'TeamIdentifier=N59WC8BU7V' in signature.stderr
except (OSError, ValueError, TypeError, subprocess.CalledProcessError):
    valid = False
sys.exit(0 if valid else 1)
CHECK
    then
      /usr/bin/codesign --verify --deep --strict /Applications/Orca.app || report_error "installed signature invalid"
      printf 'PRECHECK_NOOP: upstream already in fork/main %s and same signed arm64 candidate installed; running runtime not implied\n' "$fork_sha"
      exit 1
    fi
    printf 'PRECHECK_RUN: upstream current; installed candidate needs verification or installation\n'
    exit 0 ;;
  1) printf 'PRECHECK_RUN: upstream has commits not in fork/main\n'; exit 0 ;;
  *) report_error "merge-base failed with $ancestor" ;;
esac
