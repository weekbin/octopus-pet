# V2 动作生产管线 (Pipeline)

> **目标**: 14 个动作视频从"0 想法"到"部署到 V2 桌宠"的完整流程,每步有明确输入/输出/工具/时间。
> **抽象层**: 本文档**只描述流程**,**不描述具体动作内容**。具体动作内容由 `prompts/` 目录按格式填。
> **配套文档**: `docs/prompt-format.md` (段落格式) + `docs/action-prompt-methodology.md` (方法论理论) + `prompts/00-format.md` (格式骨架) + `prompts/01-example-pretend-busy.md` (格式应用示范)

---

## 流程总览 (8 步)

```
[Step 1] 角色基准确认 ──┐
                        ├──→ [Step 2] 动作列表 ──→ [Step 3] 动作秒级分解
                        │                              ↓
[Step 8] 部署到 V2  ←── [Step 7] 编码转换  ←── [Step 6] 验证首尾帧  ←── [Step 5] 视频生成
```

| Step | 名称 | 输入 | 输出 | 工具 | 时间 |
|------|------|------|------|------|------|
| 1 | 角色基准确认 | (无) | V2.1 标准图 | `mavis image_synthesize` | 已完成 (V10-D) |
| 2 | 动作列表 | V1 14 场景 | V2 14 动作清单 (含范式) | (人工设计) | 1-2 小时 |
| 3 | 动作秒级分解 | 1 个动作 | 1 个 prompt (4 段) | 段落格式 | 5-10 分钟/动作 |
| 4 | prompt 套用 | 段落格式 + 3 段内容 | 完整 prompt (含通用前缀) | (复制粘贴) | 1 分钟/动作 |
| 5 | 视频生成 | 完整 prompt + V2.1 标准图 | 1 个 mp4 (10s) | `connector__matrix__gen_videos` | 2-3 分钟/视频 |
| 6 | 验证首尾帧 | mp4 文件 | 验证报告 (PASS/FAIL) | ffmpeg + PIL | 1 分钟/视频 |
| 7 | 编码转换 | 验证 PASS 的 mp4 | APNG 或 webm | `scripts/breath-pipeline.md` 的 Step 4 / `scripts/encode-webm-alpha.sh` | 1-2 分钟/视频 |
| 8 | 部署到 V2 | APNG/webm 文件 | 替换 V1 桌宠的 sprite/状态 | 手工或 Tauri 热更新 | 5 分钟/动作 |

**总耗时**: 14 动作全跑 ≈ 2-3 小时 (主要是 Step 5 gen_videos 排队 + Step 7 编码)

---

## Step 1: 角色基准确认

**目的**: 确定 V2.1 标准的"起点"角色,所有 14 动作视频的第一帧都基于此。

**输入**: 无 (这是流程第一步)

**输出**:
- `art/octopus-frames/standard-char-1x1.png` (V2.1 标准图)
- 3/4 视角, 珊瑚粉章鱼, 8 触手前向跪坐, 2 圆耳小凸起, 全睁眼, 表情温和, 微微腮红
- 绿幕 `#00FF00` 严格统一, 1920×1920

**工具**:
- `mavis image_synthesize` (image-to-image, 用 V2.1 源作 reference)
- `scripts/remove-hat-greenscreen.py` (清理生成时的帽子残留)

**关键产物**:
- commit `ee3af62` (V2.1 standard character + hat removal script)
- commit `aa62fbc` (V0.5-3 validation)
- `docs/v053-validation/` (验证产物)

**当前状态**: ✅ 已完成 (v10-D.png = standard-char-1x1.png, V0.5-3 96.65% 相似度 PASS)

---

## Step 2: 动作列表 (V1 14 场景 → V2 14 动作)

**目的**: 把 V1 的 14 个工作状态场景,映射到 V2 桌宠的 14 个 10s 演示动作。

**输入**:
- V1 14 场景: `pretend-busy` `stay-late` `breakdown` `lying-flat` `multi-tasking` `payday` `salary-rejected` `treat-milk-tea` `friday-5pm` `toilet-slacking` `touch-fish` `waiting-m3pro` `soul-leaving` `multitask`

**输出**:
- V2 14 动作清单 (含: 名称/触发场景/核心元素/对应 dsh-pet 范式)
- 每个动作的"变出什么 / 做什么 / 消失什么"

**工具**:
- 借鉴 dsh-pet 10 秒动作提示词 (作为**学习参考**,不是直接抄)
- 当前映射表见 `docs/action-prompt-methodology.md` §7

**示例 (1 个)**:

| V1 场景 | V2 动作 (10s 演示) | dsh-pet 范式 | 核心元素 |
|---------|-------------------|--------------|----------|
| `pretend-busy` | 假装很忙 (敲键盘) | 范式 17 变体 | 变出键盘 + 触手快速敲击 + 键盘消失 |

**关键决策**:
- 每个 V1 场景 **必须**拆出一个对应 V2 动作 (1 对 1)
- 核心元素选择 V1 场景的"标志性动作" (e.g. pretend-busy = 敲键盘)
- 元素种类 限 V2 章鱼可实现的 (触手举起/触手卷曲/触手微动 + 表情变化),不引入 V1 才有的(手/脚/衣服)

**当前状态**: 🚧 14 动作 mapping 表已设计 (methodology.md §7),具体动作内容**待 Step 3 实施**。

---

## Step 3: 动作秒级分解

**目的**: 把 1 个 V2 动作拆成 3-5 段,每段 1.5-3.5s,**时间戳明确**,**比例数字化**,**⚠️ 强调覆盖物理约束**。

**输入**:
- 1 个 V2 动作 (从 Step 2 来)
- V2.1 标准图 (作 first_frame)
- `docs/prompt-format.md` (段落格式骨架)
- `prompts/00-format.md` (完整通用前缀)

**输出**:
- 1 个完整 prompt (`.md` 文件, 见 `prompts/0X-xxx.md` 格式)
- 4 个段落: 通用前缀 + 动作概述 + 按秒分割 (3-5 段) + 动作结束后状态

**关键约束 (每个动作必满足)**:
- 段数 3-5 段, 总时长 10s
- 每段 5 元素齐全: 起始/动作/细节/⚠️/空间
- 至少 1 个 ⚠️ 强调 / 段
- 至少 1 个数字化比例 / 段 (e.g. "5% 画幅宽度", "距顶 10% 绿色")
- 段尾物体凭空消散有明确说明
- 动作结束后状态列举所有残留物体
- **没有 dsh-pet 角色专属词** (双手/双脚/呆毛/裙摆/鲸鱼尾巴/鞋/围裙)

**工具**:
- 人工设计 (这一步是创意决策, 不可自动化)
- 借用 dsh-pet 10 秒动作提示词 (作为**结构参考**, 改编为 V2 章鱼版本)

**当前状态**: 🚧 1 个示范完成 (prompts/01-example-pretend-busy.md), 14 个真实动作**待人工引导**。

**时间预估**: 5-10 分钟/动作 × 14 = 1-2 小时

---

## Step 4: prompt 套用 (机械化)

**目的**: 把 Step 3 写的动作秒级分解,**套上** Step 1 的通用前缀,**形成**完整 prompt。

**输入**:
- Step 3 的秒级分解 (.md)
- `prompts/00-format.md` (完整通用前缀)

**输出**:
- 1 个完整 prompt (大段文本,可直接喂给 mavis)

**操作**: 复制 通用前缀 + 复制动作概述 + 复制按秒分割 + 复制动作结束后状态。

**自动化机会**: 此步 100% 机械化,可写个 `scripts/assemble-prompt.sh` 拼装,但目前**性价比不高**(14 动作, 手工 1 分钟/动作也才 14 分钟)。

**当前状态**: ✅ 1 个示范 (01-example-pretend-busy.md) 完成。

---

## Step 5: 视频生成 (Gen Videos)

**目的**: 用 mavis `connector__matrix__gen_videos` 把完整 prompt 转成 10s mp4。

**输入**:
- 完整 prompt (Step 4 输出)
- V2.1 标准图 (作 first_frame, OSS URL)

**输出**:
- 1 个 mp4 (10s, 768P 或 1080P, 6s 或 10s)

**API 调用模板**:
```python
{
  "requests": [{
    "input_image": {"url": v10_d_url, "mime_type": "image/png"},
    "reference_type": "first_frame",
    "prompt": full_prompt,  # 通用前缀 + 动作概述 + 按秒分割 + 状态
    "duration": 10,  # 或 6 (10s 必须 768P)
    "resolution": "1080P"  # 或 768P (1080P 必须 6s)
    "output_file": "v2-action-XX.mp4"
  }]
}
```

**工具**:
- `connector__matrix__gen_videos` (mavis 工具)
- 上传 V2.1 标准图: `mcode-tools upload_temp_url`

**当前状态**: 🚧 V0.5-3 验证已 PASS (96.65% 相似),真实 14 动作待跑。

**时间预估**: 2-3 分钟/视频 × 14 = 30-45 分钟

**已知风险** ⚠️:
- gen_videos 改风格 (3D Pixar → 2D 卡通) 可能在某些动作上风格漂移
- 单个 6s/10s 视频上限有限, **复杂动作 (e.g. 变物+使用+消失 5 段) 可能溢出**

---

## Step 6: 验证首尾帧 (Validation)

**目的**: 验证生成的视频**首末帧一致** (符合通用前缀约束),**动作自然**,**无越界**。

**输入**:
- 1 个 mp4 (Step 5 输出)
- 验证脚本 (基于 ffmpeg + PIL)

**输出**:
- 验证报告: PASS / FAIL + 指标 (相似度, 帧差异, 越界检查)

**验证指标**:
- 0s vs 5.5s/9.5s 帧 diff: mean < 10, max < 100, similarity > 95%
- 圆耳小凸起 不超出画幅顶边 15% 范围
- 触手触地点 不超出画幅底边 10% 范围
- 触手 不超出画幅左右 10% 范围
- 整体身体轮廓 不超出画幅边界

**工具**:
- ffmpeg (抽帧)
- PIL + numpy (像素对比, 边界检查)
- `docs/v053-validation/` 已有 V0.5-3 验证产物可参考

**当前状态**: ✅ V0.5-3 验证脚本可用 (frame_0s.png vs frame_55s.png 对比通过)

**时间预估**: 1 分钟/视频 × 14 = 15 分钟

---

## Step 7: 编码转换 (Encode)

**目的**: 把 mp4 (H.264 通用格式) 转成 V1 桌宠可用的**透明通道**格式 (APNG 或 VP9 webm)。

**输入**:
- 验证 PASS 的 mp4 (Step 6 输出)
- 绿幕背景 (用于 chroma key 抠像)

**输出**:
- 1 个 APNG (短动作 < 50 帧, V1 验证方案)
- 或 1 个 VP9 webm (长动作 > 50 帧, V2 推荐)

**路径 1 (APNG, V1 验证)**:
1. ffmpeg 抽帧 (mp4 → PNG 序列, 24 fps × 10s = 240 帧)
2. flood-fill 抠像 (RGB ~ #00FF00 → 透明) → scripts/breath-pipeline.md 复用
3. PIL APNG 编码 (disposal=0, 不要合并相同帧)

**路径 2 (VP9 webm, V2 推荐)**:
1. ffmpeg-full 编码 (alpha_mode=1, 体积小 14-28x)
2. `scripts/encode-webm-alpha.sh` 已封装

**工具**:
- `scripts/encode-webm-alpha.sh` (VP9 webm, V2 推荐)
- `scripts/breath-pipeline.md` 完整流水线 (V1 已验证)

**当前状态**: ✅ 编码工具就绪 (ad31688 提交 encode-webm-alpha.sh)

**时间预估**: 1-2 分钟/视频 × 14 = 25 分钟

---

## Step 8: 部署到 V2 桌宠

**目的**: 把 14 个动作资源接进 V1 桌宠的 FSM,实现**状态切换** (e.g. 假装很忙 → 真的在忙 → 摸鱼)。

**输入**:
- 14 个编码后的资源 (APNG/webm)
- V1 FSM 代码 (XState 5)

**输出**:
- V2 FSM 代码 (V1 FSM + 14 动作状态)
- 状态触发逻辑 (MCP 6 工具 + HTTP :9527)

**部署路径**:
1. 把 14 资源放到 `app/public/assets/octopus/`
2. 更新 Spritesheet manifest (`app/src/data/spritesheet-manifest.json`)
3. 写 V2 FSM (XState 5 状态机) 把 V1 14 场景映射到 V2 14 动作
4. 改 `src-tauri/src/actions.rs` 让 `pet_set_state` 支持 14 动作
5. Tauri 热更新 (不需要重 build 二进制)

**工具**:
- V1 代码 (已就绪)
- 14 动作文件 (Step 7 输出)

**当前状态**: 🚧 V1 FSM 跑通 (pretend-busy 等已在用 V1 spritesheet 跑),V2 FSM 改造**待 V2 14 动作编码完成后**。

**时间预估**: 5-10 分钟/动作 (接 FSM + 验证) = 1.5-2.5 小时

---

## 总结 (Summary)

| Step | 状态 | 备注 |
|------|------|------|
| 1 角色基准 | ✅ 完成 | v10-D.png = standard-char-1x1.png |
| 2 动作列表 | 🚧 设计中 | methodology.md §7 mapping 表已出 |
| 3 动作秒级分解 | 🚧 1/14 示范 | 01-example-pretend-busy.md |
| 4 prompt 套用 | ✅ 模板就绪 | prompts/00-format.md |
| 5 视频生成 | 🚧 0/14 | V0.5-3 验证 PASS |
| 6 验证首尾帧 | 🚧 0/14 | 验证脚本可用 |
| 7 编码转换 | ✅ 工具就绪 | encode-webm-alpha.sh |
| 8 部署到 V2 | 🚧 待 V2 编码后 | V1 FSM 已跑通 |

**关键瓶颈**: Step 3 (人工设计) + Step 5 (gen_videos 排队 30-45 分钟)

**下一步**:
1. 用户引导 Step 3 的 14 动作具体内容
2. 写一个 Step 3 → Step 5 的循环脚本 (批量跑 gen_videos)
3. Step 6 验证脚本集成到循环里 (失败自动重跑)
