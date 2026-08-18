# AGENTS.md

> 协作者 + AI agent 向的项目地图. 人类请看 `README.md`.

## 起点
- `README.md` — 用户向 (装 / 卸 / 配置)
- `plan.md` 软链 → `/Users/yangweibin/.minimax/v2/sessions/2026/08/17/16-42-30-836-session_bXZzXzM1NTY5MDhjZDgwYjRiOWViMDgxMWU2M2UyYmJhY2Y5/artifacts/plan.md` (主设计文档, 1461 行)
- `plugin.json` + `mcp.json` — spec 必填三件套
- `skills/octopus-pet/SKILL.md` — Agent Skills spec 必填
- `scripts/audit-octopus-assets.sh` — 跑出 docs/octopus-assets-audit.md
- `scripts/spritesheet-builder.sh` — 14 场景 PNG → spritesheet-*.webp
- `scripts/lint-octopus-plugin.sh` — spec schema 校验

## 设计
- `docs/octopus-assets-audit.md` — W1 D1 素材盘点
- `docs/tech.md` — 技术骨架 (per plan §1.8 + §1.9)
- `docs/features/pet-states.md` — 14 状态 FSM
- `docs/features/mcp-tools.md` — 6 MCP tools 详述

## 技术栈
- Tauri 2 (Rust 后端 + React 前端)
- 14 spritesheet-*.webp (192×192 per cell, 47 帧横排)
- XState FSM (14 状态)
- MCP server stdio (走 MCP 2024-11-05 spec)
- HTTP :9527 fallback (V1 demo 用)

## 验收
- spec schema 校验: `bash scripts/lint-octopus-plugin.sh`
- 素材拼图: `bash scripts/spritesheet-builder.sh` (输出 14 spritesheet-*.webp)
