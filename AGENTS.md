# AGENTS.md

> 协作者 + AI agent 向的项目地图. 人类请看 `README.md`.

## 一句话

🐙 coral-pink 章鱼桌宠 — Tauri 2 + React 19 + XState 5 + MCP stdio,
作为 [agent-plugins.org v1.0.0](https://agent-plugins.org/specification) plugin,
跨 8 客户端 portable (mcode / Cursor / Claude Code / VS Code / Codex / Kiro /
Antigravity / Gemini CLI).

## 项目坐标

| 项 | 值 |
|---|---|
| 状态 | **V2.3 (2026-09-11) v10-final 抠图 + 8 V2 场景 (3 原有 + 5 新: breakdown / friday-5pm / pretend-busy / stay-late / treat-milk-tea)**, **V1.5+ (2026-09-11) `<img>` 跨平台兼容渲染**, Ubuntu release 33MB |
| 栈 | Tauri 2 · React 19 · Vite 6 · XState 5 · Rust 1.77+ |
| 窗口 | 116×116 透明, V2 APNG 192×192 在 `<img>` 内部 (CSS 缩放到 116×116, 浏览器原生 APNG 循环) |
| **8 V2 场景 (V1.5+ 默认)** | detective-study (H3 戴帽研究) · worker-construction (H3 工人施工) · drink-coffee (H3 喝咖啡) · **breakdown** (H3 抱头沮丧) · **friday-5pm** (H3 周五下班) · **pretend-busy** (H3 假装很忙) · **stay-late** (H3 加班叹气) · **treat-milk-tea** (H3 请奶茶) (2026-09-11 5 新) |
| 6 MCP tools | pet_show · pet_ask · pet_get_state · pet_set_state · pet_pet · pet_list_states |
| **8 V2 APNG** | **99 帧/张 × 66ms ≈ 6.5s 循环 (15fps)**, RGBA, 192×192, ~3.2-3.4MB 各, 走 **v10-final 6 阶段 pipeline** (BiRefNet 1024 fp16 alpha hint → CorridorKey GreenFormer 2048 内部 tiled fp16 linear alpha + straight FG + v10.3 strict gate + forehead_white_mask H3 源 ROI 缝补 + borrow+recolor+inpaint 道具治本 + ROI demote 放大镜/桌子) |
| 14 V1 spritesheet (废弃) | 移到 `app/public/assets/octopus/_archive-v1-spritesheets/` 不再用 |
| **scene 调度** | **事件驱动** (`setTimeout(APNG_CYCLE_MS=6500)` 模拟 → `SCENE_LOOPED` → FSM `rotateScene`), 紧跟 APNG 末尾, 0 漂移 (新 setTimeout 替代累积 setInterval) |
| Spec 依据 | [agent-plugins.org v1.0.0](https://agent-plugins.org/specification) + [MCP 2024-11-05](https://modelcontextprotocol.io/specification/2024-11-05) + [agentskills.io](https://agentskills.io/specification) |
| HTTP fallback | `:9527` (V1 demo 用) |

## 关键路径

| 用途 | 路径 |
|------|------|
| 用户向文档 | `README.md` |
| Plugin manifest | `plugin.json` (spec §5) |
| MCP server manifest | `mcp.json` (spec §7, type=stdio) |
| Skill frontmatter | `skills/octopus-pet/SKILL.md` (agentskills.io) |
| Plugin entrypoint | `bin/octopus-pet` (spec §9.2; dev=本地构建优先, 发布=bin/octopus-pet.bin 兜底) |
| **提交的 release 产物** | `bin/octopus-pet.bin` (~13MB, 内嵌 spritesheet; `release-plugin.sh` 生成, **commit 时一起提交**) |
| 状态逻辑单点 | `src-tauri/src/actions.rs` (MCP/HTTP 唯一的 apply_* 实现) |
| 状态镜像回写 | `src-tauri/src/state_bridge.rs::sync_state` (webview→Rust, 只写不 emit) |
| React 前端 | `app/src/` (components · state · hooks · data · styles) |
| Rust 后端 | `src-tauri/src/` (lib · main · actions · mcp_stdio · state_bridge · http_fallback) |
| 14 spritesheet (V1 废弃) | `app/public/assets/octopus/_archive-v1-spritesheets/spritesheet-*.webp` |
| **8 V2 APNG (V1.5+ 默认)** | `app/public/assets/octopus/v2/{detective-study,worker-construction,drink-coffee,breakdown,friday-5pm,pretend-busy,stay-late,treat-milk-tea}.png` |
| **V2 APNG 生产脚本 (default)** | **`scripts/extract-v10-final.py`** (BiRefNet 1024 + CorridorKey 2048 + 6 阶段 fixup, 2026-09-10 定稿). CPU-only fallback: `scripts/extract-v4-chromakey-cpu-fallback.py`. 完整演进史 + 决策树: `docs/pipeline.md`. 6 阶段实现: `docs/v10-pipeline.md`. |
| 14 场景素材审计 | `docs/octopus-assets-audit.md` (W1 D1 产物) |
| **H3 必须提供什么** | `docs/h3-capabilities.md` (双图模式, 视频规格, 16 项通用前缀约束, 14 动作清单) |
| **V2 prompt 段落格式** | `prompts/00-format.md` + 8 真实范例 `prompts/01..08-name.md` (4-12 是待做 / fail 重做备份) |
| **V2 prompt 方法论** | `docs/action-prompt-methodology.md` (16 项约束 + 8 陷阱 + V1→V2 14 映射) |
| 变更历史 | `CHANGELOG.md` (Keep a Changelog 1.1.0) |
| CI | `.github/workflows/ci.yml` (spec lint · asset audit · spritesheet regen · Rust build · Vitest) |
| **V2.1 标准图** (V2 idle 起点) | `art/octopus-frames/standard-char-1x1.png` (3/4 视角, 1:1, 绿幕, 1920×1920; `art/` 在 .gitignore) |

## 协作规则 (根因型, 别打地鼠)

- **plugin 三件套** (`plugin.json` + `mcp.json` + `skills/.../SKILL.md`) 是 spec 必填.
  改任一文件后必跑 `bash scripts/lint-octopus-plugin.sh` 校验 (16/16).
- **状态逻辑改 `actions.rs` 单点**: 场景校验 / ≤12 字截断 / bubble 3s / affection+5
  只在 `src-tauri/src/actions.rs`。MCP stdio / HTTP fallback 都委托它, 不要在新入口
  复制逻辑。状态权威是前端 XState, Rust `SharedState` 只是镜像 (sync_state 回写).
- **V2 调度: 随机 + 去重 (替代 V1 顺序轮转)**: `octopus-fsm.ts::rotateScene` /
  `ROTATE_NOW` 改用 `pickRandomScene(current, recent, rng)`, 排除 `current` +
  `recentScenes` (滚动窗口 N=5) 后等概率选. **FORCE_SCENE 不更新 recentScenes**
  (MCP 显式控制不影响自然轮转序列). `nextScene` (V1 顺序) 函数保留导出,
  仅供文档/测试. 14 步模拟 sim 14 次: 12/14 唯一场景, 0 个 5 步内重复.
- **V1.5+ (2026-09-11) 跨平台兼容渲染, 替代 V2.1 canvas 路径**:
  用户 2026-09-11 反馈 "macos ubuntu 都没构建出来啊? 我没看到章鱼" + 授权
  "不管你用什么方案, 只要是跨平台兼容的方案都可以". V1.5+ 治本 1 个 P0 bug:
  - **P0 Tauri 2 macOS WKWebView canvas 0 像素**: V2.1 走 `<canvas>` + apng-js,
    在 chromium 浏览器 work, 但 Tauri 2 macOS WKWebView transparent 浮窗里
    canvas 0 像素 (canvas.toDataURL 52674 字节 = canvas 真有内容, 但
    `<canvas>` 标签不显示; 推测 WKWebView transparent 浮窗合成异常).
    V1.5+ 改用 `<img>` + `img.src = url` 让浏览器原生循环 APNG, 跨
    macOS WKWebView / Linux WebKitGTK / Windows WebView2 / 任何 chromium
    浏览器都一致 work.
  5 文件改动:
  - `app/src/animation/types.ts`: `AnimationProvider.create(ctx, source)`
    → `create(target: HTMLElement, source)`. provider 内部自治创建 element.
  - `app/src/animation/providers/apng.ts`: 删 apng-js `getPlayer(ctx)`, 改用
    `new Image()` + `img.src = url`. 浏览器原生循环 APNG, 不依赖 apng-js / canvas.
  - `app/src/animation/providers/lottie.ts`: 跟 types 同步, 内部 `instanceof
    HTMLCanvasElement` 验证 + rAF drawImage (lottie 仍走 canvas 路径).
  - `app/src/hooks/useAnimation.ts`: `canvasRef: HTMLCanvasElement` →
    `containerRef: HTMLDivElement`.
  - `app/src/components/OctopusPet.tsx`: `<canvas>` → `<div ref={animRef}>`,
    provider 内部 `appendChild` img/canvas.
  onCycleEnd: 删 apng-js `'end'` 事件, 改用 `setTimeout(APNG_CYCLE_MS=6500)`
  模拟 (跟 APNG 实际循环时长匹配, 99 帧 × 66ms ≈ 6.5s). 切 scene 紧跟
  setTimeout 触发, 0 漂移 (新 setTimeout 替代累积 setInterval).
  已知 trade-off (V1.5+ vs V2.1):
  - **P1 切到中段**: cycleMs 写死 6500ms 估算, 切 scene 可能差 1~2 帧 (视觉无感).
  - **后台 tab 节流**: 跟 V2.1 RAF 同样受 webview 节流, 差异不显著.
  - **不再依赖 apng-js**: package 减少 ~50KB.
  详细 production reference: `docs/v15plus-render-pipeline.md`. 完整
  B/D 6 commit 失败根因分析: `docs/handoff-2026-09-11-v15plus-img-render.md`.
- **V2.1 (2026-08-27) 事件驱动 scene 调度 (已 deprecated 2026-09-11)**:
  用户 2026-08-24 反馈 "其实最理想的还是如果能用事件逻辑来控制动画会比较好,
  定时器总是不太稳定的". V2.1 治本 4 个长期 bug:
  - **P1 APNG 中段剪切**: 8s setInterval 跟 6.6s APNG 循环不整除, 每次切都在
    循环中段. V2.1 改听 apng-js Player `end` 事件 (PIL loop=1, 50 帧播完
    就发), scene 切严格对齐到 APNG 最后一帧渲染完, 0 累积延迟.
  - **P2 wall-clock 漂移** (NTP/DST/手动校时): V1.5 依赖 `Date.now() + ROTATION_INTERVAL_MS`
    比较, 时钟跳变就崩. V2.1 不再有 `autoNextAt` 字段, 也不需要 `now` 比较.
  - **P3 高频 IPC 压力**: V1.5 33Hz 心跳 → 30 次/秒 sync_state. V2.1 状态变化
    ~0.15Hz (每 6.6s 一次), race window 几乎不存在.
  - **P4 镜像乱序**: 跟 P3 同根, race frequency 降到 ~0.
  - **P5 `pickBubble` undefined**: 顺手治, 加空数组防御 (未来加新 scene 忘配
    BUBBLE_BY_SCENE 不会运行时挂).
  渲染: `<img>` → `<canvas>` + apng-js. 视觉跟 V1.5 一致 (APNG 解码出来
  直接 drawImage, 无 chroma key 二次处理). bubble 计时: 单独 setTimeout
  (BUBBLE_DURATION_MS), 不用全局 timer.
  **2026-09-11 deprecated**: V1.5+ 取代 (Tauri 2 macOS WKWebView canvas 0 像素
  bug 治本). 走 apng-js + canvas 路径在 chromium 浏览器 work, 但 Tauri macOS
  fail. 不要在新代码里走这条.
- **V1.5 渲染 + V2 调度 (TIMER_TICK 33Hz, 已废弃, 2026-08-27)**: V2.1 之前的
  状态. setInterval(33ms) → TIMER_TICK → shouldRotate (8s autoNextAt) → rotateScene.
  用户 2026-08-21 切回 V1 渲染 (`<img>` 浏览器原生循环) 是因为 V2.1 webm + canvas
  chroma key 视觉差. 但定时器本身的不稳定性一直埋着, V2.1 才治本.
- **V2.1 渲染 (已废弃, 2026-08-17)**: 第一次 V2.1 尝试走 hidden webm + visible canvas
  + JS chroma key (绕开 WKWebView webm alpha bug). 用户反馈 "配色好差, 不如之前舒服".
  根因: canvas 实时 chroma key 边缘半透明瑕疵 + 配色偏暗. **不要再走 webm+chroma
  key 这条路**. V2.1 (2026-08-27) 用 apng-js+canvas 替代, 走原生 RGBA, 无需 chroma key.
- **V2.1 调度 (已废弃, 2026-08-17)**: 第一次 V2.1 尝试的事件驱动走 `<video>.onEnded`.
  这条思路对了 (事件驱动, 0 累积延迟), 但因为 webm 视觉差被一起回退. 现在 V2.1
  (2026-08-27) 重新接上事件驱动思路, 用 apng-js `end` 事件 (跟 onEnded 概念一致),
  但走 RGBA APNG 不用 webm.
- **改场景清单 (V2.1 8 场景, 扩到 N+1 个流程不变)**:
  **M4 之后**: 单一源是 **`scenes.json`** (项目根). 改完跑
  ```bash
  bash scripts/build-scene-registry.sh           # 生成 TS + Rust
  bash scripts/check-scenes-sync.sh             # 校验 (CI 必跑)
  ```
  生成文件:
  - `app/src/state/scene-registry.generated.ts` → `SCENE_IDS` / `SCENE_ORDER` / `BUBBLE_BY_SCENE`
  - `src-tauri/src/scene_registry_generated.rs` → `SCENES` / `BUBBLE_LINES`
  业务代码从 `./types` / `crate::scene_registry_generated` re-export, 不直接 import generated.

  **加新场景 5 步**:
  1. 跑 `docs/v2-h3-to-pet-workflow.md` (H3 / gen_videos → 抽帧 → chroma key v4.15 → alpha 羽化 → 192×192 APNG)
  2. 放 `app/public/assets/octopus/v2/<new-scene>.png`
  3. 改 `scenes.json` 加 entry (`id`, `source`, `bubbleLines`)
  4. `bash scripts/build-scene-registry.sh`
  5. `bash scripts/check-scenes-sync.sh` (也跑 `bash scripts/lint-octopus-plugin.sh` + 跑 test)

  **V1.5+ APNG 不需要 numPlays 限制** (浏览器原生 APNG 循环自动 loop, 不依赖
  apng-js). 8 场景 APNG 都用 PIL `loop=0` (无限循环) 即可, 浏览器自动循环.
  旧 V2.1 走 apng-js Player 需要 `loop=1` 才能 emit `'end'` 事件, V1.5+ 不适用.
- **V1.5+ scene 切流程 (事件链)**: `Animation.onCycleEnd() 回调` →
  `OctopusPet` `useAnimation(containerRef, scene, onCycleEnd)` →
  XState FSM `rotateScene` action → `context.scene` 变化 → `useAnimation`
  触发 cleanup (旧 animation.stop: clearTimeout + img.remove + target.replaceChildren) →
  加载新 animation (新 setTimeout 触发 onCycleEnd) → 新 cycle 结束
  再回调. 整条链路 ms 级响应, 无 setInterval 累计延迟.
  Animation 实现细节对 FSM 透明 (V1.5+ APNG 走 setTimeout 模拟, Lottie/Video 走各自的 onCycleEnd).
- **动画扩展 (M5, 2026-08-27; V1.5+ update 2026-09-11)**: scene 渲染不再绑死 APNG.
  加新动画格式 (Lottie / WebM / GIF / SVG) 不需要改 FSM/OctopusPet/useAnimation.
  **架构** (V1.5+ 2026-09-11 调整):
  - `app/src/animation/types.ts` — `Animation` 接口 (start/stop/onCycleEnd/nativeWidth/nativeHeight/cycleMs) + `AnimationProvider` 接口 (type + **create(target: HTMLElement, source)** — V1.5+ 改 target 替代 ctx, provider 内部自治创建 element)
  - `app/src/animation/registry.ts` — `animationRegistry.register(type, provider)` / `.get(type)`
  - `app/src/animation/providers/apng.ts` — 内置 APNG provider (V1.5+ 改用 `new Image()` 浏览器原生循环, 删 apng-js 依赖)
  - `app/src/animation/providers/lottie.ts` — Lottie provider (V1.5+ 内部 `instanceof HTMLCanvasElement` 验证 + rAF drawImage)
  - `app/src/hooks/useAnimation.ts` — 通用 hook (V1.5+ 改 `containerRef: HTMLDivElement`, scene 切时 `target.replaceChildren()`)
  - `app/src/main.tsx` — 启动时 `animationRegistry.register(apngProvider.type, apngProvider)`
  **加新动画类型 4 步** (例: lottie):
  1. 在 `app/src/animation/providers/lottie.ts` 实现 `LottieAnimation implements Animation` + `lottieProvider: AnimationProvider`
  2. 在 `app/src/main.tsx` 加 `animationRegistry.register("lottie", lottieProvider)`
  3. 在 `scenes.json` 加 entry: `{"id": "x", "animation": {"type": "lottie", "source": "..."}, "bubbleLines": [...]}`
  4. 跑 `bash scripts/build-scene-registry.sh` (CI 自动验证同步)
  FSM/OctopusPet/useAnimation 零修改, 业务代码 (CLICK/PET/ASK/DRAG/ROTATE_NOW) 也不知道 scene 是 APNG 还是 Lottie.
  **scenes.json schema 兼容**: 老 entry 没 `animation` 字段时, build 脚本默认 `{type: "apng", source: <scene-id>}` (走 1:1 命名约定). 平铺 `animationType`/`animationSource` 也兼容.
  **scenes-sync 校验**: 按 animation.type 走不同路径 — apng 检查本地 .png, URL (http/https/data) 跳过本地检查, 其它类型按 source 路径检查.
- **改 spritesheet**: 141 帧是源头真理. 真要改, 从 `~/Works/octopus-worker-meme` 抽,
  跑 `extract-and-link-octopus-frames.sh` + `spritesheet-builder.sh` + `generate-spritesheet-manifest.sh`.
- **换桌宠 idle 动画素材**: V2.1 idle 起点 = `art/octopus-frames/standard-char-1x1.png` (3/4 跪坐, 1920×1920, 绿幕, 珊瑚粉, 8 触手前向触地, 头顶 2 圆耳小凸起). 加新场景: 1) 写 H3 prompt (按 `prompts/00-format.md` 4 段格式) 2) `h3-dual-image-video-gen` skill 生成 6s mp4 (768×768, first=last=V2.1 standard-char) 3) `scripts/extract-v10-final.py` 转 100 帧 APNG 4) 加 entry 到 `scenes.json` 5) `bash scripts/build-scene-registry.sh` + `check-scenes-sync.sh` 同步. 详见 `docs/v10-pipeline.md` §7 复用清单 + `docs/h3-capabilities.md` §10 调用实例. **不要**走 V1 流程 (`docs/breath-pipeline.md` 已删 — 旧的"全睁立绘 → 慢眨眼视频 → flood-fill 抠图" 路径是 V1 标准图未稳定时的过渡方案, V2.1 standard-char 已稳定后不需要).
- **V2 视频 → 桌宠 APNG (H3 / gen_videos 走完)**: 完整流程在 `docs/pipeline.md` (总入口) + `docs/v10-pipeline.md` (6 阶段实现) + `docs/h3-capabilities.md` (H3 必须提供什么). 简短演进摘要:
  - **v1 → v4.24 color-mask 路线** (25 步, 2026-08-21 → 2026-09-09, 已废弃): PIL 相对绿度公式 + cv2.inpaint + 12 道 position-based mask. 极限 ~95% 绿去除率. CPU-only. 现成 CPU fallback: `scripts/extract-v4-chromakey-cpu-fallback.py`.
  - **v5.1 BiRefNet alone** (2026-09-10, 已删 `extract-birefnet-apng.py`): 神经网络 soft alpha hint, 边缘锐利. 但放大镜玻璃治不到 (BiRefNet 把"章鱼绿反射"+"放大镜玻璃"都当主体).
  - **v5.2 BiRefNet + CorridorKey** (2026-09-10, 已删 `extract-v52-apng.py`): 物理级 unmixing, 知道"绿幕绿 = 反射源"自动分离"绿幕+前景"混合. 12× 绿残留下降. 缺 borrow+recolor 治不了 H3 prop 淡入/淡出帧破渲染绿.
  - **v10.1 → v10.20 borrow 路线** (2026-09-10, 11 实验版本): 治本 H3 diffusion 在 prop 淡入/淡出帧把 prop 渲成绿色的"破渲染"现象. 关键 5 步: per-pixel gate (v10.1) → ratio gate (v10.2) → strict gate (v10.3) → borrow-only fill hole (v10.5) → borrow+recolor (v10.6, 治本率 80-95%) → ROI 精准处理 (v10.17 放大镜 / v10.19 worker 桌子).
  - **v10-final** (2026-09-10, 当前定稿, 唯一 default): 合并 v10.12 + v10.17 + v10.19, 6 阶段管线. 脚本: `scripts/extract-v10-final.py`.
  - **H3 + `last_frame_image` 双图模式是首末一致循环视频唯一解** — Hailuo-2.3 物理做不到 (0s vs 5.5s 40-45% 相似, 道具不消失). 走 `~/.minimax/agents/mavis/skills/h3-dual-image-video-gen/`.
  - **H3 绿幕反射进眼镜片** (V2.1 待修) — 章鱼眼镜下半部出现绿色横带, 治本改 prompt 加 "no green tint reflection in eyes". 13/14 动作无此问题, 当前 01-detective-study 接受.
  - **教训** (已写 `docs/pipeline.md` §3 末尾): 1) 颜色阈值治绿幕是工业残留思路, 神经网络 unmixing 模型 (CorridorKey) 一次到位, 治本 vs 缝补差几个数量级. 2) 25 步 v4.x color-mask 演进**不是浪费**, 是为了精确测量"颜色阈值路线的极限" — 现在知道是 ~95%, 剩 5% 必须换 unmixing 模型. 3) `HF_ENDPOINT=hf-mirror.com` 是 CN 区域机器 HF 访问唯一通道, huggingface.co 自身 DNS 被劫持.

- **ffmpeg-full 接入 (VP9 alpha 编码)**: 走 WebM with alpha 必须用
  `brew install ffmpeg-full` (keg-only, 不在 PATH). **Homebrew standard ffmpeg 的
  `ffmpeg -codecs` 不显示 `vp9_alpha` 标志,误导性失败** — ffmpeg-full 的
  `ffmpeg -h encoder=libvpx-vp9` 列出 `yuva420p/yuva422p/yuva444p/gbrap` 等 7 种
  alpha 像素格式才是真相. 调用统一走 `scripts/encode-webm-alpha.sh` (自动 locate
  Cellar 路径 + 验证 `TAG:alpha_mode=1`),**不要**自己 hardcode ffmpeg 路径.
  HEVC videotoolbox alpha 完全不可行 (Apple `VTCompressionSession` 架构限制),
  永远别走这条. 验证 alpha 真的进了 webm 必须用 `ffprobe -show_streams`
  看 `TAG:alpha_mode=1`, 默认 `ffprobe` 不展示这个 tag.
- **发布产物 `bin/octopus-pet.bin` 提交进 git**: 跑 `release-plugin.sh` 后 `git add bin/octopus-pet.bin`
  随 commit 提交 (repo 本身即插件, clone 零构建可加载). 产物必须走
  `cargo tauri build --no-bundle` — 裸 `cargo build` 增量会跳过 asset 嵌入 (binary < 5MB = 缺 assets).
- **WebP 硬上限 16383px**: 141 帧单行 27072px 超限, 所以 2 行 71 列布局是硬约束,
  不要试图改回单行.
- **macOS BSD `find` symlink 穿透 bug**: 6/14 场景的 `frames-final/` 是 symlink.
  任何 `find ... -name` 计数要带 trailing slash 或用 `ls -1U`.
- **commit 后立即 push**: `git commit` 后同一次操作 `git push origin main`,
  不要等 user 提醒. push 失败立刻报, 不重试不 force.
- **CHANGELOG "Out of scope" = 欠条**: 写出来就同 commit 在本文件或
  AGENTS.md 设 reminder, 下一版 release 第一步 grep 它.
- **不引用废弃内容**: forward-looking 文档不写已删脚本/旧 API shape/旧默认值.
  历史归 `CHANGELOG.md`.
- **UI 文本不用 emoji 字符**: ⚠ 💡 📡 等一律换 iconfont / SVG icon.
- **测试目录用 `tests/`**: vitest `**/*.{test,spec}.*` 默认认 `__tests__/` 也行,
  但本项目统一 `app/src/state/octopus-fsm.test.ts` 这种贴近源文件风格.
- **Tauri icon 强制 RGBA**: Tauri 2 `generate_context!` 编译时读 icon, 必须 RGBA.
  PIL 走一遍 `.convert('RGBA')`.
- **Tauri 2 beforeDevCommand / beforeBuildCommand CWD 不一致** (实测):
  - `beforeDevCommand` 实际 CWD = `frontendDist` 父目录 (= `cute/app/`),
    不是项目根 (cute/).
  - `beforeBuildCommand` 实际 CWD = `src-tauri/` (cargo 默认) 或
    项目根 (cute/, 用户直接 `cargo tauri build` 时).
  - 老 `npm --prefix app` / `cd app &&` / `--prefix ../app` 三套配置都
    假设单一 CWD, 在新 Tauri 2 下互相冲突 (`npm --prefix app` 解析到
    `cute/app/app/` 找不到 package.json).
  - **统一入口** (commit 4656377): `bash scripts/run-vite.sh dev|build`.
    wrapper script 用 `BASH_SOURCE` 自己定位 → `cd $SCRIPT_DIR/../app` → `npm run "$@"`,
    1 套配置跨所有 CWD 假设工作, 0 冲突. chmod +x, 自带可执行权限.
  - **不要**再写 `--prefix app` / `cd app &&` / `--prefix ../app`,
    一律走 `bash scripts/run-vite.sh` (项目根视角, 可移植, 跟 tauri 2
    任何 CWD 假设解耦).

## 脚本

```bash
# 验证 (CI 跑全套)
bash scripts/lint-octopus-plugin.sh            # 16/16 spec schema 校验
bash scripts/audit-octopus-assets.sh           # 14 场景素材盘点
bash scripts/check-scenes-sync.sh              # 14 场景三源一致 (types.ts / manifest / mcp_stdio.rs)
bash scripts/spritesheet-builder.sh --all      # 141 帧 PNG → 14 张 .webp
bash scripts/generate-spritesheet-manifest.sh  # React 用的 JSON manifest (唯一副本 src/data/)

# 视频编码 (V2 备用路线, PNG 序列 → WebM with alpha)
# 依赖: brew install ffmpeg-full (keg-only, 脚本自动 locate)
bash scripts/encode-webm-alpha.sh \
  --input <frame_dir> --output <file.webm> \
  --framerate 12 --bitrate 300k --pattern "f_%04d.png"

# 发布 (产出 bin/octopus-pet.bin 提交物 + dist/octopus-pet-plugin/ 分发)
bash scripts/release-plugin.sh                 # cargo tauri build --no-bundle + 冒烟
# 注意: 发布后 git add bin/octopus-pet.bin 随 commit 提交

# 素材重建 (W1 D1 已完成, 平时不重跑)
OCTOPUS_SOURCE_ROOT=~/Works/octopus-worker-meme \
  bash scripts/extract-and-link-octopus-frames.sh

# 测试
cd app && npm test                             # Vitest 16 FSM tests
cd src-tauri && cargo test                     # 8 MCP stdio roundtrip tests

# 本地开发
cd app && npm install
cd ../src-tauri && cargo build
cd .. && npm run tauri:dev                     # Vite dev server + Tauri 窗口

# 发布构建
npm run tauri:build                            # 产物: src-tauri/target/release/bundle/macos/Octopus Pet.app
```

## 已知 V1 限制 (V2 增量, 不在 W1 范围)

- **RGB 无 alpha**: 14/14 场景 PNG 是 720×720 RGB (实色背景), 透明窗口会显示 RGB 矩形.
  V2 用图像分割 / chroma key 加 alpha.
- **141 帧半截切换**: 单循环 11.75s, 8s 轮转必然在循环中段切到下一场景. V1 接受.
- **mcode 任务事件 → 场景 映射未接**: mcode 钩子没好, V1 用 timer 轮转.
- **macOS only**: V1 不支持 Windows / Linux.
- **无音频 · 无自启 · 无多屏 · 无鼠标穿透 · 无右键菜单扩展** — V1 都不做.
