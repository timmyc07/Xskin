#!/bin/bash
set -euo pipefail
. "$(cd "$(dirname "$0")" && pwd -P)/common-macos.sh"
discover_codex_app
if codex_is_running; then
  activate_codex
  exit 0
fi
if [ ! -f "$AUTOSTART_AGENT_PATH" ]; then
  launch_codex_normally
  exit 0
fi
exec "$SCRIPT_DIR/start-dream-skin-macos.sh" --direct-launch
