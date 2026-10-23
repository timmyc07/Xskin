#!/bin/bash

set -euo pipefail

[ "$#" -le 1 ] || {
  printf 'Usage: %s [output.zip]\n' "$0" >&2
  exit 1
}
ROOT="$(cd "$(dirname "$0")/../.." && pwd -P)"
VERSION="$(/usr/bin/plutil -extract version raw -o - "$ROOT/plugin.json")"
ARCHIVE="${1:-$ROOT/macos/release/xskin-plugin-v$VERSION.zip}"
npm run build --prefix "$ROOT/plugin" >/dev/null
"$ROOT/macos/scripts/build-native-studio.sh" "$ROOT/macos/native/Xskin.app" >/dev/null
TMP="$(/usr/bin/mktemp -d /tmp/codex-background-plugin.XXXXXX)"
PACKAGE="$TMP/codex-background-studio"
trap '/bin/rm -rf "$TMP"' EXIT

/bin/mkdir -p "$PACKAGE/.agents/plugins" "$PACKAGE/docs" "$PACKAGE/macos" "$PACKAGE/plugin"
/bin/cp "$ROOT/plugin.json" "$ROOT/mcp.json" "$PACKAGE/"
/bin/cp "$ROOT/plugin/launch-macos.sh" "$PACKAGE/plugin/"
/usr/bin/rsync -a "$ROOT/plugin/dist/" "$PACKAGE/plugin/dist/"
/bin/cp "$ROOT/.agents/plugins/marketplace.json" "$PACKAGE/.agents/plugins/"
/bin/cp "$ROOT/docs/background-panel.md" "$ROOT/docs/panel-design.md" "$ROOT/docs/in-app-studio.md" "$PACKAGE/docs/"
/usr/bin/rsync -a --exclude '.DS_Store' "$ROOT/skills/" "$PACKAGE/skills/"
/usr/bin/rsync -a \
  --exclude '.git/' \
  --exclude '.DS_Store' \
  --exclude '.env' \
  --exclude '.env.*' \
  --exclude '/release/' \
  --exclude '/runtime/' \
  --exclude '/tests/' \
  --exclude '/docs/' \
  "$ROOT/macos/" "$PACKAGE/macos/"

# Installed runtime links need the standalone prompt guides and their assets.
"$ROOT/macos/scripts/prepare-standalone-docs.sh" "$PACKAGE/macos" "$ROOT/docs"
rewrite_links() {
  local file="$1"
  [ -f "$file" ] || return 0
  /usr/bin/sed \
    -e 's#\.\./docs/#docs/#g' \
    -e 's#\.\./windows/#https://github.com/timmyc07/Xskin/tree/main/windows/#g' \
    "$file" > "${file}.standalone"
  /bin/mv "${file}.standalone" "$file"
}
rewrite_links "$PACKAGE/macos/README.md"
if [ -f "$PACKAGE/macos/presets/README.md" ]; then
  /usr/bin/sed 's#\.\./\.\./docs/#../docs/#g' \
    "$PACKAGE/macos/presets/README.md" > "$PACKAGE/macos/presets/README.md.standalone"
  /bin/mv "$PACKAGE/macos/presets/README.md.standalone" "$PACKAGE/macos/presets/README.md"
fi
/usr/bin/find "$PACKAGE" -type f \( -name '.DS_Store' -o -name '._*' \) -delete
/bin/chmod 755 "$PACKAGE/macos"/*.command "$PACKAGE/macos"/scripts/*.sh
/bin/chmod 755 "$PACKAGE/plugin/launch-macos.sh"
/usr/bin/codesign --verify --deep --strict "$PACKAGE/macos/native/Xskin.app"
/bin/mkdir -p "$(dirname "$ARCHIVE")"
COPYFILE_DISABLE=1 /usr/bin/ditto -c -k --keepParent --norsrc --noextattr "$PACKAGE" "$ARCHIVE"
SHA256="$(/usr/bin/shasum -a 256 "$ARCHIVE" | /usr/bin/awk '{print $1}')"
/usr/bin/printf '%s  %s\n' "$SHA256" "$(basename "$ARCHIVE")" > "${ARCHIVE%.zip}.sha256"
/usr/bin/printf 'Created %s\nSHA-256 %s\n' "$ARCHIVE" "$SHA256"
