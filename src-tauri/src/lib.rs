// Octopus Pet — Tauri 2 lib entrypoint.
// Spawns the 200x200 transparent always-on-top window and (V1 stub) the MCP stdio
// server as a sidecar. The MCP server emits events via tauri::Emitter which the
// webview consumes via the tauri event API.

use tauri::Manager;

mod mcp_stdio;
mod state_bridge;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("info")),
        )
        .init();

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .setup(|app| {
            // Spawn the MCP stdio server as a sidecar (V1 stub: just a logger that
            // pretends to handle tool calls). Real MCP wiring is W2.
            let app_handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                if let Err(e) = mcp_stdio::serve(app_handle).await {
                    tracing::error!("MCP stdio server exited with error: {:?}", e);
                }
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // V1 commands called from the webview
            state_bridge::get_state,
            state_bridge::force_scene,
            state_bridge::ask,
            state_bridge::pet,
        ])
        .run(tauri::generate_context!())
        .expect("error while running octopus-pet application");
}
