#!/bin/bash
set -euo pipefail
. "$(cd "$(dirname "$0")" && pwd -P)/common-macos.sh"
[ "$#" -eq 0 ] || fail "Unknown direct-launch argument."
ensure_state_root
[ ! -L "$STATE_ROOT/direct-launch.lock" ] || fail "The launcher lock must be an ordinary file."
exec /usr/bin/lockf -ks -t 60 "$STATE_ROOT/direct-launch.lock" "$SCRIPT_DIR/start-dream-skin-macos.sh" --direct-launch
