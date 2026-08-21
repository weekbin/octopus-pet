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
| 状态 | W1 D2 (W1 D1 ✅, D2 🔄) |
| 栈 | Tauri 2 · React 19 · Vite 6 · XState 5 · Rust 1.77+ |
| 窗口 | 192×192 (=素材尺寸, 零边距) · transparent · no-decoration · alwaysOnTop · skipTaskbar |
| 14 场景 | pretend-busy → stay-late → breakdown → lying-flat → multi-tasking → payday → salary-rejected → treat-milk-tea → friday-5pm → toilet-slacking → touch-fish → waiting-m3pro → soul-leaving → multitask |
| 6 MCP tools | pet_show · pet_ask · pet_get_state · pet_set_state · pet_pet · pet_list_states |
| 14 spritesheet | 141 帧/张, 2 行 × 71 列, 13632×384 px, WebP lossy q80, 总 9.1MB |
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
| 14 spritesheet | `app/public/assets/octopus/spritesheet-{01..14}-*.webp` |
| Spritesheet manifest | `app/src/data/spritesheet-manifest.json` (**唯一副本**, 生成脚本输出这里) |
| 14 场景素材审计 | `docs/octopus-assets-audit.md` (W1 D1 产物) |
| 变更历史 | `CHANGELOG.md` (Keep a Changelog 1.1.0) |
| CI | `.github/workflows/ci.yml` (spec lint · asset audit · spritesheet regen · Rust build · Vitest) |
| **V0.5-3 验证产物** | `docs/v053-validation/` (gen_videos 6s 视频 + 0s/5.5s 对比帧, 96.65% 相似) |
| **V2.1 标准图** (V2 idle 起点) | `art/octopus-frames/standard-char-1x1.png` (3/4 视角, 1:1, 绿幕, 1920×1920; `art/` 在 .gitignore) |
| **V2 绿幕清洗脚本** | `scripts/remove-hat-greenscreen.py` (V2.1 14 动作复用) |
| **V2 视频 → 桌宠 APNG 流程** | `docs/v2-h3-to-pet-workflow.md` (4 步: H3 双图 → 抽帧 → chroma key v3 → APNG, 01-detective-study 首跑通) |
| **V2 抽帧 + chroma key + APNG 一键脚本** | `scripts/extract-chromakey-apng.py` (v3 公式沉淀, 13 动作复用) |

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
- **V1.5 渲染 + V2 调度 (回退 V2.1 路线)**: 用户 2026-08-17 18:21 反馈 V2.1
  视频流 (webm + canvas chroma key) "配色好差, 不如之前舒服". 根因: canvas 实时
  chroma key 边缘半透明瑕疵 + 配色偏暗 (HSV 70-170° 误判场景中"非纯色的暗色"
  为绿背景). 切回 V1 渲染 (`<img>` + `frameToGrid` 选 141 帧, spritesheet 风格,
  视觉舒服), 保留 V2 调度 (随机+去重). **SCENE_ENDED 事件已从 FSM 移除** (V2.1
  路线副产物, 不再需要), 切 scene 走 V1 `TIMER_TICK` 33Hz → `shouldRotate` (8s
  autoNextAt 判定). 用户后续" 别的办法做动画切换" 待 V2.1 治本 (例如 cross-fade
  V1 sprite + V2 APNG, 或 H3 视频流 + 更好 chroma key) 再讨论.
- **V2.1 调度 (已废弃, 2026-08-17)**: 视频播完事件驱动 (替代 setInterval 8s 计时).
  用户曾反馈 setInterval 时间卡不准, 事件循环延迟累积. 改成 `<video>` 元素
  `onEnded` 事件 → 发 `SCENE_ENDED` → FSM 切 scene. 跟 sprite 视频时长 (6.6s) 严格
  同步, **0 累积延迟**. **V2.1 整体回退后不再使用, 事件类型已从 OctopusEvent 移除**,
  不要再加回.
- **V2.1 渲染 (已废弃, 2026-08-17)**: hidden webm + visible canvas + JS chroma key
  (绕开 WKWebView webm alpha bug). 4 帧实测: 透明背景 + 视频元素事件驱动切 scene
  PASS, 但视觉差. **V2.1 整体回退后不再使用, 不要再走这条**. 若将来需要 webm
  alpha 在桌宠内播放, 重新评估 WKWebView 是否修了 webm alpha bug 再考虑.
- **改场景清单 (14 场景)**: 三处同步 — `app/src/state/types.ts` (SCENE_ORDER) +
  `app/src/data/spritesheet-manifest.json` (scenes[].sceneId) + `src-tauri/src/mcp_stdio.rs`
  (SCENES). 改完跑 `bash scripts/check-scenes-sync.sh` (CI 也会跑).
- **改 spritesheet**: 141 帧是源头真理. 真要改, 从 `~/Works/octopus-worker-meme` 抽,
  跑 `extract-and-link-octopus-frames.sh` + `spritesheet-builder.sh` + `generate-spritesheet-manifest.sh`.
- **换桌宠 idle 动画素材**: 走 `docs/breath-pipeline.md` 完整流程 (image_synthesize
  立绘 → gen_videos 慢眨眼 → ffmpeg 抽帧 → flood-fill 抠图 → 持续睁眼+加速眨眼
  拼接 → APNG 输出). 关键阈值: flood-fill `edge_thresh=50` (避免抠掉嘴内部深红),
  APNG `disposal=0` (避免 PIL 合并相同帧), tauri.conf.json `macOSPrivateApi: true`
  (macOS 透明必需). 不用 GIF (透明兼容差). V1 默认 APNG, V2 长动作可走 WebM VP9 alpha
  (见下面"ffmpeg-full 接入"规则).
- **V2 视频 → 桌宠 APNG (H3 / gen_videos 走完)**: 走 `docs/v2-h3-to-pet-workflow.md` 完整 4 步 (H3 双图 → ffmpeg 15fps 抽帧 → chroma key v3 → 192×192 APNG). 关键坑:
  - **chroma key v3 公式** (`G - max(R,B)` 阈值法, `clip((diff - 10) / 20, 0, 1)`) — v1 公式 `clip(diff / 60 + 0.5)` 对中性色 (白色高光, 章鱼眼反光) 抠成半透明, **v3 让中性色 alpha=255 完全不透明**. 详见 `scripts/extract-chromakey-apng.py`.
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
- **Tauri beforeBuildCommand 以项目根为 CWD**: `tauri.conf.json` 里的命令用
  `npm --prefix app run build` (项目根视角), 不要写 `../app` (会解析到项目外).

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
