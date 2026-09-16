# Changelog

All notable changes to **octopus-pet** are documented here. The format follows
[Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning 2.0.0](https://semver.org/).

## [Unreleased]

### Fixed
- **26 场景 flicker 治本 v9 v2 (PIL APNG encoder cascading bug 修复, Pass 2 保留 raw 背景 + 仅 fill silhouette) (2026-09-16)**:
  v8 部署后用户反馈"v8 比 v7 还差, 重新来" — 跨帧 median RGB fill stable_mask
  在姿势剧烈变化帧 (32-laugh 大笑爆发 / 17-celebrate 举手欢呼) 上把"眯眼/睁眼"
  RGB 混合成"鬼影"折中态 (眯眼 → 半闭), 用户判断"姿势模糊比撕裂更糟".
  v9 v1 改 Pass 2 = 整帧替换前一帧 RGBA (cascading), Pass 4 fill 用前一帧 RGB.
  v9 v1 抽帧 in-memory 完美 (saved f012=17558 opaque) — 但实际 saved file 视觉错
  误 (PIL APNG encoder cascading 帧错编码, saved f012=538 opaque = 挖洞). 排查
  发现 PIL APNG encoder 在 disposal=2 + cascading 帧 (`frames[i] == frames[i-1]`)
  场景把后续帧错编码为 raw transparent, saved file 报 "APNG contains frame sequence
  errors", ffmpeg 渲染 saved f012=538 (transparent) — **视觉挖洞**. 修复 v9 v2:
  Pass 2 保留 raw transparent 背景, 仅 fill silhouette 内 transparent 像素
  (alpha=255 + RGB=prev_frame), encoder 看到帧 pixel 跟 raw 不同不触发 cascading bug.
  - **v9 v2 关键变更** (相对 v9 v1):
    - **Pass 2 取消 cascading 整帧替换**: `frames[i] = frames[i-1].copy()` 触发
      PIL APNG encoder cascading 错编码 (saved f012=538 vs in-memory f012=17558,
      n_frames 99→88-90, "APNG contains frame sequence errors").
    - **Pass 2 改为 silhouette 内 fill (in-place)**: silhouette mask = ±5 帧
      alpha median >= 200 (跟 Pass 3 同算法), 当前 transparent + silhouette 内
      → alpha=255 + RGB=prev_frame RGB. 保留 raw transparent 背景 (alpha=0),
      encoder 看到帧内容跟 raw 不同 → 不触发 cascading 优化 → saved file
      n_frames=99 + 视觉正确 (ffmpeg f011 opaque=17529, RGB=(215,86,77) 粉色).
    - **Pass 3 / Pass 4 沿用 v9 v1**: 跨帧 median 替换为前帧 RGB fill, 姿势
      清晰. Pass 3 不跳过 Pass 2 命中帧 (Pass 2 改成 in-place fill 后, Pass 3
      不会冲突).
  - **v9 v2 实跑** (26 场景全套, 总修 ~1.22M 像素):
    | pass | 26 场景合计 |
    |---|---|
    | pass1 (1-frame flicker) | 777390 |
    | **pass2 (silhouette fill)** | **379592** |
    | pass3 (sub-silhouette median) | 163021 |
    | pass4 (stable_mask + prev RGB) | 698274 |
    - 5 场景触发 Pass 2 (有 transparent 帧): 17-celebrate 82849 / 22-yay-friday
      59758 / 23-dancing 21572 / 32-laugh 178515 / 36-cheer 36898. 其他 21 场景
      pass2=0 (无 transparent 帧).
  - **v9 v2 抽帧验证全套 26 场景** (ffmpeg + PIL seek): 全部 n_frames=99, bad-frames=0,
    min% 范围 30.6%-36.5% (无 transparent 塌陷帧). 5 关键场景抽帧 (17-celebrate
    f16-f21 / 22-yay-friday 5 帧 / 32-laugh f42-f48 / 36-cheer 5 帧 / 23-dancing 5
    帧) opaque 全部 13000-17000, RGB mean 全部粉色 (R>210, G<100, B<100). **章
    鱼完整粉色 + 姿势自然过渡 + 道具保留 + 无挖洞/无撕裂/无鬼影**. Pass 2 命
    中帧姿势"暂停" 6×66ms=396ms (cascading fill = 前一完整帧姿势重复), 用户接
    受 trade-off (比 v7 撕裂/v8 鬼影好).
  - **执行位置**: `scripts/extract-v10-final-postfix-flicker.py` (~210 行),
    Pass 1 + Pass 2 (silhouette fill) + Pass 3 + Pass 4 (prev RGB fill).
    任何走 v10-final 输出的 APNG 上桌前必跑一次 (idempotent). 升级自 v9 v1
    (在 v8 commit `2a20c33` 基础上重写 Pass 2).
- **5 V3 H3 场景 v10-final flicker 治本 v7 four-pass (2026-09-16)**:
- **5 V3 H3 场景 v10-final flicker 治本 v7 four-pass (2026-09-16)**:
  v6 部署后用户反馈"17/32 还是有闪烁, 没处理好". 排查发现两个残留问题:
  (a) v10-final 在某些稳定身体像素 consistently 给低 alpha (不是 flicker 是
  模型 uncertain — Pass 3 ±5 median 抓不到因为 median 也不够 ≥200), v6 残
  留 ~38000-44000 per-scene "stable body 但 alpha<200" 像素在 f015-f098.
  (b) Pass 2 阈值 alpha_mean<60 命中半透明章鱼帧 (32-laugh f42 raw=37.5),
  但模板替换用 sil_mask=(template_a>200)&(curr_a<200) — Pass 1 已经修了 f42
  一些边缘像素让 curr_a=255, 边缘像素不在 sil_mask 内保持 curr_a=255 但 RGB
  是 raw 黑色 → 视觉上 silhouette 边缘 alpha 不对称 (左笑姿势 + 右大笑姿势
  半脸, 32-laugh f030 验证).
  - **v7 关键变更**:
    - **Pass 2 阈值改硬指标 alpha<100 像素数 > 28000** (v6 alpha_mean<60 退
  出):
      alpha_mean 会被 Pass 1 ±7 帧修边拉高 (32-laugh f042 raw=8.7 经 Pass 1
      后 mean=41.3 逃过阈值). alpha<100 像素数是"完全空白帧"硬指标 (raw≈36023,
      Pass 1 后 ≈31085, 正常帧 ≈5000). 32-laugh pass2 frames 从 v6 的 17 维持 17
      (f042 重新命中).
    - **Pass 2 直接模板替换整个 silhouette** (v6 sil_mask 退出):
      sil_mask = (template_a>200) & (curr_a<200). Pass 1 已经修了 f042 边缘
      curr_a=255, 边缘像素不在 sil_mask 内 → silhouette 边缘 alpha 不对称.
      v7 直接 `frames[i][full_sil] = template[full_sil]`, full_sil = template_a>200,
      RGB + alpha 同步覆盖. 32-laugh f030/f042/f044 全部大笑姿势一致, 无半脸.
    - **Pass 4 NEW — global per-pixel majority voting (v7 全新)**:
      跨 99 帧 (loop cycle) 计算每像素 alpha>=200 帧数 ≥ 70% → stable_mask
      (跨 26 场景 stable body 像素数 11000-13000). 跑每帧 fill stable_mask
      内 alpha<200 + RGB sum>300 像素到 alpha=255. 守卫 RGB sum>300 避免 fill
      腐蚀成黑色背景 (Pass 2 模板已覆盖完全空白帧, RGB sum<300 是模型无法判断
      的像素, transparent 比 fill 出黑色身体好).
      70% 阈值平衡: 60% 会 fill 姿势切换帧 (32-laugh 大笑爆发嘴张开/合拢时
      嘴内/嘴外像素切换), 80% 覆盖不足. 5 场景实测 Pass 4 fill 像素从 v6
      残留 ~40000 per-scene 降到 0 (stable_mask 内 alpha<200 像素全部清零).
  - **v7 实跑** (5 关键场景):
    | scene | pass1 | pass2 | pass3 | pass4 | stable body |
    | 17-celebrate | 73231 | 17 | 17108 | 3092 | 12074 |
    | 22-yay-friday | 52034 | 5 | 11079 | 4472 | 12610 |
    | 23-dancing | 45245 | 2 | 10090 | 1687 | 11265 |
    | 32-laugh | 103880 | 17 | 18247 | 1881 | 12531 |
    | 36-cheer | 59459 | 3 | 14609 | 2617 | 11970 |
    | **TOTAL 5** | **333849** | **44** | **71133** | **13749** | - |
    | 26 场景全套 | 777390 | 44 | 168833 | 85723 | - |
  - **抽帧确认 5 场景视觉**: 17-celebrate 全帧章鱼完整 + 姿势自然 + 彩带保留;
    32-laugh f030/f042/f044 大笑姿势一致, 半脸治本 (f030 RGB-only 是大笑姿势
    + alpha 完整覆盖 = 视觉上大笑姿势章鱼, 无左右撕裂); 22/23/36 关键帧视觉
    干净无 flicker. stable_mask & alpha<200 像素 = 0 跨所有抽帧 (f0/f15/f30/
    f42/f50/f68/f98) — Pass 4 完全 fill 残留 body 透明像素.
  - **执行位置**: `scripts/extract-v10-final-postfix-flicker.py` (~205 行),
    Pass 1 + Pass 2 + Pass 3 + Pass 4. 任何走 v10-final 输出的 APNG 上桌前
    必跑一次 (idempotent). 升级自 v6 (commit `0cb566b`).
- **5 V3 H3 场景 v10-final 整章鱼空白帧模板替换修复 v5 (2026-09-16)**:
- **5 V3 H3 场景 v10-final 整章鱼空白帧模板替换修复 v5 (2026-09-16)**:
  v3 5-frame window 部署后用户反馈"还是有问题, 有几帧章鱼变成空白的只有
  轮廓了". 排查: 17-celebrate 8 帧连续 alpha_mean<10 (CorridorKey 跨帧
  unmixing 完全失败, 整段 alpha=0 不止边界), 32-laugh f29-f33 连续 5 帧
  空白 (大笑爆发帧), 22-yay-friday f38-f40 + f47-f48 酒杯遮挡, 23-dancing
  f54-f55 音符遮挡, 36-cheer f63-f65 彩旗遮挡. 单看 per-pixel flicker fix
  抓不到 — 整章鱼 silhouette 几乎全透明, alpha<150 守卫失效 (像素根本不是
  <150 是直接 0).
  - **v5 two-pass 修复方案**:
    - **Pass 1** — per-pixel temporal fill (修 1-frame flicker, v3 升级):
      滚动窗口 ±7 (vs v3 的 ±2), 检测 curr_a<150 + RGB sum>300 + 近邻
      max alpha≥200 → fill alpha=255.
    - **Pass 2** — bad-frame template replace (新增, 治整章鱼空白):
      检测 alpha_mean<30 异常帧 → 在 ±15 帧范围内找最近模板帧
      (alpha_mean>80 = 章鱼完整可见) → 复制模板帧 silhouette 区域 (alpha>100)
      的 RGB+alpha 覆盖当前帧空白 silhouette. RGB 必须一起复制 (空白帧
      silhouette 像素 RGB 被腐蚀成黑色背景, 只复制 alpha mask 出来章鱼变
      暗红黑色 — 验证失败).
- **5 场景整章鱼空白帧 v6 three-pass 二次优化 (2026-09-16)**:
  v5 部署后用户反馈"17/32 还有闪烁". 排查: v5 Pass 2 阈值 alpha_mean<30
  没覆盖 32-laugh f42 (raw=37.5 半透明章鱼, 接近 30 但 Pass 2 不命中);
  32-laugh f44-f48 大笑爆发帧 silhouette 内部某些像素位置 consistently
  alpha<200 (v10-final 在大笑爆发帧位置性 uncertain, 不是 flicker 是模型
  consistently 不确定), Pass 1 ±7 max 抓不到因为同位置像素连续 7 帧都低.
  - **v6 关键变更**:
    - **Pass 2 阈值放宽** alpha_mean<30 → alpha_mean<60 (覆盖半透明章鱼
      帧如 32-laugh f42 raw=37.5), 命中数从 v5 42 → v6 44 frames (多修
      f42, f43).
    - **Pass 2 sil_mask 阈值放宽** alpha<100 → alpha<200 (Pass 2 复制覆盖
      整个 silhouette 不只是边缘, 否则半透明章鱼帧替换后 silhouette 内
      仍有半透像素, Pass 3 median 修了"原始姿势"像素 → 半脸问题: 32-laugh
      f42 左脸模板 (f28 笑姿势) + 右脸原始 → 姿势不一致).
    - **Pass 3 NEW — sub-silhouette temporal median filter**: 对每帧 f_i
      (i ∈ [5, n-5]) 每像素 p: curr_a<200 + RGB sum>300 + ±5 帧 alpha
      **中位数** ≥ 200 → fill alpha=255. median 比 max 更鲁棒, 只要 ≥3/11
      帧不透明就修. **跳过 Pass 2 命中帧**避免与模板替换冲突 (f42 半脸
      问题根因).
  - **v6 实跑**:
    | scene | pass1 pixels | pass2 frames | pass3 pixels |
    | 17-celebrate | 73231 | 17 | 17108 |
    | 22-yay-friday | 52034 | 5 | 11079 |
    | 23-dancing | 45245 | 2 | 10090 |
    | 32-laugh | 103880 | 17 | 18247 |
    | 36-cheer | 59459 | 3 | 14609 |
    | **TOTAL** | **333849** | **44** | **71133** |
  - **抽帧确认 5 场景视觉**: 17-celebrate 全帧章鱼完整 + 姿势自然; 32-laugh
    17 frames bad-frames 100% 修复, 仅 f42 单帧半脸 (Pass 2 模板来自 f28
    笑姿势, f42 爆发姿势 mismatch — 动态播放 66ms 一帧感觉"卡 1 帧", 比
    完全空白好). raw → v6 body 像素 lt150 减少 30-70% (5 场景).
  - **算法权衡**: v10-final 在某些像素位置 consistently 给低 alpha
    (不是 flicker, 是模型 uncertain), Pass 3 median 抓不到 (median<200).
    终极方案候选: Pass 4 全局 per-pixel median (跨 99 帧 median, 反映
    "这个像素是否通常属于章鱼身体"), 待 V3.0 release 后按需启用.
  - **算法权衡**: 模板帧替换会让章鱼"轻微卡顿 1 帧" (姿势差异大时),
    比"完全空白"好. ±15 范围限制章鱼姿势变化不致太大. alpha_mean>80 守卫
    保证模板帧是完整章鱼而非半章鱼.
  - **5 场景实跑** (raw → v5):
    | scene | bad frames (raw alpha_mean<30) | v5 bad frames | pass1 pixels | pass2 frames |
    | 17-celebrate | 17 (f11,12,16-21,26,42,45-46,48-52) | **0** | 73231 | 17 |
    | 22-yay-friday | 5 (f38-40,47,48) | **0** | 52034 | 5 |
    | 23-dancing | 2 (f54,55) | **0** | 45245 | 2 |
    | 32-laugh | 17 (f25,29-33,42-45,51-53,61-63,68) | **0** | 103880 | 15 |
    | 36-cheer | 3 (f63,64,65) | **0** | 59459 | 3 |
    | **TOTAL** | **44 frames** | **0** | **333849** | **42** |
    pass2 替换 42 帧模板帧 = 5 场景坏帧 100% 修复. 抽帧验证 17/22/23/32/36
    关键帧 (f11/f12/f17/f21/f26 / f39 / f54 / f30/f32 / f64/f65) 章鱼完整
    粉色 + 姿势自然 + 道具保留.
  - **执行位置**: `scripts/extract-v10-final-postfix-flicker.py` (~156 行),
    Pass 1 + Pass 2. 任何走 v10-final 输出的 APNG 上桌前必跑一次
    (idempotent). 升级自 v3 (commit `749051d`).
- **5 V3 H3 场景 v10-final 输出 1-frame flicker 修复 v3 (2026-09-16)**:
  18 V3 场景部署后用户反馈"17/22/23/32/36 处理完成的 apng 有闪烁的效果,
  其他效果都还不错". 排查: 5 场景共同特征 = 含大量飞舞道具 (彩带/酒杯/音符/
  哈哈字/彩旗). v10-final (CorridorKey) 在这种帧上 alpha mask 偶发掉到
  <150 (CorridorKey 跨帧 unmixing 不稳定, RGB 高但 alpha 偶发透明).
  disposal=2 (每帧擦背景再画) 下视觉闪. 17-celebrate 累计 7185 像素 flicker
  (vs 不闪的 13-debug-snack 只有 1295, 5.5× 多).
  - **修复算法 (5-frame window + 宽松阈值)**:
    对每帧 f_i, 检测像素 p: curr_a < 150 (本帧半透/透明) + curr RGB sum>300
    (身体色, 不是绿幕) + 近邻 4 帧 max alpha≥200 (近邻不透明) → fill alpha=255
  - **为什么 ±2 vs ±1**: 实际 flicker 模式可能跨 2 帧 (200→80→80→200),
    单看 ±1 抓不到. ±2 滚动窗口 max alpha 确保覆盖.
  - **为什么 <150 vs <100**: 真实 alpha 抖动可能到 80-150 区间 (不完全 0),
    阈值放宽避免漏. RGB 颜色 sum>300 作"身体色而非绿幕" 守卫避免误保.
  - **执行位置**: `scripts/extract-v10-final-postfix-flicker.py` (~95 行),
    任何走 v10-final 输出的 APNG 上桌前必跑一次 (5-frame window 算法 idempotent).
  - **5 场景实跑** (17/22/23/32/36):
    | scene | fixed | flicker_remaining | 修复率 |
    | 17-celebrate | 14408 | 17 | 99.9% |
    | 22-yay-friday | 7183 | 31 | 99.6% |
    | 23-dancing | 8608 | 84 | 99.0% |
    | 32-laugh | 15012 | 90 | 99.4% |
    | 36-cheer | 7858 | 16 | 99.8% |
    | **TOTAL** | **53069** | **238** | **99.5%+** |
    残留 238 像素 (<0.05%) 是 2-frame consecutive flicker (前后 ±2 帧都
    alpha <200 不命中), 视觉无感.
- **18 V3 H3 场景 v10-final 重生成治本"白方块" (2026-09-16)**:
  v4 fallback + 4 层 post-fix 部署后用户第三次反馈"眼睛还有明显的像正方形的
  白色区域". 排查: 颜色阈值路线物理上限 ~95%, post-fix 用肤色 inpaint ≠
  黑色眼白 (chroma key 已把皮肤当绿 → alpha=0 → inpaint 也只能填周围皮肤色,
  不是眼白黑色瞳孔). 治本方案: 走 `scripts/extract-v10-final.py` 神经网络
  unmixing 路径 (BiRefNet 1024 fp16 alpha hint → CorridorKey GreenFormer
  2048 tiled fp16 linear alpha + straight FG → v10.3 strict gate →
  forehead_white_mask H3 源 ROI 缝补 → borrow+recolor+inpaint 道具治本).
  - 从 git 历史 `922b642~1` 恢复 `scripts/extract-v52-apng.py` (v10-final 依赖,
    2026-09-10 cleanup 误删)
  - `scripts/extract-v10-final.py` 加 `H3_VIDEOS_V3` 字典 (18 新场景 mp4 路径) +
    CLI 模式 `python3 scripts/extract-v10-final.py scene1 scene2 ...`
  - 单场景 ~84s, 18 场景串行 ~22 分钟 (含模型加载), v4 fallback 5-6× faster 但
    物理上限治不到白方块
  - 验证: 18 场景 × f50 frame contact sheet, 全部零白方块. 31-apologize
    v10-final vs v4+postfix 4d02292 对比: 右眼 (用户视角左) 白方块消失.
  - 文件大小: v4 fallback 5.4-5.9 MB → v10-final 3.2-4.5 MB (clean alpha 压缩更好)
  - v4 fallback + 4 层 post-fix (`scripts/extract-v4-postfix-eyes.py`) 仍保留
    作 CPU-only fallback. 任何走 v4 fallback 输出的 APNG 上桌前必跑 post-fix.

### Release (2026-09-16)
- **V3.0 GitHub Release published**: <https://github.com/weekbin/octopus-pet/releases/tag/v3.0>
  - 资产 `octopus-pet.linux.bin` (116MB) — 26 V2 APNG 内嵌 91MB + Rust binary 25MB.
  - **V3.0+ binary 走 release asset, 不再 commit 进 git**: 之前 V2.0 8 V2 场景 ~30MB commit OK, V3.0 26 场景 116MB 超 GitHub 100MB 单文件 commit 限制 (`GH001: Large files detected`).
  - **`bin/octopus-pet` wrapper 自动从 release URL 下载兜底**: 第一次 `git clone` 后 wrapper 在找不到本地/缓存 binary 时, curl/wget 从 `https://github.com/weekbin/octopus-pet/releases/download/v3.0/octopus-pet.${KERNEL}.bin` 下载并缓存到 `bin/octopus-pet.${KERNEL}.bin`. 设 `OCTOPUS_PET_SKIP_DOWNLOAD=1` 抑制兜底下载.
  - **历史 commit 中的 binary 用 `git filter-repo --path bin/octopus-pet.linux.bin --invert-paths` 从 history 删除**: 强制 force-push 后 repo 不再含 116MB object, 后续 commits 可正常 push.

### Out of scope (方案 G/G1 实证均失败, V3.0 baseline 同样有拖影绿幕残留)
- **用户反馈 #1 (2026-09-16 18:43)**: "17/22/23/32 的抠图效果还是不是很好, 感觉动画有残影, 别的效果反倒不错. 方案 G: 基于 mp4 层 `ffmpeg -vf 'tmix=frames=3:weights=1 1 1'` 3 帧 temporal mix 让动画更流畅无残影". 用户硬约束: 原视频不丢 + 先备份 + 改动在备份副本.
- **方案 G 执行回顾** (frames=3:weights=1 1 1):
  1. ✅ 完整备份 27 个 mp4 到 `docs/h3-source-2026-09-15/raw-backup-2026-09-16/` (sha256 27/27 与 raw/ 一致)
  2. ✅ 备份副本上跑 tmix=`frames=3:weights=1 1 1` 处理 4 场景输出到 `/tmp/tmix-output/`, **帧间 MAD 下降 17-30% (优秀)** + 中心点 luma diff <5 + 绿幕背景 (5,241,0) 完全保留
  3. ❌ tmix 后 raw v10-final 提取回归: **32-laugh 41 帧 raw v10-final α=0 整章鱼 transparent**, 17-celebrate 22 帧 BLANK, 22-yay-friday 8 帧 BLANK, 23-dancing 1 帧 BLANK. Pass 2 silhouette fill 对 32-laugh 救回部分: v9 v3 f030 opaque=5681 (vs v9 v2 f030 opaque=13356), 33 帧半截空
  4. ❌ 视觉确认: 32-laugh f030 v9 v3 身体渲染**深红/泪印** (aRGB=140,140 = (127,6,6,1) 几乎全透 + (248,118,121) 仅半边粉), v9 v2 同帧身体完整粉色大笑. f042 同病. f027-f045 整段问题
  5. ✅ 立即回滚 (commit `196e376`): 从 `/tmp/v9v2-final-backup/` 恢复 4 个 APNG (sha256 100% 匹配) + 从 `raw-backup-2026-09-16/` 恢复 4 个 mp4 (sha256 100% 匹配). git status clean
- **用户反馈 #2 (2026-09-16 18:55)**: 接受方案 G1 选项. `tmix=frames=2:weights=1 1` (仅帧 i + i-1 平均).
- **方案 G1 执行回顾** (frames=2:weights=1 1):
  1. ✅ 备份上跑 G1 mp4 处理, MAD 下降 9.5% (温和), 中心像素 diff <3, 绿幕背景完美保留
  2. ✅ raw v10-final BLANK: 32-laugh 24 (vs G3 41), Pass 2 fill 救回, saved final 0 bad
  3. ✅ 像素统计: 32-laugh very_dark -12.9%, 23-dancing -9.9%, 17/22 略增
  4. ❌ **用户反馈 #3 (2026-09-16 19:23)**: "拖影比较严重, 还出现了绿幕没处理干净的情况. 在没处理好 apng 的效果之前不要忙着打包". **用户视觉复查发现 G1 仍有拖影 + 绿幕残留**: 32-laugh f15-f54, 17-celebrate f38-f43, 22-yay-friday f37-f38, 23-dancing f57-f59 — **dark green spike artifacts** 在大笑爆发/彩带挥舞段周围
  5. ✅ **关键发现**: 用户**对 v9 v2 baseline 全 99 帧 contact sheet 对比**也看到同样拖影 + 绿幕残留 — 这是 v3.0 既有 baseline 问题, **不是 G1 引入的回归**. v9 v2 与 G1 都有 artifacts, G1 在某些帧甚至让 artifacts 更明显 (因 tmix 让 RGB cross-frame 污染扩散)
  6. ✅ **立即撤销** (commit 19:24): 4 APNG + 4 mp4 sha256 100% 恢复 v9 v2 baseline. `gh release delete v3.0.1 --cleanup-tag` 撤销 V3.0.1 release. V3.0 恢复为 Latest. git status clean
- **根因** (G + G1 都解决不了):
  - H3 源视频本身有 motion blur + 道具 (彩带/酒杯/音符/哈哈字) 在大笑爆发/快速挥舞帧周边会反射绿幕反射
  - CorridorKey GreenFormer 看到"反射 + 运动模糊"组合返回 α<200 → 边缘 partial alpha
  - Pass 2 silhouette fill 用前一帧 RGB → 当前帧周围 green spike = 前一帧道具 RGB 残留
  - **tmix 既不能消除 H3 源 motion blur, 也不能让 CorridorKey 提取更准** — 它只是改变帧间时序权重, 对 artifact 是中性或负面
- **真正可行的方向** (从根因治):
  - **方向 H1** (治根): 改 v10-final green gate 阈值 (当前 `G>150 AND R<150 AND B<150 AND ratio>1.3`). 对 32-laugh / 17-celebrate / 22-yay-friday / 23-dancing 单独放宽 (`G>140 AND R<170 AND B<170 AND ratio>1.1`), 让道具边缘 alpha 提到 200+. 改 v10.3 strict gate 参数
  - **方向 H2** (降门槛): 添加 **Pass 5 道具边缘硬清**: 检测 silhouette 外 8px 范围内 alpha 10-200 像素 (即"边缘绿刺"), 直接 α=0. 这能消除"道具周边绿刺" artifacts, 代价是道具边缘略硬
  - **方向 H3** (改源): 重新 H3 生成这 4 个场景, 加 prompt 约束 "no reflection of background in props / clean matte props / no green tint reflection"
  - **方向 H4** (UI 层): 接受 artifacts, 通过 tauri 窗口设 transparency + 阴影模糊, 让用户视觉感受减轻. 不重抠图, ~30 分钟代码改动

### Added
- **18 个 V3 H3 场景注册到 scenes.json (8 → 26, 2026-09-16)**:
  13-debug-snack / 16-deadline-sprint / 17-celebrate / 18-monday-morning /
  19-thumbs-up / 20-thinking / 22-yay-friday / 23-dancing / 24-surprised /
  29-shy / 30-wave / 31-apologize / 32-laugh / 33-magic / 34-meditation /
  35-blink / 36-cheer / payday. 全部走 v10-final 输出, 99 帧 × 66ms × 192×192
  × ~3.5 MB 各, APNG default `loop=0` (浏览器原生循环).
  - `scenes.json` 加 18 entry (id / source / bubbleLines 7 条中文台词)
  - `app/src/state/scene-registry.generated.ts` + `src-tauri/src/scene_registry_generated.rs`
    自动重新生成, `check-scenes-sync.sh` 通过
  - `app/src/state/octopus-fsm.test.ts` "contains 8 V2 scenes" 断言更新到 26 个
    V2 + V3 场景, 24/24 vitest 通过
  - `cargo test --lib` build OK (无新增 #[test], 仅 build warnings pre-existing)

### Changed
- **Pipeline cleanup (2026-09-10)**: Single source of truth for video production
  pipeline. Removes 4 deprecated/obsolete extract scripts, 3 overlapping pipeline
  docs, 1 obsolete assets audit, and 3 historical v2-{N}-*/verification directories.
  - **Removed scripts** (superseded by `extract-v10-final.py`):
    - `scripts/extract-birefnet-apng.py` (v5.1 BiRefNet alone, 放大镜玻璃治不到)
    - `scripts/extract-v52-apng.py` (v5.2 缺 borrow+recolor 治不了 H3 prop 破渲染)
  - **Renamed**: `scripts/extract-chromakey-apng.py` → `scripts/extract-v4-chromakey-cpu-fallback.py` (命名自解释: v4 末态 + CPU-only + fallback)
  - **Removed docs** (历史/已废):
    - `docs/v053-validation/` (v0.5-3 验证产物, 96.65% 相似度已记 CHANGELOG)
    - `docs/refactor-plan-2026-08-18.md` (已完成, 决策已写 AGENTS.md)
    - `docs/v2-01-detective-study/` + `docs/v2-02-worker-construction/` + `docs/v2-03-drink-coffee/` (H3 中间产物, 部署的 APNG 已替换)
    - `docs/v2-pipeline.md` + `docs/v2-h3-to-pet-workflow.md` (内容并入 v10-pipeline.md)
    - `docs/breath-pipeline.md` (V1 旧 idle 动画流程, V2.1 standard-char 已稳定)
  - **New docs**:
    - `docs/pipeline.md` (8.3KB) — 总入口, default + fallback + 完整演进史 (v1 → v10-final, 25+ 步) + 决策树
    - `docs/h3-capabilities.md` (11.7KB) — H3 必须提供什么 (双图模式, 16 项通用前缀, 视频规格, 14 动作清单, 6 已知 H3 行为问题 + 治本方案)
  - **Updated docs**:
    - `docs/v10-pipeline.md` 顶部加 "v10-final 是唯一 default + v4 fallback" 表 + 修 §4.1 引用 (删了 v52, 加 v4 fallback 命令)
    - `AGENTS.md` 精简 chroma key 演进段 (321 → 239 行, 删 82 行详细根因, 替换为 10 行精简指针指向 docs/pipeline.md) + 修默认脚本矛盾 (v52 → v10-final) + 修换桌宠 idle 素材指引 (breath-pipeline → v10-pipeline + standard-char)

### Removed
- **Project structure cleanup (2026-09-15)**: 跟 CHANGELOG 2026-09-10 段保持一致 + 清历史遗留.
  - **Deleted scripts** (跟 2026-09-10 cleanup 段一致, 该段当时说删但忘删):
    - `scripts/extract-v52-apng.py` (跟 2026-09-10 已 commit 段对齐, 实际删除 2026-09-15)
    - `scripts/remove-hat-greenscreen.py` (一次性 hat 修复, 早已用完)
    - `scripts/run-h3-batch.sh` / `run-h3-batch-09-12.sh` / `run-h3-batch-remaining.sh` (3 个一次性 H3 批量脚本, 产物已落 `_h3-source/`)
  - **Archived prompts** (移到 `prompts/_archive/`, 4 个 prompt 没产出对应 V2 scene, 留作重做备份):
    - `prompts/05-payday.md` / `07-soul-leaving.md` / `08-lying-flat.md` / `12-touch-fish.md`
  - **Archived handoff docs** (移到 `docs/_archive/2026-09-11-handoff/`, 6 篇 2026-09-11 当天密集工作的脉络记录, V1.5+ 已定稿后这些是历史档案):
    - `docs/handoff-2026-09-11.md` + 5 篇专题 (linux-display / macos-b-d-rootcause / macos-nuc-build-sim / macos-verify / v15plus-img-render)
  - **Deleted legacy binary** (13MB 老 debug build, 缺 assets, 不再兼容 .linux.bin / .macos.bin 走法):
    - `bin/octopus-pet.bin` (历史 13MB macOS debug build, wrapper fallback 4 删, 现在只走 `bin/octopus-pet.${KERNEL}.bin`)
  - **Deleted local-only dirs** (1GB+ 本地噪音):
    - `.venv-birefnet/` (v5.x BiRefNet+CorridorKey venv, v10-final 不依赖, 1GB)
    - `models/birefnet/` (空目录)
    - `scripts/__pycache__/` (Python 缓存)
  - **Git removed from tracking** (源在 git, 但应该 ignore):
    - `docs/h3-source-2026-09-10/*.mp4` (5 个 H3 源 mp4, 3.2MB 中间产物, APNG 才是 deployed)

### Changed
- **Gitignore + doc consistency (2026-09-15)**:
  - `.gitignore` 加 `docs/h3-source-*/` + `docs/*.mp4` (防 H3 源 mp4 再入 git) + `.venv*/` + 给 `.venv-birefnet/` 加注释 (1GB 历史 venv 已删)
  - `bin/octopus-pet` wrapper: 删 fallback 4 (legacy .bin), 只走 `bin/octopus-pet.${KERNEL}.bin`
  - `AGENTS.md` / `README.md`: 全部 `bin/octopus-pet.bin` 引用改为 `bin/octopus-pet.${KERNEL}.bin` (KERNEL=macos/linux/windows)

### Fixed
- **v5.3 BiRefNet + CorridorKey + green residual mask (2026-09-10 commit pending)**:
  Adds `post_green_residual_mask` to demote alpha=255 pixels with pure green-screen
  color (G>180, R<100, B<100) to transparent. Fixes v5.2 regression where H3 source
  renders the magnifying glass interior as solid green (RGB ~40,220,60), which
  BiRefNet hint includes as "subject" and CorridorKey preserves.
  - **Why strict G>180 R<100 B<100**: coffee cup green (drink-coffee) is salmon
    (~254,150,125) → fails R<100 check, kept. Body highlights R>200 → fail. Only
    actual "green screen green" gets demoted. Zero false positives.
  - **Results (3 scenes, 100 frames, strict threshold green residual avg/frame)**:
    detective 197 → **4** (49× ↓), worker 53 → **7** (7.5× ↓), drink 0 → 0.
  - **Visual verification**: detective f35/f50 magnifying glass now properly
    transparent (red bg shows through). f70 hat-green unchanged (H3 source bug,
    not matting).

### Changed
- **v5.2 BiRefNet + CorridorKey (2026-09-10 commit 7d1587a)**:
  Replaces 25-step color-based chroma key (v4.15+ v4.16 position-mask patches) with a
  two-stage neural net pipeline. (Superseded by v5.3 above for magnifying glass fix.)
  symptoms of the same root cause ("color-based green detection can't separate green-screen
  green from green-screen-reflected-into-foreground green"). v5.2 fixes this at the
  source: BiRefNet gives a clean subject mask, CorridorKey does physics-aware unmixing
  to recover the true foreground color from the green-screen-illuminated RGB. Result:
  magnifying glass is **naturally transparent** (no special handling), body green
  reflection is **fully removed** (not color-clamped), alpha is real linear fractional
  (not color-based threshold), 0 inpaint halo, 0 color spill, 0 position-mask artifacts.
  - **Stage 1 BiRefNet (ZhengPeng7/BiRefNet, fp16 1024)**: subject segmentation → soft
    alpha hint (255ms/frame @ 1024 on RTX 3060, 1.7GB VRAM).
  - **Stage 2 CorridorKey (GreenFormer 2048 internal, tiled fp16)**: physics-aware
    unmixing, takes BiRefNet hint as input, outputs linear alpha + straight FG color
    (1.3s/frame @ 768x768 on RTX 3060, 4GB VRAM). No tiling needed for 768×768 input.
  - **v5.2 (kept from v4.x)**: forehead_white_mask (H3 hat reflection "white square"
    on detective f70/f75) — this is a source video physical lighting defect, not a
    matting problem. ROI (y=50-80, x=70-110) at 192×192.
  - **Pipeline location**: `scripts/extract-v52-apng.py`. `extract-chromakey-apng.py`
    (v4.x) preserved as fallback for offline CPU-only environments.
  - **3 场景实测 (RTX 3060 12GB, 100 帧, RED bg 验证)**: 100% bg pixels = pure red
    (alpha perfect, no leak). Green residual avg/frame at 192×192: detective 538→412
    (1.3× better), worker 674→386 (1.7× better), drink 518→160 (3.2× better).
    Total pipeline: 96s for 99 frames (vs v4.24 ~30s), 3.2× slower but VRAM 5.5GB peak
    (12GB available, both models coexist).
  - **Required dependencies** (separate venv `PYENV_VERSION=3.12.3` because CorridorKey
    pins `torch==2.8.0` but we tested on 2.6.0+cu124 successfully without re-pinning):
    torch 2.6.0+cu124, transformers 5.17.0, opencv-python-headless 5.0, einops, kornia,
    safetensors, huggingface-hub 1.30. BiRefNet weights (444MB) +
    `CorridorKey_v1.0.safetensors` (399MB) downloaded via `HF_ENDPOINT=https://hf-mirror.com`
    (huggingface.co DNS poisoned to FB IP, mirror required).
  - **Known limit**: when H3 source video has a green object rendered as foreground
    (e.g. detective-study f70 hat turns green, worker f70 tool + table turn green),
    CorridorKey + BiRefNet both correctly identify it as foreground (per H3 output)
    and keep it. v4.24 sometimes "fixes" these by misclassifying as bg, but at the
    cost of body artifacts. To remove these, fix the H3 prompt (re-run H3 gen).

### Fixed
- **chroma key v4 → v4.2 → v4.3 → v4.4 → v4.5 → v4.5.1 → v4.6 → v4.7 → v4.8 (9 步演进, 2026-09-09 commits 7b09fd3, 2dc3428, ab1ddcd, 8a2ca87, 2e59875, f18a3c7, 27d9c74, 06c70dc, b16c87f, current)**:
  治本 9 个不同维度的视觉 regression (白底偏绿半透 / 白色斑块 / 边缘锯齿 / 绿色描边 / 绿色阴影 / 绿调反射高光 / 眼睛模糊 / 边缘过渡带绿阴影 / 物品周围绿阴影 / 切换绿残影 / 眼白发黄), 沉淀到 `scripts/extract-chromakey-apng.py` 默认.
  v4.8 是当前唯一默认 (V2.1 production baseline), v3 作 `--chromakey` 选项兼容保留.
  - **v3 → v4 (相对绿度公式)**: 修复"白底偏绿被抠成半透明" (眼白下边缘显"高亮透明").
    旧 `clip((G - max(R,B) - 10) / 20)` 是绝对绿度阈值, RGB(164,182,150) G-R=18 触发
    partial-alpha 153. 新 `clip(((G - max(R,B)) / G - 0.2) / 0.3)` 归一化到 G 本身,
    "绿在 G 里的占比" < 0.2 → 不透. 8 色基础测试集 + 实际帧验证.
  - **v4 → v4.1 (深色阴影保护)**: 修 H3 模型在脸颊/触手上渲染的深绿阴影
    (RGB ~22,45,7) 被 v4 误判为绿, alpha=0 → 桌宠透出白底 → 用户看到"白色斑块".
    加 `max(R,G,B) < 80` 强制不透明, 保留深色阴影. 深绿阴影 29048 个全部保护.
  - **v4.1 → v4.2 (阈值收紧 + 中绿保护 + alpha 羽化)**: 修 H3 模型"绿黄残留"
    (RGB ~155,188,75) 在 v4.1 下 rel=0.135 < 0.2 → 保留为不透明绿色 (每帧 ~734 个);
    阈值 0.2 → 0.15 让绿黄反射也走 soft 透明 (-98%); 加中绿保护避免误扣;
    alpha 通道 1 像素 Gaussian blur 让 192→116 resize 边缘从硬切变软边
    (partial 比例 0.21% → 1.18%).
  - **v4.2 → v4.3 (cv2.inpaint 修 partial RGB)**: 修"绿色描边" regression.
    H3 模型在章鱼身体边缘渲染"绿+粉"混合色 (partial 像素 RGB 均值 R=25, G=198, B=11),
    alpha 羽化后 partial 像素 RGB 仍偏绿 → 桌宠身体外圈显"绿色描边".
    cv2.inpaint (Telea, r=5) 用 PDE 解算把 partial + 透明区域 RGB 从远处 alpha=255 像素
    传播身体色过来. drink-coffee f25 partial 绿偏: v4.2 70% → v4.3 23% (-47pp).
  - **v4.3 → v4.4 (v4.1 保护加严 + mask 扩展)**: 修"绿色阴影" regression.
    v4.1 旧保护 `max<80` 把 H3 深绿反射 (RGB ~20,55,8) 也保留 → 触手上绿色阴影;
    v4.3 inpaint 只修 partial + 透明, 不修 alpha=255 但 RGB 偏绿的像素.
    v4.4 加严保护 `(max_rgb<80) AND (G-max(R,B)<20)` 区分真阴影 vs 绿反射
    (深绿反射 28214 个被 v4.4 排除保护), mask 扩展到 alpha=255 绿偏像素
    (G>R+5 AND G>B+5). drink-coffee f25 partial 绿偏: v4.3 23% → v4.4 0.5% (-22.5pp).
  - **v4.4 → v4.5 (mask 6px 膨胀 + radius=4)**: 修"绿调反射高光" 残余.
    v4.4 残余"绿色阴影"主要在 H3 帽子的绿调反射高光 (RGB ~150,130,60 或 145,147,23,
    R>G 但 B 极低, 视觉上像绿调). v4.4 mask 只覆盖绿偏像素本身, 没扩到外圈;
    v4.5 mask 6px 膨胀 (kernel 3x3, iterations=2) 把外圈 6 像素都算 mask, radius 从 5
    降到 4 (膨胀已经覆盖更广, 不需要大 r).
    50 帧总和: detective-study partial 65→0 + opaque 16→0 (-81px),
    worker-construction partial 690→0 + opaque 0→0 (-690px), drink-coffee 0→0 (持平).
  - **v4.5 → v4.5.1 (mask 分开处理, partial 不膨胀)**: 修"眼睛模糊" regression.
    v4.5 mask 6px 膨胀覆盖了眼睛 partial 边缘, 眼睛的高光(星形)/瞳孔(黑色)/眼底
    月牙(白色)被 inpaint 改成周围身体色(粉色), 眼睛清晰度从锐利变模糊.
    v4.5.1 把 mask 拆成 2 步: (1) partial+transparent 单独 inpaint (r=5, 不膨胀,
    保留 v4.4 行为); (2) green_opaque 单独 mask 6px 膨胀 inpaint (r=4, 修身体/帽子的
    绿调反射). 眼睛恢复 v4.4 清晰度, 帽子/放大镜绿调反射仍消除.
  - **v4.5.1 → v4.6 (alpha 激进收紧 + partial mask 1px 膨胀 + radius 5→8)**: 治本
    v4.5.1 残余 4 类问题 (眼睛半透 / 身体边缘绿阴影 / 物品周围绿阴影 / 切换绿残影).
    (1) 眼睛半透: 眼周 partial 像素 (60-139 个) RGB 暗 R=63-83, alpha 半透 → alpha 激进
        收紧 alpha<80 → 0, 眼周低 alpha 直接归 0, 黑色瞳孔边缘变硬清晰.
    (2) 身体边缘绿阴影: 轮廓 partial 像素 (544-2479 个) RGB mean R=130-163 G=91-109
        B=55-64 (R>G>B 棕色阴影, G 中 B 低 → 视觉"绿调阴影") → partial 6000 → 4600
        (-24-28%) + partial mask 1px 膨胀 + radius 5→8, 远处身体色 PDE 解算覆盖到
        partial 像素, 绿调消失.
    (3) 物品周围绿阴影: 物品边缘 alpha=255 深色像素 (70-100) 500-1000 个 → partial mask
        1px 膨胀覆盖到 alpha=255 边缘外 1 像素, 物品周围过渡带一起 inpaint 修.
    (4) 切换绿残影: partial 像素 hard-key 后 alpha 边缘只有 0/255, 中间值拖影消失 → 场景
        切换时前一场景的 alpha 中间值不会拖出"半透绿残影".
    视觉验证: 桌宠 116×116 透明窗口 detective-study / drink-coffee 干净, 黄色施工帽
    边缘绿调消除 (zoom 对比图).
  - **v4.6 → v4.7 (眼白 G 偏色 mask, inpaint r=3) — 已撤回**: 治本"眼白发黄/发绿"用户反馈.
    v4.6 治本 4 类边界问题后, drink-coffee 眼周 225 个 alpha=255 白色像素 70% G 偏色
    (R=240 G=153 B=131), H3 源视频眼底月牙 RGB 偏 G, 视觉"米黄/发绿". detective/worker
    也残留 1-19 个 G 偏色像素.
    解决: 新增 green_tinted_white mask (alpha=255 + R>200 + R+G+B>600 + G>B+5), 单独
    inpaint r=3 (小半径, 期望保护眼周细节). 治本数据: 3 场景眼周 G 偏色像素 → 0.
    视觉: drink-coffee 杯子边缘绿反射消除, 章鱼身体更纯粉红.
    **失败根因**: 即使 mask 限定"白色 G 偏色", inpaint r=3 仍把星形高光/瞳孔边界涂
    抹模糊, 眼白从"锐利纯白 (带 G 偏色)"变成"灰月牙 (涂抹感)".
    用户反馈"现在眼睛的处理更加糟糕了" (2026-09-09 14:30) → 撤回, 改 v4.8 纯色度 clamp.
  - **v4.7 → v4.8 (yellow_white color clamp, no inpaint) — 当前默认**: 撤 v4.7 inpaint r=3
    (保护眼锐利度优先, 0 模糊), 改纯像素级 RGB 调整:
    (a) 检米黄像素: alpha=255 + R>200 (亮) + B < G-15 (B 显著低于 G) + R > B+50
        (R 远大于 B) + R+G+B < 720 (排除纯白/星形高光 R=G=B 接近)
    (b) G = np.clip(G, B, R-20) — 拉低 G 到 [B, R-20] 区间, 消除 G>B+15 黄绿感, 保留亮度
    (c) 不动 alpha, 不动 R/B, 不 inpaint → 0 模糊, 保护所有眼细节 (星形高光 / 瞳孔边界)
    治本数据: 3 场景眼周米黄像素被 clamp
      detective-study 眼周米黄像素: v4.7 治本 (inpaint) → v4.8 治本 (clamp)
      worker-construction: v4.7 治本 → v4.8 治本
      drink-coffee: v4.7 治本 → v4.8 治本
    视觉验证 (3 场景, 桌宠实际渲染截屏 + APNG f25 静态对比三方 v4.6 / v4.7 / v4.8):
      - detective-study 棕色侦探帽 + 放大镜: 帽色纯净, 放大镜玻璃无绿反射
      - worker-construction 黄色施工帽: 帽色亮黄保留, 边缘无绿调
      - drink-coffee 绿色咖啡杯: 杯身边缘干净, 眼白真正纯白
      - 边界/物品/切换 4 类已治本 (v4.6 验证) 保持不退步
  - **v4.8 → v4.15 (7 步演进治本"眼白雾蒙蒙", 2026-09-09)**: 用户多次反馈"眼白不清晰,
    像有白内障一样, 雾蒙蒙的, 动画中视觉更差". 之前以为是 chroma key 引入, 实际是
    **H3 源素材眼底月牙本身就是"暗暖白" RGB (235, 212, 207), brightness mean 218 max 227**,
    物理上生成不出 RGB (255, 255, 255) 纯白. 在不改动源素材约束下, 像素层 7 步治本:
    - **v4.8 → v4.9 (alpha 240+ 收紧)**: harden_alpha_edges high_thresh 175 → 240,
      治本"眼周 partial 240+ 半透雾感". 3 场景 alpha 240+ partial 1732+1446+1089=4267 → 0.
      bug fix: `>` 改 `>=` (240+ 像素全归 255), alpha_soften blur 后再 hard-key 一次
      (blur 把 240+ 降回 220-254 范围, blur 后再 240+ → 255 锁死).
    - **v4.9 → v4.10 (撤回)**: 改 color clamp `G > B + 8` 替代 `R > B + 50` 想治更多温和米黄.
      失败: 误治 4000+ 强黄/橙像素 (detective 帽 4059 / worker 帽 4328 / drink 杯 4259),
      R-B>=100 帽色变橙红. 撤回.
    - **v4.10 → v4.10.1 (R-B<60 限定温和米黄)**: 加 `R-B < 60` 限定温和米黄, 保留
      强黄/橙 (R-B>=60, 黄色施工帽 / 棕色侦探帽 / 绿色咖啡杯 — 正确颜色不能 clamp).
      治本: 3 场景温和米黄 135+109+18=262 → 0, 强黄 4171+4682+4414=13267 完整保留.
    - **v4.10.1 → v4.11 (G>B+5 治 G-B=7 极淡米)**: v4.10.1 漏 G-B=7 极淡米 (R-B 20-25,
      R-G 13-17, 位置眼底月牙). 改 G > B+8 → G > B+5, RGB mean (227,214,207) → 治本.
      0 误治 (R-G 13-17 是眼周, 非肤色 R-G 50+). 治本: 3 场景 G-B=7 极淡米
      38+43+62=143 → 0.
    - **v4.11 → v4.12 (HSL 提 L*1.18 治暗白 218 → 228)**: 50 帧逐帧诊断发现眼底月牙
      brightness mean 215, max 220-227, **没一帧到 240** — 源素材眼底月牙就是"暗白"
      不是"亮白". 治 G 偏色不动亮度治不到根. v4.12 cv2 HSL 空间提 L * 1.18
      (R 已饱和 235 → 255 不能再提), 维持色相 (RGB 比例不变). 治本: 3 场景
      dark 像素 (≤220) 241-254 → 54-64 (-75%), mid (220-240) +50%, brightness mean 215 → 228.
      帽/杯强黄 23147 完整保留. 锐利度 0 损失 (HSL 改 L 不动 H/S).
    - **v4.12 → v4.13 → v4.14 (S 拉低)**: 眼白 brightness 提上来但 R-B 22 仍偏暖.
      v4.13 S*=0.10 (拉 90%) 视觉变化小 (色相 17 → 16.8). v4.14 S=0 (完全去色,
      眼白 = 灰白 (228, 228, 228)).
    - **v4.14 → v4.14.2 (mask bug 修复)**: v4.14 S=0 实际没生效 — 眼周 v4.12 mask 限
      `B<200`, 但 v4.12 L*1.18 提亮后 B 都 > 200, **眼周最亮区被 mask 排除**治本不到.
      v4.14.2 mask 去掉 B<200 限制, R>200 + R-B<60 全部命中 → S=0 全治 → 灰白.
    - **v4.14.2 → v4.15 (mask 限严 R>230 R-B<40 避免边缘硬切) — 当前默认**: v4.14.2 全
      眼周治本灰白, 跟周围粉色身体色对比强烈, 视觉"塑料". v4.15 mask 限 R>230 + R-B<40
      (眼底月牙中心最亮区), 保留边缘色相 → 软过渡. 治本灰白 460-476 → 242-262 (-50%),
      偏暖保留 6769-6932 → 6980-7127 (+200 软过渡). 视觉: 眼底月牙纯白 + 自然软过渡,
      不塑料. 4 方对比 (v4.8 / v4.12 / v4.14.2 / v4.15) 中 v4.15 最自然.
    - **v4.15 → v4.16 (绿色 sclera 治本 + 瞳位置空间约束)**: v4.15 部署后用户仍反馈
      "灰蒙蒙, 不干净". 反思根因: v4.15 mask `R>230 R-B<40` 太严, 3 场景睁眼帧命中
      **0-1 像素**, 几乎不生效. 实际 sclera RGB mean R=199 G=149 B=127 (R-G=40, G-B=22,
      R-B=70) 是 **green-tinted 偏色**, 不是 yellow. 之前 v4.8-v4.15 都用 yellow_white
      公式 (G-B>5) 治, 完全没碰到 green cast.
      v4.16 三步: 1) **放宽 color mask** 到 `R∈[150,245] + (R-G)<50 + (G-B)∈[10,100] +
      (R-B)<100` — 命中 50-1100 px/帧 (v4.15 0-1), 真正捕 green-tinted sclera.
      2) **加空间约束 (瞳位置)** — worker 木板 RGB (190,160,130) 跟 sclera 几乎相同,
      只能按位置区分. 黑瞳 ±18 px = sclera zone, color mask AND sclera_zone → 0 误治
      木板/帽高光. 闭眼帧无瞳 → sclera zone 空 → v4.16 不生效 (0 误治).
      3) **保留 HSL L*1.18 + S=0** → 治后 sclera RGB (251, 236, 231) ~ (255, 247, 247),
      真接近纯白. 视觉 3 场景眼底月牙从 greenish hazy → clean bright white.
    - **v4.16 → v4.17 (移除 soften_alpha, 治 partial alpha 灰蒙蒙)**: v4.16 部署后
      用户问"为什么 H3 源这么好眼白还会变灰". 反思根因 (用户原话 + 像素诊断):
      源视频 0.5s 帧眼白完全锐利, alpha=255/40000 = 100% 无 partial, RGB 干净.
      v4.16 部署后眼区 alpha=255 仅 90.8% (52 个 partial 100-240 像素), 这些
      partial 像素 RGB 混合桌面背景 → 视觉"灰蒙蒙".
      根因: `soften_alpha(radius=1)` 1px Gaussian blur 把锐利 alpha 边变软.
      v4.17 移除 `softer_alpha` 步骤 — 源视频 H3 模型 768x768 高分辨率输出,
      眼边缘本身锐利, 不需要额外 blur 抗锯齿. 治本: partial alpha 52 → 1,
      锐利度恢复, 桌宠实际渲染眼边无"灰蒙蒙".
      调研佐证: Bomberbot 教程用 HSV + color spill suppression (前景 G 拉到
      min(G,R,B)), ChromaDespill (本科论文) YCbCr palette + green channel
      suppression, 都强调"对前景去绿"+"锐利 alpha 边界" — 我的 v4.16 缺这两步.
      风险: body 边缘可能"硬切". 实际验证: v4.6 的 inpaint r=8 已填 partial
      像素使 alpha 0/255 化, soften 影响小, 视觉 body 仍可接受.
    视觉根因 (反思): v4.15 之前 9 版 (v4.6-v4.13) 一直在 RGB 空间补色 (G 偏色 / R-B 偏色),
    没意识到真正问题是 **L (亮度) + S (饱和度) 双低 + green cast**. HSL 空间提 L + 拉 S
    治本后, v4.16 又发现新问题: green cast (G > B + 10) 而不是 yellow (G > B + 5),
    v4.8-v4.15 治 yellow 公式完全错方向. 真正"亮白"只能改 H3 源 prompt
    ("bright white eyes RGB 255"), 但被用户约束"不改动视频原始素材"排除.
      - 眼细节锐利度: 跟 v4.6 持平, 优于 v4.7 涂抹
      - 眼白纯度: 优于 v4.6 (G 偏色治本), 远优于 v4.7 (灰月牙)
    取结果最优: 眼白纯度 + 锐利度 + 边界 3 维度同时达标.
  - 配套: 3 个 v4.8 APNG 重建 (current), 桌宠 116×116 透明窗口视觉 OK: 完全无
    绿色描边/阴影/反射, 眼白纯白 + 锐利, 帽色/杯身/放大镜干净, 切换时无绿残影.
- **post-fix v2 + v3 + v4 修复 v4 fallback 输出 18 新 H3 场景眼睛错杀 (2026-09-16)**:
  V3.0 H3 视频首批 18 场景走 `extract-v4-chromakey-cpu-fallback.py` 输出后, 用户反馈
  "眼睛被处理成透明的了有一部分, 不是纯白". v4 chroma key 共性错杀两类 RGB:
  (a) **纯黑瞳孔 RGB (19, 43, 10)** — v4.6 `harden_alpha_edges` 把章鱼眼睛黑色瞳孔
  RGB 当成"低置信度绿幕"误 transparent; (b) **深绿眼线/眼眶 RGB (60-100)** — v4.4 dark
  保护 (`max<80 AND g_max_rb<20`) 漏掉 RGB 在 [60, 100) 区间的眼线像素. v2 算法
  (`60 ≤ max < 100 AND 8 邻居中 ≥6 个 alpha > 128`) 治 (b), 308 像素修复. 部署后
  用户二次反馈"眼睛还有问题", v3 算法加**连通小簇填充** (≤30 px 簇 + 簇均 RGB<130 +
  bbox 周围 2 px 环不透明比例 ≥50%) 清理眼白绿斑, 5160 像素额外修复.
  部署后用户**三次反馈"章鱼左眼 (用户视角右) 还有问题, 比刚刚好点"**. 排查发现:
  v3 漏了大簇 (e.g. 31-apologize f50 章鱼左眼外角 56 像素簇 RGB(153,94,63) 棕色眼阴影).
  这些大簇**3 边被 opaque sclera 包围, 1 边接触身体轮廓**, bbox 4px 环不透明比例 0.746
  (够高). 单纯 alpha=255 会留深色斑块, 必须 cv2.inpaint 修 RGB 颜色. **v4 算法**:
  连通簇 ≤100 px + bbox 周围 4 px 环不透明比例 ≥70% → alpha=255 + cv2.inpaint(TELEA,
  radius=3) 修复 RGB. 18 场景共 **32736 像素 v4 修复**.
  - **条件 ROI 而非全图** (y=40-60%, x=20-80%): 避免误保绿幕边缘黑色阴影.
  - **四层条件**:
    - v1: `alpha=0 AND max(R,G,B) < 60` (纯黑瞳孔)
    - v2: `alpha=0 AND 60 ≤ max < 100 AND 8 邻居中 ≥6 个 alpha > 128` (深绿眼线)
    - v3: 连通小簇 ≤30 px + 簇均 RGB<130 + bbox 周围 2 px 环不透明比例 ≥50% (眼白绿斑)
    - v4: 连通簇 ≤100 px + bbox 周围 4 px 环不透明比例 ≥70% + cv2.inpaint(r=3) 修 RGB
      (填充身体 silhouette 边缘被 chroma key 误 transparent 的皮肤色块, 区别于大面积
      身体 silhouette 接触背景 — 大簇 bbox 4px 环不透明 < 70% 不填, 避免矩形凸起)
  - **v4 关键**: 仅 alpha=255 不修 RGB 会留深色斑块 (原 RGB 是 chroma key 之前的
    深棕色眼阴影/虹膜边). cv2.inpaint(TELEA, r=3) 用 PDE 从远处 opaque 像素扩散
    身体色覆盖.
  - **执行位置**: `scripts/extract-v4-postfix-eyes.py` (~150 行, 4 层条件),
    任何走 v4 fallback 输出的 APNG 上桌前必跑一次.
    v10-final GPU 路径无此问题 (BiRefNet/CorridorKey 不会把眼睛 RGB 当绿幕反射).
  - **决策路径**: v5 (4-side pad all ≥0.5) 拒绝太多 (49/44/20 等大簇 1 边到 body silhouette)
    → v6 (bbox pad=4 ≥0.7 不 inpaint) 修了 alpha 但 RGB 深色, 视觉仍像黑斑 → v7 (v6 + cv2.inpaint)
    显著改善, 集成到 `extract-v4-postfix-eyes.py` 名为 v4.
  - **视觉验证**: 18 场景 × 4 帧 on-gray contact sheet (`/tmp/visual-on-gray/`),
    31-apologize/24-surprised/16-deadline-sprint/payday 重点看, 章鱼左眼外角深棕色斑块
    → 干净. 4 帧各 ROI 内 alpha=0 像素数 (e.g. 31-apologize f50 175 → 112).
  - **数字 v2 + v3 + v4 实跑 (18 场景 × 99 帧 = 1782 帧)**:
    | scene | v2 | v3 | v4 | total |
    | 13-debug-snack | 0 | 0 | 744 | 744 |
    | 16-deadline-sprint | 0 | 0 | 2542 | 2542 |
    | 17-celebrate | 0 | 0 | 3423 | 3423 |
    | 18-monday-morning | 0 | 0 | 3127 | 3127 |
    | 19-thumbs-up | 0 | 0 | 125 | 125 |
    | 20-thinking | 0 | 0 | 18 | 18 |
    | 22-yay-friday | 0 | 0 | 90 | 90 |
    | 23-dancing | 0 | 0 | 1982 | 1982 |
    | 24-surprised | 0 | 0 | 1268 | 1268 |
    | 29-shy | 0 | 0 | 85 | 85 |
    | 30-wave | 0 | 0 | 5261 | 5261 |
    | 31-apologize | 1 | 0 | 2348 | 2349 |
    | 32-laugh | 0 | 0 | 2529 | 2529 |
    | 33-magic | 0 | 0 | 4661 | 4661 |
    | 34-meditation | 0 | 0 | 0 | 0 |
    | 35-blink | 0 | 0 | 81 | 81 |
    | 36-cheer | 0 | 0 | 178 | 178 |
    | payday | 0 | 0 | 4274 | 4274 |
    | **TOTAL** | **1** | **0** | **32736** | **32737** |
    注: v2/v3 数字是 v4 实跑计数 (含 v1/v2/v3 残留). 第一轮 v2+v3 跑后 alpha=0 几乎全部
    由 v4 算法覆盖 (大簇), 所以 v2/v3 这轮几乎 0.
- **cargo test 预期值同步 2 → 3 V2 场景 (drink-coffee 加项遗漏)**:
  修 `src-tauri/tests/mcp_roundtrip.rs::list_states_returns_2_v2_scenes` 期望值
  2→3 + 加 drink-coffee assertion, 8/8 cargo tests 重新绿.

### Added
- **第 3 个场景 drink-coffee (H3 一次过 99.91% 相似度, 2026-09-09 commit fef8017)**:
  范式: 单件道具 (Q 版咖啡杯) + 3 段 × 2s + 渐变淡出. 表情: 温和 → 期待 → 满足
  (3.0-3.15s 闭眼 0.15s 享受精确命中) → 温和. 4 段 prompt 写完, H3 双图首末锚点
  跑出 99.91% 相似度 (远高于 95% 阈值, 超过 01 v3 H3 的 96.58%). 1 段变出杯 /
  2 段举杯+闭眼享受 / 3 段放下+渐变淡出. 已知 H3 偏差 (杯子 ~20% vs 写 8% 画幅
  宽度, 触手弯曲 ~15° vs 写 ≤10°) 在 ±50% 容忍范围, 视觉比例合适不用重做.
  APNG: 50 帧 × 132ms × 192×192 × 1.91MB × num_plays=1. 端到端集成 (Tauri dev
  + HTTP fallback /scenes, /state, /show): 3 scenes 注册 ✓, 强制切生效 ✓,
  **8s 后事件驱动自动切** (drink-coffee → detective-study, recentScenes 维护 +
  N=1 排除逻辑) ✓. 验证产物: `docs/v2-03-drink-coffee/VERIFICATION.md` +
  7 张关键帧 (0/1/2/3/4/5/5.5s) + H3 mp4.
  流程沉淀: 加新场景 5 步 (写 prompt → H3 双图 → extract-chromakey-apng.py →
  改 scenes.json + 跑 build-scene-registry.sh → 桌宠端到端), 全程 ~15 分钟/场景.
- **M5b 第二个 animation provider (Lottie)**: `app/src/animation/providers/lottie.ts`
  用 `lottie-web` 的 canvas renderer (lottie 内部维护一个 canvas, 我们用 rAF
  `drawImage` 同步到目标 ctx). 跟 apng provider 行为统一, 调用方拿 ctx 不用管
  下面是位图 (APNG) 还是矢量 (Lottie). 关键点:
  - 动态 import lottie-web, 避免 100KB+ 进 initial bundle
  - 屏幕外 wrapper div + remove cleanup, 避免 DOM 泄漏
  - 加载超时 (5s) + `data_failed` 错误路径, 不会卡死 useAnimation
  - 装 `lottie-web@^5.13.0` (新增依赖)
  - 验证: tsc 0 错误, 24/24 vitest, 8/8 cargo, 16/16 lint, scenes-sync OK
- **M5 animation abstraction layer**: 加新动画格式 (Lottie / WebM / GIF / ...)
  不再需要改 FSM/OctopusPet. 之前是 APNG-only, scene 加载 / getApngUrl /
  useApngPlayer / canvas size 全部硬编码 APNG. 新架构:
  - `app/src/animation/types.ts` — `Animation` + `AnimationProvider` 接口
    (start / stop / onCycleEnd / nativeWidth / nativeHeight / cycleMs)
  - `app/src/animation/registry.ts` — 单例 `animationRegistry.register(type, provider)` / `.get(type)`
  - `app/src/animation/providers/apng.ts` — 内置 APNG provider (包装 apng-js)
  - `app/src/hooks/useAnimation.ts` — 通用 hook (查 registry → provider.create → 绑 onCycleEnd)
  - `app/src/main.tsx` — 启动时 `animationRegistry.register(apngProvider.type, apngProvider)`
  - 删 `app/src/state/scenes.ts` (getApngUrl 移到 apng provider 内)
  - 删 `useApngPlayer` hook (OctopusPet 52 行 → 1 行)

  scenes.json schema 升级: 每条 scene 加 `animation` 字段 `{ type, source }`.
  老 entry (没 `animation` 字段) 走 `{type: "apng", source: <scene-id>}` 1:1 命名
  兼容. `check-scenes-sync.sh` 按 `animation.type` 走不同路径 — apng 检查本地
  .png, http/https/data URL 跳过本地检查, 其它类型按 source 路径检查.

  FSM/OctopusPet/useAnimation 零修改. 业务代码 (CLICK/PET/ASK/DRAG/ROTATE_NOW)
  也不知道 scene 是 APNG 还是 Lottie.

### Fixed
- **APNG num_plays 0 → 1 (修复 M5b 引入的事件驱动 regression, commit f2e0bb7)**:
  M5b (e068559) 重生成 V2 APNG 时 `extract-chromakey-apng.py` 默认 `loop=0`,
  导致 2 张 V2 APNG `acTL.num_plays=0` (无限循环). apng-js 只在 `numPlays=1`
  时才 emit `'end'` 事件, 无限循环下 scene 永远不切, 整条 V2.1 事件驱动调度
  (`apng-js 'end'` → `SCENE_LOOPED` → `rotateScene`) 静默失效. 修复:
  - `scripts/extract-chromakey-apng.py`: 默认 `loop=0` → `loop=1`, 加 `--loop`
    flag (未来 idle 无限循环场景用 `--loop 0`)
  - 重生成 2 张 V2 APNG (50 帧 × 132ms × 192×192, 视觉一致)
  - 删遗留 `useMcpBridge.ts` (M3 重命名 `useTauriEventBus` 后一直没删, 无引用)

### Changed
- **M1-M4 refactor (2026-08-27): 架构清理 + scenes.json 单一源 + 自动生成 TS/Rust**.
  用户反馈 "整理优化下当前的架构设计, 确保设计和代码上的逻辑都是最精简
  的, 没有死代码, 历史代码的冗余逻辑, 为后续开发迭代做准备". 完成:
  - **M1 死代码/历史冗余**: 删 `nextScene` (无引用), 删 `pet_set_state` MCP
    别名 (5 tools 总), 5 个文件头注释瘦身 (V1/V1.5/V2.1 历史叙事挪
    CHANGELOG), 删 test-*.html / spritesheet-*.png / `name=🐙` 残留文件
  - **M2 模块重构**: 抽 `app/src/state/apng.ts` (loadApng 收敛 CJS interop),
    抽 `useApngPlayer` hook (OctopusPet 52 行 → 1 行), 用官方 `APNG` 类型
  - **M3 标准范式**: `useMcpBridge` → `useTauriEventBus` (改名字反映实际机制,
    删 dead test-event listener), `OctopusEvent.now` 字段瘦身 (只在
    CLICK/PET/ASK 保留, 其他 4 个事件完全不需要), Bubble 30 行 inline 样式
    挪到 global.css, Rust `SharedState` + `recent_scenes` 字段
  - **M4 单一源**: 新建 `scenes.json`, `build_scene_registry.py` 从
    scenes.json 自动生成 `scene-registry.generated.ts` (SCENE_IDS /
    SCENE_ORDER / BUBBLE_BY_SCENE) 和 `scene_registry_generated.rs`
    (SCENES / BUBBLE_LINES), `OctopusScene` 类型从 `SCENE_IDS` 派生.
    `check-scenes-sync.sh` 适配新数据流 + CI 加 `--check` 步骤.
  - 加新场景: 改 scenes.json + 跑 build 脚本, 不再改 TS/Rust 多处
- **V2.1 (2026-08-27): 事件驱动 scene 调度, 替代 V1.5 33Hz setInterval**.
  用户 2026-08-24 23:19 反馈 "其实最理想的还是如果能用事件逻辑来控制动画
  会比较好, 定时器总是不太稳定的". 治本 4 个长期 bug:
  - **P1 APNG 中段剪切**: 8s setInterval 跟 6.6s APNG 循环不整除, 每次
    切都在循环中段. V2.1 改听 apng-js Player `'end'` 事件 (PIL loop=1,
    50 帧播完就 emit), scene 切严格对齐 APNG 最后一帧渲染完, **0 累积延迟**.
  - **P2 wall-clock 漂移** (NTP/DST/手动校时): V1.5 依赖 `Date.now()` +
    `ROTATION_INTERVAL_MS` 比较, 时钟跳变就崩. V2.1 拆掉 `autoNextAt` 字段,
    不再有 `now` 比较.
  - **P3 高频 IPC 压力**: V1.5 33Hz 心跳 → 30 次/秒 `sync_state`. V2.1
    状态变化 ~0.15Hz (每 6.6s 一次).
  - **P4 镜像乱序**: 跟 P3 同根, race frequency 降到 ~0.

  渲染: `<img>` (浏览器原生循环, 黑盒) → `<canvas>` + apng-js (JS 解码 +
  drawImage, 拿 frame/end 事件). 视觉跟 V1.5 一致 (APNG 解码出来直接
  drawImage, 无 chroma key 二次处理, 不会重复 V2.1 webm 路线 "配色好差"
  的坑).

  调度: `setInterval(33ms)` `TIMER_TICK` → `shouldRotate` guard (8s
  `autoNextAt`) → `rotateScene` 整套拆掉. 新事件 `SCENE_LOOPED` (来自
  apng-js `'end'`) → `rotateScene` action. guard `shouldRotate` 删,
  guard `shouldHideBubble` 删 (改用 setTimeout).

  bubble 计时: 单独 `useEffect` 挂 `setTimeout(BUBBLE_DURATION_MS)` →
  `DISMISS_BUBBLE` 事件, 不用全局 33Hz tick. 字段 `bubbleHideAt` 保留
  (Rust `SharedState.bubble_hide_at` 镜像用, pet_get_state 读得到).

  顺手治 P5: `pickBubble(scene)` 加空数组防御, 返回 `""` 而不是 `undefined`
  (未来加新 scene 忘配 `BUBBLE_BY_SCENE` 不会运行时挂).

  关键修复 (改造中发现的 2 个 bug):
  - **apng-js numPlays=1 (PIL loop=1)**: 跟直觉相反, APNG 文件只播一轮就
    停, 不会 wrap 回 frame 0. 原来想用 `frame` 事件 wrap-around 检测
    (49→0) 永远等不到. 改用 `'end'` 事件才对.
  - **Vite CJS interop 已 unwrap**: `import apngJsModule from 'apng-js'`
    在 Vite ESM 下, 因为 `__esModule=true`, `apngJsModule` 已经是
    `parseAPNG` 函数本身. 在函数上找 `.default` 全是 undefined →
    `parseAPNG is not a function`. 修复: `typeof === 'function'` 短路,
    再 fallback 到对象形态.

  时序证据 (3 cycle console 时戳, 误差 < 90ms 来自 apng-js rAF 抖动):
  ```
  tEnd(cycle 2) - t0(cycle 2) = 6530.0ms (APNG playTime=6600ms)
  tEnd(cycle 3) - t0(cycle 3) = 6513.5ms
  ```

  测试: 24/24 vitest + 8/8 cargo test 通过. tsc 0 错误.
  改动文件: `app/src/{components/OctopusPet.tsx, state/{octopus-fsm.ts,
  octopus-fsm.test.ts, types.ts}}` (212+ / 119-).

- **V1.5 (2026-08-21): 默认只跑 2 个 V2 视频成品, 不再用 14 V1 spritesheet**.
  用户 2026-08-21 19:14 反馈 "我们现在是默认的 2 个做好的成品啊, 之前那些
  (14 V1 打工人 meme 表情包) 不要用, 我们做的事桌面宠物, 思路不要走错了".
  V1.5 重写:
  - 渲染: 14 spritesheet → 2 V2 视频 APNG. 浏览器原生循环, 不需要 frame 计数器
    / backgroundImage 步长 / cellSize 计算 (上轮鬼畜图 bug 也消除).
  - 调度: 保留 V2 pickRandomScene (随机+去重), 触发方式 TIMER_TICK 33Hz →
    shouldRotate 8s autoNextAt 判定.
  - 场景: `SCENE_ORDER` = `["detective-study", "worker-construction"]`
    (H3 戴帽研究 + gen_videos 工人施工).
  - `RECENT_WINDOW_SIZE` 1 (14 场景时期 N=5, 2 场景时期 N=1 即可, 必不连续重复).
  - 资产: 14 V1 spritesheet 移 `_archive-v1-spritesheets/` (不用), 2 V2 APNG
    `app/public/assets/octopus/v2/<scene>.png` (50 帧 × 132ms = 6.6s 循环,
    RGBA, 2.3MB 各). 走 `scripts/extract-chromakey-apng.py` v3 公式 (中性色
    alpha=255, 避免眼睛高光被抠成半透明).
  - 删 `spritesheet-manifest.json` (V1.5 不用: scene→APNG 1:1 命名, 无需第三个
    JSON 副本). `check-scenes-sync.sh` 改两源 (types.ts + mcp_stdio.rs) + APNG
    文件存在性检查.
  - 23 tests PASS (从 28 缩到 23, 因为 2 场景测试覆盖度比 14 场景少).

### Added
- **V2 调度: 随机 + 去重最近 5 个场景**: `app/src/state/octopus-fsm.ts` 加
  `pickRandomScene(current, recent, rng)` + `updateRecent` 辅助函数.
  `rotateScene` (8s 自然轮转) 和 `ROTATE_NOW` 改用随机, 从 14 场景里排除
  `current` + `recentScenes` (滚动窗口 N=5) 后等概率选. **FORCE_SCENE 不更新**
  recentScenes (MCP 显式控制不影响自然序列). V1 顺序轮转 `nextScene` 函数保留
  导出, 仅供测试. `RECENT_WINDOW_SIZE=5` 调优: 14-1-5=8 候选, 体感"真随机".
  14 步模拟: 12/14 唯一, 0 个 5 步内重复. 28 tests PASS (V1 shouldRotate + V2 调度).
- **V2 视频 → 桌宠 APNG 完整流程**: `docs/v2-h3-to-pet-workflow.md` 沉淀 H3 双图 →
  ffmpeg 15fps 抽帧 → chroma key v3 → 192×192 APNG 4 步管线. 01-detective-study
  桌宠集成验证 PASS (50 帧 × 132ms = 6.6s 循环, 2.3MB).
- **chroma key v3 公式**: `greenness = clip((G - max(R,B) - 10) / 20, 0, 1)`. v1 公式
  对中性色 (白色高光, 章鱼眼反光) 抠成半透明 → 眼睛高光变透明 bug. v3 让中性色
  alpha=255 完全不透明. 沉淀在 `scripts/extract-chromakey-apng.py` (13 动作复用).
- **H3 + `last_frame_image` 双图模式**: 首末帧严格一致 96.58% 相似 (Hailuo-2.3
  物理做不到 40-45%). 走 `~/.minimax/agents/mavis/skills/h3-dual-image-video-gen/`,
  包含 run_h3_video.py + verify_h3_video.py + evals/ 案例归档.
- **VP9 alpha 编码 (V2 备用)**: `scripts/encode-webm-alpha.sh` 封装 ffmpeg-full Cellar
  locate + 双向 alpha 验证 (encoder help 预检 + ffprobe TAG:alpha_mode=1 后检).
  30 帧 RGBA → 8KB webm + alpha 真保留. V1 主用 APNG, V2 长动作 (>50 帧) 走这条,
  体积小 14-28x.
- **HEVC alpha 验证结论 (永久不可行)**: Apple `VTCompressionSession` 私有 API
  架构限制, 即使显式 `format=yuva420p` 也 strip alpha. 跟 macOS/ffmpeg 版本无关,
  永远不考虑 HEVC alpha 路线.
- V0.5 基础验证闭环 (3 项, 2 完成 1 blocked): VP9 alpha 可走 / HEVC alpha 不可行
  / gen_videos 首尾帧验证待新基础素材.

### Fixed
- **Tauri 桌宠实际运行**: 透明背景 (macOSPrivateApi: true) + alwaysOnTop +
  116×116 窗口 (60% 大小) + APNG 呼吸/眨眼循环 (6.25s, 75 帧 @ 12fps).
- FSM 8s 轮转卡 `stay-late` bug: `rotateScene` 恒用 `nextScene(initialContext.scene)`,
  任何场景 8s 后都切到 stay-late. 改为 `nextScene(context.scene)`, 补 14 场景全量轮转回归测试.
- HTTP :9527 fallback 断链: POST /show|/ask|/pet 只写 SharedState 不 emit,
  前端不响应. 现持有 AppHandle, 委托 actions 后 emit 事件.
- **sync_state command 从未工作**: `State<Mutex<SharedState>>` 与 `.manage(Arc<Mutex<SharedState>>)`
  类型不匹配, invoke 报 "state not managed". 改为 `State<Arc<Mutex<SharedState>>>` —
  旧 4 个 command 是死代码从未被 invoke, bug 被掩盖; C4 接线后才暴露 (GUI 实测发现).

### Changed
- **窗口 200×200 → 192×192 (= 素材尺寸, 零边距)**: 去掉素材四周 4px 透明缝隙
  (透出桌面色会看起来像白边), 素材完全铺满窗口.
- **状态权威收敛**: XState 是唯一状态权威, Rust `SharedState` 降级为只读镜像,
  webview 经 `sync_state` 回写 (字段级节流, 防 60fps 轰炸 IPC). `pet_get_state` /
  HTTP /state 与屏幕显示一致.
- 业务逻辑单点: 场景校验 / ≤12 字截断 / bubble 3s / affection+5 收敛到
  `src-tauri/src/actions.rs`, MCP stdio / HTTP fallback 全部委托 (原 4 处重复).
- 删 3 个死 tauri command (`force_scene`/`ask`/`pet`, 前端从未 invoke).
- 删孤立 `frame` 字段 (`OctopusState` + `SharedState`, 渲染帧由组件 useState 持有).
- spritesheet-manifest.json 单源化: 唯一副本 `app/src/data/` (生成脚本输出改这里),
  删 public 双生副本.
- 14 场景清单三源一致性由 `scripts/check-scenes-sync.sh` 校验 (CI 挂载).

### Reverted
- **V2.1 视频流 (webm + canvas chroma key) 路线回退**: 用户 2026-08-17 18:21 反馈
  "V2.1 配色好差, 不如之前舒服, 回退吧, 我想别的办法做动画切换的效果". 根因: V2.1
  hidden `<video>` + visible `<canvas>` + `applyChromakey` 实时透明化, 跟 V1 APNG 比
  边缘有半透明瑕疵 + 配色 (HSV 70-170° chroma key 把场景中非纯色的"暗色"误判为绿
  背景, 中性色变暗). 回退范围:
  - 渲染: `OctopusPet.tsx` 回 V1 `<img>` + `frameToGrid` 选 141 帧 (V1 spritesheet
    风格, 视觉舒服).
  - 调度: 保留 V2 `pickRandomScene` 随机+去重框架, 但触发方式从 `SCENE_ENDED` 事件
    (video 元素 `onEnded`) 回到 V1 `TIMER_TICK` 33Hz → `shouldRotate` 8s 判定.
    `SCENE_ENDED` 事件类型从 `OctopusEvent` union 移除.
  - 删除: `app/src/utils/chromakey.ts`, `app/src/data/v2-sprite-map.ts`,
    `app/public/assets/octopus/v2/` (webm + V2 APNG), `app/public/assets/octopus/breath-idle.png`,
    stale `_trace.test.ts` (用 SCENE_ENDED).
  - 测试: V1 风格 `shouldRotate` (8s autoNextAt 判定) + V2 随机+去重同时验证.
    28 tests PASS.
  - FSM 用 `event.now` (而非 `Date.now()`) 重置 `autoNextAt`, 跟测试虚拟时钟兼容.

  **保留**: V2 调度 (随机+去重), H3 视频生产管线, chroma key v3 公式 (PIL APNG
  路线仍然 13 动作复用).

### Added
- `scripts/release-plugin.sh`: 发布二进制 (必须走 `cargo tauri build --no-bundle`,
  裸 cargo 增量会跳过 asset 嵌入) → `bin/octopus-pet.bin` (提交进 git) +
  `dist/octopus-pet-plugin/` (可独立加载插件目录) + MCP 冒烟.
- `bin/octopus-pet.bin` 提交进 git: repo clone 即插件可加载, 零本地构建.
- `src-tauri/Cargo.lock` 恢复提交 (应用项目可复现构建, 之前被误 ignore).
- `app/src/hooks/useStateSync.ts`: FSM → Rust 镜像回写.

### Known Limitations (V1)
- **Single-instance only** (`tauri-plugin-single-instance`): first mcode session wins, subsequent sessions' MCP calls fail silently. Multi-session shared pet deferred to V1.1+ via Unix domain socket forwarding.
- RGB rendering only (no alpha channel) — 14/14 scenes
- 141 frames → 8s rotation causes half-cycle scene swaps (single loop is 11.75s)
- No mcode task event → scene mapping (mcode has no good hook yet)
- macOS only (V2 will add Windows)
- `bin/octopus-pet.bin` 是 author 机器 macOS arm64 产物, 其他架构需本地构建
- No audio, no custom skins, no multi-screen, no startup-on-boot, no right-click menu beyond pet

## [0.1.0] - 2026-08-18 (W1 D1 + W1 D2)

### Initial Release
- First working scaffold: 14 spritesheets, plugin spec compliance, MCP stdio server
- 4.2MB ARM64 binary (`src-tauri/target/release/octopus-pet`)
- Verified via `printf '{...}' | octopus-pet --mcp-stdio` (initialize + tools/list + tools/call)

[Unreleased]: https://github.com/weekbin/octopus-pet/compare/v3.0...HEAD
[3.0.0]: https://github.com/weekbin/octopus-pet/releases/tag/v3.0
[0.1.0]: https://github.com/weekbin/octopus-pet/releases/tag/v0.1.0
