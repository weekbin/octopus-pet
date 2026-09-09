# TODO — octopus-pet V2.1+

> 计划文档。每完成一条 TODO，把 `- [ ]` 改成 `- [x]` + commit 时附上产出物。
> 当前状态: V2.1 (2026-08-27) 事件驱动调度 + M1-M5b refactor 已完成. 默认 2 V2 场景.
> 完成时间: 2026-09-09 更新, 按依赖顺序逐步推进.

---

## 当前状态 (2026-09-09 01:09)

- **V2.1** (2026-08-27) ✅ 事件驱动 scene 调度 (apng-js `'end'` → `SCENE_LOOPED` → FSM `rotateScene`)
  - 治本 4 个长期 bug: P1 APNG 中段剪切 / P2 wall-clock 漂移 / P3 高频 IPC / P4 镜像乱序
  - 渲染: `<img>` 浏览器原生循环 → `<canvas>` + apng-js (拿 frame/end 事件)
  - 调度: setInterval(33ms) + TIMER_TICK → SCENE_LOOPED 事件 (0 累积延迟)
  - 3 场景默认 (detective-study / worker-construction / **drink-coffee 2026-09-09 fef8017**), 14 V1 spritesheet 表情包移到 archive
  - 24/24 vitest + 8/8 cargo + 16/16 lint + scenes-sync OK + tsc 0 错误
- **M1-M4 refactor** (2026-08-27) ✅ 架构清理 + scenes.json 单一源 + 自动生成 TS/Rust
  - M1 死代码 (nextScene / 5 tools / 头注释瘦身 / test-*.html / spritesheet-*.png)
  - M2 模块重构 (apng.ts / useApngPlayer hook / 官方 APNG 类型)
  - M3 标准范式 (useMcpBridge → useTauriEventBus / OctopusEvent.now 瘦身 / Bubble CSS / Rust SharedState)
  - M4 scenes.json 单一源 (build_scene_registry.py + check-scenes-sync.sh + CI)
- **M5 animation abstraction** (2026-08-27) ✅ Animation / AnimationProvider 接口 + registry + apng provider
- **M5b Lottie provider** (2026-08-27) ✅ 第二个 provider (lottie-web canvas renderer), 证明换格式业务代码零修改
- **M5b regression fix** (2026-09-09 commit f2e0bb7) ✅ APNG num_plays 0 → 1, 删遗留 useMcpBridge.ts
- **P0-2 端到端跑 Tauri 桌宠** (2026-09-09 fef8017) ✅ HTTP fallback 验证 3 scenes 切换 + 事件驱动 6.6s 自切
- **chroma key v3 → v4.7 (8 步演进, 2026-09-09 commits 7b09fd3 / 2dc3428 / ab1ddcd / 8a2ca87 / 2e59875 / f18a3c7 / 27d9c74 / 06c70dc / current)** ✅ 沉淀到 `extract-chromakey-apng.py` 默认:
  - v3 → v4: 相对绿度公式修"白底偏绿被抠成半透" (眼白下边缘"高亮透明")
  - v4 → v4.1: + 深色阴影保护修 H3 在脸颊/触手上渲染的深绿反射被误扣 → 桌宠身体"白色斑块"
  - v4.1 → v4.2: 阈值收紧 + 中绿保护 + alpha 羽化, 修 H3"绿黄残留" (RGB 155,188,75) + 192→116 resize 边缘锯齿
  - v4.2 → v4.3: + cv2.inpaint (Telea r=5) 修 partial + 透明区域 RGB → 修"绿色描边" (H3 边缘"绿+粉"混合色, partial 像素 100% 绿偏)
  - v4.3 → v4.4: v4.1 保护加严 `(max<80) AND (g_max_rb<20)` 区分真阴影 vs 绿反射, mask 扩展到 alpha=255 绿偏不透明像素 → 修"绿色阴影" (深绿反射 28214 个被 v4.4 排除保护)
  - v4.4 → v4.5: mask 6px 膨胀 (kernel 3x3, iterations=2) + radius=4 → 修"绿调反射高光" (H3 帽子/放大镜 RGB ~150,130,60 或 145,147,23, 视觉像绿调). 50 帧总和: detective-study -81px, worker-construction -690px, drink-coffee 持平
  - v4.5 → v4.5.1: mask 拆成 2 步独立 inpaint — partial+透明 (Telea r=5, 不膨胀) 保留眼睛清晰度 + green_opaque 单独 6px 膨胀 (Telea r=4) 修身体/帽子绿调反射. 眼睛 v4.4 锐利恢复, 帽子/放大镜绿调反射仍消除
  - v4.5.1 → v4.6: alpha 激进收紧 (alpha < 80 → 0, > 175 → 255) + partial mask 1px 膨胀 + inpaint radius 5→8 → 治本 v4.5.1 残余 4 类 (眼睛半透 / 身体边缘绿阴影 / 物品周围绿阴影 / 切换绿残影). partial 6000 → 4600 -24-28%, alpha 羽化后低 alpha < 30 重新归 0
  - v4.6 → v4.7: + green_tinted_white mask (`alpha=255 + R>200 + R+G+B>600 + G>B+5` 检测"白色像素 G 偏色") + 单独 inpaint r=3 → 治本"眼白发黄/发绿". drink-coffee 眼周 225 白色像素 70% G 偏色 (R=240 G=153 B=131) → 治本后 0 像素
  - 3 场景 v4.7 APNG 重建 (current) + 桌宠视觉验证 PASS: 完全无绿色描边/阴影/反射, 侦探帽纯净棕色, 放大镜玻璃反射消除, 黄色施工帽边缘绿调消除, 眼睛清晰锐利 + 真正纯白, 切换时无绿残影
- **cargo test 预期值同步** (current) ✅: 修 mcp_roundtrip.rs::list_states_returns_2_v2_scenes 期望 2→3 (drink-coffee 加项遗漏), 8/8 cargo tests 绿
- **运行时**: 桌宠进程按需启动 (cargo tauri dev), 3 V2 APNG ready (drink-coffee 99.91% 相似度, 本批最佳)

---

## ✅ V0.5 — 基础验证 (已完成 2026-08-21)

- [x] **V0.5-1** ✅ 验证 macOS ffmpeg VP9 alpha 编码 → 可走, 需要 ffmpeg-full
- [x] **V0.5-2** ~~验证 macOS hevc_videotoolbox alpha 编码~~ → ❌ 永久不可行 (Apple VTCompressionSession 架构限制)
- [x] **V0.5-3** ✅ 验证 mavis gen_videos 首尾帧一致性 → PASS (96.65% 相似)

---

## ✅ V1.5 — 14 V1 spritesheet 废弃, 默认 2 V2 视频成品 (已完成 2026-08-21)

> 用户 2026-08-21 19:14 反馈 "我们现在是默认的 2 个做好的成品啊, 之前那些 (14 V1 打工人 meme
> 表情包) 不要用, 我们做的事桌面宠物, 思路不要走错了". 删 spritesheet-manifest, 14 sprite 移
> archive, 渲染走浏览器原生 `<img>` 循环 (后来 V2.1 改 `<canvas>` + apng-js 拿事件).

---

## ✅ V2.1 — 事件驱动 scene 调度 (已完成 2026-08-27)

> 用户 2026-08-24 反馈 "其实最理想的还是如果能用事件逻辑来控制动画会比较好, 定时器总是不太
> 稳定的". 治本 4 个长期 bug. 详见 CHANGELOG.md Unreleased 段.

---

## ✅ M1-M5b — 架构 refactor + animation abstraction (已完成 2026-08-27)

- [x] **M1** 死代码/历史冗余清理
- [x] **M2** 模块重构 (apng.ts / useApngPlayer hook)
- [x] **M3** 标准范式 (useMcpBridge → useTauriEventBus, M5b commit f2e0bb7 补删遗留文件)
- [x] **M4** scenes.json 单一源 + 自动生成 TS/Rust
- [x] **M5** animation abstraction layer (Animation / AnimationProvider / registry)
- [x] **M5b** 第二个 provider (Lottie) — 证明换格式业务代码零修改

---

## 🛠️ P0 — 必须做 (CI 防御 + 已知回归)

> 这些是"应该做但还没排期"的事, 优先级高于新功能.

- [ ] **P0-1** CI 校验 V2 APNG `num_plays=1`
  - 根因: M5b (e068559) 重生成 V2 APNG 时脚本默认 `loop=0` 导致回归, scene 永远不切.
    修复后 (f2e0bb7) 没人再查这个 invariant, 下次还会踩.
  - 解决: `scripts/check-apng-loop.sh` 用 `python3 + struct` 解 acTL, 校验
    `app/public/assets/octopus/v2/*.png` num_plays=1. 接入 CI (`lint-octopus-plugin.sh`
    链尾 或 `check-scenes-sync.sh` 内). AGENTS.md V2.1 章节也明文约束.
  - 预计: 20 分钟
- [x] **P0-2** 跑通 Tauri 桌宠实际启动 + scene 切验证 (M5b 后第一次端到端) ✅ 2026-09-09 fef8017
  - 根因: M5b 是 architecture demo (commit message 明确), 没真起桌宠看 scene 切.
    跟 f2e0bb7 (num_plays 修复) 一起, 桌宠从未实际跑过.
  - 验证步骤: `npm --prefix app run tauri:dev` + HTTP fallback 验证 /scenes /state /show.
    不切 → 排查 apng-js 'end' 是否绑成功. 切但视觉差 → 排查 APNG 解码.
  - 实测: drink-coffee 强制切生效, 8s 后事件驱动自动切到 detective-study, recentScenes 维护 OK.
  - 视觉验证受限: mcode 全屏 UI 占屏, screencapture 截到空白 PNG (5.8KB). 窗口 bounds [100,100,116,116] 存在
    (CGWindowList optionAll 查到), HTTP /state 数据正常. 视觉验证需要用户手动看.
  - 预计: 15 分钟
- [ ] **P0-3** scenes.json 加一个真 Lottie 场景 (M5b 演示落地)
  - 根因: M5b 装了 lottie-web 但 scenes.json 3 条还是 apng (2026-09-09 drink-coffee
    仍是 APNG, Lottie 仍未落地). architecture 证明完了, 但 production 没用到, 价值没兑现.
  - 加场景步骤: lottiefiles.com 找 1 个章鱼/海洋主题 free Lottie JSON →
    `scenes.json` 加 entry `{"id": "x", "animation": {"type": "lottie", "source":
    "<url>"}, "bubbleLines": [...]}` → 跑 `build-scene-registry.sh` → 桌宠实际起
    验证渲染. 跟 P0-2 一起做.
  - 预计: 30 分钟 (含找素材)

---

## V1.1 — 跨平台解锁 (V1 验证, 挂 2 周没动)

> 目标: 拿掉 "macOS only" 标签, 证明代码本身支持 3 平台. 已知坑: WebView2 旧版 APNG 黑底.

- [ ] **V1.1-1** Windows 打包验证 (Windows 机器 + Rust toolchain)
  - 命令: `cd src-tauri && cargo tauri build`
  - 验收: `.msi` / `.exe` 产出 + 透明背景 + APNG 播放 + click 气泡
  - 已知坑: WebView2 旧版 (< 96.0.1054.0 = Win10 1809 之前) APNG 黑底
  - 预计: 1-2 小时
- [ ] **V1.1-2** Linux 打包验证 (`libwebkit2gtk-4.1-dev`)
  - 命令: `cargo tauri build` (Linux 上)
  - 验收: `.AppImage` / `.deb` 产出 + 透明背景
  - 预计: 1-2 小时
- [ ] **V1.1-3** 改 AGENTS.md "V1 macOS only" 限制
  - 删 "macOS only" 条, 加跨平台踩坑笔记 (WebView2 旧版 / Linux GTK 依赖)
  - 预计: 5 分钟

---

## V3.0 — 屏幕漫游 (可选, V2 稳了再考虑)

- [ ] **V3.0-1** 章鱼固定位置 + 轻微浮动 (不漫游)
  - 章鱼屏幕右下角固定, 8s 周期内 ±2px 垂直浮动 ("呼吸" 视觉)
  - 预计: 30 分钟

---

## 验证清单 (新场景/新动画格式时必跑)

- [ ] V2.x APNG 实际跑通 (透明背景 + 50 帧 × 132ms 循环 + event-driven 切 scene)
- [ ] 闪烁和漂移测试: 每 scene 首尾帧对比 95%+ 相似
- [ ] MCP 6 工具都能调用 (pet_show / pet_ask / pet_get_state / pet_set_state / pet_pet / pet_list_states)
- [ ] 8 客户端配置 (mcode / Cursor / Claude Code / VS Code / Codex / Kiro / Antigravity / Gemini CLI) 至少 1 个能跑通
- [ ] 16/16 lint + 24/24 vitest + 8/8 cargo + scenes-sync OK + tsc 0 错误

---

## 关键参考文档

- **AGENTS.md** — 协作规则 + 2 scene 清单 + 脚本入口 + V2.1 事件驱动 spec + M5 架构
- **CHANGELOG.md** — Keep a Changelog 1.1.0 格式, M1-M5b + V2.1 都在 Unreleased 段
- **README.md** — 用户向 (插件安装 + 6 工具 + 8 客户端配置)
- **docs/breath-pipeline.md** — 现有黑底生产流程 (历史)
- **docs/v2-h3-to-pet-workflow.md** — H3 / gen_videos → APNG 4 步管线
- **scenes.json** — 场景元数据单一源 (改完跑 `build-scene-registry.sh`)

---

## 风险与备选方案 (2026-09-09 刷新)

| 风险 | 当前状态 | 触发条件 | 备选方案 |
|---|---|---|---|
| APNG num_plays 错 (无限循环) | 修复 (f2e0bb7) 但无 CI 校验 | 任何人重跑 `extract-chromakey-apng.py` 不带 `--loop 1` | P0-1 加 CI 校验 acTL num_plays; 文档化 `--loop` 必传 |
| Lottie 加载失败 (网络/CDN) | 无错误处理兜底 | 公开 Lottie URL 404 / CORS / 超时 | provider 已有 5s 超时 + `data_failed` 错误路径; 加场景本地化 (下载到 `public/`) |
| Tauri 2 跨平台打包失败 | 未验证 (V1.1 挂 2 周) | Win/Linux 编译报错 | 单独 tauri config 分支 (windows / linux 子配置); 走 webview 通用特性 (canvas + APNG) 避免平台独有 API |
| VP9 alpha 编码失败 (V2 长动作备用) | 已验证 (V0.5-1) | ffmpeg-full 9.x 装不上 / libvpx alpha runtime missing | 回退 APNG (Pillow, V1 验证, 100% 可靠). APNG 没体积优势但全 webview 通用 |
| HEVC alpha 编码 | (V0.5-2 已验证, 永久不可行) | — | ❌ 永远不考虑, Apple VTCompressionSession 架构限制, 跟 macOS 版本无关 |
| gen_videos 风格不一致 (2D 卡通 vs 3D Pixar) | V0.5-3 验证已知 | 跑新动作时 2D 卡通风跟 v10-D 3D Pixar 不一致 | prompt 强化 "3D Pixar style"; 或换 gen_videos 模型 (H3 vs Hailuo-2.3) |
| H3 绿幕反射进眼镜片 | V2.1 待修 (V0.5-3 验证已知) | H3 戴眼镜的动作 | 改 prompt 加 "no green tint reflection in eyes"; 当前 01-detective-study 接受 |
| scenes.json 跟 TS/Rust 不一致 | check-scenes-sync.sh 防御 | 改 scenes.json 忘跑 build_scene_registry.py | CI 挂载 (已就位); lint 错就 fail PR |
| M5b 类似的 provider 重构回归 | 暂无防御 | 加新 provider 时改 animation/types.ts 破坏 ABI | types.ts 改前 grep 全 project 引用, commit message 必列迁移步骤 |
| bin/octopus-pet.bin 提交遗漏 | 文档有规则, 手动操作 | release-plugin.sh 跑完忘 git add bin/octopus-pet.bin | CI 校验 bin 存在 + 跟 main commit hash 对得上 |

---

## 时间预算 (剩余)

| 阶段 | 任务数 | 预计总工时 |
|---|---|---|
| P0 必做 (CI 防御 + 验证) | 3 | 1 小时 |
| V1.1 跨平台 | 3 | 1-2 天 (含测试) |
| V3.0 屏幕漫游 (可选) | 1 | 30 分钟 |

---

## 立即下一步 (P0)

1. **P0-1** CI 校验 V2 APNG num_plays=1 (20 分钟) — 防同类回归
2. ~~**P0-2** 端到端跑 Tauri 桌宠, screencapture 验证 scene 切 (15 分钟)~~ ✅ 2026-09-09 fef8017
3. **P0-3** scenes.json 加 1 个真 Lottie 场景 (30 分钟, 唯一 P0 遗留)

完成 P0 后再决定 V1.1 (跨平台) 还是 V3.0 (漫游) 还是别的方向.
