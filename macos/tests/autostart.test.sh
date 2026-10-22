#!/bin/bash
set -euo pipefail
. "$(cd "$(dirname "$0")/../scripts" && pwd -P)/autostart-dream-skin-macos.sh"

# Exercise the actual identity gate without opening or closing an application.
(
  CODEX_EXE=/fixture/Official.app/Contents/MacOS/Official
  fixture_pids=100
  fixture_path="$CODEX_EXE"
  fixture_age=00:03
  fixture_start=FixtureStart
  codex_main_pids() { printf '%s\n' "$fixture_pids"; }
  process_started_at() { printf '%s\n' "$fixture_start"; }
  function /bin/ps() {
    case "$4" in comm=) printf '%s\n' "$fixture_path" ;; etime=) printf '%s\n' "$fixture_age" ;; *) return 1 ;; esac
  }
  new_codex_launch_matches 100 FixtureStart
  ! new_codex_launch_matches invalid FixtureStart
  ! new_codex_launch_matches 100 ''
  ! new_codex_launch_matches 100 ReusedPID
  fixture_age=00:15
  ! new_codex_launch_matches 100 FixtureStart
  fixture_age=00:03
  fixture_pids=$'100\n101'
  ! new_codex_launch_matches 100 FixtureStart
  fixture_pids=100
  fixture_path=/fixture/Unrelated
  ! new_codex_launch_matches 100 FixtureStart
)

stops=0
handoffs=0
current_pid=100
can_handoff=true
handoff_fails=false
stop_recorded_injector() { stops=$((stops + 1)); }
stop_codex() { printf 'Unexpected direct quit from watcher\n' >&2; exit 1; }
launch_codex_normally() { printf 'Unexpected reopen after user quit\n' >&2; exit 1; }
process_started_at() { printf 'FixtureStart\n'; }
new_codex_launch_matches() { [ "$can_handoff" = true ]; }
codex_main_pids() { [ -z "$current_pid" ] || printf '%s\n' "$current_pid"; }
apply_new_launch() {
  [ "$1" = "$current_pid" ] && [ "$2" = FixtureStart ]
  handoffs=$((handoffs + 1))
  [ "$handoff_fails" != true ] || return 1
  current_pid=$((current_pid + 1))
}
AUTOSTART_PREVIOUS_PID=100
AUTOSTART_LAST_HANDOFF=-30
autostart_step 100 '/fixture/Official'
[ "$handoffs" -eq 0 ]
autostart_step '' ''
[ "$stops" -eq 1 ] && [ "$handoffs" -eq 0 ]
autostart_step 101 '/fixture/Official --remote-debugging-port=9341'
[ "$handoffs" -eq 0 ]
current_pid=200
can_handoff=false
autostart_step 200 '/fixture/Official'
[ "$handoffs" -eq 0 ]
can_handoff=true
autostart_step 200 '/fixture/Official'
[ "$handoffs" -eq 1 ] && [ "$AUTOSTART_PREVIOUS_PID" = 201 ]
autostart_step 201 '/fixture/Official --remote-debugging-port=9341'
[ "$handoffs" -eq 1 ]
current_pid=202
autostart_step 202 '/fixture/Official' 2>/dev/null
[ "$handoffs" -eq 1 ]
AUTOSTART_LAST_HANDOFF=$((SECONDS - 30))
can_handoff=false
current_pid=300
autostart_step 300 '/fixture/Official'
[ "$handoffs" -eq 1 ]
can_handoff=true
handoff_fails=true
current_pid=400
autostart_step 400 '/fixture/Official' 2>/dev/null
autostart_step 400 '/fixture/Official'
[ "$handoffs" -eq 2 ]
current_pid=''
autostart_step '' ''
[ "$stops" -eq 2 ] && [ "$handoffs" -eq 2 ]
printf 'PASS: automatic apply handles only fresh official launches, skips existing/debug sessions, rejects PID reuse, and prevents restart loops.\n'

TEMPORARY="$(/usr/bin/mktemp -d /tmp/xskin-events-test.XXXXXX)"
trap '/bin/rm -rf "$TEMPORARY"' EXIT
(
  PROJECT_ROOT="$TEMPORARY"
  /bin/mkdir -p "$PROJECT_ROOT/bin"
  /bin/cat > "$PROJECT_ROOT/bin/CodexLauncher" <<'SH'
#!/bin/bash
[ "$1" = --watch-launches ] && [ "$2" = /fixture/Official.app ] || exit 1
printf 'launch 200\nterminate 200\n'
SH
  /bin/chmod +x "$PROJECT_ROOT/bin/CodexLauncher"
  CODEX_BUNDLE=/fixture/Official.app
  discover_codex_app() { :; }
  require_macos_runtime() { :; }
  ensure_state_root() { :; }
  printf 0 > "$TEMPORARY/read-count"
  codex_main_pids() {
    local count="$(/bin/cat "$TEMPORARY/read-count")"
    printf '%s' "$((count + 1))" > "$TEMPORARY/read-count"
    case "$count" in 0) printf 100 ;; 1) printf 200 ;; esac
  }
  function /bin/ps() { printf '/fixture/Official'; }
  autostart_step() { printf '%s|%s\n' "$1" "$2" >> "$TEMPORARY/events"; }
  if (watch_normal_launches >/dev/null 2>&1); then exit 1; fi
  [ "$(/bin/cat "$TEMPORARY/events")" = $'200|/fixture/Official\n|' ]
)
printf 'PASS: native launch and termination notifications drive startup without a polling delay; a stopped observer fails visibly.\n'
