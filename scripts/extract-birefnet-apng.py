#!/usr/bin/env python3
"""
extract-birefnet-apng.py — v5.1 BiRefNet pipeline: H3 / gen_videos 绿幕视频 → 桌宠透明 APNG.

替代 v4.x PIL chroma key 25 步演进. 用 BiRefNet (CAAI AIR 2024 SOTA, MIT 商用)
ML 抠图: BiRefNet 找主体 subject (章鱼) → alpha=255, 绿幕 uniform color 背景
→ alpha=0. 不基于绿幕颜色, 不需要 chroma key 阈值猜测.

v5.1 增量 (2026-09-10): 治本"放大镜应该是透明的"反馈
  - v5.0 BiRefNet 1:1 保留源 H3 视频的绿幕反射 (放大镜玻璃 + 章鱼身体)
  - v5.1 加 green_residual_alpha0 后处理:
    检测 alpha=255 + G>R+5 + G>B+5 + G>120 (源 H3 绿幕反射特征) → alpha=0
    - 放大镜玻璃 → 桌宠背景透出来 (真透明, 跟源 H3 物理一致)
    - 章鱼身体绿反射 → 桌宠背景透出来 (用户接受: 比"绿斑"好)
  - 保留 v4.24 forehead_white_mask (y=50-80, x=70-110) 治"白方块"
  - 保留 cv2.inpaint Telea r=8 治 partial 绿光晕
  - BiRefNet soft mask 阈值 > 128 = 255, < 64 = 0

Pipeline (6 步):
  1. ffmpeg 抽帧 (mp4 → PNG 序列, 默认 15fps → 88 帧 @ 5.88s @ 24fps)
  2. BiRefNet MPS fp32 推理 @ 512x512 (4x 提速 vs 1024x1024)
  3. alpha 阈值 > 128 = 255, < 64 = 0 (binary, 0 partial)
  4. green_residual_alpha0: alpha=255 + G>R+5 + G>B+5 + G>120 → alpha=0
  5. v4.24 forehead_white_mask: alpha=255 + RGB>=250 + y∈[50,80) + x∈[70,110) → (240,220,210)
  6. cv2.inpaint Telea r=8 治本 partial 绿光晕 (BiRefNet soft mask 边缘)
  7. PIL resize 192x192 (LANCZOS)
  8. PIL APNG 输出 (disposal=0, 66ms/帧 ≈ 15fps, 100 帧 = 6.6s)

vs v4.24 (chroma key 25 步演进):
  - 眼白: BiRefNet 1:1 保留源视频色温 (源 H3 眼底月牙就是米白, 不是真纯白)
  - 完整度: BiRefNet ML 找主体, 不依赖绿幕颜色, 章鱼轮廓 1:1 保留
  - 放大镜: v5.1 green_residual_alpha0 让玻璃真透明 (桌宠背景透出)
  - 额头白方块: v4.24 forehead_white_mask 保留
  - partial alpha: BiRefNet soft mask → binary128 后 0% partial (vs v4.24 0.16%)
  - 速度: 4 秒/帧 MPS @ 1024x1024 → 1 秒/帧 @ 512x512 (4x 提速)

M1 Pro MPS fp32 强制 (避免 `Input type (float) and bias type (c10::Half)` 冲突).
PNG viewer 误导: alpha=0 透明区显示成原 RGB 色, 必须 `Image.alpha_composite(red_bg, image)` 红底合成验证.

Usage:
  python3 scripts/extract-birefnet-apng.py \\
    --input docs/v2-01-detective-study/v2-01-detective-study-h3.mp4 \\
    --output /tmp/detective-study-v5.1.png

Options:
  --fps 15                抽帧 fps (默认 15)
  --frame-count 100       最终帧数, 等距抽取 (默认 100)
  --size 192              输出 APNG 边长 (默认 192 = 桌宠标准)
  --duration 66           APNG 每帧 ms (默认 66ms, 100 帧 ≈ 6.6s 一循环)
  --birefnet-size 512     BiRefNet 推理尺寸 (默认 512, 1024 = 官方 README 但 4x 慢)
  --threshold 128         alpha 二值化阈值 (默认 128)
  --keep-temp             保留临时抽帧目录
  --no-verify             跳过像素/RED 合成验证
"""
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

# BiRefNet 软依赖
try:
    from transformers import AutoModelForImageSegmentation
    _HAS_BIREFNET = True
except ImportError:
    _HAS_BIREFNET = False


def extract_frames(mp4: Path, fps: int, out_dir: Path) -> int:
    """ffmpeg 抽帧: mp4 → PNG 序列"""
    print(f"[1/8] ffmpeg extract @ {fps}fps → {out_dir}/")
    subprocess.run([
        "ffmpeg", "-y", "-i", str(mp4),
        "-vf", f"fps={fps}",
        str(out_dir / "frame_%03d.png"),
    ], check=True, capture_output=True)
    n = len(list(out_dir.glob("*.png")))
    print(f"        → {n} frames extracted")
    return n


def sample_indices(total: int, want: int) -> list[int]:
    """从 total 帧里等距抽 want 帧 (1-indexed file names)"""
    return [int(i * total / want) + 1 for i in range(want)]


_MODEL_CACHE = {}


def load_birefnet(device: str = "mps") -> "AutoModelForImageSegmentation":
    """加载 BiRefNet 模型 (单例, MPS fp32)"""
    if "model" in _MODEL_CACHE:
        return _MODEL_CACHE["model"]
    print(f"        loading BiRefNet (MPS fp32)...")
    model = AutoModelForImageSegmentation.from_pretrained(
        'ZhengPeng7/BiRefNet', trust_remote_code=True
    )
    model = model.float()  # MPS 强制 fp32, 避免 bias dtype 冲突
    model = model.to(device)
    model = model.eval()
    _MODEL_CACHE["model"] = model
    print(f"        → model loaded, device={device}")
    return model


def birefnet_alpha(model, img_pil: Image.Image, device: str = "mps",
                   birefnet_size: int = 512) -> np.ndarray:
    """BiRefNet 推理: PIL Image → HxW uint8 alpha 数组 (0-255 sigmoid)"""
    # BiRefNet 官方 transform: Resize → ToTensor + Normalize
    from torchvision import transforms
    transform = transforms.Compose([
        transforms.Resize((birefnet_size, birefnet_size)),
        transforms.ToTensor(),
        transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225]),
    ])
    inp = transform(img_pil.convert('RGB')).unsqueeze(0).to(device).float()
    with torch.no_grad():
        pred = model(inp)[-1].sigmoid().cpu()[0, 0].numpy()
    # resize 回原图尺寸
    mask = Image.fromarray((pred * 255).astype(np.uint8), mode='L')
    mask = mask.resize(img_pil.size, Image.BILINEAR)
    return np.array(mask)


def threshold_alpha(alpha: np.ndarray, hi: int = 128, lo: int = 64) -> np.ndarray:
    """alpha 阈值化: > hi = 255, < lo = 0, 中间 partial 留给 inpaint.
    v5.1 用 hi=128 lo=64 双阈值, 减少 partial 像素."""
    out = np.zeros_like(alpha)
    out[alpha > hi] = 255
    out[(alpha > lo) & (alpha <= hi)] = 128  # partial 中间值
    return out


def post_green_residual_alpha0(arr_rgba: np.ndarray) -> tuple[np.ndarray, int, int]:
    """v5.1 新增: 治本源 H3 绿幕反射残留.

    源 H3 模型在章鱼身体 + 放大镜玻璃 + 道具上渲染"绿反射"
    (绿幕颜色被反射到前景物体上). BiRefNet 把这些当作"主体特征"保留.
    用户反馈"放大镜应该是透明的" — 玻璃下面应该看到桌面背景.

    检测: alpha=255 + G>R+5 + G>B+5 + G>120 (绿幕反射 RGB 签名)
    处理: alpha=0 (真透明, 桌宠背景透出)

    Returns: (新 rgba, 命中像素数, 命中连通分量数)
    """
    R, G, B, A = arr_rgba[:,:,0], arr_rgba[:,:,1], arr_rgba[:,:,2], arr_rgba[:,:,3]
    mask = (A == 255) & (G.astype(int) > R.astype(int) + 5) & (G.astype(int) > B.astype(int) + 5) & (G > 120)
    n_hit = int(mask.sum())
    n_components = 0
    if n_hit > 0:
        from scipy import ndimage
        labeled, n = ndimage.label(mask)
        sizes = ndimage.sum(mask, labeled, range(1, n + 1))
        n_components = int((sizes > 10).sum())
        out = arr_rgba.copy()
        out[mask, 3] = 0  # alpha = 0
        return out, n_hit, n_components
    return arr_rgba, 0, 0


def post_forehead_white_mask(arr_rgba: np.ndarray) -> tuple[np.ndarray, int]:
    """v4.24 forehead ROI 治本"白方块".

    源 H3 模型在 f75-f81 区间 (章鱼抬头/转脸) 把帽沿/帽顶在额头位置渲染"白色高光",
    部署后显"白方块". v4.24 用 position-based mask 治本:
    alpha=255 + RGB>=250 + y∈[50,80) + x∈[70,110) → (240,220,210) 暖白.

    Returns: (新 rgba, 命中像素数)
    """
    R, G, B, A = arr_rgba[:,:,0], arr_rgba[:,:,1], arr_rgba[:,:,2], arr_rgba[:,:,3]
    H, W = arr_rgba.shape[:2]
    # 限制在 192x192 输出尺寸 (输入可能更大, 按比例缩)
    y_lo = int(50 * H / 192)
    y_hi = int(80 * H / 192)
    x_lo = int(70 * W / 192)
    x_hi = int(110 * W / 192)
    mask = (
        (A == 255)
        & (R >= 250) & (G >= 250) & (B >= 250)
        & (np.arange(H)[:, None] >= y_lo) & (np.arange(H)[:, None] < y_hi)
        & (np.arange(W)[None, :] >= x_lo) & (np.arange(W)[None, :] < x_hi)
    )
    n_hit = int(mask.sum())
    if n_hit > 0:
        out = arr_rgba.copy()
        out[mask, 0] = 240
        out[mask, 1] = 220
        out[mask, 2] = 210
        return out, n_hit
    return arr_rgba, 0


def post_inpaint_partial(arr_rgba: np.ndarray, radius: int = 8) -> np.ndarray:
    """v5.2 保留: cv2.inpaint Telea 治本 partial 绿光晕.

    BiRefNet soft mask → 阈值后剩余 partial 像素 (alpha 64-128) 边缘会有"绿光晕",
    因为 BiRefNet 软边把源绿幕 RGB 混合到 partial 像素. cv2.inpaint Telea PDE 解算
    用周围纯色填充 partial 像素的 RGB, alpha 保持不变.

    v5.2 增量: inpaint 之后 alpha 收紧 (跟 v4.6 一致):
    partial 像素 (alpha 64-128) RGB 已被 inpaint 改成周围身体色,
    把 alpha 提到 255 让"章鱼脸完整" — 不再因 BiRefNet 半透判断而打洞.

    Returns: 新 rgba
    """
    import cv2
    A = arr_rgba[:,:,3]
    partial_mask = (A > 0) & (A < 255)
    if partial_mask.sum() < 50:
        return arr_rgba
    # partial mask 1px 膨胀 (跟 v4.6 一致)
    kernel = np.ones((3, 3), np.uint8)
    dilated = cv2.dilate(partial_mask.astype(np.uint8), kernel, iterations=1).astype(bool)
    inpaint_mask = (dilated & ~partial_mask) | partial_mask  # partial + 1px 周围
    rgb = arr_rgba[:, :, :3].copy()
    rgb_inpainted = cv2.inpaint(rgb, inpaint_mask.astype(np.uint8) * 255, radius, cv2.INPAINT_TELEA)
    out = arr_rgba.copy()
    out[:, :, :3] = rgb_inpainted
    # v5.2 alpha 收紧: partial 像素 → 255 (跟 v4.6 行为一致, 治本"打洞")
    out[:, :, 3] = np.where((out[:, :, 3] > 0) & (out[:, :, 3] < 255), 255, out[:, :, 3])
    return out


def process_frames(src_dir: Path, indices: list[int], size: int,
                   birefnet_size: int, threshold: int, device: str) -> list[Image.Image]:
    """加载 + BiRefNet + threshold + post-process + resize → RGBA PIL Image 列表"""
    print(f"[2/8] load {len(indices)} frames + BiRefNet @ {birefnet_size}px + threshold {threshold}...")
    model = load_birefnet(device)
    images = []
    t0 = time.time()
    for i, idx in enumerate(indices):
        img = Image.open(src_dir / f"frame_{idx:03d}.png").convert('RGB')
        # BiRefNet @ birefnet_size
        alpha_full = birefnet_alpha(model, img, device, birefnet_size)
        # threshold (双阈值 64/128, 中间值留给 inpaint)
        alpha_bin = threshold_alpha(alpha_full, hi=threshold, lo=64)
        # resize 到输出尺寸
        if img.size != (size, size):
            img_resized = img.resize((size, size), Image.LANCZOS)
            alpha_resized = Image.fromarray(alpha_bin, mode='L').resize(
                (size, size), Image.NEAREST  # alpha 不用 LANCZOS, 保持 0/255/128 锐利
            )
        else:
            img_resized = img
            alpha_resized = Image.fromarray(alpha_bin, mode='L')
        rgba = np.dstack([np.array(img_resized), np.array(alpha_resized)])
        # v5.1 post-process 1: green_residual_alpha0 (治本绿反射 → 透明)
        rgba, n_green, n_comp = post_green_residual_alpha0(rgba)
        # v4.24 post-process 2: forehead_white_mask (治本白方块)
        rgba, n_forehead = post_forehead_white_mask(rgba)
        # v5.1 post-process 3: inpaint partial 绿光晕
        rgba = post_inpaint_partial(rgba, radius=8)
        images.append(Image.fromarray(rgba, mode='RGBA'))
        if (i + 1) % 10 == 0 or i == len(indices) - 1:
            elapsed = time.time() - t0
            eta = elapsed / (i + 1) * (len(indices) - i - 1)
            print(f"        [{i+1}/{len(indices)}] elapsed {elapsed:.0f}s, ETA {eta:.0f}s, "
                  f"green_residual f{i}: {n_green}px/{n_comp}comp, forehead f{i}: {n_forehead}px")
    return images


def save_apng(images: list[Image.Image], out: Path, duration: int, disposal: int, loop: int = 1) -> None:
    """PIL APNG 输出"""
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
    """像素验证: 抽几帧看 alpha + RGB + partial + 完整度"""
    print(f"[4/8] verify {out.name}")
    img = Image.open(out)
    print(f"        → mode={img.mode}, n_frames={getattr(img, 'n_frames', 1)}, size={img.size}")
    from scipy import ndimage
    n_frames = img.n_frames
    test_indices = [0, n_frames // 4, n_frames // 2, 3 * n_frames // 4, n_frames - 1]
    print(f"        → testing frames: {test_indices}")
    for fi in test_indices:
        img.seek(fi)
        arr = np.array(img.convert('RGBA'))
        rgb = arr[:, :, :3]
        a = arr[:, :, 3]
        oct_px = (a == 255).sum()
        partial = ((a > 0) & (a < 255)).sum()
        trans = (a == 0).sum()
        # 眼白 (alpha=255 + R>200 G>200 B>200)
        eye = (a == 255) & (rgb[:, :, 0] > 200) & (rgb[:, :, 1] > 200) & (rgb[:, :, 2] > 200)
        eye_min = rgb[eye].min(axis=0) if eye.sum() > 10 else "N/A"
        # 绿残留 (alpha=255)
        green = (a == 255) & (rgb[:, :, 1] > rgb[:, :, 0] + 5) & (rgb[:, :, 1] > rgb[:, :, 2] + 5) & (rgb[:, :, 1] > 120)
        # alpha=255 连通分量
        a_255 = (a == 255)
        if a_255.sum() > 100:
            labeled, n = ndimage.label(a_255)
            sizes = ndimage.sum(a_255, labeled, range(1, n + 1))
            n_components = (sizes > 50).sum()
        else:
            n_components = 0
        print(f"        f{fi:03d}: oct={oct_px}, partial={partial}, trans={trans}, "
              f"eye={eye.sum()}, eye_min={eye_min}, green_res={green.sum()}, components={n_components}")


def red_bg_verify(out: Path, frame_idx: int = 50) -> None:
    """RED 背景合成验证: alpha=0 像素必须显示红 (PNG viewer 误导防护)"""
    print(f"[5/8] RED bg verify frame {frame_idx} (alpha=0 must be red)")
    img = Image.open(out)
    img.seek(frame_idx)
    red_bg = Image.new('RGBA', img.size, (255, 0, 0, 255))
    composed = Image.alpha_composite(red_bg, img.convert('RGBA'))
    out_png = out.with_name(out.stem + f'-red{frame_idx:03d}.png')
    composed.save(out_png)
    arr = np.array(composed)
    red_px = ((arr[:, :, 0] > 200) & (arr[:, :, 1] < 50) & (arr[:, :, 2] < 50)).sum()
    total_px = arr.shape[0] * arr.shape[1]
    print(f"        → red px: {red_px} / {total_px} = {red_px/total_px*100:.1f}% (saved {out_png.name})")


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[1] if __doc__ else "")
    ap.add_argument("--input", "-i", required=True, type=Path, help="Input mp4 path")
    ap.add_argument("--output", "-o", required=True, type=Path, help="Output APNG path")
    ap.add_argument("--fps", type=int, default=15, help="Extract fps (default 15)")
    ap.add_argument("--frame-count", type=int, default=100, help="Final frame count (default 100)")
    ap.add_argument("--size", type=int, default=192, help="Output size (default 192)")
    ap.add_argument("--duration", type=int, default=66, help="APNG ms/frame (default 66)")
    ap.add_argument("--disposal", type=int, default=0, help="APNG disposal (default 0)")
    ap.add_argument("--loop", type=int, default=1, help="APNG loop (default 1; 0=infinite)")
    ap.add_argument("--birefnet-size", type=int, default=512, help="BiRefNet input size (default 512, 1024=official 4x slower)")
    ap.add_argument("--threshold", type=int, default=128, help="alpha upper threshold (default 128)")
    ap.add_argument("--device", default="mps", help="Torch device (default mps)")
    ap.add_argument("--keep-temp", action="store_true", help="Keep temp frame dir")
    ap.add_argument("--no-verify", action="store_true", help="Skip verification")
    args = ap.parse_args()

    if not _HAS_BIREFNET:
        print("ERROR: transformers / BiRefNet 未装", file=sys.stderr)
        print("  安装: pip install --user --break-system-packages torch torchvision transformers", file=sys.stderr)
        return 1
    if not args.input.exists():
        print(f"ERROR: input not found: {args.input}", file=sys.stderr)
        return 1

    args.output.parent.mkdir(parents=True, exist_ok=True)

    with tempfile.TemporaryDirectory(prefix="birefnet-") as tmp:
        tmp_dir = Path(tmp)
        n_total = extract_frames(args.input, args.fps, tmp_dir)
        if n_total == 0:
            print("ERROR: 0 frames extracted", file=sys.stderr)
            return 1
        indices = sample_indices(n_total, args.frame_count)
        print(f"        → sample {len(indices)} from {n_total}: {indices[:3]}...{indices[-3:]}")
        images = process_frames(tmp_dir, indices, args.size, args.birefnet_size, args.threshold, args.device)
        save_apng(images, args.output, args.duration, args.disposal, args.loop)
        if args.keep_temp:
            shutil.copytree(tmp_dir, args.output.with_suffix(".frames"))
            print(f"        → temp frames kept at {args.output.with_suffix('.frames')}")
        if not args.no_verify:
            verify_apng(args.output)
            red_bg_verify(args.output, frame_idx=min(50, args.frame_count - 1))

    print(f"\n✅ v5.1 BiRefNet APNG ready: {args.output}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
