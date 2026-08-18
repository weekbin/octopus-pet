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
| 窗口 | 200×200 · transparent · no-decoration · alwaysOnTop · skipTaskbar |
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

## 协作规则 (根因型, 别打地鼠)

- **plugin 三件套** (`plugin.json` + `mcp.json` + `skills/.../SKILL.md`) 是 spec 必填.
  改任一文件后必跑 `bash scripts/lint-octopus-plugin.sh` 校验 (16/16).
- **状态逻辑改 `actions.rs` 单点**: 场景校验 / ≤12 字截断 / bubble 3s / affection+5
  只在 `src-tauri/src/actions.rs`。MCP stdio / HTTP fallback 都委托它, 不要在新入口
  复制逻辑。状态权威是前端 XState, Rust `SharedState` 只是镜像 (sync_state 回写).
- **改场景清单 (14 场景)**: 三处同步 — `app/src/state/types.ts` (SCENE_ORDER) +
  `app/src/data/spritesheet-manifest.json` (scenes[].sceneId) + `src-tauri/src/mcp_stdio.rs`
  (SCENES). 改完跑 `bash scripts/check-scenes-sync.sh` (CI 也会跑).
- **改 spritesheet**: 141 帧是源头真理. 真要改, 从 `~/Works/octopus-worker-meme` 抽,
  跑 `extract-and-link-octopus-frames.sh` + `spritesheet-builder.sh` + `generate-spritesheet-manifest.sh`.
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
