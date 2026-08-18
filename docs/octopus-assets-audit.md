# 章鱼素材盘点 (V1)

> **W1 D1 实测结果** (generated 2026-08-18 by `scripts/audit-octopus-assets.sh`)
> **Source of truth**: `/Users/yangweibin/Works/octopus-worker-meme`
> **执行人**: Mavis (mavis)

## 关键发现 (跟 plan §1.9.1 假设的 3 个根因差异)

| 假设 (plan §1.9.1) | 实际 (verified) | 影响 |
|---------------------|---------------|------|
| **47 帧/场景** (f_0001.png ~ f_0047.png) | **141 帧/场景** (f_0001.png ~ f_0141.png) | spritesheet 宽度 = 141 × 192 = **27072 px**, 单循环时长 = 141 / 12fps = 11.75s. 动画时长 ~3× 计划值. 状态机 8s 轮转需要重新调 |
| **PNG 透明 (alpha)** | **PNG 不透明 (RGB 720×720, 背景是实色)** | "章鱼 .app 透明桌宠" 假设不能直接成立. Tauri `transparent: true` 窗口里章鱼会显示成实色矩形, 不会跟桌面融合. **V1 接受 RGB 渲染, V2 用 chroma key / 图像分割加 alpha** |
| **14 场景都有 frames-final/** | **5/14 top-level + 1/14 archive/frames-final + 5/14 archive/frames/frames-final + 4/14 archive only 59 partial** | spritesheet-builder.sh 实际能直接跑的是 5 个 (06, 08, 11, 12, 13). 其它 9 个需要先 re-extract (ffmpeg 抽 141 帧) 或 symlink |

## 14 场景详细盘点 (verified 2026-08-18)

| # | 场景目录 | OctopusScene | 视频 | GIF | frames 路径类型 | 帧数 | 透明度 | frames_path |
|---|---------|-------------|------|------|----------------|------|--------|-------------|
| 1 | `01-pretend-busy/` | `pretend-busy` | ✅ | ✅ | `STANDARD` | 141 | RGB | `01-pretend-busy/frames-final/` |
| 2 | `02-stay-late/` | `stay-late` | ✅ | ✅ | `STANDARD` | 141 | RGB | `02-stay-late/frames-final/` |
| 3 | `03-breakdown/` | `breakdown` | ✅ | ✅ | `STANDARD` | 141 | RGB | `03-breakdown/frames-final/` |
| 4 | `04-lying-flat/` | `lying-flat` | ✅ | ✅ | `STANDARD` | 141 | RGB | `04-lying-flat/frames-final/` |
| 5 | `05-multi-tasking/` | `multi-tasking` | ✅ | ✅ | `STANDARD` | 141 | RGB | `05-multi-tasking/frames-final/` |
| 6 | `06-payday/` | `payday` | ✅ | ✅ | `STANDARD` | 141 | RGB | `06-payday/frames-final/` |
| 7 | `07-salary-rejected/` | `salary-rejected` | ✅ | ✅ | `STANDARD` | 141 | RGB | `07-salary-rejected/frames-final/` |
| 8 | `08-treat-milk-tea/` | `treat-milk-tea` | ✅ | ✅ | `STANDARD` | 141 | RGB | `08-treat-milk-tea/frames-final/` |
| 9 | `09-friday-5pm/` | `friday-5pm` | ✅ | ✅ | `STANDARD` | 141 | RGB | `09-friday-5pm/frames-final/` |
| 10 | `10-toilet-slacking/` | `toilet-slacking` | ✅ | ✅ | `STANDARD` | 141 | RGB | `10-toilet-slacking/frames-final/` |
| 11 | `11-touch-fish/` | `touch-fish` | ✅ | ✅ | `STANDARD` | 141 | RGB | `11-touch-fish/frames-final/` |
| 12 | `12-waiting-m3pro/` | `waiting-m3pro` | ✅ | ✅ | `STANDARD` | 141 | RGB | `12-waiting-m3pro/frames-final/` |
| 13 | `13-soul-leaving/` | `soul-leaving` | ✅ | ✅ | `STANDARD` | 141 | RGB | `13-soul-leaving/frames-final/` |
| 14 | `14-multitask/` | `multitask` | ✅ | ✅ | `STANDARD` | 141 | RGB | `14-multitask/frames-final/` |

## V1 落地策略 (per user "持续完成" 指令)

**3 个根因差异, 各自处理**:

1. **141 帧 (不是 47)**: 接受现实, spritesheet 宽度 = 27072 px, 单循环 ~12s (12fps). 状态机 8s 轮转改成 ~12s 轮转 (或 6s 半循环轮转). 帧率从 12fps 调到 8fps (141/8 = 17.6s 单循环). **等用户拍板**.

2. **RGB 无 alpha (V1 限制)**: V1 接受 RGB 渲染. Tauri 窗口 transparent + 背景色固定, 章鱼显示成 RGB 矩形. **V2 用图像分割 / chroma key 加 alpha**. 已知限制写到 README + AGENTS.md.

3. **9/14 场景缺标准路径 PNG 帧**:
   - 4 个 (01/02/03/04): ffmpeg 从 `video.mp4` 抽 141 帧 → 写到 `<scene>/frames-final/f_0001.png ~ f_0141.png`
   - 6 个 (05/06/07/09/10/14): symlink archive 路径 → `<scene>/frames-final/ (06 已 symlink)`
   - 跑完这两步后, 14/14 场景都有标准路径的 frames-final/ + 141 帧

## 汇总 (本盘点)

- 总帧数 (有 frames 的场景): 1974
- RGBA (透明): 0
- RGB (不透明): 14
- 0 frames: 0
- frames 在 STANDARD (top-level): 14 / 14
- frames 在 ARCHIVE-STANDARD: 0 / 14
- frames 在 ARCHIVE-DEEP: 0 / 14
- frames 在 ARCHIVE-SHALLOW-59: 0 / 14
- frames 缺失: 0 / 14

> 重新跑本盘点: `scripts/audit-octopus-assets.sh --write-doc docs/octopus-assets-audit.md`
