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

# 2. 校验每个 scene 的资源文件存在 (按 animation type 区分)
python3 - "$ROOT" <<'PY'
import json, os, sys, urllib.parse
root = sys.argv[1]
data = json.load(open(f"{root}/scenes.json"))
ids = [s["id"] for s in data["scenes"]]

# ids 唯一
dupes = {x for x in ids if ids.count(x) > 1}
if dupes:
    print(f"ERROR: duplicate scene ids in scenes.json: {dupes}")
    sys.exit(1)

# 每个 scene 的资源文件
ok_count = 0
for s in data["scenes"]:
    sid = s["id"]
    anim = s.get("animation") or {}
    # 兼容: 老 scenes.json 平铺 animationType/animationSource
    if not anim:
        atype = s.get("animationType", "apng")
        asrc = s.get("animationSource", sid)
    else:
        atype = anim.get("type", "apng")
        asrc = anim.get("source", sid)

    # URL (http/https/data) 不查本地文件
    if asrc.startswith(("http://", "https://", "data:")):
        ok_count += 1
        continue

    # 本地文件: 按 type 推断扩展名 + 路径
    if atype == "apng":
        # 1:1 命名约定: /assets/octopus/v2/<id>.png
        path = f"{root}/app/public/assets/octopus/v2/{sid}.png"
    else:
        # 其它类型: 假定 source 已经是相对路径 (含扩展名)
        if asrc.startswith("/"):
            path = f"{root}/app/public{asrc}"
        else:
            # 兼容: 老 scenes.json 写 "detective-study" 这种 scene id
            path = f"{root}/app/public/assets/octopus/v2/{asrc}.{atype}"
            # 没扩展名就当作 scene id 走 1:1 约定 (fallback)
            if not os.path.exists(path) and "." not in asrc:
                path = f"{root}/app/public/assets/octopus/v2/{asrc}"

    if not os.path.exists(path):
        print(f"MISSING: scene={sid} type={atype} expected at {path}")
        sys.exit(1)
    ok_count += 1

print(f"OK: {ok_count} scenes in sync (scenes.json → generated), all assets present")
PY
