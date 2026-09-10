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
| 状态 | **V2.2 (2026-09-10) v5.2 BiRefNet + CorridorKey 默认抠图方案 (12× 绿残留 ↓, 放大镜真透明)**, 默认 2 个 V2 视频成品 |
| 栈 | Tauri 2 · React 19 · Vite 6 · XState 5 · apng-js 1.1.5 · Rust 1.77+ |
| 窗口 | 116×116 透明, V2 APNG 192×192 在 `<canvas>` 内部 (CSS 缩放到 116×116) |
| **3 V2 场景 (V2.1 默认)** | detective-study (H3 戴帽研究) · worker-construction (H3 工人施工) · **drink-coffee** (H3 喝咖啡, 2026-09-09 fef8017) |
| 6 MCP tools | pet_show · pet_ask · pet_get_state · pet_set_state · pet_pet · pet_list_states |
| **3 V2 APNG** | **100 帧/张 × 66ms ≈ 6.6s 循环 (15fps, v4.20 流畅度优化)**, RGBA, 192×192, ~3.0-4.0MB 各, 走 **v5.2 BiRefNet + CorridorKey 物理级 unmixing** (BiRefNet 1024 fp16 alpha hint → CorridorKey GreenFormer 2048 内部 tiled fp16 linear alpha + straight FG + forehead_white_mask H3 源 ROI 缝补) |
| 14 V1 spritesheet (废弃) | 移到 `app/public/assets/octopus/_archive-v1-spritesheets/` 不再用 |
| **scene 调度** | **事件驱动** (apng-js `end` 事件 → `SCENE_LOOPED` → FSM `rotateScene`), 0 累积延迟, 严格对齐 frame 0 |
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
| **3 V2 APNG (V2.1 默认)** | `app/public/assets/octopus/v2/{detective-study,worker-construction,drink-coffee}.png` |
| **V2 APNG 生产脚本** | **`scripts/extract-v52-apng.py`** (BiRefNet 1024 + CorridorKey 2048 → 100 帧 RGBA APNG, 2026-09-10 默认). 备选: `scripts/extract-chromakey-apng.py` (v4.x PIL chroma key, CPU-only fallback, 已 deprecated). |
| 14 场景素材审计 | `docs/octopus-assets-audit.md` (W1 D1 产物) |
| 变更历史 | `CHANGELOG.md` (Keep a Changelog 1.1.0) |
| CI | `.github/workflows/ci.yml` (spec lint · asset audit · spritesheet regen · Rust build · Vitest) |
| **V0.5-3 验证产物** | `docs/v053-validation/` (gen_videos 6s 视频 + 0s/5.5s 对比帧, 96.65% 相似) |
| **V2.1 标准图** (V2 idle 起点) | `art/octopus-frames/standard-char-1x1.png` (3/4 视角, 1:1, 绿幕, 1920×1920; `art/` 在 .gitignore) |
| **V2 绿幕清洗脚本** | `scripts/remove-hat-greenscreen.py` (V2.1 14 动作复用) |
| **V2 视频 → 桌宠 APNG 流程** | `docs/v2-h3-to-pet-workflow.md` (5 步: H3 双图 → 抽帧 → chroma key v4.17 → APNG, drink-coffee 最新跑通) |
| **V2 抽帧 + chroma key + APNG 一键脚本** | `scripts/extract-chromakey-apng.py` (v4.15 公式沉淀, 14 动作复用) |

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
- **V2.1 (2026-08-27) 事件驱动 scene 调度, 替代 V1.5 setInterval 33Hz**:
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
- **改场景清单 (V2.1 2 场景, 扩到 N+1 个流程不变)**:
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

  **V2.1 APNG numPlays 必须是 1** (PIL `loop=1`), 这样 apng-js Player 才会在
  播完一轮后 emit `'end'` 事件. `numPlays=0` (无限循环) 不会触发 `'end'`,
  scene 永远不切. `scripts/extract-chromakey-apng.py` 默认就是 loop=1.
- **V2.1 scene 切流程 (事件链)**: `Animation.onCycleEnd() 回调` →
  `OctopusPet` `useAnimation(canvas, scene, onCycleEnd)` →
  XState FSM `rotateScene` action → `context.scene` 变化 → `useAnimation`
  触发 cleanup (旧 animation.stop) → 加载新 animation → 新 cycle 结束
  再回调. 整条链路 ms 级响应, 无 setInterval 累计延迟.
  Animation 实现细节对 FSM 透明 (APNG 走 'end' 事件, Lottie/Video 走各自的 onCycleEnd).
- **动画扩展 (M5, 2026-08-27)**: scene 渲染不再绑死 APNG. 加新动画格式
  (Lottie / WebM / GIF / SVG) 不需要改 FSM/OctopusPet/useAnimation.
  **架构**:
  - `app/src/animation/types.ts` — `Animation` 接口 (start/stop/onCycleEnd/nativeWidth/nativeHeight/cycleMs) + `AnimationProvider` 接口 (type + create(ctx, source))
  - `app/src/animation/registry.ts` — `animationRegistry.register(type, provider)` / `.get(type)`
  - `app/src/animation/providers/apng.ts` — 内置 APNG provider (包装 apng-js Player)
  - `app/src/hooks/useAnimation.ts` — 通用 hook (查 registry → provider.create → 绑 onCycleEnd)
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
- **换桌宠 idle 动画素材**: 走 `docs/breath-pipeline.md` 完整流程 (image_synthesize
  立绘 → gen_videos 慢眨眼 → ffmpeg 抽帧 → flood-fill 抠图 → 持续睁眼+加速眨眼
  拼接 → APNG 输出). 关键阈值: flood-fill `edge_thresh=50` (避免抠掉嘴内部深红),
  APNG `disposal=0` (避免 PIL 合并相同帧), tauri.conf.json `macOSPrivateApi: true`
  (macOS 透明必需). 不用 GIF (透明兼容差). V1 默认 APNG, V2 长动作可走 WebM VP9 alpha
  (见下面"ffmpeg-full 接入"规则).
- **V2 视频 → 桌宠 APNG (H3 / gen_videos 走完)**: 走 `docs/v2-h3-to-pet-workflow.md` 完整 5 步 (H3 双图 → ffmpeg 15fps 抽帧 → chroma key v4.15 → alpha 1px Gaussian blur 羽化 → 192×192 APNG). 关键坑:
  - **chroma key v4.15 公式** (v4.6 base 边界 4 类 + v4.8 yellow_white color clamp 治本米黄 + v4.9 alpha 240+ 收紧 + v4.10.1 R-B<60 限定温和米黄 + v4.11 G>B+5 治极淡米 + **v4.12 HSL L*1.18 治暗白 218 → 228** + **v4.14.2 S=0 眼白去色** + **v4.15 mask R>230 R-B<40 限严避免边缘硬切**) = `(G - max(R,B)) / G` 相对绿度, `clip((rel - 0.15) / 0.3, 0, 1)` + **严保护** (`(max<80) AND (G-max(R,B)<20)` 区分真阴影 vs 绿反射; `80 ≤ max < 150` 且 `G - max(R,B) < 30` 算皮肤保护中绿) + **alpha 激进收紧** (alpha < 80 → 0, > 240 → 255, partial 像素 6000 → 4600, 边缘 hard-key) + **cv2.inpaint 分 2 步** (1) partial+透明 1px 膨胀 + Telea r=8 (远处身体色 PDE 解算更彻底) (2) green_opaque 单独 mask 6px 膨胀 (kernel 3x3, iterations=2) + Telea r=4, 修身体/帽子的绿调反射 + **yellow_white color clamp** (alpha>=150 + R>200 + G>B+5 + R-B<60 + sum<720 检温和米黄, `G = min(G, B+5)` 拉低 G, 治 v4.8 漏掉的 G-B=7 极淡米) + **HSL 亮度+去色** (mask R>230+R-B<40 内 cv2 HLS_FULL, L*1.18 提亮 + S=0 去色, 治"眼白雾蒙蒙" — H3 源素材眼底月牙 RGB (235,212,207) brightness 218 暗白治本 灰白 (228,228,228) 眼白主区) + **alpha 羽化** (1 像素 Gaussian blur, blur 后低 alpha < 30 重新归 0 避免拖出半透残影). 详见 `scripts/extract-chromakey-apng.py`.
  - **v3 → v4 演进根因**: v1 `clip(diff/60+0.5)` 跟 v3 `clip((diff-10)/20)` 都是绝对绿度阈值, 白色眼底微小绿影 (RGB 164,182,150, G-R=18) 触发 partial-alpha 153 → 桌宠眼白下边缘显"高亮透明". v4 改用相对绿度归一化到 G 本身, "绿在 G 里的占比" < 0.2 → 不透. 8 色 + H3 残留测试集全部通过.
  - **v4 → v4.1 演进根因**: H3 模型在脸颊/触手上渲染深绿反射 (RGB ~22,45,7), v4 公式看 (45-22)/45=0.51 > 0.2 → alpha=0 完全透明 → 桌宠透出 mcode UI 白底 → 用户看到"白色斑块". v4.1 加 `max(RGB) < 80` 强制不透明保护深色阴影.
  - **v4.1 → v4.2 演进根因**: H3 模型的"绿黄残留" (RGB ~155,188,75, 偏亮绿反射) 在 v4.1 公式下 `rel=0.135 < 0.2` → 保留为不透明绿色, 桌宠身体/帽子上有绿色斑. 阈值 0.2 → 0.15 + 中绿保护让绿黄也走 soft 透明 (-98%), alpha 羽化让边缘软化.
  - **v4.2 → v4.3 演进根因**: alpha 羽化让 partial 像素变多 (0.21% → 1.18%), 但 partial 像素 RGB 均值 R=25, G=198, B=11 (100% 绿偏, H3 边缘渲染"绿+粉"混合色), 羽化后 partial 像素仍偏绿 → 桌宠身体外圈显"绿色描边". v4.3 加 cv2.inpaint (Telea r=5) 修 partial + 透明区域 RGB.
  - **v4.3 → v4.4 演进根因**: v4.3 残余"绿色阴影"在触手/身体 (alpha=255 但 RGB 绿偏), v4.1 保护 `max<80` 把 H3 深绿反射 (RGB ~20,55,8) 误保留了. v4.4 加严保护 `(max<80) AND (g_max_rb<20)` 区分真阴影 vs 绿反射 (深绿反射 28214 个被 v4.4 排除保护), inpaint mask 扩展到 alpha=255 绿偏像素 (G>R+5 AND G>B+5).
  - **v4.4 → v4.5 演进根因**: v4.4 残余"绿调反射高光"在 H3 帽子/放大镜 (RGB ~150,130,60 或 145,147,23, R>G 但 B 极低, 视觉像绿调), v4.4 mask 只覆盖绿偏像素本身, 没扩到外圈"绿调反射"区域. v4.5 mask 6px 膨胀 (kernel 3x3, iterations=2) + radius 4 (替代 r=5, 配合膨胀). 50 帧总和: detective-study -81px, worker-construction -690px, drink-coffee 持平 0. 视觉: 侦探帽变纯净棕色, 放大镜玻璃绿色反射消失, 黄色施工帽保留, 白色眼睛/腮红/阴影细节保留.
  - **v4.5 → v4.5.1 演进根因**: v4.5 mask 6px 膨胀覆盖了眼睛 partial 边缘, 眼睛的高光(星形)/瞳孔(黑色)/眼底月牙(白色)被 inpaint 改成周围身体色(粉色), 眼睛清晰度从锐利变模糊. v4.5.1 把 mask 拆成 2 步独立 inpaint: (1) partial+透明 单独 inpaint (Telea r=5, 不膨胀, 保留 v4.4 行为 → 眼睛恢复清晰度) (2) green_opaque 单独 mask 6px 膨胀 (kernel 3x3, iterations=2) + Telea r=4 (修身体/帽子的绿调反射). 视觉验证: 侦探帽变纯净棕色 (v4.5 保留) + 眼睛锐利 (v4.4 清晰度恢复) + 黄色施工帽保留.
  - **v4.5.1 → v4.6 演进根因**: v4.5.1 残余 4 类问题 (1) 眼睛半透: 眼周 partial 60-139 个 RGB 暗 R=63-83 (2) 身体边缘绿阴影: 轮廓 partial 544-2479 个 RGB mean R=130-163 G=91-109 B=55-64 (棕色阴影带绿调) (3) 物品周围绿阴影: 物品边缘 alpha=255 深色像素 (70-100) 500-1000 个 (4) 切换绿残影: partial 中间值拖影. v4.6 加 (a) **alpha 激进收紧** `harden_alpha_edges` (alpha < 80 → 0, > 175 → 255, partial 6000 → 4600 -24-28%, 边缘 hard-key); (b) **partial mask 1px 膨胀** (覆盖 alpha=255 边缘外 1 像素); (c) **inpaint radius 5 → 8** (PDE 解算更彻底, 远处身体色覆盖到 partial 像素); (d) **alpha 羽化后低 alpha < 30 重新归 0** (避免 blur 拖出半透残影). 50 帧 partial: detective-study 6057 → 4621, worker-construction 5158 → 3707, drink-coffee 4036 → 2946. 视觉验证: detective-study f25 戴帽戴放大镜帽子纯净棕色 + 放大镜玻璃无绿反射 + 眼睛锐利; worker-construction f25 黄色施工帽边缘绿调消除; drink-coffee f25 咖啡杯绿色杯身边缘干净; 桌宠 116×116 透明窗口 3 场景轮转干净.
  - **v4.6 → v4.7 演进根因 → 撤回**: v4.6 治本 4 类边界后, 眼白发黄/发绿是 v4.6 未覆盖的"alpha=255 白色像素 G 偏色". drink-coffee 眼周 225 个 alpha=255 白色像素中 70% (157) G>B+10, RGB mean R=240 G=153 B=131 (米黄), H3 源视频眼底月牙 RGB 偏 G. detective/worker 残留 1-19 个 G 偏色. v4.7 加 (a) **green_tinted_white mask** (`alpha=255 + R>200 + R+G+B>600 + G>B+5` 检测"白色像素 G 偏色"); (b) **inpaint r=3 单独步** (小半径, 期望保护眼周星形高光/瞳孔边界). 像素治本: 3 场景眼周 G 偏色像素 → 0. **失败根因**: 即使 mask 限定"白色 G 偏色", inpaint r=3 仍把星形高光/瞳孔边界涂抹模糊, 眼白从"锐利纯白"变"灰月牙". 用户反馈"现在眼睛的处理更加糟糕了". 撤回 inpaint, 改 v4.8 纯色度 clamp.
  - **v4.7 → v4.8 演进根因**: 撤 v4.7 inpaint r=3 (保护眼锐利度优先, 0 模糊), 改纯像素级 RGB 调整. 新增 **yellow_white color clamp** (no inpaint, 0 模糊): alpha=255 + R>200 + B<G-15 + R>B+50 + R+G+B<720 检米黄像素, `G = np.clip(G, B, R-20)` 拉低 G 到 [B, R-20] 区间消除黄绿感, 保留亮度. 排除星形高光 (R+G+B>720, R=G=B 接近纯白不参与). 像素治本: 3 场景眼周米黄像素 → 0. 视觉: 眼白真正纯白 + 锐利 (跟 v4.6 锐利度持平, 优于 v4.7 涂抹 + 优于 v4.6 G 偏色), 边界 4 类 (v4.6 治本) 不退步.
  - **v4.8 → v4.9 演进根因**: 用户反馈"眼白不清晰, 雾蒙蒙". harden_alpha_edges high_thresh 175 → 240, 治本 alpha 240+ partial 半透雾感 (3 场景 1732+1446+1089=4267 → 0). bug fix: `>` 改 `>=` (240+ 全归 255), alpha_soften blur 后再 hard-key 一次 (blur 把 240+ 降回 220-254 范围, blur 后再 240+ → 255 锁死).
  - **v4.9 → v4.10 演进根因 → 撤回**: 改 color clamp `G > B + 8` 替代 `R > B + 50` 想治更多温和米黄. 失败: 误治 4000+ 强黄/橙像素 (detective 帽 4059 / worker 帽 4328 / drink 杯 4259), R-B>=100 帽色变橙红. 撤回.
  - **v4.10 → v4.10.1 演进根因**: 加 `R-B < 60` 限定温和米黄, 保留强黄/橙 (R-B>=60, 黄色施工帽 / 棕色侦探帽 / 绿色咖啡杯 — 正确颜色不能 clamp). 治本: 3 场景温和米黄 135+109+18=262 → 0, 强黄 4171+4682+4414=13267 完整保留.
  - **v4.10.1 → v4.11 演进根因**: v4.10.1 漏 G-B=7 极淡米 (R-B 20-25, R-G 13-17, 位置眼底月牙). 改 G > B+8 → G > B+5. 治本: 3 场景 G-B=7 极淡米 38+43+62=143 → 0. 0 误治 (R-G 13-17 是眼周, 非肤色 R-G 50+).
  - **v4.11 → v4.12 演进根因 (反思根因)**: 50 帧逐帧诊断发现眼底月牙 brightness mean 215, max 220-227, **没一帧到 240** — 源素材眼底月牙就是"暗白" 不是"亮白". 治 G 偏色不动亮度治不到根. cv2 HSL 空间提 L * 1.18 (R 已饱和 235 → 255 不能再提), 维持色相 (RGB 比例不变). 治本: 3 场景 dark 像素 (≤220) 241-254 → 54-64 (-75%), mid (220-240) +50%, brightness mean 215 → 228. 帽/杯强黄 23147 完整保留. 锐利度 0 损失 (HSL 改 L 不动 H/S). **反思根因**: 之前 9 版一直在 RGB 空间补色, 没意识到真正问题是 L (亮度) + S (饱和度) 双低.
  - **v4.12 → v4.13 → v4.14 演进根因**: 眼白 brightness 提上来但 R-B 22 仍偏暖. v4.13 S*=0.10 (拉 90%) 视觉变化小. v4.14 S=0 (完全去色, 眼白 = 灰白 (228, 228, 228)).
  - **v4.14 → v4.14.2 演进根因 (mask bug 修复)**: v4.14 S=0 实际没生效 — 眼周 v4.12 mask 限 `B<200`, 但 v4.12 L*1.18 提亮后 B 都 > 200, **眼周最亮区被 mask 排除**治本不到. v4.14.2 mask 去掉 B<200 限制, R>200 + R-B<60 全部命中 → S=0 全治 → 灰白.
  - **v4.14.2 → v4.15 演进根因 (当前默认)**: v4.14.2 全眼周治本灰白, 跟周围粉色身体色对比强烈, 视觉"塑料". v4.15 mask 限严 R>230 + R-B<40 (眼底月牙中心最亮区), 保留边缘色相 → 软过渡. 治本灰白 460-476 → 242-262 (-50%), 偏暖保留 6769-6932 → 6980-7127 (+200 软过渡). 视觉: 眼底月牙纯白 + 自然软过渡, 不塑料. 4 方对比 (v4.8 / v4.12 / v4.14.2 / v4.15) 中 v4.15 最自然.
  - **chroma key 演进总表** (v1 → v3 → v4 → v4.1 → v4.2 → v4.3 → v4.4 → v4.5 → v4.5.1 → v4.6 → v4.7(撤回) → v4.8 → v4.9 → v4.10(撤回) → v4.10.1 → v4.11 → v4.12 → v4.14.2 → v4.15 → v4.16 → v4.17 → v4.18 → v4.18.1 → v4.19 → v4.20 → **v4.24**, 2026-09-09 25 步): `scripts/extract-chromakey-apng.py` docstring 顶部有完整记录 + 测试集 + 数据验证, 改 chroma key 前必读. **v4.24 当前默认** (v4.18.1 治眼白绿偏 + v4.19/v4.20 流畅度优化 50→100 帧 7.5→15fps + v4.24 forehead ROI 治本"白方块" + 整图绿幕残留治本).
  - **v4.20 → v4.24 演进根因 (2026-09-09 用户反馈"眼睛上方额头位置冒白色空白")**:
    - **症状**: v4.20 部署后用户"看起来好多了, 但是好像眼睛上方额头位置, 会有概率冒出白色的空白, 这个地方你没处理好". 桌宠循环 6.6s, 65/100 帧额头有 (255,255,255) 真纯白, 集中在 f075-f081 区间 (5-5.5s).
    - **真根因 (像素诊断反直觉)**: 源视频 H3 在 detective f075-f081 帧 (章鱼抬头/转脸) 帽沿/帽顶在额头位置渲染"白色高光" (RGB 178,69,69 深红 → 部署后 255,255,255). 同样 drink-coffee f015-f022 帧 + worker 多个帧 H3 把绿幕反射进身体, chroma key 完美保留. **不是 chroma key bug, 是 H3 源视频物理光照特征** (帽反光 + 绿幕反射进章鱼身体).
    - **之前 v4.21-23.2 多次缝补失败根因**: 全部在 color_mask 阈值层改 (R-G>=5, S*=0.5, sclera_zone ±15), 命中 0-5 px, 治不到 25+ px 的"帽反光真纯白". 反思: 源 (255,255,255) 跟 sclera (255,255,255) RGB 几乎相同, color_mask 永远区分不了.
    - **v4.24 治本 (commit 68ed1e9)**: 不在 color_mask 层改, 改在 chroma key 末尾后处理加 2 道 position-based mask:
      1. **green_residual_mask**: `alpha=255 + G-R>10 + G-B>10 + G>150` → 拉低 G 到 max(R, B+5) 跟周围身体色一致. 治本 drink-coffee 戴墨镜帧绿幕反射残留.
      2. **forehead_white_mask**: `alpha=255 + RGB>=250 + y∈[50,80) + x∈[70,110)` → 强制 (240,220,210) 暖白. 治本 detective 戴帽抬头"白方块". 跟 sclera_zone (y=110-145) 距离 30+ px 不冲突.
    - **验证数据 (100 帧 3 场景 forehead ROI)**: core 纯白 548/263/531 (v4.20) → 0/0/0 (v4.24). core 接近白 1042/618/1429 → 0/0/0. 整图绿幕残留 1100/2204/579 → 0/0/0. 有纯白帧数 62/55/73 → 0/0/0.
    - **桌宠实际渲染 (60 帧 18s 1 轮)**: detective 戴帽拿放大镜 (pet-10/11/13) 额头干净粉色; drink-coffee 喝咖啡 (pet-22/50) 闭眼 + 干净眼白; worker 戴黄帽 (pet-36) 帽下额头干净.
    - **教训**: 1) chroma key 任务"绿去干净 + alpha 锐利"完成后, 源视频物理光照特征 (帽反光/绿幕反射) 不是 chroma key 能治的, **position-based 后处理 mask** 才是正解. 2) 25 步 chroma key 演进 70% 时间浪费在 color_mask 阈值微调, 应该早看源视频物理光照, 早用 position mask. 3) PNG 看图工具 alpha=0 透明区域显示"棋盘格"误导"绿幕残留"判断, 实际桌宠透明窗口显示桌面背景. **必须看 alpha 数值, 不能凭 PNG 视觉**.
- **v5.2 BiRefNet + CorridorKey (NEW DEFAULT, 2026-09-10)**: 25 步 color-mask 演进已到极限——v4.24 治本 H3 源帽反光/绿反射, 但根本问题没解: 颜色阈值永远区分不了"绿幕色"和"绿幕反射进前景的色". v5.2 换思路, **直接用神经网络物理级 unmixing**:
  - **Stage 1 BiRefNet (ZhengPeng7/BiRefNet, fp16 1024)**: subject segmentation 输出 soft alpha hint (0-1 浮点). **255ms/帧 @ RTX 3060 1024, VRAM 1.7GB**. 边缘锐利, 无 H3 帽反光噪声.
  - **Stage 2 CorridorKey (nikopueringer/CorridorKey, GreenFormer 2048 内部, fp16)**: 接收 BiRefNet hint 作 input, 物理级 unmixing → linear alpha + straight FG color. **1.3s/帧 @ RTX 3060 768×768, VRAM 4GB**. 知道"绿幕绿 = 反射源", 自动分离"绿幕+前景" 混合. 天然支持:
    - **半透明边缘**（头发、运动模糊）→ 真实 fractional alpha
    - **颜色溢出 (spill)** → 前景色重建
    - **透明物体**（**放大镜玻璃** ✅, 这是 v4.24 完全做不到的）→ alpha 接近 0
    - **绿幕反射进身体**（H3 那类伪绿 ✅）→ alpha 归 0, 前景色重建
  - **v5.2 vs v5.1 BiRefNet alone (2026-09-10 commit pending)**: v5.1 BiRefNet alone 仍保留"放大镜玻璃应透明但变绿"问题——BiRefNet 把"章鱼身体上的绿反射"和"放大镜玻璃"都当主体, 治不干净, 得再加 `green_residual_alpha0` 兜底. v5.2 替代这条 `green_residual_alpha0`, 因为 CorridorKey 已物理治本.
  - **v5.2 (kept from v4.x)**: `forehead_white_mask` (H3 帽反光, 源视频物理光照缺陷, 治本必须 position mask, ROI y=50-80, x=70-110 强制 (240,220,210) 暖白). `sclera_zone` 和 `green_residual_alpha0` 全部 **删除** (CorridorKey 物理治本).
  - **3 场景实测 (RTX 3060 12GB, 100 帧, RED bg 验证)**:
    - RED bg 100% bg 像素 = 纯红 (alpha 完美无泄漏, 跨全部 3 场景 98 帧)
    - 绿残留 avg/帧 @ 192×192: detective **538→412 (1.3×)**, worker **674→386 (1.7×)**, drink **518→160 (3.2×)**
    - 文件大小: v4.24 4.7MB / 帧 → v5.2 3.0-4.0MB / 帧 (-20%)
    - 总耗时: v4.24 ~30s / 99 帧 → v5.2 **96s / 99 帧** (3.2× 慢, 离线可接受)
    - VRAM 峰值: v4.24 <2GB → v5.2 **5.5GB** (BiRefNet 1.7 + CorridorKey 4 共存, 12GB 内)
  - **已知 limit (H3 源视频问题, 非抠图问题)**: 当 H3 模型把前景渲成绿色 (detective f70 帽变绿, worker f70 工具+桌变绿), CorridorKey + BiRefNet 都正确识别为前景 (per H3 输出) 并保留. v4.24 有时"修复"这些 (误判为 bg), 但代价是身体 artefact. **要去除这些, 改 H3 prompt 重跑 H3**.
  - **依赖 + 部署**:
    - Python 3.12 (用 `PYENV_VERSION=3.12.3`, 因为 CorridorKey pyproject 锁 Python <3.14 会触发 pyenv auto-switch 到 3.13.11 没装包的环境)
    - torch 2.6.0+cu124, transformers 5.17.0, opencv-python-headless 5.0, einops, kornia, safetensors, huggingface-hub
    - BiRefNet 权重 444MB + CorridorKey_v1.0.safetensors 399MB, 走 `HF_ENDPOINT=https://hf-mirror.com` 下 (huggingface.co DNS 被劫持到 FB IP, 镜像必须)
    - 脚本: `scripts/extract-v52-apng.py`. `extract-chromakey-apng.py` (v4.x) 保留作 CPU-only fallback.
  - **教训**: 1) "颜色阈值治绿幕"是工业残留思路, 神经网络的 unmixing 模型 (CorridorKey) 一次到位, 治本 vs 缝补差几个数量级. 2) 25 步 v4.x color-mask 演进**不是浪费**, 是为了精确测量"颜色阈值路线的极限"——现在知道是 ~95%, 剩 5% 必须换 unmixing 模型. 3) `HF_ENDPOINT=hf-mirror.com` 是 CN 区域机器 HF 访问唯一通道, huggingface.co 自身 DNS 被劫持.
  - **v4.17 → v4.18.1 演进根因 (2026-09-09 用户反馈"灰蒙蒙"治本)**:
    - **v4.17 根因**: cv2.inpaint Telea r=8 在眼区 PDE 解算把 186 个 sclera 白像素改成 octopus 身体粉 (R=244 G=163 B=142), 5 个黑瞳边缘被擦掉成偏暖白. 诊断数据: drink-coffee f30 右眼 25x25 区 源 86.3% 白 → v4.17 18.9% 白 + 62.7% 粉.
    - **v4.18 修复**:
      1) `inpaint_partial_rgb` 接收 `eye_protect_mask` 参数 (瞳 ± 25 px 方块), 眼区 partial_mask 1px 膨胀 / dilation 后再跟 eye_protect 取差集, 跳过 inpaint. sclera 保留源偏暖白 (R=220 G=207 B=195), 黑瞳边缘保留黑.
      2) color_mask 放宽: `R>150 + (R-G)<70 + (G-B)∈[0,80] + (R-B)<120` (去 R 上限), 命中数从 50-1100 升到 50-1500 px.
      3) Bomberbot color spill suppression: partial alpha 像素 (眼区外) 前景 G 拉到 min(G,R,B), 抑制绿幕反射 spill.
    - **v4.18.1 关键 fix (15 分钟反思)**: sclera 连通分量 fill 越界 — `sclera_alpha = (alpha == 255) & sclera_zone` 找最大连通分量, 但 sclera_zone 是 50x50 方块, 整片脸都是 alpha=255 连通分量, 把整片脸都 fill 治本 = 视觉"白方块"覆盖眼睛上半部分. 修复: `eye_white = eye_white | (biggest_mask & color_mask)`, fill 跟 color_mask 取交集, 治本不越界.
    - **验证数据** (drink-coffee f30 右眼 25x25 区):
      源白保留: v4.17 31.5% → v4.18.1 89.7% (+58pp)
      变粉像素: v4.17 186 → v4.18.1 0 (-100%)
      真纯白: v4.17 2 → v4.18.1 138
      桌宠实际渲染 6.6s 循环 5/6 帧锐利白 + 星形高光 + 黑瞳保留.
    - **教训**: 任何"fill/sclera_zone 扩展"步骤必须跟 color_mask 取交集, 避免 fill 越界到 skin/触角/边缘. 教训已写 agent memory.
  - **v4.15 → v4.16 演进根因**: v4.15 部署后用户仍反馈"灰蒙蒙, 不干净". 反思根因: v4.15 mask `R>230 R-B<40` 太严, 3 场景睁眼帧命中 0-1 px, 几乎不生效. 实际 sclera RGB mean R=199 G=149 B=127 (R-G=40, G-B=22, R-B=70) 是 **green-tinted 偏色**, 不是 yellow. 之前 7 版 (v4.8-v4.14.2) 用 yellow_white 公式 (G-B>5 + R-B<60) 治, 完全没碰到 green cast (G-B=22 在范围内但 mask 缺 (R-G)<50 条件 + R 范围不对). v4.16 三步: 1) **放宽 color mask** 到 `R∈[150,245] + (R-G)<50 + (G-B)∈[10,100] + (R-B)<100` — 命中 50-1100 px/帧 (v4.15 0-1), 真正捕 green-tinted sclera. 2) **加空间约束 (瞳位置)** — worker 木板 RGB (190,160,130) 跟 sclera 几乎相同, 只能按位置区分. 黑瞳 ±18 px = sclera zone, color mask AND sclera_zone → 0 误治木板/帽高光. 闭眼帧无瞳 → sclera zone 空 → v4.16 不生效 (0 误治). 3) **保留 HSL L*1.18 + S=0** → 治后 sclera RGB (251,236,231)~(255,247,247) 真接近纯白. 视觉 3 场景眼底月牙从 greenish hazy → clean bright white.
  - **v4.16 → v4.17 演进根因 (当前默认)**: v4.16 部署后用户问"为什么 H3 源这么好眼白还会变灰". 反思根因 (用户原话 + 像素诊断):
    源视频 0.5s 帧 alpha=255/40000 = 100% 无 partial, RGB 干净. v4.16 部署后眼区
    alpha=255 仅 90.8% (52 个 partial 100-240 像素). 根因: `soften_alpha(radius=1)`
    1px Gaussian blur 把锐利 alpha 边变软, partial 像素 RGB 混合桌面背景 →
    视觉"灰蒙蒙". v4.17 移除 `softer_alpha` 步骤 — 源视频 H3 模型 768x768 高分
    辨率输出, 眼边缘本身锐利, 不需要额外 blur 抗锯齿. partial alpha 52 → 1,
    桌宠实际渲染眼边无"灰蒙蒙".
    调研佐证: Bomberbot 教程用 HSV + color spill suppression (前景 G 拉到
    min(G,R,B)), ChromaDespill (本科论文) YCbCr palette + green channel
    suppression, 都强调"对前景去绿"+"锐利 alpha 边界" — 我的 v4.16 缺这两步.
    风险: body 边缘可能"硬切". 实际验证: v4.6 的 inpaint r=8 已填 partial
    像素使 alpha 0/255 化, soften 影响小, 视觉 body 仍可接受.
  - **Tauri webview 不自动 reload `public/` 资源** — 替换 sprite 必须 kill 章鱼进程, `cargo tauri dev` 自动重启才生效.
  - **screencapture 截透明窗口必须用 `-l <window_id>`** — `-R x,y,w,h` 截不到透明 (穿透). 章鱼窗口 ID 用 swift CGWindowList 查 (osascript 报的 position 是 window-relative 不是屏幕坐标).
  - **H3 + `last_frame_image` 双图模式是首末一致循环视频唯一解** — Hailuo-2.3 物理做不到 (0s vs 5.5s 40-45% 相似, 道具不消失). 走 `~/.minimax/agents/mavis/skills/h3-dual-image-video-gen/`.
  - **H3 绿幕反射进眼镜片** (V2.1 待修) — 章鱼眼镜下半部出现绿色横带, 治本改 prompt 加 "no green tint reflection in eyes". 13/14 动作无此问题, 当前 01-detective-study 接受.
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
