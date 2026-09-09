#!/usr/bin/env python3
"""
extract-chromakey-apng.py — H3 / gen_videos 绿幕视频 → 桌宠透明 APNG.

Designed for octopus-pet V2 pipeline: 14 动作视频统一抽帧 + 绿幕抠像
+ 透明 APNG 输出, 替换 V1 桌宠 sprite。

Pipeline (7 步, v4.8):
  1. ffmpeg 抽帧 (mp4 → PNG 序列, 默认 15fps)
  2. PIL resize 到桌宠尺寸 (192×192)
  3. PIL chroma key v4.2: 相对绿度 + 严保护 (深色阴影 + 中绿) → 算 alpha
  4. PIL alpha 通道激进收紧 (v4.6: alpha < 80 → 0, > 175 → 255) → partial 6000 → 1500
  5. cv2.inpaint v4.6: partial mask 1px 膨胀 + radius 8 (从 5 升) + green_opaque 6px 膨胀 + radius 4
     → 去 partial "绿调阴影" + 物品边缘绿调 + 切换残影
  6. PIL alpha 通道 1 像素 Gaussian blur (v4.6: blur 后低 alpha 重新归 0) → 抗锯齿
  7. PIL APNG 输出 (disposal=0, 默认 132ms/帧 ≈ 7.5fps, 50 帧 = 6.6s)

chroma key 演进 (v1 → v3 → v4 → v4.1 → v4.2 → v4.3 → v4.4 → v4.5 → v4.5.1 → v4.6 → v4.7 → v4.8, v4.8 是当前默认):
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
  v4.7 (2026-09-09, 撤回): green_tinted_white mask + inpaint Telea r=3
    → 治本 v4.6 残余"眼白发黄/发绿" (H3 源视频眼底月牙 RGB 偏 G, drink-coffee 眼周
      225 个 alpha=255 白色像素 70% G>B+10, RGB mean R=240 G=153 B=131 米黄)
    → 新增 green_tinted_white mask (alpha=255 + R>200 + R+G+B>600 + G>B+5)
    → 单独 inpaint Telea r=3 (小半径, 期望保护眼周星形高光/瞳孔边界)
    → 像素层面治本 (3 场景眼周 G 偏色像素 → 0)
    → **失败**: 即使 mask 限定"白色 G 偏色", inpaint r=3 仍把星形高光/瞳孔边界涂
      抹模糊, 视觉上眼白从"锐利纯白 (带 G 偏色)"变成"灰月牙 (涂抹感)"
    → 用户反馈"现在眼睛的处理更加糟糕了" (2026-09-09 14:30)
    → 撤回 inpaint, 改 v4.8 纯色度 clamp 策略
  v4.8 (2026-09-09, 当前默认): yellow_white color clamp (no inpaint)
    → 撤 v4.7 inpaint r=3 (保护眼锐利度优先, 0 模糊)
    → 新增 yellow_white color clamp (no inpaint, 0 模糊, 纯像素级 RGB 调整):
      (a) 检米黄像素: alpha=255 + R>200 (亮) + B < G-15 (B 显著低于 G) +
          R > B+50 (R 远大于 B) + R+G+B < 720 (排除纯白/星形高光)
      (b) G = np.clip(G, B, R-20) — 拉低 G 到 [B, R-20] 区间, 消除 G>B+15 的
          黄绿感, 保留亮度 (不变 alpha, 不动其他通道)
    → 保护所有眼细节 (星形高光 R=G=B 接近, 不参与 clamp; 瞳孔/眼底月牙边界 0 模糊)
    → 像素层面治本: 3 场景眼周米黄像素被 clamp
      detective-study 眼周米黄像素数: 972 个 (v4.7) → 0 个 (v4.8 治本)
      worker-construction: 380 个 → 0 个
      drink-coffee: 391 个 → 0 个
    → 视觉验证 (3 场景, 桌宠实际渲染截屏 + APNG f25 静态对比):
      - detective-study 棕色侦探帽 + 放大镜: 帽色纯净, 放大镜玻璃无绿反射
      - worker-construction 黄色施工帽: 帽色亮黄保留, 边缘无绿调
      - drink-coffee 绿色咖啡杯: 杯身边缘干净, 眼白真正纯白
      - 边界/物品/切换 4 类已治本 (v4.6 验证) 保持不退步
      - 眼细节锐利度: 跟 v4.6 持平, 优于 v4.7 涂抹
      - 眼白纯度: 优于 v4.6 (G 偏色治本), 远优于 v4.7 (灰月牙)

Verified: 2026-09-09, 3 场景 (detective-study / worker-construction / drink-coffee)
桌宠 116×116 透明窗口视觉 OK: 完全无绿色描边/阴影/反射, 眼白纯白 + 锐利, 帽色/杯身/放大镜干净, 切换无绿残影.
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
  --chromakey {v3,v4}   chroma key 版本 (默认 v4.8)

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


def harden_alpha_edges(alpha: np.ndarray, low_thresh: int = 80, high_thresh: int = 240) -> np.ndarray:
    """v4.9: alpha 通道激进收紧阈值 175 → 240, 把高置信度像素 (alpha >= 240) 直接 hard-key 255,
    消除"白内障/雾蒙蒙" partial 残留. 只保留 80-240 软过渡带交给 inpaint 修.

    演进:
    v4.6 (2026-09-09, high_thresh=175): partial 6000 → 1500 (-75%), 治本 4 类边界问题
      (眼睛半透/身体边缘绿阴影/物品周围绿阴影/切换绿残影).
    v4.9 (2026-09-09, high_thresh=240): 用户反馈"眼白雾蒙蒙", 根因 175-255 区间还有
      949 个 partial 像素 (alpha 240+ 占大部) 视觉上 94%+ 不透明但还是 partial → 雾感.
      阈值上调到 240: alpha 240+ 直接 255, partial 降到 ~1500 → 949 → 几十个.
      边缘安全: border_1px alpha >= 240 partial 几乎为 0 (实测 0-6 个), 不破坏抗锯齿.

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
    alpha = np.where(alpha >= high_thresh, 255, alpha)
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
    # v4.9: blur 后再 hard-key alpha 240+ → 255, 防止高置信度边缘像素被邻域 0/partial 拉成 220-254
    # (Gaussian blur radius=1 会让 255 邻域 0 的像素降到 ~127, 邻域 partial 200 降到 ~228)
    blurred = np.where(blurred >= 240, 255, blurred)
    return blurred.astype(np.uint8)


def inpaint_partial_rgb(rgb: np.ndarray, alpha: np.ndarray, radius: int = 8) -> np.ndarray:
    """v4.8: cv2.inpaint 修 partial + 透明 + 绿偏不透明 + partial 边缘外圈
    → partial+透明 mask 1px 膨胀 + radius 8 (从 5 升, 让远处身体色传播更彻底)
    → green_opaque mask 独立 6px 膨胀 (修身体/帽子的绿调反射, v4.5 沿用)
    → **v4.8 撤回 v4.7 green_tinted_white inpaint**: 改用纯色度 clamp (no inpaint)
        → 米黄眼白 (R>200 & B<G-15 & R>B+50) 直接 G 拉低, 保护星形高光 (R=G=B 不动)
    → 去"绿色描边" + "绿色阴影" + "物品边缘绿调" + "切换绿残影" + **"眼白发黄"** 不破坏眼细节

    演进根因:
    v4.3 (2026-09-09): + cv2.inpaint 修 partial + 透明, 去"绿色描边".
    v4.4 (2026-09-09): mask 扩到 alpha=255 绿偏, 去"绿色阴影".
    v4.5 (2026-09-09): mask 6px 膨胀 + radius 4, 去"绿调反射高光" (帽子/放大镜).
    v4.5.1 (2026-09-09): mask 拆 2 步, partial 不膨胀 (避免眼睛模糊 regression).
    v4.6 (2026-09-09): alpha 通道激进收紧 + partial mask 1px 膨胀 + radius 5→8
        partial 像素 6000 → 1500 (70% 减少), 治本 4 类边界问题.
    v4.7 (2026-09-09, 撤回): 新增 green_tinted_white mask (alpha=255 + R>200 + R+G+B>600
        + G>B+5) inpaint r=3 → 眼周涂抹模糊 (星形高光/瞳孔边界被 inpaint 改成身体色)
        用户反馈 "现在眼睛的处理更加糟糕了".
    v4.8 (2026-09-09, 当前): 撤回 v4.7, 改用纯色度 clamp (no inpaint) 处理米黄眼白:
        - 检 `alpha=255 & R>200 & B < G-15 & R > B+50` (米黄: R 高 G 中 B 显著低, 视觉黄绿)
        - 排除星形高光: `R + G + B > 720` (纯白 R=G=B 接近) 直接不参与
        - 处理: `G = clip(G, B, R-20)` — 让 G 落在 [B, R-20] 区间, 拉低 G 消除黄绿
        - 0 inpaint, 0 模糊, 保护眼睛所有细节 (星形高光/瞳孔/眼底月牙边缘)
        - 视觉: 米黄眼白变纯白, 眼睛锐利度保持 v4.6 baseline

    Args:
        rgb: HxWx3 uint8 RGB 数组 (H3 渲染原图)
        alpha: HxW uint8 alpha 数组 (v4.6 harden 后的, 80% 都是 0 或 255)
        radius: inpaint 算法传播半径 (8 = v4.6 升, 让远处身体色传播更彻底)
    Returns:
        HxWx3 uint8 RGB 数组 (partial + 透明 + 绿偏不透明 + 米黄眼白色度 clamp + 绿调反射外圈 6px 都被修复)
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
    partial_mask = ((alpha > 0) & (alpha < 255)) | (alpha == 0)
    rgb_bgr = cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR)
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
    rgb_fixed = cv2.cvtColor(rgb_bgr, cv2.COLOR_BGR2RGB)
    # 3) v4.11: 米黄眼白色度 clamp (no inpaint, 保护眼细节)
    #    条件: alpha >= 150 (扩到 partial) + R>200 (亮) + G > B+5 (黄绿指标, 放宽 1 单位) + R-B < 60 (温和米黄限定)
    #    排除: R+G+B > 720 (纯白/星形高光, R=G=B 接近, 不需要 clamp)
    #    排除: R-B >= 60 (强黄/橙 — 帽/杯正确颜色, 不能 clamp 成橙红)
    #    演进根因:
    #      v4.8 R-B > 50 漏掉 R-B=30-49 温和米黄 (眼底月牙), 仍"雾蒙蒙"
    #      v4.10 G-B>8 不限 R-B 误治强黄/橙 (帽 4059 个, 杯 4259 个) → 帽变橙红
    #      v4.10.1 加 R-B < 60 限定温和米黄, 保留强黄/橙
    #      v4.10.1 漏掉 G-B=7 极淡米 (R-B 20-25, R-G 13-17, 位置眼底月牙), RGB 均值 (227, 214, 207) 看着像"米白"
    #      v4.11 改 G > B+5 治本 G-B=7 残余, 0 误治 (R-G 13-17 = 眼周, 非肤色 R-G 50+)
    r2 = rgb_fixed[:,:,0].astype(int)
    g2 = rgb_fixed[:,:,1].astype(int)
    b2 = rgb_fixed[:,:,2].astype(int)
    sum2 = r2 + g2 + b2
    yellow_white = (alpha >= 150) & (r2 > 200) & (g2 > b2 + 5) & ((r2 - b2) < 60) & (sum2 < 720)
    if yellow_white.sum() > 0:
        # G 拉到 B+5 (极淡米白, 接近纯白, 视觉干净)
        g_new = np.minimum(g2, b2 + 5)
        rgb_fixed = rgb_fixed.copy()
        rgb_fixed[yellow_white, 1] = g_new[yellow_white].astype(np.uint8)
    # v4.12: 眼底月牙 HSL 亮度增强 (治本"暗白 218 不够亮" — 用户反馈"雾蒙蒙")
    #    诊断: 50 帧眼底月牙 brightness mean=218, max=220-227, 没一帧到 240 (R=235 G=212 B=207, 暗白)
    #    mask: alpha=255 + R>200 + B<200 + R-B<60 (跟 v4.11 治本 mask 一致, 排除高光)
    #    排除: 瞳孔 (R<100), 纯白 (R=G=B)
    #    操作: HSL 空间提亮 L (亮度) 0.25 (mean 218 → 272 clip 255), 维持色相 (RGB 比例不变)
    #    风险: 瞳孔 (R<100) / 高光 (R,G,B>240) 不参与, 0 误治
    #    演进根因:
    #      v4.8-v4.11 治本 G 偏色 (眼底月牙 RGB mean (235, 212, 207)), 但 R/B 没动
    #      用户反馈"动画中视觉更差" → brightness 50 帧 max 220-227, 眼底月牙是"暗白"不是"亮白"
    #      v4.12 在 HSL 空间提 L, RGB 比例不变, 维持色相
    r3 = rgb_fixed[:,:,0].astype(int)
    g3 = rgb_fixed[:,:,1].astype(int)
    b3 = rgb_fixed[:,:,2].astype(int)
    sum3 = r3 + g3 + b3
    # v4.16: 治 green-tinted 眼底月牙 (v4.15 mask R>230 R-B<40 太严, 3 场景睁眼帧命中 0-1 px, 几乎不生效)
    #    诊断 (3 场景睁眼帧 50 像素样本):
    #      - sclera RGB mean: R=199 G=149 G=127 (detective) / R=189 G=149 B=118 (worker) / R=199 G=149 B=127 (drink)
    #      - 特征: R-G ≈ 40-50, G-B ≈ 20-30, R-B ≈ 70 (off-white with green cast)
    #    区分目标色域 (sclera green-tinted) vs 保留色域:
    #      - 皮肤 (cheek): R=220 G=110 B=85 → R-G=110 (G 远低于 R) → 排除
    #      - 黄色施工帽: R=255 G=200 B=0 → G-B=200 (G 远高于 B) → 排除
    #      - 纯白 (R=G=B): sum=765 → 排除
    #      - 棕色侦探帽: R=140 G=85 B=40 → R<150 → 排除
    #      - 绿色咖啡杯: R=50 G=180 B=120 → G>R → 排除
    #      - 木板/帽子高光 (worker 木板 R=190 G=160 B=130) — RGB 跟 sclera 几乎相同! 只能按位置排除
    #    mask 公式 (catches green-tinted sclera, excludes 5 类保留色域):
    #      alpha=255 + R∈[150,245] + (R-G)<50 + (G-B)∈[10,100] + (R-B)<100 + sum<720 + !R==G==B
    #    空间约束 (避免误治木板/帽高光): 用黑瞳位置生成 sclera zone mask, 跟 color mask AND 起来
    #      - 黑瞳检测: alpha=255 + R<50 + G<50 + B<50 (在 face 区 y=70-115, x=40-160)
    #      - sclera zone: 瞳中心 ± 18 像素 (覆盖眼底月牙 + 部分眼周, 避免远距离误治)
    #      - 闭眼帧没有瞳 → sclera zone 空 → v4.16 不生效 (0 误治)
    #    操作: HSL L*=1.18 + S=0 → 纯白 (跟 v4.14.2 一致, 但 mask 是真正命中 green-tinted sclera)
    #    风险: 边缘 (R-G<50 但 R-B=80-100 软过渡) 不治, 保留色相软过渡 (跟 v4.15 同样"塑料感避免" 逻辑)
    #    演进根因:
    #      v4.15 mask R>230 R-B<40 命中 0-1 px (眼底月牙实际 R=150-220, 阈值差太远)
    #      v4.16 放宽 mask 到 R>150 R-G<50 G-B>10 — 命中 50-1100 px, 真正治 green-tinted sclera
    #      v4.16 加空间约束 (瞳 ± 18 px) — 避免误治木板/帽高光 (RGB 跟 sclera 一样, 只能按位置分)
    color_mask = (alpha == 255) & (r3 > 150) & (r3 < 245) & ((r3 - g3) < 50) & ((g3 - b3) > 10) & ((g3 - b3) < 100) & ((r3 - b3) < 100) & (sum3 < 720) & ~((r3 == g3) & (g3 == b3))
    # 空间约束: 黑瞳 → sclera zone (瞳中心 ± 18 px)
    pupil = (alpha == 255) & (r3 < 50) & (g3 < 50) & (b3 < 50)
    pupil[:70, :] = False  # 限制脸区
    pupil[115:, :] = False
    pupil[:, :40] = False
    pupil[:, 160:] = False
    if pupil.sum() > 0:
        # 找连通分量, 选最大的 2 个 (左右眼)
        try:
            from scipy import ndimage
            labeled, n = ndimage.label(pupil)
            sizes = ndimage.sum(pupil, labeled, range(1, n+1))
            top_ids = sorted(range(1, n+1), key=lambda i: -sizes[i-1])[:2]
            sclera_zone = np.zeros_like(pupil)
            for cid in top_ids:
                if sizes[cid-1] > 20:  # 瞳至少 20 px
                    ys, xs = np.where(labeled == cid)
                    cy, cx = int(ys.mean()), int(xs.mean())
                    y0, y1 = max(0, cy-18), min(pupil.shape[0], cy+18)
                    x0, x1 = max(0, cx-18), min(pupil.shape[1], cx+18)
                    sclera_zone[y0:y1, x0:x1] = True
        except ImportError:
            sclera_zone = np.ones_like(pupil)  # fallback: 无空间约束
    else:
        sclera_zone = np.zeros_like(pupil)  # 闭眼 → 0 治
    eye_white = color_mask & sclera_zone
    if eye_white.sum() > 0:
        # 转 HLS (cv2 RGB->HLS_FULL, H in 0-255, L in 0-255, S in 0-255)
        rgb_bgr_eye = cv2.cvtColor(rgb_fixed, cv2.COLOR_RGB2HLS_FULL)
        l = rgb_bgr_eye[:,:,1].astype(float)
        s = rgb_bgr_eye[:,:,2].astype(float)
        # v4.12: L 提 18% (R 已饱和, 再多无效)
        l_new = np.minimum(l * 1.18, 255.0)
        l_boosted = l.copy()
        l_boosted[eye_white] = l_new[eye_white]
        # v4.14: S 拉低到 0 (眼白完全去色, 灰白 (240, 240, 240))
        #    L 已提 18% → 228, S=0 → 眼白 = (228, 228, 228) 纯灰白
        #    风险: 视觉"塑料感" (无色相 = 假白), 但用户说"还能更白" → 接受
        #    演进: v4.13 S*0.10 仍剩 10% 色相, 视觉变化小, v4.14 S=0 完全去色
        s_new = np.zeros_like(s)
        s_lowered = s.copy()
        s_lowered[eye_white] = s_new[eye_white]
        rgb_bgr_eye[:,:,1] = l_boosted.astype(np.uint8)
        rgb_bgr_eye[:,:,2] = s_lowered.astype(np.uint8)
        rgb_fixed = cv2.cvtColor(rgb_bgr_eye, cv2.COLOR_HLS2RGB_FULL)
    return rgb_fixed


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
        # v4.9: alpha 通道激进收紧阈值 175 → 240, 治本"眼白雾蒙蒙" (alpha 240+ partial 残留)
        alpha = harden_alpha_edges(alpha, low_thresh=80, high_thresh=240)
        # v4.6: 关键步骤 — 替换 partial + 透明 + 1px 外圈 (r=8), + 绿偏不透明 (r=4)
        rgb_fixed = inpaint_partial_rgb(arr, alpha, radius=8)
        # v4.17: 移除 alpha 羽化 (softer_alpha radius=1) — 它引入 52 个 partial alpha 像素让眼边"灰蒙蒙"
        #    源视频 H3 模型输出 768x768 高分辨率, 眼边缘已经锐利, 不需要额外 Gaussian blur 抗锯齿
        #    1px blur 把 alpha 255 → 200 范围, partial 像素 RGB 跟桌面背景混合 = "灰蒙蒙"
        #    风险: body 边缘"硬切" (无抗锯齿). 缓解: v4.6 的 inpaint r=8 已经填了 partial 像素
        #          使 alpha 大部分 0/255, soften_alpha 影响小 (实测 50 像素内只 1-2 partial 像素)
        #          视觉上身体边缘仍可接受 (源视频就锐利)
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
