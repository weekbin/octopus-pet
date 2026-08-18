---
name: octopus-pet
description: |
  Use this skill when the user wants to interact with their coral-pink
  octopus desktop pet. This skill should be used when the user says
  "启动章鱼" / "章鱼桌宠" / "pet show" / "pet status" / "让章鱼说话"
  / "摸章鱼" / "章鱼状态" / "octopus pet" / "pet ask", or asks about
  the current state, animation, or position of their agent client pet.
  Triggers: octopus, 章鱼, 桌宠, 宠物, pet, desk pet, desktop pet.
license: MIT
metadata:
  version: "1.0"
  category: lifestyle
  mcp-server: octopus-pet
---

# Octopus Desktop Pet

Coral-pink octopus (per `octopus-meme` skill §0.1 character) that lives
on your Mac. Connects to the host agent client via the bundled
`octopus-pet` MCP server (stdio transport per agent-plugins.org spec).
Reacts to agent task state with 14 场景 (simple auto-rotation, V1).

## V1 限制: 单实例 (V1 single-instance)

**每个 Mac 同时只能跑一个章鱼 .app** (via `tauri-plugin-single-instance`).
多 mcode session 场景:
- 首个 session 启动 → 章鱼 .app 起来 + 接管 MCP
- 后续 session 启动 → 章鱼 .app 拒绝 (silent die, 已被插件拦截)
- 后续 session 的 MCP tool call 失败 (no .app 接 stdio)
- 后续 session 关掉 → 不影响已跑的章鱼

理由: V1 没有 Unix domain socket 转发层, 多 mcp stdio 进程并发会创建 N
个桌面章鱼 + 14MB 内存浪费 + SharedState 分散. V1.1+ 改 wrapper script 走
Unix domain socket 转发到单实例, 解锁真正的多 session 共享.

**Workaround for V1**: 只想控制章鱼时, 在首个 mcode session 里调 MCP 即可;
后续 session 如果想跟章鱼互动, 走 HTTP :9527 fallback 或直接在章鱼窗口上
单击/右键/拖动.

## Quick start
- 章鱼 MCP server 随插件自动启动 (per mcp.json + agent-plugins.org §7.2 stdio)
- 调章鱼: `mcp__octopus_pet__pet_show({ state: "breakdown" })`
- 调章鱼: `mcp__octopus_pet__pet_ask({ text: "在改了在改了" })`
- 调章鱼: `mcp__octopus_pet__pet_get_state()`

## MCP tools (由章鱼 MCP server 暴露, 走 MCP 2024-11-05)
| Tool | Purpose |
|------|---------|
| `pet_show` | 让章鱼显示指定状态 (14 场景) |
| `pet_ask` | 让章鱼弹气泡说一句话 (≤ 12 字, 调性"打工人") |
| `pet_get_state` | 查询章鱼当前状态 / 位置 / 亲密度 |
| `pet_set_state` | 同 pet_show (别名) |
| `pet_pet` | 摸头, 亲密度 +5, 触发气泡"啊" |
| `pet_list_states` | 列出 14 场景 + 调性文案 |

## 14 场景 (per `~/Works/octopus-worker-meme/`)
- 假装很忙 / 再熬一会 / 我裂开了 / 摆烂躺平
- 多任务 / 发工资 / 工资被拒 / 奶茶
- 周五 5 点 / 带薪蹲坑 / 摸鱼
- 等 M3 Pro / 灵魂出窍 / 多任务v2

## 角色 ground truth (硬约束, 不能改)
粉色 + 8 触手 + 2 小角 + 白色大眼白 + 黑色水平上眼睑
(per `octopus-meme` skill §0.1)
