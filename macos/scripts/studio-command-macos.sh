#!/bin/bash

set -euo pipefail
. "$(cd "$(dirname "$0")" && pwd -P)/common-macos.sh"
EMBEDDED="false"
if [ "${1:-}" = --embedded ]; then EMBEDDED="true"; shift; fi
discover_codex_app
require_macos_runtime
ensure_state_root
runtime_matches() {
  local file relative
  [ -s "$INSTALL_ROOT/scripts/background-studio.mjs" ] || return 1
  if [ -f "$INSTALL_ROOT/VERSION" ] && [ -f "$PROJECT_ROOT/VERSION" ] &&
    ! /usr/bin/cmp -s "$INSTALL_ROOT/VERSION" "$PROJECT_ROOT/VERSION" &&
    "$NODE" -e '
      const fs = require("node:fs");
      const versions = process.argv.slice(1).map(file => fs.readFileSync(file, "utf8").trim());
      if (!versions.every(version => /^\d+\.\d+\.\d+$/.test(version))) process.exit(1);
      const [installed, source] = versions.map(version => version.split(".").map(BigInt));
      const difference = installed.findIndex((part, i) => part !== source[i]);
      process.exit(difference >= 0 && installed[difference] > source[difference] ? 0 : 1);
    ' "$INSTALL_ROOT/VERSION" "$PROJECT_ROOT/VERSION"; then
    return 0
  fi
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
  install_args=(--no-launchers --no-launch)
  [ "$EMBEDDED" != "true" ] || install_args+=(--prepare-only)
  "$SCRIPT_DIR/install-dream-skin-macos.sh" "${install_args[@]}" >&2
fi
if [ "${1:-}" = status ] && { [ -e "$THEME_DIR/.studio-transaction.json" ] || [ -L "$THEME_DIR/.studio-transaction.json" ]; }; then
  if recovery_output="$("$NODE" "$INSTALL_ROOT/scripts/background-studio.mjs" recover)"; then :
  else
    recovery_code=$?
    if [ "$recovery_code" -ne 75 ]; then printf '%s\n' "$recovery_output"; exit "$recovery_code"; fi
  fi
fi
if [ "$EMBEDDED" = "true" ]; then
  exec "$NODE" "$INSTALL_ROOT/scripts/background-studio.mjs" --embedded "$@"
fi
exec "$NODE" "$INSTALL_ROOT/scripts/background-studio.mjs" "$@"
