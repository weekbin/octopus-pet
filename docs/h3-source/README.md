# H3 视频源 (2026-09-15 9:00 批)

> **状态**: 27 H3 视频 (raw mp4) + 18 合格 (passed symlink) + 9 不合格 (failed symlink)
> **用途**: 明天去绿幕处理 → APNG → 进 `app/public/assets/octopus/v2/`
> **生成时间**: 2026-09-15 23:38 - 2026-09-16 00:00
> **生成工具**: MiniMax-H3 + 双图模式 (first=last=standard-char-1x1.png)

## 目录结构

```
docs/h3-source-2026-09-15/
├── raw/        # 27 个原始 mp4 (H3 服务生成)
├── passed/     # 18 个 symlink → raw/ (首尾帧 ≥95%)
└── failed/     # 9 个 symlink → raw/ (首尾帧 <95%, 需重跑或弃用)
```

## 验证标准

首尾帧 (0s vs 5.5s) 像素差 ≤30 (RGB max channel) 算"相同", 比例 ≥95% 算合格。

## 合格 (passed/, 18 个)

| 场景 | 相似度 |
|---|---|
| 24-surprised | 100.00% |
| 29-shy | 100.00% |
| 30-wave | 100.00% |
| 32-laugh | 100.00% |
| 35-blink | 100.00% |
| 36-cheer | 100.00% |
| 17-celebrate | 99.99% |
| 19-thumbs-up | 99.62% |
| 16-deadline-sprint | 99.29% |
| 34-meditation | 99.07% |
| payday | 98.87% |
| 22-yay-friday | 98.76% |
| 31-apologize | 98.23% |
| 20-thinking | 97.22% |
| 23-dancing | 97.22% |
| 13-debug-snack | 96.80% |
| 18-monday-morning | 95.77% |
| 33-magic | 95.27% |

## 不合格 (failed/, 9 个, 留作重跑)

| 场景 | 相似度 | 根因 |
|---|---|---|
| touch-fish | 77.56% | 4 后向触手摸鱼动作复杂 |
| soul-leaving | 81.35% | 半透明鬼魂章鱼 + 边缘发光 |
| 14-coffee-stretch | 86.99% | 咖啡杯放下后触手偏移 |
| 27-cooking | 88.42% | 锅铲收回 + 热气残留 |
| 21-lunch-break | 91.59% | 便当盒+筷子+饭团多重道具 |
| 15-videocall | 93.47% | 耳机渐变消失后触手偏移 |
| lying-flat | 94.03% | 全身躺平→起来姿态差异 |
| 26-phone-call | 94.51% | 手机放下后头部微偏 |
| 25-yawning | 94.52% | 哈欠嘴型变化未完全恢复 |

## 9-10 老目录说明

V2 第一批场景 (5 个) 的源 mp4 在 `docs/h3-source-2026-09-10/` (2026-09-10 生成),
已 git rm (commit 922b642),本地 .gitignore 忽略. 这 5 个场景已经部署成 APNG 到
`app/public/assets/octopus/v2/` (breakdown / friday-5pm / pretend-busy / stay-late /
treat-milk-tea.png),V2 桌宠不依赖原 mp4. 老 mp4 留作未来重生成备档.

## 灾备说明 (重要)

2026-09-16 凌晨误用 `mavis-trash` 删了 r1-r6/verified/9-10 全部 mp4 目录
(sandbox 不让 AppleScript move 恢复). **27 个新场景 mp4 用 H3 task_id 7 天内有效
重新 query + download 恢复** (`/tmp/h3-recover.py`). 9-10 老 mp4 仍在 Trash
(sandbox 锁住, 不影响 V2 部署, 跳过).

**未来教训**: 不要用 `mavis-trash` 删非空多目录 (它 silent 失败 `mv` fallback 但
仍报 "moved to trash", 实际是 Finder Trash 软删, sandbox 阻 restore).

## 明天任务

1. `passed/*.mp4` 抽帧 → v10-final pipeline → APNG (192×192 RGBA)
2. APNG 输出到 `app/public/assets/octopus/v2/<scene>.png`
3. 更新 `scenes.json` (挑 6-10 个进 V3.0 默认, 100% 优先)
4. `bash scripts/build-scene-registry.sh` + `check-scenes-sync.sh`
5. 桌面实测 + release V3.0