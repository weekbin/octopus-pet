#!/usr/bin/env bash
# check-scenes-sync.sh — 校验 14 场景清单三源一致:
#   1. app/src/data/spritesheet-manifest.json   (scenes[].sceneId, 生成脚本产物)
#   2. app/src/state/types.ts                   (SCENE_ORDER 字面量数组)
#   3. src-tauri/src/mcp_stdio.rs               (SCENES 常量)
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

# 1. manifest
manifest = json.loads(read("app/src/data/spritesheet-manifest.json"))
m = [s["sceneId"] for s in manifest["scenes"]]

# 2. types.ts SCENE_ORDER 块
ts = read("app/src/state/types.ts")
start = ts.index("export const SCENE_ORDER")
end = ts.index("as const", start) + len("as const")
t_scenes = re.findall(r'"([a-z0-9-]+)"', ts[start:end])

# 3. mcp_stdio.rs SCENES 块
rs = read("src-tauri/src/mcp_stdio.rs")
r_start = rs.index("pub const SCENES")
r_end = rs.index("];", r_start) + 1
r_scenes = re.findall(r'"([a-z0-9-]+)"', rs[r_start:r_end])

ok = m == t_scenes and m == r_scenes
if not ok:
    print("MISMATCH: 14 场景清单三源不一致")
    print("  manifest  :", m)
    print("  types.ts  :", t_scenes)
    print("  mcp_stdio :", r_scenes)
    sys.exit(1)
print(f"OK: {len(m)} scenes in sync (manifest == types.ts == mcp_stdio)")
PY
