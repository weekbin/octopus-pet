#!/usr/bin/env bash
# run-h3-batch.sh — 批量跑 H3 双图模式生成桌宠动作视频
#
# 用法: bash scripts/run-h3-batch.sh
# 输出: app/public/assets/octopus/_h3-source/<scene>-h3.mp4
# 依赖: ~/.minimax/agents/mavis/skills/h3-dual-image-video-gen/scripts/run_h3_video.py
#       mcode-tools CLI
#       art/octopus-frames/standard-char-1x1.png (V2.1 标准图)
#
# 5 个动作: 04-breakdown / 05-payday / 06-treat-milk-tea / 07-soul-leaving / 08-lying-flat
# 每个 5-8 分钟 (1-3 分钟 H3 + 下载 + 验证), 总 25-40 分钟
# 跑完后给明天 GPU 机器 matting 用

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
H3_DIR="$HOME/.minimax/agents/mavis/skills/h3-dual-image-video-gen"
RUN_H3="$H3_DIR/scripts/run_h3_video.py"
VERIFY_H3="$H3_DIR/scripts/verify_h3_video.py"

FIRST_FRAME="$ROOT/art/octopus-frames/standard-char-1x1.png"
OUT_DIR="$ROOT/app/public/assets/octopus/_h3-source"

# 5 个动作: <scene-id>:<prompt-file>:<expected-mp4-output>
SCENES=(
  "04-breakdown:prompts/04-breakdown.md:breakdown-h3.mp4"
  "05-payday:prompts/05-payday.md:payday-h3.mp4"
  "06-treat-milk-tea:prompts/06-treat-milk-tea.md:treat-milk-tea-h3.mp4"
  "07-soul-leaving:prompts/07-soul-leaving.md:soul-leaving-h3.mp4"
  "08-lying-flat:prompts/08-lying-flat.md:lying-flat-h3.mp4"
)

mkdir -p "$OUT_DIR"

# 检查依赖
for f in "$FIRST_FRAME" "$RUN_H3" "$VERIFY_H3"; do
  if [ ! -f "$f" ]; then
    echo "ERROR: missing $f" >&2
    exit 1
  fi
done
if ! command -v mcode-tools >/dev/null 2>&1; then
  echo "ERROR: mcode-tools not in PATH" >&2
  exit 1
fi

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

  if [ ! -f "$prompt_path" ]; then
    echo "[$i/$total] SKIP $id (missing $prompt_file)"
    fail=$((fail+1))
    continue
  fi

  echo ""
  echo "=============================================================="
  echo "[$i/$total] $id → $mp4_name"
  echo "        prompt: $prompt_file"
  echo "        output: $output"
  echo "        start:  $(date '+%H:%M:%S')"
  echo "=============================================================="

  # 读 prompt 文件
  prompt_content=$(cat "$prompt_path")

  # 跑 H3
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
echo "H3 batch 完成: $ok / $total 成功, $fail 失败"
echo "输出: $OUT_DIR"
ls -lh "$OUT_DIR"
echo "=============================================================="
