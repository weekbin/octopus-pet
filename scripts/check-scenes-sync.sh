#!/usr/bin/env bash
# check-scenes-sync.sh — V2.1 (2026-08-27): 校验场景单一源一致性.
#
# 数据流: scenes.json (唯一源) → build_scene_registry.py 生成
#   - app/src/state/scene-registry.generated.ts
#   - src-tauri/src/scene_registry_generated.rs
#
# 检查:
#   1. scenes.json 是合法 JSON, scene ids 唯一
#   2. 生成的 TS/Rust 文件跟 scenes.json 一致
#   3. 每个 scene 都有对应 APNG 文件
#
# CI 必跑. 任何漂移 = exit 1.

set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# 1. 生成的文件必须跟 scenes.json 一致 (--check 模式)
bash "$ROOT/scripts/build-scene-registry.sh" --check

# 2. 校验每个 scene 都有 APNG 文件
python3 - "$ROOT" <<'PY'
import json, os, sys
root = sys.argv[1]
data = json.load(open(f"{root}/scenes.json"))
ids = [s["id"] for s in data["scenes"]]

# ids 唯一
dupes = {x for x in ids if ids.count(x) > 1}
if dupes:
    print(f"ERROR: duplicate scene ids in scenes.json: {dupes}")
    sys.exit(1)

# APNG 文件存在
for sid in ids:
    p = f"{root}/app/public/assets/octopus/v2/{sid}.png"
    if not os.path.exists(p):
        print(f"MISSING APNG: {p}")
        sys.exit(1)

print(f"OK: {len(ids)} scenes in sync (scenes.json → generated), all APNGs present")
PY
