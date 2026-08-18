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
