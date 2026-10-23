#!/bin/bash

# Dynamically load one pure image as the active theme.
# Hot-applies when CDP is already open (fast).

set -euo pipefail
. "$(cd "$(dirname "$0")" && pwd -P)/common-macos.sh"

IMAGE=""
THEME_NAME=""
FROM_LIBRARY=""
APPLY_NOW="true"
APPEARANCE="auto"
SAFE_AREA="auto"
TASK_MODE="auto"
FOCUS_X=""
FOCUS_Y=""

while [ "$#" -gt 0 ]; do
  case "$1" in
    --file) IMAGE="${2:-}"; shift 2 ;;
    --from-library) FROM_LIBRARY="${2:-}"; shift 2 ;;
    --name) THEME_NAME="${2:-}"; shift 2 ;;
    --appearance) APPEARANCE="${2:-}"; shift 2 ;;
    --safe-area) SAFE_AREA="${2:-}"; shift 2 ;;
    --task-mode) TASK_MODE="${2:-}"; shift 2 ;;
    --focus-x) FOCUS_X="${2:-}"; shift 2 ;;
    --focus-y) FOCUS_Y="${2:-}"; shift 2 ;;
    --no-apply) APPLY_NOW="false"; shift ;;
    *) fail "Unknown argument: $1" ;;
  esac
done

case "$APPEARANCE" in auto|light|dark) ;; *) fail "Invalid appearance: $APPEARANCE" ;; esac
case "$SAFE_AREA" in auto|left|right|center|none) ;; *) fail "Invalid safe area: $SAFE_AREA" ;; esac
case "$TASK_MODE" in auto|ambient|banner|off) ;; *) fail "Invalid task mode: $TASK_MODE" ;; esac

ensure_state_root
ensure_node_runtime
IMAGES_DIR="$STATE_ROOT/images"
THEMES_ROOT="$STATE_ROOT/themes"
/bin/mkdir -p "$IMAGES_DIR" "$THEMES_ROOT"

if [ -n "$FROM_LIBRARY" ]; then
  [ "$(/usr/bin/basename "$FROM_LIBRARY")" = "$FROM_LIBRARY" ] \
    || fail "Library image must be a filename, not a path."
  case "$FROM_LIBRARY" in
    *$'\n'*|*$'\r'*|*'|'*|*'"'*|*'\'*) fail "Unsafe library image filename." ;;
  esac
  IMAGE="$IMAGES_DIR/$FROM_LIBRARY"
fi

[ -n "$IMAGE" ] || fail "Pass --file <image> or --from-library <name-in-images-dir>"
[ -f "$IMAGE" ] || fail "Image not found: $IMAGE"

case "$IMAGE" in
  *.png|*.PNG|*.jpg|*.JPG|*.jpeg|*.JPEG|*.webp|*.WEBP|*.heic|*.HEIC|*.tif|*.tiff|*.TIF|*.TIFF) ;;
  *) fail "Unsupported image type: $IMAGE" ;;
esac

SOURCE_BYTES="$(/usr/bin/stat -f '%z' "$IMAGE")"
[ "$SOURCE_BYTES" -le 52428800 ] || fail "Image larger than 50 MB."

if [ -z "$THEME_NAME" ]; then
  base="$(/usr/bin/basename "$IMAGE")"
  THEME_NAME="${base%.*}"
fi
[ -n "$THEME_NAME" ] || THEME_NAME="我的主题"

theme_id="img-$(/bin/date '+%Y%m%d%H%M%S')-$$"

progress() {
  printf '%s\n' "$*" >&2
  notify_user "$*"
}

progress "Loading image..."

stage="$(/usr/bin/mktemp -d "$STATE_ROOT/.image-import.XXXXXX")"
image_name="background-$theme_id.jpg"
temporary="$stage/$image_name"
cleanup_stage() { /bin/rm -rf "$stage"; }
trap cleanup_stage EXIT

# Prefer copying already-JPEG; sips only when needed (large PNG conversion is the slow part)
ext="$(printf '%s' "$IMAGE" | /usr/bin/tr '[:upper:]' '[:lower:]')"
case "$ext" in
  *.jpg|*.jpeg)
    /bin/cp -f "$IMAGE" "$temporary"
    ;;
  *)
    /usr/bin/sips -s format jpeg -s formatOptions 82 -Z 2400 "$IMAGE" --out "$temporary" >/dev/null \
      || fail "Could not convert image. Use PNG/JPEG/HEIC/TIFF/WebP."
    [ -s "$temporary" ] || fail "Converted image is empty."
    ;;
esac
[ -s "$temporary" ] || fail "Prepared image is empty."
PREPARED_BYTES="$(/usr/bin/stat -f '%z' "$temporary")"
[ "$PREPARED_BYTES" -le 16777216 ] || fail "Prepared image larger than 16 MB."
/bin/chmod 600 "$temporary"

theme_args=(
  custom
  --output-dir "$stage"
  --image "$image_name"
  --name "$THEME_NAME"
  --tagline "Make something wonderful."
  --quote "MAKE SOMETHING WONDERFUL"
  --appearance "$APPEARANCE"
  --safe-area "$SAFE_AREA"
  --task-mode "$TASK_MODE"
)
[ -n "$FOCUS_X" ] && theme_args+=(--focus-x "$FOCUS_X")
[ -n "$FOCUS_Y" ] && theme_args+=(--focus-y "$FOCUS_Y")
"$NODE" "$SCRIPT_DIR/write-theme.mjs" "${theme_args[@]}" >/dev/null
"$NODE" "$INJECTOR" --check-payload --theme-dir "$stage" >/dev/null
lib_dir="$THEMES_ROOT/$theme_id"
/bin/mv "$stage" "$lib_dir"
trap - EXIT

dest_lib_img="$IMAGES_DIR/$(/usr/bin/basename "$IMAGE")"
src_dir="$(cd "$(dirname "$IMAGE")" && pwd -P)"
img_dir="$(cd "$IMAGES_DIR" && pwd -P)"
if [ "$src_dir/$(/usr/bin/basename "$IMAGE")" != "$img_dir/$(/usr/bin/basename "$IMAGE")" ]; then
  /bin/cp -f "$IMAGE" "$dest_lib_img" 2>/dev/null || true
fi

switch_args=(--id "$theme_id")
[ "$APPLY_NOW" = "true" ] || switch_args+=(--no-apply)
exec "$SCRIPT_DIR/switch-theme-macos.sh" "${switch_args[@]}"
