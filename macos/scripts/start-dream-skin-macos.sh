#!/bin/bash

set -Eeuo pipefail
. "$(cd "$(dirname "$0")" && pwd -P)/common-macos.sh"

record_start_error() {
  local code="$1"
  local line="$2"
  ensure_state_root
  printf '%s exit=%s line=%s\n' "$(/bin/date -u '+%Y-%m-%dT%H:%M:%SZ')" "$code" "$line" >> "$START_ERROR_LOG"
  printf 'Codex Dream Skin Studio: start failed at line %s (exit %s). See %s\n' "$line" "$code" "$START_ERROR_LOG" >&2
}
trap 'code=$?; record_start_error "$code" "$LINENO"' ERR

PORT=9341
PORT_EXPLICIT="false"
RESTART_EXISTING="false"
PROMPT_RESTART="false"
FOREGROUND_INJECTOR="false"
DIRECT_LAUNCH="false"
STARTUP_PID=""
STARTUP_STARTED_AT=""
AUTOMATIC_HANDOFF="false"
HANDOFF_COMPLETED="false"
RUNTIME_VERIFIED="false"
VERIFY_OUTPUT=""
REQUESTED_AT="$(/bin/date +%s)"
finish_start() {
  local code="$?"
  [ -z "$VERIFY_OUTPUT" ] || /bin/rm -f "$VERIFY_OUTPUT"
  if [ "$code" -ne 0 ] && [ "$DIRECT_LAUNCH" = "true" ] && [ "$RUNTIME_VERIFIED" = "true" ] &&
    { [ "$AUTOMATIC_HANDOFF" != "true" ] || [ "$HANDOFF_COMPLETED" = "true" ]; }; then
    /usr/bin/open -a "$CODEX_BUNDLE" >/dev/null 2>&1 || true
  fi
}
trap finish_start EXIT
while [ "$#" -gt 0 ]; do
  case "$1" in
    --port) PORT="${2:-}"; PORT_EXPLICIT="true"; shift 2 ;;
    --restart-existing) RESTART_EXISTING="true"; shift ;;
    --prompt-restart) PROMPT_RESTART="true"; shift ;;
    --foreground-injector) FOREGROUND_INJECTOR="true"; shift ;;
    --direct-launch) DIRECT_LAUNCH="true"; shift ;;
    --restart-new-launch) STARTUP_PID="${2:-}"; STARTUP_STARTED_AT="${3:-}"; AUTOMATIC_HANDOFF="true"; DIRECT_LAUNCH="true"; shift 3 ;;
    *) fail "Unknown start argument: $1" ;;
  esac
done
case "$PORT" in ''|*[!0-9]*) fail "Invalid port: $PORT" ;; esac
[ "$PORT" -ge 1024 ] && [ "$PORT" -le 65535 ] || fail "Port must be between 1024 and 65535."
if [ "$AUTOMATIC_HANDOFF" = "true" ]; then
  case "$STARTUP_PID" in ''|*[!0-9]*) fail "Invalid automatic startup process." ;; esac
  [ -n "$STARTUP_STARTED_AT" ] || fail "Missing automatic startup process identity."
fi

discover_codex_app
require_macos_runtime
RUNTIME_VERIFIED="true"
ensure_state_root

if [ "$PORT_EXPLICIT" = "false" ] && [ -f "$STATE_PATH" ]; then
  saved_port="$(state_field port)" || fail "Could not read the existing state port."
  [ -n "$saved_port" ] && PORT="$saved_port"
fi

DEBUG_READY="false"
if verified_cdp_endpoint "$PORT"; then DEBUG_READY="true"; fi

if [ -n "$STARTUP_PID" ] && [ "$DEBUG_READY" = "false" ]; then
  [ -f "$AUTOSTART_AGENT_PATH" ] || fail "Automatic apply is disabled."
  new_codex_launch_matches "$STARTUP_PID" "$STARTUP_STARTED_AT" \
    || fail "Automatic apply skipped: Codex is no longer a new, matching launch."
  "$NODE" "$INJECTOR" --check-payload --theme-dir "$THEME_DIR" >/dev/null
  # The enabled startup option authorizes one graceful handoff, never a forced quit.
  new_codex_launch_matches "$STARTUP_PID" "$STARTUP_STARTED_AT" \
    || fail "Automatic apply skipped: Codex changed during validation."
  stop_codex false
  HANDOFF_COMPLETED="true"
elif codex_is_running && [ "$DEBUG_READY" = "false" ]; then
  if [ "$PROMPT_RESTART" = "true" ] && [ "$RESTART_EXISTING" = "false" ]; then
    language="$(/usr/bin/defaults read com.xskin.studio xskin.language 2>/dev/null || true)"
    case "$language" in
      zh-Hant) restart_message="需要重新開啟 Codex 才能套用背景。未送出的輸入可能遺失。"; cancel_label="取消"; restart_label="重新開啟並套用" ;;
      zh-Hans) restart_message="需要重新打开 Codex 才能应用背景。未发送的输入可能丢失。"; cancel_label="取消"; restart_label="重新打开并应用" ;;
      ja) restart_message="背景を適用するには Codex の再起動が必要です。未送信の入力が失われる場合があります。"; cancel_label="キャンセル"; restart_label="再起動して適用" ;;
      *) restart_message="Codex needs to restart to apply the background. Unsent input may be lost."; cancel_label="Cancel"; restart_label="Restart and apply" ;;
    esac
    if ! /usr/bin/osascript - "$restart_message" "$cancel_label" "$restart_label" >/dev/null <<'APPLESCRIPT'
on run argv
  display dialog (item 1 of argv) buttons {item 2 of argv, item 3 of argv} default button (item 3 of argv) cancel button (item 2 of argv) with title "Xskin"
end run
APPLESCRIPT
    then
      fail "Theme launch was cancelled."
    fi
    RESTART_EXISTING="true"
  fi
  [ "$RESTART_EXISTING" = "true" ] || fail "Codex is already running without the verified skin CDP endpoint. Close it first or pass --restart-existing."
  stop_codex true
fi

if [ -f "$STATE_PATH" ]; then
  stop_recorded_injector
  /bin/rm -f "$STATE_PATH"
fi

INJECTOR_PID=""
if [ "$DEBUG_READY" = "false" ]; then
  PORT="$(select_available_port "$PORT")"
  printf 'Launching Codex with skin debug port %s…\n' "$PORT" >&2
  launch_codex_with_cdp "$PORT"
  # Start probing immediately instead of waiting for the native window to finish loading.
  if [ "$FOREGROUND_INJECTOR" != "true" ]; then
    INJECTOR_PID="$(launch_injector_daemon "$PORT")"
  fi
  if ! wait_for_cdp "$PORT"; then
    [ -z "$INJECTOR_PID" ] || /bin/kill -TERM "$INJECTOR_PID" 2>/dev/null || true
    fail "Codex did not expose a verified loopback CDP endpoint on port $PORT within 45 seconds. See $APP_LOG and $APP_ERROR_LOG"
  fi
fi

if [ "$FOREGROUND_INJECTOR" = "true" ]; then
  exec "$NODE" "$INJECTOR" --watch --port "$PORT" --theme-dir "$THEME_DIR"
fi

if [ -z "$INJECTOR_PID" ]; then
  INJECTOR_PID="$(launch_injector_daemon "$PORT")"
fi
/bin/sleep 0.15
/bin/kill -0 "$INJECTOR_PID" 2>/dev/null || fail "The injector exited during startup. See $INJECTOR_ERROR_LOG"
INJECTOR_STARTED_AT="$(process_started_at "$INJECTOR_PID")"
[ -n "$INJECTOR_STARTED_AT" ] || fail "Could not record the injector process start time."
CODEX_PID="$(codex_main_pids | /usr/bin/head -n 1)"
write_state "$PORT" "$INJECTOR_PID" "$INJECTOR_STARTED_AT" "$CODEX_PID"

# Require real renderer and video playback verification before reporting success.
VERIFY_OUTPUT="$(/usr/bin/mktemp "${TMPDIR:-/tmp}/dream-skin-verify.XXXXXX")"
/bin/chmod 600 "$VERIFY_OUTPUT"
verify_args=(--verify --port "$PORT" --theme-dir "$THEME_DIR" --timeout-ms 20000)
[ "$DIRECT_LAUNCH" != "true" ] || verify_args+=(--prepare-first-frame)
if "$NODE" "$INJECTOR" "${verify_args[@]}" >"$VERIFY_OUTPUT" 2>/dev/null; then
  verify_code=0
else
  verify_code=$?
fi
if [ "$verify_code" -ne 0 ]; then
  # One more force inject before giving up
  "$NODE" "$INJECTOR" --once --port "$PORT" --theme-dir "$THEME_DIR" --timeout-ms 15000 >/dev/null 2>&1 || true
  if "$NODE" "$INJECTOR" "${verify_args[@]}" >"$VERIFY_OUTPUT" 2>/dev/null; then
    verify_code=0
  else
    verify_code=$?
  fi
fi
if [ "$verify_code" -ne 0 ]; then
  # The watcher is normally launched directly (launchctl is only a fallback),
  # so a successful `launchctl remove` does not prove that the recorded PID
  # stopped.  Verify the PID/path/start-time tuple before deleting state; if
  # it cannot be stopped safely, preserve the state as evidence and fail
  # closed instead of leaving an orphan watcher that can reinject later.
  if ! stop_recorded_injector; then
    fail "Injection verification failed and the recorded injector could not be stopped safely; state was preserved. See $INJECTOR_ERROR_LOG"
  fi
  /bin/rm -f "$STATE_PATH"
  fail "Injection verification failed. The injector was stopped; see $INJECTOR_ERROR_LOG"
fi

if [ "$DIRECT_LAUNCH" = "true" ]; then
  "$NODE" -e '
    const fs = require("node:fs");
    const [verify, output, requestedAt] = process.argv.slice(1);
    const result = JSON.parse(fs.readFileSync(verify, "utf8")).targets.find(item => item.result.pass)?.result;
    if (!result) process.exit(1);
    fs.writeFileSync(output, JSON.stringify({ requestedAt: Number(requestedAt) * 1000, verifiedAt: Date.now(), frames: result.startupFrames, video: result.video, mask: result.wallpaperMask }) + "\n", {mode: 0o600});
  ' "$VERIFY_OUTPUT" "$STATE_ROOT/direct-launch-timing.json" "$REQUESTED_AT"
fi

printf 'Codex Dream Skin Studio %s is active on loopback port %s.\n' "$SKIN_VERSION" "$PORT"
