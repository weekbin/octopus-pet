#!/usr/bin/env bash
# generate-spritesheet-manifest.sh — Emit a JSON manifest describing each spritesheet.
#
# The React loader needs to know per-scene:
#   - cellSize (px)         : 192
#   - cols                  : 71 (WebP max dim 16383, 141 frames / 2 rows = 71 cols)
#   - rows                  : 2
#   - frameCount            : 141
#   - fileSize              : bytes
#   - alphaMode             : "RGB" | "RGBA" (for V2 transparent rendering)
#   - fileName              : spritesheet-<scene>.webp
#
# Output: app/src/data/spritesheet-manifest.json  (the ONLY copy; imported by the frontend)
#
# Usage:
#   scripts/generate-spritesheet-manifest.sh [--assets-dir <dir>] [--output <path>]

set -euo pipefail

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_ROOT="$( cd "$SCRIPT_DIR/.." && pwd )"

ASSETS_DIR="$PROJECT_ROOT/app/public/assets/octopus"
# 唯一 manifest: 前端 import 的路径 (app/src/data/), 不再是 public 副本
OUTPUT="$PROJECT_ROOT/app/src/data/spritesheet-manifest.json"

# 14 scenes in plan order (§1.9.2 OctopusScene enum)
SCENES=(
  "pretend-busy|01-pretend-busy"
  "stay-late|02-stay-late"
  "breakdown|03-breakdown"
  "lying-flat|04-lying-flat"
  "multi-tasking|05-multi-tasking"
  "payday|06-payday"
  "salary-rejected|07-salary-rejected"
  "treat-milk-tea|08-treat-milk-tea"
  "friday-5pm|09-friday-5pm"
  "toilet-slacking|10-toilet-slacking"
  "touch-fish|11-touch-fish"
  "waiting-m3pro|12-waiting-m3pro"
  "soul-leaving|13-soul-leaving"
  "multitask|14-multitask"
)

usage() {
  cat <<'EOF'
usage: generate-spritesheet-manifest.sh [--assets-dir <dir>] [--output <path>]
EOF
}

while [ $# -gt 0 ]; do
  case "$1" in
    --assets-dir) ASSETS_DIR="$2"; shift 2 ;;
    --output)     OUTPUT="$2"; shift 2 ;;
    -h|--help)    usage; exit 0 ;;
    *)            echo "unknown arg: $1" >&2; usage; exit 1 ;;
  esac
done

if [ ! -d "$ASSETS_DIR" ]; then
  echo "ERROR: assets dir not found: $ASSETS_DIR" >&2
  exit 1
fi

# Build JSON via python (cleaner than bash for this).
python3 - "$ASSETS_DIR" "$OUTPUT" "${SCENES[@]}" <<'PYEOF'
import json
import os
import sys
from pathlib import Path

assets_dir = sys.argv[1]
output_path = sys.argv[2]
scenes_arg = sys.argv[3:]

# parse scene list
scenes = []
for entry in scenes_arg:
    scene_id, dir_name = entry.split("|", 1)
    scenes.append({"sceneId": scene_id, "dirName": dir_name})

# Probe each spritesheet for actual dimensions, file size, alpha mode
manifest = {
    "$schema": "./spritesheet-manifest.schema.json",
    "version": "1.0.0",
    "generatedAt": None,  # filled below
    "cellSize": 192,
    "defaultFrameCount": 141,
    "defaultRows": 2,
    "defaultCols": 71,
    "webpMaxDim": 16383,
    "format": "webp",
    "scenes": [],
}

from datetime import datetime, timezone
manifest["generatedAt"] = datetime.now(timezone.utc).isoformat()

try:
    from PIL import Image
    has_pil = True
except ImportError:
    has_pil = False

for s in scenes:
    sheet_path = Path(assets_dir) / f"spritesheet-{s['dirName']}.webp"
    entry = {
        "sceneId": s["sceneId"],
        "dirName": s["dirName"],
        "fileName": sheet_path.name,
        "fileSize": sheet_path.stat().st_size if sheet_path.exists() else 0,
        "exists": sheet_path.exists(),
        "cols": 71,
        "rows": 2,
        "frameCount": 141,
        "width": 13632,
        "height": 384,
        "alphaMode": "RGB",  # V1 reality
    }
    if sheet_path.exists() and has_pil:
        try:
            with Image.open(sheet_path) as im:
                entry["width"] = im.width
                entry["height"] = im.height
                cols = im.width // 192
                rows = im.height // 192
                entry["cols"] = cols
                entry["rows"] = rows
                entry["frameCount"] = min(cols * rows, 141)  # last cell may be empty
                entry["alphaMode"] = "RGBA" if "A" in im.mode else "RGB"
        except Exception as e:
            print(f"warn: failed to read {sheet_path}: {e}", file=sys.stderr)
    manifest["scenes"].append(entry)

# summary
total_bytes = sum(s["fileSize"] for s in manifest["scenes"])
manifest["totalSize"] = total_bytes
manifest["sceneCount"] = len(manifest["scenes"])

Path(output_path).parent.mkdir(parents=True, exist_ok=True)
with open(output_path, "w") as f:
    json.dump(manifest, f, indent=2, ensure_ascii=False)
    f.write("\n")
print(f"wrote {output_path}")
print(f"  {manifest['sceneCount']} scenes, {total_bytes} bytes ({total_bytes/1024/1024:.1f} MB)")
PYEOF
