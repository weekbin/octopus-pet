#!/usr/bin/env bash
# extract-and-link-octopus-frames.sh — Bring 14/14 scenes to standard frames-final/ path.
#
# Two operations (verified 2026-08-18):
#   1. ffmpeg extract 141 frames @ 24fps from <scene>/video.mp4 → <scene>/frames-final/f_0001.png ~ f_0141.png
#      for the 4 scenes that only have video (no PNG): 01-pretend-busy, 02-stay-late, 03-breakdown, 04-lying-flat
#   2. Symlink archive frames to <scene>/frames-final/ for the 5 scenes whose PNGs live in archive/:
#      - 05-multi-tasking: archive/05-multi-tasking/frames-final/
#      - 07-salary-rejected: archive/07-salary-rejected/frames/frames-final/
#      - 09-friday-5pm: archive/09-friday-5pm/frames/frames-final/
#      - 10-toilet-slacking: archive/10-toilet-slacking/frames/frames-final/
#      - 14-multitask: archive/14-multitask/frames/frames-final/
#      (06-payday is already a symlink to archive/06-payday/frames/frames-final/ — no work needed.)
#
# Idempotent: re-running is safe. Existing frames-final/ is checked; if it already has 141 frames
# we skip the extract; if symlink target already points to the right archive dir, we skip.
#
# Exit codes:
#   0  ok
#   1  source root not accessible
#   2  ffmpeg missing
#
# Usage:
#   scripts/extract-and-link-octopus-frames.sh
#   OCTOPUS_SOURCE_ROOT=~/Works/octopus-worker-meme scripts/extract-and-link-octopus-frames.sh

set -euo pipefail

SOURCE_ROOT="${OCTOPUS_SOURCE_ROOT:-$HOME/Works/octopus-worker-meme}"

if [ ! -d "$SOURCE_ROOT" ]; then
  echo "ERROR: source root not found: $SOURCE_ROOT" >&2
  exit 1
fi

if ! command -v ffmpeg >/dev/null 2>&1; then
  echo "ERROR: ffmpeg not in PATH (needed for 01-04 video extraction)" >&2
  exit 2
fi

cd "$SOURCE_ROOT"

# ===== OP 1: ffmpeg extract 141 frames for 01-04 =====
EXTRACT_SCENES=(
  "01-pretend-busy"
  "02-stay-late"
  "03-breakdown"
  "04-lying-flat"
)

echo "============================================="
echo "OP 1: ffmpeg extract 141 frames for 01-04"
echo "============================================="
for scene in "${EXTRACT_SCENES[@]}"; do
  video="$scene/video.mp4"
  out_dir="$scene/frames-final"

  if [ ! -f "$video" ]; then
    echo "  [SKIP] $scene — no video.mp4"
    continue
  fi

  if [ -d "$out_dir" ]; then
    existing=$(ls -1 "$out_dir"/f_*.png 2>/dev/null | wc -l | tr -d ' ')
    if [ "$existing" = "141" ]; then
      echo "  [SKIP] $scene — frames-final/ already has 141 frames"
      continue
    fi
    echo "  [WARN] $scene — frames-final/ has $existing frames, re-extracting"
    /bin/rm -rf "$out_dir"
  fi

  mkdir -p "$out_dir"
  echo "  [EXTRACT] $scene/video.mp4 → $out_dir/f_%04d.png (141 frames @ 24fps, 720×720)"
  # -start_number 1 so ffmpeg writes f_0001.png first frame.
  # -vf scale=720:720 downscales the 1080×1080 source to match the other 10 scenes.
  # PNG codec preserves quality; default RGB since source is yuv420p.
  # -frames:v 141 caps the output to exactly 141 frames.
  ffmpeg -y -i "$video" -vf "scale=720:720" -start_number 1 -frames:v 141 "$out_dir/f_%04d.png" \
    >/dev/null 2>&1

  extracted=$(ls -1 "$out_dir"/f_*.png 2>/dev/null | wc -l | tr -d ' ')
  echo "            → $extracted frames written"
done

# ===== OP 2: symlink 5 archive scenes to standard path =====
# Map: scene_dir → archive_subpath
LINK_SCENES=(
  "05-multi-tasking:frames-final"
  "07-salary-rejected:frames/frames-final"
  "09-friday-5pm:frames/frames-final"
  "10-toilet-slacking:frames/frames-final"
  "14-multitask:frames/frames-final"
)

echo ""
echo "============================================="
echo "OP 2: symlink 5 archive scenes to <scene>/frames-final/"
echo "============================================="
for entry in "${LINK_SCENES[@]}"; do
  IFS=':' read -r scene archive_subpath <<< "$entry"
  target="$SOURCE_ROOT/archive/$scene/$archive_subpath"
  link="$SOURCE_ROOT/$scene/frames-final"

  if [ ! -d "$target" ]; then
    echo "  [FAIL] $scene — archive target missing: $target"
    continue
  fi

  # Count target frames
  target_count=$(ls -1 "$target"/f_*.png 2>/dev/null | wc -l | tr -d ' ')

  if [ -L "$link" ]; then
    existing_target=$(readlink "$link")
    expected="../archive/$scene/$archive_subpath"
    if [ "$existing_target" = "$expected" ]; then
      echo "  [SKIP] $scene — symlink already correct → $existing_target ($target_count frames)"
      continue
    fi
    echo "  [REPAIR] $scene — symlink points to $existing_target, expected $expected"
    /bin/rm "$link"
  elif [ -d "$link" ]; then
    # Real dir already exists at standard path (e.g. user pre-staged it). Skip.
    real_count=$(ls -1 "$link"/f_*.png 2>/dev/null | wc -l | tr -d ' ')
    echo "  [SKIP] $scene — real dir already at standard path ($real_count frames)"
    continue
  fi

  # Create relative symlink (../archive/...) so it survives repo moves.
  expected="../archive/$scene/$archive_subpath"
  ln -s "$expected" "$link"
  echo "  [LINK]  $scene/frames-final → $expected ($target_count frames)"
done

echo ""
echo "============================================="
echo "DONE — re-run audit to verify 14/14 STANDARD"
echo "============================================="
