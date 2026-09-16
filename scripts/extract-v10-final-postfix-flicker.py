#!/usr/bin/env python3
"""
extract-v10-final-postfix-flicker.py — 修复 v10-final 输出 APNG 的 flicker + 透明帧

v10-final (BiRefNet + CorridorKey) 在某些 H3 帧上 alpha mask 不稳定:
  - 1-frame flicker: 同一像素 RGB 高 (是身体) 但 alpha 偶发 <150, 下一帧又 255
  - 整章鱼空白帧: 某些 H3 帧 CorridorKey 整章鱼 alpha ≈ 0 (worst case 17-celebrate
    f16-f21 连续 6 帧 alpha_mean=4)
  - sub-silhouette 位置性 uncertain: 整帧 alpha_mean 不低 (60-100), 但某些身体
    区域在 ±K 帧窗口内 consistently low confidence (32-laugh f42-f48 大笑爆发
    帧), Pass 1 per-pixel ±7 max 抓不到因为同位置像素一直低
  - 稳定身体像素 uncertain: 整像素位置跨 99 帧 consistently 给低 alpha (不是
    flicker, 模型整个位置性 uncertain)

disposal=2 下四类问题视觉都是闪烁/章鱼挖洞再补.

修复算法 v9 (four-pass):
  Pass 1 — per-pixel temporal fill (修 1-frame flicker, v5 沿用):
    对每帧 f_i (i ∈ [7, n-7]), 检测像素 p:
      (a) f_i alpha[p] < 150
      (b) f_i RGB sum > 300 (是身体色, 不是绿幕)
      (c) ±7 帧 max alpha ≥ 200
    → fill alpha=255

  Pass 2 — bad-frame **silhouette 内 transparent 像素 fill** (修整章鱼空白帧, v9 v2 重写):
    v9 v1 用 `frames[i] = frames[i-1].copy()` 整帧替换 cascading — PIL APNG encoder
    (disposal=2) 把 cascading 帧错编码成 raw transparent → saved file 视觉上 = 拑洞
    (saved f012 opaque=538 vs in-memory f012=17558). 改用 silhouette 内 fill:
    对每帧 f_i (i ∈ [1, n-1]), 检测 alpha<100 像素数 > 28000 (完全空白):
      (a) silhouette mask: ±5 帧 alpha median >= 200
      (b) 当前 transparent + silhouette 内 → fill alpha=255 + RGB=prev_frame RGB
    保留 raw transparent 背景 (alpha=0), encoder 看到帧 pixel 跟 raw transparent
    不同 (有 silhouette fill), 不触发 cascading 优化 → saved file n_frames=99 + 视觉
    正确. fill RGB = prev_frame = 同 cycle 相邻帧 (时间连续, 姿势清晰, 无撕裂无鬼影).
    多帧连续 transparent (17-celebrate f16-f21 6 帧) → 每帧独立 fill silhouette,
    章鱼姿势是 prev_frame (= 前一完整帧) 姿势重复 6×66ms=396ms, 比挖洞/撕裂/鬼影好.

  Pass 3 — sub-silhouette temporal median filter:
    对每帧 f_i (i ∈ [5, n-5]), 检测像素 p:
      (a) f_i alpha[p] < 200
      (b) f_i RGB sum > 300 (是身体色)
      (c) ±5 帧 alpha **中位数** ≥ 200
    → fill alpha=255
    治 v10-final 在大笑爆发等帧"位置性"low confidence.
    跳过 Pass 2 命中帧 (前一帧整帧替换后 Pass 3 不再覆盖).

  Pass 4 — global per-pixel majority voting + **前帧 RGB fill** (v9 重写):
    治 v10-final 在某些像素位置 consistently 给低 alpha.
    跨全部 99 帧计算每像素 alpha>=200 帧数, ≥70% 视为"稳定章鱼身体像素"
    → stable_mask.
    对每帧 fill stable_mask 内 alpha<200 像素:
      - alpha = 255
      - RGB = **前一帧 (i-1) 在同位置的 RGB** (而非 v8 的跨帧 median)
    治 v8 的"姿势鬼影" — 前一帧是完整身体帧, RGB 是清晰的姿势色, 不会像
    跨帧 median 那样把"眯眼/睁眼"混合成折中态.
    取消 v7 的 rgb_sum>300 守卫 — transparent 帧 RGB 已腐蚀成黑色/绿色, 守卫
    让 fill 失败, transparent 帧仍挖洞.

Pass 2 关键:
  - 阈值 alpha<100 像素数 > 28000 (硬阈值, 整章鱼完全空白)
  - silhouette 内 fill (alpha=255 + RGB=prev_frame), 保留 raw transparent 背景
  - 不能整帧替换 (PIL APNG encoder cascading bug 在 disposal=2 下错编码成 transparent)
  - i=0 不处理 (无 i-1); i=0 通常不是 transparent 帧 (idle 起始)

Pass 4 关键:
  - 跨全部帧 majority voting 70% (stable body 像素)
  - fill RGB from i-1 (时间连续, 姿势清晰)
  - 取消 rgb_sum>300 守卫 (transparent 帧 RGB 已腐蚀)

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
    """修复 v10-final 输出 APNG. Pass 1 + Pass 2 (前一帧替换) + Pass 3 + Pass 4 (前帧 RGB fill)."""
    img = Image.open(apng_path)
    n = img.n_frames
    frames: list[np.ndarray] = []
    for i in range(n):
        img.seek(i)
        frames.append(np.array(img.copy().convert("RGBA")))

    pass1_fixed = 0
    pass2_replaced = 0
    pass3_fixed = 0
    pass4_fixed = 0
    pass5_fixed = 0
    pass2_hit_frames: set[int] = set()  # Pass 2 命中帧, Pass 3 跳过

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

    # ── Pass 2: bad-frame silhouette 内 transparent 像素 fill (v9 重写 v2) ──
    # 治 v7 撕裂 (silhouette mismatch) + v8 鬼影 (跨帧 median RGB 姿势折中).
    # v9 v1 用 `frames[i] = frames[i-1].copy()` 整帧替换 cascading,
    # PIL APNG encoder (disposal=2) 错误地把 cascading 帧编码成 raw transparent
    # → saved file 视觉上 = 拑洞. fix: 保留 raw transparent 背景, 仅 fill
    # silhouette 内 transparent 像素 (alpha=255 + RGB=prev_frame). encoder 看到
    # 帧 pixel 跟 raw transparent 不同 (有 silhouette fill), 不会触发 cascading
    # 优化. silhouette mask 用 ±5 帧 alpha median>=200 提取 (跟 Pass 3 同算法).
    W2 = 5  # silhouette median window
    for i in range(1, n):  # i=0 无 i-1, 跳过
        a = frames[i][:, :, 3]
        # 异常帧判定: alpha<100 像素数 > 28000 (整章鱼完全空白)
        if (a < 100).sum() < 28000:
            continue
        # silhouette mask: ±W2 帧 alpha median >= 200
        stack = np.stack(
            [frames[i + j][:, :, 3] for j in range(-W2, W2 + 1)], axis=0
        )
        silhouette = np.median(stack, axis=0) >= 200
        # 当前 transparent + 在 silhouette 内 → fill alpha=255 + RGB = prev_frame
        mask = silhouette & (a < 100)
        frames[i][mask, 3] = 255
        frames[i][mask, :3] = frames[i - 1][mask, :3]
        pass2_replaced += int(mask.sum())
        pass2_hit_frames.add(i)

    # ── Pass 3: sub-silhouette temporal median filter ──
    # 治 v10-final 在某些帧上 silhouette 内部某些像素位置 consistently low
    # confidence (32-laugh f44-f48 大笑爆发). Pass 1 ±7 max 抓不到.
    # median 比 max 更鲁棒: 只要 ≥3/11 帧不透明就修.
    # 跳过 Pass 2 命中帧避免覆盖前一帧替换 (cascading 透明帧的章鱼姿势已
    # 是 f_{i-k} 的姿势, Pass 3 median 在 f_{i-k} 位置上填的不是"原始姿势"
    # 而是"前 k 帧姿势", 视觉上 OK 但与 cascading 姿势不一致 → 半脸.
    # v7/v9 一致: 跳过 Pass 2 命中帧, Pass 3 不覆盖).
    W = 5  # half-window for median
    for i in range(W, n - W):
        if i in pass2_hit_frames:
            continue
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

    # ── Pass 4: global per-pixel majority voting + 前帧 RGB fill (v9 重写) ──
    # 治 v10-final transparent 帧 (32-laugh f030 raw 99.93% transparent, 大笑
    # 爆发姿势 unmixing 完全失败). 跨全部 99 帧 (loop cycle) 计算每像素
    # alpha>=200 帧数, ≥70% 视为"稳定章鱼身体像素" → stable_mask.
    # 对每帧 fill stable_mask 内 alpha<200 像素:
    #   - alpha = 255
    #   - RGB = 前一帧 (i-1) 在同位置的 RGB (v9 新)
    # 取消 v7 的 rgb_sum>300 守卫 — transparent 帧 (RGB sum<300 被腐蚀)
    # 完全无法 fill. v9 不管 RGB sum 直接 fill.
    # 70% 阈值平衡: 60% 会 fill 姿势切换帧. 80% 覆盖不足.
    threshold = int(n * 0.7)
    # 跨全部帧堆叠 alpha channel: (n, H, W)
    stack_all = np.stack([frames[i][:, :, 3] for i in range(n)], axis=0)
    visible_count = (stack_all >= 200).sum(axis=0)  # (H, W)
    stable_mask = visible_count >= threshold  # (H, W)

    for i in range(1, n):  # i=0 无 i-1, 跳过 (i=0 通常不是 transparent 帧)
        curr_a = frames[i][:, :, 3]
        # stable body 位置 + alpha<200 → fill alpha=255 + RGB = 前一帧 RGB
        mask = stable_mask & (curr_a < 200)
        if mask.any():
            frames[i][mask, :3] = frames[i - 1][mask, :3]  # 前一帧 RGB
            frames[i][mask, 3] = 255
        pass4_fixed += int(mask.sum())

    # ── Pass 5: 跨帧稳定度阈值清装饰色残影 (H2) ──
    # H1 (alpha 5-100 非体色粉清掉) 治了 90-95% 装饰拖影, 但残留 alpha 100-200
    # 装饰色像素 (彩带/音符/彩旗 partial alpha 边缘) 在 silhouette 内, 不能用
    # silhouette mask 区分 (装饰紧贴 body, body AA 也在 silhouette 内).
    # H2 用跨帧位置稳定度分离: body 像素在 99 帧内 ≥70% 帧 alpha>=100 → 保留;
    # 装饰像素 (跨帧位置变化) 稳定度 <0.7 → 清 alpha 100-200 非体色.
    # 4 类:
    #   A body_stable_opaque (稳定+当前 opaque) → 保留
    #   B body_aa_edge (不稳定+体色粉) → 保留 (body AA 边缘跨帧 alpha 抖动)
    #   C decoration_core (当前 opaque+非体色) → 保留 (装饰核心不透明主体)
    #   D decoration_partial (alpha 100-200+非体色+不稳定) → 清 (装饰拖影残影)
    # 2026-09-16 H2 验证 (4 场景 H1 输出): D = 16k-26k 像素/99 帧 (1.0-1.4%),
    # A+B+C 全部保留. 体色守卫同 H1 (R>200 & G<150 & B<150).
    h2_stability_threshold = 0.7
    h2_stability = (stack_all >= 100).sum(axis=0) / n  # alpha>=100 帧数比例
    h2_body_stable = h2_stability >= h2_stability_threshold  # (H, W)

    for i in range(n):
        rgba = frames[i]
        a = rgba[:, :, 3]
        rgb = rgba[:, :, :3]
        R, G, B = rgb[..., 0], rgb[..., 1], rgb[..., 2]
        body_pink = (R > 200) & (G < 150) & (B < 150)
        # D: 不稳定 + alpha 100-200 + 非体色
        h2_decoration = (~h2_body_stable) & (a >= 100) & (a < 200) & ~body_pink
        if h2_decoration.any():
            rgba[h2_decoration, 3] = 0
        pass5_fixed += int(h2_decoration.sum())

    return _save(frames, out_path or apng_path, n, pass1_fixed, pass2_replaced, pass3_fixed, pass4_fixed, pass5_fixed)


def _save(frames, out_path, n, pass1_fixed, pass2_replaced, pass3_fixed, pass4_fixed, pass5_fixed):
    pil_frames = [Image.fromarray(f, mode="RGBA") for f in frames]
    pil_frames[0].save(
        out_path,
        format="PNG",
        save_all=True,
        append_images=pil_frames[1:],
        duration=66,
        loop=1,
        disposal=2,
        compress_level=9,  # V3.0 release bin size: max zlib (level 9 vs default 6 省 1.5%)
    )
    return {
        "path": out_path,
        "n_frames": n,
        "pass1_flicker_fixed": pass1_fixed,
        "pass2_frames_replaced": pass2_replaced,
        "pass3_sub_silhouette_fixed": pass3_fixed,
        "pass4_majority_voting_fixed": pass4_fixed,
        "pass5_stable_threshold_cleaned": pass5_fixed,
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
    total_p4 = 0
    total_p5 = 0
    print(f"[v10-final-postfix-flicker] processing {len(scenes)} scenes (v9 v2 five-pass: H2 stable-threshold decoration cleanup)")
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
        total_p4 += result["pass4_majority_voting_fixed"]
        total_p5 += result["pass5_stable_threshold_cleaned"]
        print(
            f"  {scene}: pass1={result['pass1_flicker_fixed']} flicker pixels, "
            f"pass2={result['pass2_frames_replaced']} bad-frames replaced, "
            f"pass3={result['pass3_sub_silhouette_fixed']} sub-silhouette pixels, "
            f"pass4={result['pass4_majority_voting_fixed']} majority-voting pixels, "
            f"pass5={result['pass5_stable_threshold_cleaned']} decoration residues"
        )
    print(
        f"[v10-final-postfix-flicker] total pass1={total_p1} flicker pixels, "
        f"pass2={total_p2} bad-frames replaced, pass3={total_p3} sub-silhouette pixels, "
        f"pass4={total_p4} majority-voting pixels, pass5={total_p5} decoration residues"
    )


if __name__ == "__main__":
    main()