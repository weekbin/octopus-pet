#!/usr/bin/env bash
# spritesheet-builder.sh — build a horizontal spritesheet from f_*.png frames
#
# Per plan §1.9.3 (revised 2026-08-18): 141 frames × cell_size, output 27072×192 default
# (141×192). Each per-scene spritesheet is a single horizontal strip of 141 cells.
#
# Per plan §1.9.1: source = ~/Works/octopus-worker-meme/<scene>/frames-final/f_NNNN.png
# (13/14 scenes use real dir, 06/05/07/09/10/14 use symlinks; symlink-followed find works
# on macOS as long as the path has a trailing slash).
#
# Two modes:
#   1) Single scene:  --input <dir> --output <file> [--cell-size N] [--format webp|png]
#   2) Batch (all 14): --all [--source-root <dir>] [--output-dir <dir>]
#                      [--cell-size N] [--format webp|png]
#
# Defaults: --all uses --source-root ~/Works/octopus-worker-meme
#           and --output-dir <project>/app/public/assets/octopus
#           (project root inferred from this script's path, fall back to $PWD).
#
# Behavior (revised 2026-08-18 to accept RGB reality):
#   - Reads f_*.png in <dir>/, or <dir>/frames-final/ if it exists (real dir or symlink).
#   - Uses `ls -1U` to enumerate frames (more reliable than BSD `find` on macOS symlinks).
#   - Warns (does not fail) when frame count != 141 (was 47 in plan v1).
#   - Fails loudly when frame count == 0 (no input).
#   - Fails loudly when output dimensions don't match N × cell_size.
#   - Alpha handling (V1 reality: 14/14 scenes are RGB, 0/14 RGBA):
#       * All RGBA → output WebP lossless with alpha (plan default).
#       * All RGB  → output WebP lossy q80, no alpha, with the original background.
#       * Mixed    → warn (output as lossy WebP).
#   - Exit 0 on success, non-zero on any failure.
#
# Dependencies: bash, python3 (for alpha probe), magick (preferred) OR convert (ImageMagick).
# Both are tested via `which`; the script does NOT auto-install.

set -euo pipefail

# ---------- paths ----------
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_ROOT="$( cd "$SCRIPT_DIR/.." && pwd )"

# ---------- defaults (revised 2026-08-18) ----------
DEFAULT_CELL_SIZE=192
DEFAULT_FORMAT="webp"
DEFAULT_FRAME_COUNT=141
DEFAULT_SOURCE_ROOT="$HOME/Works/octopus-worker-meme"
DEFAULT_OUTPUT_DIR="$PROJECT_ROOT/app/public/assets/octopus"
DEFAULT_WEBP_QUALITY=80
DEFAULT_ROWS=2   # WebP max dimension = 16383; 141×192=27072 needs 2 rows to fit (71+70 = 13632×384)
WEBP_MAX_DIM=16383

# 14 scene dirs in plan order (§1.9.2 OctopusScene enum ↔ octopus-meme/01..14)
SCENES=(
  "01-pretend-busy"
  "02-stay-late"
  "03-breakdown"
  "04-lying-flat"
  "05-multi-tasking"
  "06-payday"
  "07-salary-rejected"
  "08-treat-milk-tea"
  "09-friday-5pm"
  "10-toilet-slacking"
  "11-touch-fish"
  "12-waiting-m3pro"
  "13-soul-leaving"
  "14-multitask"
)

# ---------- color codes (only when stdout is a TTY) ----------
if [ -t 1 ]; then
  C_RED=$'\033[0;31m'
  C_GREEN=$'\033[0;32m'
  C_YELLOW=$'\033[0;33m'
  C_BLUE=$'\033[0;34m'
  C_BOLD=$'\033[1m'
  C_RESET=$'\033[0m'
else
  C_RED="" C_GREEN="" C_YELLOW="" C_BLUE="" C_BOLD="" C_RESET=""
fi

log_info()  { printf "%s[INFO]%s  %s\n"  "$C_BLUE"   "$C_RESET" "$*"; }
log_ok()    { printf "%s[ OK ]%s  %s\n"  "$C_GREEN"  "$C_RESET" "$*"; }
log_warn()  { printf "%s[WARN]%s  %s\n"  "$C_YELLOW" "$C_RESET" "$*"; }
log_err()   { printf "%s[FAIL]%s  %s\n"  "$C_RED"    "$C_RESET" "$*" >&2; }
section()   { printf "\n%s%s%s\n"        "$C_BOLD"   "$*" "$C_RESET"; }

usage() {
  cat <<'EOF'
Usage:
  scripts/spritesheet-builder.sh --input <scene_dir> --output <file>
                                 [--cell-size N] [--format webp|png]
  scripts/spritesheet-builder.sh --all
                                 [--source-root <dir>]
                                 [--output-dir <dir>]
                                 [--cell-size N] [--format webp|png]

Options:
  --input <dir>         Single scene mode: directory containing f_*.png
                        (or <dir>/frames-final/ if it exists).
  --output <file>       Output spritesheet path (.webp or .png).
  --all                 Batch mode: build spritesheet-*.{webp,png} for all 14
                        scenes from --source-root into --output-dir.
  --source-root <dir>   Root containing 01-pretend-busy/.../14-multitask/
                        (default: ~/Works/octopus-worker-meme).
  --output-dir <dir>    Where spritesheet-<scene>.{ext} files go
                        (default: <project>/app/public/assets/octopus).
  --cell-size N         Cell size in pixels (default: 192). Frames are resized
                        to N×N before stitching.
  --format webp|png     Output format (default: webp). WebP is q80 lossy for
                        RGB scenes, lossless for RGBA scenes. PNG is a fallback.
  --rows N              Grid rows (default: 2). WebP max dimension is 16383;
                        141×192=27072 needs 2 rows to fit (71+70=13632 wide).
                        Cols = ceil(N/rows). Output dim: (cols*cell) × (rows*cell).
                        1 row is auto-used if single-row fits in WEBP_MAX_DIM.
  --rows N              Grid rows (default: 2). WebP max dimension is 16383;
                        141×192=27072 needs 2 rows to fit (71+70=13632 wide).
                        Cols = ceil(N/rows). Output dim: (cols*cell) × (rows*cell).
                        1 row is auto-used if single-row fits in WEBP_MAX_DIM.
  -h, --help            Show this help.

Exit codes:
  0  success
  1  invalid arguments / usage
  2  ImageMagick not found (install with: brew install imagemagick)
  3  input directory missing or empty (no f_*.png)
  4  (reserved — was alpha-required; now warn-only, see V1 reality)
  5  ImageMagick invocation failed
  6  output dimension validation failed
EOF
}

# ---------- detect ImageMagick ----------
detect_magick() {
  if command -v magick >/dev/null 2>&1; then
    echo "magick"
  elif command -v convert >/dev/null 2>&1; then
    echo "convert"
  else
    echo ""
  fi
}

MAGICK_BIN="$(detect_magick)"

# ---------- arg parse ----------
MODE=""
INPUT_DIR=""
OUTPUT_FILE=""
SOURCE_ROOT="$DEFAULT_SOURCE_ROOT"
OUTPUT_DIR="$DEFAULT_OUTPUT_DIR"
CELL_SIZE="$DEFAULT_CELL_SIZE"
FORMAT="$DEFAULT_FORMAT"
ROWS="$DEFAULT_ROWS"

while [ $# -gt 0 ]; do
  case "$1" in
    --input)        INPUT_DIR="${2:-}"; shift 2 ;;
    --output)       OUTPUT_FILE="${2:-}"; shift 2 ;;
    --all)          MODE="all"; shift ;;
    --source-root)  SOURCE_ROOT="${2:-}"; shift 2 ;;
    --output-dir)   OUTPUT_DIR="${2:-}"; shift 2 ;;
    --cell-size)    CELL_SIZE="${2:-}"; shift 2 ;;
    --format)       FORMAT="${2:-}"; shift 2 ;;
    --rows)         ROWS="${2:-}"; shift 2 ;;
    -h|--help)      usage; exit 0 ;;
    *)              log_err "Unknown argument: $1"; usage >&2; exit 1 ;;
  esac
done

# ---------- validate common args ----------
if ! [[ "$CELL_SIZE" =~ ^[0-9]+$ ]] || [ "$CELL_SIZE" -le 0 ]; then
  log_err "--cell-size must be a positive integer, got: $CELL_SIZE"
  exit 1
fi

case "$FORMAT" in
  webp|png) ;;
  *) log_err "--format must be 'webp' or 'png', got: $FORMAT"; exit 1 ;;
esac

if ! [[ "$ROWS" =~ ^[0-9]+$ ]] || [ "$ROWS" -le 0 ]; then
  log_err "--rows must be a positive integer, got: $ROWS"
  exit 1
fi

# ---------- enumerate frames (ls -1U follows symlinks on macOS, more reliable than BSD find) ----------
enumerate_frames() {
  local source_dir="$1"
  # Use ls -1U (unsorted, fastest) with the trailing slash. The trailing slash is
  # critical on macOS: without it, BSD find returns 0 for symlinked dirs (verified 2026-08-18).
  # ls -1U always resolves the symlink target, so it's safer than find here.
  # Output is one path per line.
  ls -1U "${source_dir%/}/"f_*.png 2>/dev/null | sort
}

# ---------- probe alpha mode of a set of frames (returns RGBA / RGB / MIXED) ----------
probe_alpha_mode() {
  local -a frames=( "$@" )
  # Use python3 + Pillow. We sample first, middle, last frame; small N keeps it fast.
  python3 - "${frames[@]}" <<'PYEOF' 2>/dev/null
import sys
from PIL import Image

paths = sys.argv[1:]
sample_idx = {0, len(paths)//2, len(paths)-1} if len(paths) >= 3 else set(range(len(paths)))
modes = set()
for i in sample_idx:
    try:
        with Image.open(paths[i]) as im:
            modes.add("RGBA" if "A" in im.mode else "RGB")
    except Exception as e:
        print(f"ERROR: {e}", file=sys.stderr)
        sys.exit(1)

if len(modes) == 1:
    print(modes.pop())
else:
    print("MIXED")
PYEOF
}

# ---------- single-scene build ----------
run_single() {
  local input_dir="$1"
  local output_file="$2"

  if [ -z "$MAGICK_BIN" ]; then
    log_err "ImageMagick not found. Install with: brew install imagemagick"
    log_err "After install, 'magick' (Homebrew) or 'convert' (elsewhere) must be on PATH."
    exit 2
  fi

  if [ ! -d "$input_dir" ]; then
    log_err "Input directory does not exist: $input_dir"
    exit 3
  fi

  # resolve source dir (frames-final/ if present, else root)
  local source_dir
  if [ -d "$input_dir/frames-final" ]; then
    source_dir="$input_dir/frames-final"
    log_info "Using frames-final/: $source_dir"
  else
    source_dir="$input_dir"
    log_info "Using root dir (no frames-final/): $source_dir"
  fi

  # collect f_*.png sorted
  local -a frames=()
  local f
  while IFS= read -r f; do
    [ -n "$f" ] && frames+=( "$f" )
  done < <(enumerate_frames "$source_dir")

  local n=${#frames[@]}
  if [ "$n" -eq 0 ]; then
    log_err "No f_*.png frames found in: $source_dir"
    log_err "Expected 141 frames numbered f_0001.png..f_0141.png (or any sequential numbering)"
    exit 3
  fi

  log_info "Source: $source_dir"
  log_info "Found $n frame(s)"

  if [ "$n" -ne "$DEFAULT_FRAME_COUNT" ]; then
    log_warn "Frame count is $n, expected $DEFAULT_FRAME_COUNT (per §1.9.3 default)."
    log_warn "Output will be ${n}×${CELL_SIZE} = $((n * CELL_SIZE))×${CELL_SIZE}, not the default $((DEFAULT_FRAME_COUNT * CELL_SIZE))×${CELL_SIZE}."
  fi

  # probe alpha mode (RGBA / RGB / MIXED); V1 reality = all RGB
  local alpha_mode
  alpha_mode=$(probe_alpha_mode "${frames[@]}")
  case "$alpha_mode" in
    RGBA)  log_info "Alpha mode: RGBA → WebP lossless with alpha" ;;
    RGB)   log_info "Alpha mode: RGB  → WebP lossy q${DEFAULT_WEBP_QUALITY} (V1 reality, no alpha)" ;;
    MIXED) log_warn "Alpha mode: MIXED → output as WebP lossy (some frames have alpha, some don't)" ;;
    *)     log_err "Alpha probe failed: $alpha_mode"; exit 3 ;;
  esac

  # build spritesheet
  build_spritesheet "$n" "$CELL_SIZE" "$ROWS" "$FORMAT" "$alpha_mode" "$output_file" "${frames[@]}"

  log_ok "Built $output_file"
}

# ---------- batch build (all 14 scenes) ----------
run_batch() {
  if [ -z "$MAGICK_BIN" ]; then
    log_err "ImageMagick not found. Install with: brew install imagemagick"
    exit 2
  fi

  section "Batch build: 14 scenes"
  log_info "Source root:  $SOURCE_ROOT"
  log_info "Output dir:   $OUTPUT_DIR"
  log_info "Cell size:    ${CELL_SIZE}×${CELL_SIZE}"
  log_info "Format:       $FORMAT"
  log_info "ImageMagick:  $MAGICK_BIN"

  local -a successes=()
  local -a failures=()
  local -a warnings=()
  local total_bytes=0
  local scene_count=${#SCENES[@]}

  local scene dir ext expected_out rc
  ext="$FORMAT"

  for scene in "${SCENES[@]}"; do
    dir="$SOURCE_ROOT/$scene"
    expected_out="$OUTPUT_DIR/spritesheet-${scene}.${ext}"
    printf "\n"
    section "[$scene]"

    if [ ! -d "$dir" ]; then
      log_warn "Scene dir missing, skipping: $dir"
      warnings+=( "$scene:dir-missing" )
      continue
    fi

    # run_single writes to expected_out; capture its exit code without aborting
    set +e
    run_single "$dir" "$expected_out"
    rc=$?
    set -e
    if [ "$rc" -eq 0 ]; then
      successes+=( "$expected_out" )
      if [ -f "$expected_out" ]; then
        local sz
        sz=$(wc -c < "$expected_out" | tr -d ' ')
        total_bytes=$((total_bytes + sz))
      fi
    else
      log_err "Scene failed: $scene (exit $rc)"
      failures+=( "$scene:exit-$rc" )
    fi
  done

  # ---------- summary ----------
  section "Summary"
  local s_count=${#successes[@]}
  local f_count=${#failures[@]}
  local w_count=${#warnings[@]}

  printf "Scenes total:     %d\n" "$scene_count"
  printf "  ✓ produced:     %d\n" "$s_count"
  printf "  ✗ failed:       %d\n" "$f_count"
  printf "  ! warned:       %d\n" "$w_count"
  printf "Total output:     %s bytes (%s)\n" \
    "$total_bytes" "$(human_size "$total_bytes")"
  printf "Output dir:       %s\n" "$OUTPUT_DIR"

  if [ "$f_count" -gt 0 ]; then
    log_err "Batch finished with $f_count failure(s)"
    return 1
  fi

  if [ "$s_count" -eq 0 ]; then
    log_err "Batch produced 0 spritesheets"
    return 1
  fi

  log_ok "Batch finished: $s_count/$scene_count spritesheets"
  return 0
}

# ---------- build the spritesheet ----------
# Uses ImageMagick to (a) resize each frame to cell_size×cell_size, then
# (b) arrange in a `rows × cols` grid. Default 2 rows (WebP max dim is 16383;
# 141 frames at 192px = 27072 wide, doesn't fit in 1 row).
#
# Frame index → grid: row = floor(i / cols), col = i % cols.
#   For 141 frames / 2 rows: cols = ceil(141/2) = 71. Last cell of row 1 is empty
#   (frames 142..141 are missing, but row 1 has cells 0..70, row 2 has cells 71..140).
#
# Output:  (cols * cell) × (rows * cell)  — for 71×2 @ 192 = 13632×384.
build_spritesheet() {
  local n="$1"
  local cell="$2"
  local rows="$3"
  local fmt="$4"
  local alpha_mode="$5"
  local out="$6"
  shift 6
  local -a frames=( "$@" )

  # Compute grid: cols = ceil(n / rows)
  local cols=$(( (n + rows - 1) / rows ))
  local actual_rows
  if [ "$n" -le "$cols" ]; then
    actual_rows=1
  else
    actual_rows=$rows
  fi

  local expected_w=$((cols * cell))
  local expected_h=$((actual_rows * cell))

  # If single-row would fit and user passed --rows 1 (or it would fit), keep it.
  if [ "$n" -le "$cols" ] && [ "$actual_rows" = "1" ]; then
    expected_w=$((n * cell))
  fi

  # WebP dimension safety: if expected_w > WEBP_MAX_DIM, force 2 rows.
  if [ "$expected_w" -gt "$WEBP_MAX_DIM" ] && [ "$rows" = "1" ]; then
    log_warn "Single-row width $expected_w > WebP limit $WEBP_MAX_DIM, switching to 2 rows"
    rows=2
    cols=$(( (n + rows - 1) / rows ))
    expected_w=$((cols * cell))
    expected_h=$((rows * cell))
    actual_rows=2
  fi

  # mkdir for output
  mkdir -p "$(dirname "$out")"

  log_info "Layout: ${actual_rows} rows × ${cols} cols (frame_count=${n}, cell=${cell})"
  log_info "Output dim: ${expected_w}×${expected_h}"

  # Strategy:
  # 1. Build each row as a horizontal strip (magick ... +append row.tiff).
  # 2. Append all rows vertically (magick rows... -append out).
  # Use miff (ImageMagick's intermediate format) for lossless intermediate.
  #
  # We could also use -extent to make uniform row widths, but cell sizes are all
  # equal so all rows have the same width.

  local tmpdir
  tmpdir="$(mktemp -d -t octosheet.XXXXXX)"
  trap "rm -rf '$tmpdir'" EXIT

  local -a row_files=()
  for ((r=0; r<actual_rows; r++)); do
    local row_file="$tmpdir/row_${r}.miff"
    # slice frames[r*cols .. (r+1)*cols - 1]
    local -a row_frames=()
    for ((c=0; c<cols; c++)); do
      local idx=$((r * cols + c))
      if [ "$idx" -lt "$n" ]; then
        row_frames+=( "${frames[$idx]}" )
      fi
    done
    if [ "${#row_frames[@]}" -eq 0 ]; then
      continue
    fi
    log_info "  row $r: ${#row_frames[@]} frame(s) → $row_file"
    if ! "$MAGICK_BIN" "${row_frames[@]}" -resize "${cell}x${cell}" +append "$row_file"; then
      log_err "Failed to build row $r"
      exit 5
    fi
    row_files+=( "$row_file" )
  done

  # If only 1 row, just convert it to the target format.
  if [ "${#row_files[@]}" -eq 1 ]; then
    if ! "${MAGICK_BIN}" "${row_files[0]}" "$out"; then
      log_err "Failed to convert single-row intermediate to $out"
      exit 5
    fi
  else
    # Append rows vertically, then convert to target format.
    if ! "${MAGICK_BIN}" "${row_files[@]}" -append "$tmpdir/combined.miff"; then
      log_err "Failed to append rows vertically"
      exit 5
    fi
    # Now convert combined.miff to target format with format-specific options.
    local -a convert_cmd=( "$MAGICK_BIN" "$tmpdir/combined.miff" )
    case "$fmt" in
      webp)
        case "$alpha_mode" in
          RGBA)
            convert_cmd+=( -define webp:lossless=true -quality 100 )
            ;;
          RGB|MIXED)
            convert_cmd+=( -define webp:lossless=false -quality "$DEFAULT_WEBP_QUALITY" )
            ;;
        esac
        ;;
    esac
    convert_cmd+=( "$out" )
    if ! "${convert_cmd[@]}"; then
      log_err "Failed to write final $out"
      exit 5
    fi
  fi

  # Verify output exists and dimensions match.
  if [ ! -f "$out" ]; then
    log_err "Output not created: $out"
    exit 5
  fi

  local dims actual_w actual_h
  dims=$(read_actual_dimensions "$out")
  actual_w=$(echo "$dims" | awk '{print $1}')
  actual_h=$(echo "$dims" | awk '{print $2}')

  if [ "$actual_w" -ne "$expected_w" ] || [ "$actual_h" -ne "$expected_h" ]; then
    log_err "Output dimensions mismatch: got ${actual_w}×${actual_h}, expected ${expected_w}×${expected_h} (${cols}×${actual_rows} × ${cell})"
    exit 6
  fi

  log_ok "Output dimensions OK: ${actual_w}×${actual_h}"
}

# ---------- read PNG/WEBP dimensions ----------
# Returns "W H" on stdout. Tries `identify` first; falls back to python3 with
# Pillow / PNG-IHDR / WebP-RIFF parsing.
read_actual_dimensions() {
  local file="$1"

  # Try `identify` (works for both PNG and WebP)
  if command -v identify >/dev/null 2>&1; then
    if identify -format "%w %h" "$file" 2>/dev/null >/tmp/.spritesheet-builder-dims-$$; then
      local dims
      dims=$(cat /tmp/.spritesheet-builder-dims-$$ 2>/dev/null)
      rm -f /tmp/.spritesheet-builder-dims-$$
      if [ -n "$dims" ]; then
        echo "$dims"
        return 0
      fi
    fi
  fi

  # Try `magick identify`
  if command -v magick >/dev/null 2>&1; then
    if magick identify -format "%w %h" "$file" 2>/dev/null >/tmp/.spritesheet-builder-dims-$$; then
      local dims
      dims=$(cat /tmp/.spritesheet-builder-dims-$$ 2>/dev/null)
      rm -f /tmp/.spritesheet-builder-dims-$$
      if [ -n "$dims" ]; then
        echo "$dims"
        return 0
      fi
    fi
  fi

  # Python fallback
  python3 - "$file" <<'PYEOF' >/tmp/.spritesheet-builder-dims-$$
import struct
import sys

path = sys.argv[1]
# Try Pillow first
try:
    from PIL import Image
    with Image.open(path) as im:
        print(f"{im.width} {im.height}")
    sys.exit(0)
except Exception:
    pass

# PNG IHDR fallback
with open(path, "rb") as f:
    sig = f.read(8)
    if sig == b"\x89PNG\r\n\x1a\n":
        f.read(4)  # IHDR length
        f.read(4)  # 'IHDR'
        w, h = struct.unpack(">II", f.read(8))
        print(f"{w} {h}")
        sys.exit(0)

# WebP RIFF fallback
with open(path, "rb") as f:
    if f.read(4) == b"RIFF" and f.read(4) == b"WEBP":
        f.read(4)  # 'VP8 '|'VP8L'|'VP8X'
        chunk = f.read(4)
        if chunk == b"VP8 ":
            f.read(10)  # skip to frame header
            w = struct.unpack("<H", f.read(2))[0] & 0x3FFF
            h = struct.unpack("<H", f.read(2))[0] & 0x3FFF
            print(f"{w} {h}")
            sys.exit(0)
        elif chunk == b"VP8L":
            f.read(5)  # signature + length
            b0, b1, b2, b3 = f.read(4)
            w = ((b1 & 0x3F) << 8 | b0) + 1
            h = (((b3 & 0x0F) << 10) | (b2 << 2) | ((b1 & 0xC0) >> 6)) + 1
            print(f"{w} {h}")
            sys.exit(0)
        elif chunk == b"VP8X":
            f.read(8)  # flags + reserved
            w = 1 + (f.read(3)[0] | (f.read(1)[0] << 8) | (f.read(1)[0] << 16))
            h = 1 + (f.read(3)[0] | (f.read(1)[0] << 8) | (f.read(1)[0] << 16))
            print(f"{w} {h}")
            sys.exit(0)

print("0 0", file=sys.stderr)
sys.exit(1)
PYEOF
  local dims
  dims=$(cat /tmp/.spritesheet-builder-dims-$$ 2>/dev/null)
  rm -f /tmp/.spritesheet-builder-dims-$$
  if [ -n "$dims" ]; then
    echo "$dims"
    return 0
  fi
  echo "0 0"
  return 1
}

human_size() {
  local b=$1
  if   [ "$b" -ge 1048576 ]; then
    python3 -c "print(f'{${b}/1048576:.1f} MB')"
  elif [ "$b" -ge 1024 ];    then
    python3 -c "print(f'{${b}/1024:.1f} KB')"
  else
    printf "%d B\n" "$b"
  fi
}

# ---------- dispatch mode (must be at the end, after all function defs) ----------
if [ "$MODE" = "all" ]; then
  if [ -n "$INPUT_DIR" ] || [ -n "$OUTPUT_FILE" ]; then
    log_err "--all cannot be combined with --input / --output"
    exit 1
  fi
  if [ ! -d "$SOURCE_ROOT" ]; then
    log_err "--source-root not found: $SOURCE_ROOT"
    exit 3
  fi
  mkdir -p "$OUTPUT_DIR"
  run_batch
else
  if [ -z "$INPUT_DIR" ] || [ -z "$OUTPUT_FILE" ]; then
    log_err "single-scene mode requires --input <dir> and --output <file>"
    usage >&2
    exit 1
  fi
  run_single "$INPUT_DIR" "$OUTPUT_FILE"
fi
