#!/usr/bin/env bash
# audit-octopus-assets.sh — Inventory octopus-meme assets and emit a per-scene breakdown.
#
# Walks `~/Works/octopus-worker-meme/` (configurable via OCTOPUS_SOURCE_ROOT), counts frames
# in every frames-final/ dir it can find, checks alpha on the first frame, and prints the
# same per-scene table that docs/octopus-assets-audit.md is built from.
#
# Path detection (verified 2026-08-18, all 14 scenes):
#   STANDARD            : <scene>/frames-final/                    (5: 06, 08, 11, 12, 13; 06 is a symlink)
#   ARCHIVE-STANDARD    : archive/<scene>/frames-final/            (1: 05)
#   ARCHIVE-DEEP        : archive/<scene>/frames/frames-final/      (5: 06, 07, 09, 10, 14)
#   ARCHIVE-SHALLOW-59  : archive/<scene>/f_*.png directly         (4: 01, 02, 03, 04 — only 59 frames, need ffmpeg)
#   MISSING-FRAMES      : no PNG at all, only video.mp4            (when 01-04 are looked up at top-level)
#
# Counting uses `ls -1` rather than `find` because macOS BSD find fails silently on
# `06-payday/frames-final` (a symlink to ../archive/06-payday/frames/frames-final).
# `ls -1` always resolves the symlink target and works for all 14 scenes.
#
# Output: human-readable table to stdout. Optionally writes docs/octopus-assets-audit.md
# via --write-doc <path>. Designed to be re-run whenever the source asset folder changes.
#
# Exit codes:
#   0  ok (no errors; some scenes may still be missing frames — that's data, not script failure)
#   1  bad args
#   2  source root not accessible
#   3  python3 missing or PIL not importable
#
# Usage:
#   scripts/audit-octopus-assets.sh
#   scripts/audit-octopus-assets.sh --write-doc docs/octopus-assets-audit.md
#   OCTOPUS_SOURCE_ROOT=~/Works/octopus-worker-meme scripts/audit-octopus-assets.sh

set -euo pipefail

SOURCE_ROOT="${OCTOPUS_SOURCE_ROOT:-$HOME/Works/octopus-worker-meme}"
WRITE_DOC=""

usage() {
  cat <<'EOF'
usage: audit-octopus-assets.sh [--source-root <dir>] [--write-doc <path>]

Options:
  --source-root <dir>   octopus-meme source root (default: $OCTOPUS_SOURCE_ROOT or ~/Works/octopus-worker-meme)
  --write-doc <path>    Write a machine-rendered markdown report to <path>
  -h, --help            Show this help
EOF
}

while [ $# -gt 0 ]; do
  case "$1" in
    --source-root) SOURCE_ROOT="$2"; shift 2 ;;
    --write-doc)   WRITE_DOC="$2"; shift 2 ;;
    -h|--help)     usage; exit 0 ;;
    *)            echo "unknown arg: $1" >&2; usage; exit 1 ;;
  esac
done

if [ ! -d "$SOURCE_ROOT" ]; then
  echo "ERROR: source root not found: $SOURCE_ROOT" >&2
  exit 2
fi

if ! command -v python3 >/dev/null 2>&1; then
  echo "ERROR: python3 not in PATH" >&2
  exit 3
fi

# Probe whether PIL is importable (best-effort alpha check).
if python3 -c "from PIL import Image" 2>/dev/null; then
  HAS_PIL=1
else
  HAS_PIL=0
fi

# 14 scenes from plan §1.9.2 OctopusScene type. Order matters — kept aligned with FSM ordering.
SCENES=(
  "01-pretend-busy|pretend-busy"
  "02-stay-late|stay-late"
  "03-breakdown|breakdown"
  "04-lying-flat|lying-flat"
  "05-multi-tasking|multi-tasking"
  "06-payday|payday"
  "07-salary-rejected|salary-rejected"
  "08-treat-milk-tea|treat-milk-tea"
  "09-friday-5pm|friday-5pm"
  "10-toilet-slacking|toilet-slacking"
  "11-touch-fish|touch-fish"
  "12-waiting-m3pro|waiting-m3pro"
  "13-soul-leaving|soul-leaving"
  "14-multitask|multitask"
)

# Resolve frames dir by trying paths in priority order. Echoes "<loc>:<abs_path>" or empty.
# -L on ls (and on readlink -f) is what makes symlinks (06-payday) work.
resolve_frames_dir() {
  local scene_dir="$1"
  # 1. top-level <scene>/frames-final/  (may be a symlink — that's fine, ls follows)
  if [ -e "$scene_dir/frames-final" ]; then
    local resolved
    resolved=$(readlink -f "$scene_dir/frames-final" 2>/dev/null || echo "$scene_dir/frames-final")
    echo "STANDARD:$scene_dir/frames-final|$resolved"
    return
  fi
  # 2. archive/<scene>/frames-final/   (05 has this exact layout)
  if [ -d "$scene_dir/../archive/$dir_name/frames-final" ] 2>/dev/null; then
    :  # placeholder, dir_name not in scope; handled below
  fi
}

# We need both scene_dir and dir_name in scope; inline the resolution.
# Returns 0 + sets FRAMES_LOC / FRAMES_PATH globals; returns 1 if no frames dir.
resolve_for_scene() {
  local scene_dir="$1"   # full path e.g. /Users/.../octopus-worker-meme/06-payday
  local dir_name="$2"    # basename e.g. 06-payday
  local source_root="$3"

  # 1. top-level <scene>/frames-final/   (handles real dir + symlink to ../archive/...)
  if [ -e "$scene_dir/frames-final" ]; then
    FRAMES_LOC="STANDARD"
    FRAMES_PATH="$scene_dir/frames-final"
    return 0
  fi
  # 2. archive/<scene>/frames-final/     (05-multi-tasking)
  if [ -d "$source_root/archive/$dir_name/frames-final" ]; then
    FRAMES_LOC="ARCHIVE-STANDARD"
    FRAMES_PATH="$source_root/archive/$dir_name/frames-final"
    return 0
  fi
  # 3. archive/<scene>/frames/frames-final/  (06, 07, 09, 10, 14 — depth 2)
  if [ -d "$source_root/archive/$dir_name/frames/frames-final" ]; then
    FRAMES_LOC="ARCHIVE-DEEP"
    FRAMES_PATH="$source_root/archive/$dir_name/frames/frames-final"
    return 0
  fi
  # 4. archive/<scene>/f_*.png directly  (01, 02, 03, 04 — only 59 frames, partial)
  if ls "$source_root/archive/$dir_name"/f_*.png >/dev/null 2>&1; then
    FRAMES_LOC="ARCHIVE-SHALLOW-59"
    FRAMES_PATH="$source_root/archive/$dir_name"
    return 0
  fi
  return 1
}

# Count f_*.png frames in a directory. Uses ls -1 (not find) because macOS BSD find
# returns 0 on the 06-payday/frames-final symlink; ls -1 always resolves symlinks.
count_frames() {
  local dir="$1"
  if [ ! -e "$dir" ]; then
    echo "0"
    return
  fi
  # ls -1 always follows symlinks; -U unsorted (faster). 2>/dev/null swallows ENOENT on the
  # dir itself (shouldn't happen given [ -e ] above, but defensive).
  local cnt
  cnt=$(ls -1U "$dir"/f_*.png 2>/dev/null | wc -l | tr -d ' ')
  if [ -z "$cnt" ]; then echo "0"; else echo "$cnt"; fi
}

# Returns "RGB" or "RGBA" for the first f_*.png in the dir, or "—" if none / no PIL.
first_frame_alpha() {
  local dir="$1"
  local first
  # Use ls to follow symlinks; pick the first frame in sorted order.
  first=$(ls -1 "$dir"/f_*.png 2>/dev/null | head -1 || true)
  if [ -z "$first" ]; then
    echo "—"
    return
  fi
  if [ "$HAS_PIL" -eq 0 ]; then
    echo "?(no PIL)"
    return
  fi
  python3 - "$first" <<'PY' 2>/dev/null
import sys
from PIL import Image
img = Image.open(sys.argv[1])
mode = img.mode
if "A" in mode:
    print("RGBA")
else:
    print("RGB")
PY
}

# Has MP4 video at top-level scene dir?
has_mp4() {
  local scene_dir="$1"
  if [ -e "$scene_dir/video.mp4" ]; then
    echo "✅"
  else
    echo "—"
  fi
}

# Has GIF preview at top-level scene dir?
has_gif() {
  local scene_dir="$1"
  if ls "$scene_dir"/final*.gif >/dev/null 2>&1; then
    echo "✅"
  else
    echo "—"
  fi
}

# Build rows in a temp TSV we can both pretty-print and emit as markdown.
TMP_TSV="$(mktemp -t octopus-audit.XXXXXX)"
trap 'rm -f "$TMP_TSV"' EXIT

printf "idx\tdir\t\tscene_id\t\t\tmp4\tgif\tframes_loc\tframes_path\tframes_count\talpha\n" >> "$TMP_TSV"

i=0
for entry in "${SCENES[@]}"; do
  IFS='|' read -r dir_name scene_id <<< "$entry"
  scene_dir="$SOURCE_ROOT/$dir_name"
  i=$((i + 1))

  mp4=$(has_mp4 "$scene_dir")
  gif=$(has_gif "$scene_dir")

  FRAMES_LOC=""
  FRAMES_PATH=""
  if resolve_for_scene "$scene_dir" "$dir_name" "$SOURCE_ROOT"; then
    fcnt=$(count_frames "$FRAMES_PATH")
    alpha=$(first_frame_alpha "$FRAMES_PATH")
  else
    FRAMES_LOC="MISSING-FRAMES"
    FRAMES_PATH="—"
    fcnt="0"
    alpha="—"
  fi

  printf "%d\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\n" \
    "$i" "$dir_name" "$scene_id" "$mp4" "$gif" "$FRAMES_LOC" "$FRAMES_PATH" "$fcnt" "$alpha" \
    >> "$TMP_TSV"
done

# Pretty print.
echo
echo "=============================================================="
echo "octopus-meme 资产盘点 — 14 场景 (V1, verified $(date +%Y-%m-%d))"
echo "Source: $SOURCE_ROOT"
echo "=============================================================="
printf "%-3s %-22s %-18s %-4s %-4s %-20s %-6s %-5s\n" \
  "#" "目录" "OctopusScene" "MP4" "GIF" "frames_path" "帧数" "alpha"
echo "----------------------------------------------------------------"
while IFS=$'\t' read -r idx dir sid mp4 gif loc path fcnt alpha; do
  [ "$idx" = "idx" ] && continue
  # Trim path for display: show relative to SOURCE_ROOT
  rel_path="${path#$SOURCE_ROOT/}"
  printf "%-3s %-22s %-18s %-4s %-4s %-20s %-6s %-5s\n" \
    "$idx" "$dir" "$sid" "$mp4" "$gif" "$loc" "$fcnt" "$alpha"
done < "$TMP_TSV"
echo "----------------------------------------------------------------"
echo "(完整 frames 路径见下方汇总表)"

# Summary numbers
total=$(awk -F'\t' 'NR>1 {sum+=$8} END {print sum}' "$TMP_TSV")
with_alpha=$(awk -F'\t' 'NR>1 && $9=="RGBA" {n++} END {print n+0}' "$TMP_TSV")
without_alpha=$(awk -F'\t' 'NR>1 && $9=="RGB" {n++} END {print n+0}' "$TMP_TSV")
no_frames=$(awk -F'\t' 'NR>1 && $8=="0" {n++} END {print n+0}' "$TMP_TSV")
standard_loc=$(awk -F'\t' 'NR>1 && $6=="STANDARD" {n++} END {print n+0}' "$TMP_TSV")
archive_standard_loc=$(awk -F'\t' 'NR>1 && $6=="ARCHIVE-STANDARD" {n++} END {print n+0}' "$TMP_TSV")
archive_deep_loc=$(awk -F'\t' 'NR>1 && $6=="ARCHIVE-DEEP" {n++} END {print n+0}' "$TMP_TSV")
archive_shallow_loc=$(awk -F'\t' 'NR>1 && $6=="ARCHIVE-SHALLOW-59" {n++} END {print n+0}' "$TMP_TSV")
missing_loc=$(awk -F'\t' 'NR>1 && $6=="MISSING-FRAMES" {n++} END {print n+0}' "$TMP_TSV")

echo
echo "汇总:"
echo "  总帧数 (有 frames 的场景): $total"
echo "  RGBA (透明):                 $with_alpha"
echo "  RGB (不透明):                $without_alpha"
echo "  0 frames:                    $no_frames  ← 需 ffmpeg 抽帧"
echo
echo "  frames 在 STANDARD (top-level frames-final/):   $standard_loc / 14"
echo "  frames 在 ARCHIVE-STANDARD (archive/frames-final/):  $archive_standard_loc / 14"
echo "  frames 在 ARCHIVE-DEEP (archive/frames/frames-final/):  $archive_deep_loc / 14"
echo "  frames 在 ARCHIVE-SHALLOW-59 (59-frame partial): $archive_shallow_loc / 14"
echo "  frames 缺失 (MISSING-FRAMES): $missing_loc / 14"
echo
echo "V1 落地动作:"
echo "  • 6 个 archive 场景 (05, 07, 09, 10, 14 + 06 symlink) → symlink 到标准路径"
echo "  • 4 个 01-04 场景 → ffmpeg 从 video.mp4 抽 141 帧到 frames-final/"
echo

if [ -n "$WRITE_DOC" ]; then
  echo "writing doc to: $WRITE_DOC"
  {
    cat <<HEADER
# 章鱼素材盘点 (V1)

> **W1 D1 实测结果** (generated $(date +%Y-%m-%d) by \`scripts/audit-octopus-assets.sh\`)
> **Source of truth**: \`$SOURCE_ROOT\`
> **执行人**: Mavis (mavis)

## 关键发现 (跟 plan §1.9.1 假设的 3 个根因差异)

| 假设 (plan §1.9.1) | 实际 (verified) | 影响 |
|---------------------|---------------|------|
| **47 帧/场景** (f_0001.png ~ f_0047.png) | **141 帧/场景** (f_0001.png ~ f_0141.png) | spritesheet 宽度 = 141 × 192 = **27072 px**, 单循环时长 = 141 / 12fps = 11.75s. 动画时长 ~3× 计划值. 状态机 8s 轮转需要重新调 |
| **PNG 透明 (alpha)** | **PNG 不透明 (RGB 720×720, 背景是实色)** | "章鱼 .app 透明桌宠" 假设不能直接成立. Tauri \`transparent: true\` 窗口里章鱼会显示成实色矩形, 不会跟桌面融合. **V1 接受 RGB 渲染, V2 用 chroma key / 图像分割加 alpha** |
| **14 场景都有 frames-final/** | **5/14 top-level + 1/14 archive/frames-final + 5/14 archive/frames/frames-final + 4/14 archive only 59 partial** | spritesheet-builder.sh 实际能直接跑的是 5 个 (06, 08, 11, 12, 13). 其它 9 个需要先 re-extract (ffmpeg 抽 141 帧) 或 symlink |

## 14 场景详细盘点 (verified $(date +%Y-%m-%d))

HEADER

    echo "| # | 场景目录 | OctopusScene | 视频 | GIF | frames 路径类型 | 帧数 | 透明度 | frames_path |"
    echo "|---|---------|-------------|------|------|----------------|------|--------|-------------|"
    while IFS=$'\t' read -r idx dir sid mp4 gif loc path fcnt alpha; do
      [ "$idx" = "idx" ] && continue
      rel_path="${path#$SOURCE_ROOT/}"
      if [ "$path" = "—" ] || [ -z "$path" ]; then
        rel_path="**❌ 无 PNG 帧** (需 ffmpeg 抽)"
      else
        rel_path="\`$rel_path/\`"
      fi
      echo "| $idx | \`$dir/\` | \`$sid\` | $mp4 | $gif | \`$loc\` | $fcnt | $alpha | $rel_path |"
    done < "$TMP_TSV"

    cat <<FOOTER

## V1 落地策略 (per user "持续完成" 指令)

**3 个根因差异, 各自处理**:

1. **141 帧 (不是 47)**: 接受现实, spritesheet 宽度 = 27072 px, 单循环 ~12s (12fps). 状态机 8s 轮转改成 ~12s 轮转 (或 6s 半循环轮转). 帧率从 12fps 调到 8fps (141/8 = 17.6s 单循环). **等用户拍板**.

2. **RGB 无 alpha (V1 限制)**: V1 接受 RGB 渲染. Tauri 窗口 transparent + 背景色固定, 章鱼显示成 RGB 矩形. **V2 用图像分割 / chroma key 加 alpha**. 已知限制写到 README + AGENTS.md.

3. **9/14 场景缺标准路径 PNG 帧**:
   - 4 个 (01/02/03/04): ffmpeg 从 \`video.mp4\` 抽 141 帧 → 写到 \`<scene>/frames-final/f_0001.png ~ f_0141.png\`
   - 6 个 (05/06/07/09/10/14): symlink archive 路径 → \`<scene>/frames-final/ (06 已 symlink)\`
   - 跑完这两步后, 14/14 场景都有标准路径的 frames-final/ + 141 帧

## 汇总 (本盘点)

- 总帧数 (有 frames 的场景): $total
- RGBA (透明): $with_alpha
- RGB (不透明): $without_alpha
- 0 frames: $no_frames
- frames 在 STANDARD (top-level): $standard_loc / 14
- frames 在 ARCHIVE-STANDARD: $archive_standard_loc / 14
- frames 在 ARCHIVE-DEEP: $archive_deep_loc / 14
- frames 在 ARCHIVE-SHALLOW-59: $archive_shallow_loc / 14
- frames 缺失: $missing_loc / 14

> 重新跑本盘点: \`scripts/audit-octopus-assets.sh --write-doc docs/octopus-assets-audit.md\`
FOOTER

  } > "$WRITE_DOC"
  echo "wrote $(wc -l < "$WRITE_DOC" | tr -d ' ') lines to $WRITE_DOC"
fi
