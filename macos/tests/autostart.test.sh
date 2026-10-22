#!/bin/bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd -P)"
. "$ROOT/scripts/autostart-dream-skin-macos.sh"
TEMPORARY="$(/usr/bin/mktemp -d /tmp/xskin-shortcut-test.XXXXXX)"
trap '/bin/rm -rf "$TEMPORARY"' EXIT
STATE_ROOT="$TEMPORARY/state 中文 🌙"
INSTALL_ROOT="$TEMPORARY/runtime"
PROJECT_ROOT="$INSTALL_ROOT"
SCRIPT_DIR="$INSTALL_ROOT/scripts"
AUTOSTART_AGENT_PATH="$TEMPORARY/legacy.plist"
mkdir -p "$STATE_ROOT" "$SCRIPT_DIR"
function /bin/launchctl() {
  case "$1" in
    bootout) rm -f "$TEMPORARY/loaded" ;;
    bootstrap) [ ! -f "$TEMPORARY/fail-bootstrap" ] && touch "$TEMPORARY/loaded" ;;
    print) [ -f "$TEMPORARY/loaded" ] ;;
  esac
}
cat > "$AUTOSTART_AGENT_PATH" <<PLIST
<?xml version="1.0" encoding="UTF-8"?><plist version="1.0"><dict>
<key>Label</key><string>$AUTOSTART_JOB_LABEL</string>
<key>ProgramArguments</key><array><string>/bin/bash</string><string>$INSTALL_ROOT/scripts/autostart-dream-skin-macos.sh</string><string>watch</string></array>
</dict></plist>
PLIST
check_autostart_agent
/usr/bin/plutil -insert ProgramArguments.3 -string foreign "$AUTOSTART_AGENT_PATH"
if (check_autostart_agent >/dev/null 2>&1); then exit 1; fi
/usr/bin/plutil -remove ProgramArguments.3 "$AUTOSTART_AGENT_PATH"
disable_autostart
[ ! -e "$AUTOSTART_AGENT_PATH" ]
cat > "$AUTOSTART_AGENT_PATH" <<PLIST
<?xml version="1.0" encoding="UTF-8"?><plist version="1.0"><dict><key>Label</key><string>$AUTOSTART_JOB_LABEL</string><key>ProgramArguments</key><array><string>/unrelated</string></array></dict></plist>
PLIST
if (check_autostart_agent >/dev/null 2>&1); then exit 1; fi
[ -f "$AUTOSTART_AGENT_PATH" ]
rm "$AUTOSTART_AGENT_PATH"
discover_codex_app() { :; }
require_macos_runtime() { :; }
ensure_state_root() { :; }
NODE="${NODE:-/Applications/ChatGPT.app/Contents/Resources/cua_node/bin/node}"
INJECTOR="$ROOT/scripts/injector.mjs"
THEME_DIR="$ROOT/assets"
cat > "$SCRIPT_DIR/setup-direct-launch.sh" <<'SETUP'
#!/bin/bash
[ "$1" = --install ]
SETUP
chmod +x "$SCRIPT_DIR/setup-direct-launch.sh"
printf 'language=zh-Hant\nmask=0.42\n' > "$STATE_ROOT/preferences"
enable_autostart >/dev/null
[ -f "$STATE_ROOT/shortcut-enabled" ]
[ "$(cat "$STATE_ROOT/preferences")" = $'language=zh-Hant\nmask=0.42' ]
[ -f "$AUTOSTART_AGENT_PATH" ] && [ -f "$TEMPORARY/loaded" ]
check_autostart_agent
[ "$(/usr/bin/plutil -extract WorkingDirectory raw -o - "$AUTOSTART_AGENT_PATH")" = "$STATE_ROOT" ]
disable_autostart
[ ! -f "$AUTOSTART_AGENT_PATH" ] && [ ! -f "$TEMPORARY/loaded" ]
[ -f "$STATE_ROOT/shortcut-enabled" ]
touch "$TEMPORARY/fail-bootstrap"
if (enable_autostart >/dev/null 2>&1); then exit 1; fi
[ -f "$AUTOSTART_AGENT_PATH" ] && [ -f "$STATE_ROOT/shortcut-enabled" ]
rm "$TEMPORARY/fail-bootstrap"

(
  . "$ROOT/scripts/common-macos.sh"
  CODEX_EXE=/fixture/Official
  FIXTURE_EXE="$CODEX_EXE"
  FIXTURE_PID=321
  FIXTURE_AGE=00:02
  process_started_at() { printf FixtureStart; }
  codex_main_pids() { printf '%s' "$FIXTURE_PID"; }
  function /bin/ps() { case "$4" in comm=) printf '%s' "$FIXTURE_EXE" ;; etime=) printf '%s' "$FIXTURE_AGE" ;; esac; }
  new_codex_launch_matches 321 FixtureStart
  if new_codex_launch_matches 321 WrongStart; then exit 1; fi
  if new_codex_launch_matches invalid FixtureStart; then exit 1; fi
  FIXTURE_AGE=00:15
  if new_codex_launch_matches 321 FixtureStart; then exit 1; fi
  FIXTURE_AGE=00:02
  FIXTURE_EXE=/foreign/Official
  if new_codex_launch_matches 321 FixtureStart; then exit 1; fi
  FIXTURE_EXE="$CODEX_EXE"
  FIXTURE_PID=$'321\n322'
  if new_codex_launch_matches 321 FixtureStart; then exit 1; fi
)

# Only launch events for fresh, ordinary processes may trigger a handoff.
CURRENT_PID=101
AUTOSTART_PREVIOUS_PID=101
STATE_PATH="$STATE_ROOT/state.json"
process_started_at() { printf FixtureStart; }
new_codex_launch_matches() { [ "$1" = "$CURRENT_PID" ] && [ "$2" = FixtureStart ] && [ ! -f "$TEMPORARY/stale" ]; }
codex_main_pids() { printf '%s' "$CURRENT_PID"; }
function /bin/ps() { if [ -f "$TEMPORARY/debug" ]; then printf 'fixture --remote-debugging-port=9341\n'; else printf 'fixture\n'; fi; }
state_field() { case "$1" in session) cat "$STATE_PATH" ;; codexPid) printf 999 ;; esac; }
stop_recorded_injector() { printf 'stop-injector\n' >> "$TEMPORARY/events"; }
apply_new_launch() {
  printf 'handoff:%s\n' "$1" >> "$TEMPORARY/events"
  CURRENT_PID=$((CURRENT_PID + 1))
  [ ! -f "$TEMPORARY/fail-apply" ]
}
autostart_step launch 101
autostart_step launch 999
[ ! -e "$TEMPORARY/events" ]
CURRENT_PID=102
touch "$TEMPORARY/stale"
autostart_step launch 102
rm "$TEMPORARY/stale"
CURRENT_PID=103
touch "$TEMPORARY/debug"
autostart_step launch 103
rm "$TEMPORARY/debug"
CURRENT_PID=104
printf paused > "$STATE_PATH"
autostart_step launch 104
rm "$STATE_PATH"
[ ! -e "$TEMPORARY/events" ]
for pid in 110 120 130; do
  CURRENT_PID="$pid"
  autostart_step launch "$pid"
  autostart_step launch "$pid"
  autostart_step launch "$CURRENT_PID"
done
[ "$(cat "$TEMPORARY/events")" = $'handoff:110\nhandoff:120\nhandoff:130' ]
CURRENT_PID=140
touch "$TEMPORARY/fail-apply"
autostart_step launch 140 2>/dev/null
autostart_step launch "$CURRENT_PID"
rm "$TEMPORARY/fail-apply"
[ "$(tail -n 1 "$TEMPORARY/events")" = handoff:140 ]
printf active > "$STATE_PATH"
autostart_step terminate 998
[ "$(tail -n 1 "$TEMPORARY/events")" = handoff:140 ]
autostart_step terminate 999
[ "$(tail -n 1 "$TEMPORARY/events")" = stop-injector ]
rm "$STATE_ROOT/shortcut-enabled"
CURRENT_PID=150
autostart_step launch 150
[ "$(tail -n 1 "$TEMPORARY/events")" = stop-injector ]
printf 'PASS: native launch service preserves preferences, rejects foreign agents, skips existing/paused/debug/stale sessions, and hands off each user launch at most once without a relaunch loop.\n'
