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
