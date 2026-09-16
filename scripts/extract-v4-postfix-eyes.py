#!/usr/bin/env python3
"""extract-v4-postfix-eyes.py — Post-fix v4 chroma-key fallback output.

修复 `extract-v4-chromakey-cpu-fallback.py` 的共性错杀: 章鱼脸部 ROI (y=40-60%, x=20-80%) 内的
眼睛瞳孔/眼线/眼白被 chroma key 当成"低置信度绿幕"误 transparent (alpha=0).

三层修复算法:
  条件 1 (v1): alpha=0 + max(R,G,B) < 60 + 在 ROI 内 → alpha=255 (纯黑瞳孔)
  条件 2 (v2): alpha=0 + 60 ≤ max(R,G,B) < 100 + 在 ROI 内 + 8 邻居中至少 6 个
                alpha > 128 (被身体包围) → alpha=255 (深绿眼线/眼眶轮廓)
  条件 3 (v3): 在 ROI 内连通小簇 ≤ 30 像素 + 簇平均 RGB < 130 + bbox 周围 2px 环
                不透明比例 ≥ 50% → alpha=255 (清理眼白绿色斑点)

约束 ROI 而非全图: 避免误保绿幕边缘黑色阴影 (RGB_max 130+ 区间不修, 防止误保背景).
约束 8 邻居 (v2) / bbox 不透明比例 (v3): 确保是身体内部孔洞而非边缘接触背景.

用法:
    # 单文件
    python3 scripts/extract-v4-postfix-eyes.py <apng_path>

    # 批量: 处理 passed/ 下所有场景
    for mp4 in docs/h3-source-2026-09-15/passed/*.mp4; do
        name=$(basename "$mp4" .mp4)
        python3 scripts/extract-v4-postfix-eyes.py "app/public/assets/octopus/v2/${name}.png"
    done

何时必须跑:
    任何走 extract-v4-chromakey-cpu-fallback.py 输出的 APNG, 上桌前必跑一次
    (v10-final GPU 路径无此问题, 因 BiRefNet/CorridorKey 神经网络 alpha hint 不会
    把眼睛 RGB 当绿幕反射).

诊断脚本 (dry-run 统计错杀像素数):
    python3 -c "
    from PIL import Image
    import numpy as np
    img = Image.open('app/public/assets/octopus/v2/<scene>.png')
    img.seek(50); rgba = np.array(img.convert('RGBA'))
    h, w = rgba.shape[:2]
    roi = rgba[int(h*0.40):int(h*0.60), int(w*0.20):int(w*0.80)]
    killed_v1 = (roi[:,:,3] == 0) & (roi[:,:,:3].max(axis=2) < 60)
    print(f'v1 纯黑错杀 (修复前): {killed_v1.sum()}')
    "
"""
from PIL import Image
import numpy as np
import os
import sys


def fix_apng(path: str) -> dict:
    """修复单 APNG, 返回 {frames, fixed_v1, fixed_v2, fixed_v3}."""
    from scipy.ndimage import convolve, label
    img = Image.open(path)
    n_frames = getattr(img, 'n_frames', 1)
    h, w = img.size
    y0, y1 = int(h * 0.40), int(h * 0.60)
    x0, x1 = int(w * 0.20), int(w * 0.80)
    frames = []
    fixed_v1_total = 0
    fixed_v2_total = 0
    fixed_v3_total = 0
    for fi in range(n_frames):
        img.seek(fi)
        rgba = np.array(img.convert('RGBA'))
        roi = rgba[y0:y1, x0:x1]
        alpha = roi[:, :, 3]
        max_rgb = roi[:, :, :3].max(axis=2)
        rgb = roi[:, :, :3]

        # v1: 纯黑像素 (max < 60) — 眼睛瞳孔中心
        v1 = (alpha == 0) & (max_rgb < 60)
        n_v1 = int(v1.sum())

        # v2: 深绿像素 (60 ≤ max < 100) 且被身体包围 (8 邻居中 ≥ 6 个 alpha > 128)
        v2_candidate = (alpha == 0) & (max_rgb >= 60) & (max_rgb < 100)
        if v2_candidate.any():
            kernel = np.ones((3, 3), dtype=np.uint8)
            kernel[1, 1] = 0
            opaque = (alpha > 128).astype(np.uint8)
            neighbor_opaque_count = convolve(opaque, kernel, mode='constant', cval=0)
            v2 = v2_candidate & (neighbor_opaque_count >= 6)
            n_v2 = int(v2.sum())
        else:
            n_v2 = 0
            v2 = np.zeros_like(alpha, dtype=bool)

        # v3: ROI 内小簇 (≤30 px) + 簇平均 RGB < 130 + bbox 周围 2px 环不透明 ≥ 50%
        #   → 清理眼白绿斑 (chroma key 误把眼白局部当成绿幕)
        v3 = np.zeros_like(alpha, dtype=bool)
        # 排除 v1/v2 已填的像素, 只在剩余 alpha=0 中找簇
        remaining = (alpha == 0) & ~v1 & ~v2
        if remaining.any():
            labeled, n_comp = label(remaining)
            for c in range(1, n_comp + 1):
                comp = labeled == c
                sz = int(comp.sum())
                if sz > 30:
                    continue
                comp_rgb = rgb[comp]
                avg_max = comp_rgb.max(axis=-1).mean()
                if avg_max >= 130:
                    continue
                # bbox 2px 环不透明比例
                ys, xs = np.where(comp)
                cy0, cy1 = ys.min(), ys.max()
                cx0, cx1 = xs.min(), xs.max()
                pad = 2
                by0 = max(0, cy0 - pad)
                by1 = min(alpha.shape[0], cy1 + pad + 1)
                bx0 = max(0, cx0 - pad)
                bx1 = min(alpha.shape[1], cx1 + pad + 1)
                box = alpha[by0:by1, bx0:bx1]
                opaque_ratio = float((box > 128).mean())
                if opaque_ratio >= 0.50:
                    v3 |= comp
        n_v3 = int(v3.sum())

        if n_v1 > 0:
            roi[v1, 3] = 255
            fixed_v1_total += n_v1
        if n_v2 > 0:
            roi[v2, 3] = 255
            fixed_v2_total += n_v2
        if n_v3 > 0:
            roi[v3, 3] = 255
            fixed_v3_total += n_v3

        rgba[y0:y1, x0:x1] = roi
        frames.append(rgba)
    # 重写 APNG
    pil_frames = [Image.fromarray(f, mode='RGBA') for f in frames]
    pil_frames[0].save(path, format='PNG', save_all=True,
                       append_images=pil_frames[1:],
                       duration=66, loop=1, disposal=2)
    return {'n_frames': n_frames, 'fixed_v1': fixed_v1_total,
            'fixed_v2': fixed_v2_total, 'fixed_v3': fixed_v3_total}


if __name__ == '__main__':
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)
    total_v1 = 0
    total_v2 = 0
    total_v3 = 0
    for arg in sys.argv[1:]:
        if not os.path.exists(arg):
            print(f'❌ not found: {arg}')
            continue
        result = fix_apng(arg)
        name = os.path.basename(arg)
        n = result['fixed_v1'] + result['fixed_v2'] + result['fixed_v3']
        marker = '✅' if n > 0 else '✓'
        print(f'{marker} {name}: v1={result["fixed_v1"]} v2={result["fixed_v2"]} v3={result["fixed_v3"]} ({result["n_frames"]} 帧)')
        total_v1 += result['fixed_v1']
        total_v2 += result['fixed_v2']
        total_v3 += result['fixed_v3']
    print(f'\n=== 总修复: v1={total_v1} (纯黑瞳孔) + v2={total_v2} (深绿眼线) + v3={total_v3} (小簇眼斑) = {total_v1+total_v2+total_v3} 像素 ===')