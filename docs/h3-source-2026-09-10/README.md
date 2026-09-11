# H3 源 mp4 备料 (2026-09-10 批次)

> **本目录**: 5 个 H3 双图模式生成的 6s 768P mp4 源文件, **绿幕去除前**。
> **批次元数据**: 2026-09-10 20:38 ~ 21:16 (macOS M1 Pro 端, mcode-tools H3 异步 API)
> **下游消费**: `scripts/extract-v10-final.py` 在 GPU 机器 (Ubuntu 192.168.1.164 NUC) 上转 APNG
> **完整流程**: 见 `docs/handoff-2026-09-11.md` (GPU matting + 迭代 + 打包)

---

## 5 个保留场景 (verify ≥ 95%)

| 文件 | 大小 | verify 0/5.5s | prompt 范本 | V2 14 动作 |
|------|------|---------------|-------------|-----------|
| `breakdown-h3.mp4` | 478K | **95.23%** | `prompts/04-breakdown.md` | 触手抱头趴桌 |
| `friday-5pm-h3.mp4` | 902K | **99.92%** | `prompts/11-friday-5pm.md` | 触手飞奔出门 |
| `pretend-busy-h3.mp4` | 706K | **99.84%** | `prompts/09-pretend-busy.md` | 假装很忙 (6 触手敲键盘) |
| `stay-late-h3.mp4` | 520K | **97.53%** | `prompts/10-stay-late.md` | 桌前托腮叹气 |
| `treat-milk-tea-h3.mp4` | 631K | **98.52%** | `prompts/06-treat-milk-tea.md` | 触手捧奶茶 |

**总大小**: 3.2 MB
**总 0s 跟 standard-char 一致性**: 99.06-99.12% (H3 first_frame 双图模式正常, 起点完美)
**总 5.5s 循环相似度**: 95-99% (H3 last_frame 双图模式正常, 终点近标准)

---

## 4 个废弃场景 (verify < 95%, 已删)

| 场景 | verify | 失败根因 | 重做建议 |
|------|--------|---------|---------|
| `payday-h3.mp4` | 90.36% | 段 3 末帧 8 触手没完全回前向 + 钞票残影 | prompt 加 "第 6 秒末 8 触手完全前向触地, 无钞票/钱袋残影" |
| `lying-flat-h3.mp4` | 90.47% | 段 3 身体 +90° 旋转回 3/4 跪坐不精准, 圆耳朝向偏差 | prompt 加 "圆耳完全朝上, 身体中心点精确回原位" |
| `touch-fish-h3.mp4` | 92.55% | 双组触手 (4 前向假装 + 4 后向偷画) 末帧没全回 0 | prompt 拆成两段: 单 "假装很忙" 跟单 "偷偷摸鱼", 简化范式 |
| `soul-leaving-h3.mp4` | **63.91%** | H3 半透明鬼魂章鱼能力上限, 末帧鬼魂残影/实体表情未恢复 | **改范式**: 用 "触手耷拉 + 表情恍惚" 替代 "半透明鬼魂升起", 避开 H3 半透明渲染短板 |

**4 个废弃文件已 mavis-trash 删掉, 不可恢复。** 重新生成时: 改 prompt → `python3 ~/.minimax/agents/mavis/skills/h3-dual-image-video-gen/scripts/run_h3_video.py --prompt-file <new.md> --output app/public/assets/octopus/_h3-source/<scene>-h3.mp4 ...`

---

## 使用方法 (GPU 机器 v10-final 跑法)

```bash
# 1. 进入项目根
cd ~/Works/octopus-pet   # 假设 NUC 上 path

# 2. 拉本批 mp4 (5 个, 3.2MB)
git pull origin main  # docs/h3-source-2026-09-10/ 已在 git

# 3. 验证 Python 依赖 (一次性)
PYENV_VERSION=3.12.3 python3 -c "import torch, transformers, kornia; print('OK')"

# 4. 跑 v10-final (单场景示例)
PYENV_VERSION=3.12.3 python3 scripts/extract-v10-final.py \
  --input docs/h3-source-2026-09-10/pretend-busy-h3.mp4 \
  --output app/public/assets/octopus/v2/pretend-busy.png

# 5. 5 个全跑 (5 次, 每次换 --input 和 --output)
#    每个 ~96s @ RTX 3060 12GB, 总 ~8 分钟
```

**输出**: `app/public/assets/octopus/v2/<scene>.png` (192×192 RGBA APNG, 6.6s 循环, 15fps)
**迭代进项目流程**: 详见 `docs/handoff-2026-09-11.md` §3 (5 步走完)

---

## 文件来源

| 字段 | 值 |
|------|---|
| H3 模型 | `MiniMax-H3` (mcode connector `connector__matrix__submit_video_generation`) |
| 输入 first_frame | `art/octopus-frames/standard-char-1x1.png` (1920×1920, 绿幕, gitignored) |
| 输入 last_frame | 同 first_frame (双图模式 = 循环) |
| 参数 | `duration=6, resolution=768P, ratio=1:1, reference_type=first_frame` |
| 调用 wrapper | `~/.minimax/agents/mavis/skills/h3-dual-image-video-gen/scripts/run_h3_video.py` |
| prompt 范本 | `prompts/04/06/09/10/11-*.md` (4 段格式, 16 项通用前缀) |
| 提交 commit | `b4d9e8d v2 h3 batch: 9 个动作 prompt 范本 + batch wrapper + handoff` (中间状态) |
| 整理 commit | 待定 (即将提交) |
