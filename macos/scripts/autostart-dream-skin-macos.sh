#!/bin/bash

set -euo pipefail
. "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)/common-macos.sh"

AUTOSTART_TARGET="gui/$(/usr/bin/id -u)/$AUTOSTART_JOB_LABEL"

check_autostart_agent() {
  [ ! -L "$AUTOSTART_AGENT_PATH" ] || fail "Automatic startup plist must not be a symbolic link."
  [ ! -e "$AUTOSTART_AGENT_PATH" ] || {
    [ "$(/usr/bin/plutil -extract Label raw -o - "$AUTOSTART_AGENT_PATH" 2>/dev/null)" = "$AUTOSTART_JOB_LABEL" ] \
      || fail "Refusing to change an unrelated LaunchAgent."
    [ "$(/usr/bin/plutil -extract ProgramArguments.0 raw -o - "$AUTOSTART_AGENT_PATH" 2>/dev/null)" = /bin/bash ] &&
      [ "$(/usr/bin/plutil -extract ProgramArguments.1 raw -o - "$AUTOSTART_AGENT_PATH" 2>/dev/null)" = "$INSTALL_ROOT/scripts/autostart-dream-skin-macos.sh" ] &&
      [ "$(/usr/bin/plutil -extract ProgramArguments.2 raw -o - "$AUTOSTART_AGENT_PATH" 2>/dev/null)" = watch ] \
      || fail "Refusing to change an unrelated LaunchAgent command."
  }
}

disable_autostart() {
  check_autostart_agent
  if [ -f "$AUTOSTART_AGENT_PATH" ]; then
    if ! /bin/launchctl bootout "$AUTOSTART_TARGET" 2>/dev/null; then
      ! /bin/launchctl print "$AUTOSTART_TARGET" >/dev/null 2>&1 \
        || fail "Could not stop automatic startup; its plist was preserved."
    fi
    local deadline=$((SECONDS + 15))
    while /bin/launchctl print "$AUTOSTART_TARGET" >/dev/null 2>&1; do
      [ "$SECONDS" -lt "$deadline" ] || fail "Automatic startup is still stopping; its plist was preserved."
      /bin/sleep 0.2
    done
    /bin/rm -f "$AUTOSTART_AGENT_PATH"
  fi
  if [ -f "$STATE_ROOT/direct-launch-dock.plist" ]; then
    "$PROJECT_ROOT/bin/CodexLauncher" --unlink-dock
  fi
}

enable_autostart() {
  discover_codex_app
  require_macos_runtime
  ensure_state_root
  [ "$PROJECT_ROOT" = "$INSTALL_ROOT" ] || fail "Configure shortcuts from the installed runtime."
  disable_autostart
  "$SCRIPT_DIR/setup-direct-launch.sh" --install
  /usr/bin/touch "$STATE_ROOT/shortcut-enabled"
  /bin/chmod 600 "$STATE_ROOT/shortcut-enabled"
  printf 'Use Codex (Xskin) in Applications. Xskin can stay closed.\n'
}

if [ "${BASH_SOURCE[0]}" = "$0" ]; then
  [ "$#" -eq 1 ] || fail "Use autostart enable, disable, or status."
  case "$1" in
    enable) enable_autostart ;;
    disable) disable_autostart; /bin/rm -f "$STATE_ROOT/shortcut-enabled"; printf 'Shortcut backgrounds are off.\n' ;;
    status)
      if [ -f "$STATE_ROOT/shortcut-enabled" ]; then
        printf 'enabled=true\n'
        if [ "$(/usr/bin/plutil -extract CFBundleIdentifier raw -o - "$HOME/Applications/Codex (Xskin).app/Contents/Info.plist" 2>/dev/null)" = com.xskin.codex-launcher ]; then
          printf 'loaded=true\n'
        else printf 'loaded=false\n'; fi
      else printf 'enabled=false\nloaded=false\n'; fi
      ;;
    watch) printf 'Launch monitoring is retired. Use Codex (Xskin).\n' ;;
    *) fail "Unknown shortcut action: $1" ;;
  esac
fi
