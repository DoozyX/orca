#!/bin/bash
# Run from the laptop (needs the m1 and uc-vm ssh aliases): prints the fork-main commit each machine has installed; exits 1 on any difference.
set -uo pipefail

want=$(git ls-remote git@github.com:DoozyX/orca.git refs/heads/main | cut -c1-12)
[ -n "$want" ] || { echo "cannot read fork main" >&2; exit 2; }

mac_commit() {
  python3 -c 'import json; print(json.load(open("/Applications/Orca.app/Contents/Resources/orca-local-build.json"))["commit"][:12])'
}
UCVM=(ssh -o BatchMode=yes -o ConnectTimeout=10 uc-vm)

status=0
report() {
  local name=$1 got=$2
  if [ "$got" = "$want" ]; then echo "ok    $name $got"; else echo "DIFF  $name ${got:-unreachable} (fork main $want)"; status=1; fi
}

report "laptop" "$(mac_commit 2>/dev/null)"
report "m1    " "$(ssh -o BatchMode=yes -o ConnectTimeout=10 m1 "$(declare -f mac_commit); mac_commit" 2>/dev/null)"
ucvm=$("${UCVM[@]}" "dpkg-query -W -f='\${Version}' orca-ide" 2>/dev/null) || ucvm=
report "uc-vm " "${ucvm##*-fork.}"
exit $status
