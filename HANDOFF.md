# Handoff: octopus-pet V3.0 H3 视频资产管线 (2026-09-16)

> **状态**: H3 视频生成 ✅ | 验证+归档 ✅ | **明天** 接手人任务: 去绿幕 → APNG → scenes.json
> **作者**: Mavis (weekbin user, 2026-09-15 23:38 - 2026-09-16 00:03)
> **接手人**: 明天回来的 Mavis / 周三 9-16 早上
> **优先级**: P0 — V3.0 release 阻塞项

---

## 1. Goal

把 27 个 H3 视频 (V2 桌宠场景候选池) 转成 V2 桌宠可部署的 APNG 格式, 加进 `scenes.json`, 让桌宠从 8 V2 场景扩到 14+ 场景, 跟 `release-plugin.sh` 走 V3.0 release。

**最终交付**:
- 18+ APNG (192×192, RGBA) 放 `app/public/assets/octopus/v2/`
- `scenes.json` 加 entry (挑最优 4-6 个进 V3.0 默认)
- `app/src/state/scene-registry.generated.ts` + `src-tauri/src/scene_registry_generated.rs` 自动生成
- 桌宠 `--gui` 跑通, 18+ 场景轮转正常

---

## 2. Current Progress (2026-09-16 00:03)

| 阶段 | 状态 | 备注 |
|---|---|---|
| H3 视频生成 | ✅ | 28 提交 / 27 成功 / 1 timeout |
| 首尾帧验证 (≥95%) | ✅ | 18/27 合格 |
| 归档 (合格 mp4) | ✅ | `docs/h3-source-2026-09-15-verified/` (18 个 symlink) |
| 验证报告 | ✅ | `docs/h3-source-2026-09-15-verified/verify-report.md` |
| **抽帧 (192×192 PNG)** | ❌ | 明天 |
| **去绿幕 + 抠图 (APNG)** | ❌ | 明天 — `scripts/extract-v10-final.py` |
| **scenes.json 更新** | ❌ | 明天 |
| **build-scene-registry.sh** | ❌ | 明天 |
| **check-scenes-sync.sh + lint + test** | ❌ | 明天 |
| **release-plugin.sh 跑 V3.0** | ❌ | 明天 |

---

## 3. What Worked (留作参考)

### 3.1 H3 批量生成管线 (mcode-tools)

**工具链**: `mcode-tools upload-temp-url` + `mcode-tools connector call connector__matrix__submit_video_generation` + `connector__matrix__query_video_generation` (异步 polling)

**关键参数**:
```json
{
  "model": "MiniMax-H3",
  "input_image": {"url": "<standard.png OSS URL>", "mime_type": "image/png"},
  "last_frame_image": {"url": "<same URL>", "mime_type": "image/png"},  // 同 first, 循环锚点
  "reference_type": "first_frame",
  "duration": 6,
  "resolution": "768P",
  "ratio": "1:1"
}
```

**首尾帧约束模板** (4 段格式, 第 1 段必须含):
```
所有视频必须以参考图 (V2.1 standard-char-1x1.png) 的标准 3/4 跪坐姿态为第一起始帧,
并在视频最后一秒 (第 6 秒结束时) 彻底恢复到与第一帧完全一致的标准 3/4 跪坐姿态。
首尾帧必须视觉上完全一致 (无道具残留, 触手前向触地, 圆耳可见, 表情温和)。
```

**并发策略**: `ThreadPoolExecutor(max_workers=N)` 并行 submit, 然后并行 poll。H3 6s 视频生成 ~100-200s, M1 Pro 实测。8 并发成功 96% (27/28)。

**坑点**:
- `python | tail -120` pipe 缓冲 — 必须 `python -u` (unbuffered) + 重定向到文件
- `&` background + `sleep + tail` 实时监控,但 wall clock 跟 system clock 有差异

### 3.2 项目结构清理 (今日前置)

5 commits 推完 (15fba6c / 0ee7bb0 / 922b642 / 2660692 / 9b1ddd6 / 53d4d22):
- 删 1GB venv / 死脚本 / 死 prompts (4 _archive/) / handoff (6 _archive/)
- `.gitignore` 加 `docs/h3-source-*/` + `docs/*.mp4` + `.venv*/` + `models/`
- 5 source-of-truth 同步 (.gitignore / AGENTS.md / README.md / CHANGELOG.md / wrapper)
- 删 13MB 老 `bin/octopus-pet.bin` (debug, fallback 4 删)
- 删 `models/` + 15 个本地 `.DS_Store` 清扫

---

## 4. What Didn't Work (避坑)

### 4.1 H3 视频首尾帧不合格 (9/27)

**根因分析**:
| 场景 | 相似度 | 失败原因 |
|---|---|---|
| touch-fish | 77.56% | 4 后向触手摸鱼动作复杂, H3 难回归 |
| soul-leaving | 81.35% | 透明鬼魂章鱼 + 边缘发光, H3 渲半透明失败 |
| 14-coffee-stretch | 86.99% | 咖啡杯放下后触手位置偏移 |
| 27-cooking | 88.42% | 锅铲收回 + 热气残留 |
| 21-lunch-break | 91.59% | 便当盒+筷子+饭团多重道具残留 |
| 15-videocall | 93.47% | 耳机渐变消失后触手位置偏移 |
| lying-flat | 94.03% | 全身躺平 → 起来姿态差异大 (H3 难精确复原) |
| 26-phone-call | 94.51% | 手机放下后头部微偏 |
| 25-yawning | 94.52% | 哈欠嘴型变化未完全恢复 |

**教训**:
- 复杂动作 (多触手+多道具) → H3 回归困难, 拆成简单动作
- 半透明 / 发光效果 → H3 渲不出, 改用不透明设计
- 道具消失不彻底 → 加 "渐变淡出 1s 内 100% → 0%" 多次提示
- 大姿态变化 (躺平) → 接受首末帧差异 (94%), 不强求 95%

### 4.2 r4-28-proud timeout (1/28)

**根因**: H3 服务偶发长尾 (3-5 分钟才出结果), `poll(max_wait_s=180)` 超时。任务实际还在跑, 但脚本退出后 task 仍 succeeded。

**教训**:
- `max_wait_s=180` 应该 ≥ 240 (4 分钟)
- 或者改成"先 poll 180s, 没 succeed 就单独再 poll"分阶段

### 4.3 Bash `cd` 不持久

每次 `bash` 调用是 fresh shell, `cd` 不持久。`cd X && cmd` 必须合并到一条。

---

## 5. Next Steps (接手人明天任务清单)

### 5.1 P0 — 9 个不合格视频决策 (明天 9:30 前)

**选项 A**: 全部重跑 (用更简化的 prompt — 单道具 / 不透明 / 简单动作)
**选项 B**: 选其中 5 个最有价值的重跑 (touch-fish / soul-leaving / lying-flat / 27-cooking / 21-lunch-break)
**选项 C**: 跳过 9 个, 只用 18 个合格

**建议**: 选项 B, 因为 18 个合格已足够 V3.0 默认场景扩到 18+。

### 5.2 P0 — 18 个合格 mp4 → APNG

```bash
# 1. 抽帧 (192×192 PNG, 100 帧 @ ~16fps)
cd /Users/yangweibin/Documents/cute
mkdir -p app/public/assets/octopus/v2-tmp
for mp4 in docs/h3-source-2026-09-15-verified/*.mp4; do
  name=$(basename "$mp4" .mp4)
  ffmpeg -y -i "$mp4" -vf "scale=192:192,fps=15" \
    "app/public/assets/octopus/v2-tmp/${name}_%03d.png"
done

# 2. 用 v10-final pipeline 跑 APNG
for scene in app/public/assets/octopus/v2-tmp/*; do
  scene_name=$(basename "$scene" | sed 's/_[0-9]*\.png//' | head -1)
  # 注: v10-final.py 是视频→APNG, 需要看是否支持单帧 PNG 序列
  # 如果不支持, 用 PIL 合成 APNG:
  python3 -c "
from PIL import Image
import os
import glob

frames = sorted(glob.glob('${scene}_*.png'))
imgs = [Image.open(f).convert('RGBA') for f in frames]
imgs[0].save('app/public/assets/octopus/v2/${scene_name}.png',
             save_all=True, append_images=imgs[1:],
             duration=66, loop=0, format='PNG')
"
done

# 或更直接: 跑 extract-v10-final.py 但传 mp4 而非视频
python3 scripts/extract-v10-final.py \
  --input docs/h3-source-2026-09-15-verified/24-surprised.mp4 \
  --output app/public/assets/octopus/v2/24-surprised.png
```

**预期时间**: 18 个场景 × 30s/场景 = ~10 分钟

### 5.3 P0 — scenes.json 更新

挑最优 6-10 个进 V3.0 默认场景 (按 100% 优先):
```json
{
  "scenes": [
    {"id": "24-surprised", "source": "H3 惊讶 (h3-dual-image-video-gen skill)", "bubbleLines": ["..."]},
    {"id": "29-shy", "source": "H3 害羞", "bubbleLines": ["..."]},
    ... (8 个 100% 优先)
  ]
}
```

**挑场景原则**:
1. **100% 6 个** (24-surprised / 29-shy / 30-wave / 32-laugh / 35-blink / 36-cheer) — 必进
2. **99%+ 4 个** (17-celebrate / 19-thumbs-up / 16-deadline-sprint / 34-meditation) — 必进
3. **98%+ 2 个** (payday / 22-yay-friday) — 推荐进
4. **97%+ 2 个** (20-thinking / 23-dancing) — 推荐进
5. **95%+ 4 个** (18-monday-morning / 33-magic / 31-apologize / 13-debug-snack) — 视空间定

**预期 V3.0 默认场景数**: 14 个 (现有 8 V2 + 新增 6)

### 5.4 P0 — 自动生成 + 验证

```bash
cd /Users/yangweibin/Documents/cute

# 1. 自动生成 TS + Rust 端
bash scripts/build-scene-registry.sh

# 2. CI 三件套验证
bash scripts/check-scenes-sync.sh       # scenes.json ↔ generated
bash scripts/lint-octopus-plugin.sh     # spec 16/16
cd app && npm test                       # vitest FSM
cd ../src-tauri && cargo test            # cargo 8 roundtrip

# 3. 桌宠实测
cd ../src-tauri && export PATH=$HOME/.cargo/bin:$PATH
cargo build && cargo run -- --gui
# 验证 14+ 场景轮转 + 单击弹气泡 + 拖动换位置
```

### 5.5 P0 — V3.0 Release

```bash
cd /Users/yangweibin/Documents/cute

# 1. 跑 release-plugin.sh 生成平台 binary
bash scripts/release-plugin.sh

# 2. git add 平台 binary + 提交
git add bin/octopus-pet.${KERNEL}.bin \
        app/public/assets/octopus/v2/*.png \
        scenes.json app/src/state/scene-registry.generated.ts \
        src-tauri/src/scene_registry_generated.rs HANDOFF.md
git commit -m "feat(v3.0): 14 场景 — 8 V2 + 6 H3 (24-surprised/29-shy/30-wave/32-laugh/35-blink/36-cheer)"
git push origin main

# 3. (可选) 更新 CHANGELOG.md Unreleased 段 + AGENTS.md 状态行
```

### 5.6 P2 (可选) — 不合格 9 个重跑

如果时间允许, 用更简单 prompt 重跑 5 个最有价值的 (touch-fish / soul-leaving / lying-flat / 27-cooking / 21-lunch-break)。每个 ~3 分钟。

---

## 6. 关键路径速查

| 用途 | 路径 |
|---|---|
| 合格 mp4 源 | `docs/h3-source-2026-09-15-verified/*.mp4` (symlink) |
| 原始 mp4 | `docs/h3-source-2026-09-15*/<scene_id>.mp4` |
| 验证报告 | `docs/h3-source-2026-09-15-verified/verify-report.md` |
| 标准图 (first+last frame) | `art/octopus-frames/standard-char-1x1.png` (gitignore, V2.1 idle 起点) |
| v10-final pipeline | `scripts/extract-v10-final.py` |
| scenes.json 源 | 项目根 `scenes.json` |
| APNG 输出 | `app/public/assets/octopus/v2/<scene_id>.png` |

## 7. 备忘

- **AGENTS.md** 不要改 (项目协调文件, 不是 handoff 位置)
- **CHANGELOG.md** 在 V3.0 commit 里加 Unreleased 段
- **`.gitignore`** 已经 ignore `docs/h3-source-*/` (mp4 不入 git) — 注意 APNG 输出到 `app/public/assets/octopus/v2/` 是 tracked
- **art/standard-char-1x1.png** 在 .gitignore — 跑 v10-final pipeline 时从 git checkout 不行,本地 artifact 路径
- **wrapper script** (`bin/octopus-pet`) 优先级: target/debug > target/release > .${KERNEL}.bin, 默认走 macos.bin
- **H3 task_id** 7 天内可以 query 已成功的 task_id (但 download URL 7 天有效)
- **28-proud** 那个失败 task 在 H3 服务里仍然 succeeded, 可以单独 query task_id `442097300001074` 拿 URL (如果需要补)

---

**接手人**: 直接看 §5 Next Steps 即可开始。每日上限 5h (H3 service rate limit), 18 个合格已足够 V3.0。