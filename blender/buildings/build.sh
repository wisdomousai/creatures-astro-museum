#!/bin/sh
# A building of your own, for museum({ building: '/museum/building.glb' }):
#   sh blender/buildings/build.sh                      the sample (template.py)
#   sh blender/buildings/build.sh mine.blend           yours
# into starter/public/museum/building.glb (or the second argument), compressed, then
# checked (npm run museum:check). Needs Blender 5; set BLENDER if it isn't in /Applications.
set -e
here="$(cd "$(dirname "$0")" && pwd)"
BLENDER=${BLENDER:-/Applications/Blender.app/Contents/MacOS/Blender}
SRC=${1:-}
OUT=${2:-"$here/../../starter/public/museum/building.glb"}
RAW="$here/../build/building.raw.glb"
mkdir -p "$here/../build" "$(dirname "$OUT")"
if [ -z "$SRC" ]; then
  "$BLENDER" -b --factory-startup -P "$here/template.py" -- "$RAW" 2>&1 | grep -E '^PLAN|^EXPORTED|Error|Traceback' || true
else
  "$BLENDER" -b "$SRC" -P "$here/../export_building.py" -- "$RAW" 2>&1 | grep -E '^PLAN|^EXPORTED|Error|Traceback' || true
fi
npx -y @gltf-transform/cli@4.5.1 meshopt "$RAW" "$OUT" --level medium >/dev/null
echo "building.glb: $(wc -c < "$OUT" | tr -d ' ') bytes"
node "$here/../../packages/astro-creatures-museum/bin/check-building.mjs" "$OUT"
