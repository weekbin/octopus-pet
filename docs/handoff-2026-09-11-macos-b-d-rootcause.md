# Handoff 2026-09-11: macOS B/D 根因诊断 (canvas 未绘制)

> **状态**: 根因定位完成 / 真治本需 mcode 客户端验证
> **症状**: macOS 端 `bin/octopus-pet.macos.bin --gui` 启动后, screencapture 抓 5s/12s/19s/30s 多张图, 桌宠 (200, 200) 116×116 区域:
> - 92% 桌面背景色 (250, 250, 250) + 8% 桌面文字像素
> - 0% 章鱼珊瑚色 (246, 138, 134)
> - 3 帧像素差 = 0 (canvas 完全未动)

## 1. 排除假设: transparent 浮窗

**对照实验** (2026-09-11 15:36 实测):
| conf `transparent` | (200, 200) 区 coral 像素 | log overlay 区 dark 像素 | 跟 baseline (无 Tauri) diff |
|---|---|---|---|
| `true` (cc9274e 状态) | 0 | 121 | 0 |
| `false` (f43780e 治标) | 98 | 121 | 0 |
| baseline 无 Tauri | 0 | 121 | — |

**结论**: transparent 是 true 还是 false, Tauri 浮窗在 macOS 端 GUI 模式 + mcode Electron 客户端同进程环境下**都不可见**。
- 98 coral 像素 (transparent: false) vs 13456 浮窗总像素 = 0.7%, 远小于预期 (整片 #ff8298 兜底)
- log overlay 区 dark 像素 121 跟 baseline 完全相同, 说明 Tauri webview 渲染**根本不在该位置**

## 2. 根因 (按可能性排序)

### 假设 A: GUI mode 浮窗在 mcode 同进程下被覆盖 (最可能)
- mcode Electron 客户端占满 top layer (screencapture 默认抓 top layer)
- Tauri 透明浮窗 anchor 在 (200, 200), 但 mcode 主窗口也在 (200, 200) 附近
- 物理像素 3024×1964 显示器, mcode 客户端用主屏整个区域
- Tauri 浮窗实际渲染了, 但被 mcode 主窗口盖住, screencapture 抓不到

### 假设 B: setup 钩子 set_position(200, 200) 在 macOS 端不生效
- gui.log 显示 `pet window anchored at absolute (200, 200) on monitor 3024x1964 at (0, 0)` — anchor log 写了
- 但 macOS WKWebView + transparent 浮窗, set_position 实际可能落到屏幕边缘或屏外
- screencapture 抓不到 → B/D fail 表现为"canvas 没绘制"

### 假设 C: WebKit 进程没起 / webview 加载失败
- gui.log 没有 [webview] 行 (3e650d2 diag bridge)
- 但 transparent: false 也没有 [webview] 行 → 跟 transparent 无关
- webview 端 console.* hook 可能没注册 (main.tsx 在 import 阶段 crash?)

## 3. 真治本路径 (单开 thread)

**用户手动验证** (用 mcode 客户端加载 binary):
```bash
cd /Users/yangweibin/Documents/cute
git push origin main    # 推 3 commit: cc9274e + 3e650d2 + d4ddcd2
# 然后用 mcode 客户端加载 bin/octopus-pet.macos.bin (32M, 含 3 commit)
```

mcode 客户端走自己 webview 容器, 跟 GUI 模式 (`--gui` flag) 行为**根本不同**:
- GUI 模式: Tauri 自建浮窗, transparent: true, set_position(200, 200) — 跟 mcode 同进程可能冲突
- mcode 客户端: mcode plugin container 加载 binary, 走 mcode 自己的窗口/IPC, 不走 Tauri 浮窗

如果 mcode 客户端加载后 B/D 都 OK, 假设 A 验证, 不需要修代码.
如果 mcode 客户端也 fail, 假设 B/C 待查 (setup 钩子 set_position, webview 加载路径).

## 4. 临时诊断桥 (保留)

3e650d2 (4 文件) 保留作活体诊断工具:
- `app/src/main.tsx` console.* hook → DOM log overlay + emit('webview-log')
- `app/src/state/apng.ts` loadApng fetch + parse 阶段 [webview-diag] log
- `app/src/hooks/useAnimation.ts` provider.create 成功/失败 + canvas null log
- `src-tauri/src/lib.rs` setup 钩子 app.listen('webview-log') → tracing::info!

**当前状态**: bridge 代码就位, 但 webview 端 emit 没在 gui.log 出现 (transparent: true/false 都不出现).
- 真实可能是 webview 根本没运行 (透明浮窗 + mcode 覆盖)
- 也可能是 `__TAURI__.event.emit` API 路径在 Tauri 2 不同

**待 mcode 客户端加载后**:
- mcode 加载时 console.log 会进 overlay + gui.log
- 看 [webview-diag] 行: apng.js 加载阶段, parse 阶段, provider.create 阶段哪一步 fail
- 看 [webview] 行 (从 emit 进来): 任何 console.log/error/warn

## 5. 不需要做的事

- ❌ 不要改 transparent (对照实验已确认 transparent 不是根因)
- ❌ 不要改 canvas 渲染路径 (transparent: false 也救不了, 不是 canvas 问题)
- ❌ 不要 revert 3e650d2 diag bridge (用户选了"保留当活体诊断工具")
- ❌ 不要换 webview 后端 (GTK cairo) — 那是 W3 真治本, 1.5 天, 单独 thread

## 6. 关键文件 (后续 debug 看 diff)

```bash
# 看 transparent 配置历史
git log --oneline -10 -- src-tauri/tauri.conf.json
# 看 diag bridge 改动
git show 3e650d2 --stat
# 看 macOS 透明浮窗修复
git show cc9274e --stat
```

## 7. 实测命令 (复现 B/D)

```bash
cd /Users/yangweibin/Documents/cute
pkill -f "octopus-pet.macos" 2>/dev/null; sleep 1
nohup ./bin/octopus-pet.macos.bin --gui > /tmp/octopus-bd-test.log 2>&1 &
sleep 6
screencapture -x -t png /tmp/bd-test.png
pkill -f "octopus-pet.macos"
python3 -c "
from PIL import Image
import numpy as np
img = np.array(Image.open('/tmp/bd-test.png').convert('RGB'))
pet = img[200:316, 200:316]
coral = np.all(np.abs(pet.astype(int) - np.array([255, 130, 152])) < 30, axis=2)
print(f'coral pixels: {coral.sum()} (expected: 13000+ if Tauri webview rendered)')
"
```

期望: 当前实测 ~0-100 coral pixels (B/D fail), mcode 客户端加载后 13000+ (B/D pass).
