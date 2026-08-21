#!/usr/bin/env bash
# encode-webm-alpha.sh — encode a PNG sequence into a WebM with alpha channel
#
# Purpose: turn a folder of RGBA PNG frames (e.g. f_001.png ... f_141.png) into a
# VP9-encoded WebM with a real alpha plane. Used by V2.2 (green-screen pipeline)
# when frame count is high (>50) and APNG file size would be >1MB.
#
# V1 default pipeline is APNG (Pillow), but VP9 alpha is ~14-28x smaller for the
# same content — useful for long action clips.
#
# Why ffmpeg-full, not system ffmpeg:
# - Homebrew `ffmpeg` (standard build) links against a libvpx that does NOT
#   expose the VP9 alpha encoding runtime symbols.
# - Homebrew `ffmpeg-full` (keg-only, 47 deps) bundles a libvpx that DOES.
# - Verification:
#     ffmpeg -codecs | grep vp9   # standard: no 'A' flag (misleading)
#     ffmpeg -h encoder=libvpx-vp9 | grep yuva   # full: yuva420p yuva422p ... present
# - The truth is the TAG:alpha_mode=1 in `ffprobe -show_streams <file>.webm`.
#   `ffprobe` without -show_streams hides the alpha_mode tag by default.
#
# Usage:
#   scripts/encode-webm-alpha.sh --input <frame_dir> --output <file.webm>
#                                [--framerate 30] [--bitrate 500k] [--pattern "f_%04d.png"]
#
# Options:
#   --input <dir>           Directory containing PNG frames (default pattern: f_%04d.png).
#   --output <file>         Output .webm path (parent dir auto-created).
#   --framerate N           Frames per second (default: 30).
#   --bitrate N             Target video bitrate (default: 500k). Higher = better alpha fidelity.
#   --pattern "f_%04d.png"  Filename pattern inside --input. Default expects f_0001.png f_0002.png ...
#                           Set to "frame_%02d.png" for 2-digit, "%d.png" for plain.
#   --no-verify             Skip the post-encode alpha_mode=1 verification (NOT recommended).
#   -h, --help              Show this help.
#
# Exit codes:
#   0  success (alpha verified)
#   1  missing dependency or invalid args
#   2  ffmpeg encode failed
#   3  alpha verification failed (encode OK but alpha_mode=1 missing)
#
# Dependencies:
#   - ffmpeg-full (Homebrew, keg-only) — auto-located, NOT on PATH by default.
#   - ffprobe  (same install as ffmpeg-full).
#
# Setup (one-time):
#   brew install ffmpeg-full
#   # Add to ~/.zshrc for interactive shells:
#   #   export PATH="/opt/homebrew/opt/ffmpeg-full/bin:$PATH"
#   # This script finds the binary by Cellar glob, so PATH change is optional.

set -euo pipefail

# ---------- paths ----------
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_ROOT="$( cd "$SCRIPT_DIR/.." && pwd )"

# ---------- defaults ----------
DEFAULT_FRAMERATE=30
DEFAULT_BITRATE=500k
DEFAULT_PATTERN="f_%04d.png"
FFMPEG_FULL_CELLAR_GLOB="/opt/homebrew/Cellar/ffmpeg-full/*/bin/ffmpeg"
FFPROBE_FULL_CELLAR_GLOB="/opt/homebrew/Cellar/ffmpeg-full/*/bin/ffprobe"

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

# ---------- usage ----------
usage() {
  cat <<'EOF'
Usage:
  scripts/encode-webm-alpha.sh --input <frame_dir> --output <file.webm>
                               [--framerate 30] [--bitrate 500k] [--pattern "f_%04d.png"]

Encode a sequence of RGBA PNG frames into a VP9 WebM with real alpha channel.

Options:
  --input <dir>           Directory containing PNG frames.
  --output <file>         Output .webm path (parent dir auto-created).
  --framerate N           Frames per second (default: 30).
  --bitrate N             Target bitrate (default: 500k). Higher = better alpha fidelity.
  --pattern "f_%04d.png"  Filename pattern (default: f_0001.png f_0002.png ...).
  --no-verify             Skip post-encode alpha_mode=1 verification.
  -h, --help              Show this help.

Exit codes:
  0  success (alpha verified)
  1  bad args / missing dep
  2  ffmpeg encode failed
  3  alpha verification failed (encode OK but no alpha plane)

Example:
  scripts/encode-webm-alpha.sh \
    --input art/breath-video/frames/ \
    --output app/public/assets/octopus/breath-idle.webm \
    --framerate 12 --bitrate 300k
EOF
}

# ---------- locate ffmpeg-full ----------
# keg-only: not on $PATH. Glob the Cellar to find the latest version.
locate_ffmpeg_full() {
  # Prefer the keg-linked opt path (cleaner, version-pinned via Homebrew).
  if [ -x "/opt/homebrew/opt/ffmpeg-full/bin/ffmpeg" ]; then
    FFMPEG_BIN="/opt/homebrew/opt/ffmpeg-full/bin/ffmpeg"
    FFPROBE_BIN="/opt/homebrew/opt/ffmpeg-full/bin/ffprobe"
    return 0
  fi
  # Fall back to Cellar glob (in case opt symlink was removed).
  local ffmpeg_path
  ffmpeg_path=$(ls -d $FFMPEG_FULL_CELLAR_GLOB 2>/dev/null | sort -V | tail -1 || true)
  if [ -z "$ffmpeg_path" ] || [ ! -x "$ffmpeg_path" ]; then
    return 1
  fi
  FFMPEG_BIN="$ffmpeg_path"
  # Derive ffprobe path from ffmpeg path (same version dir).
  FFPROBE_BIN="$(dirname "$ffmpeg_path")/ffprobe"
  if [ ! -x "$FFPROBE_BIN" ]; then
    return 1
  fi
  return 0
}

# ---------- arg parse ----------
INPUT_DIR=""
OUTPUT_FILE=""
FRAMERATE="$DEFAULT_FRAMERATE"
BITRATE="$DEFAULT_BITRATE"
PATTERN="$DEFAULT_PATTERN"
VERIFY=1

while [ $# -gt 0 ]; do
  case "$1" in
    --input)     INPUT_DIR="$2"; shift 2 ;;
    --output)    OUTPUT_FILE="$2"; shift 2 ;;
    --framerate) FRAMERATE="$2"; shift 2 ;;
    --bitrate)   BITRATE="$2"; shift 2 ;;
    --pattern)   PATTERN="$2"; shift 2 ;;
    --no-verify) VERIFY=0; shift ;;
    -h|--help)   usage; exit 0 ;;
    *) log_err "Unknown arg: $1"; usage >&2; exit 1 ;;
  esac
done

# ---------- validate ----------
if [ -z "$INPUT_DIR" ] || [ -z "$OUTPUT_FILE" ]; then
  log_err "Both --input and --output are required."
  usage >&2
  exit 1
fi

if [ ! -d "$INPUT_DIR" ]; then
  log_err "--input is not a directory: $INPUT_DIR"
  exit 1
fi

# Resolve input dir to absolute (so ffmpeg's pattern lookup is unambiguous).
INPUT_DIR="$(cd "$INPUT_DIR" && pwd)"

# Check at least one matching frame exists.
if ! ls "$INPUT_DIR"/$(echo "$PATTERN" | sed 's/%0[0-9]*d/*/') >/dev/null 2>&1; then
  log_err "No files matching pattern '$PATTERN' in $INPUT_DIR"
  exit 1
fi

# Locate ffmpeg-full.
if ! locate_ffmpeg_full; then
  log_err "ffmpeg-full not found. Install with: brew install ffmpeg-full"
  log_err "Then either add /opt/homebrew/opt/ffmpeg-full/bin to PATH, or let this script auto-locate it via the Cellar glob."
  exit 1
fi
log_info "Using ffmpeg-full: $FFMPEG_BIN"

# Sanity-check: ffmpeg-full's libvpx-vp9 encoder must list alpha pixel formats.
# This catches the case where someone has ffmpeg-full installed but on a system
# where the alpha path is broken (e.g. wrong arch, broken libvpx).
if ! "$FFMPEG_BIN" -h encoder=libvpx-vp9 2>&1 | grep -q "yuva420p"; then
  log_err "ffmpeg-full at $FFMPEG_BIN does NOT list 'yuva420p' in libvpx-vp9 encoder help."
  log_err "VP9 alpha encoding is unavailable — check your ffmpeg-full install."
  exit 1
fi

# Ensure output dir exists.
OUTPUT_DIR="$(dirname "$OUTPUT_FILE")"
mkdir -p "$OUTPUT_DIR"
OUTPUT_FILE="$(cd "$(dirname "$OUTPUT_FILE")" && pwd)/$(basename "$OUTPUT_FILE")"

# ---------- encode ----------
section "Encoding WebM with alpha"
log_info "input  : $INPUT_DIR/$PATTERN"
log_info "output : $OUTPUT_FILE"
log_info "params : framerate=$FRAMERATE bitrate=$BITRATE"

# -auto-alt-ref 0: disable alt-ref frames (otherwise ffmpeg may try to reference
#   frames across the cycle boundary and break the loop seam).
# -pix_fmt yuva420p: 4:2:0 + alpha (most compatible; webm alpha spec).
ENCODE_LOG=$(mktemp -t encode-webm-alpha.XXXXXX.log)
trap 'rm -f "$ENCODE_LOG"' EXIT

if ! "$FFMPEG_BIN" -y \
      -framerate "$FRAMERATE" \
      -i "$INPUT_DIR/$PATTERN" \
      -c:v libvpx-vp9 \
      -pix_fmt yuva420p \
      -b:v "$BITRATE" \
      -auto-alt-ref 0 \
      "$OUTPUT_FILE" \
      > "$ENCODE_LOG" 2>&1; then
  log_err "ffmpeg encode failed. Tail of log:"
  tail -20 "$ENCODE_LOG" >&2
  exit 2
fi

log_ok "ffmpeg encode succeeded"
if [ -t 1 ]; then
  # Show concise info line.
  "$FFPROBE_BIN" -v quiet -show_entries format=size,duration,bit_rate -of default=nw=1 "$OUTPUT_FILE" | sed 's/^/  /' || true
fi

# ---------- verify alpha ----------
if [ "$VERIFY" -eq 1 ]; then
  section "Verifying alpha channel"
  # Truth source: TAG:alpha_mode=1 in ffprobe -show_streams.
  # Without -show_streams, ffprobe hides this tag and reports pix_fmt=yuv420p
  # (misleading — the alpha plane is in a separate VP9 frame buffer).
  if ! "$FFPROBE_BIN" -v quiet -show_streams "$OUTPUT_FILE" 2>/dev/null \
       | grep -q "TAG:alpha_mode=1"; then
    log_err "alpha verification FAILED — TAG:alpha_mode=1 not found in stream metadata."
    log_err "This means the encoder silently dropped the alpha plane."
    log_err "File size: $(du -h "$OUTPUT_FILE" | cut -f1)"
    log_err "Try a higher --bitrate (e.g. --bitrate 1M) and re-run."
    exit 3
  fi
  log_ok "alpha_mode=1 confirmed (alpha plane present in VP9 frame)"
else
  log_warn "alpha verification SKIPPED (--no-verify). Verify manually with:"
  log_warn "  $FFPROBE_BIN -show_streams $OUTPUT_FILE | grep alpha"
fi

# ---------- summary ----------
section "Done"
log_ok "Encoded: $OUTPUT_FILE"
log_info "size    : $(du -h "$OUTPUT_FILE" | cut -f1)"
log_info "alpha   : verified ✅ (TAG:alpha_mode=1)"
log_info "format  : VP9 in WebM (yuva420p, libvpx-vp9 via ffmpeg-full)"
log_info ""
log_info "To preview in the pet:"
log_info "  1. Copy the file to app/public/assets/octopus/<name>.webm"
log_info "  2. Update OctopusPet.tsx to use <video src=\"...\" autoplay loop muted playsInline />"
log_info "  3. For the idle loop, ensure the WebM is a true loop (first frame = last frame)."
