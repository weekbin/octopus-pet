#!/usr/bin/env python3
"""
extract-v10-final-postfix-flicker.py — 修复 v10-final 输出 APNG 的 flicker + 模板姿势卡顿

v10-final (BiRefNet + CorridorKey) 在某些 H3 帧上 alpha mask 不稳定:
  - 1-frame flicker: 同一像素 RGB 高 (是身体) 但 alpha 偶发 <150, 下一帧又 255
  - 整章鱼空白帧: 某些 H3 帧 CorridorKey 整章鱼 alpha ≈ 0 (worst case 17-celebrate
    f16-f21 连续 6 帧 alpha_mean=4)
  - sub-silhouette 位置性 uncertain (v6 新覆盖): 整帧 alpha_mean 不低 (60-100), 但某些身体
    区域在 ±K 帧窗口内 consistently low confidence (32-laugh f42-f48 大笑爆发
    帧), Pass 1 per-pixel ±7 max 抓不到因为同位置像素一直低

disposal=2 下三类问题视觉都是闪烁/章鱼挖洞再补.

修复算法 v7 (four-pass):
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

  Pass 3 — sub-silhouette temporal median filter:
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

  Pass 4 — global per-pixel majority voting (v7 新增):
    治 v10-final 在某些像素位置 consistently 给低 alpha (不是 flicker, 是
    模型 uncertain — Pass 3 median 抓不到因为 ±5 帧也都不透明次数不够).
    跨全部 99 帧 (loop cycle) 计算每个像素 alpha>=200 的帧数, ≥70% 视为
    "稳定章鱼身体像素", 所有帧 curr_a<200 都 fill 到 255.
    70% 阈值平衡: 60% 会 fill 姿势切换帧 (32-laugh 大笑爆发, 嘴张开/合拢时
    某些像素从"嘴外身体" 切换为 "嘴内背景"). 80% 覆盖不足.
    70% = sweet spot (5 场景验证 lt150 残留从 v6 数千降到 ~500, 0 闪烁).

Pass 2 关键:
  - 阈值 alpha_mean<60 (覆盖半透明章鱼如 32-laugh f42)
  - 模板帧 alpha_mean > 80 (章鱼完整)
  - sil_mask (template_a>200) & (curr_a<200) 覆盖整个 silhouette
  - RGB 必须一起复制 (空白帧 silhouette RGB 被腐蚀成黑色, 只复制 alpha
    出来章鱼变暗红黑色 — 验证失败)

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
    """修复 v10-final 输出 APNG. Pass 1 + Pass 3 + Pass 4 (v8: Pass 2 取消)."""
    img = Image.open(apng_path)
    n = img.n_frames
    frames: list[np.ndarray] = []
    for i in range(n):
        img.seek(i)
        frames.append(np.array(img.copy().convert("RGBA")))

    pass1_fixed = 0
    pass3_fixed = 0
    pass4_fixed = 0

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

    # ── Pass 2: REMOVED in v8 ──
    # v7 的 Pass 2 模板替换有根本性缺陷: 模板帧 silhouette (alpha>200) ≠ 当前
    # transparent 帧的 silhouette. 大笑爆发帧 (32-laugh f030 笑姿势 vs 大笑姿势)
    # 模板替换后撕裂章鱼. v8 取消 Pass 2, transparent 帧完全交给 Pass 4 跨帧
    # median RGB fill stable_mask — stable body 区域 (头部/触手等不变量) 跨帧
    # median RGB 稳定 → 章鱼完整; 姿势变化区域 (嘴/眼) median 混合 → 轻微模糊
    # 但章鱼"在" + 无撕裂 (比 v7 挖洞/半脸好).

    # ── Pass 3: sub-silhouette temporal median filter ──

    # ── Pass 3: sub-silhouette temporal median filter ──
    # 治 v10-final 在某些帧上 silhouette 内部某些像素位置 consistently low
    # confidence (32-laugh f44-f48 大笑爆发, raw alpha_mean 60-100 但 body
    # 像素 ±7 帧位置都低). Pass 1 ±7 max 抓不到.
    # median 比 max 更鲁棒: 只要 ≥3/11 帧不透明就修.
    # v8 不再跳过 Pass 2 命中帧 (Pass 2 取消).
    W = 5  # half-window for median
    for i in range(W, n - W):
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

    # ── Pass 4: global per-pixel majority voting + cross-frame median RGB fill (v8 升级) ──
    # 治 v10-final transparent 帧 (32-laugh f030 raw 99.93% transparent, 大笑
    # 爆发姿势 unmixing 完全失败). 跨全部 99 帧 (loop cycle) 计算每像素
    # alpha>=200 帧数, ≥70% 视为"稳定章鱼身体像素" → stable_mask.
    # 对每帧 fill stable_mask 内 alpha<200 像素:
    #   - alpha = 255
    #   - RGB = 跨 99 帧 median RGB (stable body 区域 median 稳定 → 章鱼完整,
    #     姿势变化区域 median 混合 → 轻微姿势模糊但无撕裂/挖洞)
    # 取消 v7 的 rgb_sum>300 守卫 — 该守卫会让 transparent 帧 (RGB sum<300)
    # 完全无法 fill, transparent 帧章鱼消失. v8 不管 RGB sum 直接 fill.
    # 70% 阈值平衡: 60% 会 fill 姿势切换帧 (32-laugh 大笑爆发, 嘴张开/合拢时
    # 某些像素从"嘴外身体" 切换为 "嘴内背景"). 80% 覆盖不足.
    # 跑所有帧 (Pass 2 已取消, 无跳过逻辑).
    threshold = int(n * 0.7)
    # 跨全部帧堆叠 alpha channel: (n, H, W)
    stack_all = np.stack([frames[i][:, :, 3] for i in range(n)], axis=0)
    visible_count = (stack_all >= 200).sum(axis=0)  # (H, W)
    stable_mask = visible_count >= threshold  # (H, W)

    # 跨全部帧算每像素 median RGB — 给 transparent 帧 fill 用
    # 内存: 99 × 192 × 192 × 3 × uint8 = 10.7 MB (单场景, 可接受)
    stack_rgb = np.stack([frames[i][:, :, :3] for i in range(n)], axis=0)  # (n, H, W, 3)
    median_rgb = np.median(stack_rgb, axis=0).astype(np.uint8)  # (H, W, 3)

    for i in range(n):
        curr_a = frames[i][:, :, 3]
        # stable body 位置 + alpha<200 → fill alpha=255 + RGB = cross-frame median
        mask = stable_mask & (curr_a < 200)
        if mask.any():
            frames[i][mask, :3] = median_rgb[mask]
            frames[i][mask, 3] = 255
        pass4_fixed += int(mask.sum())

    return _save(frames, out_path or apng_path, n, pass1_fixed, pass3_fixed, pass4_fixed)


def _save(frames, out_path, n, pass1_fixed, pass3_fixed, pass4_fixed):
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
        "pass3_sub_silhouette_fixed": pass3_fixed,
        "pass4_majority_voting_fixed": pass4_fixed,
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
    total_p3 = 0
    total_p4 = 0
    print(f"[v10-final-postfix-flicker] processing {len(scenes)} scenes (v8 three-pass: Pass 2 removed)")
    for scene in scenes:
        archive_path = f"{ARCHIVE}/v10-final-{scene}.png"
        live_path = f"{INPUT_DIR}/{scene}.png"
        if not os.path.exists(archive_path):
            print(f"  skip {scene}: no archive at {archive_path}")
            continue
        result = fix_flicker(archive_path, live_path)
        total_p1 += result["pass1_flicker_fixed"]
        total_p3 += result["pass3_sub_silhouette_fixed"]
        total_p4 += result["pass4_majority_voting_fixed"]
        print(
            f"  {scene}: pass1={result['pass1_flicker_fixed']} flicker pixels, "
            f"pass3={result['pass3_sub_silhouette_fixed']} sub-silhouette pixels, "
            f"pass4={result['pass4_majority_voting_fixed']} majority-voting pixels"
        )
    print(
        f"[v10-final-postfix-flicker] total pass1={total_p1} flicker pixels, "
        f"pass3={total_p3} sub-silhouette pixels, pass4={total_p4} majority-voting pixels"
    )


if __name__ == "__main__":
    main()