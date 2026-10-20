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
  [ -f "$AUTOSTART_AGENT_PATH" ] || return 0
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
  printf '一般開啟 Codex 時會自動套用目前背景；目前視窗保持開啟。\n'
}

apply_new_launch() {
  local pid="$1"
  "$SCRIPT_DIR/start-dream-skin-macos.sh" --restart-new-launch "$pid"
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
  # Explicit skin launches already own their injector and verification.
  case "$command_line" in *--remote-debugging-port=*) return 0 ;; esac
  if [ $((SECONDS - AUTOSTART_LAST_HANDOFF)) -lt 30 ]; then
    printf 'Automatic handoff skipped to prevent a restart loop.\n' >&2
    return 0
  fi
  AUTOSTART_LAST_HANDOFF="$SECONDS"
  printf '%s detected a new normal Codex launch (PID %s).\n' "$(/bin/date -u '+%Y-%m-%dT%H:%M:%SZ')" "$pid"
  if ! apply_new_launch "$pid"; then
    printf 'Automatic apply failed; this launch will not be retried.\n' >&2
    if ! codex_is_running; then launch_codex_normally; fi
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
    disable) disable_autostart; printf '自動套用已關閉，目前背景不變。\n' ;;
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
