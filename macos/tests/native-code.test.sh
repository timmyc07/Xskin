#!/bin/bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd -P)"
TEMPORARY="$(/usr/bin/mktemp -d /tmp/xskin-native-tests.XXXXXX)"
trap 'for pidfile in "$TEMPORARY/scripts/daemon-pids" "$TEMPORARY/recovery/daemon-pids"; do if [ -f "$pidfile" ]; then while read -r daemon; do /bin/kill -TERM "$daemon" 2>/dev/null || true; done < "$pidfile"; fi; done; /bin/rm -rf "$TEMPORARY"' EXIT
/usr/bin/xcrun swiftc -parse-as-library -swift-version 5 -D LOCALIZATION_SELF_CHECK "$ROOT/native/Localization.swift" -o "$TEMPORARY/localization-check"
"$TEMPORARY/localization-check"
/usr/bin/xcrun swiftc -parse-as-library -swift-version 5 -framework AppKit "$ROOT/native/DirectLauncher.swift" "$ROOT/native/Localization.swift" -o "$TEMPORARY/launcher-check"
"$TEMPORARY/launcher-check" --self-check
if "$TEMPORARY/launcher-check" --quit-new-launch /unrelated -1 >/dev/null 2>&1; then exit 1; fi
if "$TEMPORARY/launcher-check" --quit-new-launch /unrelated "$$" >/dev/null 2>&1; then exit 1; fi
mkdir -p "$TEMPORARY/scripts/state"
cp "$ROOT/scripts/direct-launch-macos.sh" "$ROOT/scripts/start-dream-skin-macos.sh" "$TEMPORARY/scripts/"
cat > "$TEMPORARY/scripts/common-macos.sh" <<'STUB'
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
PROJECT_ROOT="$SCRIPT_DIR/.."
STATE_ROOT="$SCRIPT_DIR/state"
STATE_PATH="$STATE_ROOT/state.json"
AUTOSTART_AGENT_PATH="$STATE_ROOT/agent.plist"
START_ERROR_LOG="$STATE_ROOT/error.log"
INJECTOR_ERROR_LOG="$STATE_ROOT/injector-error.log"
APP_LOG="$STATE_ROOT/app.log"
APP_ERROR_LOG="$STATE_ROOT/app-error.log"
INJECTOR=/fixture/injector.mjs
THEME_DIR=/fixture/theme
SKIN_VERSION=fixture
discover_codex_app() { :; }
require_macos_runtime() { NODE="${FIXTURE_NODE:-$SCRIPT_DIR/node}"; }
ensure_state_root() { :; }
fail() { printf '%s\n' "$*" >&2; exit 1; }
state_field() { case "$1" in port) printf 19341 ;; injectorPid) printf '%s' "${FIXTURE_INJECTOR_PID:-}" ;; session) if [ -f "$SCRIPT_DIR/paused" ]; then printf paused; else printf active; fi ;; esac; }
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
hot_reapply_theme() { [ ! -f "$SCRIPT_DIR/fail-repair" ] || return 1; printf 'reapply\n' >> "$SCRIPT_DIR/events"; }
current_injector_is_running() { [ ! -f "$SCRIPT_DIR/fail-repair" ]; }
release_codex_launchd_job() { :; }
stop_codex() { printf 'Unexpected official quit\n' >&2; exit 99; }
new_codex_launch_matches() { [ "$1" = 321 ] && [ "$2" = FixtureStart ] && [ ! -f "$SCRIPT_DIR/stale-launch" ]; }
stop_new_codex_launch() {
  [ ! -f "$SCRIPT_DIR/decline-quit" ] || return 1
  printf 'quit-new:%s\n' "$1" >> "$SCRIPT_DIR/events"
  rm -f "$SCRIPT_DIR/running" "$SCRIPT_DIR/no-cdp"
}
STUB
printf 'check_autostart_agent() { [ -f "$AUTOSTART_AGENT_PATH" ]; }\n' > "$TEMPORARY/scripts/autostart-dream-skin-macos.sh"
cat > "$TEMPORARY/scripts/node" <<'NODE'
#!/bin/bash
[ "$1" != -e ] || exit 0
if [ "${2:-}" = --check-payload ] && [ -f "$(dirname "$0")/bad-payload" ]; then exit 1; fi
if [ "${2:-}" = --verify ] && [ -f "$(dirname "$0")/fail-verify" ]; then exit 2; fi
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
# Failed repairs preserve the current official app and do not launch another injector.
touch "$TEMPORARY/scripts/fail-repair"
rm "$TEMPORARY/scripts/events"
if bash "$launch" >/dev/null 2>&1; then exit 1; fi
[ ! -e "$TEMPORARY/scripts/events" ] && [ -f "$TEMPORARY/scripts/running" ]
rm "$TEMPORARY/scripts/fail-repair"
# Ordinary existing windows and failed cold starts are never closed or reopened.
touch "$TEMPORARY/scripts/no-cdp"
rm -f "$TEMPORARY/scripts/events"
if bash "$launch" >/dev/null 2>&1; then exit 1; fi
[ ! -e "$TEMPORARY/scripts/events" ]
rm "$TEMPORARY/scripts/running" "$TEMPORARY/scripts/state/state.json"
if bash "$launch" >/dev/null 2>&1; then exit 1; fi
[ "$(cat "$TEMPORARY/scripts/events")" = $'launch\ninject' ]
touch "$TEMPORARY/scripts/state/agent.plist"
for attempt in 1 2 3; do
  touch "$TEMPORARY/scripts/running" "$TEMPORARY/scripts/no-cdp"
  rm -f "$TEMPORARY/scripts/events" "$TEMPORARY/scripts/state/state.json"
  bash "$TEMPORARY/scripts/start-dream-skin-macos.sh" --restart-new-launch 321 FixtureStart
  [ "$(cat "$TEMPORARY/scripts/events")" = $'quit-new:321\nlaunch\ninject' ]
done
for guard in paused stale-launch bad-payload decline-quit; do
  rm -f "$TEMPORARY/scripts/events" "$TEMPORARY/scripts/state/state.json"
  [ "$guard" != paused ] || printf '{}' > "$TEMPORARY/scripts/state/state.json"
  touch "$TEMPORARY/scripts/running" "$TEMPORARY/scripts/no-cdp" "$TEMPORARY/scripts/$guard"
  if bash "$TEMPORARY/scripts/start-dream-skin-macos.sh" --restart-new-launch 321 FixtureStart >/dev/null 2>&1; then exit 1; fi
  [ ! -e "$TEMPORARY/scripts/events" ]
  rm "$TEMPORARY/scripts/$guard"
done
rm -f "$TEMPORARY/scripts/events" "$TEMPORARY/scripts/state/shortcut-enabled"
if bash "$TEMPORARY/scripts/start-dream-skin-macos.sh" --restart-new-launch 321 FixtureStart >/dev/null 2>&1; then exit 1; fi
[ ! -e "$TEMPORARY/scripts/events" ]
# Resuming saved media never opens or reopens the official application.
for state in closed ordinary connected; do
  rm -f "$TEMPORARY/scripts/events" "$TEMPORARY/scripts/running" "$TEMPORARY/scripts/no-cdp"
  printf '{"session":"paused","port":19341}' > "$TEMPORARY/scripts/state/state.json"
  [ "$state" = closed ] || touch "$TEMPORARY/scripts/running"
  [ "$state" != ordinary ] || touch "$TEMPORARY/scripts/no-cdp"
  if [ "$state" = connected ]; then
    bash "$TEMPORARY/scripts/start-dream-skin-macos.sh" --existing-only
    [ "$(cat "$TEMPORARY/scripts/events")" = $'stop-injector\ninject' ]
  else
    if bash "$TEMPORARY/scripts/start-dream-skin-macos.sh" --existing-only >/dev/null 2>&1; then exit 1; fi
    [ ! -e "$TEMPORARY/scripts/events" ]
  fi
done
# Embedded Apply keeps the same watcher alive, including after verification fails.
/bin/sleep 120 >/dev/null 2>&1 &
export FIXTURE_INJECTOR_PID=$!
printf '%s\n' "$FIXTURE_INJECTOR_PID" >> "$TEMPORARY/scripts/daemon-pids"
rm -f "$TEMPORARY/scripts/events" "$TEMPORARY/scripts/no-cdp"
bash "$TEMPORARY/scripts/start-dream-skin-macos.sh" --existing-only --reuse-watcher
[ "$(cat "$TEMPORARY/scripts/events")" = reapply ]
touch "$TEMPORARY/scripts/fail-verify"
rm "$TEMPORARY/scripts/events"
if bash "$TEMPORARY/scripts/start-dream-skin-macos.sh" --existing-only --reuse-watcher >/dev/null 2>&1; then exit 1; fi
[ "$(cat "$TEMPORARY/scripts/events")" = reapply ]
[ -f "$TEMPORARY/scripts/state/state.json" ]
/bin/kill -0 "$FIXTURE_INJECTOR_PID"
rm "$TEMPORARY/scripts/fail-verify"
touch "$TEMPORARY/scripts/no-cdp"
cp "$ROOT/scripts/pause-dream-skin-macos.sh" "$TEMPORARY/scripts/"
touch "$TEMPORARY/scripts/state/shortcut-enabled"
printf '{"otherSetting":"保留 🌙"}' > "$TEMPORARY/scripts/state/state.json"
FIXTURE_NODE="${NODE:-/Applications/ChatGPT.app/Contents/Resources/cua_node/bin/node}" bash "$TEMPORARY/scripts/pause-dream-skin-macos.sh" >/dev/null
"${NODE:-/Applications/ChatGPT.app/Contents/Resources/cua_node/bin/node}" -e '
  const fs = require("node:fs");
  const state = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
  if (state.session !== "paused" || state.injectorPid !== 0 || state.otherSetting !== "保留 🌙") process.exit(1);
' "$TEMPORARY/scripts/state/state.json"
[ -f "$TEMPORARY/scripts/state/agent.plist" ] && [ -f "$TEMPORARY/scripts/state/shortcut-enabled" ]

# Exercise real state parsing, process identity and detached Node recovery; only
# the official-app boundary is replaced, so this never opens or closes Codex.
mkdir -p "$TEMPORARY/recovery/scripts"
cp "$ROOT/scripts/direct-launch-macos.sh" "$TEMPORARY/recovery/scripts/"
cat > "$TEMPORARY/recovery/scripts/common-macos.sh" <<'RECOVERY'
. "$FIXTURE_COMMON"
SCRIPT_DIR="$FIXTURE_ROOT/scripts"
PROJECT_ROOT="$FIXTURE_ROOT"
STATE_ROOT="$FIXTURE_ROOT"
STATE_PATH="$STATE_ROOT/state.json"
THEME_DIR="$STATE_ROOT"
INJECTOR="$STATE_ROOT/用量 🌙 injector.mjs"
INJECTOR_LOG="$STATE_ROOT/injector.log"
INJECTOR_ERROR_LOG="$STATE_ROOT/injector-error.log"
INJECTOR_JOB_LABEL="com.xskin.recovery-fixture.$PPID"
CODEX_BUNDLE=/fixture/Official.app
CODEX_EXE=/fixture/Official
unset NODE
discover_codex_app() { :; }
require_macos_runtime() { NODE="$FIXTURE_NODE"; }
codex_is_running() { return 0; }
verified_cdp_endpoint() { [ "$1" = 19341 ]; }
codex_main_pids() { printf 0; }
launch_codex_normally() { printf 'normal\n' >> "$STATE_ROOT/events"; }
activate_codex() { printf 'activate\n' >> "$STATE_ROOT/events"; }
RECOVERY
cat > "$TEMPORARY/recovery/用量 🌙 injector.mjs" <<'INJECTOR'
import fs from 'node:fs';
import path from 'node:path';
const root = path.dirname(new URL(import.meta.url).pathname);
const directory = decodeURIComponent(root);
if (process.argv.includes('--watch')) {
  fs.appendFileSync(path.join(directory, 'daemon-pids'), `${process.pid}\n`);
  setInterval(() => {}, 1000);
} else fs.appendFileSync(path.join(directory, 'events'), 'once\n');
INJECTOR
touch "$TEMPORARY/recovery/shortcut-enabled"
printf '{"session":"paused","port":19341}' > "$TEMPORARY/recovery/state.json"
recovery_launch() {
  /usr/bin/env -u NODE FIXTURE_COMMON="$ROOT/scripts/common-macos.sh" FIXTURE_ROOT="$TEMPORARY/recovery" \
    FIXTURE_NODE="${NODE:-/Applications/ChatGPT.app/Contents/Resources/cua_node/bin/node}" \
    /bin/bash "$TEMPORARY/recovery/scripts/direct-launch-macos.sh"
}
recovery_launch
[ "$(cat "$TEMPORARY/recovery/events")" = activate ]
printf '{"port":19341,"injectorPid":0}' > "$TEMPORARY/recovery/state.json"
rm "$TEMPORARY/recovery/events"
recovery_launch
recovery_launch
[ "$(cat "$TEMPORARY/recovery/events")" = $'once\nactivate\nactivate' ]
[ "$(wc -l < "$TEMPORARY/recovery/daemon-pids" | tr -d ' ')" = 1 ]
recovery_pid="$(tail -n 1 "$TEMPORARY/recovery/daemon-pids")"
/bin/kill -TERM "$recovery_pid"
for attempt in {1..100}; do
  state="$(/bin/ps -p "$recovery_pid" -o stat= 2>/dev/null || true)"
  case "$state" in ''|*Z*) break ;; esac
  /bin/sleep 0.02
done
recovery_launch
[ "$(wc -l < "$TEMPORARY/recovery/daemon-pids" | tr -d ' ')" = 2 ]
[ "$(tail -n 1 "$TEMPORARY/recovery/daemon-pids")" != "$recovery_pid" ]
"${NODE:-/Applications/ChatGPT.app/Contents/Resources/cua_node/bin/node}" -e '
  const fs = require("node:fs");
  const file = process.argv[1];
  const state = JSON.parse(fs.readFileSync(file, "utf8"));
  state.injectorPid = Number(process.argv[2]);
  state.injectorStartedAt = "foreign-process";
  fs.writeFileSync(file, JSON.stringify(state));
' "$TEMPORARY/recovery/state.json" "$$"
rm "$TEMPORARY/recovery/events"
if recovery_launch >/dev/null 2>&1; then exit 1; fi
[ "$(cat "$TEMPORARY/recovery/events")" = once ]
[ "$(wc -l < "$TEMPORARY/recovery/daemon-pids" | tr -d ' ')" = 2 ]
/bin/kill -0 "$$"
printf 'PASS: real state reads initialize Node; paused entries stay paused; healthy watchers are reused, dead watchers recover, and foreign PIDs are preserved.\n'
printf 'PASS: three cold-start fixtures launch once each; repeated, paused, disabled and failed launches never close/reopen official Codex.\n'
printf 'PASS: native handoffs request one graceful quit/relaunch each; paused, stale, invalid-payload and declined-quit cases leave the official app alone.\n'
