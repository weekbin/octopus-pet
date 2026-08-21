# V2 H3 视频 → 桌宠透明 APNG 完整流程

> **状态**: APNG 生产管线 4 步本身仍然有效 (PIL v3 chroma key 公式沉淀可用);
> **2026-08-17 18:21 V2.1 桌宠渲染层 (webm + canvas chroma key) 已被用户否决回退**,
> 桌宠当前仍跑 V1 spritesheet. V2 APNG 路线作为"治本方案" 储备, 等用户拍板
> "想别的办法做动画切换" 后再讨论是否启用.
>
> **用途**: 把 H3 / gen_videos 生成的绿幕动作视频,加工成 V2 桌宠可直接循环播放的透明 APNG,替换 V1 桌宠 sprite。
> **适用场景**: V2 14 个动作视频统一加工流程;`prompts/01-detective-study.md` 第一个完整跑通, 13/14 复用同样管线。
> **首次完成时间**: 2026-08-21 (W1 D5, 01-detective-study 桌宠集成验证 PASS)。
> **配套文档**: `docs/v2-pipeline.md` (8 步总览) · `docs/action-prompt-methodology.md` (方法论) · `docs/breath-pipeline.md` (V1 眨眼流程, 对比参考)

---

## 适用场景

未来要:
- 把 V2 任意一个动作视频 (H3 6-15s 或 Hailuo-2.3 6s) 落到 V2 桌宠
- 调整 APNG 循环节奏 / 帧数 / 体积
- 重做某个动作视频并重新走完链路

**直接复制本流程,不需要重新探索**。

---

## 完整流程 (4 步)

```
[Step 1] H3 / gen_videos 生成绿幕视频 (双图模式)
   ↓
[Step 2] ffmpeg 抽帧 (15fps, PNG 序列)
   ↓
[Step 3] PIL chroma key v3 + 抽帧到 50 帧 + resize 192×192
   ↓
[Step 4] PIL APNG 输出 (disposal=0, 132ms/帧, 6.6s 循环)
   ↓
[Step 5] 替换 breath-idle.png + 重启 Tauri dev (验证用)
```

| Step | 工具 | 输入 | 输出 | 时间 |
|------|------|------|------|------|
| 1 | H3 (skill: `run_h3_video.py`) 或 Hailuo-2.3 | prompt + first_frame | 1 个 mp4 (6.6s, 768×768) | 2-3 分钟 |
| 2 | ffmpeg | mp4 | 99 帧 PNG 序列 | 5 秒 |
| 3-4 | PIL | 99 帧 PNG | 1 个 192×192 APNG (2.3MB) | 10 秒 |
| 5 | 手工 cp + 重启 | APNG | 桌宠显示新动作 | 30 秒 |

**总耗时**: 3-4 分钟/动作 (不含视频生成的 2-3 分钟)。

---

## Step 1: H3 双图模式生成绿幕视频

> **目的**: 拿到一段**首末帧严格一致**的 6.6s 动作视频 (循环前提)。

**输入**:
- `prompts/XX-name.md` (4 段段落格式,见 `prompts/00-format.md`)
- `art/octopus-frames/standard-char-1x1.png` (V2.1 标准图, 3/4 跪坐, 1920×1920, 绿幕)
- **首末帧用同一张图** (last_frame_image == first_frame)

**工具**:
- `~/.minimax/agents/mavis/skills/h3-dual-image-video-gen/scripts/run_h3_video.py` (H3 异步, 4-15s 任意, 支持 `last_frame_image`)
- `connector__matrix__gen_videos` (Hailuo-2.3 同步, 6s 默认, **无** `last_frame_image` — 复杂动作禁用)

**关键参数**:
```python
{
    "prompt": "...",
    "first_frame_image": "<V2.1 标准图 OSS URL>",
    "last_frame_image": "<同上, 必须同一张>",
    "duration": 6,           # 6s 默认 (H3 4-15s 任意)
    "aspect_ratio": "1:1",   # 768×768
}
```

**Hailuo-2.3 物理限制** ⚠️: 6s 视频 0s vs 5.5s 相似度 40-45% (道具不消失) — **绝对不能用于复杂动作 (戴帽/研究/找东西)**。H3 + `last_frame_image` 双图 96.58% 相似度, 唯一能用的方案。

**输出**:
- `docs/v2-XX-name/v2-XX-name-h3.mp4` (6.583s, 768×768, ~825KB)
- `task_id` (H3 异步, 7 天内有效)

---

## Step 2: ffmpeg 抽帧

> **目的**: 99 帧 PNG 序列 (15fps),作为 Step 3 输入。

**命令** (单行):
```bash
ffmpeg -y -i docs/v2-XX-name/v2-XX-name-h3.mp4 -vf fps=15 /tmp/h3-process/frames/frame_%03d.png
```

**为什么 15fps**:
- 桌宠 116×116 窗口, 帧率 > 12fps 已无视觉差异
- 15fps × 6.6s = 99 帧, 6.6s 循环节奏感好
- 太低 (< 10fps) 动画卡顿, 太高 (> 24fps) 体积涨 1.5x+ 视觉无收益

**输出**: `/tmp/h3-process/frames/frame_001.png` ~ `099.png` (99 张 768×768 RGB, ~5MB 总)

---

## Step 3: chroma key v3 + 抽帧 + resize

> **目的**: 99 帧 → 50 帧, 192×192 RGBA, 透明背景, 章鱼不透明。

**核心公式** (v3, 沉淀在 `scripts/extract-chromakey-apng.py`):
```python
def chromakey_v3(arr):
    r, g, b = arr[:,:,0], arr[:,:,1], arr[:,:,2]
    diff = g.astype(int) - np.maximum(r, b).astype(int)
    is_green = (g > 100) & (r < 150) & (b < 150) & (diff > 30)
    # 软边界: 0 (diff ≤ 10) → 1.0 (diff ≥ 30)
    greenness = np.clip((diff - 10) / 20.0, 0.0, 1.0)
    greenness = np.where(is_green, 1.0, greenness)
    return ((1.0 - greenness) * 255).astype(np.uint8)
```

**为什么 v3 不是 v1** ⚠️:
- **v1 软边界** `clip((diff) / 60 + 0.5, 0, 1)` 对 `diff = 0` (中性色, R≈G≈B) 给出 alpha=127.5
- 章鱼眼睛白色高光 (RGB(255,250,232) 等) 全是中性色, **v1 抠成半透明**
- 用户反馈 "眼睛变得有点透明了" — v1 bug
- **v3 改方向**: `clip((diff - 10) / 20, 0, 1)`, 中性色 alpha=255 完全不透明
- 验证: 章鱼眼黑 RGB(20,20,20), 眼反光 RGB(255,255,255), 皮肤高光 RGB(255,250,232) 都 alpha=255

**抽帧策略** (99 → 50):
- 桌宠 6.6s 循环太长 → 折半到 3.3s 太短
- **50 帧 × 132ms = 6.6s**, 等距抽帧保留节奏
- 公式: `indices = [int(i * 99 / 50) + 1 for i in range(50)]` (1-indexed file names)

**为什么 132ms (= 7.5fps) 而不是 66ms (15fps)**:
- 50 帧 132ms 跟 99 帧 66ms 视觉一样 (人都看不出 < 12fps 差异)
- 132ms × 50 = 2.3MB, 66ms × 99 = 4.85MB — 体积**砍半**
- 体感节奏更"卡通" (每帧停留感强), 适合 6.6s 故事链

---

## Step 4: APNG 输出

> **目的**: 50 帧 RGBA → 1 个 192×192 APNG, 桌宠 webview 直接 `<img src=...>` 渲染。

**关键参数** (PIL `save_all`):
```python
images[0].save(
    out_png, format="PNG", save_all=True, append_images=images[1:],
    duration=132,    # ms/帧
    loop=0,          # 0 = 无限循环
    disposal=0,      # 0 = 不合并相同帧 (避免 PIL 帧压缩 bug)
    optimize=True,
)
```

**为什么 APNG 不是 webm/GIF** ⚠️:
- **APNG**: 100% 可靠, PIL 内置, macOS WKWebView 原生支持, 真 alpha 透明
- **webm/VP9 alpha**: 编码端用 ffmpeg-full (keg-only, 见 `scripts/encode-webm-alpha.sh`), 体积比 APNG 小但工程复杂
- **webm/HEVC alpha**: Apple `VTCompressionSession` 架构限制, **永久不可行**
- **GIF**: 透明兼容差 (1-bit alpha), 桌宠边缘全丢

**disposal=0 为什么关键** ⚠️:
- disposal=1 (默认) 让 PIL 把每帧画到下一帧上 — 透明像素**会被合成覆盖**
- disposal=0 保持每帧独立 — 透明像素真透明
- 桌宠背景透出来全靠这个

**输出**:
- `01-detective-study-192.png` (50 帧, 192×192 RGBA, **2.3MB**, 6.6s 循环)

---

## Step 5: 替换 V1 桌宠 sprite + 验证

> **目的**: 让 webview 加载新 APNG, 截图验证动画循环 + 透明 + 角色不透明。

**5.1 复制**:
```bash
cp /tmp/01-detective-study-192.png app/public/assets/octopus/breath-idle.png
```

**5.2 重启 Tauri dev** ⚠️:
- Tauri webview **不自动 reload** `public/` 资源
- 必须 kill 章鱼进程, `cargo tauri dev` 自动重启后 webview 才会拉新文件

```bash
# 找章鱼进程
PIDS=$(pgrep -f "target/debug/octopus-pet")
kill $PIDS
# cargo tauri dev 应该自动重启; 没起就手动:
cd app && npm run tauri:dev
```

**5.3 验证** (3 件事):
1. **窗口存在**: `swift CGWindowListCopyWindowInfo` 找章鱼窗口 ID
2. **动画在循环**: `screencapture -l <win_id> -x` 截多帧, MD5 全部不同
3. **透明 + 章鱼不透明**: 截图目视, 或 PIL 验证 alpha 0 占比 > 50% + 中心 alpha=255

**5.4 截透明窗口** ⚠️:
- `screencapture -R x,y,w,h` **截不到**透明窗口 (穿透)
- 必须 `screencapture -l <window_id> -x` 截指定窗口
- 章鱼窗口 ID 用 swift 查 (osascript 报的 position 不是屏幕坐标)

**参考命令**:
```swift
// /tmp/winlist2.swift
import Cocoa
import CoreGraphics
guard let list = CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID) as? [[String: Any]] else { exit(1) }
for w in list {
    let owner = (w["kCGWindowOwnerName"] as Any?).flatMap { $0 as? String } ?? ""
    let winId = w["kCGWindowNumber"] as? Int ?? 0
    if owner.contains("octopus") {
        print("FOUND: id=\(winId)")
    }
}
```

```bash
swift /tmp/winlist2.swift
WIN_ID=<查到的 ID>
screencapture -l $WIN_ID -x /tmp/pet-test.png
```

---

## 已知限制 (V2.1 待修)

1. **H3 绿幕反射进眼镜片** ⚠️: 章鱼眼镜下半部出现绿色横带 (H3 模型把环境绿幕反射进了眼睛). 当前 v3 公式不处理 (反射 R≈0 G≈80 B≈0, G<100 不到抠像阈值).
   - **治本**: 改 prompt 加 "soft warm white environment lighting, no green tint reflection in eyes" 重跑
   - **治标**: chroma key v4 加 flood-fill from edges (只抠连通背景的绿)
   - 当前**接受** (01-detective-study 体现明显, 13/14 动作无此问题)
2. **长动作 (> 8s)**: 帧数变多, 体积涨, 可降 `--frame-count` 到 30
3. **V1 sprite 字段名 `breath-idle.png`**: V2 14 动作共用这一个文件, 切换动作需 cp 覆盖; 后续 V2 计划按 scene 字段切, 不再依赖单一 sprite

---

## 复用到 V2 14 动作

**1 动作 → 1 流程, 13 动作复用 13 次**:
```bash
# 1. H3 生成 (skill 自动化)
python3 ~/.minimax/agents/mavis/skills/h3-dual-image-video-gen/scripts/run_h3_video.py \
  --prompt "$(cat prompts/02-touch-fish.md)" \
  --first-frame art/octopus-frames/standard-char-1x1.png \
  --output docs/v2-02-touch-fish/v2-02-touch-fish-h3.mp4

# 2. 一键转 APNG
python3 scripts/extract-chromakey-apng.py \
  --input docs/v2-02-touch-fish/v2-02-touch-fish-h3.mp4 \
  --output /tmp/02-touch-fish-192.png

# 3. 验证 + 替换 (同 Step 5)
cp /tmp/02-touch-fish-192.png app/public/assets/octopus/breath-idle.png
# (重启 Tauri dev, 截图验证)
```

**总耗时**: 13 动作 × 4 分钟 = **~1 小时**全部落地。

---

## 验证记录

**2026-08-21 W1 D5, 01-detective-study** (首个完整跑通):
- H3 双图: 0s vs 5.5s 相似度 **96.58%** (vs Hailuo-2.3 40.45%) ✅
- APNG: 50 帧, 192×192 RGBA, 2.3MB, 6.6s 循环
- chroma key: v1 → v3 (修复眼睛高光半透明)
- 桌宠集成: V1 blink (20 帧) → V2 戴帽研究 (50 帧), 4 帧故事链 PASS
  - f2 戴帽举放大镜 → f4 帽子消失收尾 → f6 微笑 → f8 触手举起完成

**跟 V1 对比**:
- V1: 20 帧 APNG, 2s 静止 + 1.5s 眨, 只会眨眼睛
- V2 01: 50 帧 APNG, 6.6s 戴帽研究故事, 4 段动作

体积/帧数对比:
| 版本 | 帧数 | 体积 | 时长 | 内容 |
|------|------|------|------|------|
| V1 breath-idle | 20 | 793KB | 6.25s | 静止 + 眨 |
| V2 01 (v1 chroma) | 99 | 4.85MB | 6.6s | 戴帽研究 (失败, webview cache) |
| V2 01 (v3 chroma) | 50 | 2.3MB | 6.6s | 戴帽研究 (PASS, 桌宠) |

---

## 相关脚本 / 工具

- `scripts/extract-chromakey-apng.py` — 沉淀的抽帧 + chroma key + APNG 一键脚本
- `scripts/remove-hat-greenscreen.py` — V2.1 标准图清理帽子残留 (上游, 在 image_synthesize 之后)
- `~/.minimax/agents/mavis/skills/h3-dual-image-video-gen/scripts/run_h3_video.py` — H3 一键生成
- `~/.minimax/agents/mavis/skills/h3-dual-image-video-gen/scripts/verify_h3_video.py` — H3 首末帧验证
- `scripts/encode-webm-alpha.sh` — WebM/VP9 alpha 备用方案 (keg-only ffmpeg-full)
