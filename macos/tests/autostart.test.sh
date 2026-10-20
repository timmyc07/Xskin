#!/bin/bash

set -euo pipefail
. "$(cd "$(dirname "$0")/../scripts" && pwd -P)/autostart-dream-skin-macos.sh"

calls=""
stops=0
normal_launches=0
next_pid=""
apply_new_launch() { calls="$calls $1"; }
stop_recorded_injector() { stops=$((stops + 1)); }
codex_main_pids() { printf '%s' "$next_pid"; }
codex_is_running() { return 1; }
launch_codex_normally() { normal_launches=$((normal_launches + 1)); }

AUTOSTART_PREVIOUS_PID=100
AUTOSTART_LAST_HANDOFF=-30
autostart_step 100 '/Applications/ChatGPT.app/Contents/MacOS/ChatGPT'
[ -z "$calls" ]
autostart_step '' ''
[ "$stops" -eq 1 ] && [ "$normal_launches" -eq 0 ]
autostart_step 101 'ChatGPT --remote-debugging-port=9341'
[ -z "$calls" ]

next_pid=203
autostart_step 202 '/Applications/ChatGPT.app/Contents/MacOS/ChatGPT'
[ "$calls" = ' 202' ] && [ "$AUTOSTART_PREVIOUS_PID" = 203 ]
autostart_step 203 'ChatGPT --remote-debugging-port=9341'
[ "$calls" = ' 202' ]
autostart_step 204 '/Applications/ChatGPT.app/Contents/MacOS/ChatGPT' 2>/dev/null
[ "$calls" = ' 202' ]

AUTOSTART_LAST_HANDOFF=$((SECONDS - 31))
next_pid=302
apply_new_launch() { calls="$calls $1"; return 1; }
autostart_step 301 '/Applications/ChatGPT.app/Contents/MacOS/ChatGPT' 2>/dev/null
[ "$calls" = ' 202 301' ] && [ "$normal_launches" -eq 1 ]
autostart_step 302 '/Applications/ChatGPT.app/Contents/MacOS/ChatGPT'
[ "$calls" = ' 202 301' ]
autostart_step '' ''
[ "$normal_launches" -eq 1 ]

/bin/sleep 30 &
fixture_pid="$!"
trap '/bin/kill -TERM "$fixture_pid" 2>/dev/null || true' EXIT
CODEX_EXE=/bin/sleep
next_pid="$fixture_pid"
new_codex_launch_matches "$fixture_pid"
! new_codex_launch_matches invalid
! new_codex_launch_matches 0
CODEX_EXE=/not/the/official/executable
! new_codex_launch_matches "$fixture_pid"
/bin/kill -TERM "$fixture_pid"
wait "$fixture_pid" 2>/dev/null || true
trap - EXIT

printf 'PASS: automatic startup ignores open/debug windows, hands off once, limits retries, respects quit, and checks new process identity.\n'
