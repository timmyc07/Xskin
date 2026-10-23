#!/bin/bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd -P)"
. "$ROOT/macos/scripts/common-macos.sh"
discover_codex_app
require_macos_runtime
exec "$NODE" "$ROOT/plugin/dist/server.mjs" "$ROOT/macos"
