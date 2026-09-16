#!/usr/bin/env python3
"""
extract-v10-final-postfix-flicker.py — 修复 v10-final 输出 APNG 的 1-frame flicker

v10-final (BiRefNet + CorridorKey) 在某些 H3 帧上 alpha mask 不稳定:
同一像素 RGB 高 (明显是身体) 但 alpha 偶发 < 100, 下一帧又恢复 255.
disposal=2 + 这种 1-frame alpha 掉到 0 → 浏览器渲染视觉像身体被挖洞再恢复 → 闪烁.

修复算法 (temporal, 3-frame window):
  对每帧 f_i, 检测像素 p:
    (a) p 在 f_i alpha < 100 (本帧透明)
    (b) p 在 f_i RGB sum > 300 (本帧 RGB 是身体色, 不是绿幕)
    (c) p 在 f_{i-1} alpha > 200 (前帧不透明)
    (d) p 在 f_{i+1} alpha > 200 (后帧不透明)
  (a) + (b) + (c) + (d) 同时满足 → f_i[p].alpha = 255

这个 3-frame window 是关键: 单帧 alpha 抖动被前后帧锚定, 不会被误保
(实际真有透明道具/手挥过的单帧, 前后帧 alpha 也低 → 不会被填).

输出: 修复后的 APNG (PIL save_all, disposal=2, loop=1, duration=66).
"""
import os
import sys
import numpy as np
from PIL import Image

# 同 scene_registry_generated 风格, 默认处理 v2 APNG dir + archive
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
INPUT_DIR = f"{ROOT}/app/public/assets/octopus/v2"
ARCHIVE = "/tmp/v10-final-archive"
os.makedirs(ARCHIVE, exist_ok=True)


def fix_flicker(apng_path: str, out_path: str | None = None) -> dict:
    """修复单场景 APNG 的 1-frame flicker. 返回修复像素统计.

    Algorithm v2 (5-frame window + relaxed alpha):
      For each frame f_i, look at ±2 frame window. Detect pixel p where:
        (a) f_i alpha[p] < 150 (本帧半透/透明)
        (b) f_i RGB[p] 是身体色 (sum > 300, 非绿幕)
        (c) max alpha in {f_{i-2}, f_{i-1}, f_{i+1}, f_{i+2}} >= 200 (近邻帧有 opaque)
      → fill f_i[p].alpha = 255

    Why ±2 vs ±1: 实际 flicker 模式可能跨 2 帧 (e.g. 200→80→80→200), 单看 ±1 抓不到.
    Why <150 vs <100: 真实 alpha 抖动可能到 80-150 区间 (不完全 0), 阈值放宽避免漏.
    """
    img = Image.open(apng_path)
    n = img.n_frames
    # 加载所有帧 RGBA 数组
    frames: list[np.ndarray] = []
    for i in range(n):
        img.seek(i)
        frames.append(np.array(img.copy().convert("RGBA")))

    # 5-frame window: ±2 frame
    fixed_mask = np.zeros((192, 192), dtype=bool)
    for i in range(2, n - 2):
        curr_a = frames[i][:, :, 3]
        curr_rgb = frames[i][:, :, :3]
        rgb_sum = curr_rgb.sum(axis=2)
        # 近邻 4 帧的最大 alpha
        neighbor_max_a = np.maximum.reduce([
            frames[i - 1][:, :, 3],
            frames[i - 2][:, :, 3],
            frames[i + 1][:, :, 3],
            frames[i + 2][:, :, 3],
        ])
        mask = (
            (curr_a < 150)
            & (rgb_sum > 300)            # RGB 是身体色, 不是绿幕
            & (neighbor_max_a >= 200)     # 近邻至少一帧不透明
        )
        frames[i][:, :, 3] = np.where(mask, 255, curr_a).astype(np.uint8)
        fixed_mask |= mask

    out_path = out_path or apng_path
    # 重新保存为 APNG, 沿用 v10-final 参数 (disposal=2, loop=1, duration=66)
    pil_frames = [Image.fromarray(f, mode="RGBA") for f in frames]
    pil_frames[0].save(
        out_path,
        format="PNG",
        save_all=True,
        append_images=pil_frames[1:],
        duration=66,
        loop=1,
        disposal=2,
    )
    return {
        "path": out_path,
        "n_frames": n,
        "pixels_fixed": int(fixed_mask.sum()),
    }


def main():
    if len(sys.argv) > 1:
        scenes = sys.argv[1:]
    else:
        # 默认: 处理 archive 里所有 v10-final APNG
        scenes = sorted(
            f.replace("v10-final-", "").replace(".png", "")
            for f in os.listdir(ARCHIVE)
            if f.startswith("v10-final-") and f.endswith(".png")
        )

    total_fixed = 0
    print(f"[v10-final-postfix-flicker] processing {len(scenes)} scenes")
    for scene in scenes:
        archive_path = f"{ARCHIVE}/v10-final-{scene}.png"
        live_path = f"{INPUT_DIR}/{scene}.png"
        if not os.path.exists(archive_path):
            print(f"  skip {scene}: no archive at {archive_path}")
            continue
        # archive (raw v10-final, immutable) → live v2 (post-fixed). archive 永远保留 raw
        result = fix_flicker(archive_path, live_path)
        total_fixed += result["pixels_fixed"]
        print(f"  {scene}: fixed {result['pixels_fixed']} pixels (1-frame flicker)")
    print(f"[v10-final-postfix-flicker] total {total_fixed} pixels fixed")


if __name__ == "__main__":
    main()