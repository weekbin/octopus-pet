# Pipeline 总入口 (V2 桌宠动作生产)

> **状态**: ✅ v10-final 已定稿 (2026-09-10), 3 个场景部署 (detective-study / worker-construction / drink-coffee), 11 个待做
>
> **本文档**: 单一入口 — 完整演进史摘要 + 当前 default + 决策树
> **详细实现**: `docs/v10-pipeline.md` (6 阶段 pipeline 完整)
> **H3 必须提供什么**: `docs/h3-capabilities.md`
> **prompt 方法论**: `docs/action-prompt-methodology.md`

---

## 1. 当前 default (唯一)

**`scripts/extract-v10-final.py`** — 6 阶段合并管线:
1. **Stage 1**: BiRefNet 1024 (ZhengPeng7/BiRefNet) → soft alpha hint (~0.7s/帧)
2. **Stage 2**: CorridorKey 2048 (nikopueringer/CorridorKey_v1.0) → linear alpha + straight FG (~0.7s/帧, 物理级 unmixing)
3. **Stage 3**: strict gate (v10.3: a>128 & G>150 & R<150 & B<150 & ratio>1.3) → 高饱绿降透
4. **Stage 4**: forehead_white_mask (H3 帽反光治本) — ROI y=50-80, x=70-110 强制 (240,220,210) 暖白
5. **Stage 5**: borrow + recolor + inpaint (v10.12) — 参考帧 median, phaseCorrelate shift, 替换 prop 淡出帧 green-in-fg
6. **Stage 6**: ROI per-scene 优化 — detective 放大镜 alpha=0, worker 桌子绿→棕 (150,110,70)

**输入**: H3 双图模式 mp4 (768×768, 6s, first=last=V2.1 standard-char-1x1.png)
**输出**: 100 帧 APNG @ 192×192, 6.6s 循环, 15fps (100 × 66ms = 6.6s)
**耗时**: ~96s/99 帧 @ RTX 3060 12GB
**VRAM**: 峰值 5.5GB (BiRefNet 1.7 + CorridorKey 4)
**质量**: 绿残留 12× 下降 vs v4.24 color mask

**依赖**:
- Python 3.12.3 (用 `PYENV_VERSION=3.12.3` 因为 CorridorKey pyproject 锁 <3.14)
- torch 2.6.0+cu124, transformers 5.17.0, opencv-python-headless 5.0, einops, kornia, safetensors, huggingface-hub
- BiRefNet 权重 444MB + CorridorKey_v1.0.safetensors 399MB
- `HF_ENDPOINT=https://hf-mirror.com` (CN 区域必须, huggingface.co DNS 被劫持)

---

## 2. CPU fallback (无 GPU 时)

**`scripts/extract-v4-chromakey-cpu-fallback.py`** — 25 步 PIL color-mask 演进到 v4.24

| 维度 | v10-final (default) | v4 chroma-key (fallback) |
|------|---------------------|---------------------------|
| GPU 需求 | RTX 3060 12GB 必需 | **不需要** (PIL + opencv) |
| 网络需求 | HuggingFace (模型权重下载) | 不需要 |
| 推理速度 | 96s/99 帧 | 30s/99 帧 (CPU 反而快) |
| 绿残留 | 极低 (3-5% on RED bg) | 3-5% residual (放大镜玻璃/H3 帽反光治不到) |
| H3 物理光照治本 | ✅ CorridorKey 物理 unmixing | ❌ 只能 color mask 缝补 |
| 适用场景 | 默认 (V2 production) | **仅** GPU/网络不可用 |

**何时用**:
- ❌ 桌面 CI 跑 pipeline (无 GPU 容器)
- ❌ 笔记本开发机没装 CUDA
- ✅ 服务器 RTX 3060 完整环境 (默认走 v10-final)

---

## 3. 完整演进史 (v1 → v10-final)

| 版本 | 状态 | 关键改进 | 绿残留 | 速度 |
|------|------|---------|--------|------|
| **v1** | deprecated | PIL 简单 chroma (绝对绿度) | 100% (白底半透) | 快 |
| **v3** | deprecated | 阈值调整 | 80% (白底偏一点绿仍透) | 快 |
| **v4** | deprecated | 相对绿度归一化 | 50% (8 色 + H3 残留测试集通过) | 快 |
| **v4.1** | deprecated | + max<80 保护深色阴影 | 50% | 快 |
| **v4.2** | deprecated | 阈值 0.2→0.15 + 羽化 | 30% (绿黄反射 -98%) | 快 |
| **v4.3** | deprecated | + cv2.inpaint (Telea r=5) | 20% (无绿色描边) | 中 |
| **v4.4** | deprecated | inpaint mask 扩展到 alpha=255 绿偏 | 15% | 中 |
| **v4.5** | deprecated | inpaint mask 6px 膨胀 | 10% (治反射高光) | 中 |
| **v4.5.1** | deprecated | 拆 2 步独立 inpaint (保护眼锐利度) | 10% | 中 |
| **v4.6** | deprecated | alpha 激进收紧 + r=8 | 8% (3 场景 partial -24-28%) | 中 |
| **v4.7** | 撤回 | + inpaint r=3 green_tinted_white (涂抹眼睛) | 失败 (眼变模糊) | 中 |
| **v4.8** | deprecated | yellow_white color clamp (纯像素) | 6% (眼白 G 偏色 0) | 中 |
| **v4.9** | deprecated | alpha high_thresh 175→240 | 5% (alpha 240+ partial → 255) | 中 |
| **v4.10** | 撤回 | 改 G>B+8 替代 R>B+50 (误治强黄 4000+ 像素) | 失败 (帽色变橙红) | 中 |
| **v4.10.1** | deprecated | + R-B<60 限定温和米黄 | 5% (强黄 13267 完整保留) | 中 |
| **v4.11** | deprecated | G>B+5 治 G-B=7 极淡米 | 4% (143 极淡米 0) | 中 |
| **v4.12** | deprecated | HSL L*1.18 提亮眼白 (暗白 218 → 228) | 4% (brightness mean 215→228) | 中 |
| **v4.14.2** | deprecated | + S=0 全眼周去色 | 3% (灰白) | 中 |
| **v4.15** | deprecated | mask 限严 R>230 R-B<40 (软过渡) | 3% (-50% 灰白, 保留边缘色相) | 中 |
| **v4.16** | deprecated | 放宽 color mask 命中 50-1100 px/帧 + 空间约束 | 3% (sclera zone) | 中 |
| **v4.17** | deprecated | - soften_alpha (锐利) | 3% (partial 52→1, 桌宠无灰蒙) | 中 |
| **v4.18** | deprecated | inpaint_partial_rgb + eye_protect_mask | 2% (眼白保留 89.7% 源) | 中 |
| **v4.18.1** | deprecated | fill 跟 color_mask 取交集 (治 fill 越界) | 2% (无白方块) | 中 |
| **v4.19** | deprecated | 50→100 帧 7.5→15fps 流畅度优化 | 2% | 慢 |
| **v4.20** | deprecated | 100 帧 loop 完整 | 2% | 慢 |
| **v4.24** | deprecated | forehead_white_mask (治本"白方块") + 整图绿幕残留 | 2% (3 场景 forehead 0, 整图绿 0) | 慢 |
| **v5.1** (BiRefNet alone) | ~~deleted~~ | 神经网络 soft alpha, 但放大镜玻璃治不到 | 1% (放大镜玻璃仍绿) | 中 |
| **v5.2** (BiRefNet+CorridorKey) | ~~deleted~~ | 物理级 unmixing 治本 (12× 绿残留下降) | 0.5% | 96s/99 帧 |
| v10.1-v10.7 | experimental | per-pixel gate / ratio / strict gate / inpaint / borrow-only / borrow+recolor | 1-3% | 30s |
| v10.8-v10.12 | ✅ 已部署 | iterative median 参考 + cv2.inpaint 兜底 | 1% | 30s |
| v10.13-v10.19 | experimental | ROI demote + worker strict + worker table | 0.5% | 30s |
| v10.20 | experimental | BiRefNet ensemble (失败, 退化) | 1% | 96s |
| **v10-final** | ✅ **定稿** | 合并 v10.12 + v10.17 + v10.19 | 0.5% | 96s |

**关键拐点**:
- **v4 → v5.2** (color-mask → neural-unmixing): 95% → 99.5% 绿去除率, 不可逆拐点
- **v5.2 → v10-final** (pure neural → neural+postproc): prop 淡出帧 prop 绿色问题 (H3 模型行为), color mask 路线治不到, borrow 路线治本
- **v10-final** = v5.2 (matting) + v10.12 (borrow+recolor) + v10.17 (放大镜 ROI) + v10.19 (worker 桌子 ROI) — 6 阶段全开

---

## 4. 删了的脚本 (历史/被取代)

| 脚本 | 状态 | 理由 |
|------|------|------|
| ~~`scripts/extract-birefnet-apng.py`~~ | deleted (commit pending) | v5.1 BiRefNet alone, 放大镜玻璃治不到 |
| ~~`scripts/extract-v52-apng.py`~~ | deleted (commit pending) | v5.2 已被 v10-final 取代 (v5.2 缺 borrow+recolor) |
| ~~`scripts/extract-chromakey-apng.py`~~ | renamed to `extract-v4-chromakey-cpu-fallback.py` | 命名自解释 (v4 演进末态 + CPU-only + fallback) |

---

## 5. 决策树 (新场景 v10-final 处理)

```
Q1: GPU (RTX 3060+) + 网络可用?
  ├─ Yes → scripts/extract-v10-final.py (default, 96s/99 帧)
  └─ No  → scripts/extract-v4-chromakey-cpu-fallback.py (CPU fallback, 30s/99 帧)

Q2: H3 视频已经有?
  ├─ Yes (6s mp4) → 直接跑 v10-final 或 v4 fallback
  └─ No  → 调 h3-dual-image-video-gen skill (见 docs/h3-capabilities.md §10)

Q3: 验证 99 帧 APNG 没绿残?
  └─ 用 RED 背景截图测试 (绿残留 < 1% 通过) — 见 docs/v10-pipeline.md §9 回归测试
```

---

## 6. 关键引用

| 文档 | 作用 |
|------|------|
| `docs/v10-pipeline.md` | 6 阶段 pipeline 详细实现 (BiRefNet+CorridorKey+borrow+ROI) |
| `docs/h3-capabilities.md` | H3 必须提供什么 (双图模式, 视频规格, 16 项约束, 14 动作) |
| `docs/action-prompt-methodology.md` | prompt 工程方法论 (16 项约束 + 8 陷阱 + V1→V2 14 映射) |
| `docs/linux-build.md` | 跨平台编译 (macOS/Linux/Windows) + 透明窗口 + alwaysOnTop |
| `prompts/00-format.md` | 4 段 prompt 段落格式规范 |
| `prompts/01..03-name.md` | 3 真实 prompt 范例 |
| `scenes.json` | V2 scene 元数据单一源 (M4 之后) |
| `scripts/extract-v10-final.py` | **default** 6 阶段 pipeline |
| `scripts/extract-v4-chromakey-cpu-fallback.py` | CPU-only fallback (PIL+opencv) |
