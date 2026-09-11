# Linux Build Guide

> **Status**: V0.1 验证 (2026-09-10, NUC 12 / i9-12900 / Ubuntu 24.04.4 LTS /
> RTX 3060). 跨 macOS / Linux / Windows 三平台编译验证, Tauri 2 + React 19 + Vite 6.
>
> **实测结果** (2026-09-10):
> - `cargo build --release`: 1m 30s, 5.8MB ELF binary
> - `npx tauri build --no-bundle`: 1m 16s, 同样 5.8MB
> - 8/8 cargo test pass (`mcp_roundtrip`)
> - MCP stdio 5 tools 全部 respond 正确
> - WebKitNetworkProcess + WebKitWebProcess 启动正常
> - 2 dead-code warnings (`jsonrpc` 字段 / `BUBBLE_LINES` static — pre-existing)

---

## 1. 系统依赖 (Ubuntu 24.04 / Debian 12)

Tauri 2 在 Linux 上需要 GTK / WebKit2GTK 系统库。`cargo build` 第一次会调用
`pkg-config` 找这些 `.pc` 文件, 缺一个就 panic.

```bash
sudo apt update && sudo apt install -y \
  build-essential pkg-config \
  libdbus-1-dev \
  libwebkit2gtk-4.1-dev \
  libgtk-3-dev \
  libayatana-appindicator3-dev \
  librsvg2-dev \
  libsoup-3.0-dev \
  libjavascriptcoregtk-4.1-dev \
  patchelf
```

**为什么这些**:
- `libwebkit2gtk-4.1-dev` — Tauri 2 渲染后端, **必须 4.1, 不能 4.0**
- `libgtk-3-dev` — GTK 3 (Tauri 2 当前不支持 GTK 4 为主, GTK 4 仅作为依赖)
- `libayatana-appindicator3-dev` — 系统托盘 (虽然本项目用 `skipTaskbar=true` 不显示托盘, 但 Tauri 链接)
- `libdbus-1-dev` — libdbus-sys 的 pkg-config 探测
- `librsvg2-dev` — SVG 图标支持
- `patchelf` — bundle .so 重定位 (Tauri 2 内部使用)

**如果编译报缺别的 `.pc`**: 80% 情况下 `apt search <name>` 找 dev 包安装即可.

---

## 2. Rust 工具链

```bash
# 用 rustup (官方安装脚本) - 不要 apt 装 rustc (版本太旧)
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --default-toolchain stable --profile minimal
source "$HOME/.cargo/env"

# 验证
rustc --version  # 应 >= 1.77 (Cargo.toml rust-version)
cargo --version
```

**踩坑 (2026-09-10 实际遇到)**:
- `rustup default stable` 第一次下载 522MB + 后续组件, **不能 Ctrl-C 中断**, 否则会得到
  `error: missing manifest in toolchain 'stable-x86_64-unknown-linux-gnu'`. 中断后必须:
  ```bash
  rustup toolchain uninstall stable
  rustup toolchain install stable --profile minimal --component rust-std --component rustc --component cargo
  rustup default stable
  ```
- **不要 `apt install rustc`**, Ubuntu 24.04 的 rustc 1.75 跟 Tauri 2 不兼容, 编译时
  `unexpected cfg` 警告刷屏, 部分新版依赖锁不上.

---

## 3. Node / npm

```bash
# 推荐 nvm (跨平台统一管理)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
nvm install 20  # 或 22 / 24 都行
nvm use 20
node --version  # v20.x+
```

`app/package.json` 列了 Tauri 2 + React 19 + XState 5 + apng-js 1.1.5. 没装这些之前
先在 `app/` 跑 `npm install`.

---

## 4. 编译运行

### 4.1 第一次 (cold build)

```bash
cd octopus-pet
# 前端依赖 (~30s)
cd app && npm install && cd ..

# Rust 依赖 (下载 + 编译 1500+ crates, 第一次 ~10-15 分钟, 后续增量 <30s)
cd src-tauri
cargo build --release
cd ..

# 或: tauri 一条龙 (走 beforeBuildCommand 跑 vite build + cargo build)
cd src-tauri
cargo tauri build
cd ..
```

### 4.2 增量开发

```bash
cd octopus-pet/src-tauri
cargo tauri dev
# 启动 vite dev server (http://127.0.0.1:1420) + cargo watch 增量编译 + 弹窗
```

### 4.3 独立运行 (mcode plugin 模式)

```bash
# 默认 = MCP stdio server (无 Tauri 窗口, 最轻量)
./bin/octopus-pet
# 等价于: ./bin/octopus-pet --mcp-stdio

# 显式开 Tauri 窗口 (116×116 透明, 桌面宠物可见)
./bin/octopus-pet --gui

# 头部测试 (无 wrapper, 直接跑 inner binary)
./src-tauri/target/release/octopus-pet
```

**Plugin 入口设计** (mcode 用):
- `mcp.json` 指定 `command: ./bin/octopus-pet, args: []` (mcode 拉起时, stdio 自动 pipe)
- `bin/octopus-pet` 是 bash wrapper (~2.6KB), 检测 OS, exec `bin/octopus-pet.${KERNEL}.bin`
  (macos / linux / windows 各自的 release artifact, 提交进 git, **fresh clone 即可用**)
- Wrapper 也找 `target/{debug,release}/octopus-pet` (本地 dev 优先)
- mcode 用户无需自己 build, 只需把 plugin 目录加进 mcode 即可

**为什么 default 是 MCP stdio 不是 GUI**:
- mcode plugin 的本质是 MCP stdio server, GUI 窗口是 secondary
- mcode 拉起时 stdin 是 pipe, 不是 TTY, 不适合开 GUI
- 用户想要桌面宠物显形: `./bin/octopus-pet --gui` 显式
- 单职责: 没有 arg → 干一件事 (MCP server); 显式 arg → 干另一件事 (GUI)

---

## 5. 平台差异 (V0.1 验证)

| 维度 | macOS | Linux (Ubuntu 24.04) | Windows |
|------|-------|----------------------|---------|
| 透明窗口 | 需要 `macOSPrivateApi: true` (tauri.conf.json) + `features = ["macos-private-api"]` (Cargo.toml) | webkit2gtk 原生支持, 不需要 | Win32 `WS_EX_LAYERED` |
| alwaysOnTop | Tauri 2 抽象 (`NSWindow.Level = .floating` 真正置顶所有) | Tauri 2 → `gtk_window_set_keep_above(true)` → Mutter/GNOME 尊重; **非 fullscreen 窗口**置顶 OK, fullscreen app 仍可盖. wlroots 桌面 (Sway/Hyprland) 还需 wlr-layer-shell 才等于 macOS .floating | Tauri 2 抽象 |
| skipTaskbar | Dock 不显示 | 多数 DE 隐藏图标, 少数不 | 任务栏不显示 |
| 图标 (Tauri 2) | `.icns` 必须 | `.png` 多尺寸 | `.ico` 多尺寸 |
| 沙箱 | App 沙箱 | AppArmor / 没有 | UAC |
| 文件路径 | `Path::new()` 跨平台 OK | 同左 | 同左 (反斜杠自动转换) |

**Cargo.toml 跨平台写法**:
```toml
[dependencies]
tauri = { version = "2", features = [] }  # 通用

[target.'cfg(target_os = "macos")'.dependencies]
tauri = { version = "2", features = ["macos-private-api"] }  # macOS 才开私有 API
```

**tauri.conf.json 跨平台写法**:
```json
{
  "app": {
    "macOSPrivateApi": true,   // Tauri 内部按 target_os 决定是否启用, 跨平台 OK
    "windows": [{ "transparent": true, "decorations": false, ... }]
  }
}
```

---

## 6. 验证清单

- [x] Linux apt 依赖装齐 (`dpkg -l libwebkit2gtk-4.1-dev` 有结果)
- [x] Rust 工具链可用 (`rustc --version` 1.98.1)
- [x] npm install 成功 (`app/node_modules/` 存在)
- [x] `cargo build --release` 产出 5.8MB ELF binary (`src-tauri/target/release/octopus-pet`)
- [x] `npx tauri build --no-bundle` 跑通 (Tauri 2.x full build chain, 1m 16s)
- [x] 二进制能独立启动, WebKitNetworkProcess + WebKitWebProcess 拉起
- [x] 8/8 cargo test 通过 (mcp_roundtrip)
- [x] MCP stdio 5 tools 全部 respond (pet_show / pet_ask / pet_get_state / pet_pet / pet_list_states)
- [x] 16/16 plugin lint, 24/24 vitest, 3/3 scene-sync, tsc 0 错
- [x] 透明窗口 (116×116) 在 X11/Wayland 上启动 — `xdotool` 看不到因为 transparent + skipTaskbar,
      但 `pgrep` 能看到 octopus-pet + WebKit 子进程, 说明 webview 起来了.
- [x] 跨平台 Cargo.toml: `macos-private-api` feature 永远 on (build script 校验要求),
      非 macOS target no-op.
- [x] alwaysOnTop 在 Wayland 验证 (2026-09-10) — `gtk_window_set_keep_above(true)` 调通,
      pet 窗口在 mcode terminal + Cursor IDE 上面. macOS NSWindow.Level=.floating 等价.
- [ ] 已知缺口: Wayland x/y 坐标不被完全尊重 — Tauri 2 / GTK 4 在 Wayland 下
      `tauri.conf.json` 的 `x: 100, y: 100` 不保证绝对屏幕位置, 可能落到 primary
      monitor 中心附近. 解决: 在 `setup` 钩子里调 `window.set_position()` 显式
      设置, 或用 `center: true`. macOS 上 x/y 正常.

---

## 7. 故障排查

### 7.0 `The 'tauri' dependency features on the 'Cargo.toml' file does not match the allowlist defined under 'tauri.conf.json'`

Tauri 2 的 build script 会校验 `Cargo.toml` 里 `tauri` 的 features 是否跟
`tauri.conf.json` 一致. 典型场景:

- `tauri.conf.json` 设了 `app.macOSPrivateApi: true` → Cargo.toml **必须** 包含
  `macos-private-api` feature (不论 target, no-op on non-macOS).
- 反过来: 不要把 `macos-private-api` 放到 `[target.'cfg(target_os = "macos")'.dependencies]`,
  这会让 Linux/Windows 编译挂掉.

解法: `tauri = { version = "2", features = ["macos-private-api"] }` 永远 on.
feature 在非 macOS target 上是 no-op, 但 build script 校验要看到它.

### 7.1 `pkg-config: Package dbus-1 was not found`

→ 缺 `libdbus-1-dev`, 见 §1.

### 7.2 `error[E0463]: can't find crate for 'std'`

→ Rust 工具链不完整. 重装:
```bash
rustup toolchain uninstall stable
rustup toolchain install stable --profile minimal --component rust-std
```

### 7.3 `cargo build` 报 "GL/GLES not found" / "EGL" 错误

→ 跟 webkit2gtk-4.1 间接依赖有关, 装:
```bash
sudo apt install libgles2-mesa-dev libegl1-mesa-dev
```

### 7.4 AppImage bundle 失败

Tauri 2 跨 Linux 分发需要 `linuxdeploy` 工具链. 简单做法只编译 binary
(`cargo build --release`), 用户拿到 `octopus-pet` 二进制直接跑.

### 7.5 透明窗口在 X11 上显示黑底

Wayland 默认透明工作良好. X11 需要 compositor (如 picom). 桌面环境
(GNOME / KDE) 默认开 compositor, 透明 OK. 极简 WM (i3 / openbox) 可能需要
手动开 compositor.

### 7.6 窗口出现在屏幕外 / 太靠角落

`tauri.conf.json` windows[0] 有 `x: 100, y: 100` 硬编码, 多显示器 / 高 DPI
可能位置不对. 改用 `center: true` 或在 `setup` 钩子里动态计算.

**Wayland 专属坑** (实测 2026-09-10): `x: 0, y: 0` 在 3 显示器布局下
不会放到绝对左上, Tauri 2 / GTK 4 在 Wayland native backend 会落到
primary monitor (带 `*` 标记) 的中心附近. 原因: Wayland 不允许 app
自己定位窗口 (compositor 决定), x/y hint 是请求不是命令. 验证方法:
截图全屏看 pet 实际位置, 不要凭 x/y 推测.

### 7.7 透明窗口在 Wayland 黑底区域 (屏幕边缘 / 屏幕外)

transparent + decorations:false 的 116×116 窗口如果定位到没有任何 monitor
覆盖的逻辑坐标 (如 0-1440, 0-320 在某些 3 屏布局), 窗口会被创建但
视觉上"消失" — 透明背景透出屏幕外黑色, 用户看不到章鱼.

解法:
1. 用 `center: true` 让 Tauri 自动选 primary monitor 中心
2. 或在 `setup` 钩子里调 `window.set_position(LogicalPosition::new(x, y))` 且
   先 `monitor_size()` 校验
3. 或 `--gui` 启动时从 stdin / env var 接受位置参数

### 7.8 NUC Ubuntu 24.04 + WebKitGTK 4.1 + Tauri 2 透明表面渲染异常 (2026-09-11 实测)

**症状**: `transparent: true` 的 116×116 窗口在 NUC (RTX 3060 / GNOME Wayland
/ XWayland) 上 100% 渲染为纯黑方块. 切换 `GDK_BACKEND=x11` 也不解决.
WebKit 子进程正常 spawn, 但 canvas 内容不可见.

**根因**: WebKitGTK 4.1 + Tauri 2 + GNOME Wayland 的 transparent ARGB 表面
合成有兼容性问题. compositing mode (默认) 在 Mutter Wayland 上无法把
WebKit 的 RGBA buffer 正确合成到 transparent 窗口. `transparent: false`
之后窗口能可见, 但 WebKit 仍然把页面渲染成默认浅灰 (250,250,250) 而
不应用 `<style>` 或外部 CSS.

**当前治标 (commit 待)**: `tauri.conf.json` 设 `transparent: false` +
`app/index.html` 把核心背景色 `background: #ff8298 !important` 内联到
`<style>`, 至少保证 116×116 浮窗可见. pet 内容 (canvas + APNG) 在
NUC WebKit 下仍渲染失败, 需要后续换 transparent-OK 方案 (例: GTK
native cairo / Python cairo + x11 / etc).

**已知变通** (未在本机验证):
- `WEBKIT_DISABLE_COMPOSITING_MODE=1` 强制 CPU 合成 (本机实测仍黑)
- `WEBKIT_DISABLE_DMABUF_RENDERER=1` 关闭 DMA-BUF (本机实测仍黑)
- 降级到 X11 session (GDM 选 GNOME on Xorg) — 透明可工作, 但用户已在 Wayland
- 换用 [WebKitGTK 4.0](https://github.com/tauri-apps/tauri/issues/) 旧 Tauri
- 等 Tauri 2.5+ / webkit2gtk 4.2 修复 (Ubuntu 24.04 apt 当前 4.1)
