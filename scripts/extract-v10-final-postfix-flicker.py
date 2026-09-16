#!/usr/bin/env python3
"""
extract-v10-final-postfix-flicker.py — 修复 v10-final 输出 APNG 的两类问题

v10-final (BiRefNet + CorridorKey) 在某些 H3 帧上 alpha mask 不稳定:
  - 1-frame flicker: 同一像素 RGB 高 (是身体) 但 alpha 偶发 <150, 下一帧又 255
  - 整章鱼空白帧: 某些 H3 帧 CorridorKey 整章鱼 alpha ≈ 0 (worst case 17-celebrate
    f16-f21 连续 6 帧 alpha_mean=4)

disposal=2 下两类问题视觉都是闪烁/章鱼挖洞再补.

修复算法 v5 (two-pass):
  Pass 1 — per-pixel temporal fill (修 1-frame flicker):
    对每帧 f_i (i ∈ [7, n-7]), 检测像素 p:
      (a) f_i alpha[p] < 150
      (b) f_i RGB sum > 300 (是身体色, 不是绿幕)
      (c) ±7 帧 max alpha ≥ 200
    → fill alpha=255

  Pass 2 — bad-frame template replace (修整章鱼空白帧):
    对每帧 f_i, 检测 alpha_mean < 30 (整章鱼空白异常帧):
      → 找最近的不透明帧 f_{i±k}, 复制其 alpha mask 覆盖 f_i
    限定 ±15 帧范围内找. k>15 章鱼姿势差异大, 不再可靠.

Pass 2 关键:
  - 模板帧必须是 RGB sum > 300 像素 > 5000 (完整章鱼, 不是半章鱼)
  - 复制 alpha mask 但保留 f_i 的 RGB 内容 (避免 RGB 错位)

输出: 修复后的 APNG (PIL save_all, disposal=2, loop=1, duration=66).
"""
import os
import sys
import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
INPUT_DIR = f"{ROOT}/app/public/assets/octopus/v2"
ARCHIVE = "/tmp/v10-final-archive"
os.makedirs(ARCHIVE, exist_ok=True)


def fix_flicker(apng_path: str, out_path: str | None = None) -> dict:
    """修复 v10-final 输出 APNG. Pass 1 + Pass 2."""
    img = Image.open(apng_path)
    n = img.n_frames
    frames: list[np.ndarray] = []
    for i in range(n):
        img.seek(i)
        frames.append(np.array(img.copy().convert("RGBA")))

    pass1_fixed = 0
    pass2_replaced = 0

    # ── Pass 1: per-pixel temporal fill (1-frame flicker) ──
    for i in range(7, n - 7):
        curr_a = frames[i][:, :, 3]
        curr_rgb = frames[i][:, :, :3]
        rgb_sum = curr_rgb.sum(axis=2)
        neighbor_max_a = np.maximum.reduce(
            [frames[i - j][:, :, 3] for j in range(1, 8)]
            + [frames[i + j][:, :, 3] for j in range(1, 8)]
        )
        mask = (
            (curr_a < 150)
            & (rgb_sum > 300)
            & (neighbor_max_a >= 200)
        )
        frames[i][:, :, 3] = np.where(mask, 255, curr_a).astype(np.uint8)
        pass1_fixed += int(mask.sum())

    # ── Pass 2: bad-frame template replace (整章鱼空白/半空白) ──
    # 模板帧: alpha_mean > 80 (章鱼完整可见)
    full_frames = [i for i in range(n) if frames[i][:, :, 3].mean() > 80]
    if not full_frames:
        return _save(frames, out_path or apng_path, n, pass1_fixed, pass2_replaced)

    for i in range(n):
        a = frames[i][:, :, 3]
        # 异常帧判定: alpha_mean < 30 (整章鱼空白)
        if a.mean() >= 30:
            continue
        # 找最近模板帧
        best = min(full_frames, key=lambda k: abs(k - i))
        if abs(best - i) > 15:
            continue
        # 用模板帧的 RGBA 直接替换 silhouette 区域
        # 为什么必须 RGB: 当前帧 alpha<100 像素的 RGB 通常被 v10-final 腐蚀成黑色
        # (整段 alpha=0 把 silhouette 边缘 RGB 也变成背景绿/黑). 只复制 alpha mask
        # 出来章鱼变暗红黑色 (f16 验证). 必须 RGB + alpha 一起从模板复制.
        # 章鱼姿势变化小, RGB 模板替换视觉上章鱼"轻微卡顿", 但比空白好.
        template = frames[best]
        template_a = template[:, :, 3]
        curr_a = a
        # silhouette mask: 模板帧 alpha>100, 当前帧 alpha<100 (要修的像素)
        sil_mask = (template_a > 100) & (curr_a < 100)
        # 替换 silhouette 像素 RGB + alpha 用模板值
        frames[i][sil_mask, :3] = template[sil_mask, :3]
        frames[i][sil_mask, 3] = template_a[sil_mask]
        pass2_replaced += 1

    return _save(frames, out_path or apng_path, n, pass1_fixed, pass2_replaced)


def _save(frames, out_path, n, pass1_fixed, pass2_replaced):
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
        "pass1_flicker_fixed": pass1_fixed,
        "pass2_frames_replaced": pass2_replaced,
    }


def main():
    if len(sys.argv) > 1:
        scenes = sys.argv[1:]
    else:
        scenes = sorted(
            f.replace("v10-final-", "").replace(".png", "")
            for f in os.listdir(ARCHIVE)
            if f.startswith("v10-final-") and f.endswith(".png")
        )

    total_p1 = 0
    total_p2 = 0
    print(f"[v10-final-postfix-flicker] processing {len(scenes)} scenes (v5 two-pass)")
    for scene in scenes:
        archive_path = f"{ARCHIVE}/v10-final-{scene}.png"
        live_path = f"{INPUT_DIR}/{scene}.png"
        if not os.path.exists(archive_path):
            print(f"  skip {scene}: no archive at {archive_path}")
            continue
        result = fix_flicker(archive_path, live_path)
        total_p1 += result["pass1_flicker_fixed"]
        total_p2 += result["pass2_frames_replaced"]
        print(
            f"  {scene}: pass1={result['pass1_flicker_fixed']} flicker pixels, "
            f"pass2={result['pass2_frames_replaced']} bad-frames replaced"
        )
    print(
        f"[v10-final-postfix-flicker] total pass1={total_p1} flicker pixels, "
        f"pass2={total_p2} bad-frames replaced"
    )


if __name__ == "__main__":
    main()