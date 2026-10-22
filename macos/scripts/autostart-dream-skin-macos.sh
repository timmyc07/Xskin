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
  [ "$PROJECT_ROOT" = "$INSTALL_ROOT" ] || fail "Enable automatic startup from the installed runtime."
  "$NODE" "$INJECTOR" --check-payload --theme-dir "$THEME_DIR" >/dev/null
  disable_autostart
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
  printf 'Opening the official Codex app now applies the saved background automatically. Xskin can stay closed.\n'
}

apply_new_launch() {
  "$SCRIPT_DIR/start-dream-skin-macos.sh" --restart-new-launch "$1" "$2"
}

autostart_step() {
  local pid="$1"
  local command_line="$2"
  [ "$pid" != "$AUTOSTART_PREVIOUS_PID" ] || return 0
  if [ -z "$pid" ]; then
    AUTOSTART_PREVIOUS_PID=""
    stop_recorded_injector || printf 'Automatic startup could not stop the old injector.\n' >&2
    return 0
  fi
  case "$command_line" in *--remote-debugging-port=*) AUTOSTART_PREVIOUS_PID="$pid"; return 0 ;; esac
  if [ $((SECONDS - AUTOSTART_LAST_HANDOFF)) -lt 30 ]; then
    AUTOSTART_PREVIOUS_PID="$pid"
    printf 'Automatic handoff skipped to prevent a restart loop.\n' >&2
    return 0
  fi
  local started_at
  started_at="$(process_started_at "$pid")"
  new_codex_launch_matches "$pid" "$started_at" || return 0
  AUTOSTART_PREVIOUS_PID="$pid"
  AUTOSTART_LAST_HANDOFF="$SECONDS"
  if ! apply_new_launch "$pid" "$started_at"; then
    printf 'Automatic apply failed; this launch will not be retried.\n' >&2
  fi
  AUTOSTART_PREVIOUS_PID="$(codex_main_pids | /usr/bin/head -n 1)"
}

watch_normal_launches() {
  discover_codex_app
  require_macos_runtime
  ensure_state_root
  # Installation and login must not interrupt a window that is already open.
  AUTOSTART_PREVIOUS_PID="$(codex_main_pids | /usr/bin/head -n 1)"
  AUTOSTART_LAST_HANDOFF=-30
  trap 'exit 0' INT TERM
  printf '%s automatic startup is watching normal launches.\n' "$(/bin/date -u '+%Y-%m-%dT%H:%M:%SZ')"
  local event event_pid pid command_line
  "$PROJECT_ROOT/bin/CodexLauncher" --watch-launches "$CODEX_BUNDLE" | while read -r event event_pid; do
    pid="$(codex_main_pids | /usr/bin/head -n 1)"
    command_line=""
    if [ -n "$pid" ] && [ "$pid" != "$AUTOSTART_PREVIOUS_PID" ]; then
      command_line="$(/bin/ps -p "$pid" -o command= 2>/dev/null || true)"
    fi
    autostart_step "$pid" "$command_line"
  done
  fail "Automatic startup notifications stopped."
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
