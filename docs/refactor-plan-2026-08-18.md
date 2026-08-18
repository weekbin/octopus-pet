# octopus-pet 架构重构 Plan v3 (2026-08-18)

> 一次性修复:状态权威分裂 + FSM 轮转 bug + 目录编排混乱 + 发布形态缺失 + git 提交策略。
> 双重约束:① 章鱼项目本身的工程质量 ② 根目录是 agent-plugins.org v1.0.0 合规插件。
> 用户决策记录:sync_state ✅ 做;frame ✅ 删;四分类理清目录;✅ 产物提交进 git(repo 本身可作插件加载)。

---

## 1. 决策:是否采用 `app/frontend + app/backend`?

**结论:不采用字面拆分。保留 `src-tauri/` + `app/` 平级,用"四分类模型"理清。**

### 1.1 市面 agent 桌宠目录结构调研(2026-08-18,10 个项目)

| 项目 | 技术栈 | 目录结构 |
|---|---|---|
| **aemeath_withclaude** (Claude Code 桌宠) | Tauri 2 + axum | `src-tauri/` + `src/` + `docs/` |
| **AI 步步** (掘金, Tauri) | Tauri 2 + Vue 3 | **pnpm monorepo**: `packages/app/`(内含 `src/` + `src-tauri/`) + `packages/providers/` + `packages/site/` |
| **buddy-desktop** (Claude/Codex/Gemini) | Tauri | monorepo: `packages/desktop-core/`(内含 `src/` + `src-node/` + `src-tauri/`) + `packages/skill-adapters/` |
| **clawd-on-desk** (3.7k stars) | Electron | `src/` 内 `main/` + `preload/` + `renderer/`(按进程分层) |
| **HermesPet** (Electron + Live2D) | Electron 33 + Vue 3 | `src/main/` + `src/preload/` + `src/renderer/` |
| **墨矩工坊 MoJu** (Tauri) | Tauri 2 + Vue 3 | `src/`(pet/ 引擎分层)+ `src-tauri/` + `public/` + `dist/` |
| **toller892 / XSUN / itsaysay / PetGPT** | Tauri | 全部 `src/` 或 `app/` + `src-tauri/` 平级 |

### 1.2 调研结论(三条硬证据)

1. **零先例**:10 个主流 agent 桌宠,无一家用 `app/frontend + app/backend`。Tauri 系 100% 是 `src-tauri/`(Rust)+ `src/`/`app/`(前端)平级 — create-tauri-app 官方脚手架约定。
2. **工具链强耦合**:`tauri.conf.json` 默认位置、`cargo tauri` CLI、`beforeBuildCommand` 路径、CI、全部文档教程都建立在 `src-tauri/` 上,改名纯移动零收益。
3. **monorepo 拆的是部署单元不是前后端**:AI步步拆 `app/providers/site`,buddy-desktop 拆 `desktop-core/skill-adapters`。前后端分离在 Tauri 是物理强制的(Rust 进程 + WebView 进程),目录名不需要再表达一次。

### 1.3 解决"分不清":四分类模型

| 分类 | 目录 | 进 git | 说明 |
|---|---|---|---|
| **组件面**(spec 契约) | `plugin.json` `mcp.json` `skills/` `bin/` | ✅ | 插件被客户端发现的固定位置(§6.1) |
| **开发面**(源码+脚本) | `app/` `src-tauri/` `scripts/` `docs/` | ✅ | 人类和 agent 改代码的地方 |
| **中间产物**(构建输出) | `src-tauri/target/` `app/dist/` `src-tauri/gen/` | ❌ | 缓存/重建物,体积大,不进 git |
| **可分发产物**(运行物) | `bin/octopus-pet.bin`(release 二进制) `app/public/assets/*.webp` `app/src/data/spritesheet-manifest.json` | ✅ | **用户明确要求:repo 本身要可作插件加载,产物必须提交** |

---

## 2. git 提交策略(.gitignore 全量决策表)

### 2.1 提交(进 git)

| 路径 | 为什么 |
|---|---|
| `plugin.json` `mcp.json` `skills/` | spec 固定位置,组件面 |
| `bin/octopus-pet` | bash 桥(dev 构建优先,.bin 兜底) |
| `bin/octopus-pet.bin` | **release 二进制,~14MB**(内嵌 9.1MB spritesheet + webview 壳)。repo clone 即插件可加载,符合"产物提交" |
| `app/` 源码 + `app/package.json` `app/package-lock.json` | 前端源码 + 依赖锁定 |
| `app/public/assets/octopus/spritesheet-*.webp`(14 张) | 运行资产,tauri build 时嵌入二进制 |
| `app/src/data/spritesheet-manifest.json` | 运行元数据(唯一 manifest) |
| `src-tauri/` 源码 + `Cargo.toml` + **`Cargo.lock`** | **修正:应用项目必须提交 Cargo.lock**(可复现构建;CI cache key 已依赖它)。现有 .gitignore 里 ignore 它是错的 |
| `src-tauri/icons/` `src-tauri/capabilities/` | 图标(RGBA)+ 权限 |
| `scripts/` `docs/` `.github/` | 构建脚本 / 文档 / CI |
| `README.md` `AGENTS.md` `CHANGELOG.md` `LICENSE` | 文档 |

### 2.2 不提交(gitignore)

| 路径 | 为什么 |
|---|---|
| `src-tauri/target/` | cargo 中间产物 + bundle,几百 MB |
| `src-tauri/gen/` | tauri 生成代码 |
| `app/node_modules/` | 依赖 |
| `app/dist/` | vite 中间产物(tauri build 重新生成;assets 已内嵌二进制) |
| `dist/` | release 组装目录(源文件都在 git,可再生成;见 §3) |
| `app/public/assets/octopus/spritesheet-*.miff` | 拼图中间格式 |
| `.DS_Store` `*.log` `.env` `secrets/` `.local-*` `*.tmp` 等 | 常规 |
| `codebuddy-integration-gap-report.md` | 无关文档 |

### 2.3 二进制提交的取舍(文档注明)

- `bin/octopus-pet.bin` 是 author 机器编译的 **macOS arm64** 产物(GitHub 单文件 100MB 限制内,14MB 普通提交,不引 LFS)。
- 其他架构/想用最新代码:clone 后 `cargo build --release` + 覆盖 `bin/octopus-pet.bin`,或直接依赖 bash 桥的本地构建优先逻辑。

---

## 3. 发布形态设计

### 3.1 需求

"发布插件 = 发布一个可独立运行的程序" + "repo 本身作为插件加载,产物提交" + spec §7.2.1(command 是 plugin-relative executable token)。

### 3.2 双身份设计

```
bin/octopus-pet (bash 桥, 提交)     bin/octopus-pet.bin (release 二进制, 提交)
  ├─ 1. target/debug/octopus-pet     ← dev 构建最新 (开发者)
  ├─ 2. target/release/octopus-pet   ← 发版后最新
  └─ 3. 同目录 octopus-pet.bin       ← 提交的兜底产物 (clone 即用)
exec 选中的二进制, 透传所有 args (--mcp-stdio)
```

- **开发者**:本地 `cargo build`(debug)→ mcode 加载走 debug 新代码;发版跑 `release-plugin.sh` 更新 .bin。
- **用户(clone repo)**:无本地构建 → bash 桥落到 `.bin` → 插件直接可加载,零依赖。

### 3.3 `scripts/release-plugin.sh`(新增)

1. `cargo build --release`(src-tauri/)
2. `cp target/release/octopus-pet → bin/octopus-pet.bin`(**提交的产物**)
3. 组装 `dist/octopus-pet-plugin/`(可选分发拷贝):plugin.json / mcp.json / skills/ / bin/octopus-pet(二进制)/ LICENSE / CHANGELOG / README
4. 冒烟:`printf '{...}' | bin/octopus-pet --mcp-stdio`(initialize + tools/list)

---

## 4. 现状问题清单(全部实锤)

| # | 问题 | 位置 |
|---|------|------|
| P0 | FSM 轮转 bug:任何场景 8s 后切 `stay-late` | `octopus-fsm.ts:46` `nextScene(initialContext.scene)` |
| P0 | 状态三份不同步:XState / Rust SharedState / `useState(frame)` | `octopus-fsm.ts` + `state_bridge.rs:11` + `OctopusPet.tsx:28` |
| P0 | HTTP fallback 断链:改状态不 emit → 前端不动 | `http_fallback.rs`(无 AppHandle) |
| P1 | 业务逻辑 4 处重复(截断 12 字 / bubble 3s / affection+5) | `mcp_stdio.rs:194` `state_bridge.rs:81` `http_fallback.rs:138` `octopus-fsm.ts:84` |
| P1 | 死代码:4 个 tauri command 前端 0 处 invoke | `lib.rs:77` + `state_bridge.rs` |
| P2 | manifest 双生:脚本输出 public,代码 import src/data,两份都进 git | `generate-spritesheet-manifest.sh:24` vs `OctopusPet.tsx:17` |
| P2 | SCENE 常量双源 + 人肉同步 | `mcp_stdio.rs:46` + `types.ts:8` |
| P2 | 空目录 `archive/`、`app/src/ipc/`(git 未跟踪) | 根目录 + app/src |
| P2 | bin 搜索废弃路径 `dist/macos/...` | `bin/octopus-pet:27,31` |
| P2 | 注释漂移 `scenes.ts:4`(说 fetch,实际 import) | `scenes.ts` |
| P2 | **Cargo.lock 被误 ignore**(应用项目必须提交) | `.gitignore:6` |
| P2 | **无发布形态 + 产物不提交**,repo clone 后插件不可加载 | — |

---

## 5. 目标架构:单一状态权威 + 事件总线(不变)

```
MCP tools/call ─┐
HTTP POST ──────┼─→ emit("octopus://event") ─→ XState FSM ◄── webview 交互 (click/pet/drag)
headless 直写 ──┘       (actions.rs)              │  (唯一状态权威)
                                                  │  subscribe (字段级 select)
                                                  ▼
                                          invoke sync_state ─→ Rust SharedState (只读镜像)
```

- `actions.rs`:唯一逻辑点(截断/bubble/affection + emit + headless 直写)
- `sync_state`:Rust 侧唯一写入口(webview 回写镜像)
- 协议入口只做协议适配
- 删 `OctopusState.frame` + `SharedState.frame`(无消费者)

---

## 6. 目标目录结构

```
cute/                                    # plugin root (spec 固定位置)
├── plugin.json / mcp.json               # ┐ 组件面
├── skills/octopus-pet/                  # │
├── bin/                                 # ┘ bin/octopus-pet (桥) + bin/octopus-pet.bin (产物)
├── README.md / AGENTS.md / CHANGELOG.md / LICENSE
├── docs/                                # 开发面: 文档
├── app/                                 # 开发面: React 前端
│   ├── src/  (state/ components/ hooks/ data/ styles/)
│   │   └── data/spritesheet-manifest.json   # 唯一 manifest (脚本输出改这里)
│   ├── public/assets/octopus/           # 仅 14 张 spritesheet-*.webp
│   ├── dist/                            # 中间产物 (gitignored)
│   └── package.json / vite.config.ts
├── src-tauri/                           # 开发面: Rust 后端 (Tauri 惯例名)
│   ├── src/  (main/ lib/ actions/ mcp_stdio/ http_fallback/ state_bridge)
│   ├── tests/ icons/ capabilities/
│   ├── target/                          # 中间产物 (gitignored)
│   ├── Cargo.toml / Cargo.lock / tauri.conf.json
├── scripts/                             # 开发面: 5 个脚本 + release-plugin.sh
└── dist/                                # 发布组装目录 (gitignored, 可再生成)
    └── octopus-pet-plugin/              # 可选分发拷贝
```

**删除**:`archive/`、`app/src/ipc/`、`app/public/assets/octopus/spritesheet-manifest.json`(public 副本)、`state_bridge` 3 个死 command。

---

## 7. 执行步骤(7 commits,每步验证 + 立即 push)

### C1 前端:修 bug + 状态收敛 + 单源化(纯 TS)
1. `octopus-fsm.ts:46` `rotateScene` → `nextScene(context.scene)`;删 `frame` 字段
2. `types.ts`:删 `frame`;`SCENE_ORDER` 从 manifest `scenes[].sceneId` 派生;`BUBBLE_BY_SCENE` 由 `Record<OctopusScene,…>` 编译期强制齐全
3. `octopus-fsm.test.ts`:删 frame 断言;补 **14 场景轮转序列测试**(原盲区)
4. `scenes.ts` 注释修正
5. 验证:`cd app && npm test` + `npx tsc --noEmit`

### C2 资源:manifest 单源 + 清空目录
1. `generate-spritesheet-manifest.sh` 输出 → `app/src/data/spritesheet-manifest.json`
2. `/bin/rm` 删 public 副本 + 空目录 `archive/`、`app/src/ipc/`
3. `git rm` public 副本(它已跟踪,要用 git rm 走 git)
4. 重跑脚本;验证:`git status` 干净 + `npm test` 过

### C3 Rust:单一状态权威 + 断链修复 + 死代码清理
1. 新建 `src-tauri/src/actions.rs`:`apply_show / apply_ask / apply_pet`(校验 + 截断 + bubble + affection + emit;`app=None` 时 headless 直写)
2. `mcp_stdio.rs` 瘦身调 actions;`http_fallback.rs` `start(app: Option<AppHandle>, …)` 调 actions(断链修复)
3. `state_bridge.rs`:删 3 死 command;新增 `sync_state`(只写不 emit);删 `SharedState.frame`;`lib.rs` 同步
4. `bin/octopus-pet` 重写(dev 构建优先 + `.bin` 兜底,删 dist/macos 废弃 candidate)
5. 验证:`cd src-tauri && cargo test && cargo build`

### C4 前端接线:sync_state 回写
1. 新 hook `useStateSync`:FSM subscribe + 字段级 select(scene/bubble/affection/position 变化才 invoke),防 60fps 轰炸
2. `OctopusPet.tsx` 挂 hook
3. 验证:`npm test` + `npm run build` + 手动冒烟(`pet_get_state` 与屏幕一致)

### C5 发布面:release 脚本 + git 策略
1. 新 `scripts/release-plugin.sh`(§3.3):二进制 → `bin/octopus-pet.bin` + `dist/octopus-pet-plugin/`
2. **`.gitignore` 重写**(§2 决策表):删 `src-tauri/Cargo.lock` ignore;加 `dist/`;删冗余 `target/`;注释按四分类组织
3. **`git add` Cargo.lock + bin/octopus-pet.bin**,跑 release 冒烟
4. 验证:`bash scripts/release-plugin.sh` + `git status` 只含预期文件

### C6 文档
1. `README.md`:目录地图(四分类表)+ 开发/插件加载两种方式 + 二进制架构注明
2. `AGENTS.md`:协作规则更新(actions.rs 单点 / manifest 单源 / release 流程 / 产物提交约定)
3. `CHANGELOG.md`:[Unreleased] Fixed/Refactored/Added

### C7 全量验证
- `bash scripts/lint-octopus-plugin.sh`(16/16)
- `cd app && npm test && npx tsc --noEmit && npm run build`
- `cd src-tauri && cargo test && cargo build`
- `bash scripts/release-plugin.sh` 冒烟 + clone 模拟(`git clone . /tmp/x && /tmp/x/bin/octopus-pet --mcp-stdio` 通)
- 每个 C 阶段独立 commit,立即 `git push origin main`

---

## 8. 不做的事(留给 V2)

- 渲染层 Canvas + RAF(高刷屏一致性)— V2
- affection/position 持久化(tauri-plugin-store)— V2
- MCP 多 session 共享(single-instance 副作用)— V1.1 UDS 转发
- 系统托盘 / 右键菜单扩展 / 鼠标穿透 — 已知限制
- 多架构产物矩阵(arm64/intel)— V2 再说,README 注明即可

## 9. 验收标准

1. `pet_get_state` 与屏幕显示一致(点击/MCP/HTTP 控制实时可见)
2. 14 场景 8s 轮转完整循环(不再卡 stay-late)
3. 逻辑单点:`grep -rn "take(12)" src-tauri/src` 只有 actions.rs;`grep -rn "affection" src-tauri/src` 只见 actions.rs + state_bridge(镜像)
4. **repo 本身可作插件加载**:`git clone` 后无本地构建,`bin/octopus-pet --mcp-stdio` 直接可跑(initialize/tools/list 通)
5. `.gitignore` 决策表落地:Cargo.lock 已跟踪、dist/ 与 target/ 忽略、无空目录、无双生文件
