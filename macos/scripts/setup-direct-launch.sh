#!/bin/bash
set -euo pipefail
. "$(cd "$(dirname "$0")" && pwd -P)/common-macos.sh"
[ "$#" -le 1 ] || fail "Use setup-direct-launch.sh [--link-dock|--unlink-dock]"
ACTION="${1:---install}"
case "$ACTION" in --install|--link-dock|--unlink-dock) ;; *) fail "Unknown direct-launch action." ;; esac
discover_codex_app
require_macos_runtime
[ "$PROJECT_ROOT" = "$INSTALL_ROOT" ] || fail "Configure direct launch from the installed runtime."
LAUNCHER="$PROJECT_ROOT/bin/CodexLauncher"
[ -x "$LAUNCHER" ] || fail "The direct-launch helper is missing. Reinstall Xskin."
if [ "$ACTION" != "--unlink-dock" ]; then "$LAUNCHER" --install "$CODEX_BUNDLE"; fi
if [ "$ACTION" = "--link-dock" ]; then "$LAUNCHER" --link-dock "$CODEX_BUNDLE"; fi
if [ "$ACTION" = "--unlink-dock" ]; then "$LAUNCHER" --unlink-dock; fi
