# Changelog

All notable changes to **octopus-pet** are documented here. The format follows
[Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning 2.0.0](https://semver.org/).

## [Unreleased]

### Added
- **M5b 第二个 animation provider (Lottie)**: `app/src/animation/providers/lottie.ts`
  用 `lottie-web` 的 canvas renderer (lottie 内部维护一个 canvas, 我们用 rAF
  `drawImage` 同步到目标 ctx). 跟 apng provider 行为统一, 调用方拿 ctx 不用管
  下面是位图 (APNG) 还是矢量 (Lottie). 关键点:
  - 动态 import lottie-web, 避免 100KB+ 进 initial bundle
  - 屏幕外 wrapper div + remove cleanup, 避免 DOM 泄漏
  - 加载超时 (5s) + `data_failed` 错误路径, 不会卡死 useAnimation
  - 装 `lottie-web@^5.13.0` (新增依赖)
  - 验证: tsc 0 错误, 24/24 vitest, 8/8 cargo, 16/16 lint, scenes-sync OK
- **M5 animation abstraction layer**: 加新动画格式 (Lottie / WebM / GIF / ...)
  不再需要改 FSM/OctopusPet. 之前是 APNG-only, scene 加载 / getApngUrl /
  useApngPlayer / canvas size 全部硬编码 APNG. 新架构:
  - `app/src/animation/types.ts` — `Animation` + `AnimationProvider` 接口
    (start / stop / onCycleEnd / nativeWidth / nativeHeight / cycleMs)
  - `app/src/animation/registry.ts` — 单例 `animationRegistry.register(type, provider)` / `.get(type)`
  - `app/src/animation/providers/apng.ts` — 内置 APNG provider (包装 apng-js)
  - `app/src/hooks/useAnimation.ts` — 通用 hook (查 registry → provider.create → 绑 onCycleEnd)
  - `app/src/main.tsx` — 启动时 `animationRegistry.register(apngProvider.type, apngProvider)`
  - 删 `app/src/state/scenes.ts` (getApngUrl 移到 apng provider 内)
  - 删 `useApngPlayer` hook (OctopusPet 52 行 → 1 行)

  scenes.json schema 升级: 每条 scene 加 `animation` 字段 `{ type, source }`.
  老 entry (没 `animation` 字段) 走 `{type: "apng", source: <scene-id>}` 1:1 命名
  兼容. `check-scenes-sync.sh` 按 `animation.type` 走不同路径 — apng 检查本地
  .png, http/https/data URL 跳过本地检查, 其它类型按 source 路径检查.

  FSM/OctopusPet/useAnimation 零修改. 业务代码 (CLICK/PET/ASK/DRAG/ROTATE_NOW)
  也不知道 scene 是 APNG 还是 Lottie.

### Fixed
- **APNG num_plays 0 → 1 (修复 M5b 引入的事件驱动 regression, commit f2e0bb7)**:
  M5b (e068559) 重生成 V2 APNG 时 `extract-chromakey-apng.py` 默认 `loop=0`,
  导致 2 张 V2 APNG `acTL.num_plays=0` (无限循环). apng-js 只在 `numPlays=1`
  时才 emit `'end'` 事件, 无限循环下 scene 永远不切, 整条 V2.1 事件驱动调度
  (`apng-js 'end'` → `SCENE_LOOPED` → `rotateScene`) 静默失效. 修复:
  - `scripts/extract-chromakey-apng.py`: 默认 `loop=0` → `loop=1`, 加 `--loop`
    flag (未来 idle 无限循环场景用 `--loop 0`)
  - 重生成 2 张 V2 APNG (50 帧 × 132ms × 192×192, 视觉一致)
  - 删遗留 `useMcpBridge.ts` (M3 重命名 `useTauriEventBus` 后一直没删, 无引用)

### Changed
- **M1-M4 refactor (2026-08-27): 架构清理 + scenes.json 单一源 + 自动生成 TS/Rust**.
  用户反馈 "整理优化下当前的架构设计, 确保设计和代码上的逻辑都是最精简
  的, 没有死代码, 历史代码的冗余逻辑, 为后续开发迭代做准备". 完成:
  - **M1 死代码/历史冗余**: 删 `nextScene` (无引用), 删 `pet_set_state` MCP
    别名 (5 tools 总), 5 个文件头注释瘦身 (V1/V1.5/V2.1 历史叙事挪
    CHANGELOG), 删 test-*.html / spritesheet-*.png / `name=🐙` 残留文件
  - **M2 模块重构**: 抽 `app/src/state/apng.ts` (loadApng 收敛 CJS interop),
    抽 `useApngPlayer` hook (OctopusPet 52 行 → 1 行), 用官方 `APNG` 类型
  - **M3 标准范式**: `useMcpBridge` → `useTauriEventBus` (改名字反映实际机制,
    删 dead test-event listener), `OctopusEvent.now` 字段瘦身 (只在
    CLICK/PET/ASK 保留, 其他 4 个事件完全不需要), Bubble 30 行 inline 样式
    挪到 global.css, Rust `SharedState` + `recent_scenes` 字段
  - **M4 单一源**: 新建 `scenes.json`, `build_scene_registry.py` 从
    scenes.json 自动生成 `scene-registry.generated.ts` (SCENE_IDS /
    SCENE_ORDER / BUBBLE_BY_SCENE) 和 `scene_registry_generated.rs`
    (SCENES / BUBBLE_LINES), `OctopusScene` 类型从 `SCENE_IDS` 派生.
    `check-scenes-sync.sh` 适配新数据流 + CI 加 `--check` 步骤.
  - 加新场景: 改 scenes.json + 跑 build 脚本, 不再改 TS/Rust 多处
- **V2.1 (2026-08-27): 事件驱动 scene 调度, 替代 V1.5 33Hz setInterval**.
  用户 2026-08-24 23:19 反馈 "其实最理想的还是如果能用事件逻辑来控制动画
  会比较好, 定时器总是不太稳定的". 治本 4 个长期 bug:
  - **P1 APNG 中段剪切**: 8s setInterval 跟 6.6s APNG 循环不整除, 每次
    切都在循环中段. V2.1 改听 apng-js Player `'end'` 事件 (PIL loop=1,
    50 帧播完就 emit), scene 切严格对齐 APNG 最后一帧渲染完, **0 累积延迟**.
  - **P2 wall-clock 漂移** (NTP/DST/手动校时): V1.5 依赖 `Date.now()` +
    `ROTATION_INTERVAL_MS` 比较, 时钟跳变就崩. V2.1 拆掉 `autoNextAt` 字段,
    不再有 `now` 比较.
  - **P3 高频 IPC 压力**: V1.5 33Hz 心跳 → 30 次/秒 `sync_state`. V2.1
    状态变化 ~0.15Hz (每 6.6s 一次).
  - **P4 镜像乱序**: 跟 P3 同根, race frequency 降到 ~0.

  渲染: `<img>` (浏览器原生循环, 黑盒) → `<canvas>` + apng-js (JS 解码 +
  drawImage, 拿 frame/end 事件). 视觉跟 V1.5 一致 (APNG 解码出来直接
  drawImage, 无 chroma key 二次处理, 不会重复 V2.1 webm 路线 "配色好差"
  的坑).

  调度: `setInterval(33ms)` `TIMER_TICK` → `shouldRotate` guard (8s
  `autoNextAt`) → `rotateScene` 整套拆掉. 新事件 `SCENE_LOOPED` (来自
  apng-js `'end'`) → `rotateScene` action. guard `shouldRotate` 删,
  guard `shouldHideBubble` 删 (改用 setTimeout).

  bubble 计时: 单独 `useEffect` 挂 `setTimeout(BUBBLE_DURATION_MS)` →
  `DISMISS_BUBBLE` 事件, 不用全局 33Hz tick. 字段 `bubbleHideAt` 保留
  (Rust `SharedState.bubble_hide_at` 镜像用, pet_get_state 读得到).

  顺手治 P5: `pickBubble(scene)` 加空数组防御, 返回 `""` 而不是 `undefined`
  (未来加新 scene 忘配 `BUBBLE_BY_SCENE` 不会运行时挂).

  关键修复 (改造中发现的 2 个 bug):
  - **apng-js numPlays=1 (PIL loop=1)**: 跟直觉相反, APNG 文件只播一轮就
    停, 不会 wrap 回 frame 0. 原来想用 `frame` 事件 wrap-around 检测
    (49→0) 永远等不到. 改用 `'end'` 事件才对.
  - **Vite CJS interop 已 unwrap**: `import apngJsModule from 'apng-js'`
    在 Vite ESM 下, 因为 `__esModule=true`, `apngJsModule` 已经是
    `parseAPNG` 函数本身. 在函数上找 `.default` 全是 undefined →
    `parseAPNG is not a function`. 修复: `typeof === 'function'` 短路,
    再 fallback 到对象形态.

  时序证据 (3 cycle console 时戳, 误差 < 90ms 来自 apng-js rAF 抖动):
  ```
  tEnd(cycle 2) - t0(cycle 2) = 6530.0ms (APNG playTime=6600ms)
  tEnd(cycle 3) - t0(cycle 3) = 6513.5ms
  ```

  测试: 24/24 vitest + 8/8 cargo test 通过. tsc 0 错误.
  改动文件: `app/src/{components/OctopusPet.tsx, state/{octopus-fsm.ts,
  octopus-fsm.test.ts, types.ts}}` (212+ / 119-).

- **V1.5 (2026-08-21): 默认只跑 2 个 V2 视频成品, 不再用 14 V1 spritesheet**.
  用户 2026-08-21 19:14 反馈 "我们现在是默认的 2 个做好的成品啊, 之前那些
  (14 V1 打工人 meme 表情包) 不要用, 我们做的事桌面宠物, 思路不要走错了".
  V1.5 重写:
  - 渲染: 14 spritesheet → 2 V2 视频 APNG. 浏览器原生循环, 不需要 frame 计数器
    / backgroundImage 步长 / cellSize 计算 (上轮鬼畜图 bug 也消除).
  - 调度: 保留 V2 pickRandomScene (随机+去重), 触发方式 TIMER_TICK 33Hz →
    shouldRotate 8s autoNextAt 判定.
  - 场景: `SCENE_ORDER` = `["detective-study", "worker-construction"]`
    (H3 戴帽研究 + gen_videos 工人施工).
  - `RECENT_WINDOW_SIZE` 1 (14 场景时期 N=5, 2 场景时期 N=1 即可, 必不连续重复).
  - 资产: 14 V1 spritesheet 移 `_archive-v1-spritesheets/` (不用), 2 V2 APNG
    `app/public/assets/octopus/v2/<scene>.png` (50 帧 × 132ms = 6.6s 循环,
    RGBA, 2.3MB 各). 走 `scripts/extract-chromakey-apng.py` v3 公式 (中性色
    alpha=255, 避免眼睛高光被抠成半透明).
  - 删 `spritesheet-manifest.json` (V1.5 不用: scene→APNG 1:1 命名, 无需第三个
    JSON 副本). `check-scenes-sync.sh` 改两源 (types.ts + mcp_stdio.rs) + APNG
    文件存在性检查.
  - 23 tests PASS (从 28 缩到 23, 因为 2 场景测试覆盖度比 14 场景少).

### Added
- **V2 调度: 随机 + 去重最近 5 个场景**: `app/src/state/octopus-fsm.ts` 加
  `pickRandomScene(current, recent, rng)` + `updateRecent` 辅助函数.
  `rotateScene` (8s 自然轮转) 和 `ROTATE_NOW` 改用随机, 从 14 场景里排除
  `current` + `recentScenes` (滚动窗口 N=5) 后等概率选. **FORCE_SCENE 不更新**
  recentScenes (MCP 显式控制不影响自然序列). V1 顺序轮转 `nextScene` 函数保留
  导出, 仅供测试. `RECENT_WINDOW_SIZE=5` 调优: 14-1-5=8 候选, 体感"真随机".
  14 步模拟: 12/14 唯一, 0 个 5 步内重复. 28 tests PASS (V1 shouldRotate + V2 调度).
- **V2 视频 → 桌宠 APNG 完整流程**: `docs/v2-h3-to-pet-workflow.md` 沉淀 H3 双图 →
  ffmpeg 15fps 抽帧 → chroma key v3 → 192×192 APNG 4 步管线. 01-detective-study
  桌宠集成验证 PASS (50 帧 × 132ms = 6.6s 循环, 2.3MB).
- **chroma key v3 公式**: `greenness = clip((G - max(R,B) - 10) / 20, 0, 1)`. v1 公式
  对中性色 (白色高光, 章鱼眼反光) 抠成半透明 → 眼睛高光变透明 bug. v3 让中性色
  alpha=255 完全不透明. 沉淀在 `scripts/extract-chromakey-apng.py` (13 动作复用).
- **H3 + `last_frame_image` 双图模式**: 首末帧严格一致 96.58% 相似 (Hailuo-2.3
  物理做不到 40-45%). 走 `~/.minimax/agents/mavis/skills/h3-dual-image-video-gen/`,
  包含 run_h3_video.py + verify_h3_video.py + evals/ 案例归档.
- **VP9 alpha 编码 (V2 备用)**: `scripts/encode-webm-alpha.sh` 封装 ffmpeg-full Cellar
  locate + 双向 alpha 验证 (encoder help 预检 + ffprobe TAG:alpha_mode=1 后检).
  30 帧 RGBA → 8KB webm + alpha 真保留. V1 主用 APNG, V2 长动作 (>50 帧) 走这条,
  体积小 14-28x.
- **HEVC alpha 验证结论 (永久不可行)**: Apple `VTCompressionSession` 私有 API
  架构限制, 即使显式 `format=yuva420p` 也 strip alpha. 跟 macOS/ffmpeg 版本无关,
  永远不考虑 HEVC alpha 路线.
- V0.5 基础验证闭环 (3 项, 2 完成 1 blocked): VP9 alpha 可走 / HEVC alpha 不可行
  / gen_videos 首尾帧验证待新基础素材.

### Fixed
- **Tauri 桌宠实际运行**: 透明背景 (macOSPrivateApi: true) + alwaysOnTop +
  116×116 窗口 (60% 大小) + APNG 呼吸/眨眼循环 (6.25s, 75 帧 @ 12fps).
- FSM 8s 轮转卡 `stay-late` bug: `rotateScene` 恒用 `nextScene(initialContext.scene)`,
  任何场景 8s 后都切到 stay-late. 改为 `nextScene(context.scene)`, 补 14 场景全量轮转回归测试.
- HTTP :9527 fallback 断链: POST /show|/ask|/pet 只写 SharedState 不 emit,
  前端不响应. 现持有 AppHandle, 委托 actions 后 emit 事件.
- **sync_state command 从未工作**: `State<Mutex<SharedState>>` 与 `.manage(Arc<Mutex<SharedState>>)`
  类型不匹配, invoke 报 "state not managed". 改为 `State<Arc<Mutex<SharedState>>>` —
  旧 4 个 command 是死代码从未被 invoke, bug 被掩盖; C4 接线后才暴露 (GUI 实测发现).

### Changed
- **窗口 200×200 → 192×192 (= 素材尺寸, 零边距)**: 去掉素材四周 4px 透明缝隙
  (透出桌面色会看起来像白边), 素材完全铺满窗口.
- **状态权威收敛**: XState 是唯一状态权威, Rust `SharedState` 降级为只读镜像,
  webview 经 `sync_state` 回写 (字段级节流, 防 60fps 轰炸 IPC). `pet_get_state` /
  HTTP /state 与屏幕显示一致.
- 业务逻辑单点: 场景校验 / ≤12 字截断 / bubble 3s / affection+5 收敛到
  `src-tauri/src/actions.rs`, MCP stdio / HTTP fallback 全部委托 (原 4 处重复).
- 删 3 个死 tauri command (`force_scene`/`ask`/`pet`, 前端从未 invoke).
- 删孤立 `frame` 字段 (`OctopusState` + `SharedState`, 渲染帧由组件 useState 持有).
- spritesheet-manifest.json 单源化: 唯一副本 `app/src/data/` (生成脚本输出改这里),
  删 public 双生副本.
- 14 场景清单三源一致性由 `scripts/check-scenes-sync.sh` 校验 (CI 挂载).

### Reverted
- **V2.1 视频流 (webm + canvas chroma key) 路线回退**: 用户 2026-08-17 18:21 反馈
  "V2.1 配色好差, 不如之前舒服, 回退吧, 我想别的办法做动画切换的效果". 根因: V2.1
  hidden `<video>` + visible `<canvas>` + `applyChromakey` 实时透明化, 跟 V1 APNG 比
  边缘有半透明瑕疵 + 配色 (HSV 70-170° chroma key 把场景中非纯色的"暗色"误判为绿
  背景, 中性色变暗). 回退范围:
  - 渲染: `OctopusPet.tsx` 回 V1 `<img>` + `frameToGrid` 选 141 帧 (V1 spritesheet
    风格, 视觉舒服).
  - 调度: 保留 V2 `pickRandomScene` 随机+去重框架, 但触发方式从 `SCENE_ENDED` 事件
    (video 元素 `onEnded`) 回到 V1 `TIMER_TICK` 33Hz → `shouldRotate` 8s 判定.
    `SCENE_ENDED` 事件类型从 `OctopusEvent` union 移除.
  - 删除: `app/src/utils/chromakey.ts`, `app/src/data/v2-sprite-map.ts`,
    `app/public/assets/octopus/v2/` (webm + V2 APNG), `app/public/assets/octopus/breath-idle.png`,
    stale `_trace.test.ts` (用 SCENE_ENDED).
  - 测试: V1 风格 `shouldRotate` (8s autoNextAt 判定) + V2 随机+去重同时验证.
    28 tests PASS.
  - FSM 用 `event.now` (而非 `Date.now()`) 重置 `autoNextAt`, 跟测试虚拟时钟兼容.

  **保留**: V2 调度 (随机+去重), H3 视频生产管线, chroma key v3 公式 (PIL APNG
  路线仍然 13 动作复用).

### Added
- `scripts/release-plugin.sh`: 发布二进制 (必须走 `cargo tauri build --no-bundle`,
  裸 cargo 增量会跳过 asset 嵌入) → `bin/octopus-pet.bin` (提交进 git) +
  `dist/octopus-pet-plugin/` (可独立加载插件目录) + MCP 冒烟.
- `bin/octopus-pet.bin` 提交进 git: repo clone 即插件可加载, 零本地构建.
- `src-tauri/Cargo.lock` 恢复提交 (应用项目可复现构建, 之前被误 ignore).
- `app/src/hooks/useStateSync.ts`: FSM → Rust 镜像回写.

### Known Limitations (V1)
- **Single-instance only** (`tauri-plugin-single-instance`): first mcode session wins, subsequent sessions' MCP calls fail silently. Multi-session shared pet deferred to V1.1+ via Unix domain socket forwarding.
- RGB rendering only (no alpha channel) — 14/14 scenes
- 141 frames → 8s rotation causes half-cycle scene swaps (single loop is 11.75s)
- No mcode task event → scene mapping (mcode has no good hook yet)
- macOS only (V2 will add Windows)
- `bin/octopus-pet.bin` 是 author 机器 macOS arm64 产物, 其他架构需本地构建
- No audio, no custom skins, no multi-screen, no startup-on-boot, no right-click menu beyond pet

## [0.1.0] - 2026-08-18 (W1 D1 + W1 D2)

### Initial Release
- First working scaffold: 14 spritesheets, plugin spec compliance, MCP stdio server
- 4.2MB ARM64 binary (`src-tauri/target/release/octopus-pet`)
- Verified via `printf '{...}' | octopus-pet --mcp-stdio` (initialize + tools/list + tools/call)

[Unreleased]: https://github.com/weekbin/octopus-pet/compare/HEAD
[0.1.0]: https://github.com/weekbin/octopus-pet/releases/tag/v0.1.0
