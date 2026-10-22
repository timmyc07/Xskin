#!/bin/bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd -P)"
. "$ROOT/scripts/autostart-dream-skin-macos.sh"
TEMPORARY="$(/usr/bin/mktemp -d /tmp/xskin-shortcut-test.XXXXXX)"
trap '/bin/rm -rf "$TEMPORARY"' EXIT
STATE_ROOT="$TEMPORARY/state 中文 🌙"
INSTALL_ROOT="$TEMPORARY/runtime"
PROJECT_ROOT="$INSTALL_ROOT"
SCRIPT_DIR="$INSTALL_ROOT/scripts"
AUTOSTART_AGENT_PATH="$TEMPORARY/legacy.plist"
mkdir -p "$STATE_ROOT" "$SCRIPT_DIR"
function /bin/launchctl() { [ "$1" != print ]; }
cat > "$AUTOSTART_AGENT_PATH" <<PLIST
<?xml version="1.0" encoding="UTF-8"?><plist version="1.0"><dict>
<key>Label</key><string>$AUTOSTART_JOB_LABEL</string>
<key>ProgramArguments</key><array><string>/bin/bash</string><string>$INSTALL_ROOT/scripts/autostart-dream-skin-macos.sh</string><string>watch</string></array>
</dict></plist>
PLIST
check_autostart_agent
disable_autostart
[ ! -e "$AUTOSTART_AGENT_PATH" ]
cat > "$AUTOSTART_AGENT_PATH" <<PLIST
<?xml version="1.0" encoding="UTF-8"?><plist version="1.0"><dict><key>Label</key><string>$AUTOSTART_JOB_LABEL</string><key>ProgramArguments</key><array><string>/unrelated</string></array></dict></plist>
PLIST
if (check_autostart_agent >/dev/null 2>&1); then exit 1; fi
[ -f "$AUTOSTART_AGENT_PATH" ]
rm "$AUTOSTART_AGENT_PATH"
discover_codex_app() { :; }
require_macos_runtime() { :; }
ensure_state_root() { :; }
cat > "$SCRIPT_DIR/setup-direct-launch.sh" <<'SETUP'
#!/bin/bash
[ "$1" = --install ]
SETUP
chmod +x "$SCRIPT_DIR/setup-direct-launch.sh"
printf 'language=zh-Hant\nmask=0.42\n' > "$STATE_ROOT/preferences"
enable_autostart >/dev/null
[ -f "$STATE_ROOT/shortcut-enabled" ]
[ "$(cat "$STATE_ROOT/preferences")" = $'language=zh-Hant\nmask=0.42' ]
[ ! -f "$AUTOSTART_AGENT_PATH" ]
printf 'PASS: managed shortcut setup preserves preferences and removes only the verified legacy LaunchAgent.\n'
