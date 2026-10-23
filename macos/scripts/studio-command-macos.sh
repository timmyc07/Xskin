#!/bin/bash

set -euo pipefail
. "$(cd "$(dirname "$0")" && pwd -P)/common-macos.sh"
discover_codex_app
require_macos_runtime
ensure_state_root
runtime_matches() {
  local file relative
  [ -s "$INSTALL_ROOT/scripts/background-studio.mjs" ] || return 1
  # Compare executable payloads so rebuilt versions update without reading theme media.
  for file in "$PROJECT_ROOT/VERSION" "$PROJECT_ROOT"/scripts/* "$PROJECT_ROOT"/assets/*.css "$PROJECT_ROOT"/assets/*.js "$PROJECT_ROOT"/bin/*; do
    [ -f "$file" ] || continue
    relative="${file#"$PROJECT_ROOT/"}"
    /usr/bin/cmp -s "$file" "$INSTALL_ROOT/$relative" || return 1
  done
  for file in "$INSTALL_ROOT"/scripts/* "$INSTALL_ROOT"/assets/*.css "$INSTALL_ROOT"/assets/*.js "$INSTALL_ROOT"/bin/*; do
    [ -f "$file" ] || continue
    relative="${file#"$INSTALL_ROOT/"}"
    [ -f "$PROJECT_ROOT/$relative" ] || return 1
  done
}
if [ "$PROJECT_ROOT" != "$INSTALL_ROOT" ] && ! runtime_matches; then
  "$SCRIPT_DIR/install-dream-skin-macos.sh" --no-launchers --no-launch >&2
fi
if [ "${1:-}" = status ] && { [ -e "$THEME_DIR/.studio-transaction.json" ] || [ -L "$THEME_DIR/.studio-transaction.json" ]; }; then
  if recovery_output="$("$NODE" "$INSTALL_ROOT/scripts/background-studio.mjs" recover)"; then :
  else
    recovery_code=$?
    if [ "$recovery_code" -ne 75 ]; then printf '%s\n' "$recovery_output"; exit "$recovery_code"; fi
  fi
fi
exec "$NODE" "$INSTALL_ROOT/scripts/background-studio.mjs" "$@"
