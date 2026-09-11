#!/bin/bash
# Linux 桌宠 GUI 烟雾测试 (NUC Ubuntu 24.04 + GNOME Wayland)
#
# 启动 --gui 5s, 截图左上屏, 验:
# 1. 116×116 浮窗可见 (浅灰方块 / 珊瑚粉 — 取决于 WebKit 是否能渲染)
# 2. octo-pet + WebKit 子进程在跑
# 3. MCP stdio 启动成功 (log 有 "MCP stdio server starting")
#
# 退出码 0 = 通过, 1 = 失败
#
# 用法:
#   bash scripts/smoke-test-linux-gui.sh           # 默认验当前 bin/
#   BIN=path/to/binary bash scripts/smoke-test-linux-gui.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
BIN="${BIN:-$REPO_ROOT/bin/octopus-pet.linux.bin}"

if [ ! -x "$BIN" ]; then
    echo "ERROR: binary not found or not executable: $BIN" >&2
    exit 1
fi

# 清理可能残留的进程
pkill -9 -f octopus-pet 2>/dev/null || true
sleep 1

LOG="/tmp/octopus-smoke.log"
SHOT="/tmp/octopus-smoke.png"
PET_PID=

# 启动 pet, 5s 后检查
"$BIN" --gui > "$LOG" 2>&1 &
PET_PID=$!
sleep 5

cleanup() {
    if [ -n "$PET_PID" ]; then
        kill -9 "$PET_PID" 2>/dev/null || true
        pkill -9 -f octopus-pet 2>/dev/null || true
    fi
}
trap cleanup EXIT

# 检查 1: octo-pet + WebKit 子进程在跑
WEBKIT_PROCS=$(pgrep -af 'WebKitNetworkProcess|WebKitWebProcess' | wc -l)
PET_PROCS=$(pgrep -af 'octopus-pet' | wc -l)
echo "pet processes: $PET_PROCS, WebKit processes: $WEBKIT_PROCS"
if [ "$PET_PROCS" -lt 1 ] || [ "$WEBKIT_PROCS" -lt 2 ]; then
    echo "FAIL: pet or WebKit processes not running" >&2
    echo "log tail:" >&2
    tail -20 "$LOG" >&2
    exit 1
fi

# 检查 2: MCP stdio 启动
if ! grep -q "MCP stdio server starting" "$LOG"; then
    echo "FAIL: MCP stdio server not started" >&2
    tail -20 "$LOG" >&2
    exit 1
fi

# 检查 3: 截图, 验左上屏有浮窗 (浅灰或珊瑚粉)
if ! command -v python3 >/dev/null 2>&1; then
    echo "WARN: python3 not available, skipping screenshot check" >&2
    echo "PASS (process + log only)"
    exit 0
fi

python3 << 'PYEOF'
from PIL import ImageGrab
import numpy as np
import sys
img = ImageGrab.grab().convert('RGB')
img.crop((0, 0, 800, 600)).save('/tmp/octopus-smoke.png')
arr = np.array(img)
# 浮窗应出现在左上屏 (transparent:false 渲染成 250,250,250 浅灰; 治本后 255,130,152 珊瑚粉)
gray = np.all(np.abs(arr.astype(int) - 250) < 5, axis=2)
gray_tl = gray[:500, :500]
ys, xs = np.where(gray_tl)
coral_target = np.array([255, 130, 152])
coral_diff = np.abs(arr.astype(int) - coral_target).sum(axis=2)
coral = (coral_diff < 30)
coral_tl = coral[:500, :500]
coral_ys, coral_xs = np.where(coral_tl)
gray_count = len(xs)
coral_count = len(coral_xs)
print(f'light gray pixels in top-left 500x500: {gray_count}')
print(f'coral pixels in top-left 500x500: {coral_count}')
# 治标 (现状): gray > 5000 (浮窗可见, 内容未渲染)
# 治本 (W3 候选 A): coral > 5000 (body CSS 生效)
# 都算 PASS — 用户能确认浮窗位置
if gray_count < 5000 and coral_count < 5000:
    print('FAIL: no pet window visible in top-left', file=sys.stderr)
    sys.exit(1)
print('PASS: pet window visible in top-left')
if gray_count > coral_count:
    print('  note: 治标 state (gray only, content not rendered — see linux-build.md §7.8)')
else:
    print('  note: 治本 state (coral CSS applied)')
PYEOF
