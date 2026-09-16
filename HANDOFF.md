# Handoff: octopus-pet V3.0 H3 视频资产管线 (2026-09-16)

> **状态 (2026-09-16 18:25)**: H3 视频生成 ✅ | 首尾帧验证 ✅ | mp4 归档 ✅ | v10-final 重生成 18 APNG ✅ (BiRefNet+CorridorKey 治本白方块) | flicker post-fix **v9 v2 four-pass** ✅ (Pass 2 silhouette 内 transparent fill 治 PIL APNG encoder cascading bug — `frames[i]=frames[i-1].copy()` 在 disposal=2 下被错编码成 raw transparent; 改为保留 raw 背景 + 仅 fill silhouette; Pass 4 改为前一帧 RGB 治 v8 跨帧 median 姿势鬼影; 26 场景全套 777390 flicker + 379592 silhouette + 163021 sub-silhouette + 698274 majority-voting 像素修复) | scenes.json 8→26 ✅ | check-scenes-sync + lint + test ✅ | **tauri.linux.conf.json CWD 假设纠正** ✅ (d4ddcd2 当时假设 NUC CWD=src-tauri/, 实测 CWD=项目根, 跟 macOS conf 同步为 `bash scripts/run-vite.sh`) | **release-plugin.sh V3.0 linux bin 116MB 产出 + MCP initialize/tools_list 冒烟 OK** ✅ | **GitHub Release v3.0 published** ✅ (`octopus-pet.linux.bin` 走 release asset, V3.0+ binary 不入 git, 因 116MB > GitHub 100MB 单文件 commit 限制; `bin/octopus-pet` wrapper 自动从 release URL 下载兜底; 历史 commit 中 binary 用 `git filter-repo --invert-paths` 删除并 force-push 成功).
> **追加 (2026-09-16 18:55)**: **方案 G 实证失败已回滚** — 用户反馈 17/22/23/32 抠图有"残影感", 决定走方案 G (`ffmpeg -vf 'tmix=frames=3:weights=1 1 1'`). 执行完整 (✅ 备份 27 mp4 + ✅ 抽帧验证 tmix MAD 降 17-30% + ✅ mp4 + raw + APNG 重生成). 但 v10-final 抽帧发现: **32-laugh 41 raw 帧 α=0 (BLANK) + 17-celebrate 22 + 22-yay-friday 8 + 23-dancing 1** (tmix 在大笑高潮帧叠加成"无脸透明" → CorridorKey 返回 α=0). 即便 Pass 2 silhouette fill 救回 32-laugh f025-f045 部分像素 (5681-6348 opaque, **vs v9 v2 的 13356-13876**), 视觉上 f030/f042 身体渲染深红/泪印 (aRGB=(127,6,6,α=1) 几乎全透 + 半边粉). **立即回滚**: 4 APNG (sha256 100% 匹配 v9 v2) + 4 mp4 (sha256 100% 匹配 backup) 全部恢复 v9 v2 状态. git status clean.
> **追加 (2026-09-16 19:13)**: **方案 G1 像素统计 OK, 视觉复查同样有拖影 + 绿幕残留, 已撤回** — 用户接续 G1 选项. `ffmpeg -vf "tmix=frames=2:weights=1 1"` (仅帧 i+i-1 平均). 像素统计 G1 vs v9 v2 看似 OK (32-laugh very_dark -12.9% 改善). **用户在打包前全 99 帧 contact sheet 视觉复查发现 G1 仍有拖影 + 绿幕残留** — dark green spike artifacts 在大笑爆发/彩带挥舞段周围 (32-laugh f15-f54, 17-celebrate f38-f43, 22-yay-friday f37-f38, 23-dancing f57-f59). **关键发现**: v9 v2 baseline 全 99 帧对比同样有这些 artifacts — 这是 V3.0 既有 baseline 问题, 不是 G1 引入回归. G1 在某些帧让 artifacts 更明显 (因 tmix cross-frame 污染扩散). **撤销 V3.0.1 release**: 4 APNG + 4 mp4 sha256 100% 恢复 v9 v2 baseline + `gh release delete v3.0.1 --cleanup-tag` (V3.0 恢复 Latest). 当前 26 场景全部 v9 v2 = V3.0 baseline. 详 CHANGELOG [Unreleased] "方案 G/G1 实证均失败" + AGENTS.md 状态行 G1 段.
> **作者**: Mavis (weekbin user, 2026-09-15 23:38 - 2026-09-16 00:03)
> **接手人**: 当前接手 Mavis (2026-09-16 12:13 → 15:00 切换模型方案)
> **优先级**: P0 — V3.0 release 阻塞项

> **重要事实**: mp4 不入 repo (`.gitignore` 第 19-22 行), 跨开发机靠 rsync 同步. 18 合格 mp4 走 `scripts/extract-v10-final.py` (BiRefNet 1024 fp16 + CorridorKey GreenFormer 2048 tiled fp16 linear alpha + straight FG + v10.3 strict gate + forehead ROI 缝补) → 替换 v4 fallback 物理治本的白方块. v52 依赖已从 git 历史 `922b642~1` 恢复.

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
| 归档 (合格 mp4) | ✅ | `docs/h3-source-2026-09-15/passed/` (18 symlink) + `failed/` (9 symlink) |
| 验证报告 | ✅ | `docs/h3-source/README.md` (目录说明 + 灾备教训 + verify 表) |
| **抽帧 (192×192 PNG)** | ✅ | `ffmpeg` 抽 99 帧 × 66ms 18 个 mp4 |
| **去绿幕 + 抠图 (APNG)** | ✅ | `scripts/extract-v4-chromakey-cpu-fallback.py` (v10-final 因依赖 v52 已删不可用, v4 兜底 0.01% 绿残留). 18 APNG 已交付 v2/ |
| **scenes.json 更新** | ❌ | **P0** — 8 → 14+ 场景 |
| **build-scene-registry.sh** | ❌ | P0 |
| **check-scenes-sync.sh + lint + test** | ❌ | P0 |
| **release-plugin.sh 跑 V3.0** | ❌ | P0 |

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

## 5. Next Steps (接手人任务清单, 立即开始)

### 5.1 P0-1 — 9 不合格视频决策 (可推迟到 V3.0 release 后)

**选项 A**: 全部重跑 (用更简化的 prompt — 单道具 / 不透明 / 简单动作)
**选项 B**: 选其中 5 个最有价值的重跑 (touch-fish / soul-leaving / lying-flat / 27-cooking / 21-lunch-break)
**选项 C**: 跳过 9 个, 只用 18 个合格

**建议**: 选项 B (可推迟到 V3.0 release 后, 18 合格已足够 V3.0 默认场景扩到 14+)。

### 5.2 P0-2 — 18 个合格 mp4 → APNG (抽帧 + 去绿幕) — **✅ 完成 2026-09-16 18:30 (v10-final 重生成 + v5 two-pass post-fix)**

**v4 fallback 物理上限被用户戳穿** (2026-09-16 14:54 "眼睛这里有很明显的像正方形的白色区域"): v4 chroma key 把皮肤误判为绿 → alpha=0 → post-fix 用肤色 inpaint ≠ 黑色眼白 → 仍有白方块残留. 颜色阈值路线极限 ~95%, 剩余 5% 必须换 unmixing 模型.

**v10-final 重生成 (2026-09-16 15:00 启动, 18:30 完成)**:
1. 从 git 历史 `922b642~1` 恢复 `scripts/extract-v52-apng.py` (v10-final 依赖)
2. `scripts/extract-v10-final.py` 加 `H3_VIDEOS_V3` 字典 (18 新场景 mp4) + CLI 模式 `python3 scripts/extract-v10-final.py scene1 scene2 ...`
3. BiRefNet 1024 fp16 alpha hint → CorridorKey GreenFormer 2048 tiled fp16 linear alpha + straight FG → v10.3 strict gate → forehead_white_mask H3 源 ROI 缝补 → borrow+recolor+inpaint 道具治本 → ROI demote 放大镜/桌子
4. **全部 18 场景完成** (commit `194f5c9`), 验证零白方块 (f50 contact sheet)

**v3 5-frame window flicker post-fix 部署后用户第二轮反馈**: "还是有问题, 有几帧章鱼变成空白的只有轮廓了".
- 排查: v3 修 1-frame 像素级抖动 OK, 但 5 场景有 44 帧 (raw alpha_mean<30) 是整章鱼 silhouette 完全透明, 像素级检测抓不到.
- **v5 two-pass 修复** (commit `b182fe6`):
  - **Pass 1** — per-pixel temporal fill, ±7 窗口, 333849 flicker 像素修复
  - **Pass 2** — bad-frame template replace, alpha_mean<30 异常帧用 ±15 范围最近模板帧 (alpha_mean>80) silhouette RGB+alpha 替换, 42 frames 修完
- **v6 three-pass 二次优化** (commit `0cb566b`):
  - **v5 后用户反馈 17/32 还有闪烁**, 排查: 32-laugh f42 raw=37.5 半透明章鱼 (Pass 2 v5 阈值<30 没命中) + 32-laugh f44-f48 大笑爆发帧 silhouette 内部某些像素位置 consistently low alpha (v10-final 位置性 uncertain, Pass 1 ±7 max 抓不到)
  - **Pass 2 阈值放宽**: alpha_mean<30 → <60 (多修 32-laugh f42, f43, 命中 42→44)
  - **Pass 2 sil_mask 阈值放宽**: alpha<100 → <200 (覆盖整个 silhouette, 否则 Pass 3 median 修剩余像素造成 32-laugh f42 半脸)
  - **Pass 3 NEW**: sub-silhouette temporal median filter, ±5 帧 alpha 中位数≥200 → fill, 跳过 Pass 2 命中帧, 71133 pixels 修复
- **5 场景 bad-frames 100% 清零 + sub-silhouette 大幅改善**: 17-celebrate 17 → 0 / 22-yay-friday 5 → 0 / 23-dancing 2 → 0 / 32-laugh 17 → 0 / 36-cheer 3 → 0
- **抽帧视觉验证**: 17-celebrate 全帧章鱼完整 + 姿势自然 + 彩带保留; 32-laugh 17 frames bad-frames 100% 修复, 仅 f42 单帧半脸 (Pass 2 模板来自 f28 笑姿势 vs f42 爆发姿势 mismatch — 动态播放 66ms 一帧感觉"卡 1 帧", 比完全空白好)
- **v7 four-pass 治本残留闪烁 + 半脸** (commit 待 push, 2026-09-16 18:50):
  - **v6 部署后用户反馈"17/32 还是有闪烁, 没处理好"**, 排查两个根因:
    1. v10-final 在某些稳定身体像素 consistently 给低 alpha (不是 flicker 是模型 uncertain, Pass 3 ±5 median 抓不到 median<200), 5 场景残留 ~38000-44000 per-scene "stable body 但 alpha<200" 像素
    2. Pass 2 sil_mask=(template_a>200)&(curr_a<200) 让 Pass 1 已经修过的边缘像素 (curr_a=255) 不在 mask 内 → silhouette 边缘 alpha 不对称 → 半脸 (32-laugh f030 验证: 左笑姿势 + 右大笑姿势)
  - **v7 关键变更**:
    - **Pass 2 阈值改硬指标 alpha<100 像素数 > 28000**: v6 alpha_mean<60 被 Pass 1 修边抬升后逃过 (32-laugh f042 raw=8.7 经 Pass 1 后 mean=41.3). 硬指标是"完全空白帧"的可靠信号.
    - **Pass 2 直接模板替换整个 silhouette** (full_sil = template_a>200, RGB + alpha 同步覆盖): 治本半脸. 32-laugh f030/f042/f044 大笑姿势一致, 无左右撕裂.
    - **Pass 4 NEW — global per-pixel majority voting**: 跨 99 帧计算每像素 alpha>=200 帧数 ≥ 70% → stable_mask (5 场景 stable body 11000-13000 像素). fill stable_mask 内 alpha<200 + RGB sum>300 像素到 alpha=255. RGB sum>300 守卫避免 fill 腐蚀黑色背景. 70% 阈值平衡: 60% fill 姿势切换帧 (嘴张开/合拢时嘴内/嘴外切换), 80% 覆盖不足. 5 场景共 13749 majority-voting 像素修复; 26 场景全套 85723.
- **v7 抽帧视觉验证通过** (17-celebrate f0/f14/f28/f42/f68/f84 / 32-laugh f0/f30/f42/f44 / 22-yay-friday f68 / 23-dancing f60 / 36-cheer f68): 章鱼完整粉色 + 姿势自然 + 道具保留 + **无半脸** + **无 flicker**. stable_mask & alpha<200 像素 = 0 跨所有抽帧 — Pass 4 完全 fill 残留 body 透明像素.
- **v8 three-pass 治本 32-laugh 19 transparent 帧撕裂** (commit `2a20c33`, 2026-09-16 19:30):
  - **v7 部署后用户第二轮反馈 "32-laugh 19 个 transparent 帧仍有撕裂 (挖洞/半脸)"**, 根因: Pass 2 模板帧 silhouette ≠ 当前帧 silhouette (大笑爆发帧姿势 mismatch) — 治标不治本.
  - **v8 关键变更**:
    - **Pass 2 模板替换取消**: 跨帧 median RGB 在 stable_mask (70%+ visible) 内对头部/触手等稳定 body 区域无撕裂 (RGB median 稳定), 对嘴/眼姿势变化区域有混合 (轻微姿势模糊但章鱼"在").
    - **Pass 3 不再跳过 Pass 2 命中帧**: Pass 2 取消, 跳过逻辑无意义.
    - **Pass 4 取消 rgb_sum>300 守卫**: transparent 帧 (RGB sum<300 被腐蚀) 无法 fill. v8 不管 RGB sum 直接 fill stable_mask 内 alpha<200 像素 alpha=255 + RGB = 跨 99 帧 median RGB.
  - **v8 抽帧验证** (3 关键场景): 章鱼完整粉色 + 姿势自然 + 道具保留 + **无挖洞/无半脸/无撕裂**. 姿势变化区域 (嘴/眼) 轻微混合但比 v7 撕裂好.
- **v8 部署后用户第三次反馈 "v8 比 v7 还差, 重新来"** (2026-09-16 19:30): 跨帧 median RGB fill stable_mask 在姿势剧烈变化帧 (32-laugh 大笑爆发 / 17-celebrate 举手欢呼) 上把"眯眼/睁眼"RGB 混合成"鬼影"折中态 (眯眼 → 半闭), 用户判断"姿势模糊比撕裂更糟".
- **v9 v1 整帧替换前一帧 RGBA (commit 待 push)**: Pass 2 改 `frames[i] = frames[i-1].copy()` (cascading 整帧替换); Pass 4 fill 改用前一帧 (i-1) RGB 而非跨帧 median. 抽帧 in-memory 完美 (saved f012=17558 opaque) — 但实际 saved file 视觉错误 (PIL APNG encoder cascading bug).
- **v9 v2 治本 PIL APNG encoder cascading bug (commit 待 push, 2026-09-16 20:00)**:
  - **v9 v1 抽帧验证诡异发现**: in-memory frames[12] (Pass 2 整帧替换后) opaque=17558, 但 PIL saved file seek(12) opaque=538 + saved file 报 "APNG contains frame sequence errors" + n_frames 99→88-90. 排查根因: PIL APNG encoder 在 disposal=2 模式下处理 `frames[i] == frames[i-1]` (cascading) 时, 把后续帧错编码为 raw transparent frame (PNG fcTL 序列错位 + 帧数据覆盖 raw transparent 帧).
  - **v9 v2 修复**: 取消整帧 cascading 替换 (`frames[i] = frames[i-1].copy()` 触发 encoder cascading 错编码), 改为 **silhouette 内 transparent 像素 fill**:
    - silhouette mask = ±5 帧 alpha median >= 200 (跟 Pass 3 同算法)
    - 当前 transparent (alpha<100) + silhouette 内 → fill alpha=255 + RGB = prev_frame (i-1) RGB
    - 保留 raw transparent 背景 (alpha=0)
  - **v9 v2 关键洞察**: encoder 看到帧 pixel 跟 raw transparent 不同 (有 silhouette 内 fill), 不触发 cascading 优化 → saved file n_frames=99 + 视觉正确. ffmpeg 渲染 saved f011 opaque=17529 + RGB=(215,86,77) 粉色 ✓. fill RGB 用前一帧 = 同 cycle 相邻帧 (时间连续 + 姿势清晰), 无撕裂无鬼影.
  - **v9 v2 实跑全套 26 场景**: total pass1=777390 flicker + pass2=379592 silhouette + pass3=163021 sub-silhouette + pass4=698274 majority-voting 像素修复. 5 场景触发 Pass 2: 17-celebrate 82849 / 22-yay-friday 59758 / 23-dancing 21572 / 32-laugh 178515 / 36-cheer 36898. 其他 21 场景 pass2=0.
  - **v9 v2 抽帧验证全套 26 场景**: 全部 n_frames=99 + bad-frames=0 + min% 范围 30.6%-36.5% (无 transparent 塌陷帧). 5 关键场景抽帧 (17-celebrate f16-f21 / 22-yay-friday 5 帧 / 32-laugh f42-f48 / 36-cheer 5 帧 / 23-dancing 5 帧) opaque 全部 13000-17000 + RGB 全部粉色 (R>210, G<100, B<100). **章鱼完整粉色 + 姿势自然过渡 + 道具保留 + 无挖洞/无撕裂/无鬼影**. Pass 2 命中帧姿势"暂停" 6×66ms=396ms (cascading fill = 前一完整帧姿势重复), 用户接受 trade-off (比 v7 撕裂/v8 鬼影好).
  - **执行位置**: `scripts/extract-v10-final-postfix-flicker.py` (~210 行), Pass 1 + Pass 2 (silhouette fill) + Pass 3 + Pass 4 (prev RGB fill). 任何走 v10-final 输出的 APNG 上桌前必跑一次 (idempotent).

**v4 fallback + 4 层 post-fix 留作 CPU-only fallback** (无 GPU 时的最终保底). 已 commit `4d02292` 4d02292 (v4 inpaint 32736 像素). 任何走 v4 fallback 输出的 APNG 上桌前必跑 `scripts/extract-v4-postfix-eyes.py` (4 层条件).

```bash
# CWD = 项目根 (scripts/run-vite.sh wrapper 已兼容 Tauri 2 三套 CWD 假设)

# 1. 抽帧 (192×192 PNG, 100 帧 @ ~16fps)
mkdir -p app/public/assets/octopus/v2-tmp
for mp4 in docs/h3-source-2026-09-15/passed/*.mp4; do
  name=$(basename "$mp4" .mp4)
  # resolved symlink 拿真实路径
  real_mp4=$(readlink -f "$mp4")
  ffmpeg -y -i "$real_mp4" -vf "scale=192:192,fps=15" \
    "app/public/assets/octopus/v2-tmp/${name}_%03d.png"
done

# 2. 用 v10-final pipeline 跑 APNG (输入源 mp4)
for mp4 in docs/h3-source-2026-09-15/passed/*.mp4; do
  real_mp4=$(readlink -f "$mp4")
  name=$(basename "$mp4" .mp4)
  python3 scripts/extract-v10-final.py \
    --input "$real_mp4" \
    --output "app/public/assets/octopus/v2/${name}.png"
done
```

**预期时间**: 18 个场景 × 30s/场景 = ~10 分钟

### 5.3 P0-3 — scenes.json 更新

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

### 5.4 P0-4 — 自动生成 + 验证

```bash
# CWD = 项目根

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

### 5.5 P0-5 — V3.0 Release

```bash
# CWD = 项目根

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

### 5.7 P0-7 — 方案 H1 治拖影实证成功, V3.0.1 重新准备中 (2026-09-16 19:56 当前任务)

V3.0 release 后用户反馈 17/22/23/32 抠图"残影感". 已执行方案 G (frames=3) + 方案 G1 (frames=2) 均**实证失败**: tmix 在大笑高潮帧把"眯/睁/举"叠成"无脸透明" → CorridorKey α=0 → 即便 Pass 2 fill 救回, RGB 用前一帧 (同段大笑, 边缘被绿幕反射污染) → 视觉深红/泪印. 用户在 V3.0.1 打包前视觉确认"拖影比较严重, 还出现了绿幕没处理干净", 已**撤销 V3.0.1 release** (`gh release delete v3.0.1 --cleanup-tag`). V3.0 恢复 Latest.

✅ **方案 H1 实证成功 (2026-09-16 19:56)** — 用户接续方向 H1 → H2 → H4 (由简到难), H3 重生成不考虑. 加 v10-final Stage 3.5 `post_faint_decoration_cleanup_h1(alpha_lo=5, alpha_hi=100)`:
  - **策略**: alpha 5-100 partial alpha 像素 (装饰拖影) 且 RGB 非体色粉 → α=0
  - **4 场景 partial alpha 5-100 像素减少 90-95%**: 32-laugh 163175→16403, 17-celebrate 105096→7855, 22-yay-friday 134669→13739, 23-dancing 111734→6049
  - **opaque 像素 0 变化** (体色保护)
  - **全 99 帧 contact sheet 视觉复查**: 32-laugh f15-f54 上方 dark spike artifacts 几乎完全消失, 17/22/23 装饰保留

**下一版 release 步骤** (用户硬约束: 不要急着打包):
1. ✅ 4 场景 APNG 在 `app/public/assets/octopus/v2/` (v9 v5 = H1)
2. ✅ 4 场景 mp4 保持原版 (`docs/h3-source-2026-09-15/raw/`, sha256 100% 匹配 backup)
3. ✅ v10-final.py 加 Stage 3.5 函数 + CLI 路径同步
4. ⏸️ **暂停 release**: 用户没明确说可以发布, 等用户验收 H1 视觉后再决定
5. 备选: 跑 release-plugin.sh 出新 linux bin + gh release upload (用户说 OK 才做)

**下一版续战方向** (若 H1 视觉不够):
- **H2** (Pass 5 silhouette 外 8px 边缘硬清) — ~1 小时
- **H4** (tauri UI 层 transparency + 阴影模糊) — ~30 分钟代码改动
- **H3** ❌ 不考虑 (用户排除)

**强约束 (用户原话 2026-09-16 19:23 + 19:48)**: "不要急着打包, 你现在做的效果里, 拖影比较严重, 还出现了绿幕没处理干净的情况. 切忌, 在没处理好 apng 的效果之前不要忙着打包". 接手人务必先**全 99 帧 contact sheet 视觉复查**再 release, 不要只看像素统计.

### 5.8 P0-8 — 方案 H2 治 alpha 100-200 装饰色残影成功, V3.0.1 仍在准备中 (2026-09-16 当前任务)

✅ **方案 H2 实证成功 (2026-09-16 20:30)** — 用户在 H1 视觉复查后反馈"还有点闪烁 + 部分身体帧帧消失". 逐帧诊断根因:
- H1 治了 alpha 5-100 partial alpha 装饰拖影 (90-95%)
- 但残留 alpha 100-200 装饰色像素 (彩带/音符/酒杯 partial alpha 边缘) 16k-26k 像素/99帧/场景
- 这些残留装饰**紧贴身体**, silhouette mask 无法区分装饰 vs body AA
- 用户视觉 = "alpha 100-200 装饰残影帧间闪烁 + 装饰部分遮挡身体的视觉缺漏"

✅ **H2 算法** (extract-v10-final-postfix-flicker.py Pass 5):
- 跨 99 帧 alpha>=100 帧数比例 = "稳定度"
- 阈值 0.7: body 主体稳定度 >=0.7 → 保留 (跨帧稳定)
- 装饰像素稳定度 <0.7 + alpha 100-200 + 非体色粉 → α=0 (跨帧位置变化)
- 4 类分离验证 (99 帧累加):
  - A body_stable_opaque 1.1-1.3M → 100% 保留
  - B body_aa_edge (不稳定+体色粉) 100k-171k → 100% 保留
  - C decoration_core (当前 opaque+非体色) 478k-535k → 100% 保留 (彩带/音符/酒杯主体不透明)
  - D decoration_partial (alpha 100-200+非体色+不稳定) 16k-26k → 100% 清 (1.0-1.4%)

✅ **H2 跑 4 场景**: postfix-flicker.py 17-celebrate / 22-yay-friday / 23-dancing / 32-laugh:
- pass5=18847/19357/26298/16717 decoration residues (与离线模拟完全一致)
- 0 误伤 body opaque, 0 误伤 body AA, 0 误伤装饰核心
- APNG n_frames=99 + size=192x192 全场景

✅ **全 99 帧 contact sheet 视觉复查**: 17/22/23 装饰核心保留 (彩带/音符/酒杯) + alpha 100-200 装饰色残影显著减少, 32-laugh f15-f54 几乎干净

**当前状态**: 4 场景 v9 v5 = H2 + 22 场景 v9 v2 = **26 场景 V3.0.1 baseline 待发布**

**下一版 release 步骤** (用户硬约束: 不要急着打包):
1. ✅ 4 场景 APNG 在 `app/public/assets/octopus/v2/` (v9 v5 = H2)
2. ✅ 4 场景 mp4 保持原版 (`docs/h3-source-2026-09-15/raw/`, sha256 100% 匹配 backup)
3. ✅ postfix-flicker.py 加 Pass 5 + main + 计数同步
4. ⏸️ **暂停 release**: 等用户验收 H2 视觉后再决定. 跑 release-plugin.sh 出新 linux bin + gh release upload v3.0.1 (用户说 OK 才做)

**下一版续战方向** (若 H2 视觉仍不够):
- **H4** (tauri UI 层 transparency + 阴影模糊) — ~30 分钟代码改动
- **H3** ❌ 不考虑 (用户排除)

---

## 6. 关键路径速查

| 用途 | 路径 |
|---|---|
| 合格 mp4 源 | `docs/h3-source-2026-09-15/passed/*.mp4` (symlink → raw/) |
| 不合格 mp4 | `docs/h3-source-2026-09-15/failed/*.mp4` (symlink → raw/) |
| 原始 mp4 (源) | `docs/h3-source-2026-09-15/raw/<scene_id>.mp4` (H3 服务下载) |
| 目录说明 + verify 表 | `docs/h3-source/README.md` |
| 标准图 (first+last frame) | `art/octopus-frames/standard-char-1x1.png` (gitignore, V2.1 idle 起点) |
| v10-final pipeline | `scripts/extract-v10-final.py` |
| scenes.json 源 | 项目根 `scenes.json` |
| APNG 输出 | `app/public/assets/octopus/v2/<scene_id>.png` |

## 7. 备忘

- **AGENTS.md** 是 source-of-truth 之一 (跟 CHANGELOG.md / scenes.json 一起), V3.0 commit 同步更新状态行 (2026-09-16 已合并 skill 模板 + 去噪)
- **CHANGELOG.md** 在 V3.0 commit 里加 Unreleased 段
- **`.gitignore`** 已经 ignore `docs/h3-source-*/` (mp4 不入 git) — 注意 APNG 输出到 `app/public/assets/octopus/v2/` 是 tracked
- **art/standard-char-1x1.png** 在 .gitignore — 跑 v10-final pipeline 时从 git checkout 不行,本地 artifact 路径
- **wrapper script** (`bin/octopus-pet`) 优先级: target/debug > target/release > .${KERNEL}.bin, 默认走 macos.bin
- **H3 task_id** 7 天内可以 query 已成功的 task_id (但 download URL 7 天有效)
- **28-proud** 那个失败 task 在 H3 服务里仍然 succeeded, 可以单独 query task_id `442097300001074` 拿 URL (如果需要补)

---

**接手人**: 直接看 §5 Next Steps 即可开始. 18 个合格已足够 V3.0 (8 V2 + 10 H3 = 18 场景).

> **去绿幕** (P0 核心): 18 合格 mp4 → 走 `scripts/extract-v10-final.py` (BiRefNet 1024 + CorridorKey 2048 + 6 阶段 fixup) → 出 192×192 RGBA APNG → 放 `app/public/assets/octopus/v2/<id>.png`.
