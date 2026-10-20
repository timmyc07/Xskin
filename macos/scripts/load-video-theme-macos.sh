#!/bin/bash
set -euo pipefail
. "$(cd "$(dirname "$0")" && pwd -P)/common-macos.sh"

VIDEO=""
THEME_NAME="My Codex Dream Skin"
APPLY_NOW="true"
while [ "$#" -gt 0 ]; do
  case "$1" in
    --file) VIDEO="${2:?Missing video path}"; shift 2 ;;
    --name) THEME_NAME="${2:?Missing theme name}"; shift 2 ;;
    --no-apply) APPLY_NOW="false"; shift ;;
    *) fail "Unknown video argument: $1" ;;
  esac
done
discover_codex_app
require_macos_runtime
ensure_state_root
if [ -z "$VIDEO" ]; then
  VIDEO="$(/usr/bin/osascript -e 'POSIX path of (choose file with prompt "選擇 MP4 背景影片（最多 256 MiB）" of type {"public.mpeg-4"})')" \
    || fail "Video selection was cancelled."
fi
"$NODE" "$SCRIPT_DIR/prepare-video-theme.mjs" "$VIDEO" "$THEME_DIR" "$THEME_NAME"
if [ "$APPLY_NOW" = "true" ]; then
  "$SCRIPT_DIR/start-dream-skin-macos.sh" --prompt-restart
fi
