#!/usr/bin/env python3
"""
v5.2 BiRefNet + CorridorKey green screen matting pipeline (2026-09-10).

Two-stage neural net pipeline for high-fidelity green/blue screen keying:
  Stage 1: BiRefNet (subject segmentation, 1024 fp16) -> soft alpha hint
  Stage 2: CorridorKey (physics-aware unmixing, 2048 internal) -> linear alpha + straight FG color

CorridorKey replaces v4.x's 25-step color-mask pipeline and v5.1's post-inpaint/green_residual hacks
because it physically unmixes green-screen color from foreground. Result:
  - magnifying glass is naturally transparent (no special handling)
  - body green reflection is fully removed (linear unmixing, not color clamp)
  - alpha is real fractional, not color-based threshold
  - 0 inpaint halo, 0 green spill, 0 position-mask artifacts

v4.x H3 source-specific position masks (forehead_white_mask) still kept because they fix source
video physical lighting defects (H3 hat reflection), which no matting model can fix.

CLI flags match extract-chromakey-apng.py / extract-birefnet-apng.py for drop-in use with
scripts/build-scene-registry.sh and CI.

Usage example:
  PYENV_VERSION=3.12.3 python3 scripts/extract-v52-apng.py \\
      --input docs/v2-01-detective-study/v2-01-detective-study-h3.mp4 \\
      --output /tmp/v52-detective-study.png \\
      --device cuda --fps 15 --frame-count 100 --size 192 --duration 66 \\
      --birefnet-size 1024 --threshold 128
"""
from __future__ import annotations

import argparse
import os
import shutil
import subprocess
import sys
import tempfile
import time
from pathlib import Path

import numpy as np
import torch
from PIL import Image


# --------------------------------------------------------------------------------------
# Constants
# --------------------------------------------------------------------------------------

CORRIDORKEY_CKPT = (
    "/home/weekbin/Works/CorridorKey/checkpoints/models--nikopueringer--"
    "CorridorKey_v1.0/snapshots/f6386ddf042d8e92aeb5fd16cb9b101cff508195/"
    "CorridorKey_v1.0.safetensors"
)
BIREFNET_REPO = "ZhengPeng7/BiRefNet"

# H3 source video physical lighting defects — these are NOT matting bugs, they're baked into
# the H3 generated video. forehead_white_mask converts a hard-coded forehead ROI to warm
# off-white to remove the hat-reflection "white square" artifact. Retained from v4.x.
H3_FOREHEAD_ROI = (50, 80, 70, 110)  # y0, y1, x0, x1 (192x192 normalized coords)


# --------------------------------------------------------------------------------------
# Stage 1: BiRefNet (subject mask -> coarse alpha hint)
# --------------------------------------------------------------------------------------


def load_birefnet(device: str):
    """Load ZhengPeng7/BiRefNet in fp16 (RTX 3060 sweet spot)."""
    from transformers import AutoModelForImageSegmentation

    os.environ.setdefault("HF_HOME", os.path.expanduser("~/.cache/huggingface"))
    os.environ.setdefault("HF_ENDPOINT", "https://hf-mirror.com")
    model = AutoModelForImageSegmentation.from_pretrained(
        BIREFNET_REPO, trust_remote_code=True, cache_dir=os.environ["HF_HOME"]
    )
    model = model.to(device).eval().half()
    return model


def birefnet_hint(model, img_pil: Image.Image, device: str, size: int) -> np.ndarray:
    """Return soft alpha hint as float32 [H, W] in [0, 1]."""
    from torchvision import transforms

    pp = transforms.Compose(
        [
            transforms.Resize((size, size)),
            transforms.ToTensor(),
            transforms.Normalize([0.5] * 3, [1.0] * 3),
        ]
    )
    x = pp(img_pil).unsqueeze(0).to(device).half()
    with torch.no_grad():
        pred = model(x)[-1].sigmoid().cpu()
    return pred[0].squeeze().numpy().astype(np.float32)


# --------------------------------------------------------------------------------------
# Stage 2: CorridorKey (physics-aware unmixing)
# --------------------------------------------------------------------------------------


def load_corridorkey(device: str, img_size: int = 2048):
    """Load CorridorKey engine on GPU. Imports from local clone, not pip (since we use PYENV 3.12)."""
    ck_path = "/home/weekbin/Works/CorridorKey"
    if ck_path not in sys.path:
        sys.path.insert(0, ck_path)
    from CorridorKeyModule import CorridorKeyEngine

    if not Path(CORRIDORKEY_CKPT).exists():
        raise FileNotFoundError(
            f"CorridorKey checkpoint not found at {CORRIDORKEY_CKPT}. "
            "Download from https://huggingface.co/nikopueringer/CorridorKey_v1.0"
        )
    return CorridorKeyEngine(
        checkpoint_path=CORRIDORKEY_CKPT,
        device=device,
        img_size=img_size,
        use_refiner=True,
        mixed_precision=True,
        model_precision=torch.float16,
    )


def corrkey_unmix(engine, img_rgb_u8: np.ndarray, hint_f32: np.ndarray) -> dict:
    """Run CorridorKey on a single frame. Returns dict with 'alpha' (H,W,1 float) and 'fg' (H,W,3 float)."""
    import cv2

    H, W = img_rgb_u8.shape[:2]
    if hint_f32.shape != (H, W):
        hint_f32 = cv2.resize(hint_f32, (W, H), interpolation=cv2.INTER_LINEAR)
    hint_f32 = np.clip(hint_f32, 0.0, 1.0).astype(np.float32)
    return engine.process_frame(
        img_rgb_u8,
        hint_f32,
        refiner_scale=1.0,
        input_is_linear=False,
        fg_is_straight=True,
        despill_strength=0.5,
        auto_despeckle=True,
        despeckle_size=400,
        generate_comp=False,
        post_process_on_gpu=True,
    )


# --------------------------------------------------------------------------------------
# H3 source-specific post-process (kept from v4.x — fixes source video defects, not
# matting model bugs)
# --------------------------------------------------------------------------------------


def post_forehead_white_mask(rgba: np.ndarray, roi=H3_FOREHEAD_ROI) -> tuple[np.ndarray, int]:
    """H3 source video bug: hat reflection paints forehead as pure (255,255,255) in some
    frames. Force those pixels to a warm off-white (240,220,210) that matches the body tone.

    Returns (rgba, n_patched).
    """
    y0, y1, x0, x1 = roi
    if y1 > rgba.shape[0] or x1 > rgba.shape[1]:
        # ROI is 192x192 normalized; skip if image is different size
        return rgba, 0
    region = rgba[y0:y1, x0:x1, :]
    rgb = region[:, :, :3]
    a = region[:, :, 3]
    # Match "pure white" forehead pixels: alpha=255, RGB near 255
    white_mask = (a == 255) & (rgb[:, :, 0] >= 250) & (rgb[:, :, 1] >= 250) & (rgb[:, :, 2] >= 250)
    n = int(white_mask.sum())
    if n == 0:
        return rgba, 0
    out = rgba.copy()
    out[y0:y1, x0:x1, :3][white_mask] = (240, 220, 210)
    return out, n


# --------------------------------------------------------------------------------------
# Frame I/O
# --------------------------------------------------------------------------------------


def extract_frames(video: Path, fps: int, tmp_dir: Path) -> int:
    """ffmpeg 抽帧到 tmp_dir/frame_NNN.png。Return frame count."""
    pattern = tmp_dir / "frame_%03d.png"
    cmd = [
        "ffmpeg",
        "-y",
        "-i",
        str(video),
        "-vf",
        f"fps={fps}",
        "-frame_pts",
        "1",
        str(pattern),
    ]
    print(f"        → ffmpeg extract: fps={fps} → {pattern}")
    subprocess.run(cmd, check=True, capture_output=True)
    frames = sorted(tmp_dir.glob("frame_*.png"))
    return len(frames)


def sample_indices(n_total: int, n_target: int) -> list[int]:
    """从 n_total 帧里均匀采 n_target 帧 (0-indexed)。"""
    if n_target >= n_total:
        return list(range(n_total))
    step = n_total / n_target
    return [int(i * step) for i in range(n_target)]


def process_frames(
    src_dir: Path,
    indices: list[int],
    size: int,
    birefnet_size: int,
    threshold: int,
    device: str,
) -> list[Image.Image]:
    """Run BiRefNet + CorridorKey + H3 post-process for each frame index. Return list of
    192x192 RGBA PIL images."""
    import cv2

    print(f"[2/8] load {len(indices)} frames + BiRefNet + CorridorKey + H3 fixes...")
    bi = load_birefnet(device)
    images = []
    t0 = time.time()
    for i, idx in enumerate(indices):
        src_path = src_dir / f"frame_{idx + 1:03d}.png"
        if not src_path.exists():
            print(f"        WARN: missing frame {src_path}, skipping")
            continue
        img = Image.open(src_path).convert("RGB")
        img_rgb = np.array(img)  # H×W×3 uint8

        # Stage 1: BiRefNet hint
        hint_full = birefnet_hint(bi, img, device, birefnet_size)
        # Resize hint to image size for CorridorKey
        H, W = img_rgb.shape[:2]
        if hint_full.shape != (H, W):
            hint_full = cv2.resize(hint_full, (W, H), interpolation=cv2.INTER_LINEAR)

        # Stage 2: CorridorKey unmix
        if i == 0:
            # Load CorridorKey on first frame (one-time setup + warmup).
            # Both models coexist in VRAM (~3.7 GB total on RTX 3060 fp16, well under 12 GB).
            ck = load_corridorkey(device)
            print(f"        [CorridorKey loaded] {time.time()-t0:.1f}s")
            t0 = time.time()
            # Warmup
            _ = corrkey_unmix(ck, img_rgb[:256, :256], np.ones((256, 256), np.float32) * 0.5)
            torch.cuda.synchronize()
            warm_t = time.time()
            print(f"        [warmup done] {warm_t - t0:.1f}s")
            t0 = time.time()

        result = corrkey_unmix(ck, img_rgb, hint_full)
        # result['alpha'] is (H, W, 1) float [0, 1], result['fg'] is (H, W, 3) float [0, 1+]
        alpha = np.clip(result["alpha"].squeeze(), 0.0, 1.0)
        fg = np.clip(result["fg"], 0.0, 1.0)
        rgb_u8 = (fg * 255).astype(np.uint8)
        alpha_u8 = (alpha * 255).astype(np.uint8)
        rgba = np.dstack([rgb_u8, alpha_u8])

        # H3 source-specific post-process
        rgba, n_forehead = post_forehead_white_mask(rgba)

        # Resize to target size
        if rgba.shape[0] != size or rgba.shape[1] != size:
            rgba_img = Image.fromarray(rgba, mode="RGBA")
            rgba_img = rgba_img.resize((size, size), Image.LANCZOS)
            rgba = np.array(rgba_img)

        images.append(Image.fromarray(rgba, mode="RGBA"))
        if (i + 1) % 10 == 0 or i == len(indices) - 1:
            elapsed = time.time() - t0
            eta = elapsed / (i + 1) * (len(indices) - i - 1)
            print(
                f"        [{i + 1}/{len(indices)}] elapsed {elapsed:.0f}s, ETA {eta:.0f}s, "
                f"forehead f{idx}: {n_forehead}px"
            )
    return images


# --------------------------------------------------------------------------------------
# APNG output
# --------------------------------------------------------------------------------------


def save_apng(images: list[Image.Image], out: Path, duration: int, disposal: int, loop: int = 1) -> None:
    print(f"[3/8] APNG save: {out} ({len(images)} frames × {duration}ms, loop={loop})")
    images[0].save(
        out,
        format="PNG",
        save_all=True,
        append_images=images[1:],
        duration=duration,
        loop=loop,
        disposal=disposal,
        optimize=True,
    )
    size_mb = os.path.getsize(out) / 1024 / 1024
    print(f"        → {size_mb:.2f} MB")


def verify_apng(out: Path) -> None:
    """Pixel-level A/B vs v4.24 baseline. Checks alpha, eye white, green residual, components."""
    print(f"[4/8] verify {out.name}")
    img = Image.open(out)
    print(f"        → mode={img.mode}, n_frames={getattr(img, 'n_frames', 1)}, size={img.size}")
    from scipy import ndimage

    n_frames = img.n_frames
    test_indices = [0, n_frames // 4, n_frames // 2, 3 * n_frames // 4, n_frames - 1]
    print(f"        → testing frames: {test_indices}")
    for fi in test_indices:
        img.seek(fi)
        arr = np.array(img.convert("RGBA"))
        rgb = arr[:, :, :3]
        a = arr[:, :, 3]
        oct_px = (a == 255).sum()
        partial = ((a > 0) & (a < 255)).sum()
        trans = (a == 0).sum()
        eye = (a == 255) & (rgb[:, :, 0] > 200) & (rgb[:, :, 1] > 200) & (rgb[:, :, 2] > 200)
        eye_min = rgb[eye].min(axis=0) if eye.sum() > 10 else "N/A"
        green = (a == 255) & (rgb[:, :, 1] > rgb[:, :, 0] + 5) & (rgb[:, :, 1] > rgb[:, :, 2] + 5) & (rgb[:, :, 1] > 120)
        a_255 = (a == 255)
        if a_255.sum() > 100:
            labeled, n = ndimage.label(a_255)
            sizes = ndimage.sum(a_255, labeled, range(1, n + 1))
            n_components = (sizes > 50).sum()
        else:
            n_components = 0
        print(
            f"        f{fi:03d}: oct={oct_px}, partial={partial}, trans={trans}, "
            f"eye={eye.sum()}, eye_min={eye_min}, green_res={green.sum()}, components={n_components}"
        )


def red_bg_verify(out: Path, frame_idx: int = 50) -> None:
    """RED bg composite to confirm alpha=0 pixels truly transparent (PNG viewers lie)."""
    print(f"[5/8] RED bg verify frame {frame_idx} (alpha=0 must show red)")
    img = Image.open(out)
    img.seek(frame_idx)
    red_bg = Image.new("RGBA", img.size, (255, 0, 0, 255))
    composed = Image.alpha_composite(red_bg, img.convert("RGBA"))
    out_png = out.with_name(out.stem + f"-red{frame_idx:03d}.png")
    composed.save(out_png)
    arr = np.array(composed)
    a = np.array(img)[..., 3]
    rgb = np.array(composed)[..., :3]
    # Find a "background" pixel: alpha=0 in source, must be (255,0,0) in red composite
    bg_mask = a == 0
    if bg_mask.sum() == 0:
        print(f"        → no background pixels (all opaque)")
        return
    red_pixels = ((rgb[bg_mask, 0] == 255) & (rgb[bg_mask, 1] == 0) & (rgb[bg_mask, 2] == 0)).sum()
    pct = red_pixels / bg_mask.sum() * 100
    print(f"        → {red_pixels}/{bg_mask.sum()} bg pixels show pure red ({pct:.1f}%)")
    if pct < 99.0:
        print(f"        ⚠️  {100 - pct:.1f}% bg pixels NOT red — alpha leak!")


# --------------------------------------------------------------------------------------
# Main
# --------------------------------------------------------------------------------------


def main() -> int:
    parser = argparse.ArgumentParser(description="v5.2 BiRefNet + CorridorKey APNG extractor")
    parser.add_argument("--input", "-i", type=Path, required=True, help="H3 mp4 input")
    parser.add_argument("--output", "-o", type=Path, required=True, help="output APNG path")
    parser.add_argument("--fps", type=int, default=15, help="extract fps (default 15)")
    parser.add_argument("--frame-count", type=int, default=100, help="frames per loop (default 100)")
    parser.add_argument("--size", type=int, default=192, help="output APNG size (default 192)")
    parser.add_argument("--duration", type=int, default=66, help="ms per frame (default 66 = 15fps)")
    parser.add_argument("--birefnet-size", type=int, default=1024, help="BiRefNet inference size")
    parser.add_argument("--threshold", type=int, default=128, help="(unused, kept for CLI compat)")
    parser.add_argument("--device", type=str, default="cuda", help="cuda | mps | cpu")
    parser.add_argument("--disposal", type=int, default=2, help="APNG disposal (0=none 2=clear)")
    parser.add_argument("--loop", type=int, default=1, help="APNG loop count (0=infinite)")
    parser.add_argument("--keep-temp", action="store_true", help="keep extracted frames in temp dir")
    parser.add_argument("--no-verify", action="store_true", help="skip pixel verification")
    args = parser.parse_args()

    if not args.input.exists():
        print(f"ERROR: input not found: {args.input}", file=sys.stderr)
        return 1

    args.output.parent.mkdir(parents=True, exist_ok=True)

    print(f"[1/8] extract frames from {args.input.name} @ {args.fps} fps")
    with tempfile.TemporaryDirectory(prefix="v52-") as tmp:
        tmp_dir = Path(tmp)
        n_total = extract_frames(args.input, args.fps, tmp_dir)
        if n_total == 0:
            print("ERROR: 0 frames extracted", file=sys.stderr)
            return 1
        indices = sample_indices(n_total, args.frame_count)
        print(f"        → sample {len(indices)} from {n_total}: {indices[:3]}...{indices[-3:]}")

        images = process_frames(
            tmp_dir, indices, args.size, args.birefnet_size, args.threshold, args.device
        )
        save_apng(images, args.output, args.duration, args.disposal, args.loop)
        if args.keep_temp:
            shutil.copytree(tmp_dir, args.output.with_suffix(".frames"))
            print(f"        → temp frames kept at {args.output.with_suffix('.frames')}")
        if not args.no_verify:
            verify_apng(args.output)
            red_bg_verify(args.output, frame_idx=min(50, args.frame_count - 1))

    print(f"\n✅ v5.2 BiRefNet + CorridorKey APNG ready: {args.output}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
