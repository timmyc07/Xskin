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
    [ "$(/usr/bin/plutil -type ProgramArguments "$AUTOSTART_AGENT_PATH" 2>/dev/null)" = array ] &&
      ! /usr/bin/plutil -extract ProgramArguments.3 raw -o - "$AUTOSTART_AGENT_PATH" >/dev/null 2>&1 \
      || fail "Refusing to change an unrelated LaunchAgent argument list."
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
  [ "$PROJECT_ROOT" = "$INSTALL_ROOT" ] || fail "Configure automatic apply from the installed runtime."
  "$NODE" "$INJECTOR" --check-payload --theme-dir "$THEME_DIR" >/dev/null
  disable_autostart
  "$SCRIPT_DIR/setup-direct-launch.sh" --install
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
      WorkingDirectory: state,
      StandardOutPath: `${state}/autostart.log`,
      StandardErrorPath: `${state}/autostart-error.log`,
    }), { mode: 0o600 });
  ' "$temporary" "$AUTOSTART_JOB_LABEL" "$SCRIPT_DIR/autostart-dream-skin-macos.sh" "$STATE_ROOT"
  /usr/bin/plutil -convert xml1 "$temporary"
  /bin/chmod 600 "$temporary"
  /bin/mv "$temporary" "$AUTOSTART_AGENT_PATH"
  /usr/bin/touch "$STATE_ROOT/shortcut-enabled"
  /bin/chmod 600 "$STATE_ROOT/shortcut-enabled"
  /bin/launchctl bootstrap "gui/$(/usr/bin/id -u)" "$AUTOSTART_AGENT_PATH" \
    || fail "Automatic apply could not register; its enabled preference was preserved."
  /bin/launchctl print "$AUTOSTART_TARGET" >/dev/null || fail "Automatic apply registration could not be verified."
  printf 'Opening official Codex applies the saved background with one graceful reopen. Xskin can stay closed.\n'
}

apply_new_launch() {
  /bin/mkdir -p "$STATE_ROOT/studio"
  local lock
  for lock in "$STATE_ROOT/direct-launch.lock" "$STATE_ROOT/studio/operation.lock"; do
    [ ! -L "$lock" ] && { [ ! -e "$lock" ] || [ -f "$lock" ]; } || fail "Automatic apply requires ordinary lock files."
  done
  /usr/bin/lockf -ks -t 0 "$STATE_ROOT/studio/operation.lock" \
    /usr/bin/lockf -ks -t 0 "$STATE_ROOT/direct-launch.lock" \
    "$SCRIPT_DIR/start-dream-skin-macos.sh" --restart-new-launch "$1" "$2"
}

autostart_step() {
  local event="$1" pid="$2" command_line started_at
  case "$pid" in ''|*[!0-9]*) return 0 ;; esac
  if [ "$event" = terminate ]; then
    if [ -f "$STATE_PATH" ] && [ "$(state_field codexPid)" = "$pid" ]; then
      stop_recorded_injector || printf 'Automatic apply could not stop the recorded injector.\n' >&2
    fi
    return 0
  fi
  [ "$event" = launch ] && [ "$pid" != "$AUTOSTART_PREVIOUS_PID" ] || return 0
  started_at="$(process_started_at "$pid")" || return 0
  new_codex_launch_matches "$pid" "$started_at" || return 0
  AUTOSTART_PREVIOUS_PID="$pid"
  [ -f "$STATE_ROOT/shortcut-enabled" ] || return 0
  [ ! -f "$STATE_PATH" ] || [ "$(state_field session)" != paused ] || return 0
  command_line="$(/bin/ps -p "$pid" -o command= 2>/dev/null || true)"
  case "$command_line" in *--remote-debugging-port=*) return 0 ;; esac
  if ! apply_new_launch "$pid" "$started_at"; then
    printf 'Automatic apply failed; this launch will not be retried.\n' >&2
  fi
  # Consume the managed relaunch too, even if its connection failed.
  AUTOSTART_PREVIOUS_PID="$(codex_main_pids | /usr/bin/head -n 1)"
}

watch_normal_launches() {
  discover_codex_app
  require_macos_runtime
  ensure_state_root
  check_autostart_agent
  # Installation and login leave an already-open session alone.
  AUTOSTART_PREVIOUS_PID="$(codex_main_pids | /usr/bin/head -n 1)"
  trap 'exit 0' INT TERM
  local event event_pid
  "$PROJECT_ROOT/bin/CodexLauncher" --watch-launches "$CODEX_BUNDLE" | while read -r event event_pid; do
    autostart_step "$event" "$event_pid"
  done
  fail "Automatic apply notifications stopped."
}

if [ "${BASH_SOURCE[0]}" = "$0" ]; then
  [ "$#" -eq 1 ] || fail "Use autostart enable, disable, or status."
  case "$1" in
    enable) enable_autostart ;;
    disable) disable_autostart; /bin/rm -f "$STATE_ROOT/shortcut-enabled"; printf 'Automatic backgrounds are off.\n' ;;
    status)
      if [ -f "$STATE_ROOT/shortcut-enabled" ]; then
        printf 'enabled=true\n'
        if [ -f "$AUTOSTART_AGENT_PATH" ] && (check_autostart_agent) && /bin/launchctl print "$AUTOSTART_TARGET" >/dev/null 2>&1; then
          printf 'loaded=true\n'
        else printf 'loaded=false\n'; fi
      else printf 'enabled=false\nloaded=false\n'; fi
      ;;
    watch) watch_normal_launches ;;
    *) fail "Unknown shortcut action: $1" ;;
  esac
fi
