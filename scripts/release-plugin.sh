#!/usr/bin/env bash
# release-plugin.sh — 产出可独立运行的插件发布物 (跨平台).
#
# 产物:
#   1. bin/octopus-pet.${KERNEL}.bin   ← release 二进制 (提交进 git, 平台特定)
#        ${KERNEL} ∈ {macos, linux, windows}
#        repo clone 后无需本地构建即可作为插件加载 (bin/octopus-pet wrapper 兜底 exec 它)
#   2. dist/octopus-pet-plugin/         ← 可选分发拷贝 (gitignored, 可再生成)
#        ├── plugin.json / mcp.json / skills/   (spec 组件面)
#        ├── bin/octopus-pet                   (binary, 零依赖)
#        └── LICENSE / CHANGELOG.md / README.md
#   3. src-tauri/target/release/bundle/{macos,linux,windows}/   (tauri build 完整包)
#
# 用法: bash scripts/release-plugin.sh [--no-bundle]
#   --no-bundle: 只做二进制 + 插件目录, 跳过 tauri build bundle (快)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
CARGO_BIN="$ROOT/src-tauri/target/release/octopus-pet"
DIST_DIR="$ROOT/dist/octopus-pet-plugin"

# Detect host kernel for the platform-specific release artifact.
case "$(uname -s)" in
  Darwin)  KERNEL="macos" ;;
  Linux)   KERNEL="linux" ;;
  MINGW*|MSYS*|CYGWIN*) KERNEL="windows" ;;
  *)       KERNEL="$(uname -s | tr '[:upper:]' '[:lower:]')" ;;
esac
BIN_TARGET="$ROOT/bin/octopus-pet.${KERNEL}.bin"

NO_BUNDLE=0
for arg in "$@"; do
  case "$arg" in
    --no-bundle) NO_BUNDLE=1 ;;
    *) echo "unknown arg: $arg" >&2; exit 1 ;;
  esac
done

export PATH="$HOME/.cargo/bin:$PATH"

echo "==> 1/4 构建 (cargo tauri build --no-bundle) [${KERNEL}]"
# 必须走 tauri CLI: 裸 cargo build 的增量编译不会重跑 asset 嵌入
# (generate_context! 读 frontendDist, 由 build.rs 触发, cargo 增量会跳过),
# 会导致 release 二进制缺 9.1MB spritesheet (binary < 5MB = 白框)。
# cargo tauri build 先跑 beforeBuildCommand (npm run build) 保证 dist 最新。
(cd "$ROOT/src-tauri" && cargo tauri build --no-bundle)

if [ ! -x "$CARGO_BIN" ]; then
  echo "ERROR: release binary not produced: $CARGO_BIN" >&2
  exit 1
fi

echo "==> 2/4 提交产物 → ${BIN_TARGET#$ROOT/} (git 跟踪)"
/bin/cp "$CARGO_BIN" "$BIN_TARGET"
chmod +x "$BIN_TARGET"
ls -lh "$BIN_TARGET" | awk '{print "    "$NF"  ("$5")"}'

echo "==> 3/4 组装 dist/octopus-pet-plugin/"
/bin/rm -rf "$DIST_DIR"
mkdir -p "$DIST_DIR/bin"
/bin/cp "$CARGO_BIN" "$DIST_DIR/bin/octopus-pet"
/bin/cp "$ROOT/plugin.json" "$ROOT/mcp.json" "$DIST_DIR/"
/bin/cp -R "$ROOT/skills" "$DIST_DIR/skills"
/bin/cp "$ROOT/LICENSE" "$ROOT/CHANGELOG.md" "$ROOT/README.md" "$DIST_DIR/"
echo "    dist/octopus-pet-plugin/ ready ($(du -sh "$DIST_DIR" | cut -f1))"

echo "==> 4/4 冒烟: MCP initialize + tools/list (no args = default MCP stdio)"
printf '%s\n' \
  '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}' \
  '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}' \
  | "$BIN_TARGET" \
  | python3 -c '
import json,sys
for line in sys.stdin:
    line=line.strip()
    if not line: continue
    r=json.loads(line)
    if r.get("method","") == "":  # responses
        if r["id"]==1: print("    initialize OK:", r["result"]["serverInfo"]["name"], r["result"]["serverInfo"]["version"])
        elif r["id"]==2: print("    tools/list OK:", len(r["result"]["tools"]), "tools")
'

if [ "$NO_BUNDLE" -eq 0 ]; then
  echo "==> (可选) tauri build → .app/.deb/AppImage/.msi"
  (cd "$ROOT/src-tauri" && cargo tauri build 2>/dev/null || echo "    skipped (tauri bundle tools 未配置, 二进制已产出)")
fi

echo "✅ release 完成 (${KERNEL})"
echo "   - 提交产物: git add ${BIN_TARGET#$ROOT/} && git commit && git push"
echo "   - 插件加载: mcode 添加插件 → 指向 $ROOT (或 dist/octopus-pet-plugin/)"
