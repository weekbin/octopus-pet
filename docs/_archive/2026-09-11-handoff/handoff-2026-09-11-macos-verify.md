# Handoff 2026-09-11: macOS 验证 Linux 治标是否污染 V2.3 主线

> **目的**: NUC (Ubuntu 24.04 + Wayland) 桌宠显示治本探索 5 个 commit 之后, 验 macOS 路径没被污染.
> **执行方**: weekbin @ macOS 电脑
> **预期耗时**: 15 分钟 (启动 + 8 场景轮转一次 = 1 分钟; 全部手测 = 10 分钟; 报告 = 5 分钟)
> **决策点**: macOS OK → V2.3 主线干净, W3 单独评估 GTK cairo 治本. macOS 不 OK → 回滚 5 commit, 治本路径另议.

## 1. 背景 (5 分钟阅读)

Linux (NUC) 桌宠 `bin/octopus-pet.linux.bin --gui` 启动后, **WebKitGTK 4.1 + Mutter Wayland 透明表面合成失败**, 100% 渲染成纯黑方块, 看不到章鱼. 为治标, 提交了 5 个 commit:

| Commit | 改动 | 影响范围 |
|--------|------|----------|
| `f43780e` | `tauri.conf.json` `transparent: true → false` + 路径修复 + setup 钩子 monitor fallback + `app/index.html` 内联 body CSS | **全平台**, 但 macOS WKWebView 不依赖 transparent, 影响应该 ≈ 0 |
| `215e110` | setup 钩子加 `set_size(LogicalSize::new(116, 116))` | **全平台**, 但 macOS 默认就是 116×116, 应该无变化 |
| `68b6bba` | PhysicalSize → LogicalSize 重构 | **全平台** 语义对齐, 无功能变化 |
| `13afe41` | 仅 `docs/handoff-2026-09-11-linux-display.md` | 仅文档, 不影响 binary |
| `059e9a5` | 仅 `scripts/smoke-test-linux-gui.sh` | 仅 Linux 脚本, macOS 不会跑 |

**核心担心**: `f43780e` 改了 `tauri.conf.json` `transparent: false` + 加 setup 钩子. macOS WKWebView 用的是 `transparent: true` + `macOSPrivateApi: true` 走 native floating window. 改 transparent 可能让 macOS 浮窗失效.

**也想验**: 8 场景 V2.3 APNG 轮转是否还正常 (commit `3c84abd` 的 loop=1 修复).

## 2. 验证步骤 (10 分钟执行)

### 步骤 A: 准备 (2 分钟)

```bash
cd /path/to/octopus-pet
git log --oneline -5    # 应该看到 f43780e 在最顶
git pull origin main    # 同步 NUC 端的 5 个 commit
ls -la bin/octopus-pet.macos.bin   # 应该是 15.8MB, 时间戳是 9-11 之前
```

⚠️ **关键**: macOS binary 是从 NUC 旧版 (commit `688e0d9`) build 出来的, 跟 NUC 现在的 source 状态 (HEAD = `059e9a5`) 差 5 commit. **要重新 build** 才能反映源码改动:

```bash
# 假设 macOS 已经有 rust + node 环境 (跟 NUC 一样, 详 docs/linux-build.md §1-3)
cd /path/to/octopus-pet
cd app && npm install && cd ..   # 如果 node_modules 没了
cd src-tauri
cargo tauri build --no-bundle    # ⚠️ 不要省略 --no-bundle, 否则 binary 5.8MB = 缺 assets
cd ../..
cp src-tauri/target/release/octopus-pet bin/octopus-pet.macos.bin
ls -la bin/octopus-pet.macos.bin
# 应该是 15.8MB 左右, 时间戳 = 刚才
```

### 步骤 B: MCP stdio 自测 (1 分钟, 不需要 GUI)

```bash
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}}}' | ./bin/octopus-pet.macos.bin | head -3
```

期望: 返回 `{"jsonrpc":"2.0","id":1,"result":{"serverInfo":...,"capabilities":...}}`, 包含 `pet_show` / `pet_ask` / `pet_get_state` / `pet_set_state` / `pet_pet` / `pet_list_states` 6 个 tools.

### 步骤 C: GUI 启动 (3 分钟)

```bash
./bin/octopus-pet.macos.bin --gui
```

期望:
1. **浮窗出现** — 116×116 浮窗在屏幕某个位置, 顶部 z-order, 不在 dock 显示 (skipTaskbar)
2. **看到章鱼** — 不是黑方块, 不是浅灰, 是珊瑚粉章鱼 (idle 场景或某个 V2.3 场景)
3. **8 场景轮转** — 6.5s 一轮, 8 场景依次播放 (idle → detective-study → worker-construction → drink-coffee → breakdown → friday-5pm → pretend-busy → stay-late → treat-milk-tea → loop)
4. **透明** — 浮窗**透出**后面桌面, 不是实心方块 (这步验证 `transparent: false` 没污染 macOS WKWebView 的 transparent)

### 步骤 D: 交互测试 (3 分钟)

| 操作 | 期望 |
|------|------|
| 鼠标左键单击 | 章鱼切换到下一个场景 + bubble 出现 (3s 后消失) |
| 鼠标右键 | bubble 出现, 内容是 "你撸我了!" 或类似 (affection +5) |
| 拖动 | 浮窗跟随鼠标, 松开停在拖动位置 |
| 关掉再开 | 8 场景从 idle 重新轮转 |

### 步骤 E: 跟 V2.3 旧 macOS binary 对比 (1 分钟)

如果之前保留 V2.3 旧 binary (`bin/octopus-pet.macos.v2.3.bin` 之类):

```bash
# 跑新 binary 3 分钟, 截图
mkdir -p /tmp/macos-new
./bin/octopus-pet.macos.bin --gui &
sleep 10
screencapture -x /tmp/macos-new/pet-frame-1.png
sleep 7
screencapture -x /tmp/macos-new/pet-frame-2.png
pkill -9 -f octopus-pet

# 跑旧 binary 同样操作
mkdir -p /tmp/macos-old
./bin/octopus-pet.macos.v2.3.bin --gui &
sleep 10
screencapture -x /tmp/macos-old/pet-frame-1.png
sleep 7
screencapture -x /tmp/macos-old/pet-frame-2.png
pkill -9 -f octopus-pet
```

目视对比, 应该几乎一致 (除了浮窗初始位置可能略不同 — set_position 在 macOS 上行为跟 NUC 不一样).

## 3. 验收标准

| 验收项 | Pass 标准 |
|--------|----------|
| **A. 浮窗出现** | 116×116 floating window 在屏幕上, 不在 dock |
| **B. 章鱼可见** | 珊瑚粉章鱼 APNG 帧, 不是黑/灰方块 |
| **C. 透明保留** | 浮窗透出后面桌面 (验证 `transparent: false` 没破 macOS WKWebView) |
| **D. 8 场景轮转** | 6.5s 一轮, 8 个 V2 场景依次出现 |
| **E. 交互** | click / contextmenu / drag 都正常 |
| **F. MCP stdio** | 5 tools 全部 respond (步骤 B 验过) |
| **G. 跟 V2.3 视觉对比** | 跟旧 binary 几乎一致 |

**5/5 必须 pass**, 1 个 fail 都算"macOS 路径污染", 需要回滚.

## 4. 报告模板

测完发我结果 (微信 / 邮件 / 当面):

```
macOS 验证结果: <PASS/FAIL>
binary: bin/octopus-pet.macos.bin, 大小: <MB>, build time: <时间>
A. 浮窗出现: <✅/❌, 描述>
B. 章鱼可见: <✅/❌, 描述>
C. 透明保留: <✅/❌, 描述>
D. 8 场景轮转: <✅/❌, 描述>
E. 交互 (click/right/drag): <✅/❌, 描述>
F. MCP stdio: <✅/❌, 工具列表>
G. 跟 V2.3 视觉对比: <✅/❌, 差异>
```

## 5. 决策树

```
A-G 全 pass
  → Linux 5 commit 干净, V2.3 主线保住
  → W3 (GTK cairo 治本) 单开 thread 评估
  → 治标 5 commit 保留 (作为 Linux 已知 workaround)

A-G 任 1 fail
  → macOS 路径污染, 需要回滚
  → 选项 1: revert f43780e + 215e110 + 68b6bba (治标 3 commit), 保留 13afe41 + 059e9a5 (仅文档/脚本)
  → 选项 2: revert 全部 5 commit, 重新设计 Linux 治本 (不污染 macOS)
  → 选项 3: macOS / Linux 拆 tauri.conf.json (条件编译 / 双 conf)
```

## 6. 不需要做的事

- ❌ 不要碰 AGENTS.md / CHANGELOG.md (等 macOS 验过再统一改)
- ❌ 不要重新 build Linux binary (NUC 端已经最新, 不要再动)
- ❌ 不要尝试 GTK cairo 治本 (那是 W3 单独 thread)
- ❌ 不要 mcode / commit 新改动 (专注验证)

## 7. 紧急回滚 (如果只想快速恢复)

```bash
git revert f43780e 215e110 68b6bba    # 回滚治标 3 commit (保留文档 + 脚本)
git push origin main
# 重新 build macOS binary
cd src-tauri && cargo tauri build --no-bundle
cd ../..
cp src-tauri/target/release/octopus-pet bin/octopus-pet.macos.bin
```

13afe41 (handoff 文档) 和 059e9a5 (smoke test 脚本) 是纯文档/脚本, 不影响 macOS binary, 可以保留.

## 8. 关键文件 (万一你想看 diff)

```bash
# 看 5 commit 实际改了什么
git show f43780e --stat
git show 215e110 --stat
git show 68b6bba --stat

# 看 tauri.conf.json 关键 diff
git show f43780e -- src-tauri/tauri.conf.json

# 看 setup 钩子位置策略
git show f43780e -- src-tauri/src/lib.rs
```

如果 `transparent: false` 这一行在 macOS 上破坏了什么 (理论上不应该, 但 WKWebView 行为有时 surprise), 改回 `true` 就是:

```bash
# 在 src-tauri/tauri.conf.json 把 "transparent": false 改回 true, 重新 build
```
