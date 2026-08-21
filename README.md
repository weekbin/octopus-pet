# 🐙 Octopus Pet

> A coral-pink octopus desktop pet for **mcode** (MiniMax Code / Mavis) — built as an
> [agent-plugins.org v1.0.0](https://agent-plugins.org/specification) plugin.

mcode 启动时自动 spawn 章鱼 .app, **2 个 V2 视频成品** (detective-study 戴帽研究 + worker-construction 工人施工) 8s 自动轮转, 单击弹气泡、右键摸头 (+亲密度)、拖动换位置, 6 个 MCP tools 让 mcode Agent 远程控制. 跨 8 客户端 portable (mcode / Cursor / Claude Code / VS Code / Codex / Kiro / Antigravity / Gemini CLI). repo 本身即插件: `bin/octopus-pet.bin` 提交进 git, clone 零构建即可加载.

**V1.5 (2026-08-21)**: 默认只跑 2 个 V2 视频成品, 不用 14 V1 spritesheet (打工人 meme 表情包). 14 V1 移到 `app/public/assets/octopus/_archive-v1-spritesheets/` 不再用. 加新场景: 跑 H3/gen_videos → `scripts/extract-chromakey-apng.py` → `app/public/assets/octopus/v2/<scene>.png` + 同步 `types.ts` + `mcp_stdio.rs`.

---

## 状态 (V1.5, 2026-08-21)

| 阶段 | 状态 | 备注 |
|------|------|------|
| **W1 D1** | ✅ 完成 | 14 spritesheet + 6 scripts + plugin 三件套 + GitHub repo |
| **W1 D2** | ✅ 完成 | Tauri 2 scaffold + 透明 192×192 窗口 + React mount + MCP stdio stub |
| **W1 D3** | ✅ 完成 | XState FSM + 8s 轮转 + spritesheet 渲染 + 单击/右键摸头/拖动 |
| **W1 D4** | ✅ 完成 | 单实例插件 + 状态权威收敛 (XState 唯一权威, sync_state 镜像回写) + HTTP 断链修复 |
| **W2** | ✅ 完成 | Rust MCP server 完整化 (6 tools, 8 roundtrip tests, headless 直写) |
| **V0.5/V2** | ✅ 完成 | H3 + gen_videos 跑通 2 视频, PIL v3 chroma key 沉淀, 4 步管线 |
| **V1.5** | ✅ 完成 (2026-08-21) | 默认切 2 个 V2 视频成品, 14 V1 spritesheet 移到 archive |
| **W1.1+** | ⏳ | mcode 任务事件 → 场景 映射 (mcode 钩子) / 多 session 共享 (UDS 转发) |
| **W3** | ⏳ | mcode 集成验证 (spawn → 通信) + 跨客户端 portable 验证 |
| **W4/W5** | ⏳ | 交互打磨 + 性能 (启动 < 3s, 体积 < 30MB) + GitHub release |

---

## 架构 (状态权威模型, 2026-08-18 重构)

```
┌──────────────────────────────────────────────────────────────────────┐
│  mcode 桌面端 (v3.0.65+)                                              │
│  ┌────────────────────────────────────────────────────────────┐     │
│  │ Plugin loader (spec §6.1 固定位置发现)                       │     │
│  │   plugin.json → mcp.json → command=./bin/octopus-pet       │     │
│  │   spawn 进程, args=[--mcp-stdio]                            │     │
│  └────────────────────────────────────────────────────────────┘     │
│                          │ stdio (JSON-RPC 2.0)                      │
│                          ▼                                           │
│  ┌────────────────── Octopus Pet (Tauri 2 + Rust) ─────────────────┐ │
│  │  Rust 进程                                                       │ │
│  │  MCP stdio ──┐                                                  │ │
│  │  HTTP :9527 ──┼→ actions.rs (唯一逻辑点) ─→ emit 事件            │ │
│  │  (dev-only)  │    apply_show / apply_ask / apply_pet            │ │
│  │               │                                                 │ │
│  │  SharedState ──← sync_state (invoke) ←─────────────────┐        │ │
│  │  (只读镜像)                                              │        │ │
│  │                                                         │        │ │
│  │  WebView (React 19)                                     │        │ │
│  │  XState FSM (唯一状态权威) ─────────────────────────────┘        │ │
│  │    14 场景 8s 轮转 · 气泡 · 亲密度 · 位置                         │ │
│  │    单击/右键摸头/拖动 + 14 spritesheet 渲染                       │ │
│  └──────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────┘
```

**栈**: Tauri 2 (Rust + React 19 + Vite 6 + XState 5)  
**窗口**: 116×116 (= APNG 192×192 60% 缩放显示), transparent, no decorations, alwaysOnTop, skipTaskbar  
**状态权威**: XState (前端 FSM) → `sync_state` 回写 Rust `SharedState` 镜像;协议入口 (MCP/HTTP) 只调 `actions.rs` 发事件  
**场景 (V1.5)**: 2 (detective-study, worker-construction)

---

## V1.5 默认 2 场景 (verified 2026-08-21)

| # | 场景 | OctopusScene | 文案示例 | 帧数 | 素材 |
|---|------|-------------|---------|------|------|
| 1 | 戴帽研究 (H3 6s) | `detective-study` | "在研究" "放大看看" | 50 帧 × 132ms = 6.6s | H3 + `last_frame_image` 双图, 96.58% 首末一致 |
| 2 | 工人施工 (gen_videos 6s) | `worker-construction` | "施工中" "砸一下" | 50 帧 × 132ms = 6.6s | gen_videos Hailuo-2.3, 99.85% 相似 |

每个 APNG = 192×192 px, RGBA, 2.3MB. 走 `scripts/extract-chromakey-apng.py` v3 chroma key (中性色 alpha=255, 避免眼睛高光抠成半透明). 浏览器原生循环, 不需要 frame 计数器.

**14 V1 spritesheet (V1 废弃, 不再用)**: 移到 `app/public/assets/octopus/_archive-v1-spritesheets/`. 是 octopus-meme skill 出的"打工人"表情包, 不是桌宠, 治本 V1.5 改用 V2 视频成品.

---

## Spec 合规 (per [agent-plugins.org v1.0.0](https://agent-plugins.org/specification))

- ✅ `plugin.json` 在 plugin 根 (spec §5.1)
- ✅ `plugin.json` 含 `$schema` 字段 (spec §5.3)
- ✅ `mcp.json` 在 plugin 根 (spec §7)
- ✅ `mcp.json` 含 `$schema` 字段 (spec §7.2)
- ✅ `mcp.json.mcpServers[].type` = `"stdio"` (spec §7.2.1, closed union)
- ✅ 所有 plugin-relative path 以 `./` 开头 (spec §4.1)
- ✅ `command` 是 single token, 不带 shell metachars (spec §9.2)
- ✅ `args`/`env` 未使用 spec 以外的占位符 (spec §9.2, closed set: 仅 `${PLUGIN_ROOT}` + `${PLUGIN_DATA}`)
- ✅ `skills/octopus-pet/SKILL.md` 含 agentskills.io frontmatter (`name` + `description`)
- ✅ 无客户端扩展 (`extensions` / reverse-domain 目录), 保持跨客户端 portable (spec §8 是 OPTIONAL)

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

## 仓库结构 (四分类)

> **组件面** = spec 契约 (插件被发现/加载) · **开发面** = 源码 (进 git) · **产物面** = 提交的运行物 (repo 即插件) · **中间产物** = 可重建 (gitignored)

| 分类 | 目录/文件 | 说明 |
|------|----------|------|
| 组件面 | `plugin.json` / `mcp.json` / `skills/` / `bin/octopus-pet` | spec 固定位置 (§4.2 §6.1 §7.2) |
| 产物面 | `bin/octopus-pet.bin` | release 二进制 (~13MB, 内嵌 spritesheet), **提交进 git**, clone 即插件可加载 |
| 开发面 | `app/` | Tauri webview 前端 (React 19 + XState 5) |
| 开发面 | `src-tauri/` | Rust 后端 (actions.rs = 状态逻辑单点; state_bridge = 镜像回写) |
| 开发面 | `scripts/` / `docs/` | 构建/校验/发布脚本 + 文档 |
| 中间产物 | `app/dist/` `src-tauri/target/` `src-tauri/gen/` `dist/` | gitignored, 可重建 |

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
├── bin/
│   ├── octopus-pet                # entrypoint 桥 (spec §9.2): 本地构建优先, .bin 兜底
│   └── octopus-pet.bin            # release 二进制 (提交, clone 即用)
├── scripts/
│   ├── audit-octopus-assets.sh    # 14 场景盘点
│   ├── check-scenes-sync.sh       # 14 场景三源一致 (types.ts/manifest/mcp_stdio.rs)
│   ├── extract-and-link-octopus-frames.sh  # ffmpeg 抽 01-04 + symlink archive
│   ├── generate-spritesheet-manifest.sh    # 唯一 manifest → app/src/data/
│   ├── lint-octopus-plugin.sh     # spec 合规校验 (16/16)
│   ├── release-plugin.sh          # 发布: 二进制 + 插件目录 + 冒烟
│   └── spritesheet-builder.sh     # 14 .webp 拼图
├── docs/
│   └── octopus-assets-audit.md    # 14 场景盘点文档
├── app/                           # Tauri webview (React + Vite)
│   ├── package.json / vite.config.ts / index.html
│   ├── src/
│   │   ├── main.tsx / App.tsx
│   │   ├── components/            # OctopusPet.tsx (192×192 窗口 root, 素材铺满) / Bubble.tsx
│   │   ├── state/                 # types.ts (14 场景) / octopus-fsm.ts (XState v5) / scenes.ts
│   │   ├── hooks/                 # useMcpBridge / useTauriWindowDrag / useStateSync (镜像回写)
│   │   ├── data/
│   │   │   └── spritesheet-manifest.json   # 唯一 manifest (import 打包)
│   │   └── styles/global.css
│   └── public/
│       └── assets/octopus/        # 14 spritesheet-*.webp (9.1MB total)
├── src-tauri/                     # Tauri Rust backend
│   ├── Cargo.toml / Cargo.lock / build.rs / tauri.conf.json
│   ├── capabilities/default.json
│   ├── icons/                     # 32x32, 128x128, icon.png (RGBA)
│   ├── tests/mcp_roundtrip.rs     # 8 MCP stdio roundtrip tests
│   └── src/
│       ├── main.rs                # --mcp-stdio headless / GUI 双模式入口
│       ├── lib.rs                 # Builder + single-instance + HTTP fallback
│       ├── actions.rs             # 状态逻辑单点 (apply_show/ask/pet + emit)
│       ├── mcp_stdio.rs           # MCP 2024-11-05 server (6 tools, 委托 actions)
│       ├── state_bridge.rs        # get_state / sync_state (镜像)
│       └── http_fallback.rs       # HTTP :9527 (dev-only, 委托 actions)
└── dist/                          # 发布组装目录 (gitignored)
    └── octopus-pet-plugin/        # release-plugin.sh 产出, 可独立加载
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

# 启动 (Vite dev server 自动起 + Tauri 窗口)
cd src-tauri && cargo tauri dev
# 或从 app/ 目录: npm run tauri:dev (脚本内部 cd 到 src-tauri)
```

> 注意: `tauri.conf.json` 在 `src-tauri/`, tauri CLI 必须从 `src-tauri/` 跑
> (或经 app/package.json 的 `tauri:dev` 脚本, 它内部 `cd ../src-tauri`)。

### 构建发布版

```bash
# macOS .app (给普通用户)
cd src-tauri && cargo tauri build
# 产物: src-tauri/target/release/bundle/macos/Octopus Pet.app
#       src-tauri/target/release/octopus-pet (裸二进制)

# 插件发布物 (给 mcode 等 agent 客户端) — 推荐
bash scripts/release-plugin.sh
# 产物:
#   bin/octopus-pet.bin       ← release 二进制 (~13MB, 提交进 git)
#   dist/octopus-pet-plugin/  ← 可独立加载的插件目录 (可选分发)
# 注意: 发布后 git add bin/octopus-pet.bin 随 commit 提交 (repo 即插件)
```

### 作为插件加载 (两种方式)

**方式 A: 直接加载 repo(开发/发布通用)**
1. mcode 设置 → Plugins → "Add local plugin" → 选 `~/Documents/cute/`
2. mcode 重启 → 章鱼 .app 自动 spawn
3. 在 mcode Agent 里: `mcp__octopus-pet__pet_list_states` 应返回 14 场景
4. 二进制解析: 本地 `cargo build` 产物优先, 无本地构建时用提交的 `bin/octopus-pet.bin`(clone 零构建可加载)

**方式 B: 加载发布包(干净分发)**
1. `bash scripts/release-plugin.sh` → 指向 `dist/octopus-pet-plugin/`
2. 该目录是 spec 合规插件根(plugin.json + mcp.json + skills/ + bin/ 二进制), 可拷贝分发

> `bin/octopus-pet.bin` 是 author 机器编译的 **macOS arm64** 产物。其他架构 /
> 想用最新代码: 本地 `cargo build --release` 后覆盖, 或直接依赖本地构建优先逻辑。

---

## 重新生成素材 (W1 D1 已完成, 通常不需要重跑)

```bash
# 1. 抽 01-04 帧 + symlink archive 场景 (ffmpeg)
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
