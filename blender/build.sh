#!/bin/sh
# Rebuild the museum's kit (pieces.py) into the package: assets/kit/kit.glb. Needs Blender
# 5; set BLENDER if it isn't in /Applications.
set -e
cd "$(dirname "$0")"
BLENDER=${BLENDER:-/Applications/Blender.app/Contents/MacOS/Blender}
OUT=../packages/astro-creatures-museum/assets/kit
mkdir -p build "$OUT"
"$BLENDER" -b --factory-startup -P export_kit.py -- build/kit.raw.glb 2>&1 | grep -E '^PIECE|^EXPORTED|Error|Traceback' || true
npx -y @gltf-transform/cli@4.5.1 meshopt build/kit.raw.glb "$OUT/kit.glb" --level medium >/dev/null
echo "kit.glb: $(wc -c < "$OUT/kit.glb" | tr -d ' ') bytes"
