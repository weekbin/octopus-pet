#!/usr/bin/env bash
# check-scenes-sync.sh — 校验场景清单两源一致 (V1.5, 2026-08-21):
#   1. app/src/state/types.ts         (SCENE_ORDER 字面量数组)
#   2. src-tauri/src/mcp_stdio.rs     (SCENES 常量)
# V1.5 不再用 14 spritesheet-manifest.json: 每个 V2 场景直接由 `<scene>.png` 命名
# (app/public/assets/octopus/v2/<scene>.png), 跟 types.ts SCENE_ORDER 一一对应, 无需
# 第三个 JSON manifest 副本 (减少单源同步负担).
# 改任一源后跑这个; CI 也会跑。任何漂移 = exit 1。

set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

python3 - "$ROOT" <<'PY'
import json
import re
import sys

root = sys.argv[1]

def read(p):
    with open(f"{root}/{p}", encoding="utf-8") as f:
        return f.read()

# 1. types.ts SCENE_ORDER 块
ts = read("app/src/state/types.ts")
start = ts.index("export const SCENE_ORDER")
end = ts.index("as const", start) + len("as const")
t_scenes = re.findall(r'"([a-z0-9-]+)"', ts[start:end])

# 2. mcp_stdio.rs SCENES 块
rs = read("src-tauri/src/mcp_stdio.rs")
r_start = rs.index("pub const SCENES")
r_end = rs.index("];", r_start) + 1
r_scenes = re.findall(r'"([a-z0-9-]+)"', rs[r_start:r_end])

ok = t_scenes == r_scenes
if not ok:
    print("MISMATCH: 场景清单两源不一致")
    print("  types.ts  :", t_scenes)
    print("  mcp_stdio :", r_scenes)
    sys.exit(1)

# 3. 校验每个 scene 都有对应 APNG 文件
import os
for scene in t_scenes:
    apng = f"{root}/app/public/assets/octopus/v2/{scene}.png"
    if not os.path.exists(apng):
        print(f"MISSING APNG: {apng}")
        sys.exit(1)

print(f"OK: {len(t_scenes)} scenes in sync (types.ts == mcp_stdio), all APNGs present")
PY
