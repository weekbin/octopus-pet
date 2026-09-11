// Octopus Pet — Tauri 2 lib entrypoint.
// Spawns the 200x200 transparent always-on-top window, the MCP stdio server
// (V1 stub), and optionally the HTTP fallback server (per plan §1.6).
// Shared state is held in a Mutex<SharedState> so all three components
// (webview / MCP / HTTP) see the same picture.

use std::sync::{Arc, Mutex};
use tauri::Manager;

mod actions;
mod http_fallback;
mod mcp_stdio;
mod scene_registry_generated;
mod state_bridge;

use state_bridge::SharedState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    use tracing_subscriber::EnvFilter;
    let filter = EnvFilter::try_from_default_env()
        .unwrap_or_else(|_| EnvFilter::new("info"));
    tracing_subscriber::fmt()
        .with_env_filter(filter)
        .with_writer(std::io::stderr)
        .with_ansi(false)
        .init();

    let shared: Arc<Mutex<SharedState>> = Arc::new(Mutex::new(SharedState::default()));

    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
            // Second instance tried to launch. The plugin already killed it
            // (the second .app process exits immediately). We're in the FIRST
            // instance's callback now. We log the event and could optionally
            // surface it to the user (e.g. toast, or focus the existing window).
            tracing::warn!(
                "another octopus-pet instance tried to launch (args={:?}); ignored (V1 single-instance)",
                args
            );
            // Bring our window to the front so the user knows we're alive.
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
                let _ = window.unminimize();
            }
        }))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .manage(shared.clone())
        .setup(move |app| {
            let app_handle = app.handle().clone();

            // Wayland 兜底: docs/linux-build.md §7.7 — hardcoded x/y 在多屏布局下
            // 可能落到无 monitor 覆盖的逻辑坐标, 透明窗口"创建但视觉消失".
            // 即使 tauri.conf.json 改 center: true, GTK 4 在某些 Wayland
            // 合成器 (mutter / kwin) 上仍可能把窗口扔到屏幕外. 在 setup 里
            // 显式取 monitor 中心 + 校验落点, 保证窗口可见.
            //
            // Wayland gotcha (实测 2026-09-11 NUC Ubuntu 24.04): primary_monitor()
            // 返回 None. 用 current_monitor() 或 available_monitors()[0] 兜底.
            //
            // 2026-09-11 N+1 兜底: 永远把窗口钉在 monitor 右上角 (offset 30, 50)
            // 而非中心. 中心位置常被其他 fullscreen app (codebuddy chat / 终端)
            // 盖住, 116x116 透明窗口在 alwaysOnTop 不稳的 Wayland 下直接消失.
            // 右上角是用户最少放东西的位置, 而且贴边能强制 compositor 给 input.
            if let Some(window) = app_handle.get_webview_window("main") {
                let monitor = window.primary_monitor().ok().flatten()
                    .or_else(|| window.current_monitor().ok().flatten())
                    .or_else(|| window.available_monitors().ok().and_then(|m| m.into_iter().next()));

                if let Some(monitor) = monitor {
                    let mon_pos = monitor.position();
                    let mon_size = monitor.size();
                    // NUC 实测 (2026-09-11): 用户打开 WPS+Chrome+codebuddy+Files,
                    // 全屏被瓜分. alwaysOnTop 在 Mutter Wayland 不稳. 钉在
                    // (0, 0) 绝对左上 — 即使 monitor 报告 (0, 640) 起点,
                    // 屏幕原点 (0, 0) 是已知空区 (暗粉 desktop).
                    //
                    // 之前尝试 monitor 左上/右上/中心都被其他窗口盖住.
                    // (0, 0) 在 6000x4320 屏左上, 116x116 不挡其他 app.
                    // 2026-09-11 N+2 改 (200, 200): 屏幕原点 (0, 0) 角落 WebKit
                    // 渲染可能异常 (Wayland surface 边缘 bug), 偏移一点测试.
                    let cx: i32 = 200;
                    let cy: i32 = 200;
                    let _ = window.set_position(tauri::PhysicalPosition::new(cx, cy));
                    // 显式 set_size 兜底, 防 tauri.conf.json 116x116 在 Wayland
                    // DPI 缩放下被 WebKitGTK 4.1 错误缩放成 222x300 之类
                    // (本机 3x DPI 实测 222/116=1.91x, 300/116=2.59x, 非
                    // 等比 → 文档 viewport 渲染异常). 强制 inner_size 物理
                    // 像素等于逻辑像素, 跟 tauri.conf.json 一致.
                    let _ = window.set_size(tauri::PhysicalSize::new(116, 116));
                    tracing::info!(
                        "pet window anchored at absolute ({}, {}) on monitor {}x{} at ({}, {})",
                        cx, cy, mon_size.width, mon_size.height, mon_pos.x, mon_pos.y
                    );
                } else {
                    tracing::warn!("no monitor detected at all, falling back to (50, 50)");
                    let _ = window.set_position(tauri::PhysicalPosition::new(50, 50));
                    let _ = window.set_size(tauri::PhysicalSize::new(116, 116));
                }
                // 显式 show + unminimize + focus 兜底, 防止某些 DE 启动时窗口被 hide
                let _ = window.unminimize();
                let _ = window.show();
                let _ = window.set_focus();
            }

            // Optional HTTP fallback (env: OCTOPUS_HTTP_FALLBACK=true, OCTOPUS_PORT=9527).
            // Started here (not before the builder) because we need an AppHandle
            // to emit "octopus://event" so the webview reacts to HTTP writes.
            if std::env::var("OCTOPUS_HTTP_FALLBACK")
                .map(|v| v == "true" || v == "1")
                .unwrap_or(false)
            {
                let port: u16 = std::env::var("OCTOPUS_PORT")
                    .ok()
                    .and_then(|p| p.parse().ok())
                    .unwrap_or(9527);
                let http_state = shared.clone();
                let http_app = app_handle.clone();
                std::thread::spawn(move || {
                    if let Err(e) = http_fallback::start(Some(http_app), http_state, port) {
                        tracing::error!("HTTP fallback failed: {:?}", e);
                    }
                });
            }

            // Spawn the MCP stdio server. Pass shared state for cross-component consistency.
            let mcp_state = shared.clone();
            tauri::async_runtime::spawn(async move {
                if let Err(e) = mcp_stdio::serve(Some(app_handle), mcp_state).await {
                    tracing::error!("MCP stdio server exited with error: {:?}", e);
                }
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            state_bridge::get_state,
            state_bridge::sync_state,
        ])
        .run(tauri::generate_context!())
        .expect("error while running octopus-pet application");
}

/// Headless MCP stdio server (no Tauri window). Used by `--mcp-stdio` mode for
/// CLI testing without spawning the GUI.
pub async fn run_mcp_only() -> Result<(), Box<dyn std::error::Error>> {
    let shared: Arc<Mutex<SharedState>> = Arc::new(Mutex::new(SharedState::default()));
    mcp_stdio::serve(None, shared)
        .await
        .map_err(|e| Box::<dyn std::error::Error>::from(e.to_string()))
}
