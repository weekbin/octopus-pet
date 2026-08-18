# Changelog

All notable changes to **octopus-pet** are documented here. The format follows
[Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning 2.0.0](https://semver.org/).

## [Unreleased]

### Added
- Tauri 2 + React 19 + Vite 6 + XState 5 + TypeScript scaffold
- 200×200 transparent always-on-top no-decoration window (`tauri.conf.json`)
- 14-scene XState v5 FSM with 8s rotation, click/pet/drag/ask events
- 14 spritesheet .webp (141 frames each, 2 rows × 71 cols, 13632×384, WebP q80)
- Rust MCP stdio server (modelcontextprotocol.io 2024-11-05) with 6 tools
- `bin/octopus-pet` plugin entrypoint script (agent-plugins.org spec §9.2)
- Plugin spec compliance: plugin.json + mcp.json + skills/octopus-pet/SKILL.md
- 16 unit tests for FSM (Vitest) — all passing
- 5 integration tests for MCP stdio roundtrip (Rust) — defined
- 6 helper scripts in `scripts/`:
  - `audit-octopus-assets.sh` (14 scenes + 3 root-cause differences)
  - `extract-and-link-octopus-frames.sh` (ffmpeg 01-04 + symlink archive)
  - `spritesheet-builder.sh` (141 frames → 2-row WebP grid)
  - `generate-spritesheet-manifest.sh` (React loader metadata)
  - `lint-octopus-plugin.sh` (16/16 spec checks)

### Known Limitations (V1)
- RGB rendering only (no alpha channel) — 14/14 scenes
- 141 frames → 8s rotation causes half-cycle scene swaps (single loop is 11.75s)
- No mcode task event → scene mapping (mcode has no good hook yet)
- macOS only (V2 will add Windows)
- No audio, no custom skins, no multi-screen, no startup-on-boot, no right-click menu beyond pet
- `.app` bundle not yet generated (tauri-cli install in progress)
- GUI window not yet visually verified (no display in headless test env)

## [0.1.0] - 2026-08-18 (W1 D1 + W1 D2)

### Initial Release
- First working scaffold: 14 spritesheets, plugin spec compliance, MCP stdio server
- 4.2MB ARM64 binary (`src-tauri/target/release/octopus-pet`)
- Verified via `printf '{...}' | octopus-pet --mcp-stdio` (initialize + tools/list + tools/call)

[Unreleased]: https://github.com/weekbin/octopus-pet/compare/HEAD
[0.1.0]: https://github.com/weekbin/octopus-pet/releases/tag/v0.1.0
