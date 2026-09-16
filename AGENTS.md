# AGENTS.md

> 协作者 + AI agent 向的项目地图. 人类请看 `README.md`.

## 一句话

Coral-pink 章鱼桌宠 — Tauri 2 + React 19 + XState 5 + MCP stdio, 作为 [agent-plugins.org v1.0.0](https://agent-plugins.org/specification) plugin, 跨 8 客户端 portable (mcode / Cursor / Claude Code / VS Code / Codex / Kiro / Antigravity / Gemini CLI).

## 项目坐标

| 项 | 值 |
|---|---|
| 状态 | **V3.0 (2026-09-16) P0 解除**: H3 视频生成 ✅ / 验证 ✅ (18 合格) / mp4 rsync ✅ / v10-final 重生成 18 APNG ✅ (BiRefNet+CorridorKey 治本白方块) / scenes.json 8→26 ✅ / check-scenes-sync + lint + test ✅. 待 `release-plugin.sh` 跑 V3.0 release. 接手任务见 `HANDOFF.md` |
| 栈 | Tauri 2 · React 19 · Vite 6 · XState 5 · Rust 1.77+ |
| 窗口 | 116×116 透明, V2 APNG 192×192 在 `<img>` 内部 (CSS 缩放到 116×116, 浏览器原生 APNG 循环) |
| 8 V2 场景 (V1.5+ 默认) | detective-study · worker-construction · drink-coffee · breakdown · friday-5pm · pretend-busy · stay-late · treat-milk-tea |
| 6 MCP tools | pet_show · pet_ask · pet_get_state · pet_set_state · pet_pet · pet_list_states |
| 8 V2 APNG | 99 帧/张 × 66ms ≈ 6.5s 循环 (15fps), RGBA, 192×192, ~3.2-3.4MB 各, 走 `scripts/extract-v10-final.py` |
| scene 调度 | 事件驱动 `setTimeout(APNG_CYCLE_MS=6500)` → `SCENE_LOOPED` → FSM `rotateScene`, 紧跟 APNG 末尾, 0 漂移 |
| Spec 依据 | [agent-plugins.org v1.0.0](https://agent-plugins.org/specification) + [MCP 2024-11-05](https://modelcontextprotocol.io/specification/2024-11-05) + [agentskills.io](https://agentskills.io/specification) |
| HTTP fallback | `:9527` (MCP stdio 不可用时启用) |

## Setup commands

| 动作 | 命令 | 说明 |
|---|---|---|
| Install (frontend) | `cd app && npm install` | Node 20+ |
| Install (backend) | `cd src-tauri && cargo build` | 拉 Rust crates |
| Dev | `npm run tauri:dev` | Vite dev server + Tauri 窗口 (走 `scripts/run-vite.sh`) |
| Release build | `npm run tauri:build` | 产物 `src-tauri/target/release/bundle/<platform>/` |
| Plugin release | `bash scripts/release-plugin.sh` | 产出 `bin/octopus-pet.${KERNEL}.bin` (随 commit 提交) |
| Test (frontend) | `cd app && npm test` | Vitest |
| Test (backend) | `cd src-tauri && cargo test` | MCP stdio roundtrip |
| Lint | `bash scripts/lint-octopus-plugin.sh` | 16/16 spec schema |
| Scene sync | `bash scripts/check-scenes-sync.sh` | types.ts ↔ manifest ↔ mcp_stdio.rs 三源一致 |
| Asset audit | `bash scripts/audit-octopus-assets.sh` | 8 场景素材盘点 |

**为何用 `scripts/run-vite.sh` 而不是 `--prefix app`/`cd app &&`**: Tauri 2 `beforeDevCommand` 实际 CWD = `frontendDist` 父目录, `beforeBuildCommand` 实际 CWD = `src-tauri/` 或项目根, 三套 CWD 假设互相冲突. wrapper 用 `BASH_SOURCE` 自治定位 → `cd $SCRIPT_DIR/../app` → `npm run "$@"`, 1 套配置跨所有 CWD 假设 work. 不要写 `--prefix app` / `cd app &&` / `--prefix ../app`.

## 关键路径

| 用途 | 路径 |
|------|------|
| 用户向文档 | `README.md` |
| Plugin manifest | `plugin.json` (spec §5) |
| MCP server manifest | `mcp.json` (spec §7, type=stdio) |
| Skill frontmatter | `skills/octopus-pet/SKILL.md` (agentskills.io) |
| Plugin entrypoint | `bin/octopus-pet` (spec §9.2; dev=本地构建优先, 发布=平台特定 `.bin` 兜底) |
| Release artifact | `bin/octopus-pet.{macos,linux}.bin` (各 ~32MB, 内嵌 8 APNG, commit 时一起提交) |
| 状态逻辑单点 | `src-tauri/src/actions.rs` (MCP/HTTP 唯一的 `apply_*` 实现) |
| 状态镜像回写 | `src-tauri/src/state_bridge.rs::sync_state` (webview→Rust, 只写不 emit) |
| React 前端 | `app/src/` (animation · components · hooks · state · styles) |
| Rust 后端 | `src-tauri/src/` (lib · main · actions · mcp_stdio · state_bridge · http_fallback · scene_registry_generated) |
| 8 V2 APNG | `app/public/assets/octopus/v2/{detective-study,worker-construction,drink-coffee,breakdown,friday-5pm,pretend-busy,stay-late,treat-milk-tea}.png` |
| Scene 单一源 | `scenes.json` (项目根) → 跑 `bash scripts/build-scene-registry.sh` 生成 TS + Rust |
| V2 APNG 生产脚本 | `scripts/extract-v10-final.py` (BiRefNet 1024 + CorridorKey 2048 + 6 阶段 fixup) |
| APNG CPU fallback | `scripts/extract-v4-chromakey-cpu-fallback.py` |
| H3 prompt 格式 | `prompts/00-format.md` + 8 真实范例 `prompts/{01,02,03,04,06,09,10,11}-*.md` |
| 变更历史 | `CHANGELOG.md` (Keep a Changelog 1.1.0) |
| 接手任务 | `HANDOFF.md` (每个 release 周期第一件事是 grep 它) |
| 待办 | `TODO.md` |
| CI | `.github/workflows/ci.yml` (lint · asset audit · scene sync · Rust build · Vitest) |
| V2.1 标准图 (V2 idle 起点, gitignore) | `art/octopus-frames/standard-char-1x1.png` |

## 协作规则 (根因型, 别打地鼠)

### 状态与架构

- **状态逻辑改 `actions.rs` 单点**: 场景校验 / ≤12 字截断 / bubble 3s / affection+5 只在 `src-tauri/src/actions.rs`. MCP stdio / HTTP fallback 都委托它, 不要在新入口复制逻辑.
- **状态权威是前端 XState**, Rust `SharedState` 只是镜像 (`sync_state` 回写). 不要让 Rust 端 emit 状态事件, 否则会回环到 XState.

### Spec 三件套

- **`plugin.json` + `mcp.json` + `skills/octopus-pet/SKILL.md`** 是 spec 必填. 改任一文件后必跑 `bash scripts/lint-octopus-plugin.sh` 校验 (16/16).

### 渲染与 scene 调度 (V1.5+ 现行方案)

- **跨平台 APNG 渲染**: `<img>` + `img.src = url` 让浏览器原生循环 APNG. **不要**再走 `<canvas>` + apng-js 路径 — Tauri 2 macOS WKWebView transparent 浮窗里 canvas 0 像素 (chromium 浏览器 work, Tauri macOS fail).
- **scene 调度 事件驱动**: `Animation.onCycleEnd()` (APNG 走 `setTimeout(APNG_CYCLE_MS=6500)` 模拟, 99 帧 × 66ms ≈ 6.5s) → `SCENE_LOOPED` → FSM `rotateScene`. 紧跟 APNG 末尾, 0 累积延迟, 不依赖 wall-clock.
- **V2 scene 选择 随机 + 去重**: `octopus-fsm.ts::rotateScene` / `ROTATE_NOW` 走 `pickRandomScene(current, recent, rng)`, 排除 `current` + `recentScenes` (滚动窗口 N=5) 后等概率选. **`FORCE_SCENE` 不更新 `recentScenes`** (MCP 显式控制不影响自然轮转序列). 14 步模拟 sim 14 次: 12/14 唯一场景, 0 个 5 步内重复.

### scenes.json 单一源

- 改完 `scenes.json` 跑：
  ```bash
  bash scripts/build-scene-registry.sh    # 生成 TS + Rust
  bash scripts/check-scenes-sync.sh      # CI 必跑, 验三源一致
  ```
- 生成物: `app/src/state/scene-registry.generated.ts` (SCENE_IDS / SCENE_ORDER / BUBBLE_BY_SCENE), `src-tauri/src/scene_registry_generated.rs` (SCENES / BUBBLE_LINES). 业务代码从 `./types` / `crate::scene_registry_generated` re-export, 不直接 import generated.
- **`V1.5+ APNG 不需要 `numPlays` 限制** (浏览器原生 APNG 循环自动 loop, 不依赖 apng-js). 8 场景 APNG 都用 PIL `loop=0` (无限循环) 即可.
- **scenes.json schema 兼容**: 老 entry 没 `animation` 字段时, build 脚本默认 `{type: "apng", source: <scene-id>}` (1:1 命名约定). 平铺 `animationType`/`animationSource` 也兼容.

### 动画扩展 (M5)

- **scene 渲染不再绑死 APNG**. 加新动画格式 (Lottie / WebM / GIF / SVG) 不需要改 FSM/OctopusPet/useAnimation.
- 架构：
  - `app/src/animation/types.ts` — `Animation` 接口 (start/stop/onCycleEnd/nativeWidth/nativeHeight/cycleMs) + `AnimationProvider` 接口 (type + `create(target: HTMLElement, source)`)
  - `app/src/animation/registry.ts` — `animationRegistry.register(type, provider)` / `.get(type)`
  - `app/src/animation/providers/{apng,lottie}.ts` — 内置 provider (APNG 走 `<img>` 浏览器原生循环, Lottie 走 `<canvas>` + rAF)
  - `app/src/hooks/useAnimation.ts` — 通用 hook (`containerRef: HTMLDivElement`, scene 切时 `target.replaceChildren()`)
  - `app/src/main.tsx` — 启动时 `animationRegistry.register(apngProvider.type, apngProvider)`
- **加新动画类型 4 步** (例: lottie):
  1. 在 `app/src/animation/providers/lottie.ts` 实现 `LottieAnimation implements Animation` + `lottieProvider: AnimationProvider`
  2. 在 `app/src/main.tsx` 加 `animationRegistry.register("lottie", lottieProvider)`
  3. 在 `scenes.json` 加 entry: `{"id": "x", "animation": {"type": "lottie", "source": "..."}, "bubbleLines": [...]}`
  4. 跑 `bash scripts/build-scene-registry.sh`

### 加新场景 4 步 (V3.0 现行)

1. 写 H3 prompt (按 `prompts/00-format.md` 4 段格式), 走 `~/.minimax/agents/mavis/skills/h3-dual-image-video-gen/` 生成 6s mp4 (768×768, first=last=`art/octopus-frames/standard-char-1x1.png`)
2. 跑 `scripts/extract-v10-final.py` 转 99 帧 APNG → 放 `app/public/assets/octopus/v2/<id>.png`
3. 改 `scenes.json` 加 entry (`id`, `source`, `bubbleLines`)
4. `bash scripts/build-scene-registry.sh` + `check-scenes-sync.sh` (CI 自动验证)

详见 `docs/v10-pipeline.md` §7 复用清单 + `docs/h3-capabilities.md` §10 调用实例. 完整流程总入口 `docs/pipeline.md`.

### APNG 抠图 (v10-final)

- **default**: `scripts/extract-v10-final.py` (BiRefNet 1024 fp16 alpha hint → CorridorKey GreenFormer 2048 tiled fp16 linear alpha + straight FG → v10.3 strict gate → forehead_white_mask H3 源 ROI 缝补 → borrow+recolor+inpaint 道具治本 → ROI demote 放大镜/桌子). 2026-09-10 定稿.
- **v10-final 必跑 post-fix flicker 修复** (2026-09-16 加): `scripts/extract-v10-final-postfix-flicker.py` 5-frame window (±2) 修 1-frame alpha 抖动. v10-final 在含大量飞舞道具的场景 (17-celebrate 彩带 / 22-yay-friday 酒杯 / 23-dancing 音符 / 32-laugh 哈哈字 / 36-cheer 彩旗) 上 alpha mask 偶发掉到 <150. disposal=2 下视觉闪. 修复算法: 当前帧 alpha<150 + RGB sum>300 (身体色非绿幕) + 近邻 4 帧 max alpha≥200 → 当前帧 alpha=255. 5 场景共 53069 像素修复, 99.5%+ flicker 消除 (残留 <0.05% 视觉无感). **任何走 v10-final 输出的 APNG 上桌前必跑 flicker post-fix** (5-frame window 算法 idempotent, 多次跑无副作用).
- **CPU-only fallback**: `scripts/extract-v4-chromakey-cpu-fallback.py` (PIL 相对绿度公式 + cv2.inpaint + 12 道 position-based mask, 极限 ~95% 绿去除率).
- **v4 fallback 必须配 post-fix**: `scripts/extract-v4-postfix-eyes.py` (修复 v4 chroma key 把脸部黑色眼睛瞳孔/眼线/眼白误 transparent 的共性错杀). 四层条件在 ROI y=40-60%, x=20-80% 内执行: (v1) alpha=0 + max(R,G,B)<60 → 填纯黑瞳孔; (v2) alpha=0 + 60≤max<100 + 8 邻居中 ≥6 个 alpha>128 → 填深绿眼线/眼眶轮廓; (v3) 连通小簇 ≤30 px + 簇均 RGB<130 + bbox 周围 2 px 环不透明比例 ≥50% → 清理眼白绿斑; (v4) 连通簇 ≤100 px + bbox 周围 4 px 环不透明比例 ≥70% → alpha=255 + **cv2.inpaint(radius=3) 修复 RGB** (填充身体 silhouette 边缘被 chroma key 误 transparent 的肤色块, ≤100 px 是被身体包围的小块, 区别于大面积身体 silhouette 接触背景). 任何走 v4 fallback 输出的 APNG 上桌前必跑一次. v10-final GPU 路径无此问题 (BiRefNet/CorridorKey 不会把眼睛 RGB 当绿幕反射).
- **演进史 + 决策树**: `docs/pipeline.md` §3 + `docs/v10-pipeline.md`.
- **关键教训** (已写 `docs/pipeline.md` §3 末尾): 颜色阈值治绿幕是工业残留思路, 神经网络 unmixing 模型 (CorridorKey) 一次到位. 25 步 v4.x color-mask 演进是为了精确测量"颜色阈值路线的极限" (≈95%), 剩 5% 必须换 unmixing 模型. `HF_ENDPOINT=hf-mirror.com` 是 CN 区域机器 HF 访问唯一通道 (huggingface.co DNS 被劫持).
- **H3 `last_frame_image` 双图模式是首末一致循环视频唯一解** — Hailuo-2.3 物理做不到 (0s vs 5.5s 40-45% 相似, 道具不消失). 不要尝试单图模式.
- **H3 绿幕反射进眼镜片** (V2.1 待修): 章鱼眼镜下半部出现绿色横带, 治本改 prompt 加 "no green tint reflection in eyes". 13/14 动作无此问题, 当前 01-detective-study 接受.

### 视频编码 (WebM with alpha, V2 备用路线)

- 走 WebM with alpha 必须 `brew install ffmpeg-full` (keg-only, 不在 PATH). Homebrew standard ffmpeg 的 `ffmpeg -codecs` **不**显示 `vp9_alpha` 标志 (误导性失败) — ffmpeg-full 的 `ffmpeg -h encoder=libvpx-vp9` 列出 `yuva420p/yuva422p/yuva444p/gbrap` 等 7 种 alpha 像素格式才是真相.
- 验证 alpha 真的进了 webm 必须用 `ffprobe -show_streams` 看 `TAG:alpha_mode=1`, 默认 `ffprobe` 不展示这个 tag.
- **HEVC videotoolbox alpha 完全不可行** (Apple `VTCompressionSession` 架构限制), 永远别走这条.

### 发布产物

- 跑 `scripts/release-plugin.sh` 后 **`git add bin/octopus-pet.${KERNEL}.bin` (macos / linux / windows) 随 commit 提交** (repo 本身即插件, clone 零构建可加载).
- 产物必须走 `cargo tauri build --no-bundle` — 裸 `cargo build` 增量会跳过 asset 嵌入 (binary < 5MB = 缺 assets).

### 仓库工程纪律

- **`AGENTS.md` + `CHANGELOG.md` + `scenes.json` 都是 source-of-truth**: 改约定同步 `AGENTS.md`; 改用户可见行为同步 `CHANGELOG.md`; 改场景同步 `scenes.json` + 跑 `build-scene-registry.sh`. 三个一起 commit, 不要分批.
- **CHANGELOG "Out of scope" = 欠条**: 写出来就同 commit 在 `TODO.md` 或 `AGENTS.md` 设 reminder, 下一版 release 第一步 grep 它.
- **不引用废弃内容**: forward-looking 文档不写已删脚本/旧 API shape/旧默认值. 历史归 `CHANGELOG.md` + `docs/_archive/`.
- **`commit` 后立即 `push`**: `git commit` 后同一次操作 `git push origin main`, 不要等 user 提醒. push 失败立刻报, 不重试不 force.
- **forward-looking 文档同步更新**: 改 `bin/` 路径约定 / 删脚本 / 改场景格式时, 把 `AGENTS.md` + `CHANGELOG.md` + `scenes.json` 一并同步. 上次 `bin/` 产物按平台命名 (commit 15fba6c + 0ee7bb0 + 922b642 + 2660692) 就是 4 个 source-of-truth 同步的范例.
- **接手新 release 周期**: 第一件事 `cat HANDOFF.md` 看 P0 任务, 然后 `grep -i "out of scope" CHANGELOG.md` 看欠条.

### UI 与代码约束

- **UI 文本不用 emoji 字符**: ⚠ 💡 📡 等一律换 iconfont / SVG icon.
- **测试目录用 `tests/`**: vitest `**/*.{test,spec}.*` 默认认 `__tests__/` 也行, 但本项目统一 `app/src/state/octopus-fsm.test.ts` 这种贴近源文件风格.
- **Tauri icon 强制 RGBA**: Tauri 2 `generate_context!` 编译时读 icon, 必须 RGBA. PIL 走一遍 `.convert('RGBA')`.

## 代码风格

- **TypeScript strict mode** (`app/tsconfig.json`), 紧贴源文件放测试 (`.test.ts`).
- **Rust**: cargo fmt + clippy 默认. 没有项目级 `rustfmt.toml`, 不引入自定义.
- **Scene registry** 单一源 (`scenes.json`), 改完跑 `scripts/build-scene-registry.sh` 同步, 业务代码不直接 import generated.
- **Animation provider** pluggable via `app/src/animation/registry.ts`, 业务代码不感知 APNG/Lottie/WebM 区别.
- **路径风格**: 跨平台 (`/`), 不写 Windows 风格反斜杠.

## 测试

| 层 | 命令 | 框架 |
|---|---|---|
| Frontend unit | `cd app && npm test` | Vitest |
| Backend unit | `cd src-tauri && cargo test` | rustc test |
| Spec schema | `bash scripts/lint-octopus-plugin.sh` | bash (16/16) |
| Scene sync | `bash scripts/check-scenes-sync.sh` | bash |
| Asset audit | `bash scripts/audit-octopus-assets.sh` | bash |
| Linux GUI smoke | `bash scripts/smoke-test-linux-gui.sh` | bash (NUC Ubuntu 24.04) |

- 加新场景 / 新状态转移 / 新 MCP tool handler 必须配对应测试, 看同目录现有 `.test.ts` / `#[test]`.
- Push 前必跑 lint + scene sync + npm test + cargo test. CI 会重跑, 不跑就是埋雷.

## 脚本

```bash
# 验证 (CI 跑全套)
bash scripts/lint-octopus-plugin.sh            # 16/16 spec schema 校验
bash scripts/audit-octopus-assets.sh           # 8 场景素材盘点
bash scripts/check-scenes-sync.sh              # 8 场景三源一致 (types.ts / manifest / mcp_stdio.rs)

# Scene registry 生成
bash scripts/build-scene-registry.sh           # scenes.json → TS + Rust

# APNG 抠图
bash scripts/extract-v10-final.py              # default (GPU: BiRefNet + CorridorKey)
bash scripts/extract-v4-chromakey-cpu-fallback.py  # CPU-only

# Linux GUI 烟雾 (NUC)
bash scripts/smoke-test-linux-gui.sh

# Vite dev/build 统一 wrapper (Tauri 2 CWD 兼容)
bash scripts/run-vite.sh dev|build             # 不要写 --prefix app / cd app &&

# 发布 (产出 bin/octopus-pet.${KERNEL}.bin 提交物)
bash scripts/release-plugin.sh                 # cargo tauri build --no-bundle + 冒烟
# 注意: 发布后 git add bin/octopus-pet.${KERNEL}.bin (macos/linux/windows) 随 commit 提交
```

## PR & 提交约定

- Branch from `main`; 不直接 push `main`.
- **Commit message**: conventional commits 中文 (`feat:` / `fix:` / `docs:` / `chore:` / `refactor:`), 标题 ≤72 字, 描述 body 解释 why.
- **`commit` + `push` 一次操作**: `git commit` 后紧跟 `git push origin main`, 不要等提醒.
- `AGENTS.md` / `CHANGELOG.md` / `scenes.json` 是 source-of-truth, 改约定同步三个并一起 commit.
- 每个 release 周期第一件事: `cat HANDOFF.md` (看 P0 任务) + `grep -i "out of scope" CHANGELOG.md` (看欠条).

## 安全

- **不要 commit secrets**: `.env*` 在 `.gitignore`. 配置走 `~/.minimax/` 或 env vars.
- **Release artifact `bin/octopus-pet.${KERNEL}.bin`**: 内嵌 8 APNG (RGBA) + MCP server + Tauri binary, 无敏感数据, 可放心提交.
- **Tauri 2 icon 必须 RGBA**: `generate_context!` 编译时读, RGB 模式会让 build fail. 改 icon 后跑 `python3 -c "from PIL import Image; Image.open('icon.png').convert('RGBA').save('icon.png')"` 确认.
- **依赖升级前看 CHANGELOG**: Tauri 2 minor 升级常有 breaking (CWD 假设 / config schema / icon 要求), major 升级 (1.x→2.x) 必重跑 `bash scripts/lint-octopus-plugin.sh` + `bash scripts/release-plugin.sh` 冒烟.

## 文档索引

按用途查文档, 不要在 AGENTS.md 重复长篇内容:

| 主题 | 文档 |
|---|---|
| APNG 抠图演进史 + 决策树 | `docs/pipeline.md` |
| v10-final 6 阶段实现细节 | `docs/v10-pipeline.md` |
| V1.5+ 跨平台渲染生产参考 | `docs/v15plus-render-pipeline.md` |
| H3 必须提供什么 (双图模式/规格/约束) | `docs/h3-capabilities.md` |
| V2 prompt 16 项约束 + 8 陷阱 | `docs/action-prompt-methodology.md` |
| 8 场景素材审计 (W1 D1) | `docs/octopus-assets-audit.md` |
| Linux build / NUC 实测 | `docs/linux-build.md` |
| 2026-09-11 macOS 跨平台 B/D 教训 | `docs/_archive/2026-09-11-handoff/handoff-2026-09-11-macos-b-d-rootcause.md` |
| 2026-09-11 V1.5+ `<img>` 决策链 | `docs/_archive/2026-09-11-handoff/handoff-2026-09-11-v15plus-img-render.md` |
| H3 mp4 资产清单 (raw/passed/failed) | `docs/h3-source/README.md` |

历史 handoff / 旧 B/D 调试记录归 `docs/_archive/`. 历史决策 / deprecated 方案归 `CHANGELOG.md`.
