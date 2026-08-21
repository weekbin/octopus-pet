# Changelog

All notable changes to **octopus-pet** are documented here. The format follows
[Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning 2.0.0](https://semver.org/).

## [Unreleased]

### Added
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
