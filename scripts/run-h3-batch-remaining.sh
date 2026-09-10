#!/usr/bin/env bash
# run-h3-batch-remaining.sh — 跑剩下 4 个 H3 动作 (05-08)
# 04-breakdown 已单跑过,见 _h3-source/breakdown-h3.mp4

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
H3_DIR="$HOME/.minimax/agents/mavis/skills/h3-dual-image-video-gen"
RUN_H3="$H3_DIR/scripts/run_h3_video.py"

FIRST_FRAME="$ROOT/art/octopus-frames/standard-char-1x1.png"
OUT_DIR="$ROOT/app/public/assets/octopus/_h3-source"

# 4 个剩余动作: <scene-id>:<prompt-file>:<expected-mp4-output>
SCENES=(
  "05-payday:prompts/05-payday.md:payday-h3.mp4"
  "06-treat-milk-tea:prompts/06-treat-milk-tea.md:treat-milk-tea-h3.mp4"
  "07-soul-leaving:prompts/07-soul-leaving.md:soul-leaving-h3.mp4"
  "08-lying-flat:prompts/08-lying-flat.md:lying-flat-h3.mp4"
)

cd "$ROOT"

total=${#SCENES[@]}
ok=0
fail=0
i=0
for entry in "${SCENES[@]}"; do
  i=$((i+1))
  IFS=":" read -r id prompt_file mp4_name <<< "$entry"
  prompt_path="$ROOT/$prompt_file"
  output="$OUT_DIR/$mp4_name"

  if [ -f "$output" ]; then
    size=$(stat -f%z "$output" 2>/dev/null || stat -c%s "$output" 2>/dev/null)
    echo "[$i/$total] SKIP $id (already exists: $mp4_name, $size bytes)"
    ok=$((ok+1))
    continue
  fi

  echo ""
  echo "=============================================================="
  echo "[$i/$total] $id → $mp4_name"
  echo "        start:  $(date '+%H:%M:%S')"
  echo "=============================================================="

  prompt_content=$(cat "$prompt_path")

  if python3 "$RUN_H3" \
        --first-frame "$FIRST_FRAME" \
        --last-frame "$FIRST_FRAME" \
        --prompt "$prompt_content" \
        --output "$output" \
        --duration 6 \
        --resolution 768P \
        --ratio 1:1 \
        --poll-interval 15 \
        --max-wait 600 \
        --auto-verify 2>&1; then
    echo "        end:    $(date '+%H:%M:%S')  ✓ OK"
    ok=$((ok+1))
  else
    echo "        end:    $(date '+%H:%M:%S')  ✗ FAILED" >&2
    fail=$((fail+1))
  fi
done

echo ""
echo "=============================================================="
echo "剩余 4 个 H3 跑完: $ok / $total OK, $fail 失败"
ls -lh "$OUT_DIR"
echo "=============================================================="
