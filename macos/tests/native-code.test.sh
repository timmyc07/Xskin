#!/bin/bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd -P)"
TEMPORARY="$(/usr/bin/mktemp -d /tmp/xskin-native-tests.XXXXXX)"
trap '/bin/rm -rf "$TEMPORARY"' EXIT
/usr/bin/xcrun swiftc -parse-as-library -swift-version 5 -D LOCALIZATION_SELF_CHECK \
  "$ROOT/native/Localization.swift" -o "$TEMPORARY/localization-check"
"$TEMPORARY/localization-check"
/usr/bin/xcrun swiftc -parse-as-library -swift-version 5 -framework AppKit \
  "$ROOT/native/DirectLauncher.swift" "$ROOT/native/Localization.swift" -o "$TEMPORARY/launcher-check"
"$TEMPORARY/launcher-check" --self-check
/bin/mkdir -p "$TEMPORARY/scripts"
/bin/cp "$ROOT/scripts/direct-launch-macos.sh" "$TEMPORARY/scripts/"
/bin/cat > "$TEMPORARY/scripts/common-macos.sh" <<'SH'
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
AUTOSTART_AGENT_PATH="$SCRIPT_DIR/enabled"
discover_codex_app() { :; }
codex_is_running() { [ -f "$SCRIPT_DIR/running" ]; }
activate_codex() { printf 'activate\n'; }
launch_codex_normally() { printf 'normal\n'; }
SH
/bin/cat > "$TEMPORARY/scripts/start-dream-skin-macos.sh" <<'SH'
#!/bin/bash
printf '%s\n' "$*"
SH
/bin/chmod +x "$TEMPORARY/scripts/start-dream-skin-macos.sh"
[ "$(/bin/bash "$TEMPORARY/scripts/direct-launch-macos.sh")" = normal ]
: > "$TEMPORARY/scripts/enabled"
[ "$(/bin/bash "$TEMPORARY/scripts/direct-launch-macos.sh")" = --direct-launch ]
: > "$TEMPORARY/scripts/running"
[ "$(/bin/bash "$TEMPORARY/scripts/direct-launch-macos.sh")" = activate ]
printf 'PASS: direct launch activates an existing app, respects disabled startup, and prepares one new instance.\n'

# A successful LaunchServices request can precede PID visibility.
/usr/bin/env HOME="$TEMPORARY" /bin/bash -c '
  set -euo pipefail
  . "$1/scripts/common-macos.sh"
  APP_LOG="$2/single.log"
  APP_ERROR_LOG="$2/single-error.log"
  CODEX_BUNDLE=/fixture/Official.app
  release_codex_launchd_job() { :; }
  function /usr/bin/open() { printf "%s\n" "$*" >> "$OPEN_CALLS"; }
  codex_is_running() { : > "$PID_PROBE"; return 1; }
  OPEN_CALLS="$2/single-open-calls"
  PID_PROBE="$2/single-pid-probe"
  launch_codex_with_cdp 19341
  [ ! -e "$PID_PROBE" ]
  [ "$(/usr/bin/wc -l < "$OPEN_CALLS" | /usr/bin/tr -d " ")" = 1 ]
  /usr/bin/grep -F -q -- "-na /fixture/Official.app --args" "$OPEN_CALLS"
' _ "$ROOT" "$TEMPORARY"

# Execute the real start script with local stubs and fail before any app launch.
/bin/cp "$ROOT/scripts/start-dream-skin-macos.sh" "$TEMPORARY/scripts/"
/bin/cat > "$TEMPORARY/scripts/common-macos.sh" <<'SH'
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
STATE_ROOT="$SCRIPT_DIR/state"
STATE_PATH="$STATE_ROOT/state.json"
START_ERROR_LOG="$STATE_ROOT/start-error.log"
discover_codex_app() { CODEX_BUNDLE=/fixture/Official.app; }
require_macos_runtime() { [ ! -e "$SCRIPT_DIR/signature-invalid" ]; }
ensure_state_root() { /bin/mkdir -p "$STATE_ROOT"; }
state_field() { return 1; }
fail() { printf '%s\n' "$*" >&2; exit 1; }
function /usr/bin/open() { printf '%s\n' "$*" >> "$SCRIPT_DIR/fallback-open-calls"; }
SH
/bin/mkdir -p "$TEMPORARY/scripts/state"
: > "$TEMPORARY/scripts/state/state.json"
if /bin/bash "$TEMPORARY/scripts/start-dream-skin-macos.sh" --direct-launch >/dev/null 2>&1; then exit 1; fi
[ "$(/bin/cat "$TEMPORARY/scripts/fallback-open-calls")" = '-a /fixture/Official.app' ]
/bin/rm "$TEMPORARY/scripts/fallback-open-calls"
: > "$TEMPORARY/scripts/signature-invalid"
if /bin/bash "$TEMPORARY/scripts/start-dream-skin-macos.sh" --direct-launch >/dev/null 2>&1; then exit 1; fi
[ ! -e "$TEMPORARY/scripts/fallback-open-calls" ]
/bin/rm "$TEMPORARY/scripts/signature-invalid"
if /bin/bash "$TEMPORARY/scripts/start-dream-skin-macos.sh" >/dev/null 2>&1; then exit 1; fi
[ ! -e "$TEMPORARY/scripts/fallback-open-calls" ]
printf 'PASS: one launch tolerates delayed PID discovery; only verified direct-launch failures activate the official app.\n'

! /usr/bin/grep -F '/usr/bin/open -na' "$ROOT/scripts/start-dream-skin-macos.sh" >/dev/null
