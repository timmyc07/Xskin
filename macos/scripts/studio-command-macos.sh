#!/bin/bash

set -euo pipefail
. "$(cd "$(dirname "$0")" && pwd -P)/common-macos.sh"
discover_codex_app
require_macos_runtime
ensure_state_root
if [ "$PROJECT_ROOT" != "$INSTALL_ROOT" ] && { [ ! -s "$INSTALL_ROOT/scripts/background-studio.mjs" ] || ! /usr/bin/cmp -s "$PROJECT_ROOT/VERSION" "$INSTALL_ROOT/VERSION"; }; then
  "$SCRIPT_DIR/install-dream-skin-macos.sh" --no-launchers --no-launch >&2
fi
exec "$NODE" "$INSTALL_ROOT/scripts/background-studio.mjs" "$@"
