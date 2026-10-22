#!/bin/bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd -P)"
TEMPORARY="$(/usr/bin/mktemp -d /tmp/xskin-upgrade-tests.XXXXXX)"
trap '/bin/rm -rf "$TEMPORARY"' EXIT
/usr/bin/sed -n '/^deploy_project()/,/^}/p' "$ROOT/scripts/install-dream-skin-macos.sh" > "$TEMPORARY/deploy.sh"
cat > "$TEMPORARY/fixture.sh" <<'FIXTURE'
#!/bin/bash
set -euo pipefail
. "$1/deploy.sh"
fixture="$1/$2"
PROJECT_ROOT="$fixture/source"
INSTALL_ROOT="$fixture/installed"
STATE_ROOT="$fixture/state"
STATE_PATH="$STATE_ROOT/state.json"
THEME_DIR="$STATE_ROOT/theme"
AUTOSTART_AGENT_PATH="$fixture/startup.plist"
AUTOSTART_JOB_LABEL=fixture
PORT=19341
CREATE_LAUNCHERS=false
LAUNCH_AFTER_INSTALL=false
NODE=/usr/bin/true
export fixture
mkdir -p "$PROJECT_ROOT/scripts" "$INSTALL_ROOT/scripts" "$THEME_DIR"
printf old > "$INSTALL_ROOT/version"
printf new > "$PROJECT_ROOT/version"
cat > "$PROJECT_ROOT/scripts/install-dream-skin-macos.sh" <<'INSTALL'
#!/bin/bash
printf 'install\n' >> "$fixture/events"
[ ! -e "$fixture/fail-install" ]
INSTALL
for directory in "$PROJECT_ROOT" "$INSTALL_ROOT"; do
  cat > "$directory/scripts/start-dream-skin-macos.sh" <<'START'
#!/bin/bash
printf 'resume:%s\n' "$(cat "$(dirname "$0")/../version")" >> "$fixture/events"
START
  cat > "$directory/scripts/autostart-dream-skin-macos.sh" <<'AUTO'
#!/bin/bash
printf 'startup:%s\n' "$(cat "$(dirname "$0")/../version")" >> "$fixture/events"
AUTO
  chmod +x "$directory/scripts/"*.sh
 done
cat > "$PROJECT_ROOT/scripts/injector.mjs" <<'JS'
// Fixture payload validation is stubbed by NODE.
JS
printf '{}' > "$THEME_DIR/theme.json"
printf original > "$fixture/preferences"
case "$2" in
  active|rollback|unknown) : > "$STATE_PATH"; : > "$AUTOSTART_AGENT_PATH" ;;
  paused) : > "$STATE_PATH" ;;
esac
[ "$2" != rollback ] || : > "$fixture/fail-install"
discover_codex_app() { :; }
require_macos_runtime() { :; }
ensure_state_root() { :; }
state_field() { case "$1" in port) printf 19341 ;; session) if [ -e "$fixture/paused" ]; then printf paused; else printf active; fi ;; esac; }
[ "$2" != paused ] || : > "$fixture/paused"
verified_cdp_endpoint() { [ "$1" = 19341 ]; }
stop_recorded_injector() { printf 'stop\n' >> "$fixture/events"; case "$fixture" in */unknown) return 1 ;; esac; }
function /bin/launchctl() { case "$1" in bootout) printf 'bootout\n' >> "$fixture/events" ;; print) return 1 ;; esac; }
fail() { printf '%s\n' "$*" >&2; exit 1; }
deploy_project
FIXTURE
for mode in fresh active paused; do
  /bin/bash "$TEMPORARY/fixture.sh" "$TEMPORARY" "$mode"
  [ "$(cat "$TEMPORARY/$mode/installed/version")" = new ]
  [ "$(cat "$TEMPORARY/$mode/preferences")" = original ]
done
/usr/bin/grep -Fxq resume:new "$TEMPORARY/active/events"
! /usr/bin/grep -q resume: "$TEMPORARY/paused/events"
! /usr/bin/grep -q resume: "$TEMPORARY/fresh/events"
[ -f "$TEMPORARY/active/startup.plist" ]
if /bin/bash "$TEMPORARY/fixture.sh" "$TEMPORARY" rollback >/dev/null 2>&1; then exit 1; fi
[ "$(cat "$TEMPORARY/rollback/installed/version")" = old ]
/usr/bin/grep -Fxq resume:old "$TEMPORARY/rollback/events"
/usr/bin/grep -Fxq startup:old "$TEMPORARY/rollback/events"
if /bin/bash "$TEMPORARY/fixture.sh" "$TEMPORARY" unknown >/dev/null 2>&1; then exit 1; fi
[ "$(cat "$TEMPORARY/unknown/installed/version")" = old ]
! /usr/bin/grep -q install "$TEMPORARY/unknown/events"
printf 'PASS: upgrades resume active watchers, retain paused preferences, roll back failed installs, and preserve unknown-process runtimes.\n'
