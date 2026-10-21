#!/bin/bash

set -euo pipefail

[ "$#" -eq 1 ] || { printf 'Usage: %s output.app\n' "$0" >&2; exit 1; }
PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd -P)"
SOURCE="$PROJECT_ROOT/native/Xskin.swift"
VERSION="$(/usr/bin/tr -d '\r\n' < "$PROJECT_ROOT/VERSION")"
APP_NAME="Xskin"
BUNDLE_ID="com.xskin.studio"
OUTPUT="$1"
case "$OUTPUT" in *.app) ;; *) printf 'The output must end with .app.\n' >&2; exit 1 ;; esac
[ -f "$SOURCE" ] || { printf 'Xskin source is missing: %s\n' "$SOURCE" >&2; exit 1; }
/usr/bin/xcrun --find swiftc >/dev/null 2>&1 || { printf 'Building Xskin requires the Xcode command line tools. Use the prebuilt app to install without Xcode.\n' >&2; exit 1; }
case "$VERSION" in ''|*[!0-9.]*) printf 'Invalid app version: %s\n' "$VERSION" >&2; exit 1 ;; esac
/bin/mkdir -p "$(dirname "$OUTPUT")"
OUTPUT="$(cd "$(dirname "$OUTPUT")" && pwd -P)/$(basename "$OUTPUT")"
if [ -e "$OUTPUT" ]; then
  [ "$(/usr/bin/plutil -extract CFBundleIdentifier raw -o - "$OUTPUT/Contents/Info.plist" 2>/dev/null || true)" = "$BUNDLE_ID" ] || { printf 'Refusing to replace an unrelated app: %s\n' "$OUTPUT" >&2; exit 1; }
fi
TEMPORARY="$(/usr/bin/mktemp -d "$(dirname "$OUTPUT")/.background-studio-build.XXXXXX")"
APP="$TEMPORARY/$APP_NAME.app"
PREVIOUS="$TEMPORARY/previous.app"
trap '/bin/rm -rf "$TEMPORARY"' EXIT
/bin/mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources/runtime"
/bin/mkdir -p "$PROJECT_ROOT/bin"
/usr/bin/xcrun swiftc -parse-as-library -O \
  -target "$(/usr/bin/uname -m)-apple-macos13.0" \
  -module-cache-path "$TEMPORARY/module-cache" -framework AppKit \
  "$PROJECT_ROOT/native/DirectLauncher.swift" "$PROJECT_ROOT/native/Localization.swift" \
  -o "$TEMPORARY/CodexLauncher"
/usr/bin/codesign --force --sign - --timestamp=none "$TEMPORARY/CodexLauncher" >&2
/bin/mv "$TEMPORARY/CodexLauncher" "$PROJECT_ROOT/bin/CodexLauncher"
/usr/bin/xcrun swiftc -parse-as-library -O \
  -target "$(/usr/bin/uname -m)-apple-macos13.0" \
  -module-cache-path "$TEMPORARY/module-cache" \
  -framework SwiftUI -framework AppKit -framework AVKit -framework AVFoundation \
  "$SOURCE" "$PROJECT_ROOT/native/Localization.swift" -o "$APP/Contents/MacOS/Xskin"

PLIST="$APP/Contents/Info.plist"
/usr/bin/plutil -create xml1 "$PLIST"
/usr/bin/plutil -insert CFBundleIdentifier -string "$BUNDLE_ID" "$PLIST"
/usr/bin/plutil -insert CFBundleName -string "$APP_NAME" "$PLIST"
/usr/bin/plutil -insert CFBundleDisplayName -string "$APP_NAME" "$PLIST"
/usr/bin/plutil -insert CFBundleExecutable -string Xskin "$PLIST"
/usr/bin/plutil -insert CFBundlePackageType -string APPL "$PLIST"
/usr/bin/plutil -insert CFBundleShortVersionString -string "$VERSION" "$PLIST"
/usr/bin/plutil -insert CFBundleVersion -string "$VERSION" "$PLIST"
/usr/bin/plutil -insert LSMinimumSystemVersion -string 13.0 "$PLIST"
/usr/bin/plutil -insert NSPrincipalClass -string NSApplication "$PLIST"
/usr/bin/plutil -insert NSHighResolutionCapable -bool true "$PLIST"
/usr/bin/rsync -a \
  --exclude '.git/' --exclude '.DS_Store' --exclude '.env' --exclude '.env.*' \
  --exclude '*.app/' \
  --exclude '/release/' --exclude '/runtime/' --exclude '/tests/' \
  --exclude '/native/' --exclude '/build/' \
  "$PROJECT_ROOT/" "$APP/Contents/Resources/runtime/"
/bin/chmod 755 "$APP/Contents/MacOS/Xskin" "$APP/Contents/Resources/runtime/scripts/"*.sh
/usr/bin/codesign --force --sign - --timestamp=none "$APP" >&2
/usr/bin/codesign --verify --deep --strict "$APP"
if [ -e "$OUTPUT" ]; then /bin/mv "$OUTPUT" "$PREVIOUS"; fi
if ! /bin/mv "$APP" "$OUTPUT"; then
  [ ! -e "$PREVIOUS" ] || /bin/mv "$PREVIOUS" "$OUTPUT"
  exit 1
fi
printf 'Created %s (%s, %s).\n' "$OUTPUT" "$VERSION" "$(/usr/bin/uname -m)"
