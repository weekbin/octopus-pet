# 🐙 Octopus Pet

> A coral-pink octopus desktop pet for **mcode** (MiniMax Code / Mavis) — built as an
> [agent-plugins.org v1.0.0](https://agent-plugins.org/specification) plugin.

mcode 启动时自动 spawn 章鱼 .app，14 个"打工人"场景简单轮转，单击弹气泡，双击下一场景，拖动桌面位置，6 个 MCP tools 让 mcode Agent 远程控制。跨 8 客户端 portable (mcode / Cursor / Claude Code / VS Code / Codex / Kiro / Antigravity / Gemini CLI)。

---

## 状态 (W1 D2 进行中)

| 阶段 | 状态 | 备注 |
|------|------|------|
| **W1 D1** | ✅ 完成 | 14 spritesheet + 6 scripts + plugin 三件套 + GitHub repo |
| **W1 D2** | 🔄 进行中 | Tauri 2 scaffold + 透明 200×200 窗口 + React mount |
| **W1 D3** | ⏳ | XState 14 状态 FSM + 8s 轮转 + 14 spritesheet 渲染 |
| **W1 D4** | ⏳ | 单击/双击/拖动交互 + 气泡 + 右键菜单 |
| **W1 D5** | ⏳ | W1 demo 验收: 章鱼 .app 启动 → 14 场景轮转 |
| **W2** | ⏳ | Rust MCP server 完整化 (6 tools 走 MCP 2024-11-05) |
| **W3** | ⏳ | mcode 集成验证 (启动 → spawn → 通信) |
| **W3.5** | ⏳ | 跨客户端 portable 验证 (Cursor / Claude Code) |
| **W4** | ⏳ | 交互打磨 + 性能 (启动 < 3s, 体积 < 30MB) |
| **W5** | ⏳ | `tauri build` + GitHub release v0.1.0 |

---

## 架构 (per plan §1.8 + §1.9)

```
┌──────────────────────────────────────────────────────────────────────┐
│  mcode 桌面端 (v3.0.65+)                                              │
│  ┌────────────────────────────────────────────────────────────┐     │
│  │ Plugin loader (走 spec)                                     │     │
│  │   → 发现 ~/Documents/cute/plugin.json                       │     │
│  │   → 读 mcp.json, type=stdio, command=./bin/octopus-pet      │     │
│  │   → spawn 进程, args=[--mcp-stdio]                          │     │
│  └────────────────────────────────────────────────────────────┘     │
│                          │ stdio (JSON-RPC 2.0)                      │
│                          ▼                                           │
│  ┌────────────────────────────────────────────────────────────┐     │
│  │  Octopus Pet.app  (Tauri 2 + Rust)                          │     │
│  │  ┌─────────────┐  ┌─────────────┐  ┌──────────────────┐     │     │
│  │  │  MCP stdio  │  │  Tauri      │  │  WebView         │     │     │
│  │  │  server     │◄─┤  main.rs    │◄─┤  React + XState  │     │     │
│  │  │  (Rust)     │  │  200×200    │  │  14 FSM states   │     │     │
│  │  │  6 tools    │  │  透明窗口   │  │  14 spritesheets │     │     │
│  │  └─────────────┘  └─────────────┘  └──────────────────┘     │     │
│  └────────────────────────────────────────────────────────────┘     │
└──────────────────────────────────────────────────────────────────────┘
```

**栈**: Tauri 2 (Rust + React 19 + Vite 6 + XState 5)  
**窗口**: 200×200, transparent, no decorations, alwaysOnTop, skipTaskbar  
**场景**: 14 (pretend-busy, stay-late, breakdown, lying-flat, multi-tasking, payday, salary-rejected, treat-milk-tea, friday-5pm, toilet-slacking, touch-fish, waiting-m3pro, soul-leaving, multitask)

---

## 14 场景 (verified 2026-08-18)

| # | 场景 | OctopusScene | 文案示例 | 帧数 |
|---|------|-------------|---------|------|
| 1 | 假装很忙 | `pretend-busy` | "忙死了" "改完这版就休息" | 141 |
| 2 | 再熬一会 | `stay-late` | "再熬一会" "夜宵时间" | 141 |
| 3 | 我裂开了 | `breakdown` | "我裂开了" "求救信号" | 141 |
| 4 | 摆烂躺平 | `lying-flat` | "摆烂中" "充电模式" | 141 |
| 5 | 多任务 | `multi-tasking` | "一心多用" "5 个 tab" | 141 |
| 6 | 发工资 | `payday` | "发工资!" "今天吃好" | 141 |
| 7 | 工资被拒 | `salary-rejected` | "退款中" "系统抽风" | 141 |
| 8 | 奶茶 | `treat-milk-tea` | "奶茶第一" "加珍珠" | 141 |
| 9 | 周五 5 点 | `friday-5pm` | "TGIF" "周末快乐" | 141 |
| 10 | 带薪蹲坑 | `toilet-slacking` | "蹲坑中" "带薪休息" | 141 |
| 11 | 摸鱼 | `touch-fish` | "假装在工作" "甩锅中" | 141 |
| 12 | 等 M3 Pro | `waiting-m3pro` | "等新电脑" "渲染中" | 141 |
| 13 | 灵魂出窍 | `soul-leaving` | "灵魂出窍" "意识漂浮" | 141 |
| 14 | 多任务 v2 | `multitask` | "三屏模式" "CPU 满载" | 141 |

每个 spritesheet = 13632×384 px (71×2 cells × 192px, WebP lossy q80)。14 文件总 9.1MB。

---

## Spec 合规 (per [agent-plugins.org v1.0.0](https://agent-plugins.org/specification))

- ✅ `plugin.json` 在 plugin 根 (spec §5.1)
- ✅ `plugin.json` 含 `$schema` 字段 (spec §5.3)
- ✅ `mcp.json` 在 plugin 根 (spec §7)
- ✅ `mcp.json` 含 `$schema` 字段 (spec §7.2)
- ✅ `mcp.json.mcpServers[].type` = `"stdio"` (spec §7.2.1, closed union)
- ✅ 所有 plugin-relative path 以 `./` 开头 (spec §4.1)
- ✅ `command` 是 single token, 不带 shell metachars (spec §9.2)
- ✅ `args`/`env` 只用 `${PLUGIN_ROOT}` + `${PLUGIN_DATA}` 占位符 (spec §9.2, closed set)
- ✅ `skills/octopus-pet/SKILL.md` 含 agentskills.io frontmatter (`name` + `description`)
- ✅ 客户端特定扩展走 `com.mavis/` (reverse-domain, spec §8.2)

**16/16 lint checks pass** (`scripts/lint-octopus-plugin.sh`)。

---

## 已知 V1 限制 (留 V2 增量)

- **单实例 only (tauri-plugin-single-instance)**: 多 mcode session 场景下, 首个 session 启动的章鱼 .app 赢了, 后续 session 的 .app 立即被 kill, 后续 session 的 MCP tool call 失败 (没有 stdio 接). 真正的多 session 共享留 V1.1+ (走 Unix domain socket 转发).
- **RGB 无 alpha**: 14/14 场景 PNG 是 720×720 RGB (背景是实色), 不是透明. Tauri 透明窗口里章鱼显示成 RGB 矩形, 不会跟桌面融合. V2 用图像分割 / chroma key 加 alpha.
- **141 帧 (3× 计划值)**: 状态机 8s 轮转会半截切换场景 (单循环 ~11.75s). V1 接受, V2 调帧率.
- **mcode 事件 → 章鱼 切状态 不做**: mcode 暂时没好钩子, V1 简单 timer 轮转. V1.1+ 接 mcode 钩子.
- **macOS only**: V1 不支持 Windows / Linux. V2 增量.
- **音频不做**: 摸头/切状态 音效 V1 不做, V2 增量.
- **鼠标右键菜单 简化**: V1 只有"摸头", 没有"设置/退出/关于". V2 增量.
- **开机自启 不做**: V1 不做, V2 增量.
- **多屏幕 / 鼠标穿透 不做**: V1 不做, V2 增量.

---

## 仓库结构

```
octopus-pet/
├── plugin.json                    # spec §5
├── mcp.json                       # spec §7
├── README.md                      # this file
├── AGENTS.md                      # AI agent 协作约定
├── LICENSE                        # MIT 2026 weekbin
├── .gitignore
├── skills/
│   └── octopus-pet/
│       └── SKILL.md               # agentskills.io
├── scripts/
│   ├── audit-octopus-assets.sh    # 14 场景盘点
│   ├── extract-and-link-octopus-frames.sh  # ffmpeg 抽 01-04 + symlink archive
│   ├── spritesheet-builder.sh     # 14 .webp 拼图
│   ├── generate-spritesheet-manifest.sh  # React 用的 JSON manifest
│   └── lint-octopus-plugin.sh     # spec 合规校验
├── docs/
│   └── octopus-assets-audit.md    # 14 场景盘点文档
├── app/                           # Tauri webview (React + Vite)
│   ├── package.json
│   ├── vite.config.ts
│   ├── tsconfig.json
│   ├── index.html
│   ├── src/
│   │   ├── main.tsx
│   │   ├── App.tsx
│   │   ├── components/
│   │   │   ├── OctopusPet.tsx     # 200×200 透明窗口 root
│   │   │   └── Bubble.tsx
│   │   ├── state/
│   │   │   ├── types.ts           # 14 OctopusScene + OctopusState + events
│   │   │   ├── scenes.ts          # spritesheet manifest types
│   │   │   └── octopus-fsm.ts     # XState v5 machine
│   │   ├── hooks/
│   │   │   ├── useTauriWindowDrag.ts
│   │   │   └── useMcpBridge.ts
│   │   ├── data/
│   │   │   └── spritesheet-manifest.json
│   │   ├── styles/
│   │   │   └── global.css
│   │   └── vite-env.d.ts
│   └── public/
│       └── assets/octopus/        # 14 spritesheet-*.webp (9.1MB total)
├── src-tauri/                     # Tauri Rust backend
│   ├── Cargo.toml
│   ├── build.rs
│   ├── tauri.conf.json
│   ├── capabilities/
│   │   └── default.json
│   ├── icons/                     # 32x32, 128x128, icon.png 占位
│   └── src/
│       ├── main.rs
│       ├── lib.rs                 # Tauri Builder + MCP stdio spawn
│       ├── mcp_stdio.rs           # MCP 2024-11-05 server (V1 stub, 6 tools)
│       └── state_bridge.rs        # tauri::command (get_state/force_scene/ask/pet)
└── bin/
    └── octopus-pet                # plugin entrypoint (per spec §9.2)
```

---

## 开发

### 前置依赖

- Node.js 22+ + npm 10+
- Rust 1.77+ (via rustup 或 `brew install rust`)
- Tauri 2 CLI: `cargo install tauri-cli --version "^2"` (或 `npm install -g @tauri-apps/cli`)

### 本地开发 (Tauri dev mode)

```bash
# 一次性: 装依赖
cd app && npm install
cd ../src-tauri && cargo build
cd ..

# 启动 (Vite dev server + Tauri window)
npm run tauri:dev
# 或: cd src-tauri && cargo tauri dev
```

### 构建发布版

```bash
# macOS .app
npm run tauri:build
# 产物: src-tauri/target/release/bundle/macos/Octopus Pet.app
#       src-tauri/target/release/octopus-pet (裸二进制)
```

### 在 mcode 里加载 (开发模式)

1. `tauri build` 一次, 产物在 `src-tauri/target/release/bundle/macos/`
2. mcode 设置 → Plugins → "Add local plugin" → 选 `~/Documents/cute/`
3. mcode 重启 → 章鱼 .app 自动 spawn
4. 在 mcode Agent 里: `mcp__octopus-pet__pet_list_states` 应返回 14 场景

---

## 重新生成素材 (W1 D1 已完成, 通常不需要重跑)

```bash
# 1. 抽 01-04 帧 + symlink 5 archive 场景 (ffmpeg)
OCTOPUS_SOURCE_ROOT=~/Works/octopus-worker-meme scripts/extract-and-link-octopus-frames.sh

# 2. 拼 14 张 spritesheet (ImageMagick)
scripts/spritesheet-builder.sh --all

# 3. 生成 React 用的 manifest
scripts/generate-spritesheet-manifest.sh
```

---

## 引用 (业界共识)

- [Tauri 2](https://v2.tauri.app/) — Rust + WebView 透明窗口
- [XState v5](https://stately.ai/docs/xstate) — 14 状态 FSM
- [modelcontextprotocol.io spec 2024-11-05](https://modelcontextprotocol.io/specification/2024-11-05) — MCP 协议
- [agent-plugins.org v1.0.0](https://agent-plugins.org/specification) — Plugin 规范
- [agentskills.io](https://agentskills.io/specification) — Skill frontmatter
- [octopus-meme](https://github.com/weekbin/octopus-meme) — 14 场景原素材
- 参考项目: [aemeath-claude-pet](https://github.com/77wliNd/aemeath_withclaude) / [Hermes 桌宠](https://github.com/Ash-Blanc/hermey-the-pet) / [Codex 拓麻歌子](https://github.com/openai/codex) / [clawd-on-desk](https://github.com) — Tauri 桌宠先例

---

## License

MIT © 2026 weekbin — see [LICENSE](./LICENSE).
