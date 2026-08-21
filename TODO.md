# TODO — octopus-pet V1.1 / V2.0 升级路径

> 计划文档。每完成一条 TODO，把 `- [ ]` 改成 `- [x]` + commit 时附上产出物。
> 阶段顺序：V0.5 (生产管线验证) → V1.1 (跨平台) → V2.0 (绿幕 + 动作池) → V3.0 (漫游)
> 完成时间：2026-08-21 起，按依赖顺序逐步推进。

---

## 当前状态（2026-08-21 10:47）

- **V1.0**（W1 D3）✅ macOS 桌宠已跑通：透明背景 + alwaysOnTop + APNG 眨眼循环 + MCP 6 工具
- **V0.5 基础验证**：✅ 闭环（V0.5-1 VP9 alpha 走通 + 脚本就位 / V0.5-2 HEVC alpha 永久不可行 / V0.5-3 等用户新基础素材）
- **V2.0 路线就位**：
  - 保留 Tauri 2 + macOS 架构，**不学 dsh-pet 浏览器半侧**（双缓冲/朝向/落地对齐等）
  - V1.1 解锁跨平台（macOS 验证过，Windows/Linux 待测）
  - V2.0 升级素材生产（黑底→绿幕 HSV 抠像）+ 调度（顺序轮转→动作池概率链+去重）
  - 关键洞察：动画连贯的**真因 = 首尾帧完全相同**（标准图 single source of truth）
  - V2 输出格式：**APNG 主用 (V1 验证) + WebM VP9 alpha 可选 (>50 帧压缩比优 14-28x)**
- **工具链就位**：
  - `scripts/encode-webm-alpha.sh` (commit ad31688) — 封装 ffmpeg-full Cellar locate + 双向 alpha 验证
  - `scripts/spritesheet-builder.sh` (W1 D1) — 14 场景 spritesheet
  - `docs/breath-pipeline.md` — 5 步 APNG + Step 5b WebM VP9 alpha 完整文档
- **运行时**：macOS 桌宠进程在跑（PID 85515 octopus-pet）

---

## ✅ V0.5 — 基础验证（已完成 2026-08-21）

> 闭环：3 项任务, 2 项完成, 1 项 blocked.

- [x] **V0.5-1** ✅ 验证 macOS ffmpeg VP9 alpha 编码 → ⚠️ **可走,需要 ffmpeg-full**
  - commit: c63bff5 + ad31688
  - 路径: `brew install ffmpeg-full` (keg-only, 47 deps, 9.0.1)
  - **重要陷阱**: Homebrew standard ffmpeg (`brew install ffmpeg`) 的 `ffmpeg -codecs` 不显示 `vp9_alpha` 标志,误导性失败. 真相在 encoder help (`-h encoder=libvpx-vp9` → `yuva420p yuva422p yuva444p gbrap` 都在)
  - **验证 alpha 真的被编码进 webm**: `ffprobe -show_streams` 看 `TAG:alpha_mode=1` (这个 tag 默认 probe 不显示, 必须 -show_streams)
  - 实测: testsrc2 + libvpx-vp9 4 秒 webm = 97KB (vs no-alpha 47KB, 合理)
  - 实测: char-A-black.png (1.2MB 单帧 RGBA) → char-test.webm 56KB + alpha_mode=1 ✅
  - 接入: `scripts/encode-webm-alpha.sh` 自动 locate Cellar, 不依赖 PATH
  - V2 路线: **APNG (V1 验证) + VP9 (V2 可选)** 两条路, APNG 主用, VP9 用于高帧数 (>50 帧) 减少体积

- [x] **V0.5-2** ~~验证 macOS hevc_videotoolbox alpha 编码~~ → ❌ **完全不可行 (Apple 架构限制)**
  - 结果: 即使显式 `-vf format=yuva420p`, 输出仍 `pix_fmt yuv420p` (alpha 丢失).
  - 根因: `VTCompressionSession` Apple 私有 API 只接受 NV12/YUV420P 作为 encoder input, 内部 strip alpha. 不是 ffmpeg 问题, 跟 macOS 版本/ffmpeg 版本/硬件都无关.
  - 后续: 永远不可行. Apple 战略上把 alpha 只放在 ProRes 4444 / ProRes 4444 XQ, 不开给 HEVC consumer codec.

- [x] **V0.5-3** ✅ 验证 mavis `gen_videos` 首尾帧一致性 → **PASS (96.65% 相似)**
  - 资产: `art/baseline-character/v10-D.png` 作 first_frame (V2.1 标准图, 3/4 视角干净版)
  - commit: ee3af62 (V2.1 standard-char-1x1.png + remove-hat-greenscreen.py) + V10 ref
  - 命令: `connector__matrix__gen_videos` with `reference_type=first_frame` + prompt "static character, only subtle eye blink"
  - 验收: 6s 视频抽 0s 和 5.5s 帧对比
    - Mean diff: 5.90 (低)
    - Similarity (diff < 30): **96.65%** ✅
    - 大幅变化像素 (diff > 100): 1.9% (微小差异 = 眨眼状态/触手微动)
    - 视觉评估: 0s 跟 5.5s 几乎一样 ✅
  - **重要发现** ⚠️: gen_videos 把 input 的 3D Pixar 风**渲染成了 2D 卡通风** (更圆润更可爱), style 跟 v10-D 有差异. V2 用途影响:
    - ✅ 用作 animation 起点 (96.65% 一致性足够)
    - ⚠️ 若要保留 3D Pixar style, 需换 gen_videos 模型 (H3 vs Hailuo-2.3) 或换 V0.5-3 prompt 强化 style
  - 产物: `docs/v053-validation/` (v053-test.mp4 + frame_0s.png + frame_55s.png)
  - 限制: `gen_videos` 一次只接受一个 `input_image` (first_frame OR last_frame, 不能同时), 所以严格意义上"first_frame=last_frame"约束只能通过**同一图作 first_frame + prompt 强制静态**间接实现. 真的需要 first+last frame 同时指定需用 `submit_video_generation` (H3, async) 或等后续工具更新.

---

## V1.1 — 跨平台解锁（V1 验证）

> 目标：把"macOS only"标签拿掉，证明代码本身支持 3 平台。AGENTS.md 改"已知限制"段。

- [ ] **V1.1-1** Windows 打包验证
  - 依赖：V0.5-1（VP9 alpha）、Windows 机器 + Rust toolchain
  - 命令（Windows 上）：`cd src-tauri && cargo tauri build`
  - 验收：`.msi` / `.exe` 产出 + 透明背景 + APNG 播放 + click 气泡
  - 已知坑：WebView2 旧版（< 96.0.1054.0 = Win10 1809 之前）APNG 看着黑底
  - 预计：跨平台首次构建 1-2 小时

- [ ] **V1.1-2** Linux 打包验证
  - 依赖：V0.5-1、Linux 机器 + `libwebkit2gtk-4.1-dev`
  - 命令（Linux 上）：`cargo tauri build`
  - 验收：`.AppImage` / `.deb` 产出 + 透明背景
  - 预计：跨平台首次构建 1-2 小时

- [ ] **V1.1-3** 修 AGENTS.md "V1 macOS only" 限制
  - 依赖：V1.1-1 + V1.1-2 成功
  - 改：删除 "macOS only — V1 不支持 Windows / Linux" 这条
  - 加：跨平台踩坑笔记（WebView2 旧版 / Linux GTK 依赖）
  - 预计：5 分钟

---

## V2.0 — 绿幕生产 + 动作池概率链（核心升级）

> 目标：素材生产失误率从"黑底 + 调阈值"降到"绿幕 + HSV 抠像标准化"。调度从"顺序轮转"升级"动作池概率链 + 去重"。

### V2.1 — 标准图（single source of truth）

- [ ] **V2.1-1** 制作 1:1 标准图（1920×1920，纯绿幕）
  - 工具：mavis `image_synthesize`
  - Prompt 关键：3D 珊瑚粉章鱼 + 全睁大眼+星形高光+灿烂笑 + 标准站立 + 正面 + **纯绿幕 #00FF00** + 1:1
  - 产物：`art/octopus-frames/standard-char-1x1.png`
  - 预计：10 分钟（跑 2-3 次挑最佳）

- [ ] **V2.1-2** 制作 16:9 标准图（1920×1080，纯绿幕）
  - Prompt 同上但 16:9
  - 产物：`art/octopus-frames/standard-char-16x9.png`
  - 预计：10 分钟

- [ ] **V2.1-3** 文档化标准图在素材链中的角色
  - 文件：`docs/breath-pipeline.md` 加一节"标准图"
  - 内容：标准图定义 + 后续所有动作必须首尾帧=标准图
  - 预计：10 分钟

### V2.2 — 绿幕生产管线（学 dsh-pet，4 步脚本）

- [x] **V2.2-1** ✅ 写 `scripts/extract-chromakey-apng.py`（chroma key v3 + APNG 一键）
  - 落地日期: 2026-08-21 (W1 D5, 01-detective-study 验证 PASS)
  - 公式: `greenness = clip((G - max(R,B) - 10) / 20, 0, 1)` (v1 公式对中性色高光抠成半透明 → v3 修复)
  - 流程: ffmpeg 抽帧 (15fps) → resize 192×192 → chroma key v3 → APNG 50 帧 × 132ms = 6.6s
  - 文档: `docs/v2-h3-to-pet-workflow.md` (4 步完整流程, 13 动作复用指南)
  - 已知限制: H3 绿幕反射进眼镜片 (V2.1 待修, 改 prompt 加 "no green tint reflection in eyes")

- [ ] **V2.2-2** 写 `scripts/normalize_2160x1215.py`（归一化 + 脚底 y 固定）
  - 函数：归一化到 2160×1215，脚底固定在 y = 1215×0.85 = 1033
  - 水平居中用**非透明像素 x 中位数**（dsh-pet 经验：手/扩展物不会带偏 bbox 中心）
  - 预计：30 分钟

- [ ] **V2.2-3** ~~写 `scripts/encode_webm_alpha.py`~~ → ❌ **已由 `scripts/encode-webm-alpha.sh` 覆盖 (commit ad31688)**
  - 该任务删除. 现有 shell 脚本封装了 ffmpeg-full locate + 双向 alpha 验证, V2.2 绿幕管线直接调用即可.
  - 调用方式: `bash scripts/encode-webm-alpha.sh --input <frame_dir> --output <file.webm> --framerate 12 --bitrate 300k`
  - 不需要 .py 包装 (shell 已足, ffmpeg 参数在 shell 里更直接可调).

- [ ] **V2.2-4** 端到端跑通 1 个动作（"待机呼吸"）的完整管线
  - 依赖：V2.2-1 ~ V2.2-3
  - 流程：标图 → `gen_videos` **6s 绿幕视频** (Hailuo-2.3 默认) → chroma 抠像 → normalize 归一化 → encode HEVC alpha
  - **V2 时长决策 (2026-08-21)**: 用 `gen_videos` 工具默认 6s + Hailuo-2.3, 不用 H3 (贵), 不用 10s
  - 验收：输出的 webm 透明背景 + 角色稳定 + 脚底对齐
  - 预计：1 小时 (跟 V0.5-3 验证同流程, 6s 数据已验证 96.65% 相似)
  - 预计：1 小时

- [ ] **V2.2-5** 批量生产 14 个动作（覆盖当前 14 scene）
  - 依赖：V2.2-4
  - 动作清单（从 `app/src/state/types.ts` SCENE_ORDER 派生）：
    1. pretend-busy (假装忙)
    2. stay-late (熬夜)
    3. breakdown (裂开)
    4. lying-flat (摆烂)
    5. multi-tasking (多线程)
    6. payday (发工资)
    7. salary-rejected (工资被拒)
    8. treat-milk-tea (奶茶)
    9. friday-5pm (周五下班)
    10. toilet-slacking (摸鱼)
    11. touch-fish (摸鱼)
    12. waiting-m3pro (等新电脑)
    13. soul-leaving (灵魂出窍)
    14. multitask (三线程)
  - 每动作 **6s 绿幕视频** → 1 个 webm
  - 工具: `gen_videos` 同步 (Hailuo-2.3 默认) — 不用 H3 (贵, account credits)
  - 预计：3-4 小时（每动作 2-3 分钟 × 14 = 30 分钟 + 处理时间）

- [ ] **V2.2-6** 写 `prompts/octopus-greenscreen-prompt.md` 模板
  - 内容：通用绿幕 prompt 模板，强调"首尾帧 = 标准图"
  - 用法：跑新动作时填这个模板
  - 预计：15 分钟

### V2.3 — 动作池概率链 FSM（V1 FSM 改造）

> 目标：场景从"顺序轮转"改"动作池概率链 + 强制去重"。
> 不学 dsh-pet 浏览器侧双缓冲，**保持 Tauri + APNG**。

- [ ] **V2.3-1** FSM 改造方案（伪代码 + XState v5 设计）
  - 依赖：V2.2-4（确认 V2 资源可生产）
  - 核心改造：
    - 移除 `TIMER_TICK` 驱动轮转
    - 改成"动画播完"事件驱动 `pickNext()`
    - `pickNext()` 概率：30% idle / 10% 转向 / 40% 动作 / 20% 移动
    - **强制去重**：上次播放的动作从池中排除
    - 交互打断：CLICK → 3 种 click 动画 / DRAG → 拖拽动画 / 播完回 idle
  - 预计：2 小时（设计 + 草稿）

- [ ] **V2.3-2** 改造 `app/src/state/octopus-fsm.ts`
  - 依赖：V2.3-1 设计
  - 改：移除 timer 逻辑，加 `pickNext` action + 去重 set
  - 预计：2 小时

- [ ] **V2.3-3** 改造 `app/src/components/OctopusPet.tsx`
  - 依赖：V2.3-2
  - 改：根据 FSM 状态切换不同 webm 资源（idle / 各动作 / click 回应）
  - 预计：2 小时

- [ ] **V2.3-4** 更新 `app/src/data/spritesheet-manifest.json` → `animation-manifest.json`
  - 依赖：V2.2-5（14 个动作 webm）
  - 改：从单一 spritesheet 改成 14 个独立 webm 资源
  - 预计：1 小时

- [ ] **V2.3-5** FSM 测试更新 `app/src/state/octopus-fsm.test.ts`
  - 依赖：V2.3-2
  - 加测试：pickNext 去重、概率分布、交互打断路径
  - 预计：1 小时

### V2.4 — 集成验证

- [ ] **V2.4-1** Tauri 桌宠实际跑 14 个动作（macOS）
  - 依赖：V2.3-3 + V2.3-4
  - 验收：点击章鱼 → 切换到不同动作 webm + 透明背景 + 14 个动作全部能播放
  - 预计：30 分钟

- [ ] **V2.4-2** MCP 工具调用 pet_set_state 切换动作
  - 依赖：V2.4-1
  - 验收：通过 mcode `pet_set_state scene="breakdown"` 章鱼切到裂开动作
  - 预计：15 分钟

---

## V3.0 — 屏幕漫游（可选）

> V3.0 才做。V2.0 稳了再考虑。
> 屏漫游需要修 OctopusPet.tsx 加 rAF + 位置同步，但**不是 dsh-pet 那种全屏漫游**（桌宠只在屏幕一角）。

- [ ] **V3.0-1** 章鱼固定位置 + 轻微浮动（不漫游）
  - 章鱼在屏幕右下角固定
  - 8s 周期内 ±2px 垂直浮动（"呼吸"视觉）
  - 预计：30 分钟

---

## 验证清单（V2.0 完成时必跑）

- [ ] V2.0 14 个动作 webm 全部能正常播放（无黑边、无白边）
- [ ] 闪烁和漂移测试：每动作首尾帧对比 95%+ 相似
- [ ] 概率分布：跑 1000 次 pickNext，30% idle / 10% 转向 / 40% 动作 / 20% 移动
- [ ] 强制去重：连续 100 次 pickNext，无连续重复
- [ ] MCP 6 工具都能调用（pet_show / pet_ask / pet_get_state / pet_set_state / pet_pet / pet_list_states）
- [ ] 8 客户端配置（mcode / Cursor / Claude Code / VS Code / Codex / Kiro / Antigravity / Gemini CLI）至少 1 个能跑通

---

## 关键参考文档

- **AGENTS.md** — 协作规则 + 14 scene 清单 + 脚本入口
- **docs/breath-pipeline.md** — 现有黑底生产流程（V2.2 完成后扩展绿幕）
- **docs/refactor-plan-2026-08-18.md** — V1 重构历史
- **README.md** — V1 用户文档（V2.0 完成后重写）
- **CHANGELOG.md** — Keep a Changelog 1.1.0 格式

---

## 风险与备选方案

| 风险 | 触发条件 | 备选方案 |
|---|---|---|
| gen_videos 强制首尾帧失败 | V0.5-3 验证发现帧差异 >5% | prompt 拆成两段（0-2s 走 X 动作 / 8-10s 走回标准），manual 拼接 |
| HSV 抠像误伤角色色 | 14 个动作中某动作有大量绿色衣服 | 该动作单独 prompt 改"白幕/蓝幕" + 对应 HSV 范围 |
| Tauri 2 跨平台打包失败 | V1.1-1 / V1.1-2 编译报错 | 单独 Tauri 配置分支（windows / linux 子配置）|
| VP9 alpha 编码失败 (V2 长动作) | ffmpeg-full 9.x 装不上 / libvpx alpha runtime missing | 回退到 APNG (Pillow, V1 验证, 100% 可靠). APNG 没体积优势但全 webview 通用 |
| HEVC alpha 编码 | (已验证, 2026-08-21) | ❌ **永久不可行 (Apple VTCompressionSession 架构限制), 不再考虑** |

---

## 时间预算

| 阶段 | 任务数 | 预计总工时 |
|---|---|---|
| V0.5 基础验证 | 3 | 15 分钟 |
| V1.1 跨平台 | 3 | 1-2 天（含测试）|
| V2.1 标准图 | 3 | 1 小时 |
| V2.2 绿幕管线 | 6 | 5-6 小时 |
| V2.3 动作池 FSM | 5 | 8-9 小时 |
| V2.4 集成验证 | 2 | 1 小时 |
| V3.0 屏幕漫游 | 1 | 30 分钟（可选）|
| **合计** | **24 任务** | **2-3 天**（V3.0 可选）|

---

## 立即下一步

**🚧 V0.5-3 BLOCKED — 等待用户提供新基础素材**

V0.5 全部 2/3 任务已完成 (commit c63bff5 + ad31688). 唯一剩 V0.5-3 需要:
1. 用户明确新基础素材的**角色 + 工具 + 时间**
2. 然后跑 gen_videos first_frame=last_frame 验证 (5 分钟)
3. 通过后跳 V2.1 标准图制作

如果你想跳过 V0.5-3 直接开新工作 (V1.1 跨平台 / V2.3 动作池 FSM), 告诉我也行, V0.5-3 保持 blocked 不影响其他路径.
