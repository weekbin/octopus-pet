#!/usr/bin/env python3
"""v10-final — combine all incremental fixes into one final pipeline.

Pipeline:
  Stage 1: BiRefNet 1024 → soft alpha hint
  Stage 2: CorridorKey → linear alpha + straight FG
  Stage 3: v10.3 strict gate: a>128 & G>150 & R<150 & B<150 & ratio>1.3
  Stage 4: forehead_white_mask (H3 帽反光治本)
  Stage 5: borrow+recolor+inpaint (v10.12 algorithm)
           detective f65-72: median ref f63-65
           worker f66-72: median ref f46-60
  Stage 6: ROI demote (v10.17 detective 放大镜, v10.19 worker 桌子)
           detective f25-72: ROI (x=0-55, y=55-105) green demote → alpha=0
           worker f64-65: ROI table (y=130-180) green recolor → brown (150,110,70)
"""
import os
import sys
import time
import subprocess
import tempfile
import numpy as np
import torch
from PIL import Image
import cv2
from numpy.ma import median as ma_median

os.environ.setdefault("HF_ENDPOINT", "https://hf-mirror.com")

ROOT = "/home/weekbin/Works/repositories/octopus-pet"
H3_VIDEOS = {
    "detective-study": f"{ROOT}/docs/v2-01-detective-study/v2-01-detective-study-h3.mp4",
    "worker-construction": f"{ROOT}/docs/v2-02-worker-construction/v2-02-worker-construction-h3.mp4",
    "drink-coffee": f"{ROOT}/docs/v2-03-drink-coffee/v2-03-drink-coffee-h3.mp4",
}
ARCHIVE = "/tmp/v10-final-archive"
os.makedirs(ARCHIVE, exist_ok=True)

sys.path.insert(0, f"{ROOT}/scripts")
import importlib.util
_spec = importlib.util.spec_from_file_location("extract_v52_apng", f"{ROOT}/scripts/extract-v52-apng.py")
_v52 = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_v52)
load_birefnet = _v52.load_birefnet
birefnet_hint = _v52.birefnet_hint
load_corridorkey = _v52.load_corridorkey
corrkey_unmix = _v52.corrkey_unmix
post_forehead_white_mask = _v52.post_forehead_white_mask
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"


# === Stage 3: v10.3 strict gate ===
def post_green_residual_mask_v103(rgba):
    out = rgba.copy()
    a = out[..., 3]
    rgb = out[..., :3].astype(np.float32)
    G = rgb[..., 1]; R = rgb[..., 0]; B = rgb[..., 2]
    ratio = G / np.maximum(R + B + 1, 1)
    green = (a > 128) & (G > 150) & (R < 150) & (B < 150) & (ratio > 1.3)
    out[green, 3] = 0
    return out


# === Stage 5: borrow+recolor+inpaint ===
def find_shift(ref_gray, cur_gray, max_shift=10):
    ref = ref_gray.astype(np.float32) / 255.0 if ref_gray.max() > 1.0 else ref_gray.astype(np.float32)
    cur = cur_gray.astype(np.float32) / 255.0 if cur_gray.max() > 1.0 else cur_gray.astype(np.float32)
    h, w = ref.shape
    win = cv2.createHanningWindow((w, h), cv2.CV_32F)
    try:
        shift, response = cv2.phaseCorrelate(ref, cur, win)
        dx, dy = shift
        if abs(dx) > max_shift or abs(dy) > max_shift:
            return (0.0, 0.0), 0.0
        return (dx, dy), response
    except cv2.error:
        return (0.0, 0.0), 0.0


def warp_with_shift(img, shift):
    dx, dy = shift
    h, w = img.shape[:2]
    M = np.array([[1, 0, dx], [0, 1, dy]], dtype=np.float32)
    return cv2.warpAffine(img, M, (w, h), flags=cv2.INTER_LINEAR,
                          borderMode=cv2.BORDER_CONSTANT, borderValue=0)


def make_body_gray(frame, roi=(40, 150, 60, 130)):
    y0, y1, x0, x1 = roi
    roi_rgb = frame[y0:y1, x0:x1, :3]
    roi_a = frame[y0:y1, x0:x1, 3]
    comp = np.where(roi_a[..., None] > 128, roi_rgb, 0)
    return cv2.cvtColor(comp, cv2.COLOR_RGB2GRAY)


def median_ref(frames, indices):
    stack = np.stack([frames[i] for i in indices if 0 <= i < len(frames)])
    any_fg = (stack[..., 3] > 128).any(axis=0)
    med = np.zeros_like(stack[0])
    for c in range(3):
        stacked_mask = np.ma.masked_array(stack[..., c], mask=stack[..., 3] < 128)
        with np.errstate(all="ignore"):
            med[..., c] = ma_median(stacked_mask, axis=0).filled(0).astype(np.uint8)
    med[..., 3] = (any_fg.astype(np.uint8)) * 255
    return med


def inpaint_still_green(rgba, g_th=5, g_min=50, inpaint_radius=3):
    out = rgba.copy()
    a = out[..., 3]
    rgb = out[..., :3].astype(np.float32)
    G, R, B = rgb[..., 1], rgb[..., 0], rgb[..., 2]
    still_green = (a > 128) & (G > R + g_th) & (G > B + g_th) & (G > g_min)
    n = int(still_green.sum())
    if n == 0:
        return out, 0
    rgb_for_inpaint = out[..., :3].copy()
    rgb_for_inpaint[a < 128] = 0
    mask_u8 = still_green.astype(np.uint8) * 255
    inpainted_rgb = cv2.inpaint(rgb_for_inpaint, mask_u8, inpaint_radius, cv2.INPAINT_TELEA)
    new_rgb = out[..., :3].copy()
    new_rgb[still_green] = inpainted_rgb[still_green]
    out[..., :3] = new_rgb
    return out, n


def fix_frames_borrow(frames, cfg):
    body_roi = (40, 150, 60, 130)
    out = list(frames)
    for f, ref_indices in cfg:
        if f >= len(frames):
            continue
        cur = frames[f]
        if isinstance(ref_indices, int):
            ref_indices = [ref_indices]
        med_ref = median_ref(frames, ref_indices)
        med_gray = make_body_gray(med_ref, body_roi)
        cur_gray = make_body_gray(cur, body_roi)
        (dx, dy), response = find_shift(med_gray, cur_gray, max_shift=8)
        if response < 0.05:
            dx, dy = 0.0, 0.0
        warped = warp_with_shift(med_ref, (dx, dy))
        new_frame = cur.copy()
        cur_a = cur[..., 3]
        cur_rgb = cur[..., :3].astype(np.float32)
        G, R, B = cur_rgb[..., 1], cur_rgb[..., 0], cur_rgb[..., 2]
        green_in_fg = (cur_a > 128) & (G > R + 5) & (G > B + 5) & (G > 50)
        warped_a = warped[..., 3]
        warped_rgb = warped[..., :3]
        not_black = warped_rgb.sum(axis=2) > 30
        recolor_mask = green_in_fg & (warped_a > 128) & not_black
        n_recolored = int(recolor_mask.sum())
        if n_recolored > 0:
            new_frame[recolor_mask, :3] = warped[recolor_mask, :3]
        cur_a_new = new_frame[..., 3]
        fill_mask = (cur_a_new < 128) & (warped_a > 128) & not_black
        n_filled = int(fill_mask.sum())
        if n_filled > 0:
            new_frame[fill_mask] = warped[fill_mask]
        new_frame, n_inp = inpaint_still_green(new_frame)
        out[f] = new_frame
        print(f"    f{f:02d}: recolored={n_recolored}px filled={n_filled}px inpainted={n_inp}px")
    return out


# === Stage 6: ROI demote (per scene) ===
def apply_roi_detective(frames, frame_range, roi=(0, 55, 55, 105)):
    """detective: 放大镜 ROI 绿色 demote 到 alpha=0"""
    out = list(frames)
    h, w = 192, 192
    ys_grid, xs_grid = np.indices((h, w))
    for f in frame_range:
        if f >= len(frames):
            continue
        cur = out[f].copy()
        x0, y0, x1, y1 = roi
        x0, x1 = max(0, x0), min(w, x1)
        y0, y1 = max(0, y0), min(h, y1)
        region = cur[y0:y1, x0:x1]
        rgb = region[..., :3].astype(np.float32)
        alpha = region[..., 3]
        fg = alpha > 128
        G, R, B = rgb[..., 1], rgb[..., 0], rgb[..., 2]
        green = fg & (G > R + 5) & (G > B + 5) & (G > 50)
        n = int(green.sum())
        if n > 0:
            region[green, 3] = 0
            cur[y0:y1, x0:x1] = region
            out[f] = cur
            print(f"    f{f:02d}: ROI demote {n}px (放大镜)")
    return out


def apply_roi_worker(frames, frame_range, roi=(0, 130, 192, 185), target_rgb=(150, 110, 70)):
    """worker: 桌子 ROI 绿色 recolor 成棕色 (桌子淡出时)"""
    out = list(frames)
    h, w = 192, 192
    for f in frame_range:
        if f >= len(frames):
            continue
        cur = out[f].copy()
        x0, y0, x1, y1 = roi
        x0, x1 = max(0, x0), min(w, x1)
        y0, y1 = max(0, y0), min(h, y1)
        region = cur[y0:y1, x0:x1]
        rgb = region[..., :3].astype(np.float32)
        alpha = region[..., 3]
        fg = alpha > 128
        G, R, B = rgb[..., 1], rgb[..., 0], rgb[..., 2]
        green = fg & (G > R + 10) & (G > B + 10) & (G > 70)
        n = int(green.sum())
        if n > 0:
            region[green, :3] = target_rgb
            cur[y0:y1, x0:x1] = region
            out[f] = cur
            print(f"    f{f:02d}: ROI recolor {n}px green→brown (桌子)")
    return out


def extract_video_frames(video_path, fps=15, count=99, size=192):
    tmpdir = tempfile.mkdtemp(prefix="v10final-")
    pattern = os.path.join(tmpdir, "frame_%03d.png")
    cmd = ["ffmpeg", "-y", "-i", video_path, "-vf", f"fps={fps},scale={size}:{size}",
           "-frames:v", str(count), pattern]
    subprocess.run(cmd, check=True, capture_output=True)
    files = sorted([f for f in os.listdir(tmpdir) if f.endswith(".png")])
    return [os.path.join(tmpdir, f) for f in files]


def save_apng(frames, out_path):
    pil_frames = [Image.fromarray(f, mode="RGBA") for f in frames]
    pil_frames[0].save(out_path, format="PNG", save_all=True, append_images=pil_frames[1:],
                       duration=66, loop=0, disposal=2)
    print(f"  saved {out_path}  {os.path.getsize(out_path)/1024:.0f} KB")


def main():
    print("[v10-final] loading models...")
    birefnet = load_birefnet(DEVICE)
    corrkey = load_corridorkey(DEVICE)
    print("[v10-final] models loaded")

    for scene in ["detective-study", "worker-construction", "drink-coffee"]:
        print(f"\n=== {scene} ===")
        video = H3_VIDEOS[scene]
        paths = extract_video_frames(video, fps=15, count=99, size=192)
        print(f"  {len(paths)} frames extracted")

        # Stages 1-2: matting
        out_frames = []
        t0 = time.time()
        for i, path in enumerate(paths):
            bgr = cv2.imread(path, cv2.IMREAD_COLOR)
            rgb = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)
            pil = Image.fromarray(rgb)
            hint = birefnet_hint(birefnet, pil, device=DEVICE, size=192)
            result = corrkey_unmix(corrkey, rgb, hint)
            alpha = np.clip(result["alpha"].squeeze(), 0.0, 1.0)
            fg = np.clip(result["fg"], 0.0, 1.0)
            rgb_u8 = (fg * 255).astype(np.uint8)
            alpha_u8 = (alpha * 255).astype(np.uint8)
            rgba_u8 = np.dstack([rgb_u8, alpha_u8])
            # Stage 3: strict gate
            rgba_u8 = post_green_residual_mask_v103(rgba_u8)
            # Stage 4: forehead white mask
            rgba_u8, _ = post_forehead_white_mask(rgba_u8)
            out_frames.append(rgba_u8)
            if (i + 1) % 20 == 0 or i == len(paths) - 1:
                elapsed = time.time() - t0
                rate = (i + 1) / elapsed
                eta = (len(paths) - i - 1) / rate if rate > 0 else 0
                print(f"    f{i+1}/{len(paths)}  {rate:.2f} f/s  ETA {eta:.0f}s")
        # cleanup tmp
        try:
            for p in paths:
                os.remove(p)
            os.rmdir(os.path.dirname(paths[0]))
        except Exception:
            pass

        # Stage 5: borrow+recolor+inpaint (scene-specific)
        print("  Stage 5: borrow+recolor+inpaint")
        if scene == "detective-study":
            cfg = [(f, [63, 64, 65]) for f in range(65, 73)]
        elif scene == "worker-construction":
            cfg = [(f, list(range(46, 61))) for f in range(66, 73)]
        else:
            cfg = []
        if cfg:
            out_frames = fix_frames_borrow(out_frames, cfg)

        # Stage 6: ROI demote/recolor (scene-specific)
        print("  Stage 6: ROI")
        if scene == "detective-study":
            out_frames = apply_roi_detective(out_frames, range(25, 73))
        elif scene == "worker-construction":
            out_frames = apply_roi_worker(out_frames, range(64, 73))

        # Save
        out_path = f"{ARCHIVE}/v10-final-{scene}.png"
        save_apng(out_frames, out_path)


if __name__ == "__main__":
    main()
