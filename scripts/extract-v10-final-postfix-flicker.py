#!/usr/bin/env python3
"""
extract-v10-final-postfix-flicker.py — 修复 v10-final 输出 APNG 的两类问题

v10-final (BiRefNet + CorridorKey) 在某些 H3 帧上 alpha mask 不稳定:
  - 1-frame flicker: 同一像素 RGB 高 (是身体) 但 alpha 偶发 <150, 下一帧又 255
  - 整章鱼空白帧: 某些 H3 帧 CorridorKey 整章鱼 alpha ≈ 0 (worst case 17-celebrate
    f16-f21 连续 6 帧 alpha_mean=4)
  - sub-silhouette 抖动 (v6 新覆盖): 整帧 alpha_mean 不低 (60-100), 但某些身体
    区域在 ±K 帧窗口内 consistently low confidence (32-laugh f42-f48 大笑爆发
    帧), Pass 1 per-pixel ±7 max 抓不到因为同位置像素一直低

disposal=2 下三类问题视觉都是闪烁/章鱼挖洞再补.

修复算法 v6 (three-pass):
  Pass 1 — per-pixel temporal fill (修 1-frame flicker, v5 沿用):
    对每帧 f_i (i ∈ [7, n-7]), 检测像素 p:
      (a) f_i alpha[p] < 150
      (b) f_i RGB sum > 300 (是身体色, 不是绿幕)
      (c) ±7 帧 max alpha ≥ 200
    → fill alpha=255

  Pass 2 — bad-frame template replace (修整章鱼空白帧, v5 升级阈值):
    对每帧 f_i, 检测 alpha_mean < 60 (整章鱼空白/半空白异常帧):
      → 找最近的不透明模板帧 f_{i±k}, 复制其 silhouette RGB+alpha 覆盖 f_i
    限定 ±15 帧范围内找. 模板帧 alpha_mean>80 守卫保证章鱼完整.
    v5 alpha_mean<30 → v6 alpha_mean<60 (覆盖 32-laugh f42 raw=37.5 半透明章鱼).

  Pass 3 — sub-silhouette temporal median filter (v6 新增):
    对每帧 f_i (i ∈ [5, n-5]), 检测像素 p:
      (a) f_i alpha[p] < 200
      (b) f_i RGB sum > 300 (是身体色)
      (c) ±5 帧 alpha **中位数** ≥ 200 (邻居位置像素 consistently 不透明)
    → fill alpha=255
    治 v10-final 在大笑爆发等帧"位置性"low confidence:
    Pass 1 ±7 max 抓不到因为同位置像素连续 7 帧都低 (alpha 持续 50-180).
    median 比 max 更鲁棒 — 只要 ≥3/11 帧不透明就修.
    **跳过 Pass 2 命中帧** (template 替换 silhouette 后 Pass 3 不再覆盖, 否则
    半透明章鱼帧如 32-laugh f42 raw=37.5 会"半脸": Pass 2 模板替换左半 + Pass 3
    median 修右半 → 左右姿势不一致).

Pass 2 v6 关键变更:
  - 阈值 alpha_mean<30 → alpha_mean<60 (覆盖半透明章鱼如 32-laugh f42)
  - sil_mask alpha<100 → alpha<200 (Pass 2 复制覆盖整个 silhouette 不只是边缘,
    否则 Pass 3 median 修剩余 silhouette 像素造成姿势混合)

Pass 2 关键:
  - 模板帧必须是 alpha_mean > 80 (完整章鱼, 不是半章鱼)
  - 复制 alpha mask 但 RGB 必须一起复制 (空白帧 silhouette RGB 被腐蚀成
    黑色背景, 只复制 alpha 出来章鱼变暗红黑色 — 验证失败).

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
    """修复 v10-final 输出 APNG. Pass 1 + Pass 2 + Pass 3."""
    img = Image.open(apng_path)
    n = img.n_frames
    frames: list[np.ndarray] = []
    for i in range(n):
        img.seek(i)
        frames.append(np.array(img.copy().convert("RGBA")))

    pass1_fixed = 0
    pass2_replaced = 0
    pass3_fixed = 0
    pass2_hit_frames: set[int] = set()  # Pass 2 命中帧, Pass 3 跳过避免冲突

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
        return _save(frames, out_path or apng_path, n, pass1_fixed, pass2_replaced, pass3_fixed)

    for i in range(n):
        a = frames[i][:, :, 3]
        # 异常帧判定: alpha_mean < 60 (v6 放宽, 覆盖半透明章鱼帧)
        if a.mean() >= 60:
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
        # silhouette mask: 模板帧 alpha>200 (完整章鱼身体色), 当前帧 alpha<200
        # v6 放宽阈值: alpha<100 → alpha<200, 覆盖整个 silhouette 不只是边缘.
        # 否则半透明章鱼帧 (32-laugh f42 raw=37.5) 替换后 silhouette 内
        # 仍有半透像素, Pass 3 median 修了"原始姿势"像素 → 半脸 (左脸模板 + 右脸原始).
        sil_mask = (template_a > 200) & (curr_a < 200)
        # 替换 silhouette 像素 RGB + alpha 用模板值
        frames[i][sil_mask, :3] = template[sil_mask, :3]
        frames[i][sil_mask, 3] = template_a[sil_mask]
        pass2_replaced += 1
        pass2_hit_frames.add(i)

    # ── Pass 3: sub-silhouette temporal median filter (v6 新增) ──
    # 治 v10-final 在某些帧上 silhouette 内部某些像素位置 consistently low
    # confidence (32-laugh f44-f48 大笑爆发, raw alpha_mean 60-100 但 body
    # 像素 ±7 帧位置都低). Pass 1 ±7 max 抓不到.
    # median 比 max 更鲁棒: 只要 ≥3/11 帧不透明就修.
    # 跳过 Pass 2 命中帧避免与模板替换冲突 (f42 半脸问题根因).
    W = 5  # half-window for median
    for i in range(W, n - W):
        if i in pass2_hit_frames:
            continue  # 模板已替换 silhouette, Pass 3 不再覆盖
        curr_a = frames[i][:, :, 3]
        curr_rgb = frames[i][:, :, :3]
        rgb_sum = curr_rgb.sum(axis=2)
        # 收集 ±W 帧 alpha, 11 个样本
        stack = np.stack(
            [frames[i + j][:, :, 3] for j in range(-W, W + 1)], axis=0
        )  # (11, H, W)
        median_a = np.median(stack, axis=0)
        mask = (
            (curr_a < 200)
            & (rgb_sum > 300)
            & (median_a >= 200)
        )
        frames[i][:, :, 3] = np.where(mask, 255, curr_a).astype(np.uint8)
        pass3_fixed += int(mask.sum())

    return _save(frames, out_path or apng_path, n, pass1_fixed, pass2_replaced, pass3_fixed)


def _save(frames, out_path, n, pass1_fixed, pass2_replaced, pass3_fixed):
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
        "pass3_sub_silhouette_fixed": pass3_fixed,
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
    total_p3 = 0
    print(f"[v10-final-postfix-flicker] processing {len(scenes)} scenes (v6 three-pass)")
    for scene in scenes:
        archive_path = f"{ARCHIVE}/v10-final-{scene}.png"
        live_path = f"{INPUT_DIR}/{scene}.png"
        if not os.path.exists(archive_path):
            print(f"  skip {scene}: no archive at {archive_path}")
            continue
        result = fix_flicker(archive_path, live_path)
        total_p1 += result["pass1_flicker_fixed"]
        total_p2 += result["pass2_frames_replaced"]
        total_p3 += result["pass3_sub_silhouette_fixed"]
        print(
            f"  {scene}: pass1={result['pass1_flicker_fixed']} flicker pixels, "
            f"pass2={result['pass2_frames_replaced']} bad-frames replaced, "
            f"pass3={result['pass3_sub_silhouette_fixed']} sub-silhouette pixels"
        )
    print(
        f"[v10-final-postfix-flicker] total pass1={total_p1} flicker pixels, "
        f"pass2={total_p2} bad-frames replaced, pass3={total_p3} sub-silhouette pixels"
    )


if __name__ == "__main__":
    main()