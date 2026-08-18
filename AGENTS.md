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
| Plugin entrypoint | `bin/octopus-pet` (per spec §9.2, single-token command) |
| React 前端 | `app/src/` (components · state · hooks · ipc · data · styles) |
| Rust 后端 | `src-tauri/src/` (lib · main · mcp_stdio · state_bridge · http_fallback) |
| 14 spritesheet | `app/public/assets/octopus/spritesheet-{01..14}-*.webp` |
| Spritesheet manifest | `app/src/data/spritesheet-manifest.json` |
| 14 场景素材审计 | `docs/octopus-assets-audit.md` (W1 D1 产物) |
| 变更历史 | `CHANGELOG.md` (Keep a Changelog 1.1.0) |
| CI | `.github/workflows/ci.yml` (spec lint · asset audit · spritesheet regen · Rust build · Vitest) |

## 协作规则 (根因型, 别打地鼠)

- **plugin 三件套** (`plugin.json` + `mcp.json` + `skills/.../SKILL.md`) 是 spec 必填.
  改任一文件后必跑 `bash scripts/lint-octopus-plugin.sh` 校验 (16/16).
- **改 MCP wrapper 默认值/参数**: 三处一起改 — `__init__` 默认值 + `_xxx_props()` 的
  `inputSchema` 描述 + 调用点 `arguments.get()`. 缺一就 drift.
- **改 FSM**: 14 场景常量在 `app/src/state/types.ts` (`SCENE_ORDER` + `BUBBLE_BY_SCENE`)
  + `octopus-fsm.ts` 两处需同步. 改完跑 `cd app && npm test` (16 tests).
- **改 spritesheet**: 141 帧是源头真理. 真要改, 从 `~/Works/octopus-worker-meme` 抽,
  跑 `extract-and-link-octopus-frames.sh` + `spritesheet-builder.sh`.
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

## 脚本

```bash
# 验证 (CI 跑全套)
bash scripts/lint-octopus-plugin.sh            # 16/16 spec schema 校验
bash scripts/audit-octopus-assets.sh           # 14 场景素材盘点
bash scripts/spritesheet-builder.sh --all      # 141 帧 PNG → 14 张 .webp
bash scripts/generate-spritesheet-manifest.sh  # React 用的 JSON manifest

# 素材重建 (W1 D1 已完成, 平时不重跑)
OCTOPUS_SOURCE_ROOT=~/Works/octopus-worker-meme \
  bash scripts/extract-and-link-octopus-frames.sh

# 测试
cd app && npm test                             # Vitest 16 FSM tests
cd src-tauri && cargo test                     # 5 MCP stdio roundtrip tests

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
