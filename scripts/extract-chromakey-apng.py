#!/usr/bin/env python3
"""
extract-chromakey-apng.py — H3 / gen_videos 绿幕视频 → 桌宠透明 APNG.

Designed for octopus-pet V2 pipeline: 14 动作视频统一抽帧 + 绿幕抠像
+ 透明 APNG 输出, 替换 V1 桌宠 sprite。

Pipeline (4 步):
  1. ffmpeg 抽帧 (mp4 → PNG 序列, 默认 15fps)
  2. PIL resize 到桌宠尺寸 (192×192)
  3. PIL chroma key v4: 相对绿度 (G - max(R,B)) / G, 阈值化
  4. PIL APNG 输出 (disposal=0, 默认 132ms/帧 ≈ 7.5fps, 50 帧 = 6.6s)

chroma key 演进 (v1 → v3 → v4):
  v1: greenness = clip((G - max(R,B)) / 60 + 0.5, 0, 1)
    → 中性色 (白底/高光) alpha=0.5 半透 → 眼睛抠过头
  v3: greenness = clip((G - max(R,B) - 10) / 20, 0, 1)
    → 阈值 10/30, 中性色 (diff≤0) alpha=255 不透
    → 修复 v1, 但 "白底偏一点绿" (e.g. RGB 164,182,150, G-R=18) 仍 alpha=153
    → 桌宠眼睛下边缘显"高亮透明" (2026-09-09 用户反馈)
  v4: greenness = clip(((G - max(R,B)) / G - 0.2) / 0.3, 0, 1)
    → 相对绿度, 跟 G 本身归一化. 暗绿 (17,44,15) 相对绿度 0.61 → 透明;
      白底偏绿 (164,182,150) 相对绿度 0.10 → 不透; 纯白 0 → 不透.
    → partial-alpha 像素减少 ~50% (从 167 → 89 在 drink-coffee 眼睛下边缘测试)
    → 正确处理章鱼眼高光 + 边缘抗锯齿

Usage:
  python3 scripts/extract-chromakey-apng.py \
    --input docs/v2-XX-name/v2-XX-name-h3.mp4 \
    --output app/public/assets/octopus/breath-idle.png

Options:
  --fps 15              抽帧 fps (默认 15)
  --frame-count 50      最终帧数, 自动从原帧等距抽取 (默认 50)
  --size 192            输出 APNG 边长, 192 = 桌宠标准 (默认 192)
  --duration 132        APNG 每帧 ms (默认 132ms, 50 帧 ≈ 6.6s 一循环)
  --disposal 0          APNG disposal, 0=不合并 (推荐, 避免 PIL 合并相同帧)
  --loop 1              APNG loop count (1 = play once for event-driven, 0 = infinite)
  --chromakey {v3,v4}   chroma key 版本 (默认 v4)

Verified: 2026-08-21 W1 D5, 01-detective-study (H3 96.58% 相似, 桌宠透明 OK)
Updated: 2026-09-09, v3 → v4 修复"白底偏绿被抠成半透" 眼睛下边缘 regression
"""
import argparse
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

import numpy as np
from PIL import Image


def extract_frames(mp4: Path, fps: int, out_dir: Path) -> int:
    """ffmpeg 抽帧: mp4 → PNG 序列"""
    print(f"[1/4] ffmpeg extract @ {fps}fps → {out_dir}/")
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


def chromakey_v3(arr: np.ndarray) -> np.ndarray:
    """v3 chroma key: G - max(R,B) 阈值法, 中性色完全不透明.

    Args:
        arr: HxWx3 uint8 RGB 数组
    Returns:
        HxW uint8 alpha 数组 (255=不透明, 0=透明)
    """
    r, g, b = arr[:, :, 0], arr[:, :, 1], arr[:, :, 2]
    diff = g.astype(int) - np.maximum(r, b).astype(int)
    is_green = (g > 100) & (r < 150) & (b < 150) & (diff > 30)
    # 软边界: 0 (diff ≤ 10) → 1.0 (diff ≥ 30)
    greenness = np.clip((diff - 10) / 20.0, 0.0, 1.0)
    greenness = np.where(is_green, 1.0, greenness)
    return ((1.0 - greenness) * 255).astype(np.uint8)


def chromakey_v4(arr: np.ndarray) -> np.ndarray:
    """v4 chroma key: 相对绿度 (G - max(R,B)) / G, 阈值化.

    v3 问题: 白色眼底的微小绿影 (e.g. RGB 164,182,150) G-R=18 → alpha=153 半透,
    桌宠眼睛下边缘显"高亮透明" 效果 (2026-09-09 用户反馈).

    v4 改进: 把 G 差归一化到 G 本身, 形成" 绿在 G 里的占比"指标.
    暗绿 (17,44,15) 相对绿度 0.61 → 透明; 白底偏绿 (164,182,150) 相对绿度 0.10 → 不透;
    纯白/纯黑/章鱼皮肤/黄/阴影 → 全部不透.

    v4 regression (2026-09-09 用户第二轮反馈): H3 模型在脸颊/触手上产生
    深绿阴影 (RGB ~22,45,7) 被 v4 误判为绿, alpha=0, 桌宠透出白底 → 身体上
    出现"白色斑块" (脸颊下方 + 左右触手). 修法: max(R,G,B) < 80 (深色阴影)
    强制 alpha=255 — 这是低亮度阴影, 不是绿幕主区 (绿幕主区 R=4,G=237,B=1).

    Args:
        arr: HxWx3 uint8 RGB 数组
    Returns:
        HxW uint8 alpha 数组 (255=不透明, 0=透明)
    """
    r, g, b = arr[:, :, 0].astype(int), arr[:, :, 1].astype(int), arr[:, :, 2].astype(int)
    g_max_rb = g - np.maximum(r, b)  # 绿度差
    # 相对绿度: 绿度差 / G 本身, 归一化到 0-1 (G=0 时保护 0)
    rel_green = np.where(g > 0, g_max_rb / np.maximum(g, 1), 0.0)
    # 软边界: 0.2 以下完全不透明, 0.5 以上完全透明
    greenness = np.clip((rel_green - 0.2) / 0.3, 0.0, 1.0)
    alpha = ((1.0 - greenness) * 255).astype(np.uint8)
    # 深色阴影保护: max(R,G,B) < 80 强制不透明, 避免深绿阴影被当绿幕扣
    max_rgb = np.maximum(np.maximum(r, g), b)
    alpha = np.where(max_rgb < 80, 255, alpha).astype(np.uint8)
    return alpha


def process_frames(
    src_dir: Path, indices: list[int], size: int, chromakey: str = "v4"
) -> list[Image.Image]:
    """加载 + resize + chroma key → RGBA PIL Image 列表"""
    print(f"[2/4] load {len(indices)} frames, resize to {size}x{size}, chroma key {chromakey}...")
    chromakey_fn = chromakey_v3 if chromakey == "v3" else chromakey_v4
    images = []
    for i in indices:
        img = Image.open(src_dir / f"frame_{i:03d}.png").convert("RGB")
        if img.size != (size, size):
            img = img.resize((size, size), Image.LANCZOS)
        arr = np.array(img)
        alpha = chromakey_fn(arr)
        rgba = np.dstack([arr, alpha])
        images.append(Image.fromarray(rgba, mode="RGBA"))
    print(f"        → {len(images)} RGBA frames ready")
    return images


def save_apng(images: list[Image.Image], out: Path, duration: int, disposal: int, loop: int = 1) -> None:
    """PIL APNG 输出.

    loop: APNG acTL num_plays 字段
        0 = infinite (浏览器原生 <img> 会一直循环)
        1 = play once (event-driven 切 scene 的正确选择 — apng-js 会在播完 1 次后 emit 'end')
        N = N 次
    V1.5 默认 loop=1, 配合桌宠 8s 切 scene 的事件驱动设计.
    如果要"无限循环播放" (e.g. 闲置 idle 动画), 用 --loop 0.
    """
    print(f"[3/4] APNG save: {out} ({len(images)} frames × {duration}ms, loop={loop})")
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
    """验证输出: 模式/帧数/首帧 alpha"""
    print(f"[4/4] verify {out.name}")
    img = Image.open(out)
    img.seek(0)
    arr = np.array(img)
    print(f"        → mode={img.mode}, n_frames={getattr(img, 'n_frames', 1)}, "
          f"size={img.size}, first_alpha0_ratio={(arr[:,:,3]==0).sum()/arr[:,:,3].size*100:.1f}%")


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[1] if __doc__ else "")
    ap.add_argument("--input", "-i", required=True, type=Path, help="Input mp4 path")
    ap.add_argument("--output", "-o", required=True, type=Path, help="Output APNG path")
    ap.add_argument("--fps", type=int, default=15, help="Extract fps (default 15)")
    ap.add_argument("--frame-count", type=int, default=50, help="Final frame count (default 50)")
    ap.add_argument("--size", type=int, default=192, help="Output size (default 192)")
    ap.add_argument("--duration", type=int, default=132, help="APNG ms/frame (default 132)")
    ap.add_argument("--disposal", type=int, default=0, help="APNG disposal (default 0)")
    ap.add_argument("--loop", type=int, default=1, help="APNG loop count (default 1 = play once; 0 = infinite)")
    ap.add_argument("--chromakey", choices=["v3", "v4"], default="v4", help="Chroma key version (default v4)")
    ap.add_argument("--keep-temp", action="store_true", help="Keep temp frame dir")
    args = ap.parse_args()

    if not args.input.exists():
        print(f"ERROR: input not found: {args.input}", file=sys.stderr)
        return 1

    args.output.parent.mkdir(parents=True, exist_ok=True)

    with tempfile.TemporaryDirectory(prefix="chromakey-") as tmp:
        tmp_dir = Path(tmp)
        n_total = extract_frames(args.input, args.fps, tmp_dir)
        if n_total == 0:
            print("ERROR: 0 frames extracted", file=sys.stderr)
            return 1
        indices = sample_indices(n_total, args.frame_count)
        print(f"        → sample {len(indices)} from {n_total}: {indices[:3]}...{indices[-3:]}")
        images = process_frames(tmp_dir, indices, args.size, args.chromakey)
        save_apng(images, args.output, args.duration, args.disposal, args.loop)
        if args.keep_temp:
            shutil.copytree(tmp_dir, args.output.with_suffix(".frames"))
            print(f"        → temp frames kept at {args.output.with_suffix('.frames')}")
        verify_apng(args.output)

    print("\n✅ Ready for Vite HMR / Tauri dev (replace breath-idle.png)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
