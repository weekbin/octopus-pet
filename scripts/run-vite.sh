#!/bin/bash
# tauri.conf.json beforeDevCommand/beforeBuildCommand 的 CWD-agnostic 入口.
# Tauri 2 在 beforeDevCommand 内部把 CWD 推断成 `frontendDist` 的父目录 (cute/app/),
# beforeBuildCommand 在 cargo tauri build 时 CWD 是 src-tauri/ (cargo 标准).
# 两套 CWD 都不直接对应 `cute/app/`,所以用 wrapper script 自己 cd,避免配置假设错位.
#
# 用法 (tauri.conf.json):
#   "beforeDevCommand": "bash scripts/run-vite.sh dev"
#   "beforeBuildCommand": "bash scripts/run-vite.sh build"
#
# 为什么不用 npm --prefix:
#   --prefix 相对当前 CWD 解析,不同模式 CWD 不同 → 仍然要算偏移.
#   cd $(dirname "$0")/../app 是绝对路径,跟 CWD 无关 → 1 行可移植.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$SCRIPT_DIR/../app"
cd "$APP_DIR"
exec npm run "$@"
