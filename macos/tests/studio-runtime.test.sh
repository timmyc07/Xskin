#!/bin/bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd -P)"
TEMPORARY="$(/usr/bin/mktemp -d /tmp/xskin-studio-runtime.XXXXXX)"
trap '/bin/rm -rf "$TEMPORARY"' EXIT
SOURCE="$TEMPORARY/來源 中文 🌙 source"
INSTALLED="$TEMPORARY/installed runtime"
mkdir -p "$SOURCE/scripts" "$SOURCE/assets" "$SOURCE/bin"
cp "$ROOT/scripts/studio-command-macos.sh" "$SOURCE/scripts/"
cat > "$SOURCE/scripts/common-macos.sh" <<'COMMON'
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd -P)"
INSTALL_ROOT="$FIXTURE_INSTALLED"
NODE="$FIXTURE_NODE"
THEME_DIR="$FIXTURE_INSTALLED/theme"
discover_codex_app() { :; }
require_macos_runtime() { :; }
ensure_state_root() { :; }
COMMON
cat > "$SOURCE/scripts/install-dream-skin-macos.sh" <<'INSTALL'
#!/bin/bash
set -euo pipefail
case "$*" in '--no-launchers --no-launch'|'--no-launchers --no-launch --prepare-only') ;; *) exit 1 ;; esac
printf '%s\n' "$*" > "$FIXTURE_INSTALL_ARGS"
printf 'install\n' >> "$FIXTURE_EVENTS"
[ ! -f "$FIXTURE_FAIL" ] || exit 1
SOURCE="$(cd "$(dirname "$0")/.." && pwd -P)"
/usr/bin/rsync -a --delete "$SOURCE/" "$FIXTURE_INSTALLED/"
INSTALL
cat > "$TEMPORARY/node" <<'NODE'
#!/bin/bash
printf 'backend:%s\n' "$*" >> "$FIXTURE_EVENTS"
if [ "${2:-}" = recover ]; then
  printf '{"recovered":true}\n'
  exit "${FIXTURE_RECOVER_CODE:-0}"
fi
NODE
chmod +x "$SOURCE/scripts/install-dream-skin-macos.sh" "$TEMPORARY/node"
printf 'same-version\n' > "$SOURCE/VERSION"
printf '// backend\n' > "$SOURCE/scripts/background-studio.mjs"
printf '// reader\n' > "$SOURCE/scripts/token-usage.mjs"
printf '// injector\n' > "$SOURCE/scripts/injector.mjs"
printf '// overlay\n' > "$SOURCE/assets/token-overlay.js"
printf '/* css */\n' > "$SOURCE/assets/dream-skin.css"
printf 'helper\n' > "$SOURCE/bin/CodexLauncher"
mkdir -p "$INSTALLED"
cp -R "$SOURCE/" "$INSTALLED/"
export FIXTURE_INSTALLED="$INSTALLED" FIXTURE_NODE="$TEMPORARY/node" FIXTURE_EVENTS="$TEMPORARY/events" FIXTURE_FAIL="$TEMPORARY/fail" FIXTURE_INSTALL_ARGS="$TEMPORARY/install-args"
run() { /bin/bash "$SOURCE/scripts/studio-command-macos.sh" status; }
assert_no_install() {
  rm -f "$FIXTURE_EVENTS"
  run
  ! /usr/bin/grep -q '^install$' "$FIXTURE_EVENTS"
  /usr/bin/grep -Fxq "backend:$INSTALLED/scripts/background-studio.mjs status" "$FIXTURE_EVENTS"
}
assert_no_install
for file in scripts/token-usage.mjs scripts/injector.mjs assets/token-overlay.js assets/dream-skin.css bin/CodexLauncher; do
  printf 'updated\n' >> "$SOURCE/$file"
  rm "$FIXTURE_EVENTS"
  run
  [ "$(/usr/bin/grep -c '^install$' "$FIXTURE_EVENTS")" = 1 ]
  /usr/bin/cmp -s "$SOURCE/$file" "$INSTALLED/$file"
  assert_no_install
done
printf 'retired\n' > "$INSTALLED/scripts/removed-helper.sh"
rm "$FIXTURE_EVENTS"
run
/usr/bin/grep -Fxq install "$FIXTURE_EVENTS"
[ ! -e "$INSTALLED/scripts/removed-helper.sh" ]
assert_no_install
rm "$INSTALLED/scripts/background-studio.mjs" "$FIXTURE_EVENTS"
run
/usr/bin/grep -Fxq install "$FIXTURE_EVENTS"
assert_no_install
printf 'image changed\n' > "$SOURCE/assets/background.jpg"
assert_no_install
printf 'changed again\n' >> "$SOURCE/assets/token-overlay.js"
touch "$FIXTURE_FAIL"
rm "$FIXTURE_EVENTS"
if run; then exit 1; fi
[ "$(cat "$FIXTURE_EVENTS")" = install ]
! /usr/bin/cmp -s "$SOURCE/assets/token-overlay.js" "$INSTALLED/assets/token-overlay.js"
rm "$FIXTURE_FAIL"
run
assert_no_install
rm "$FIXTURE_EVENTS"
/bin/bash "$INSTALLED/scripts/studio-command-macos.sh" status
! /usr/bin/grep -q '^install$' "$FIXTURE_EVENTS"
printf 'embedded update\n' >> "$SOURCE/assets/token-overlay.js"
rm "$FIXTURE_EVENTS"
/bin/bash "$SOURCE/scripts/studio-command-macos.sh" --embedded status
[ "$(cat "$FIXTURE_INSTALL_ARGS")" = '--no-launchers --no-launch --prepare-only' ]
/usr/bin/grep -Fxq "backend:$INSTALLED/scripts/background-studio.mjs --embedded status" "$FIXTURE_EVENTS"
assert_no_install
mkdir -p "$INSTALLED/theme"
touch "$INSTALLED/theme/.studio-transaction.json"
for code in 0 75 1; do
  export FIXTURE_RECOVER_CODE="$code"
  rm "$FIXTURE_EVENTS"
  if [ "$code" -eq 1 ]; then
    if run >/dev/null; then exit 1; fi
    [ "$(cat "$FIXTURE_EVENTS")" = "backend:$INSTALLED/scripts/background-studio.mjs recover" ]
  else
    run
    [ "$(cat "$FIXTURE_EVENTS")" = "backend:$INSTALLED/scripts/background-studio.mjs recover
backend:$INSTALLED/scripts/background-studio.mjs status" ]
  fi
done
for entry in start-dream-skin-macos.sh direct-launch-macos.sh; do
/usr/bin/sed -n '/^if \[ -e "\$THEME_DIR\/\.studio-transaction.json"/,/^fi$/p' "$ROOT/scripts/$entry" > "$TEMPORARY/recover-start.sh"
[ -s "$TEMPORARY/recover-start.sh" ]
for code in 0 75 1; do
  export FIXTURE_RECOVER_CODE="$code"
  rm "$FIXTURE_EVENTS"
  if /bin/bash -c 'THEME_DIR="$1/theme"; SCRIPT_DIR="$1/scripts"; NODE="$2"; fail() { exit 1; }; . "$3"; printf "continue\n" >> "$FIXTURE_EVENTS"' _ "$INSTALLED" "$FIXTURE_NODE" "$TEMPORARY/recover-start.sh"; then
    [ "$code" -ne 1 ]
    /usr/bin/grep -Fxq continue "$FIXTURE_EVENTS"
  else
    [ "$code" -eq 1 ]
    ! /usr/bin/grep -Fxq continue "$FIXTURE_EVENTS"
  fi
done
done
printf 'PASS: same-version runtime changes update once, matching payloads skip updates, media is excluded, and failed deployment never starts a stale backend.\n'
printf 'PASS: panel and startup recover pending transactions before loading settings, tolerate live operation locks, and stop on invalid recovery.\n'
