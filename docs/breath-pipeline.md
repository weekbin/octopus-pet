# breath-idle 动画素材制作流程

> **用途**：把"角色立绘"加工成"桌宠 idle 呼吸/眨眼循环 APNG"的全流程。
> **适用场景**：换角色素材 / 调整眨眼节奏 / 重新生成 6.25s 循环。
> **首次完成时间**：2026-08-18 (W1 D3)。

## 适用场景

未来要换桌宠角色 / 调整眨眼 / 改循环节奏时，**完整复制这个流程**：
- 出图工具不一定每次都用 `image_synthesize` + `gen_videos`，但**抽帧 + flood-fill 抠图 + 拼接循环**的思路通用
- APNG 输出格式是首选（真 alpha 透明，跨 webview 兼容性最好）

---

## 完整流程

### Step 1: 生成"全睁立绘"基准

> **目的**：得到一张 1920×1920 纯黑底、角色居中、表情灿烂的"产品立绘"。

```bash
# image_synthesize: 珊瑚粉章鱼 + 纯黑背景 + 1920×1920
# (V2 版本, 角色细节好: 眼睛+星形高光+灿烂笑)
# 产物: art/octopus-frames/char-A-black.png
```

Prompt 关键要素：
- `3D rendered coral-pink octopus character on pure black background`
- `cute, smiling, big eyes with star highlight`
- `soft 3D vinyl material, no other objects, isolated character`

> **根因**: 纯黑底是抠图前提 (flood-fill 区分"从角落连通的纯黑 = 背景"和"被粉包围的黑瞳孔 = 角色")。

---

### Step 2: 生成"慢眨眼"视频

> **目的**: 用图生视频工具让角色做 1 次慢眨眼，得到 6.5s 完整睁→闭→开过程。

```bash
# gen_videos: char-A-black.png 作 first_frame, duration=10s (强制 2-3 周期)
# (gen_videos 限制: 768P+10s 或 1080P+6s, subject mode 6s only)
# 产物: art/breath-video/breath-v3-blink.mp4
```

Prompt 关键要素：
- `rhythmic eye blinking, 1 complete blink cycle in 6.5s`
- `stays in calm idle pose with happy smile, only eyelids blink`
- `no camera motion, no body movement, pure black void background`

> **根因**: 视频模型很难精确控制"微小变化" (2% 浮动)，直接 prompt"1 次完整慢眨眼"最稳。
> **取舍**: v3 视频 0~6.5s 是 1 次慢眨眼，**后半段是废的** (用户验证后确认)。

---

### Step 3: 抽帧 + flood-fill 抠图

> **目的**: 把视频转成透明 PNG 序列，去除黑底但保留眼睛瞳孔等角色内黑。

```python
# scripts/breath-pipeline.py (单文件流程)
# 1) ffmpeg 抽 24fps 全部帧
import subprocess
subprocess.run([
    "ffmpeg", "-y", "-i", "breath-v3-blink.mp4",
    "-vsync", "vfr", "-q:v", "2",
    "frames-v3/f-%03d.png"
])

# 2) flood-fill 抠图 (HSV 阈值, 区分背景黑和角色内黑)
def smart_transparent_v2(img, sat_thresh=5, val_thresh=15, edge_thresh=50):
    arr = np.array(img.convert("RGB")).astype(np.uint8)
    bg = flood_fill_hsv_bg_mask(arr, sat_thresh, val_thresh)  # 4 角 flood fill
    alpha = np.where(~bg, 255, 0).astype(np.uint8)
    # 只清理极深黑 (RGB sum < 50), 保留嘴内部深红 (sum > 80)
    is_pure_black = (arr.sum(axis=2) < 50) & (~bg)
    alpha[is_pure_black] = 0
    return Image.fromarray(np.dstack([arr, alpha]))

# 3) 居中裁剪到 192×192
def crop_center_192(img_rgba, target=192, fill=0.94):
    # pad=20, 短边 scale=0.94
    ...

# 4) 跑 156 帧 (0~6.5s @ 24fps)
```

> **关键阈值**:
> - `sat_thresh=5, val_thresh=15`: 背景 (S=0, V<15%) 与角色 (S>5% 或 V>15%) 分离
> - `edge_thresh=50`: 角色内 RGB sum<50 算 "近黑"，不要用 80 (会把嘴内部深红当成黑抠掉)
> - `crop fill=0.94`: 角色占 94% 192×192 (留 6% 边距)

---

### Step 4: 拼接循环 (持续睁眼 + 加速眨眼)

> **目的**: 拼出"3s 持续睁眼 + 1.67s 加速 4x 眨眼"的 3.67s 循环。

```python
# 加载 156 抠图帧
all_imgs = [Image.open(f"loop-rgba-v6/lp-{i:03d}.png").convert("RGBA") for i in range(1, 157)]

# 持续睁眼 2s = 24 帧 @ 12fps = f-001 复制 24 遍
open_frame = all_imgs[0]
stable_12 = [open_frame] * 24

# 加速 4x 慢眨眼: 156 帧 / 8 = 19 帧 @ 12fps = 1.67s
blink_accel = all_imgs[::8]  # 每 8 帧抽 1 = 156/8 ≈ 19 帧

# 拼: 持续睁眼 + 加速眨眼 = 3.67s 循环, 首尾都是睁眼 (完美闭环)
seq = stable_12 + blink_accel
```

> **设计取舍**:
> - 持续睁眼 3s + 加速 4x 慢眨眼 1.67s = 3.67s 循环 (1 次眨眼/3.67s)
> - 加速用 `all_imgs[::8]` 而不是 setpts, 简单可逆
> - 首尾都是睁眼, 循环无跳变

---

### Step 5: APNG 输出 (主用) + 部署

```python
# APNG (真透明 alpha, 跨 webview 兼容)
apng_path = "breath-loop.apng"
seq[0].save(apng_path, format="PNG", save_all=True, append_images=seq[1:],
    duration=int(1000/12), loop=0, disposal=0)  # disposal=0 不合并相同帧

# 部署到项目
import shutil
shutil.copy(apng_path, "app/public/assets/octopus/breath-idle.png")
# 浏览器识别 APNG: 用 .png 扩展名即可
```

> **APNG 关键参数**:
> - `disposal=0` (none): 每帧独立，**不要**用 disposal=2 (会合并相同帧导致时间错位)
> - `loop=0`: 无限循环
> - `duration=1000/12`: 12fps 播放 (3.67s 循环)
> - **不用 GIF**: GIF 透明索引兼容性差，mavis / QuickLook 显示成粉色背景
> - V2 长动作 (>50 帧) 可用 WebM VP9 alpha 替代, 体积小 14-28x (见 Step 5b)

### Step 5b: WebM VP9 alpha 输出 (V2 长动作备用)

> **目的**: 帧数 >50 的长动作, 用 WebM VP9 alpha 替代 APNG, 体积小 14-28x.
> V1 idle 循环 (75 帧 / 1.4MB) 主用 APNG; V2 复杂动作 (>50 帧) 走这条.

**前置 (one-time)**:
```bash
brew install ffmpeg-full   # keg-only, 47 deps, 9.0.1
# 不要 export PATH (脚本自动 locate Cellar 路径)
```

**调用**:
```bash
# 输入是 Step 3 抠图后裁剪到 192×192 的 RGBA PNG 序列
# 假设: loop-rgba-v6/ 目录里 lp-001.png ... lp-156.png
bash scripts/encode-webm-alpha.sh \
  --input loop-rgba-v6/ \
  --output app/public/assets/octopus/breath-idle.webm \
  --framerate 12 \
  --bitrate 300k \
  --pattern "lp-%03d.png"
```

**输出**:
- `<file>.webm` (VP9 in WebM, yuva420p, 50-100KB for 75 帧)
- 脚本自动验证 `TAG:alpha_mode=1` 存在, 失败 exit 3
- 提示下一步 React 端用 `<video>` 标签

**React 端使用**:
```tsx
<video
  src="/assets/octopus/breath-idle.webm"
  autoPlay
  loop
  muted
  playsInline
  style={{
    position: "absolute",
    width: 192,
    height: 192,
    pointerEvents: "none",
  }}
/>
```

> **VP9 alpha 兼容性**: macOS WKWebView ✅, Windows WebView2 (Chromium >96) ✅,
> Linux WebKitGTK 4.1+ ⚠️ (取决于 codec 编译选项). V2 跨平台落地时再验证.
>
> **重要陷阱**:
> - Homebrew standard ffmpeg (`brew install ffmpeg`) 输出的 VP9 webm **不**带 alpha —
>   必须用 ffmpeg-full
> - `ffmpeg -codecs | grep vp9` 不显示 `vp9_alpha` 标志是误导性的, 真实能力看
>   `ffmpeg -h encoder=libvpx-vp9 | grep yuva` (7 种 alpha 像素格式)
> - `ffprobe` 默认不展示 `TAG:alpha_mode=1`, 验证 alpha 必须
>   `ffprobe -show_streams <file>.webm | grep alpha_mode`

---

## React 端使用

```tsx
// OctopusPet.tsx 临时改用 <img> 替代 spritesheet
<img
  src="/assets/octopus/breath-idle.png"
  alt="breath-idle"
  style={{
    position: "absolute",
    width: 192,  // 或临时改 116 (60% 大小)
    height: 192,
    pointerEvents: "none",
  }}
/>
```

```tsx
// Bubble.tsx 调整: 紧凑 padding, top=0 (在窗口内)
<div style={{
  position: "absolute",
  top: 0,  // 不要 -8 (会溢出 Tauri 192×192 窗口)
  padding: "3px 10px",
  fontSize: 12,  // 60% 缩到 8px
  ...
}} />
```

---

## Tauri 配置 (透明背景)

```json
// tauri.conf.json
{
  "app": {
    "macOSPrivateApi": true,  // 必需, 否则 macOS 透明失效, 窗口白底
    "windows": [{
      "label": "main",
      "width": 192,   // 或 116 (60%)
      "height": 192,
      "transparent": true,
      "alwaysOnTop": true,
      "decorations": false,
      "skipTaskbar": true,
      "resizable": false
    }]
  }
}
```

> **根因**: 不加 `macOSPrivateApi: true`，日志会报 *"The window is set to be transparent but the macos-private-api is not enabled"*，章鱼看着是"白底卡片"。

---

## 调参 Checklist

| 参数 | 默认 | 调整场景 |
|---|---|---|
| `Tauri 窗口 width/height` | 192 | 想要更小 = 116 (60%) / 想要更大 = 256 |
| `crop_center_192 fill` | 0.94 | 想要章鱼更大 = 0.97 (留 3% 边距) |
| `持续睁眼帧数` | 24 (2s) | 想要更长间隔 = 36 (3s) / 更短 = 12 (1s) |
| `加速倍数` | 8x (::8) | 想要更慢眨眼 = 4x (::4) / 更快 = 12x (::12) |
| `BUBBLE fontSize` | 12 | 窗口 116 = 8 / 窗口 256 = 16 |
| `BUBBLE_BY_SCENE` | 14 scene × 5 文案 | 加 sardonic 通用文案 (见 `app/src/state/types.ts`) |

---

## 坑点记录

1. **flood-fill 抠图**: RGB 距离会把角色瞳孔 (黑) 当背景透明化。**用 HSV** (S=0 才算背景) + flood-fill 4 角 BFS 区分"从角落连通的纯黑"和"被粉包围的黑"
2. **GIF 透明兼容差**: mavis / QuickLook / 部分 webview 把 GIF 透明 key 颜色 (粉/绿) 当背景显示。**用 APNG** 不用 GIF
3. **VP9 / HEVC with alpha**: ffmpeg 输出 `yuv420p` 不带 alpha，alpha 信息丢失。**用 APNG** 唯一靠谱
4. **PIL APNG disposal=2**: 会合并相同帧，disposal=0 才独立。validate 时 `n_frames` 不准是 PIL 内部合并导致，实际播放正确
5. **Tauri macOSPrivateApi**: 必需开，否则透明失效
6. **tauri-plugin-single-instance**: dev 模式 cargo run 重启不生效 (会开多个窗口)，生产 build 正常

---

## 端到端命令 (一次性重跑)

```bash
# 1) 生成 1920×1920 全睁立绘
# (image_synthesize, 产物: art/octopus-frames/char-A-black.png)

# 2) 生成 10s 慢眨眼视频
# (gen_videos, duration=10, 768P, 产物: art/breath-video/breath-v3-blink.mp4)

# 3) 抽帧
ffmpeg -y -i art/breath-video/breath-v3-blink.mp4 -vsync vfr -q:v 2 art/breath-video/frames-v3/f-%03d.png

# 4) 抠图 (Python 脚本, 156 帧 @ 2s/帧)
python3 -c "$(cat <<'EOF'
# 见 Step 3 代码
EOF
)"

# 5) 拼循环 + 输出 APNG
python3 -c "$(cat <<'EOF'
# 见 Step 4 + Step 5 代码
EOF
)"

# 6) 部署
cp art/breath-video/breath-loop.apng app/public/assets/octopus/breath-idle.png

# 7) 启动 Tauri 看效果
(cd src-tauri && cargo tauri dev)
```
