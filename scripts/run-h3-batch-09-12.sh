#!/usr/bin/env bash
# run-h3-batch-09-12.sh — 跑 09-12 4 个新动作 (pretend-busy / stay-late / friday-5pm / touch-fish)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
H3_DIR="$HOME/.minimax/agents/mavis/skills/h3-dual-image-video-gen"
RUN_H3="$H3_DIR/scripts/run_h3_video.py"

FIRST_FRAME="$ROOT/art/octopus-frames/standard-char-1x1.png"
OUT_DIR="$ROOT/app/public/assets/octopus/_h3-source"

# 4 个新动作
SCENES=(
  "09-pretend-busy:prompts/09-pretend-busy.md:pretend-busy-h3.mp4"
  "10-stay-late:prompts/10-stay-late.md:stay-late-h3.mp4"
  "11-friday-5pm:prompts/11-friday-5pm.md:friday-5pm-h3.mp4"
  "12-touch-fish:prompts/12-touch-fish.md:touch-fish-h3.mp4"
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
echo "4 个 H3 (09-12) 跑完: $ok / $total OK, $fail 失败"
ls -lh "$OUT_DIR"
echo "=============================================================="
