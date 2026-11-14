#!/bin/bash
# Builds and installs DoozyX/orca fork main on uc-vm itself (no GitHub Actions): `run` (default, what the timer calls) or `install-units`.
# The build phase runs in a low-priority, memory-capped transient unit so an OOM kills the build, never the VM's other work.
set -euo pipefail

REPO_URL=https://github.com/DoozyX/orca.git
ROOT=$HOME/orca-build
CHECKOUT=$ROOT/orca
TOOLCHAIN=$ROOT/toolchain
BIN_COPY=$ROOT/bin/ucvm-build-install.sh
LOGS=$ROOT/logs
STATUS=$ROOT/status.json
UPDATE_DIR=$HOME/orca-update
DATA_DIR=$HOME/.config/orca
BACKUPS=$HOME/orca-db-backup
ORCA_CLI=/opt/Orca/resources/bin/orca-ide
UNIT_DIR=$HOME/.config/systemd/user
NODE_GYP_VERSION=11.5.0
# A failed commit is not retried for this long, so a broken build cannot burn the VM every timer tick.
RETRY_FAILED_AFTER_SECONDS=21600
# Tuning knobs for the build unit. Measured peak is 3.45 GiB (renderer build) on this 7 GiB host; a MemoryHigh below the peak throttles the
# build to a crawl (a 35 minute stall at 3.5G), so MemoryHigh sits above it and MemoryMax is the OOM line.
BUILD_MEMORY_MAX=${UCVM_BUILD_MEMORY_MAX:-4500M}
BUILD_MEMORY_HIGH=${UCVM_BUILD_MEMORY_HIGH:-4200M}
BUILD_SWAP_MAX=${UCVM_BUILD_SWAP_MAX:-0}
# Rolldown threads each hold chunks in memory; fewer threads trade wall time for a lower peak.
BUILD_THREADS=${UCVM_BUILD_THREADS:-1}

STEP=start
TARGET_SHA=
STARTED=0
NOOP=0

now() { date +%s; }
log() { echo "$(date '+%F %T') $*"; }

write_status() { # state step error
  local installed
  installed=$(dpkg-query -W -f='${Version}' orca-ide 2>/dev/null || true)
  jq -n --arg state "$1" --arg step "$2" --arg error "${3:-}" --arg sha "$TARGET_SHA" --arg installed "$installed" \
    --argjson started "$STARTED" --argjson updated "$(now)" \
    '{state:$state, step:$step, error:$error, sha:$sha, installed:$installed, started:$started, updated:$updated}' \
    >"$STATUS.tmp"
  command mv -f "$STATUS.tmp" "$STATUS"
}

set_step() { STEP=$1; log "== $1"; write_status building "$1"; }

on_exit() {
  local rc=$?
  if [ "$rc" -ne 0 ]; then
    log "FAILED at step '$STEP' (exit $rc)"
    write_status failed "$STEP" "exit $rc" || true
  fi
  if [ "$NOOP" = 1 ] && [ -n "${LOG:-}" ]; then
    # A no-op check leaves one line in checks.log, not a log file per timer tick.
    /bin/rm -f "$LOG"
    tail -n 1000 "$LOGS/checks.log" >"$LOGS/checks.log.tmp" && command mv -f "$LOGS/checks.log.tmp" "$LOGS/checks.log"
  fi
}

note_noop() { NOOP=1; log "$*" | tee -a "$LOGS/checks.log"; }

node_major() { jq -r '.engines.node' "$CHECKOUT/package.json"; }
pnpm_version() { jq -r '.packageManager' "$CHECKOUT/package.json" | sed -e 's/^pnpm@//' -e 's/+.*//'; }
pnpm_sha512_hex() { jq -r '.packageManager' "$CHECKOUT/package.json" | sed -e 's/^.*+sha512\.//'; }

ensure_toolchain() {
  local major node_dir ver tarball
  major=$(node_major)
  node_dir=$TOOLCHAIN/node
  if ! "$node_dir/bin/node" -p "process.versions.node.split('.')[0]" 2>/dev/null | grep -qx "$major"; then
    ver=$(curl -fsS https://nodejs.org/dist/index.json | jq -r --arg p "v$major." '[.[] | select(.version | startswith($p))][0].version')
    [ -n "$ver" ] && [ "$ver" != null ] || { echo "no Node $major release found" >&2; return 1; }
    tarball=node-$ver-linux-x64.tar.xz
    local dl=$TOOLCHAIN/dl
    /bin/rm -rf "$dl" && mkdir -p "$dl"
    curl -fsS -o "$dl/$tarball" "https://nodejs.org/dist/$ver/$tarball"
    curl -fsS -o "$dl/SHASUMS256.txt" "https://nodejs.org/dist/$ver/SHASUMS256.txt"
    (cd "$dl" && grep " $tarball\$" SHASUMS256.txt | sha256sum -c -)
    tar -xJf "$dl/$tarball" -C "$TOOLCHAIN"
    /bin/rm -rf "$node_dir" "$dl"
    command mv "$TOOLCHAIN/node-$ver-linux-x64" "$node_dir"
    log "installed Node $ver"
  fi
  export PATH=$node_dir/bin:$PATH

  local pv pdir want_integrity got_integrity
  pv=$(pnpm_version)
  pdir=$TOOLCHAIN/pnpm-$pv
  if [ ! -x "$pdir/node_modules/.bin/pnpm" ]; then
    # The registry's integrity for this version must equal the sha512 package.json pins.
    want_integrity="sha512-$(pnpm_sha512_hex | xxd -r -p | base64 -w0)"
    got_integrity=$(npm view "pnpm@$pv" dist.integrity)
    [ "$want_integrity" = "$got_integrity" ] || { echo "pnpm $pv integrity mismatch: package.json $want_integrity, registry $got_integrity" >&2; return 1; }
    npm install --prefix "$pdir" "pnpm@$pv" --no-audit --no-fund
    log "installed pnpm $pv"
  fi
  export PATH=$pdir/node_modules/.bin:$PATH
  [ "$(pnpm --version)" = "$pv" ] || { echo "pnpm $(pnpm --version) != $pv" >&2; return 1; }

  # An external node-gyp avoids pnpm's bundled copy, as the old CI job did.
  local gyp=$TOOLCHAIN/node-gyp-$NODE_GYP_VERSION
  [ -f "$gyp/node_modules/node-gyp/bin/node-gyp.js" ] || npm install --prefix "$gyp" "node-gyp@$NODE_GYP_VERSION" --no-audit --no-fund
  export npm_config_node_gyp=$gyp/node_modules/node-gyp/bin/node-gyp.js
}

sync_checkout() {
  [ -d "$CHECKOUT/.git" ] || { mkdir -p "$CHECKOUT" && git -C "$CHECKOUT" init -q && git -C "$CHECKOUT" remote add origin "$REPO_URL"; }
  [ "$(git -C "$CHECKOUT" remote get-url origin)" = "$REPO_URL" ] || { echo "checkout origin is not $REPO_URL" >&2; return 1; }
  # Only main: the fork has branch names that collide on case-insensitive filesystems.
  GIT_TERMINAL_PROMPT=0 git -C "$CHECKOUT" fetch -q --depth 1 origin refs/heads/main
  TARGET_SHA=$(git -C "$CHECKOUT" rev-parse FETCH_HEAD)
  git -C "$CHECKOUT" -c advice.detachedHead=false checkout -qf --detach "$TARGET_SHA"
  # Keeps node_modules at every depth for fast reruns; drops every other build output.
  git -C "$CHECKOUT" clean -fdxq -e node_modules
}

refresh_bin_copy() {
  local src=$CHECKOUT/config/scripts/ucvm-build-install.sh
  [ -f "$src" ] || return 0
  cmp -s "$src" "$BIN_COPY" && return 0
  # New inode, so a copy that is running keeps its old contents.
  command cp "$src" "$BIN_COPY.new" && chmod 755 "$BIN_COPY.new" && command mv -f "$BIN_COPY.new" "$BIN_COPY"
  log "refreshed $BIN_COPY from the checkout; it applies from the next run"
}

# Terminal scopes are what must survive a serve restart; idle daemon scopes legitimately come and go.
terminal_scopes() { systemctl --user list-units --plain --no-legend --all 'orca_pty_*.scope' | awk '{print $1}' | sort; }

serve_pid() { "$ORCA_CLI" status 2>/dev/null | awk '/^pid:/{print $2}'; }

backup_databases() {
  local dest from
  from=$(dpkg-query -W -f='${Version}' orca-ide)
  dest=$BACKUPS/$(date -u +%Y%m%dT%H%M%SZ)-from-$from
  mkdir -p "$dest"
  python3 -I - "$DATA_DIR" "$dest" <<'PY'
import glob, os, shutil, sqlite3, sys
src, dst = sys.argv[1:3]
dbs = sorted(set(glob.glob(f"{src}/*.db") + glob.glob(f"{src}/*/*.db") + glob.glob(f"{src}/*.sqlite") + glob.glob(f"{src}/*/*.sqlite")))
for path in dbs:
    out = os.path.join(dst, os.path.relpath(path, src))
    os.makedirs(os.path.dirname(out), exist_ok=True)
    source = sqlite3.connect(path)
    target = sqlite3.connect(out)
    source.backup(target)
    target.close()
    source.close()
for path in glob.glob(f"{src}/*.json"):
    shutil.copy2(path, dst)
print(f"backed up {len(dbs)} databases to {dst}")
PY
  # The copies include the E2EE keypair and session data.
  chmod -R go-rwx "$BACKUPS"
  # Keep the five newest.
  find "$BACKUPS" -mindepth 1 -maxdepth 1 -type d | sort | head -n -5 | xargs -r /bin/rm -rf
}

build_inner() {
  cd "$CHECKOUT"
  TARGET_SHA=$(git rev-parse HEAD)
  STARTED=$BUILD_STARTED
  ensure_toolchain
  export ORCA_BACKGROUND_LAUNCH=1 ORCA_MOBILE_WEB_APP_DEPS_REQUIRED=1 CI=1
  export npm_config_store_dir=$ROOT/pnpm-store

  set_step install-dependencies
  pnpm install --frozen-lockfile
  # The mobile web bundle in the .deb resolves React Native and Expo from mobile/node_modules (JS only, no native mobile build).
  (cd mobile && pnpm install --frozen-lockfile)

  set_step build-wayland-clipboard
  # The user manager that runs this unit started before uniqcast joined the docker group and cannot be restarted without killing the VM's agents; sg adds the group for this one step.
  sg docker -c "cd '$CHECKOUT' && node config/scripts/native-build/linux/build-wayland-clipboard.mjs"

  set_step build-release
  pnpm build:release

  set_step package-deb
  local base
  base=$(node -p "require('./package.json').version")
  node config/scripts/native-build/node-addons/ensure-native-runtime.mjs --runtime=electron
  pnpm exec electron-builder --config config/electron-builder.config.cjs --linux deb --x64 --publish never \
    -c.extraMetadata.version="${base}-fork.${TARGET_SHA:0:12}"
  ls -l dist/*.deb
}

run_build_unit() {
  # Peak memory comes from the "Memory peak" line systemd-run prints when the unit ends.
  local rc=0
  systemd-run --user --wait --collect --pipe \
    --unit="orca-ucvm-build-$$" \
    -p MemoryMax="$BUILD_MEMORY_MAX" -p MemoryHigh="$BUILD_MEMORY_HIGH" -p MemorySwapMax="$BUILD_SWAP_MAX" \
    -p Nice=15 -p OOMScoreAdjust=500 -p IOSchedulingClass=idle -p CPUWeight=10 -p IOWeight=10 \
    --setenv=BUILD_STARTED="$STARTED" \
    --setenv=ROLLDOWN_WORKER_THREADS="$BUILD_THREADS" --setenv=RAYON_NUM_THREADS="$BUILD_THREADS" \
    bash "$BIN_COPY" build-inner 2>&1 || rc=$?
  [ "$rc" = 0 ] || STEP="build/$(jq -r '.step' "$STATUS")"
  return "$rc"
}

run() {
  mkdir -p "$ROOT/bin" "$LOGS" "$UPDATE_DIR" "$BACKUPS"
  exec 9>"$ROOT/lock"
  flock -n 9 || { echo "$(date '+%F %T') another run holds the lock" >>"$LOGS/checks.log"; exit 0; }
  LOG=$LOGS/run-$(date +%Y%m%dT%H%M%S).log
  exec > >(tee -a "$LOG") 2>&1
  trap on_exit EXIT
  STARTED=$(now)

  STEP=resolve-fork-main
  local want want12 installed
  want=$(for _ in 1 2 3; do GIT_TERMINAL_PROMPT=0 git ls-remote "$REPO_URL" refs/heads/main && break; sleep 10; done | cut -f1)
  [ "${#want}" = 40 ] || { echo "cannot read fork main" >&2; exit 1; }
  want12=${want:0:12}
  installed=$(dpkg-query -W -f='${Version}' orca-ide)
  TARGET_SHA=$want
  if [ "${installed##*fork.}" = "$want12" ]; then
    note_noop "current: orca-ide $installed is fork main $want12"
    write_status current finished
    return 0
  fi

  if [ -f "$STATUS" ] && [ "$(jq -r '.state' "$STATUS")" = failed ] && [ "$(jq -r '.sha' "$STATUS")" = "$want" ] &&
    [ $(($(now) - $(jq -r '.updated' "$STATUS"))) -lt "$RETRY_FAILED_AFTER_SECONDS" ]; then
    note_noop "skipping $want12: it failed at step '$(jq -r '.step' "$STATUS")' less than $((RETRY_FAILED_AFTER_SECONDS / 3600))h ago"
    return 0
  fi

  log "building fork main $want12 (installed: $installed)"
  # Without swap the kernel OOM killer ends the build mid-step with no error in the log (2026-11-12, swap removed by hand).
  STEP=check-swap
  [ -n "$(swapon --show --noheadings)" ] || { echo "no active swap: the build needs it on this 7 GiB host (restore /swap.img and its fstab line)" >&2; exit 1; }
  set_step sync-checkout
  sync_checkout
  if [ "$TARGET_SHA" != "$want" ]; then want=$TARGET_SHA; want12=${want:0:12}; log "fork main moved to $want12"; fi
  refresh_bin_copy

  set_step build
  local t0
  t0=$(now)
  export BUILD_STARTED=$STARTED
  run_build_unit
  log "build finished in $(($(now) - t0))s"

  local deb version expected
  deb=$(find "$CHECKOUT/dist" -maxdepth 1 -name 'orca-ide_*.deb' | head -1)
  [ -n "$deb" ] || { echo "electron-builder produced no orca-ide .deb" >&2; exit 1; }
  expected="$(node_version_base)~fork.$want12"
  version=$(dpkg-deb --field "$deb" Version)
  [ "$version" = "$expected" ] || { echo "deb version $version != $expected" >&2; exit 1; }

  set_step backup-databases
  backup_databases

  set_step install
  command cp "$deb" "$UPDATE_DIR/"
  local scopes_before pid_before
  scopes_before=$(terminal_scopes)
  pid_before=$(serve_pid)
  sudo -n /usr/local/sbin/orca-install-update

  set_step verify-install
  [ "$(dpkg-query -W -f='${Version}' orca-ide)" = "$version" ] || { echo "dpkg does not report $version" >&2; exit 1; }
  local up=0
  for _ in $(seq 1 45); do
    if [ "$(systemctl --user is-active orca-serve.service)" = active ] &&
      "$ORCA_CLI" status 2>/dev/null | grep -qx 'runtimeReachable: true' &&
      [ "$(curl -s -o /dev/null -m 5 -w '%{http_code}' http://127.0.0.1:6768/)" = 200 ]; then
      up=1
      break
    fi
    sleep 2
  done
  [ "$up" = 1 ] || { echo "orca-serve does not answer after the install" >&2; exit 1; }
  log "serve pid ${pid_before:-none} -> $(serve_pid)"
  local missing
  missing=$(comm -23 <(echo "$scopes_before") <(terminal_scopes) || true)
  [ -z "$missing" ] || log "WARNING: terminal scopes gone after the install: $missing"
  log "terminal scopes: $(echo "$scopes_before" | wc -l) before, $(terminal_scopes | wc -l) after"

  set_step cleanup
  find "$UPDATE_DIR" -maxdepth 1 -name 'orca-ide_*.deb' ! -name "$(basename "$deb")" -delete
  /bin/rm -rf "$CHECKOUT/dist" "$CHECKOUT/out"
  find "$LOGS" -maxdepth 1 -name 'run-*.log' | sort | head -n -10 | xargs -r /bin/rm -f

  STEP=finished
  write_status ok finished
  log "ok: uc-vm runs orca-ide $version in $(($(now) - STARTED))s"
}

node_version_base() { jq -r '.version' "$CHECKOUT/package.json"; }

install_units() {
  mkdir -p "$ROOT/bin" "$LOGS" "$UNIT_DIR"
  command cp "$0" "$BIN_COPY.new" && chmod 755 "$BIN_COPY.new" && command mv -f "$BIN_COPY.new" "$BIN_COPY"
  cat >"$UNIT_DIR/orca-ucvm-build.service" <<EOF
[Unit]
Description=Build and install DoozyX/orca fork main on this host
After=network-online.target

[Service]
Type=oneshot
ExecStart=$BIN_COPY run
TimeoutStartSec=3h
EOF
  cat >"$UNIT_DIR/orca-ucvm-build.timer" <<EOF
[Unit]
Description=Check for a new DoozyX/orca fork main every 30 minutes

[Timer]
OnCalendar=*:07,37
RandomizedDelaySec=60
Persistent=true

[Install]
WantedBy=timers.target
EOF
  systemctl --user daemon-reload
  systemctl --user enable --now orca-ucvm-build.timer
  loginctl show-user "$USER" -p Linger | grep -qx 'Linger=yes' || echo "WARNING: linger is off; a root step is needed: loginctl enable-linger $USER" >&2
  systemctl --user list-timers orca-ucvm-build.timer --no-pager
}

case "${1:-run}" in
  run) run ;;
  build-inner) build_inner ;;
  install-units) install_units ;;
  *) echo "usage: $0 [run|install-units]" >&2; exit 2 ;;
esac
