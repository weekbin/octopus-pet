# V1.5+ 跨平台兼容渲染管线 (Production Reference)

> **状态**: ✅ V1.5+ 已定稿 (2026-09-11, commit `120b993`)
> **场景**: 桌宠 8 scene APNG 在 116×116 透明浮窗渲染
> **跨平台**: macOS WKWebView / Linux WebKitGTK / Windows WebView2 / 任何 chromium 浏览器
> **替代**: V2.1 (apng-js + canvas, 2026-08-27, 已 deprecated — Tauri 2 macOS WebKit canvas 0 像素 bug)

---

## 1. 管线总览 (TL;DR)

```
上游 H3 视频 (6s mp4)                 浏览器渲染
  ↓ v10-final 6 阶段                  ↓ V1.5+ (本文档)
  8 张 APNG (192×192, 99 帧)            <img src=...> 浏览器原生循环
  ↓                                    ↓
  app/public/assets/octopus/v2/*.png  →  116×116 透明浮窗
                                        (macOS / Linux / Windows 都 work)
```

**核心思路**: 浏览器原生 APNG 渲染 (跨 webview 后端一致), 不依赖 canvas + apng-js
(后者在 Tauri macOS WKWebView 浮窗里 0 像素).

**vs V2.1 差异**: 删 `apng-js` 依赖, 删 `<canvas>` 渲染, 改 `<img>` 浏览器原生.
FSM/XState/场景 registry 全部不动 — 只动 5 个文件.

---

## 2. 5 个核心文件 (架构)

| 文件 | 角色 | 关键改动 vs V2.1 |
|------|------|------------------|
| `app/src/animation/types.ts` | `Animation` + `AnimationProvider` 接口 | `create(ctx, source)` → `create(target: HTMLElement, source)`. provider 内部自治创建 element |
| `app/src/animation/providers/apng.ts` | APNG provider 实现 | 删 `apng-js getPlayer(ctx)`, 改 `new Image()` + `img.src = url`. onCycleEnd 用 `setTimeout(APNG_CYCLE_MS=6500)` |
| `app/src/animation/providers/lottie.ts` | Lottie provider (预留, 跟 types 同步) | 内部 `instanceof HTMLCanvasElement` 验证 + rAF drawImage |
| `app/src/hooks/useAnimation.ts` | 通用 hook | `canvasRef: HTMLCanvasElement` → `containerRef: HTMLDivElement` |
| `app/src/components/OctopusPet.tsx` | 桌宠根组件 | `<canvas>` → `<div ref={animRef}>`, provider 内部 `appendChild` |

不动文件 (跨方案保持):
- `app/src/state/octopus-fsm.ts` — XState FSM, rotateScene 逻辑零变化
- `app/src/state/types.ts` — `OctopusState` / `OctopusEvent` / `BUBBLE_DURATION_MS` 不变
- `scenes.json` + `app/src/state/scene-registry.generated.ts` — scene 元数据, 单一源
- `src-tauri/src/{actions,lib,main,mcp_stdio,state_bridge}.rs` — Rust 后端零变化
- `src-tauri/tauri.{conf,macos.conf,linux.conf}.json` — Tauri 配置零变化

---

## 3. Animation 抽象 (4 个 lifecycle)

```typescript
// 1. 启动: OctopusPet 渲染时
const anim = await provider.create(target, source);  // target = containerRef.current (HTMLDivElement)
anim.start();                                          // 浏览器原生循环 APNG + setTimeout 计时
const unsubCycle = anim.onCycleEnd(() => {
  send({ type: "SCENE_LOOPED" });                     // FSM rotateScene 切下一 scene
});

// 2. 切 scene: OctopusPet 重渲染, useEffect cleanup 触发
//    → unsubCycle() + anim.stop() (clearTimeout + img.remove) + target.replaceChildren()

// 3. 关窗: OctopusPet unmount, 同一 cleanup 路径
//    → 所有 scene timer / image 资源释放
```

**接口** (不变):
```typescript
interface Animation {
  start(): void;
  stop(): void;
  onCycleEnd(callback: () => void): () => void;  // 返回 unsubscribe
  readonly nativeWidth: number;                  // 192 (APNG 源尺寸)
  readonly nativeHeight: number;                 // 192
  readonly cycleMs: number;                      // 6500 (APNG 循环时长)
}

interface AnimationProvider {
  readonly type: string;                         // "apng" / "lottie" / "video" / ...
  create(target: HTMLElement, source: string): Promise<Animation>;
}
```

**新接口关键点**: `create(target, source)` 替代 `create(ctx, source)`. Provider 内部
决定用 `<img>` / `<canvas>` / `<video>` / `<svg>`, 调用方不感知. 加新动画格式零改
FSM/useAnimation/OctopusPet.

---

## 4. Build + Run (生产方式)

### 4.1 开发模式 (vite dev + Tauri window)

```bash
cd /Users/yangweibin/Documents/cute
cd app && npm install
cd ../src-tauri && cargo build
cd .. && npm run tauri:dev
# → Vite dev server :1420 + Tauri 浮窗 (transparent 116x116)
```

### 4.2 生产构建 (产出 binary)

```bash
cd /Users/yangweibin/Documents/cute
bash scripts/run-vite.sh build                 # vite build (走统一的 run-vite.sh wrapper, 跨 CWD 一致)
cd src-tauri && cargo tauri build --no-bundle   # 1m~1m30s release build
# 产物: src-tauri/target/release/octopus-pet (32.78MB 含 8 APNG)
```

**关键约束**:
- 必须走 `cargo tauri build --no-bundle`, 裸 `cargo build` 增量会跳过 asset 嵌入 (binary < 5MB = 缺 assets)
- 跨平台 beforeBuildCommand CWD 差异由 `tauri.macos.conf.json` / `tauri.linux.conf.json` 自动 merge (commit `d4ddcd2`), 不要自己改 conf
- 1m13s 干净 build 多次实测, 0 warning (除 `BUBBLE_LINES` / `jsonrpc` 2 个 dead-code, 不影响功能)

### 4.3 跑 binary (3 种 mode)

| Mode | 命令 | 用途 |
|------|------|------|
| **GUI 浮窗** | `./bin/octopus-pet.macos.bin --gui` | **验证桌宠** (本机桌面上看章鱼) |
| **MCP stdio (default)** | `./bin/octopus-pet.macos.bin` | mcode plugin 加载 (走 plugin container, 跟 GUI 不同) |
| **MCP + HTTP fallback** | `OCTOPUS_HTTP_FALLBACK=true ./bin/octopus-pet.macos.bin` | V1 demo, port 9527 |

**关键 flag**:
- `--gui` / `--window` → 启 Tauri 浮窗 + MCP stdio
- `--mcp-stdio` → 显式 headless MCP only (无 Tauri 窗口, 默认)
- 都不传 → 默认走 `--mcp-stdio` (headless, **GUI 不启动**)
- mcode plugin 加载走 default mode (无 --gui), 因为走 plugin container 不是 GUI 模式

`main.rs:24` 决策逻辑:
```rust
let want_gui = args.iter().any(|a| a == "--gui" || a == "--window");
let want_mcp = args.iter().any(|a| a == "--mcp-stdio")
    || !want_gui;  // 默认走 MCP stdio (无 GUI)

if want_mcp && !want_gui {
    run_mcp_only()  // 纯 headless
} else {
    run()          // Tauri 窗口 + MCP stdio
}
```

### 4.4 发布产物

```bash
# 标准发布流
bash scripts/release-plugin.sh
# 产物: bin/octopus-pet.bin (32.78MB, 内嵌 8 APNG)
# 必须: git add bin/octopus-pet.bin 随 commit 提交 (repo 本身即插件, clone 零构建可加载)
```

---

## 5. 验证 (sanity check 必做)

### 5.1 GUI 启动确认 (3 步)

```bash
# 1. 跑 binary --gui, background
nohup ./bin/octopus-pet.macos.bin --gui > /tmp/octopus-gui.log 2>&1 &
sleep 7

# 2. 抓 log 确认 GUI 启动
tail /tmp/octopus-gui.log
# 期望看到:
#   INFO octopus_pet_lib: pet window anchored at absolute (200, 200) on monitor 3024x1964 at (0, 0)
#   INFO octopus_pet_lib::mcp_stdio: MCP stdio server starting
#   INFO octopus_pet_lib::mcp_stdio: MCP stdio: EOF, exiting
# (MCP stdio EOF 是因为 stdin 是 /dev/null, 正常; Tauri 主线程继续跑)

# 3. 抓屏验证章鱼可见
screencapture -x -t png /tmp/octopus-gui-screenshot.png
python3 -c "
from PIL import Image
img = Image.open('/tmp/octopus-gui-screenshot.png')
# 浮窗 200-432 physical (200, 200) + 232x232 (DPI 2x)
region = img.crop((200, 200, 432, 432))
import collections
counter = collections.Counter()
for y in range(200, 432, 4):
    for x in range(200, 432, 4):
        p = img.getpixel((x, y))
        key = (p[0]//20*20, p[1]//20*20, p[2]//20*20)
        counter[key] += 1
print('top 10 colors in 200-432 region:')
for c, n in counter.most_common(10):
    print(f'  RGB~{c}: {n}')
# 期望看到章鱼 coral-pink: RGB~(220,140,120) / (220,120,100) / (200,80,80) / (180,60,40)
# 期望看到黑描边: RGB~(20,20,20)
"
```

### 5.2 single-instance 验证

`tauri-plugin-single-instance` 自动阻止第二个 binary 启动. log 看到:
```
WARN octopus_pet_lib: another octopus-pet instance tried to launch; ignored (V1 single-instance)
```
说明 plugin 工作正常. 第二个 binary 立即退出, 第一个继续跑 (win).

### 5.3 FSM 单元测试

```bash
cd app && npm test
# 期望: 16 Vitest tests pass (FSM 状态机 + rotateScene 随机去重 + bubble + click)
```

```bash
cd src-tauri && cargo test
# 期望: 8 MCP stdio roundtrip tests pass (initialize / tools/list / tools/call 各 tool)
```

### 5.4 plugin spec 校验

```bash
bash scripts/lint-octopus-plugin.sh
# 期望: 16/16 spec schema 校验通过
```

```bash
bash scripts/check-scenes-sync.sh
# 期望: 8 scene 三源一致 (types.ts / manifest / mcp_stdio.rs)
```

---

## 6. 加新场景 5 步

上游 H3 视频 → APNG 走 `docs/pipeline.md` (v10-final 6 阶段). 上游产完 192×192
APNG 后:

```bash
# 1. 放 APNG 到 v2/ 目录
cp new-scene.png app/public/assets/octopus/v2/

# 2. 改 scenes.json 加 entry
# (项目根 scenes.json, 跟现有 8 entry 同 schema)
{
  "id": "new-scene",
  "source": "H3 描述",
  "bubbleLines": ["气泡 1", "气泡 2", "..."]
}

# 3. 跑 scene registry build 脚本
bash scripts/build-scene-registry.sh
# 生成 app/src/state/scene-registry.generated.ts + src-tauri/src/scene_registry_generated.rs

# 4. 校验
bash scripts/check-scenes-sync.sh
bash scripts/lint-octopus-plugin.sh
cd app && npm test
cd src-tauri && cargo test

# 5. 重 build + 跑 --gui 验证
bash scripts/run-vite.sh build
cd src-tauri && cargo tauri build --no-bundle
./target/release/octopus-pet --gui
# screencapture 抓图看 new-scene 可见 + RGB 检查 coral-pink
```

业务代码零修改 — `SCENE_IDS` / `SCENE_ORDER` / `BUBBLE_BY_SCENE` 自动从 `scenes.json`
生成, 8 scene FSM 立刻支持 9 scene.

---

## 7. 加新动画格式 4 步 (例: lottie)

```bash
# 1. 在 app/src/animation/providers/ 下加 provider
#    LottieProvider.ts 实现 LottieAnimation (implements Animation) + lottieProvider (AnimationProvider)
#    target: HTMLElement 内部, 验证 instanceof HTMLCanvasElement + rAF drawImage
#    cycleMs 算 totalFrames / frameRate

# 2. 在 main.tsx 注册
animationRegistry.register("lottie", lottieProvider);

# 3. scenes.json 加 entry
{
  "id": "x",
  "animation": { "type": "lottie", "source": "/assets/lottie/x.json" },
  "bubbleLines": [...]
}

# 4. 跑 build-scene-registry + check-scenes-sync
bash scripts/build-scene-registry.sh
bash scripts/check-scenes-sync.sh
```

FSM/OctopusPet/useAnimation 零修改, 业务代码 (CLICK/PET/ASK/DRAG/ROTATE_NOW) 也
不知道 scene 是 APNG 还是 Lottie.

---

## 8. 跨平台兼容性矩阵

| 平台 | WebView | `<img>` 原生 APNG | 实测验证 | 备注 |
|------|---------|-------------------|---------|------|
| **macOS M1 Pro** | WKWebView | ✅ | ✅ 2026-09-11 17:44 | binary 32.78MB, screencapture 章鱼 RGB(202,156,151) 实测可见 |
| **Linux NUC @ 192.168.1.164** | WebKitGTK 4.1 | ⚠️ 需验证 | 待 user NUC 端跑 | Ubuntu 24.04 默认 webkit2gtk-4.1, 早期版本可能不支持 APNG 原生循环, GTK 4+ / WebKitGTK 6+ 稳定 |
| **Windows** | WebView2 | ✅ 预期 | TBD | chromium 内核, `<img>` 原生 APNG 应该一致 |
| **Chromium 浏览器** (vite dev) | chromium | ✅ | ✅ 2026-09-11 | `http://127.0.0.1:1420` Vite dev server, canvas.toDataURL 52674 字节验证 canvas 正常 |
| **NUC WebKitGTK 不支持时备选** | — | — | — | 升级 webkit2gtk-6.0, 或走 webm+video fallback |

如果 NUC 端 WebKitGTK 4.1 不支持 APNG 原生循环, 优先级:
1. 升级到 `apt install webkit2gtk-6.0-dev` (最简单, GTK 4+ 内置)
2. 退到 V2.1 apng-js + canvas 路径 (在 chromium work, 但 Tauri macOS fail, **不能选**)
3. 走 webm+video 元素 fallback (需要 ffmpeg-full 编码, 慢)

---

## 9. 已知 trade-off (V1.5+ vs 旧方案)

| 维度 | **V1.5+ (default)** | V2.1 (deprecated) | V1.5 (legacy) |
|------|---------------------|-------------------|----------------|
| 渲染元素 | `<img>` 浏览器原生 | `<canvas>` + apng-js | `<img>` |
| onCycleEnd | `setTimeout(APNG_CYCLE_MS=6500)` | apng-js 'end' 事件 | setInterval 33Hz 心跳 |
| 调度精度 | 紧跟 setTimeout 触发 (0 漂移) | 紧跟 APNG 末尾 (0 漂移) | 8s autoNextAt (P1 中段剪切) |
| macOS Tauri 浮窗 | ✅ 实测 RGB 验证 | ❌ 0 像素 (WebKit canvas bug) | ✅ (V1 era) |
| 跨平台 (macOS / Linux / Windows) | 全平台 work | chromium only | macOS only |
| 依赖 | 无 (浏览器原生) | apng-js 1.1.5 | 无 |
| bundle size (gzip) | 80.23 KB | 80+ KB (apng-js 50KB) | 80 KB |
| 后台 tab / 系统 sleep | setTimeout 节流 (V2.1 RAF 同样受) | 几乎不受 | setInterval 节流 |
| 切 scene 中段 | < 1s 误差 (cycleMs 写死 6500) | 0 (紧跟 APNG 末尾) | P1 bug (8s 跟 6.5s 循环不整除) |
| V2.1 long-term bug (P1-P4) | P1 残留 (写死 cycleMs 引入), P2/P3/P4 治 | 全部治 (2026-08-27) | 全部有 (P1 切中段 + P2 漂移 + P3 高频 IPC + P4 镜像乱序) |

**V1.5+ 接受的回归** (P0 可见性 > P1 调度精度):
- P1 (切到中段): cycleMs 写死 6500ms 估算, 切 scene 可能差 1~2 帧, 视觉无感
- 后台 tab 节流: 跟 V2.1 RAF 同样受 webview 节流, 差异不显著

---

## 10. 演进历史 (迁移地图)

| 阶段 | 日期 | commit | 状态 | 渲染 | 调度 |
|------|------|--------|------|------|------|
| V1.5 | 2026-08 | (legacy) | deprecated 2026-08-27 | `<img>` | setInterval 33Hz 心跳 + 8s autoNextAt |
| V2.1 (1) webm+chroma | 2026-08-17 | (legacy) | deprecated 2026-08-17 (用户反馈"配色好差") | hidden webm + visible canvas + JS chroma key | `<video>.onEnded` 事件驱动 |
| V2.1 (2) apng+canvas | 2026-08-27 | (current broken) | deprecated 2026-09-11 (Tauri macOS WebKit canvas 0 像素) | `<canvas>` + apng-js Player | apng-js Player 'end' 事件 |
| **V1.5+** | **2026-09-11** | **`120b993`** | ✅ **current default** | **`<img>` 浏览器原生** | **setTimeout(APNG_CYCLE_MS=6500)** |

**关键拐点**:
- **V1.5 → V2.1 (1)**: 治 P1-P4 调度 bug, 但 webm+chroma 视觉差
- **V2.1 (1) → V2.1 (2)**: 改 apng+canvas 治视觉差, 但 Tauri macOS WebKit canvas 0 像素
- **V2.1 (2) → V1.5+ (3)**: 退回 `<img>` 浏览器原生, 跨 webview 后端一致, 治本 macOS 浮窗可见性 (P0), 接受 P1 调度精度回退

---

## 11. 故障排查 (sanity check 缺位教训)

之前 6 commit 反复修 Tauri 浮窗 B/D, 全部失败. 真正根因是 sanity check 缺位:

1. **跑 binary 验证 GUI 前必读 entrypoint** (`src-tauri/src/main.rs`) — 知道哪些 flag, 默认 mode 是 headless (MCP only) 还是 GUI
2. **binary 启动后抓 log 确认 GUI 启动** — 'pet window anchored' / 'WindowEvent::Created' / 'app event loop running' 标志 log 必须出现
3. **'binary 跑了但功能不对' 先看 log** — log 没 GUI 启动 log = GUI 没启, 不是功能问题
4. **screencapture 验证 GUI 可见性** — 浮窗位置 RGB 是不是预期色 (coral-pink)
5. **反复修 3+ 版还没找到根因 → 反思 sanity check** — '改动越多越不对' 99% 是 surface patch, 真根因在 sanity check 缺位

**信号** (一撞一个准):
- 'binary 跑了, 桌面上没看到' → 80% binary 没启动 GUI
- '反复修 3+ 版还没找到根因' → 反思 sanity check, 是不是跑法错了
- '改动越多越不对' → 99% 是 surface patch, 真根因在 sanity check 缺位

**用户反馈 (2026-09-11)**: "macos ubuntu 都没构建出来啊? 我没看到章鱼" — 当时 binary
跑错方式, 6 commit 全部 surface patch. 实际 binary 没启动 GUI, 章鱼根本没机会渲染.

---

## 12. 关联文档

| 文档 | 作用 |
|------|------|
| `docs/pipeline.md` | **上游** H3 视频 → APNG (v10-final 6 阶段) 总入口 |
| `docs/v10-pipeline.md` | v10-final 详细实现 (BiRefNet+CorridorKey+borrow+ROI 6 阶段) |
| `docs/h3-capabilities.md` | H3 必须提供什么 (双图模式, 视频规格, 16 项约束, 14 动作) |
| `docs/action-prompt-methodology.md` | V2 prompt 工程方法论 |
| `docs/linux-build.md` | 跨平台编译 (macOS/Linux/Windows) + 透明窗口 + alwaysOnTop |
| `docs/handoff-2026-09-11-v15plus-img-render.md` | V1.5+ 决策 handoff (B/D 6 commit 失败根因分析) |
| `docs/handoff-2026-09-11-macos-b-d-rootcause.md` | macOS B/D 根因诊断 handoff |
| `docs/handoff-2026-09-11-macos-nuc-build-sim.md` | macOS build + NUC build 模拟 handoff |
| `prompts/00-format.md` | 4 段 prompt 段落格式规范 |
| `prompts/01..08-name.md` | 8 真实 prompt 范例 (4-12 是待做 / fail 重做备份) |
| `scenes.json` | V2 scene 元数据单一源 (M4 之后) |
| `app/src/animation/types.ts` | Animation + AnimationProvider 接口定义 |
| `src-tauri/src/main.rs:18-37` | binary mode 决策 (--gui / --mcp-stdio / default) |
| `src-tauri/src/lib.rs:67-109` | Tauri 浮窗 setup (anchor at 200,200, 116x116, transparent) |
| `AGENTS.md` | 项目地图, V1.5+ 段在协作规则 |

---

## 13. 一句话总结

**V1.5+ = 浏览器原生 `<img>` 渲染 + setTimeout 事件驱动调度 + 5 文件改动
= 跨 webview 后端一致的桌宠渲染, P0 macOS 浮窗可见, 接受 P1 调度精度回退.
任何 chromium / WebKit / WebKitGTK / WebView2 都 work, 一份代码跑全平台.**
