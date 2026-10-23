#!/bin/bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd -P)"
NODE="${NODE:-/Applications/ChatGPT.app/Contents/Resources/cua_node/bin/node}"
LOADER="${1:-$ROOT/scripts/load-image-theme-macos.sh}"
TEMPORARY="$(/usr/bin/mktemp -d /tmp/xskin-image-loader-tests.XXXXXX)"
LOCK_PID=""
cleanup() {
  if [ -n "$LOCK_PID" ]; then /usr/bin/touch "$TEMPORARY/lock-stop"; wait "$LOCK_PID" 2>/dev/null || true; fi
  /bin/rm -rf "$TEMPORARY"
}
trap cleanup EXIT
FIXTURE="$TEMPORARY/runtime 中文 🌙"
TEST_HOME="$TEMPORARY/home 中文 🌙"
STATE="$TEST_HOME/Library/Application Support/CodexDreamSkinStudio"
THEME="$STATE/theme"
/bin/mkdir -p "$FIXTURE/scripts" "$THEME" "$STATE/studio"
/bin/cp "$ROOT/scripts/"*.mjs "$FIXTURE/scripts/"
/bin/cp "$LOADER" "$FIXTURE/scripts/load-image-theme-macos.sh"
/bin/cp "$ROOT/scripts/switch-theme-macos.sh" "$FIXTURE/scripts/"
/bin/cp -R "$ROOT/assets" "$FIXTURE/assets"
/bin/chmod +x "$FIXTURE/scripts/"*.sh
cat > "$FIXTURE/scripts/common-macos.sh" <<'COMMON'
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd -P)"
STATE_ROOT="$HOME/Library/Application Support/CodexDreamSkinStudio"
STATE_PATH="$STATE_ROOT/state.json"
THEME_DIR="$STATE_ROOT/theme"
INJECTOR="$SCRIPT_DIR/injector.mjs"
ensure_state_root() { /bin/mkdir -p "$STATE_ROOT"; }
ensure_node_runtime() { :; }
fail() { printf '%s\n' "$*" >&2; exit 1; }
notify_user() { :; }
alert_user() { printf 'alert\n' >> "$STATE_ROOT/apply-events"; }
hot_reapply_theme() {
  if /usr/bin/lockf -ks -t 0 "$STATE_ROOT/studio/operation.lock" /usr/bin/true; then fail "Theme switching lost the shared operation lock."; fi
  printf 'hot:%s\n' "$1" >> "$STATE_ROOT/apply-events"
  [ ! -f "$STATE_ROOT/fail-apply" ]
}
state_field() { printf 19341; }
COMMON
cat > "$FIXTURE/scripts/start-dream-skin-macos.sh" <<'START'
#!/bin/bash
printf 'start\n' >> "$HOME/Library/Application Support/CodexDreamSkinStudio/apply-events"
exit 1
START
/bin/chmod +x "$FIXTURE/scripts/start-dream-skin-macos.sh"
SOURCE_IMAGE="$TEMPORARY/新背景 🌃.jpg"
/usr/bin/sips -s format jpeg -Z 96 "$ROOT/assets/portal-hero.png" --out "$SOURCE_IMAGE" >/dev/null
/usr/bin/sips -Z 32 "$SOURCE_IMAGE" --out "$THEME/background.jpg" >/dev/null
printf '{"schemaVersion":1,"id":"original","name":"原本背景","image":"background.jpg","maskOpacity":0.37}\n' > "$THEME/theme.json"
/bin/cp "$THEME/background.jpg" "$TEMPORARY/old-image"
/bin/cp "$THEME/theme.json" "$TEMPORARY/old-theme"
load_image() { HOME="$TEST_HOME" NODE="$NODE" /bin/bash "$FIXTURE/scripts/load-image-theme-macos.sh" "$@"; }
unchanged() {
  /usr/bin/cmp -s "$TEMPORARY/old-image" "$THEME/background.jpg" || { printf "Rejected image settings changed the active background.\n" >&2; exit 1; }
  /usr/bin/cmp -s "$TEMPORARY/old-theme" "$THEME/theme.json" || { printf "Rejected image settings changed the active configuration.\n" >&2; exit 1; }
  [ -z "$(/usr/bin/find "$STATE" -maxdepth 1 -name '.image-import.*' -print)" ]
}
for invalid in focus name jpeg; do
  args=(--file "$SOURCE_IMAGE" --no-apply)
  case "$invalid" in
    focus) args+=(--focus-x 2) ;;
    name) args+=(--name $'invalid\nname') ;;
    jpeg) printf 'invalid jpeg' > "$TEMPORARY/invalid.jpg"; args=(--file "$TEMPORARY/invalid.jpg" --no-apply) ;;
  esac
  if load_image "${args[@]}" > "$TEMPORARY/result" 2>&1; then printf 'Invalid %s unexpectedly succeeded.\n' "$invalid" >&2; exit 1; fi
  unchanged
done
if HOME="$TEST_HOME" NODE="$NODE" /bin/bash "$FIXTURE/scripts/switch-theme-macos.sh" --locked --id invalid --no-apply > "$TEMPORARY/result" 2>&1; then printf 'Direct lock bypass unexpectedly succeeded.\n' >&2; exit 1; fi
unchanged
printf '{"foreign":"preserve"}\n' > "$THEME/.studio-transaction.json"
/bin/cp "$THEME/.studio-transaction.json" "$TEMPORARY/foreign-journal"
if load_image --file "$SOURCE_IMAGE" --no-apply > "$TEMPORARY/result" 2>&1; then printf 'Import unexpectedly replaced an unrecognized transaction.\n' >&2; exit 1; fi
unchanged
direct_pack="$(/usr/bin/find "$STATE/themes" -name theme.json -print -quit)"
direct_id="$(/usr/bin/basename "$(/usr/bin/dirname "$direct_pack")")"
if HOME="$TEST_HOME" NODE="$NODE" /bin/bash "$FIXTURE/scripts/switch-theme-macos.sh" --id "$direct_id" --no-apply > "$TEMPORARY/result" 2>&1; then printf 'Direct switching unexpectedly replaced an unrecognized transaction.\n' >&2; exit 1; fi
unchanged
/usr/bin/cmp -s "$TEMPORARY/foreign-journal" "$THEME/.studio-transaction.json"
/bin/rm "$THEME/.studio-transaction.json"
/usr/bin/lockf -ks -t 0 "$STATE/studio/operation.lock" /bin/bash -c 'printf ready > "$1"; while [ ! -f "$2" ]; do /bin/sleep 0.05; done' -- "$TEMPORARY/lock-ready" "$TEMPORARY/lock-stop" &
LOCK_PID=$!
for ((i=0;i<100;i++)); do [ ! -f "$TEMPORARY/lock-ready" ] || break; /bin/sleep 0.01; done
[ -f "$TEMPORARY/lock-ready" ]
if load_image --file "$SOURCE_IMAGE" --no-apply > "$TEMPORARY/result" 2>&1; then printf 'Concurrent import unexpectedly acquired the studio lock.\n' >&2; exit 1; fi
unchanged
/usr/bin/touch "$TEMPORARY/lock-stop"
wait "$LOCK_PID" 2>/dev/null || true
LOCK_PID=""
imports_before="$(/usr/bin/find "$STATE/themes" -name theme.json | /usr/bin/wc -l | /usr/bin/tr -d ' ')"
load_image --file "$SOURCE_IMAGE" --name '夜景 🌙' --appearance dark --focus-x 0.72 --focus-y 0.45 --safe-area left --task-mode banner --no-apply > "$TEMPORARY/result" 2>&1
[ ! -e "$STATE/apply-events" ]
"$NODE" - "$THEME/theme.json" <<'JS'
const fs = require('node:fs');
const assert = require('node:assert/strict');
const theme = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
assert.equal(theme.name, '夜景 🌙');
assert.equal(theme.appearance, 'dark');
assert.deepEqual(theme.art, {safeArea:'left', taskMode:'banner', focusX:0.72, focusY:0.45});
assert.match(theme.image, /^background-img-.*\.jpg$/);
JS
[ "$(/usr/bin/find "$STATE/themes" -name theme.json | /usr/bin/wc -l | /usr/bin/tr -d ' ')" = "$((imports_before + 1))" ]
[ -f "$STATE/images/新背景 🌃.jpg" ]
load_image --from-library '新背景 🌃.jpg' --name '再次套用' > "$TEMPORARY/result" 2>&1
/usr/bin/grep -Fxq hot:9341 "$STATE/apply-events"
: > "$STATE/fail-apply"
if load_image --file "$SOURCE_IMAGE" --name '保留以供重試' > "$TEMPORARY/result" 2>&1; then printf 'Failed apply unexpectedly succeeded.\n' >&2; exit 1; fi
"$NODE" -e 'if (JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).name !== "保留以供重試") process.exit(1)' "$THEME/theme.json"
/usr/bin/grep -Fxq start "$STATE/apply-events"
/usr/bin/grep -Fxq alert "$STATE/apply-events"
[ -z "$(/usr/bin/find "$STATE" -maxdepth 1 -name '.image-import.*' -print)" ]
printf 'PASS: Legacy image imports preserve active media on invalid input, serialize with the studio, and reuse validated theme switching.\n'
