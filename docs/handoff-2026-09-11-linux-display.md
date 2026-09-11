# Handoff 2026-09-11: NUC Ubuntu 24.04 桌宠显示治本路径

> **状态**: 治本 (W3 评估入口) / 治标 已 commit 3 个 (f43780e + 215e110 + 68b6bba), main 已 push.
> **症状**: `bin/octopus-pet.linux.bin --gui` 在 NUC (RTX 3060 + GNOME Wayland 24.04) 上 116×116 浮窗
> 100% 渲染成浅灰 (250,250,250), 看不到章鱼 APNG / CSS / canvas.

## 1. 用户最终效果 (3 治标 commit 后)

| 维度 | 修前 | 修后 |
|------|------|------|
| 浮窗可见 | 100% 渲染成纯黑 (0,0,0) | 可见 222×222 物理像素 (116×116 logical) 浅灰方块 |
| 浮窗位置 | monitor 中心 / 屏外 (Wayland 不可靠) | (200, 200) 显式设置, 实测落 (0, 0) 左上屏 |
| 浮窗形状 | 222×300 (3:4 长方形, 比例错) | 222×222 (1:1 正方形, 跟 tauri.conf.json 一致) |
| 浮窗内容 | 黑 / 默认浅灰 (无 CSS) | 默认浅灰 (无 CSS) — **未治本** |
| 桌宠 APNG | 不可见 | 不可见 — **未治本** |
| MCP stdio | 5/5 tools 正常 | 5/5 tools 正常 |

**结论**: 用户能看到 116×116 浮窗轮廓 + 进程在跑, 但章鱼仍不可见。

## 2. 治本 W3 评估 — 3 个候选

### 候选 A: 换 webview 后端 → GTK cairo (推荐)

**改动范围**:
- `src-tauri/Cargo.toml` — 加 `gtk4` + `cairo` 依赖, 删 `tauri` 运行时入口 (或保留作 fallback)
- `src-tauri/src/lib.rs` — `--gui` 模式走新入口 `render_pet_gtk4()`, 不走 Tauri 窗口
- 新增 `src-tauri/src/render_gtk4.rs` — 用 cairo 画当前 scene APNG 帧 + 鼠标事件 → FSM 状态切换
- 复用现有 `octopus-fsm` / `useAnimation` 抽象 (抽离成 `crate::fsm`)

**优点**:
- GTK 4 在 Mutter Wayland 上透明 surface 合成验证过 OK (Gnome Files / Nautilus 等)
- 离 WebKit 路径, 治本
- 鼠标 / drag / click 用 GTK 4 原生事件, 比 Tauri IPC 快
- macOS / Windows 仍走 Tauri 路径 (条件编译 #[cfg(target_os = "linux")])

**缺点**:
- 工作量大 (1-2 天)
- Linux 专属代码增加, AGENTS.md 协作规则要更新

**预估**: 1.5 天 (含测试)

### 候选 B: 降 webkit2gtk 4.1 → 4.0

**改动**:
- Ubuntu 24.04 源只有 4.1, 需要 PPA 或降级到 Ubuntu 22.04 的 4.0
- Tauri 2.x 已经要求 4.1, 降 4.0 要降 Tauri 到 1.x
- 治标不治本, 4.0 在 Wayland 也有同样问题

**结论**: 不推荐。

### 候选 C: 等 Tauri 2.5+ / webkit2gtk 4.2

**改动**: 等上游修复。

**结论**: 时间不可控, 不推荐作为主动方案。

## 3. 已穷尽 (无解) 的 env / config

| 尝试 | 结果 |
|------|------|
| `GDK_BACKEND=x11` (强制 XWayland) | ✗ 仍 100% 黑 / 浅灰 |
| `WEBKIT_DISABLE_COMPOSITING_MODE=1` (CPU 合成) | ✗ |
| `WEBKIT_DISABLE_DMABUF_RENDERER=1` (关 DMA-BUF) | ✗ |
| `WEBKIT_FORCE_DEVICE_SCALE_FACTOR=1` (DPR 强制) | ✗ 仍 222×222 |
| `WEBKIT_DISABLE_SANDBOX=1` | ✗ |
| `transparent: false` (牺牲透明换可见) | ✓ 浮窗可见, 内容仍未渲染 |
| `set_size(PhysicalSize::new(116, 116))` | ✓ 部分 — 长方形改正方形 |
| `set_size(LogicalSize::new(116, 116))` | ✓ 跟 PhysicalSize 等价 |
| body 珊瑚粉 CSS + specificity 1,0,3 | ✗ — 都没机会渲染 (WebKit 死) |
| 内联 `<style>` + `!important` | ✗ — 都没机会渲染 (WebKit 死) |
| 完全 clean rebuild (rm -rf target) | ✗ |

**结论**: WebKitGTK 4.1 在这台 NUC 的 Mutter Wayland 上无法渲染, 不是配置问题, 是 webview 后端本身。

## 4. 关键证据 (截图)

| 文件 | 内容 |
|------|------|
| `/tmp/pet_x11_full.png` | transparent:true 修前, 浮窗 100% 黑 |
| `/tmp/pet_size_full.png` | transparent:false + PhysicalSize 修后, 222×300 长方形 |
| `/tmp/pet_logical_corner.png` | 修后 222×222 正方形浅灰 (最终状态) |

## 5. 验证脚本 (W3 评估时复用)

```bash
# NUC 启动 + 截图
./bin/octopus-pet.linux.bin --gui 2>/tmp/pet.log &
sleep 5
python3 -c "from PIL import ImageGrab; img=ImageGrab.grab().convert('RGB'); \
  img.crop((0,0,800,600)).save('/tmp/check.png'); print('size:', img.size)"

# 颜色检测 (浅灰 = WebKit 默认, 珊瑚粉 = body CSS 生效)
python3 -c "
from PIL import Image
import numpy as np
img = np.array(Image.open('/tmp/check.png').convert('RGB'))
gray = np.all(np.abs(img.astype(int) - 250) < 5, axis=2)
print('light gray pixels (bad):', gray.sum())
target = np.array([255, 130, 152])
diff = np.abs(img.astype(int) - target).sum(axis=2)
print('coral pixels (good):', (diff < 30).sum())"
```

期望 W3 治本后: light gray = 0, coral = 大量 (192×192 × 8 场景 帧数)。

## 6. 决策建议

**用户当前可接受**: 治标状态 (f43780e + 215e110 + 68b6bba), 关 goal。

**用户想要真治本**: 开 W3, 走候选 A (GTK cairo), 1.5 天, 跟 V2.3 主线隔离 (条件编译).

**相关文件**:
- `docs/linux-build.md §7.8` — 完整症状 / 根因 / 变通记录
- `src-tauri/src/lib.rs:67-99` — setup 钩子 (位置 + size fallback)
- `src-tauri/tauri.conf.json:18-29` — 116×116 + transparent:false + beforeBuildCommand path fix
- `app/src/styles/global.css:25-44` — body 珊瑚粉 (W3 治本后生效)
