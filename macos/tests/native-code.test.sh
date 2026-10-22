#!/bin/bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd -P)"
TEMPORARY="$(/usr/bin/mktemp -d /tmp/xskin-native-tests.XXXXXX)"
trap 'if [ -f "$TEMPORARY/scripts/daemon-pids" ]; then while read -r daemon; do /bin/kill -TERM "$daemon" 2>/dev/null || true; done < "$TEMPORARY/scripts/daemon-pids"; fi; /bin/rm -rf "$TEMPORARY"' EXIT
/usr/bin/xcrun swiftc -parse-as-library -swift-version 5 -D LOCALIZATION_SELF_CHECK "$ROOT/native/Localization.swift" -o "$TEMPORARY/localization-check"
"$TEMPORARY/localization-check"
/usr/bin/xcrun swiftc -parse-as-library -swift-version 5 -framework AppKit "$ROOT/native/DirectLauncher.swift" "$ROOT/native/Localization.swift" -o "$TEMPORARY/launcher-check"
"$TEMPORARY/launcher-check" --self-check
mkdir -p "$TEMPORARY/scripts/state"
cp "$ROOT/scripts/direct-launch-macos.sh" "$ROOT/scripts/start-dream-skin-macos.sh" "$TEMPORARY/scripts/"
cat > "$TEMPORARY/scripts/common-macos.sh" <<'STUB'
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
STATE_ROOT="$SCRIPT_DIR/state"
STATE_PATH="$STATE_ROOT/state.json"
START_ERROR_LOG="$STATE_ROOT/error.log"
INJECTOR_ERROR_LOG="$STATE_ROOT/injector-error.log"
APP_LOG="$STATE_ROOT/app.log"
APP_ERROR_LOG="$STATE_ROOT/app-error.log"
INJECTOR=/fixture/injector.mjs
THEME_DIR=/fixture/theme
SKIN_VERSION=fixture
NODE="$SCRIPT_DIR/node"
discover_codex_app() { :; }
require_macos_runtime() { :; }
ensure_state_root() { :; }
fail() { printf '%s\n' "$*" >&2; exit 1; }
state_field() { case "$1" in port) printf 19341 ;; session) if [ -f "$SCRIPT_DIR/paused" ]; then printf paused; else printf active; fi ;; esac; }
codex_is_running() { [ -f "$SCRIPT_DIR/running" ]; }
verified_cdp_endpoint() { [ -f "$SCRIPT_DIR/running" ] && [ ! -f "$SCRIPT_DIR/no-cdp" ]; }
activate_codex() { printf 'activate\n' >> "$SCRIPT_DIR/events"; }
launch_codex_normally() { printf 'normal\n' >> "$SCRIPT_DIR/events"; touch "$SCRIPT_DIR/running"; }
select_available_port() { printf 19341; }
launch_codex_with_cdp() { printf 'launch\n' >> "$SCRIPT_DIR/events"; touch "$SCRIPT_DIR/running"; }
launch_injector_daemon() { printf 'inject\n' >> "$SCRIPT_DIR/events"; /bin/sleep 120 >/dev/null 2>&1 & local daemon=$!; printf '%s\n' "$daemon" >> "$SCRIPT_DIR/daemon-pids"; printf '%s' "$daemon"; }
wait_for_cdp() { [ ! -f "$SCRIPT_DIR/no-cdp" ]; }
process_started_at() { printf FixtureStart; }
codex_main_pids() { printf '%s' "$PPID"; }
write_state() { printf '{}' > "$STATE_PATH"; }
stop_recorded_injector() { printf 'stop-injector\n' >> "$SCRIPT_DIR/events"; }
stop_codex() { printf 'Unexpected official quit\n' >&2; exit 99; }
STUB
cat > "$TEMPORARY/scripts/node" <<'NODE'
#!/bin/bash
[ "$1" != -e ] || exit 0
printf '{"targets":[{"result":{"pass":true}}]}\n'
NODE
chmod +x "$TEMPORARY/scripts/node"
launch="$TEMPORARY/scripts/direct-launch-macos.sh"
# Disabled and paused launchers keep their preference and use ordinary Codex.
bash "$launch"
[ "$(cat "$TEMPORARY/scripts/events")" = normal ]
touch "$TEMPORARY/scripts/state/shortcut-enabled" "$TEMPORARY/scripts/paused"
printf '{}' > "$TEMPORARY/scripts/state/state.json"
rm "$TEMPORARY/scripts/running" "$TEMPORARY/scripts/events"
bash "$launch"
[ "$(cat "$TEMPORARY/scripts/events")" = normal ]
[ -f "$TEMPORARY/scripts/paused" ]
rm "$TEMPORARY/scripts/paused"
# Three isolated cold-start fixtures, with a repeated click after each launch.
for attempt in 1 2 3; do
  rm -f "$TEMPORARY/scripts/running" "$TEMPORARY/scripts/events" "$TEMPORARY/scripts/state/state.json"
  bash "$launch"
  bash "$launch"
  [ "$(cat "$TEMPORARY/scripts/events")" = $'launch\ninject\nactivate' ]
done
# Ordinary existing windows and failed cold starts are never closed or reopened.
touch "$TEMPORARY/scripts/no-cdp"
rm "$TEMPORARY/scripts/events"
if bash "$launch" >/dev/null 2>&1; then exit 1; fi
[ ! -e "$TEMPORARY/scripts/events" ]
rm "$TEMPORARY/scripts/running" "$TEMPORARY/scripts/state/state.json"
if bash "$launch" >/dev/null 2>&1; then exit 1; fi
[ "$(cat "$TEMPORARY/scripts/events")" = $'launch\ninject' ]
printf 'PASS: three cold-start fixtures launch once each; repeated, paused, disabled and failed launches never close/reopen official Codex.\n'
