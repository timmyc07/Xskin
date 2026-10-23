#!/bin/bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd -P)"
TEMPORARY="$(/usr/bin/mktemp -d /tmp/xskin-upgrade-tests.XXXXXX)"
trap '/bin/rm -rf "$TEMPORARY"' EXIT
/usr/bin/sed -n '/^shell_quote()/,/^}/p' "$ROOT/scripts/install-dream-skin-macos.sh" > "$TEMPORARY/quote.sh"
/usr/bin/sed -n '/^owned_desktop_launcher()/,/^}/p' "$ROOT/scripts/common-macos.sh" >> "$TEMPORARY/quote.sh"
/usr/bin/sed -n '/^write_launcher()/,/^}/p' "$ROOT/scripts/install-dream-skin-macos.sh" >> "$TEMPORARY/quote.sh"
. "$TEMPORARY/quote.sh"
fail() { printf '%s\n' "$*" >&2; exit 1; }
quoted_directory="$TEMPORARY/中文 🌙 \$HOME \`printf altered\` \"引號\" '單引號'"
INSTALL_ROOT="$quoted_directory/runtime"
mkdir -p "$INSTALL_ROOT/scripts"
cat > "$INSTALL_ROOT/scripts/direct-launch-macos.sh" <<'LAUNCH'
#!/bin/bash
printf '%s' "$(dirname "$0")"
LAUNCH
chmod +x "$INSTALL_ROOT/scripts/direct-launch-macos.sh"
launcher_command="exec $(shell_quote "$INSTALL_ROOT/scripts/direct-launch-macos.sh")"
write_launcher "$TEMPORARY/desktop.command" "$launcher_command"
[ "$(/bin/bash "$TEMPORARY/desktop.command")" = "$INSTALL_ROOT/scripts" ]
owned_desktop_launcher "$TEMPORARY/desktop.command"
write_launcher "$TEMPORARY/desktop.command" "$launcher_command"
printf '# CodexDreamSkinStudio launcher\nexec /foreign/start.sh\n' > "$TEMPORARY/foreign.command"
ln -s "$TEMPORARY/desktop.command" "$TEMPORARY/symlink.command"
ln -s "$TEMPORARY/missing" "$TEMPORARY/dangling.command"
mkdir "$TEMPORARY/directory.command"
for foreign in foreign symlink dangling directory; do
  if (write_launcher "$TEMPORARY/$foreign.command" "$launcher_command" >/dev/null 2>&1); then exit 1; fi
  [ -e "$TEMPORARY/$foreign.command" ] || [ -L "$TEMPORARY/$foreign.command" ]
done
[ "$(cat "$TEMPORARY/foreign.command")" = $'# CodexDreamSkinStudio launcher\nexec /foreign/start.sh' ]
[ "$(/bin/bash "$TEMPORARY/desktop.command")" = "$INSTALL_ROOT/scripts" ]
printf 'PASS: Desktop launchers preserve literal Unicode/quoted paths and share install/uninstall ownership checks that reject foreign files and symlinks.\n'
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
if [ -f "$fixture/new-agent" ]; then : > "$fixture/startup.plist"; fi
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
printf 'check_autostart_agent() { :; }\n' > "$PROJECT_ROOT/scripts/autostart-dream-skin-macos.sh"
chmod +x "$PROJECT_ROOT/scripts/autostart-dream-skin-macos.sh"
case "$2" in
  active|rollback|unknown) : > "$STATE_PATH"; : > "$AUTOSTART_AGENT_PATH" ;;
  paused) : > "$STATE_PATH" ;;
  rollback-shortcut) : > "$STATE_ROOT/shortcut-enabled"; : > "$fixture/new-agent" ;;
esac
case "$2" in rollback*) : > "$fixture/fail-install" ;; esac
discover_codex_app() { :; }
require_macos_runtime() { :; }
ensure_state_root() { :; }
check_autostart_agent() { :; }
SCRIPT_DIR="$PROJECT_ROOT/scripts"
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
if /bin/bash "$TEMPORARY/fixture.sh" "$TEMPORARY" rollback-shortcut >/dev/null 2>&1; then exit 1; fi
[ "$(cat "$TEMPORARY/rollback-shortcut/installed/version")" = old ]
/usr/bin/grep -Fxq bootout "$TEMPORARY/rollback-shortcut/events"
/usr/bin/grep -Fxq startup:old "$TEMPORARY/rollback-shortcut/events"
if /bin/bash "$TEMPORARY/fixture.sh" "$TEMPORARY" unknown >/dev/null 2>&1; then exit 1; fi
[ "$(cat "$TEMPORARY/unknown/installed/version")" = old ]
! /usr/bin/grep -q install "$TEMPORARY/unknown/events"
printf 'PASS: upgrades resume active watchers, retain paused preferences, roll back failed installs, and preserve unknown-process runtimes.\n'
