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
| 状态 | **V2.1 (2026-08-27) 事件驱动 scene 调度 (apng-js end → SCENE_LOOPED)**, 默认 2 个 V2 视频成品 |
| 栈 | Tauri 2 · React 19 · Vite 6 · XState 5 · apng-js 1.1.5 · Rust 1.77+ |
| 窗口 | 116×116 透明, V2 APNG 192×192 在 `<canvas>` 内部 (CSS 缩放到 116×116) |
| **3 V2 场景 (V2.1 默认)** | detective-study (H3 戴帽研究) · worker-construction (H3 工人施工) · **drink-coffee** (H3 喝咖啡, 2026-09-09 fef8017) |
| 6 MCP tools | pet_show · pet_ask · pet_get_state · pet_set_state · pet_pet · pet_list_states |
| **3 V2 APNG** | 50 帧/张 × 132ms ≈ 6.6s 循环, RGBA, 192×192, ~2.7-3.0MB 各, 走 PIL **v4.5.1** chroma key (相对绿度 + 严保护 + inpaint Telea r=4 + 6px mask 膨胀 + alpha 羽化) |
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
| **V2 APNG 生产脚本** | `scripts/extract-chromakey-apng.py` (mp4 → 50 帧 RGBA APNG, v4.5.1 chroma key 默认, v3 选项兼容) |
| 14 场景素材审计 | `docs/octopus-assets-audit.md` (W1 D1 产物) |
| 变更历史 | `CHANGELOG.md` (Keep a Changelog 1.1.0) |
| CI | `.github/workflows/ci.yml` (spec lint · asset audit · spritesheet regen · Rust build · Vitest) |
| **V0.5-3 验证产物** | `docs/v053-validation/` (gen_videos 6s 视频 + 0s/5.5s 对比帧, 96.65% 相似) |
| **V2.1 标准图** (V2 idle 起点) | `art/octopus-frames/standard-char-1x1.png` (3/4 视角, 1:1, 绿幕, 1920×1920; `art/` 在 .gitignore) |
| **V2 绿幕清洗脚本** | `scripts/remove-hat-greenscreen.py` (V2.1 14 动作复用) |
| **V2 视频 → 桌宠 APNG 流程** | `docs/v2-h3-to-pet-workflow.md` (5 步: H3 双图 → 抽帧 → chroma key v4.5.1 → alpha 羽化 → APNG, drink-coffee 最新跑通) |
| **V2 抽帧 + chroma key + APNG 一键脚本** | `scripts/extract-chromakey-apng.py` (v4.5.1 公式沉淀, 14 动作复用) |

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
  1. 跑 `docs/v2-h3-to-pet-workflow.md` (H3 / gen_videos → 抽帧 → chroma key v4.5.1 → alpha 羽化 → 192×192 APNG)
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
- **V2 视频 → 桌宠 APNG (H3 / gen_videos 走完)**: 走 `docs/v2-h3-to-pet-workflow.md` 完整 5 步 (H3 双图 → ffmpeg 15fps 抽帧 → chroma key v4.5.1 → alpha 1px Gaussian blur 羽化 → 192×192 APNG). 关键坑:
  - **chroma key v4.5.1 公式** (`(G - max(R,B)) / G` 相对绿度, `clip((rel - 0.15) / 0.3, 0, 1)`) + **严保护** (`(max<80) AND (G-max(R,B)<20)` 区分真阴影 vs 绿反射; `80 ≤ max < 150` 且 `G - max(R,B) < 30` 算皮肤保护中绿) + **cv2.inpaint 分 2 步** (1) partial+透明 单独 inpaint (Telea r=5, 不膨胀, 保护眼睛清晰度) (2) green_opaque 单独 mask 6px 膨胀 (kernel 3x3, iterations=2) + Telea r=4, 修身体/帽子的绿调反射 + **alpha 羽化** (1 像素 Gaussian blur 让 192→116 resize 边缘从硬切变软边). 详见 `scripts/extract-chromakey-apng.py`.
  - **v3 → v4 演进根因**: v1 `clip(diff/60+0.5)` 跟 v3 `clip((diff-10)/20)` 都是绝对绿度阈值, 白色眼底微小绿影 (RGB 164,182,150, G-R=18) 触发 partial-alpha 153 → 桌宠眼白下边缘显"高亮透明". v4 改用相对绿度归一化到 G 本身, "绿在 G 里的占比" < 0.2 → 不透. 8 色 + H3 残留测试集全部通过.
  - **v4 → v4.1 演进根因**: H3 模型在脸颊/触手上渲染深绿反射 (RGB ~22,45,7), v4 公式看 (45-22)/45=0.51 > 0.2 → alpha=0 完全透明 → 桌宠透出 mcode UI 白底 → 用户看到"白色斑块". v4.1 加 `max(RGB) < 80` 强制不透明保护深色阴影.
  - **v4.1 → v4.2 演进根因**: H3 模型的"绿黄残留" (RGB ~155,188,75, 偏亮绿反射) 在 v4.1 公式下 `rel=0.135 < 0.2` → 保留为不透明绿色, 桌宠身体/帽子上有绿色斑. 阈值 0.2 → 0.15 + 中绿保护让绿黄也走 soft 透明 (-98%), alpha 羽化让边缘软化.
  - **v4.2 → v4.3 演进根因**: alpha 羽化让 partial 像素变多 (0.21% → 1.18%), 但 partial 像素 RGB 均值 R=25, G=198, B=11 (100% 绿偏, H3 边缘渲染"绿+粉"混合色), 羽化后 partial 像素仍偏绿 → 桌宠身体外圈显"绿色描边". v4.3 加 cv2.inpaint (Telea r=5) 修 partial + 透明区域 RGB.
  - **v4.3 → v4.4 演进根因**: v4.3 残余"绿色阴影"在触手/身体 (alpha=255 但 RGB 绿偏), v4.1 保护 `max<80` 把 H3 深绿反射 (RGB ~20,55,8) 误保留了. v4.4 加严保护 `(max<80) AND (g_max_rb<20)` 区分真阴影 vs 绿反射 (深绿反射 28214 个被 v4.4 排除保护), inpaint mask 扩展到 alpha=255 绿偏像素 (G>R+5 AND G>B+5).
  - **v4.4 → v4.5 演进根因**: v4.4 残余"绿调反射高光"在 H3 帽子/放大镜 (RGB ~150,130,60 或 145,147,23, R>G 但 B 极低, 视觉像绿调), v4.4 mask 只覆盖绿偏像素本身, 没扩到外圈"绿调反射"区域. v4.5 mask 6px 膨胀 (kernel 3x3, iterations=2) + radius 4 (替代 r=5, 配合膨胀). 50 帧总和: detective-study -81px, worker-construction -690px, drink-coffee 持平 0. 视觉: 侦探帽变纯净棕色, 放大镜玻璃绿色反射消失, 黄色施工帽保留, 白色眼睛/腮红/阴影细节保留.
  - **v4.5 → v4.5.1 演进根因**: v4.5 mask 6px 膨胀覆盖了眼睛 partial 边缘, 眼睛的高光(星形)/瞳孔(黑色)/眼底月牙(白色)被 inpaint 改成周围身体色(粉色), 眼睛清晰度从锐利变模糊. v4.5.1 把 mask 拆成 2 步独立 inpaint: (1) partial+透明 单独 inpaint (Telea r=5, 不膨胀, 保留 v4.4 行为 → 眼睛恢复清晰度) (2) green_opaque 单独 mask 6px 膨胀 (kernel 3x3, iterations=2) + Telea r=4 (修身体/帽子的绿调反射). 视觉验证: 侦探帽变纯净棕色 (v4.5 保留) + 眼睛锐利 (v4.4 清晰度恢复) + 黄色施工帽保留.
  - **chroma key 演进总表** (v1 → v3 → v4 → v4.1 → v4.2 → v4.3 → v4.4 → v4.5 → v4.5.1): `scripts/extract-chromakey-apng.py` docstring 顶部有完整记录 + 测试集 + 数据验证, 改 chroma key 前必读.
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
