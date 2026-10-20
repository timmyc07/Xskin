#!/bin/bash

set -euo pipefail
. "$(cd "$(dirname "$0")" && pwd -P)/common-macos.sh"
[ "$#" -eq 0 ] || { [ "$#" -eq 1 ] && [ "$1" = "--json" ]; } || fail "Use open-background-studio.sh [--json]"
VERSION="$(/usr/bin/tr -d '\r\n' < "$PROJECT_ROOT/VERSION")"
APP="$HOME/Applications/Xskin.app"
PREBUILT="$PROJECT_ROOT/native/Xskin.app"
BUNDLE_ID="com.xskin.studio"

app_matches() {
  local candidate="$1"
  [ -x "$candidate/Contents/MacOS/Xskin" ] &&
    [ "$(/usr/bin/plutil -extract CFBundleIdentifier raw -o - "$candidate/Contents/Info.plist" 2>/dev/null || true)" = "$BUNDLE_ID" ] &&
    [ "$(/usr/bin/plutil -extract CFBundleShortVersionString raw -o - "$candidate/Contents/Info.plist" 2>/dev/null || true)" = "$VERSION" ] &&
    /usr/bin/file "$candidate/Contents/MacOS/Xskin" | /usr/bin/grep -q "$(/usr/bin/uname -m)" &&
    /usr/bin/codesign --verify --deep --strict "$candidate" >/dev/null 2>&1
}

if ! app_matches "$APP"; then
  if [ -e "$APP" ]; then
    [ "$(/usr/bin/plutil -extract CFBundleIdentifier raw -o - "$APP/Contents/Info.plist" 2>/dev/null || true)" = "$BUNDLE_ID" ] || fail "Refusing to replace an unrelated app: $APP"
  fi
  /bin/mkdir -p "$HOME/Applications"
  TEMPORARY="$(/usr/bin/mktemp -d "$HOME/Applications/.background-studio-install.XXXXXX")"
  trap '/bin/rm -rf "$TEMPORARY"' EXIT
  if app_matches "$PREBUILT"; then
    /usr/bin/ditto "$PREBUILT" "$TEMPORARY/Xskin.app"
  else
    "$SCRIPT_DIR/build-native-studio.sh" "$TEMPORARY/Xskin.app" >&2
  fi
  app_matches "$TEMPORARY/Xskin.app" || fail "The built Xskin app failed validation."
  if [ -e "$APP" ]; then /bin/mv "$APP" "$TEMPORARY/previous.app"; fi
  if ! /bin/mv "$TEMPORARY/Xskin.app" "$APP"; then
    [ ! -e "$TEMPORARY/previous.app" ] || /bin/mv "$TEMPORARY/previous.app" "$APP"
    fail "Could not install Xskin at $APP"
  fi
fi
/usr/bin/open "$APP"
if [ "${1:-}" = "--json" ]; then
  /usr/bin/osascript -l JavaScript -e 'function run(argv) { return JSON.stringify({appPath: argv[0], version: argv[1]}); }' "$APP" "$VERSION"
else
  printf 'Opened %s (%s).\n' "$APP" "$VERSION"
fi
