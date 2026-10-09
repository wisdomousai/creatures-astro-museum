#!/bin/sh
# Rebuild the themed rooms (rooms.py) into the package: assets/rooms/<theme>.glb, their
# rooms.json, and the falling leaf (the rest that lives in them is the crew).
#   sh blender/rooms/build.sh               all of them
#   sh blender/rooms/build.sh jungle snow   these
# Needs Blender 5; set BLENDER if it isn't in /Applications. The pictures are in textures/
# (generate.py, then textures.py, made them).
set -e
here="$(cd "$(dirname "$0")" && pwd)"
BLENDER=${BLENDER:-/Applications/Blender.app/Contents/MacOS/Blender}
OUT="$here/../../packages/astro-creatures-museum/assets/rooms"
RAW="$here/../build/rooms"
mkdir -p "$RAW" "$OUT/sprites"
cp "$OUT/rooms.json" "$RAW/rooms.json" 2>/dev/null || true
"$BLENDER" -b --factory-startup -P "$here/rooms.py" -- "$RAW" "$@" 2>&1 | grep -E '^ROOM|^EXPORTED|Error|Traceback' || true
cp "$RAW/rooms.json" "$OUT/rooms.json"
for glb in "$RAW"/*.glb; do
  name=$(basename "$glb")
  [ $# -eq 0 ] || echo " $* " | grep -q " ${name%.glb} " || continue
  npx -y @gltf-transform/cli@4.5.1 meshopt "$glb" "$OUT/$name" --level medium >/dev/null
  echo "$name: $(wc -c < "$OUT/$name" | tr -d ' ') bytes"
done
cp "$here"/textures/wings-3.webp "$OUT/sprites/"
