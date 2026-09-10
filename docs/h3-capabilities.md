# H3 Capabilities — H3 必须提供什么 (桌宠 V2 视频生成)

> **目的**: 一份独立文档,清楚列出 H3 (MiniMax-H3) 在为章鱼桌宠 V2 生成动作视频时**必须**提供的能力。pipeline 实现细节 (BiRefNet/CorridorKey/borrow/ROI) 见 `docs/v10-pipeline.md`. prompt 工程方法论见 `docs/action-prompt-methodology.md`. 段落格式规范见 `prompts/00-format.md`.
>
> **定稿时间**: 2026-09-10 (v10-final 配套)
> **来源**: 3 个已落地场景 (detective-study / worker-construction / drink-coffee) 实测

---

## 1. 调用方式

**唯一推荐**: H3 异步双图模式 (首末帧 + 双图一致性), 通过 `~/.minimax/agents/mavis/skills/h3-dual-image-video-gen/scripts/run_h3_video.py` 调起.

```python
{
    "prompt": "<4 段 prompt 完整内容, 见 prompts/0X-name.md>",
    "first_frame_image": "<V2.1 standard-char-1x1.png OSS URL>",
    "last_frame_image": "<必须 == first_frame, 同一张图>",
    "duration": 6,                # 6s (桌宠循环 = 100 帧 @ 15fps)
    "aspect_ratio": "1:1",        # 768×768
}
```

| 路径 | 工具 | 时长 | 末帧 | 2K | audio | 异步 | 成本 |
|------|------|------|------|----|----|------|------|
| **A (历史默认,弃用)** | `gen_videos` + Hailuo-2.3 | 6s 固定 | ❌ | ❌ | ❌ | ❌ 同步 | 💰 便宜但**首末不一致** |
| **B ⭐ 当前唯一** | H3 双图 (first=last) | 4-15s 任意 | ✅ | ✅ | ✅ | ❌ 同步 | 💰💰 中等 |

**为什么必须用 H3 (B), 不能再用 Hailuo-2.3 (A)**:
- 桌宠要 6.6s 完美循环 — 首末帧必须视觉一致
- Hailuo-2.3 物理上 0s vs 5.5s 相似度只有 40-45% (V0.5-3 实测), 道具不消失
- H3 接收同一张图作 first+last_frame, 模型强制首末一致 (V2.1 标准图恢复)

---

## 2. 必须输入 (3 项)

### 2.1 first_frame_image / last_frame_image

**必须 = 同一张图 (V2.1 standard-char-1x1.png)**, 任何 H3 调用都强制此约束. 该图特征:
- 1920×1920, 3/4 跪坐姿态
- 头顶 2 个圆润小圆耳小凸起
- 8 条触手前向触地 (章鱼"坐"在自己触手上)
- 全睁双眼 + 大小星形高光 + 黑色瞳孔
- 温和微笑 + 微微腮红
- 珊瑚粉身体
- **纯绿背景 `#00FF00`** (作绿幕基线)
- 没有: 双手/双脚/裙摆/鲸鱼尾巴/任何服饰

图片位置: `art/octopus-frames/standard-char-1x1.png` (art/ 在 .gitignore, 用户本地持有). 调 H3 时上传到 OSS 得 URL.

### 2.2 prompt (4 段固定结构)

**Section 1: 通用前缀** (~300 字, 16 项约束, 每动作必加复制粘贴) — 见 `prompts/00-format.md` §1.
**Section 2: 动作概述** (1-2 句, 强调"原地" + 8 触手锚定原点)
**Section 3: 按秒分割画面** (3 段 × 2s, 每段 5 元素: 起始/动作/细节/⚠️/空间)
**Section 4: 动作结束后状态** (固定模板 + 残留物体清单)

完整格式规范: `prompts/00-format.md`. 实际应用示范: `prompts/01-detective-study.md` (3 场景已跑通).

### 2.3 duration (6)

桌宠循环 = 100 帧 @ 15fps = 6.6s. H3 6s 输出 + APNG 头尾加帧实现 6.6s. **不要 10s 或更长**:
- 8 触手锚定 + 1s 道具淡出 + 1s 恢复 至少要 5s 缓冲
- 100 帧比 50 帧流畅度高 100% (v4.19/v4.20 实测), 但视频越长单帧推理越慢

---

## 3. 必须输出 (1 项)

`{name}-h3.mp4` 文件, 特征:
- 6.0s 时长
- 768×768, 30fps
- 25-30 fps 关键帧间隔
- 文件大小 ~5MB
- H.264 / mp4 容器
- 纯绿背景 + 章鱼 (无文字/字幕/logo)

输出位置约定: `docs/v2-XX-name/v2-XX-name-h3.mp4` (但 v10-final 是定稿, docs/v2-XX/ 历史目录已清理; 当前 production APNGs 在 `app/public/assets/octopus/v2/{id}.png`).

---

## 4. 通用前缀 16 项约束 (H3 必须接受)

| # | 约束 | 关键数字 / 说明 |
|---|------|----------------|
| 1 | 视频比例 16:9 | 实际产出 1:1 (768×768), prompt 仍写 16:9 让模型理解画幅 |
| 2 | 背景纯绿 `#00FF00` | 颜色统一, 无阴影/杂物/渐变 |
| 3 | 章鱼位置强制固定 | 头顶 20% / 触手触地点 85% / 身体左右 25% & 75% |
| 4 | 身体大小一致 | 不同视频之间 0 偏差 |
| 5 | 章鱼周围缓冲区 | 顶 15% / 底 10% / 左右 10% 绿色空间 |
| 6 | 禁止身体部位裁切 | 圆耳/触手/身体全程在画幅内 |
| 7 | 道具距离约束 | 道具完全在身体内 或 ≥ 3% 间距; 不得遮脸/圆耳; 距画幅 ≥ 5% |
| 8 | 8 触手锚定原点 | 不平移, 只允许轴心旋转/原地跳跃/触手微动 (≤ 5% 抬起, ≤ 10° 弯曲) |
| 9 | 首末帧完全一致 | 跟 first_frame == last_frame 配对, 模型保证 |
| 10 | 背景色一致 | 不同视频之间 0 色差 |
| 11 | 表情约束 (温和微笑) | 全程不变化, 除非动作明确要求 (e.g. 戴帽研究的"眉头微皱 5°") |
| 12 | 道具尺寸约束 | 帽子 ≤ 12% 画幅宽, 放大镜 ≤ 10% (避免遮圆耳/脸) |
| 13 | 道具消失方式 | "渐变淡出" (1s 内), **不要** "凭空消散" (0.3s, 模型无法执行) |
| 14 | 段时长约束 | 6s = 3 段 × 2s (舒缓) 或 4 段 × 1.5s (紧凑) |
| 15 | 每段 5 元素齐全 | 起始/动作/细节/⚠️/空间, 至少 1 个 ⚠️ / 段 |
| 16 | 数字化比例必加 | "5% 画幅宽度", "距顶 10%", "12% 画幅宽度" 等具体数字 |

**约束 7/12/13 是 V2 反馈迭代 v1→v2 治本** (v1 戴帽 18% 画幅宽遮圆耳 → v2 12%; v1 凭空消散 0.3s 模型无法执行 → v2 渐变淡出 1s).

---

## 5. 角色特征清单 (H3 必须理解)

### 5.1 V2.1 章鱼本体

- 姿态: 3/4 跪坐, 8 触手自然前向 (像坐在自己的触手上)
- 头顶装饰: **2 个圆润小圆耳小凸起** (章鱼天然耳触手, **不是**呆毛)
- 眼睛: 全睁, 大小星形高光, 黑色瞳孔
- 表情: 温和微笑, 微微腮红 (粉红色)
- 颜色: 珊瑚粉 (coral pink, RGB 接近 #FF8A9A)
- 极简原则: **没有** 双手/双脚/裙摆/鲸鱼尾巴/衣服/帽子/头饰/任何服饰

### 5.2 禁止的视觉元素

- 任何"呆毛" (V2 圆耳是触手, 不是头发)
- 任何"裙摆" (章鱼没有腰腿)
- 任何"鲸鱼尾巴" (章鱼是软体, 触手腕足结构)
- 任何 dsh-pet 角色专属词 (双手/双脚/围裙/鞋)

---

## 6. 道具规格 (每个动作 0-2 个)

| 道具 | 最大尺寸 | 关键约束 |
|------|---------|---------|
| 帽子 (侦探/施工/咖啡店) | 12% 画幅宽 | 不遮圆耳, 戴后仍可见 (从两侧/顶部) |
| 放大镜 | 10% 画幅宽 | 玻璃区域 H3 可能渲成绿色 (v5.2/v10 已治本) |
| 杯子 (咖啡/奶茶) | 10% 画幅宽 | 触手可握, 不得触碰脸 |
| 键盘/锤子/工具 | 8% 画幅宽 | 触手可举, 动作约束 ≤ 5% 抬起 |
| 桌子/工作台 | ROI ≤ 50% 画幅 | 桌腿不得超出身体左右 25% & 75% 位置 |

---

## 7. V2 14 动作清单 (H3 必须能生成)

**当前已落地 3 个** (v10-final deployed 2026-09-10):
1. **detective-study** — 戴侦探帽 + 举放大镜研究 (3 段 × 2s, prop = 帽+放大镜)
2. **worker-construction** — 戴黄施工帽 + 砸锤子 + 放桌子 (3 段 × 2s, prop = 帽+锤+桌)
3. **drink-coffee** — 戴咖啡店围裙 + 举咖啡杯 (3 段 × 2s, prop = 围裙+杯)

**11 个待做** (V1 14 场景 → V2 14 动作映射, 见 `docs/action-prompt-methodology.md` §7):
4. pretend-busy — 触手快速敲键盘
5. stay-late — 桌前托腮叹气
6. breakdown — 触手抱头趴桌
7. lying-flat — 8 触手摊开躺平
8. multi-tasking — 触手分别看不同方向
9. payday — 触手撒钱
10. salary-rejected — 触手撕账单
11. treat-milk-tea — 触手捧奶茶
12. friday-5pm — 触手飞奔出门
13. toilet-slacking — 触手偷看手机
14. touch-fish — 触手假装在工作
15. waiting-m3pro — 触手等待思考
16. soul-leaving — 灵魂出窍 (鬼魂触手)
17. multitask — 多个屏幕触手来回切

> **加新动作流程** (5 步, 见 `docs/v10-pipeline.md` §7.1):
> 1. 写 H3 prompt (按 4 段格式, 复用通用前缀)
> 2. 跑 `run_h3_video.py` 生成 mp4
> 3. 加 entry 到 `scenes.json`
> 4. 跑 `python3 scripts/extract-v10-final.py` 转 APNG
> 5. 跑 `bash scripts/build-scene-registry.sh` + `check-scenes-sync.sh` 同步 TS/Rust

---

## 8. 已知 H3 行为问题 (治本受限, 靠 v10-final 兜底)

> H3 是神经网络, 不可能 100% 按 prompt 执行. 以下是已观察到的稳定行为模式, 已知 v10-final 6 阶段 (BiRefNet+CorridorKey+strict gate+forehead+borrow+ROI demote) 能治本. 改 H3 prompt 不能解决, 改 pipeline 才能.

| 问题 | 根因 | v10-final 治本 |
|------|------|----------------|
| **帽反光 → 额头"白方块"** | detective f67-72 H3 渲染帽子反光进额头像素 RGB (178,69,69 → 255,255,255) | forehead_white_mask ROI y=50-80, x=70-110 强制 (240,220,210) 暖白 |
| **绿幕反射进身体** | drink-coffee H3 把绿幕反射进章鱼身体 RGB (绿偏) | CorridorKey 物理级 unmixing + green_residual_alpha0 |
| **放大镜玻璃绿色** | detective H3 放大镜玻璃区应透明但渲成绿 | CorridorKey 知道"绿=反射源" 分离混合 |
| **prop 淡入/淡出帧 prop 渲成绿色** | detective f65-72, worker f66-72 prop 渐变帧 H3 渲成前景绿 | borrow+recolor: 取参考帧 (clean frames) median, phaseCorrelate shift, 替换 green-in-fg 像素 |
| **Hailuo 6s 末帧道具不消失** | Hailuo 模型不接收 last_frame_image | 用 H3 双图模式 (first=last) 强制首末一致 |

---

## 9. 不在 H3 范围 (pipeline 自己解决)

| 问题 | 解方 |
|------|------|
| 绿幕色 → 透明 alpha | Stage 3-4 (BiRefNet + CorridorKey) |
| 192×192 桌宠尺寸 | Stage 4 resize |
| 6.6s 100 帧 APNG 循环 | Stage 4 PIL APNG output, numPlays=1 (触发 'end' 事件) |
| prop 淡出帧 prop 绿色 | Stage 5 borrow+recolor+inpaint |
| detective 放大镜 ROI | Stage 6 ROI demote (alpha=0) |
| worker 桌子 ROI | Stage 6 ROI recolor (绿→棕) |
| V1 → V2 scene 切换 | 跟 H3 无关, XState FSM rotateScene, 见 `app/src/state/octopus-fsm.ts` |

---

## 10. 调用实例 (复制即用)

```bash
# 1. 准备 V2.1 标准图
ls -la art/octopus-frames/standard-char-1x1.png  # 1920×1920 绿幕

# 2. 写 H3 prompt
cat > prompts/04-new-action.md <<'EOF'
# 04. 新动作 — V2 v1

<Section 1 通用前缀 (~300 字, 16 项约束, 复制粘贴)>
<Section 2 动作概述 (1-2 句)>
<Section 3 按秒分割画面 (3 段 × 2s)>
<Section 4 动作结束后状态 (固定模板)>
EOF

# 3. 调 H3 生成视频
python3 ~/.minimax/agents/mavis/skills/h3-dual-image-video-gen/scripts/run_h3_video.py \
    --prompt-file prompts/04-new-action.md \
    --first-frame art/octopus-frames/standard-char-1x1.png \
    --output /tmp/04-new-action-h3.mp4

# 4. 加到 scenes.json
# (手工编辑 + 跑 build-scene-registry.sh)

# 5. 跑 v10-final 转 APNG
PYENV_VERSION=3.12.3 python3 scripts/extract-v10-final.py \
    --input /tmp/04-new-action-h3.mp4 \
    --output app/public/assets/octopus/v2/04-new-action.png

# 6. 验证 + 提交
ls -la app/public/assets/octopus/v2/04-new-action.png  # 192×192 RGBA APNG
```

---

## 11. 关键引用

| 文件 | 作用 |
|------|------|
| `prompts/00-format.md` | 4 段 prompt 段落格式规范 |
| `prompts/01-detective-study.md` | 真实 prompt 范例 (3 段 × 2s, prop 帽+镜) |
| `prompts/02-worker-construction.md` | 真实 prompt 范例 (3 段 × 2s, prop 帽+锤+桌) |
| `prompts/03-drink-coffee.md` | 真实 prompt 范例 (3 段 × 2s, prop 围裙+杯) |
| `docs/action-prompt-methodology.md` | prompt 方法论 (16 项约束 + 8 陷阱) |
| `docs/v10-pipeline.md` | 6 阶段 pipeline 实现 (BiRefNet+CorridorKey+borrow+ROI) |
| `art/octopus-frames/standard-char-1x1.png` | V2.1 标准图 (3/4 跪坐, 1920×1920, 绿幕) |
| `scenes.json` | V2 scene 元数据单一源 (M4 之后) |
