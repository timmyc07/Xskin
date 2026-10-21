#!/bin/bash
set -euo pipefail
. "$(cd "$(dirname "$0")/../scripts" && pwd -P)/autostart-dream-skin-macos.sh"
stops=0
stop_recorded_injector() { stops=$((stops + 1)); }
stop_codex() { printf 'Unexpected automatic quit\n' >&2; exit 1; }
launch_codex_normally() { printf 'Unexpected automatic relaunch\n' >&2; exit 1; }
AUTOSTART_PREVIOUS_PID=100
autostart_step 100 '/Applications/ChatGPT.app/Contents/MacOS/ChatGPT'
autostart_step '' ''
[ "$stops" -eq 1 ]
autostart_step 101 'ChatGPT --remote-debugging-port=9341'
autostart_step 202 '/Applications/ChatGPT.app/Contents/MacOS/ChatGPT' 2>/dev/null
[ "$AUTOSTART_PREVIOUS_PID" = 202 ]
autostart_step 202 '/Applications/ChatGPT.app/Contents/MacOS/ChatGPT'
autostart_step 203 '/Applications/ChatGPT.app/Contents/MacOS/ChatGPT' 2>/dev/null
[ "$AUTOSTART_PREVIOUS_PID" = 203 ] && [ "$stops" -eq 1 ]
autostart_step '' ''
[ "$stops" -eq 2 ]
! /usr/bin/grep -E 'stop_codex|start-dream-skin|launch_codex_normally|restart-new-launch' "$SCRIPT_DIR/autostart-dream-skin-macos.sh" >/dev/null
printf 'PASS: automatic startup leaves every normal launch running and never quits or relaunches Codex.\n'
