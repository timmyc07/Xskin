#!/bin/bash

set -euo pipefail
. "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)/common-macos.sh"

AUTOSTART_TARGET="gui/$(/usr/bin/id -u)/$AUTOSTART_JOB_LABEL"

check_autostart_agent() {
  [ ! -L "$AUTOSTART_AGENT_PATH" ] || fail "Automatic startup plist must not be a symbolic link."
  [ ! -e "$AUTOSTART_AGENT_PATH" ] || {
    [ "$(/usr/bin/plutil -extract Label raw -o - "$AUTOSTART_AGENT_PATH" 2>/dev/null)" = "$AUTOSTART_JOB_LABEL" ] \
      || fail "Refusing to change an unrelated LaunchAgent."
  }
}

disable_autostart() {
  local restore_entry="${1:-true}"
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
  if [ "$restore_entry" = "true" ] && [ -f "$STATE_ROOT/direct-launch-dock.plist" ]; then
    "$PROJECT_ROOT/bin/CodexLauncher" --unlink-dock
  fi
}

enable_autostart() {
  discover_codex_app
  require_macos_runtime
  ensure_state_root
  [ "$PROJECT_ROOT" = "$INSTALL_ROOT" ] || fail "Enable automatic startup from the installed runtime."
  "$NODE" "$INJECTOR" --check-payload --theme-dir "$THEME_DIR" >/dev/null
  disable_autostart false
  /bin/mkdir -p "$(dirname "$AUTOSTART_AGENT_PATH")"
  local temporary
  temporary="$(/usr/bin/mktemp "$AUTOSTART_AGENT_PATH.XXXXXX")"
  "$NODE" -e '
    const fs = require("node:fs");
    const [file, label, watcher, state] = process.argv.slice(1);
    fs.writeFileSync(file, JSON.stringify({
      Label: label,
      ProgramArguments: ["/bin/bash", watcher, "watch"],
      RunAtLoad: true,
      KeepAlive: { SuccessfulExit: false },
      ThrottleInterval: 30,
      ProcessType: "Background",
      StandardOutPath: `${state}/autostart.log`,
      StandardErrorPath: `${state}/autostart-error.log`,
    }), { mode: 0o600 });
  ' "$temporary" "$AUTOSTART_JOB_LABEL" "$SCRIPT_DIR/autostart-dream-skin-macos.sh" "$STATE_ROOT"
  /usr/bin/plutil -convert xml1 "$temporary"
  /bin/chmod 600 "$temporary"
  /bin/mv "$temporary" "$AUTOSTART_AGENT_PATH"
  if ! /bin/launchctl bootstrap "gui/$(/usr/bin/id -u)" "$AUTOSTART_AGENT_PATH"; then
    fail "Could not register automatic startup; its enabled configuration was preserved."
  fi
  /bin/launchctl print "$AUTOSTART_TARGET" >/dev/null \
    || fail "Automatic startup registration could not be verified."
  if ! "$PROJECT_ROOT/bin/CodexLauncher" --install "$CODEX_BUNDLE" >/dev/null ||
    ! "$PROJECT_ROOT/bin/CodexLauncher" --link-dock "$CODEX_BUNDLE" >/dev/null; then
    disable_autostart
    fail "Could not configure the direct-launch Dock entry; automatic startup was disabled."
  fi
  printf 'The Codex Dock shortcut is ready. Xskin does not need to remain open.\n'
}

autostart_step() {
  local pid="$1"
  local command_line="$2"
  [ "$pid" != "$AUTOSTART_PREVIOUS_PID" ] || return 0
  AUTOSTART_PREVIOUS_PID="$pid"
  if [ -z "$pid" ]; then
    stop_recorded_injector || printf 'Automatic startup could not stop the old injector.\n' >&2
    return 0
  fi
  case "$command_line" in *--remote-debugging-port=*) return 0 ;; esac
  printf 'Codex was opened directly and was left running. Use the Codex (Xskin) Dock shortcut for automatic backgrounds.\n' >&2
}

watch_normal_launches() {
  discover_codex_app
  require_macos_runtime
  ensure_state_root
  # Installation and login must not interrupt a window that is already open.
  AUTOSTART_PREVIOUS_PID="$(codex_main_pids | /usr/bin/head -n 1)"
  trap 'exit 0' INT TERM
  printf '%s automatic startup is watching normal launches.\n' "$(/bin/date -u '+%Y-%m-%dT%H:%M:%SZ')"
  while :; do
    local pid command_line
    pid="$(codex_main_pids | /usr/bin/head -n 1)"
    command_line=""
    [ -z "$pid" ] || command_line="$(/bin/ps -p "$pid" -o command= 2>/dev/null || true)"
    autostart_step "$pid" "$command_line"
    /bin/sleep 1
  done
}

if [ "${BASH_SOURCE[0]}" = "$0" ]; then
  [ "$#" -eq 1 ] || fail "Use autostart enable, disable, or status."
  case "$1" in
    enable) enable_autostart ;;
    disable) disable_autostart; printf 'Automatic startup is off. The current background is unchanged.\n' ;;
    status)
      if [ -f "$AUTOSTART_AGENT_PATH" ]; then
        printf 'enabled=true\n'
        if /bin/launchctl print "$AUTOSTART_TARGET" >/dev/null 2>&1; then printf 'loaded=true\n'; else printf 'loaded=false\n'; fi
      else
        printf 'enabled=false\nloaded=false\n'
      fi
      ;;
    watch) watch_normal_launches ;;
    *) fail "Unknown automatic startup action: $1" ;;
  esac
fi
