# V10 完整管线文档 (H3 Prompt → APNG 桌宠成品)

> 最后更新: 2026-09-10
> 适用: 章鱼桌宠 V2 (detective-study / worker-construction / drink-coffee)
> 状态: **v10-final 已定稿**, commit `da8484d` → 增量 `0748b02` 部署

## 唯一 default + 1 个 CPU fallback

| 脚本 | 角色 | 何时用 |
|------|------|--------|
| `scripts/extract-v10-final.py` | **唯一 default** (BiRefNet+CorridorKey+6 阶段 fixup) | 任何时候 GPU + 网络可用 |
| `scripts/extract-v4-chromakey-cpu-fallback.py` | CPU-only fallback (PIL+opencv, 25 步 color-mask 演进到 v4.24) | **仅** GPU / 网络 / torch 不可用 |

**删了的** (历史/已被取代, 见 §10 版本历史):
- ~~`extract-birefnet-apng.py`~~ — v5.1 BiRefNet alone, 放大镜玻璃治不到
- ~~`extract-v52-apng.py`~~ — v5.2 已被 v10-final 取代
- ~~`extract-chromakey-apng.py`~~ — 重命名为 `extract-v4-chromakey-cpu-fallback.py` (命名自解释)

> **H3 必须提供什么**: 见 `docs/h3-capabilities.md`. 本文档专注 pipeline 实现细节.

---

## 一、完整工作流概览

```
┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐
│ H3 Prompt │ →  │ H3 Video │ →  │  Matting │ →  │ Postproc │ →  │  APNG    │
│ (4 段)    │    │ (6.6s)   │    │ 6 stages │    │ 6 stages │    │ (99 帧)  │
└──────────┘    └──────────┘    └──────────┘    └──────────┘    └──────────┘
   prompts/      docs/v2-*/      scripts/        scripts/        app/public/
                 v2-*-h3.mp4    extract-v10-     extract-v10-    assets/octopus/
                                 final.py        final.py         v2/*.png
```

**总耗时**: 5-7 分钟/动作 (含 H3 视频生成 2-3 分钟, matting 60-90s, postproc 10s)

---

## 二、Stage 1: H3 Prompt 设计

### 2.1 通用结构 (4 段)

每个动作的 prompt 由 4 段组成:
1. **段 1 (0-2s)**: 起始状态 → 变出/穿戴/操作 (3 道具)
2. **段 2 (2-4s)**: 稳定状态/动态 (挥锤、研究等)
3. **段 3 (4-6s)**: 收尾 (道具渐变淡出 + 恢复)
4. **动作结束后状态**: 8 触手前向触地, 圆耳可见, 表情温和

### 2.2 通用前缀 (必加, 复制粘贴)

```
视频比例 1:1 (768×768), 背景必须为纯粹的绿幕色 (标准 Chroma Key Green,
颜色严格统一为 #00FF00), 无任何阴影、杂物、渐变或边框。

V2.1 章鱼标准 3/4 跪坐姿态:
  - 头顶 (含 2 个圆耳小凸起) 处于画幅垂直方向约 20% 位置
  - 触手触地点 处于画幅垂直方向约 85% 位置
  - 身体最左/最右 处于画幅水平方向约 25%/75% 位置
  - 不同视频之间的人物大小、位置、比例必须完全一致

8 触手落点中心恒定为屏幕正中央, 不发生 X/Y 轴平移, 只允许:
  - 轴心旋转
  - 原地跳跃
  - 触手微动 (触手尖上下抬 ≤ 5% 画幅高度, 整体微曲 ≤ 10°)

首尾帧必须以 V2.1 standard-char-1x1.png 标准 3/4 跪坐姿态为第一起始帧,
并在视频最后一秒 (第 6 秒结束时) 彻底恢复到与第一帧完全一致 (便于循环)。
```

### 2.3 H3 期望的提示词 (治本避免绿残)

| 关键约束 | 提示词模板 | 作用 |
|---------|-----------|------|
| 道具颜色恒定 | "道具必须保持**原始颜色** (棕色/黄色/...), 不得出现绿色或橄榄色" | 防止 H3 在 prop 进出时反射绿幕色 |
| 道具淡出方式 | "道具淡出时**均匀降低透明度** (RGB 渐变不变色), 不得改变颜色" | 防止淡出帧变成绿色块 |
| 绿幕反射 | "道具表面不得反射背景绿色, 玻璃部分保持透明/反白" | 防止放大镜染绿 |
| 物理光照 | "动作全程光照稳定, 不得出现强反光导致颜色漂移" | 防止局部高光失真 |
| 道具位置 | "道具在画幅内不得超出身体轮廓 +3% 间距" | 防止越界 |
| 首末帧 | "首末帧必须视觉完全一致 (8 触手前向, 圆耳可见, 表情温和, 无道具残留)" | 便于 6.6s 循环播放 |

### 2.4 实际使用的 prompts (14 动作, V2 通用)

文件: `prompts/00-format.md` + `prompts/01-detective-study.md` 等

- 01-detective-study (H3): 戴侦探帽 + 举放大镜研究 → 淡出
- 02-worker-construction (H3): 戴黄安全帽 + 握木锤 + 桌凭空出现 → 砸桌 2 次 → 全淡出
- 03-drink-coffee (H3): 凭空变出咖啡杯 → 举到嘴边喝 → 放下消失

### 2.5 已知 H3 模型行为问题 (治本受限, 靠 Stage 5/6 兜底)

- H3 diffusion 在 prop **淡入/淡出**帧会把 prop 渲成绿色 (绿幕反射进前景)
- H3 在物理光照下反射背景色, 无法完全避免
- 25 步 chroma key color-mask 演进无法解决, **必须用神经网络 unmixing (BiRefNet+CorridorKey)**

---

## 三、Stage 2: H3 视频生成

### 3.1 工具

**H3 异步双图视频生成** (`~/.minimax/agents/mavis/skills/h3-dual-image-video-gen/scripts/run_h3_video.py`)

```python
{
    "prompt": "...",            # 上面 4 段 prompt
    "first_frame_image": "<V2.1 标准图 OSS URL>",
    "last_frame_image": "<同上, 必须同一张>",
    "duration": 6,                # H3 4-15s 任意
    "aspect_ratio": "1:1",        # 768×768
}
```

### 3.2 关键参数

- **首末帧必须同一张图** (`last_frame_image == first_frame`), H3 才能保证循环一致
- Hailuo-2.3 物理无法保证首末一致 (0s vs 5.5s 40-45% 相似, 道具不消失)
- H3 是 V2 14 动作的**唯一可行**方案
- 视频输出: `docs/v2-XX-name/v2-XX-name-h3.mp4` (6.6s, 768×768, 30fps)

### 3.3 预期耗时

- H3 视频生成: 2-3 分钟
- 输出文件: ~5MB MP4

---

## 四、Stage 3-4: 抽帧 + 基础 Matting (BiRefNet + CorridorKey)

### 4.1 命令行

```bash
PYENV_VERSION=3.12.3 python3 scripts/extract-v10-final.py
```

GPU 不可用时:
```bash
python3 scripts/extract-v4-chromakey-cpu-fallback.py --input X.mp4 --output Y.png
```

### 4.2 Stage 1: BiRefNet (软 alpha hint)

- 模型: `ZhengPeng7/BiRefNet` (HF)
- 输入: 768×768 RGB
- 输出: 192×192 soft alpha (float [0, 1])
- 推理: RTX 3060 fp16, ~0.7s/帧
- VRAM: 1.7GB

### 4.3 Stage 2: CorridorKey (物理级 unmixing)

- 模型: `nikopueringer/CorridorKey_v1.0`
- 输入: 192×192 RGB + BiRefNet soft alpha
- 输出: 192×192 RGBA (linear alpha + straight FG color)
- 推理: 768×768 内部 tiled, ~0.7s/帧
- VRAM: 4GB
- 物理级 unmixing: 知道"绿幕绿 = 反射源", 自动分离"绿幕+前景"混合

**关键参数**:
- `refiner_scale=1.0`
- `input_is_linear=False` (sRGB 输入)
- `fg_is_straight=True` (输出非预乘 alpha)
- `despill_strength=0.5` (抑制绿幕溢出)
- `despeckle_size=400` (去小斑块)

### 4.4 输出: 100 帧 APNG @ 192×192, 6.6s 循环, 15fps (100 帧 × 66ms = 6.6s)

---

## 五、Stage 5: 后处理 — borrow + recolor + inpaint (v10-final 核心)

### 5.1 问题

H3 源视频在 prop 淡入/淡出帧 (detective f65-72, worker f66-72) 把 prop 渲成绿色, BiRefNet+CorridorKey 把这些绿色 fg 保留下来, 导致桌宠显示绿色残影。

### 5.2 算法 (3 步)

```python
# Step 1: 选参考帧 (clean frames with prop visible)
ref_indices = [63, 64, 65]  # detective
ref_indices = list(range(46, 61))  # worker (15 帧 median)

# Step 2: median reference
median_ref = pixel-wise median of clean frames (alpha-aware)

# Step 3: phaseCorrelate body region → sub-pixel shift
(dx, dy), response = phaseCorrelate(body_gray, cur_body_gray)

# Step 4: warp reference
warped = cv2.warpAffine(median_ref, M, (w, h), BORDER_CONSTANT=0)

# Step 5: recolor green-in-fg with warped non-green RGB
green_in_fg = (a > 128) & (G > R + 5) & (G > B + 5) & (G > 50)
recolor_mask = green_in_fg & (warped_a > 128) & (warped_rgb.sum > 30)
new_frame[recolor_mask, :3] = warped[recolor_mask, :3]

# Step 6: fill missing alpha with warped
fill_mask = (new_a < 128) & (warped_a > 128) & (warped_rgb.sum > 30)
new_frame[fill_mask] = warped[fill_mask]

# Step 7: inpaint remaining still-green
new_frame = cv2.inpaint(rgb_with_non_fg_black, still_green_mask_u8, 3, INPAINT_TELEA)
```

### 5.3 各场景参考帧策略

| 场景 | 问题帧 | 参考帧 | 理由 |
|------|-------|--------|------|
| detective | f65-72 | median(f63-65) | 道具稳定 + 干净, 离问题帧最近 |
| worker | f66-72 | median(f46-60) | 道具使用中 + 干净, 15 帧更稳 |

### 5.4 输出

- detective f68 绿残: 1973 → 126 (**-94%**)
- worker f69 LOST: 4850 → 1041 (**-79%**)
- worker f71 LOST: 8163 → 1563 (**-81%**)

---

## 六、Stage 6: ROI 精准处理 (per-scene 优化)

### 6.1 detective: 放大镜 ROI demote

放大镜在 f25-72 全程存在, 但 Stage 5 只处理 f65-72。**放大镜物理上应该是透明的**, 所以直接 demote 绿像素到 alpha=0。

```python
glass_roi = (x0=0, y0=55, x1=55, y1=105)  # 避开眼睛 (x>=70)
demote_mask = (a > 128) & (G > R+5) & (G > B+5) & (G > 50)
new_frame[glass_roi][demote_mask, 3] = 0
```

- detective f40 绿残: 162 → **0** (**-100%**)
- 眼睛区域 (x=70+, y=40-70) fg 保持 1500/1500 (无伤)

### 6.2 worker: 桌子 ROI recolor (f64-65)

桌子在 f64-65 是 H3 渲成绿色的极端情况。**桌子应该是棕色, 不是绿色**, 所以 recolor 成棕色 (150, 110, 70) 而不是 demote。

```python
table_roi = (x0=10, y0=130, x1=180, y1=185)
green_mask = (a > 128) & (G > R+10) & (G > B+10) & (G > 70)
new_frame[table_roi][green_mask, :3] = (150, 110, 70)
```

- worker f64: 242 px recolor green → brown
- worker f65: 773 px recolor green → brown

---

## 七、复用清单 (新场景 v10-final 处理)

### 7.1 完整命令

```bash
# 1. 写 H3 prompt
cat > prompts/04-new-action.md <<'EOF'
# 04. 新动作 — V2 v1
... 4 段 prompt + 通用前缀
EOF

# 2. 生成 H3 视频
python3 ~/.minimax/agents/mavis/skills/h3-dual-image-video-gen/scripts/run_h3_video.py \
    --prompt-file prompts/04-new-action.md \
    --output docs/v2-04-new-action/v2-04-new-action-h3.mp4

# 3. 添加 scene 到 scenes.json
# 4. 跑 v10-final pipeline
PYENV_VERSION=3.12.3 python3 scripts/extract-v10-final.py

# 5. 验证
ls -la app/public/assets/octopus/v2/04-new-action.png
```

### 7.2 添加 scene 到 scenes.json (M4 之后)

`scenes.json` 单一源:

```json
{
  "scenes": [
    {
      "id": "new-action",
      "source": "v2-04-new-action-h3.mp4",
      "bubbleLines": ["台词1", "台词2"],
      "animation": {"type": "apng", "source": "new-action"}
    }
  ]
}
```

然后跑:

```bash
bash scripts/build-scene-registry.sh      # 生成 TS + Rust
bash scripts/check-scenes-sync.sh         # 校验
```

### 7.3 关键文件

| 路径 | 作用 |
|------|------|
| `prompts/00-format.md` | prompt 通用格式 |
| `prompts/NN-name.md` | 各场景 prompt |
| `art/octopus-frames/standard-char-1x1.png` | V2.1 标准图 (1920×1920, 绿幕) |
| `docs/v2-NN-name/v2-NN-name-h3.mp4` | H3 输出 |
| `scripts/extract-v10-final.py` | **唯一 default** v10-final 完整 pipeline (Stages 1-6) |
| `scripts/extract-v4-chromakey-cpu-fallback.py` | CPU-only fallback (无 GPU 时) |
| `scenes.json` | scene 单一源 (M4 之后) |
| `app/public/assets/octopus/v2/NN-name.png` | 成品 APNG |
| `bin/octopus-pet.bin` | 提交进 git 的 release 产物 |

---

## 八、性能与限制

| 阶段 | 时间 (单场景, 99 帧) | VRAM |
|------|---------------------|------|
| H3 视频 | 2-3 min (云端 API) | - |
| Stage 1-2 matting | ~60-90s | 5.5-6.0GB |
| Stage 5-6 postproc | ~10s | <1GB |
| **总耗时** | **5-7 min/动作** | - |

---

## 九、回归测试

- `bash scripts/lint-octopus-plugin.sh` — 16/16 spec lint
- `bash scripts/check-scenes-sync.sh` — scenes.json ↔ generated 一致
- `cd app && npm test` — 16 FSM tests
- `cd src-tauri && cargo test` — 8 MCP roundtrip tests

---

## 十、版本历史

| 版本 | 状态 | 关键改进 |
|------|------|---------|
| v4.24 | deprecated | 25 步 color-mask 极限 |
| v5.2 | deprecated | BiRefNet+CorridorKey 物理 unmixing |
| v5.3 | deprecated | strict gate (高饱绿降透) |
| v10.1 | deprecated | per-pixel gate (a>128) — 引入暗橄榄误伤 |
| v10.2 | experimental | ratio gate (a>128, ratio>1.15) — worker 部分退化 |
| v10.3 | experimental | strict gate (G>150 & ratio>1.3) — 最佳单门 |
| v10.4 | experimental | inpaint (cv2.distanceTransform) — 范围不够 |
| v10.5 | experimental | borrow-only (plan C) — 只填洞不改色 |
| v10.6 | experimental | borrow+recolor — 治本突破 |
| v10.7 | experimental | 双参考帧 (exit ref) — 退化 |
| v10.8-v10.12 | ✅ 已部署 | iterative median 参考 + cv2.inpaint 兜底 |
| v10.13-v10.14 | experimental | 失败 (no-prop reference 重影) |
| v10.15-v10.17 | experimental | ROI demote (放大镜) |
| v10.18-v10.19 | experimental | worker strict pass + 桌子 recolor 棕 |
| v10.20 | experimental | BiRefNet ensemble (失败, 反而退化) |
| **v10-final** | ✅ **定稿** | 合并 v10.12 + v10.17 + v10.19 |
