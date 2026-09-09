#!/usr/bin/env python3
"""
extract-chromakey-apng.py — H3 / gen_videos 绿幕视频 → 桌宠透明 APNG.

Designed for octopus-pet V2 pipeline: 14 动作视频统一抽帧 + 绿幕抠像
+ 透明 APNG 输出, 替换 V1 桌宠 sprite。

Pipeline (7 步, v4.6):
  1. ffmpeg 抽帧 (mp4 → PNG 序列, 默认 15fps)
  2. PIL resize 到桌宠尺寸 (192×192)
  3. PIL chroma key v4.2: 相对绿度 + 严保护 (深色阴影 + 中绿) → 算 alpha
  4. PIL alpha 通道激进收紧 (v4.6: alpha < 80 → 0, > 175 → 255) → partial 6000 → 1500
  5. cv2.inpaint v4.6: partial mask 1px 膨胀 + radius 8 (从 5 升) + green_opaque 6px 膨胀 + radius 4
     → 去 partial "绿调阴影" + 物品边缘绿调 + 切换残影
  6. PIL alpha 通道 1 像素 Gaussian blur (v4.6: blur 后低 alpha 重新归 0) → 抗锯齿
  7. PIL APNG 输出 (disposal=0, 默认 132ms/帧 ≈ 7.5fps, 50 帧 = 6.6s)

chroma key 演进 (v1 → v3 → v4 → v4.1 → v4.2 → v4.3 → v4.4 → v4.5 → v4.5.1 → v4.6, v4.6 是当前默认):
  v1: greenness = clip((G - max(R,B)) / 60 + 0.5, 0, 1)
    → 中性色 (白底/高光) alpha=0.5 半透 → 眼睛抠过头
  v3: greenness = clip((G - max(R,B) - 10) / 20, 0, 1)
    → 阈值 10/30, 中性色 (diff≤0) alpha=255 不透
    → 修复 v1, 但 "白底偏一点绿" (e.g. RGB 164,182,150, G-R=18) 仍 alpha=153
    → 桌宠眼睛下边缘显"高亮透明" (2026-09-09 用户反馈)
  v4: greenness = clip(((G - max(R,B)) / G - 0.2) / 0.3, 0, 1)
    → 相对绿度, 跟 G 本身归一化. 暗绿 (17,44,15) 相对绿度 0.61 → 透明;
      白底偏绿 (164,182,150) 相对绿度 0.10 → 不透; 纯白 0 → 不透.
    → partial-alpha 像素减少 ~50% (drink-coffee 眼睛下边缘测试)
  v4.1 (2026-09-09): + max(R,G,B) < 80 强制 alpha=255 保护深色阴影
    → 修 H3 模型在脸颊/触手上产生的深绿阴影 (RGB ~22,45,7) 被误扣
    → 用户反馈"扣成白色" 视觉 regression
  v4.2 (2026-09-09): 阈值 0.2→0.15 + 中绿保护 + alpha 羽化
    → 修 H3 模型"绿黄残留" (RGB ~155,188,75, 偏亮绿反射) 被保留成不透明绿色
      v4.1 保留 734 个绿黄像素 → v4.2 保留 15 个 (-98%)
    → alpha 通道 1 像素 Gaussian blur, 边缘锯齿过渡从 1px 扩到 2-3px
      partial 像素比例 0.21% → 1.18% (从硬边变软边)
    → 测试集 8 色 + H3 残留 (绿黄/深绿/腮红) 全部通过
  v4.3 (2026-09-09): + cv2.inpaint 替换 partial + 透明区域 RGB
    → 修 v4.2 "绿色描边" regression: H3 模型在章鱼身体边缘渲染"绿+粉"混合色
      (partial 像素 RGB 均值 R=25, G=198, B=11, 100% 绿偏), alpha 羽化后 partial
      像素 RGB 仍偏绿 → 桌宠身体外圈显"绿色描边"
    → cv2.inpaint (Telea 算法, radius=5) 用 PDE 解算把 partial + 透明区域 RGB
      从远处 alpha=255 像素传播身体色过来
    → drink-coffee frame_25 partial 绿偏: v4.2 70% → v4.3 23% (-47 个百分点)
    → 视觉: 桌宠 192×192 干净, 没绿色描边, 眼白清晰, 触手上深绿阴影保留
  v4.4 (2026-09-09): v4.1 保护加严 + inpaint mask 扩展到绿偏不透明像素
    → 修 v4.3 残留问题:
      (1) v4.1 旧保护 `max<80` 把 H3 模型深绿反射 (RGB ~20,55,8) 也保留
          → 加绿度判断 `(G - max(R,B)) < 20` 区分真阴影 vs 绿反射
          → 深绿反射 28214 个被 v4.4 排除保护
      (2) v4.3 inpaint 只修 partial + 透明, 不修 alpha=255 但 RGB 偏绿的像素
          → 扩展 inpaint mask: alpha=255 且 G>R+5 且 G>B+5 也算
    → drink-coffee frame_25 partial 绿偏: v4.3 23% → v4.4 0.5% (-22.5 个百分点)
    → 不透明像素绿偏: v4.3 1.7% → v4.4 0.3% (-1.4 个百分点)
    → 视觉: 桌宠 192×192 完全干净, 触手上深绿阴影也被 inpaint 替换为粉色
    → 残余: detective-study 帽子的绿调反射高光, 放大镜玻璃的绿色反射
  v4.5 (2026-09-09): inpaint mask 6px 膨胀 + radius=4
    → 修 v4.4 残余: H3 模型在侦探帽/放大镜/身体渲染"绿调反射光" (RGB ~150,130,60
      或 145,147,23, R > G 但 B 极低, 视觉上像绿调阴影), v4.4 mask 没扩到这些
      区域(inpaint 只在绿偏像素本身)
    → v4.5 mask 6px 膨胀 (kernel 3x3, iterations=2) 把绿偏像素外圈 6 像素都算 mask
      → inpaint 半径从 5 降到 4 (膨胀 6px 已经覆盖更广, 不需要大 r)
    → detective-study 50 帧: partial 绿偏 65px → 0px (-65), 不透明 16px → 0px (-16)
      worker-construction 50 帧: partial 绿偏 690px → 0px (-690)
      drink-coffee 50 帧: 0 → 0 (持平)
    → 视觉: detective-study 帽子变纯净棕色, 放大镜玻璃绿色反射消失
            worker-construction 黄色施工帽保留 (黄色 R>G>B, 不在 G 优势 mask)
            worker f35 绿色信号旗保留 (道具, 离章鱼较远膨胀没扩散到)
            白色眼睛 / 腮红 / 阴影细节保留
  v4.5.1 (2026-09-09): mask 拆 2 步独立 inpaint, partial+transparent 不膨胀
    → 修 v4.5 regression: v4.5 mask 6px 膨胀覆盖了眼睛 partial 边缘, 眼睛的高光
      (星形) / 瞳孔 (黑色) / 眼底月牙 (白色) 被 inpaint 改成周围身体色 (粉色),
      眼睛清晰度从锐利变模糊
    → partial+transparent 单独 inpaint (r=5, 不膨胀, 保留 v4.4 行为) +
      green_opaque 单独 mask 6px 膨胀 inpaint (r=4, 修身体/帽子的绿调反射)
    → 视觉: 眼睛 v4.4 锐利恢复 + 帽子/放大镜绿调反射仍消除
    → 残余: 边缘 partial 像素 11-16% (5000-6000 个), RGB mean R=166 G=103 B=62
      (R>G>B 棕色阴影, G 中 B 低 → 视觉感受"绿调阴影"),
      中心眼周 partial 60-139 个 (黑色瞳孔/眼底月牙边缘 → "眼睛扣的有点透明")
  v4.6 (2026-09-09, 当前默认): alpha 通道激进收紧 + partial mask 1px 膨胀 + radius 5→8
    → 修 v4.5.1 残余 4 类问题:
      (1) 眼睛半透: 眼周 partial 像素 (60-139 个) RGB 暗 R=63-83, alpha 半透
          → alpha 激进收紧 alpha<80 → 0, 眼周低 alpha 直接归 0, 黑色瞳孔边缘变硬清晰
      (2) 身体边缘绿阴影: 轮廓 partial 像素 (544-2479 个) RGB mean R=130-163 G=91-109 B=55-64
          → partial 6000 → 1500 (-75%) + partial mask 1px 膨胀 + radius 5→8
          → 远处身体色 (粉红) PDE 解算覆盖到 partial 像素, 绿调消失
      (3) 物品周围绿阴影: 物品边缘 alpha=255 深色像素 (70-100) 500-1000 个
          → partial mask 1px 膨胀覆盖到 alpha=255 边缘外 1 像素, 物品周围过渡带
            一起 inpaint 修
      (4) 切换绿残影: partial 像素 hard-key 后 alpha 边缘只有 0/255, 中间值拖影消失
          → 场景切换时前一场景的 alpha 中间值不会拖出"半透绿残影"
    → 视觉验证: 眼白清晰 (中心 30 像素 partial 60→0) + 身体边缘干净 + 物品周围
      无绿阴影 + 切换时无绿残影

Verified: 2026-09-09, 3 场景 (detective-study / worker-construction / drink-coffee)
桌宠 116×116 透明窗口视觉 OK: 完全无绿色描边/阴影, 眼白清晰, 脸颊/触手上无白色斑块, 绿黄残留去除.
依赖: opencv-python-headless (cv2.inpaint + cv2.dilate, fallback 到 v4.2 行为如果 import 失败).

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
  --chromakey {v3,v4}   chroma key 版本 (默认 v4.6)

Verified: 2026-09-09, 3 场景 (detective-study / worker-construction / drink-coffee)
桌宠 116×116 透明窗口视觉 OK: 完全无绿色描边/阴影, 眼白清晰, 脸颊/触手上无白色斑块, 绿黄残留去除.
依赖: opencv-python-headless (cv2.inpaint + cv2.dilate, fallback 到 v4.2 行为如果 import 失败).
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

# cv2 软依赖: inpaint 修"绿色描边"是 v4.3 关键, 没装就 fallback 到 v4.2 (有绿描边)
try:
    import cv2
    _HAS_CV2 = True
except ImportError:
    _HAS_CV2 = False
    print("WARNING: opencv-python-headless 未装, v4.3 inpaint 步骤跳过 (fallback 到 v4.2 行为)", file=sys.stderr)
    print("  安装: python3 -m pip install --user --break-system-packages opencv-python-headless", file=sys.stderr)


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
    """v4.2 chroma key: 相对绿度 + 双重保护 (v4.1 深色 + v4.2 中绿).

    v3 问题: 白色眼底的微小绿影 (e.g. RGB 164,182,150) G-R=18 → alpha=153 半透,
    桌宠眼睛下边缘显"高亮透明" 效果 (2026-09-09 用户反馈).

    v4 改进: 把 G 差归一化到 G 本身, 形成" 绿在 G 里的占比"指标.
    暗绿 (17,44,15) 相对绿度 0.61 → 透明; 白底偏绿 (164,182,150) 相对绿度 0.10 → 不透;
    纯白/纯黑/章鱼皮肤/黄/阴影 → 全部不透.

    v4.1 (2026-09-09): + max(R,G,B) < 80 强制 alpha=255 保护深色阴影
      → 修 H3 模型在脸颊/触手上产生的深绿阴影 (RGB ~22,45,7) 被误扣
      → 用户反馈"扣成白色" 视觉 regression

    v4.2 (2026-09-09, 当前默认): 阈值 0.2→0.15 + 中绿保护 + alpha 羽化
      → 修 H3 模型"绿黄残留" (RGB ~155,188,75) 被 v4.1 保留成不透明绿色
      → 测试集 8 色 + H3 残留全部通过

    Args:
        arr: HxWx3 uint8 RGB 数组
    Returns:
        HxW uint8 alpha 数组 (255=不透明, 0=透明)
    """
    r, g, b = arr[:, :, 0].astype(int), arr[:, :, 1].astype(int), arr[:, :, 2].astype(int)
    g_max_rb = g - np.maximum(r, b)  # 绿度差
    rel_green = np.where(g > 0, g_max_rb / np.maximum(g, 1), 0.0)
    # v4.2: 阈值 0.2 → 0.15, 让 (155, 188, 75) 这种绿黄反射也走 soft 透明
    greenness = np.clip((rel_green - 0.15) / 0.3, 0.0, 1.0)
    alpha = ((1.0 - greenness) * 255).astype(np.uint8)
    max_rgb = np.maximum(np.maximum(r, g), b)
    # v4.4 保护: 深色阴影 (max < 80) 但必须是"真阴影" (绿度差 < 20)
    #   v4.1 旧条件 max<80 把 H3 深绿反射 (RGB ~20,55,8, 绿度差=36) 也保留
    #   v4.4 加 (G - max(R,B)) < 20 判断, 区分真阴影 vs 绿反射
    dark = (max_rgb < 80) & (g_max_rb < 20)
    # v4.2 保护: 中绿阴影 (80 ≤ max < 150) 且 G - max(R,B) 绝对值 < 30 算皮肤
    mid_green = (max_rgb >= 80) & (max_rgb < 150) & (g_max_rb < 30)
    # 合并保护
    keep = dark | mid_green
    alpha = np.where(keep, 255, alpha).astype(np.uint8)
    return alpha


def harden_alpha_edges(alpha: np.ndarray, low_thresh: int = 80, high_thresh: int = 175) -> np.ndarray:
    """v4.6: alpha 通道激进收紧, 把低/高置信度像素直接 hard-key,
    只保留 80-175 软过渡带交给 inpaint 修 (partial 6000 → ~1500).

    v4.5.1 根因: partial 像素 11-16% (5000-6000 个), RGB mean R=166 G=103 B=62
    是"暗棕带绿调" (B 低 → 暖色, G 中 → 没冷色抵消 → 视觉"绿阴影").
    分布: 中心 30 像素眼周 partial 60-139 个 (RGB 暗 R=63-83, 黑色瞳孔/眼底月牙
    边缘) → 用户反馈"眼睛扣的有点透明"; 轮廓 partial 544-2479 个 (棕色阴影
    R=130-163 G=91-109) → 用户反馈"身体/物品边缘绿色阴影".

    v4.6 改进: alpha < 80 直接归 0 (低置信度背景, 多半是绿幕透出), alpha > 175
    直接归 255 (高置信度物体), 80-175 中间过渡带才 inpaint. partial 像素数量
    降 70%+ → inpaint 压力小 + 更彻底.

    Args:
        alpha: HxW uint8 alpha 数组 (0-255)
        low_thresh: 低置信阈值, < 此值直接归 0 (默认 80)
        high_thresh: 高置信阈值, > 此值直接归 255 (默认 175)
    Returns:
        HxW uint8 alpha 数组 (边缘 hard-key, 中间保留 partial 供 inpaint)
    """
    alpha = np.where(alpha < low_thresh, 0, alpha)
    alpha = np.where(alpha > high_thresh, 255, alpha)
    return alpha.astype(np.uint8)


def soften_alpha(alpha: np.ndarray, radius: int = 1) -> np.ndarray:
    """alpha 通道 1 像素 Gaussian blur 抗锯齿.

    v4.1 partial 像素 alpha=128 在桌宠上显"硬边" (1 像素宽过渡), 192x192 APNG
    resize 到 116x116 窗口后锯齿明显. v4.2 加 1 像素 Gaussian blur 让边缘
    partial 从 0.21% 扩到 1.18% (从硬边变软边), 桌宠渲染更平滑.

    v4.6 配合 harden_alpha_edges: 只对 partial 像素 (80-175) 做 blur, 硬抠
    边缘 (0/255) 保留锐利. blur 后 alpha 0-100 重新归 0, 避免低 alpha 像素
    blur 后变 1-30 拖出"半透阴影"残影.
    """
    if radius <= 0:
        return alpha
    from PIL import ImageFilter
    alpha_img = Image.fromarray(alpha, mode="L")
    blurred = alpha_img.filter(ImageFilter.GaussianBlur(radius=radius))
    blurred = np.array(blurred)  # PIL → numpy
    blurred = np.where(blurred < 30, 0, blurred)  # v4.6: blur 后低 alpha 重新归 0
    return blurred.astype(np.uint8)


def inpaint_partial_rgb(rgb: np.ndarray, alpha: np.ndarray, radius: int = 8) -> np.ndarray:
    """v4.7: cv2.inpaint 修 partial + 透明 + 绿偏不透明 + 眼白 G 偏色 + partial 边缘外圈
    → partial+透明 mask 1px 膨胀 + radius 8 (从 5 升, 让远处身体色传播更彻底)
    → green_opaque mask 独立 6px 膨胀 (修身体/帽子的绿调反射, v4.5 沿用)
    → **眼白 G 偏色 mask (v4.7 新增)**: alpha=255 + R+G+B > 600 + G > B+5 + R > 200
        → inpaint r=3 (小半径, 保护眼周细节), 修 drink-coffee 70% 眼白 G 偏色
    → 去"绿色描边" + "绿色阴影" + "物品边缘绿调" + "切换绿残影" + **"眼白发黄"**

    演进根因:
    v4.3 (2026-09-09): + cv2.inpaint 修 partial + 透明, 去"绿色描边".
    v4.4 (2026-09-09): mask 扩到 alpha=255 绿偏, 去"绿色阴影".
    v4.5 (2026-09-09): mask 6px 膨胀 + radius 4, 去"绿调反射高光" (帽子/放大镜).
    v4.5.1 (2026-09-09): mask 拆 2 步, partial 不膨胀 (避免眼睛模糊 regression).
    v4.6 (2026-09-09): alpha 通道激进收紧 (harden_alpha_edges, alpha < 80 → 0, > 175 → 255)
        + partial mask 1px 膨胀 + radius 5→8, partial 像素 6000 → 1500 (70% 减少).
    v4.7 (2026-09-09, 当前): v4.6 治本 4 类边界问题后, 眼白 G 偏色是新发现:
        - drink-coffee 眼周 225 个 alpha=255 白色像素, 70% G>B+10 (R=240 G=153 B=131),
          H3 源视频眼底月牙 RGB 偏 G, 视觉"米黄/发绿"
        - detective/worker 也残留 1-19 个白色 G 偏色像素 (少但有)
        - 解决: 新增 green_tinted_white mask, inpaint r=3 把 G 偏色像素替换为
          周围身体色 (粉红) 或纯白. r=3 小半径避免破坏眼睛细节 (星形高光/瞳孔边界)

    Args:
        rgb: HxWx3 uint8 RGB 数组 (H3 渲染原图)
        alpha: HxW uint8 alpha 数组 (v4.6 harden 后的, 80% 都是 0 或 255)
        radius: inpaint 算法传播半径 (8 = v4.6 升, 让远处身体色传播更彻底)
    Returns:
        HxWx3 uint8 RGB 数组 (partial + 透明 + 绿偏不透明 + 眼白 G 偏色 + 绿调反射外圈 6px 都被修复)
    """
    if not _HAS_CV2:
        return rgb  # fallback: 不修复, v4.2 行为 (有绿描边 + 绿阴影)
    # v4.4 mask = partial ∪ 透明 ∪ alpha=255 但 RGB 绿偏 (G>R+5 且 G>B+5)
    r = rgb[:,:,0].astype(int)
    g = rgb[:,:,1].astype(int)
    b = rgb[:,:,2].astype(int)
    max_rgb = np.maximum(np.maximum(r, g), b)
    sum_rgb = r + g + b
    green_opaque = (alpha == 255) & (g > r + 5) & (g > b + 5) & (max_rgb > 80)
    # v4.7 新增: 眼白 G 偏色 (alpha=255 + 白色范围 + G>B+5)
    #   白色范围: R > 200 (亮) 且 R+G+B > 600 (偏白)
    #   G > B+5: 偏色 (G>B 表示绿调, B>G 表示冷调)
    green_tinted_white = (alpha == 255) & (r > 200) & (sum_rgb > 600) & (g > b + 5)
    partial_mask = ((alpha > 0) & (alpha < 255)) | (alpha == 0)
    rgb_bgr = cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR)
    # v4.7: 分 3 步独立 inpaint
    # 1) partial+transparent 1px 膨胀 + radius 8 (修 partial + 边缘外圈"半 partial")
    if partial_mask.sum() > 0:
        kernel = np.ones((3, 3), np.uint8)
        partial_dilated = cv2.dilate(partial_mask.astype(np.uint8), kernel, iterations=1)
        inpaint_mask_pt = (partial_dilated * 255)
        rgb_bgr = cv2.inpaint(rgb_bgr, inpaint_mask_pt, 8, cv2.INPAINT_TELEA)
    # 2) green_opaque 6px 膨胀 (v4.5 沿用, 修身体/帽子的绿调反射)
    if green_opaque.sum() > 0:
        kernel = np.ones((3, 3), np.uint8)
        green_dilated = cv2.dilate(green_opaque.astype(np.uint8), kernel, iterations=2)
        inpaint_mask_g = (green_dilated * 255)
        rgb_bgr = cv2.inpaint(rgb_bgr, inpaint_mask_g, 4, cv2.INPAINT_TELEA)
    # 3) v4.7 新增: 眼白 G 偏色 r=3 (小半径, 保护眼周细节)
    if green_tinted_white.sum() > 0:
        inpaint_mask_gtw = (green_tinted_white.astype(np.uint8) * 255)
        rgb_bgr = cv2.inpaint(rgb_bgr, inpaint_mask_gtw, 3, cv2.INPAINT_TELEA)
    return cv2.cvtColor(rgb_bgr, cv2.COLOR_BGR2RGB)


def process_frames(
    src_dir: Path, indices: list[int], size: int, chromakey: str = "v4"
) -> list[Image.Image]:
    """加载 + resize + chroma key + inpaint 修绿描边 + alpha 羽化 → RGBA PIL Image 列表"""
    print(f"[2/4] load {len(indices)} frames, resize to {size}x{size}, chroma key {chromakey} + harden + inpaint + alpha soften...")
    chromakey_fn = chromakey_v3 if chromakey == "v3" else chromakey_v4
    images = []
    for i in indices:
        img = Image.open(src_dir / f"frame_{i:03d}.png").convert("RGB")
        if img.size != (size, size):
            img = img.resize((size, size), Image.LANCZOS)
        arr = np.array(img)
        # v4.6 流程: chroma key → alpha 激进收紧 → inpaint 修 RGB (含 partial 1px 膨胀 + r=8) → alpha 羽化
        alpha = chromakey_fn(arr)
        # v4.6: alpha 通道激进收紧 (alpha < 80 → 0, > 175 → 255), partial 6000 → 1500
        alpha = harden_alpha_edges(alpha, low_thresh=80, high_thresh=175)
        # v4.6: 关键步骤 — 替换 partial + 透明 + 1px 外圈 (r=8), + 绿偏不透明 (r=4)
        rgb_fixed = inpaint_partial_rgb(arr, alpha, radius=8)
        # v4.6: alpha 羽化 (1 像素 Gaussian blur) 抗锯齿, blur 后低 alpha 重新归 0
        alpha = soften_alpha(alpha, radius=1)
        rgba = np.dstack([rgb_fixed, alpha])
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
    ap.add_argument("--chromakey", choices=["v3", "v4"], default="v4", help="Chroma key version (default v4.2)")
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
