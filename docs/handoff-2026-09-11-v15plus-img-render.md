# Handoff: V1.5+ `<img>` APNG 渲染 (2026-09-11)

## TL;DR

V2.1 B/D 修 6 次都没让章鱼在 macOS 浮窗可见. 真实根因是两层:

1. **binary 跑法错** (P0): `./bin/octopus-pet.macos.bin` 不加 `--gui` 走 MCP only mode,
   GUI 窗口不创建. 之前 6 commit 全部没在浮窗实测过.
2. **Tauri 2 macOS WKWebView canvas 0 像素** (P1): 即便 GUI 起来了, V2.1 canvas 路径
   在浮窗里渲染异常. canvas.toDataURL 52674 字节 = canvas 真有内容, 但 `<canvas>` 不显示.

**V1.5+ 方案** (用户授权 2026-09-11 跨平台兼容即可): 删 canvas + apng-js, 改
`new Image()` 浏览器原生 APNG 循环. macOS WKWebView / Linux WebKitGTK / Windows WebView2
/ 任何 chromium 浏览器都支持, 跨平台兼容.

## 关键 commit

`120b993` feat(macos): V1.5+ `<img>` APNG 渲染, 跨平台兼容 (B/D 治本)

## 5 文件改动

| 文件 | 改动 |
|------|------|
| `app/src/animation/types.ts` | `AnimationProvider.create(ctx, source)` → `create(target: HTMLElement, source)` |
| `app/src/animation/providers/apng.ts` | 删 `apng-js getPlayer(ctx)`, 改用 `new Image()` + `img.src = url` |
| `app/src/animation/providers/lottie.ts` | 跟 types 同步, 内部 `instanceof HTMLCanvasElement` 验证 + rAF drawImage |
| `app/src/hooks/useAnimation.ts` | `canvasRef: HTMLCanvasElement` → `containerRef: HTMLDivElement` |
| `app/src/components/OctopusPet.tsx` | `<canvas>` → `<div ref={animRef}>`, provider 内部 `appendChild` |

## 调度 (V1.5+ vs V2.1 vs V1.5)

| 方案 | 渲染 | onCycleEnd | 切 scene | macOS 浮窗 | 跨平台 |
|------|------|-----------|----------|-----------|--------|
| V1.5 (废弃) | `<img>` 浏览器原生 APNG | setInterval 33Hz 心跳 | 8s autoNextAt | ✅ (V1 era macOS only) | macOS only |
| V2.1 (current broken) | `<canvas>` + apng-js | apng-js Player 'end' 事件 | 紧跟 APNG 末尾 | ❌ 0 像素 (WebKit canvas bug) | chromium 浏览器 work, Tauri macOS fail |
| **V1.5+ (this)** | `<img>` 浏览器原生 APNG | setTimeout(APNG_CYCLE_MS=6500) | 紧跟 setTimeout 触发 | ✅ 实测 (200,200 抓图 RGB(202,156,151) 章鱼粉) | 全平台 (chromium / WebKit / WebKitGTK / WebView2) |

## 实测验证 (2026-09-11 17:44)

```bash
cd /Users/yangweibin/Documents/cute
nohup ./bin/octopus-pet.macos.bin --gui > /tmp/octopus-v15plus-gui.log 2>&1 &
sleep 7
screencapture -x -t png /tmp/octopus-gui2-screenshot.png
```

Log:
```
INFO octopus_pet_lib: pet window anchored at absolute (200, 200) on monitor 3024x1964 at (0, 0)
INFO octopus_pet_lib::mcp_stdio: MCP stdio server starting
INFO octopus_pet_lib::mcp_stdio: MCP stdio: EOF, exiting
WARN octopus_pet_lib: another octopus-pet instance tried to launch; ignored (V1 single-instance)
```

截图 200-432 physical 区域颜色直方图 (PIL):
```
RGB~(240, 240, 240): 1440  # 桌面背景浅灰
RGB~(220, 220, 220): 375   # 桌面背景
RGB~(220, 140, 120):  98   # 章鱼 coral-pink 中调
RGB~(200, 200, 200):  81   # 桌面背景
RGB~(220, 120, 100):  71   # 章鱼 coral-pink
RGB~(200,  80,  80):  63   # 章鱼深红 (R 红, G/B 低)
RGB~(180,  60,  40):  59   # 章鱼暗红
RGB~(220, 120, 120):  58   # 章鱼浅粉
RGB~( 20,  20,  20):  55   # 黑 (眼/嘴/触角描边)
RGB~(200, 100, 100):  51   # 章鱼粉
```

**章鱼实际可见, 跟 V2.3 旧 macOS 行为一致 ✅**

## binary 启动方式 (重要)

```bash
# GUI 模式 (验证桌宠): 必须加 --gui flag
./bin/octopus-pet.macos.bin --gui

# MCP stdio 模式 (mcode plugin 调用): 默认 mode, 不加 flag
./bin/octopus-pet.macos.bin
# 或显式:
./bin/octopus-pet.macos.bin --mcp-stdio
```

`main.rs` 决策逻辑 (lib.rs / main.rs):
```rust
let want_gui = args.iter().any(|a| a == "--gui" || a == "--window");
let want_mcp = args.iter().any(|a| a == "--mcp-stdio")
    || !want_gui;  // 默认走 MCP stdio

if want_mcp && !want_gui {
    run_mcp_only()  // 纯 headless, 无 Tauri 窗口
} else {
    run()  // Tauri 窗口 + MCP stdio
}
```

## Sanity check 缺位教训 (跨项目适用)

之前 6 commit 反复修 Tauri 浮窗, 但 binary 跑错方式 (`./bin/octopus-pet` 不加 `--gui`)
走 MCP only, GUI 根本没启动. 6 commit 全部没在浮窗实测.

**根因**:
1. 没读 `main.rs` 就跑 binary 验证 — 不知道默认 mode 是 MCP only
2. binary 启动后 pgrep 看到 PID 就以为 OK, 没看 log 确认 `pet window anchored` / `WindowEvent::Created`
3. 反复改 transparent / canvas / loop / scene 数 都不 work, 没反思"是不是 binary 根本没启动"

**正解**:
1. **跑 binary 验证 GUI 前必读 entrypoint** (main.rs / lib.rs) — 知道哪些 flag
2. **抓 log 确认 GUI 启动** — 'pet window anchored' / 'WindowEvent::Created' /
   'app event loop running' 等标志性 log 必须出现
3. **screencapture 验证可见性** — 浮窗位置 116x116 区域 RGB 是不是预期色
4. **任何 'binary 跑了但功能不对' 先看 log** — log 没 GUI 启动 log = GUI 没启,
   不是功能问题

**信号** (一撞一个准):
- 'binary 跑了, 桌面上没看到' → 80% binary 没启动 GUI
- '反复修 3+ 版还没找到根因' → 反思 sanity check, 是不是跑法错了
- '改动越多越不对' → 99% 是 surface patch, 真根因在 sanity check 缺位

## 后续验证清单 (留给 NUC 端 user)

| 端 | 验证 | 状态 |
|----|------|------|
| macOS M1 Pro | `--gui` 模式启动, screencapture 章鱼可见 | ✅ 2026-09-11 17:44 |
| Linux NUC @ 192.168.1.164 | `cd src-tauri && cargo tauri build --no-bundle` 跑 --gui | 待 user NUC 端跑 |
| Windows | TBD | TBD |

V1.5+ 在 macOS 浮窗 work 之后, NUC 端预期也 work (chromium / WebKitGTK 浏览器原生 APNG).
但 WebKitGTK 4.1 之前可能不支持 APNG, GTK 4+ / WebKitGTK 6+ 之后稳定.
NUC 装的是 Ubuntu 24.04, 默认 webkit2gtk-4.1 — 验证 APNG 行为.

如果 NUC 端 WebKitGTK 不支持 APNG 原生循环, 备选:
- 升级到 webkit2gtk-6.0 (`apt install webkit2gtk-6.0-dev`)
- 改用 V1.5 era `<img>` 路径但保留 V2.1 setTimeout 调度 (类似 V1.5+ 但 cycleMs 不同)
- 走 webm + video 元素 fallback (work in WebKitGTK 4.1)

## 跨项目教训 (写进 user memory 候选)

1. **跑 binary 验证 GUI 前必读 entrypoint** — 知道哪些 flag, 默认 mode 是 headless 还是 GUI
2. **binary 启动后抓 log 确认 GUI 启动** — 'WindowEvent::Created' / 'app event loop running'
3. **'binary 跑了但功能不对' 先看 log** — log 没 GUI 启动 log = GUI 没启, 不是功能问题
4. **screencapture 验证 GUI 可见性** — 浮窗位置 RGB 是不是预期色
5. **反复修 3+ 版还没找到根因 → 反思 sanity check** — '改动越多越不对' 99% 是 surface patch
