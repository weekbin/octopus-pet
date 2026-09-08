# 🐙 Octopus Pet

> A coral-pink octopus desktop pet for **mcode** (MiniMax Code / Mavis) — built as an
> [agent-plugins.org v1.0.0](https://agent-plugins.org/specification) plugin.

mcode 启动时自动 spawn 章鱼 .app, **2 个 V2 视频成品** (detective-study 戴帽研究 + worker-construction 工人施工) 事件驱动轮转 (apng-js `'end'` 事件 → FSM `rotateScene`, 0 累积延迟), 单击弹气泡、右键摸头 (+亲密度)、拖动换位置, 6 个 MCP tools 让 mcode Agent 远程控制. 跨 8 客户端 portable (mcode / Cursor / Claude Code / VS Code / Codex / Kiro / Antigravity / Gemini CLI). repo 本身即插件: `bin/octopus-pet.bin` 提交进 git, clone 零构建即可加载.

**V2.1 (2026-08-27) + M5b (2026-08-27)**: 事件驱动 scene 调度治本 4 个 V1.5 timer bug (中段剪切 / wall-clock 漂移 / 高频 IPC 压力 / 镜像乱序). M5b 加 lottie-web 作为第二个 animation provider, 业务代码零修改可换动画格式. 加新场景: 跑 H3/gen_videos → `scripts/extract-chromakey-apng.py` → `app/public/assets/octopus/v2/<scene>.png` + 改 `scenes.json` + 跑 `build-scene-registry.sh`.

---

## 状态 (V2.1, 2026-08-27)

| 阶段 | 状态 | 备注 |
|------|------|------|
| **V2.1** | ✅ 完成 (2026-08-27) | 事件驱动 scene 调度 (apng-js `'end'` → `SCENE_LOOPED` → FSM) |
| **M1-M4** | ✅ 完成 (2026-08-27) | 架构清理 + scenes.json 单一源 + 自动生成 TS/Rust |
| **M5** | ✅ 完成 (2026-08-27) | animation abstraction layer (Animation / AnimationProvider / registry) |
| **M5b** | ✅ 完成 (2026-08-27) | 第二个 animation provider (Lottie), 换格式业务代码零修改 |
| **V2.1 regression fix** | ✅ 完成 (2026-09-09 f2e0bb7) | APNG num_plays 0 → 1, 删遗留 useMcpBridge.ts |
| **第 3 场景 drink-coffee** | ✅ 完成 (2026-09-09 fef8017) | H3 一次过 99.91% 相似度, 单件道具 3 段范式, 端到端集成 PASS |
| **V1.5 之前的 14 V1 表情包** | ⛔ 已废弃 | 移到 `app/public/assets/octopus/_archive-v1-spritesheets/`, 不用 |
| **P0-1 / P0-2 / P0-3** | ⏳ | CI 校验 num_plays=1 / Tauri 桌宠实际跑 / 加真 Lottie 场景 (见 TODO.md) |
| **V1.1 跨平台** | ⏳ | Windows / Linux 打包验证 (挂 2 周, 待 Windows/Linux 机器) |
| **V3.0 屏幕漫游** | ⏳ (可选) | 章鱼屏幕右下角固定 + 8s ±2px 浮动 |

---

## 架构 (M1-M5b, 2026-08-27 refactor)

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
│  │    2 场景 · 事件驱动 6.6s 切 (apng-js 'end' → SCENE_LOOPED)        │ │
│  │    气泡 · 亲密度 · 位置 · 单击/右键摸头/拖动                      │ │
│  │    渲染: canvas + apng-js (V2.1) / lottie-web (M5b 第二 provider) │ │
│  └──────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────┘
```

**栈**: Tauri 2 (Rust + React 19 + Vite 6 + XState 5) + apng-js 1.1.5 (V2.1) + lottie-web 5.13 (M5b)  
**窗口**: 116×116 (= APNG 192×192 60% 缩放显示), transparent, no decorations, alwaysOnTop, skipTaskbar  
**状态权威**: XState (前端 FSM) → `sync_state` 回写 Rust `SharedState` 镜像;协议入口 (MCP/HTTP) 只调 `actions.rs` 发事件  
**场景 (V2.1)**: 3 (detective-study, worker-construction, drink-coffee) · 事件驱动 6.6s 切, 随机+去重 (最近 1 个不连续重复)
**动画格式**: APNG (内置) / Lottie (M5b provider) — 加新格式走 `animation/providers/<type>.ts` + `main.tsx` register, 业务零修改

---

## V2.1 默认 3 场景 (verified 2026-09-09, num_plays=1)

| # | 场景 | OctopusScene | 文案示例 | 帧数 | 素材 |
|---|------|-------------|---------|------|------|
| 1 | 戴帽研究 (H3 6s) | `detective-study` | "在研究" "放大看看" | 50 帧 × 132ms = 6.6s | H3 + `last_frame_image` 双图, 96.58% 首末一致 |
| 2 | 工人施工 (gen_videos 6s) | `worker-construction` | "施工中" "砸一下" | 50 帧 × 132ms = 6.6s | gen_videos Hailuo-2.3, 99.85% 相似 |
| 3 | 喝咖啡 (H3 6s) | `drink-coffee` | "喝咖啡" "好香啊" | 50 帧 × 132ms = 6.6s | H3 双图, **99.91%** 首末一致 (本批最佳) |

每个 APNG = 192×192 px, RGBA, 2.3MB, **`acTL.num_plays=1` (事件驱动关键)**, 走 `scripts/extract-chromakey-apng.py` v3 chroma key (中性色 alpha=255, 避免眼睛高光抠成半透明). 渲染: `<canvas>` + apng-js, 听 `'end'` 事件 → `SCENE_LOOPED` → FSM `rotateScene`, 严格对齐 APNG 最后一帧, 0 累积延迟.

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

## 已知 V2.1 限制 (留 V3.0+ 增量)

- **单实例 only (tauri-plugin-single-instance)**: 多 mcode session 场景下, 首个 session 启动的章鱼 .app 赢了, 后续 session 的 .app 立即被 kill, 后续 session 的 MCP tool call 失败 (没有 stdio 接). 真正的多 session 共享留 V3.0+ (走 Unix domain socket 转发).
- **macOS only**: V2.1 不支持 Windows / Linux. V1.1 跨平台验证挂 2 周, 待 Windows/Linux 机器.
- **mcode 任务事件 → 章鱼 切状态 不做**: mcode 暂时没好钩子, V2.1 简单事件驱动轮转. V3.0+ 接 mcode 钩子.
- **音频不做**: 摸头/切状态 音效 V2.1 不做, V3.0 增量.
- **鼠标右键菜单 简化**: V2.1 只有"摸头", 没有"设置/退出/关于". V3.0 增量.
- **开机自启 不做**: V2.1 不做, V3.0 增量.
- **多屏幕 / 鼠标穿透 不做**: V2.1 不做, V3.0 增量.

> 已解决 (留作历史, 不再列限制): 14 V1 表情包移到 archive, 默认 2 V2 视频成品 (V1.5); 状态机 8s 中段切场景 (V2.1 改 6.6s 事件驱动); RGB 无 alpha (V2 chroma key v3 公式); 镜像乱序 + 高频 IPC (V2.1 拆 `autoNextAt` 字段).

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
├── scenes.json                    # 场景元数据单一源 (改完跑 build-scene-registry.sh)
├── scripts/
│   ├── audit-octopus-assets.sh    # 14 场景盘点 (历史, V2.1 不用)
│   ├── build-scene-registry.sh    # scenes.json → TS + Rust 自动生成
│   ├── check-scenes-sync.sh       # scenes.json ↔ generated TS/Rust 一致性
│   ├── encode-webm-alpha.sh       # VP9 alpha 编码 (V2 长动作备用)
│   ├── extract-chromakey-apng.py  # mp4 → 50 帧 RGBA APNG, v3 chroma key
│   ├── lint-octopus-plugin.sh     # spec 合规校验 (16/16)
│   ├── release-plugin.sh          # 发布: 二进制 + 插件目录 + 冒烟
│   └── remove-hat-greenscreen.py  # V2.1 14 动作绿幕清洗 (历史)
├── docs/
│   ├── octopus-assets-audit.md    # 14 场景盘点文档 (历史)
│   └── v2-h3-to-pet-workflow.md   # H3 / gen_videos → APNG 4 步管线
├── app/                           # Tauri webview (React + Vite)
│   ├── package.json / vite.config.ts / index.html
│   ├── src/
│   │   ├── main.tsx / App.tsx
│   │   ├── animation/             # M5: Animation / AnimationProvider / registry
│   │   │   ├── types.ts
│   │   │   ├── registry.ts
│   │   │   └── providers/         # apng.ts (内置) / lottie.ts (M5b)
│   │   ├── components/            # OctopusPet.tsx / Bubble.tsx
│   │   ├── state/                 # types.ts / octopus-fsm.ts (XState v5) / octopus-fsm.test.ts
│   │   │   └── scene-registry.generated.ts   # build-scene-registry.sh 产物
│   │   ├── hooks/                 # useAnimation / useTauriEventBus / useTauriWindowDrag / useStateSync
│   │   └── styles/global.css
│   └── public/
│       └── assets/octopus/
│           ├── v2/                # 2 V2 APNG (RGBA 192×192, num_plays=1)
│           └── _archive-v1-spritesheets/  # 14 V1 sprite (废弃)
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

## 重新生成素材 (V2.1+ 流程)

> 加新场景: 改 `scenes.json` + 跑 `build-scene-registry.sh`. 详见 TODO.md P0-3 / AGENTS.md V2.1 章节.

```bash
# 1. 拿 H3 / gen_videos 输出 mp4 (参考 docs/v2-h3-to-pet-workflow.md)
#    H3 + last_frame_image 双图模式: ~/.minimax/agents/mavis/skills/h3-dual-image-video-gen/
#    gen_videos: connector__matrix__gen_videos (Hailuo-2.3 默认 6s)

# 2. mp4 → 50 帧 RGBA APNG (v3 chroma key, 默认 num_plays=1)
python3 scripts/extract-chromakey-apng.py \
  --input <scene>.mp4 --output app/public/assets/octopus/v2/<scene>.png

# 3. 改 scenes.json 加 entry
# 4. 跑 build-scene-registry.sh + check-scenes-sync.sh (CI 必跑)
```

---

## 引用 (业界共识)

- [Tauri 2](https://v2.tauri.app/) — Rust + WebView 透明窗口
- [XState v5](https://stately.ai/docs/xstate) — 状态机 FSM (事件驱动 SCENE_LOOPED)
- [apng-js 1.1.5](https://github.com/davidmz/apng-js) — APNG 解码 + `'end'` 事件
- [lottie-web 5.13](https://github.com/airbnb/lottie-web) — M5b 第二个 animation provider
- [modelcontextprotocol.io spec 2024-11-05](https://modelcontextprotocol.io/specification/2024-11-05) — MCP 协议
- [agent-plugins.org v1.0.0](https://agent-plugins.org/specification) — Plugin 规范
- [agentskills.io](https://agentskills.io/specification) — Skill frontmatter

---

## License

MIT © 2026 weekbin — see [LICENSE](./LICENSE).
