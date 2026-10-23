#!/bin/bash

set -euo pipefail
. "$(cd "$(dirname "$0")" && pwd -P)/common-macos.sh"

PORT=9341
CREATE_LAUNCHERS="true"
LAUNCH_AFTER_INSTALL="true"
IN_PLACE="false"
while [ "$#" -gt 0 ]; do
  case "$1" in
    --port) PORT="${2:-}"; shift 2 ;;
    --no-launchers) CREATE_LAUNCHERS="false"; shift ;;
    --no-launch) LAUNCH_AFTER_INSTALL="false"; shift ;;
    --in-place) IN_PLACE="true"; shift ;;
    *) fail "Unknown installer argument: $1" ;;
  esac
done
case "$PORT" in ''|*[!0-9]*) fail "Invalid port: $PORT" ;; esac
[ "$PORT" -ge 1024 ] && [ "$PORT" -le 65535 ] || fail "Port must be between 1024 and 65535."

deploy_project() {
  local temporary="$INSTALL_ROOT.installing.$$"
  local previous="$INSTALL_ROOT.previous.$$"
  local resume_watcher="false" resume_port="" startup_enabled="false"
  local target="gui/$(/usr/bin/id -u)/$AUTOSTART_JOB_LABEL"
  trap '/bin/rm -rf "$INSTALL_ROOT.installing.$$"' EXIT
  /bin/rm -rf "$temporary"
  /bin/mkdir -p "$temporary"
  /usr/bin/rsync -a \
    --exclude '.git/' \
    --exclude '.DS_Store' \
    --exclude '.env' --exclude '.env.*' \
    --exclude '/release/' \
    --exclude '/runtime/' \
    "$PROJECT_ROOT/" "$temporary/"
  /bin/chmod 700 "$temporary"/*.command "$temporary"/scripts/*.sh 2>/dev/null || true
  discover_codex_app
  require_macos_runtime
  ensure_state_root
  if [ -f "$THEME_DIR/theme.json" ]; then
    "$NODE" "$temporary/scripts/injector.mjs" --check-payload --theme-dir "$THEME_DIR" >/dev/null
  fi
  if [ -e "$INSTALL_ROOT" ] && [ ! -f "$STATE_ROOT/shortcut-setup-complete" ]; then
    /usr/bin/touch "$STATE_ROOT/shortcut-setup-complete"
  fi
  if [ -f "$STATE_ROOT/shortcut-enabled" ] || [ -f "$AUTOSTART_AGENT_PATH" ]; then
    startup_enabled="true"
  fi
  . "$SCRIPT_DIR/autostart-dream-skin-macos.sh"
  if [ -f "$AUTOSTART_AGENT_PATH" ]; then
    check_autostart_agent
    if ! /bin/launchctl bootout "$target" 2>/dev/null; then
      ! /bin/launchctl print "$target" >/dev/null 2>&1 || fail "Could not stop automatic startup for the update."
    fi
  fi
  if [ -f "$STATE_PATH" ]; then
    resume_port="$(state_field port)"
    if [ "$(state_field session)" != "paused" ] && verified_cdp_endpoint "$resume_port"; then
      resume_watcher="true"
    fi
    if ! stop_recorded_injector; then
      [ "$startup_enabled" != "true" ] || "$INSTALL_ROOT/scripts/autostart-dream-skin-macos.sh" enable
      fail "Could not stop the recorded injector; the installed runtime was preserved."
    fi
  fi
  if [ -e "$INSTALL_ROOT" ]; then /bin/mv "$INSTALL_ROOT" "$previous"; fi
  local install_args=(--in-place --port "$PORT" --no-launch)
  [ "$CREATE_LAUNCHERS" = "true" ] || install_args+=(--no-launchers)
  if /bin/mv "$temporary" "$INSTALL_ROOT" &&
    "$INSTALL_ROOT/scripts/install-dream-skin-macos.sh" "${install_args[@]}" &&
    { [ "$resume_watcher" != "true" ] || "$INSTALL_ROOT/scripts/start-dream-skin-macos.sh" --port "$resume_port"; }; then
    /bin/rm -rf "$previous"
  else
    if [ -f "$STATE_PATH" ]; then
      stop_recorded_injector || fail "Update failed and the new injector could not stop; both runtimes were preserved."
    fi
    if [ -f "$AUTOSTART_AGENT_PATH" ]; then
      check_autostart_agent
      if ! /bin/launchctl bootout "$target" 2>/dev/null; then
        ! /bin/launchctl print "$target" >/dev/null 2>&1 || fail "Update failed and automatic startup could not stop; both runtimes were preserved."
      fi
    fi
    /bin/rm -rf "$INSTALL_ROOT"
    [ -e "$previous" ] && /bin/mv "$previous" "$INSTALL_ROOT"
    [ "$startup_enabled" != "true" ] || "$INSTALL_ROOT/scripts/autostart-dream-skin-macos.sh" enable
    [ "$resume_watcher" != "true" ] || "$INSTALL_ROOT/scripts/start-dream-skin-macos.sh" --port "$resume_port"
    fail "Could not install the project at $INSTALL_ROOT"
  fi
  if [ "$LAUNCH_AFTER_INSTALL" = "true" ] && [ "$resume_watcher" != "true" ] && ! codex_is_running; then
    "$INSTALL_ROOT/scripts/direct-launch-macos.sh"
  fi
}

if [ "$IN_PLACE" = "false" ] && [ "$PROJECT_ROOT" != "$INSTALL_ROOT" ]; then
  /bin/mkdir -p "$(dirname "$INSTALL_ROOT")"
  deploy_project
  exit 0
fi

discover_codex_app
require_macos_runtime
ensure_state_root
# Installation backs up only appearance keys and leaves an open Codex running.
seed_bundled_presets
if [ ! -f "$THEME_DIR/theme.json" ]; then
  "$SCRIPT_DIR/switch-theme-macos.sh" --id preset-midnight-aurora --no-apply >/dev/null
fi
[ -f "$CONFIG_PATH" ] || fail "Codex config not found: $CONFIG_PATH. Launch Codex once, close it, and rerun the installer."
"$NODE" "$INJECTOR" --check-payload --theme-dir "$THEME_DIR" >/dev/null
"$NODE" "$SCRIPT_DIR/theme-config.mjs" install "$CONFIG_PATH" "$THEME_BACKUP_PATH"

shell_quote() {
  LC_ALL=C printf '%q' "$1"
}

write_launcher() {
  local target="$1"
  local command="$2"
  if { [ -e "$target" ] || [ -L "$target" ]; } && ! owned_desktop_launcher "$target"; then
    fail "Refusing to overwrite an unrelated Desktop file: $target"
  fi
  /usr/bin/printf '%s\n' \
    '#!/bin/bash' \
    '# CodexDreamSkinStudio launcher' \
    'set -e' \
    "$command" > "$target"
  /bin/chmod 700 "$target"
}

if [ "$CREATE_LAUNCHERS" = "true" ]; then
  /bin/mkdir -p "$HOME/Desktop"
  start_script="$(shell_quote "$SCRIPT_DIR/direct-launch-macos.sh")"
  customize_script="$(shell_quote "$SCRIPT_DIR/customize-theme-macos.sh")"
  verify_script="$(shell_quote "$SCRIPT_DIR/verify-dream-skin-macos.sh")"
  restore_script="$(shell_quote "$SCRIPT_DIR/restore-dream-skin-macos.sh")"
  screenshot="$(shell_quote "$HOME/Desktop/Codex Dream Skin Verification.png")"
  write_launcher "$HOME/Desktop/Codex Dream Skin.command" "exec $start_script"
  write_launcher "$HOME/Desktop/Codex Dream Skin - Customize.command" "exec $customize_script"
  write_launcher "$HOME/Desktop/Codex Dream Skin - Verify.command" "$verify_script --screenshot $screenshot && /usr/bin/open $screenshot"
  write_launcher "$HOME/Desktop/Codex Dream Skin - Restore.command" "exec $restore_script --restore-base-theme --restart-codex"
fi

# Preserve disabled preferences; enabled 1.8.0 shortcuts migrate to native-app monitoring.
if [ -f "$AUTOSTART_AGENT_PATH" ] || [ -f "$STATE_ROOT/shortcut-enabled" ] || [ ! -f "$STATE_ROOT/shortcut-setup-complete" ]; then
  "$SCRIPT_DIR/autostart-dream-skin-macos.sh" enable
else
  "$SCRIPT_DIR/setup-direct-launch.sh" --install
fi
/usr/bin/touch "$STATE_ROOT/shortcut-setup-complete"

printf 'Codex Dream Skin Studio %s installed at %s for Codex %s using its signed Node.js %s.\n' \
  "$SKIN_VERSION" "$PROJECT_ROOT" "$CODEX_VERSION" "$NODE_VERSION"
printf 'Use the Desktop launchers to customize, start, verify, or restore the official appearance.\n'
printf 'Bundled presets are ready in your theme library — pick one from the menu bar (已保存的主题) or switch-theme.\n'

if [ "$LAUNCH_AFTER_INSTALL" = "true" ] && ! codex_is_running; then
  "$SCRIPT_DIR/direct-launch-macos.sh"
fi
