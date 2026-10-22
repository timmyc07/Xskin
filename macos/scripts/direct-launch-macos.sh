#!/bin/bash
set -euo pipefail
. "$(cd "$(dirname "$0")" && pwd -P)/common-macos.sh"
ensure_state_root
if [ "$#" -eq 0 ]; then
  [ ! -L "$STATE_ROOT/direct-launch.lock" ] || fail "The launcher lock must be an ordinary file."
  exec /usr/bin/lockf -ks -t 60 "$STATE_ROOT/direct-launch.lock" /bin/bash "$0" --locked
fi
[ "$#" -eq 1 ] && [ "$1" = --locked ] || fail "Unknown direct-launch argument."
discover_codex_app
if [ ! -f "$STATE_ROOT/shortcut-enabled" ] || { [ -f "$STATE_PATH" ] && [ "$(state_field session)" = paused ]; }; then
  if codex_is_running; then activate_codex; else launch_codex_normally; fi
  exit 0
fi
if codex_is_running; then
  port="$(state_field port)" || fail "The saved Xskin connection is unavailable. Fully quit Codex and retry Codex (Xskin)."
  verified_cdp_endpoint "$port" || fail "Fully quit Codex, then open Codex (Xskin). Your app was left running."
  activate_codex
  exit 0
fi
exec "$SCRIPT_DIR/start-dream-skin-macos.sh" --direct-launch
