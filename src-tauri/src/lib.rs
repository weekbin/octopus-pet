// Octopus Pet — Tauri 2 lib entrypoint.
// Spawns the 200x200 transparent always-on-top window and (V1 stub) the MCP stdio
// server as a sidecar. The MCP server emits events via tauri::Emitter which the
// webview consumes via the tauri event API.

use tauri::Manager;

mod mcp_stdio;
mod state_bridge;

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

/// Headless MCP stdio server (no Tauri window). Used by `--mcp-stdio` mode for
/// CLI testing without spawning the GUI.
pub async fn run_mcp_only() -> Result<(), Box<dyn std::error::Error>> {
    use tokio::io::{AsyncBufReadExt, BufReader};
    let stdin = tokio::io::stdin();
    let mut reader = BufReader::new(stdin);
    let mut buf = String::new();
    tracing::info!("MCP stdio server starting (headless mode)");

    loop {
        buf.clear();
        let n = reader.read_line(&mut buf).await?;
        if n == 0 {
            tracing::info!("MCP stdio: EOF, exiting");
            break;
        }
        let line = buf.trim();
        if line.is_empty() {
            continue;
        }
        // V1 stub: just echo back initialize / tools/list / tools/call
        match serde_json::from_str::<serde_json::Value>(line) {
            Ok(req) => {
                let id = req.get("id").cloned().unwrap_or(serde_json::Value::Null);
                let method = req.get("method").and_then(|v| v.as_str()).unwrap_or("");
                let resp = match method {
                    "initialize" => serde_json::json!({
                        "jsonrpc": "2.0",
                        "id": id,
                        "result": {
                            "protocolVersion": "2024-11-05",
                            "serverInfo": {"name": "octopus-pet", "version": env!("CARGO_PKG_VERSION")},
                            "capabilities": {"tools": {}}
                        }
                    }),
                    "tools/list" => serde_json::json!({
                        "jsonrpc": "2.0",
                        "id": id,
                        "result": {
                            "tools": [
                                {"name": "pet_show", "description": "切场景"},
                                {"name": "pet_ask", "description": "弹气泡"},
                                {"name": "pet_get_state", "description": "查状态"},
                                {"name": "pet_set_state", "description": "pet_show 别名"},
                                {"name": "pet_pet", "description": "摸头"},
                                {"name": "pet_list_states", "description": "14 场景列表"}
                            ]
                        }
                    }),
                    "tools/call" => {
                        let tool_name = req.get("params")
                            .and_then(|p| p.get("name"))
                            .and_then(|n| n.as_str())
                            .unwrap_or("");
                        let args = req.get("params")
                            .and_then(|p| p.get("arguments"))
                            .cloned()
                            .unwrap_or(serde_json::json!({}));
                        let text = match tool_name {
                            "pet_show" | "pet_set_state" => format!(
                                "switched to {}",
                                args.get("state").and_then(|v| v.as_str()).unwrap_or("?")
                            ),
                            "pet_ask" => format!(
                                "bubble: {}",
                                args.get("text").and_then(|v| v.as_str()).unwrap_or("?")
                            ),
                            "pet_pet" => "petted (+5 affection)".to_string(),
                            "pet_get_state" => "scene=pretend-busy frame=0 bubble=null affection=0".to_string(),
                            "pet_list_states" => "14 scenes: pretend-busy, stay-late, breakdown, lying-flat, multi-tasking, payday, salary-rejected, treat-milk-tea, friday-5pm, toilet-slacking, touch-fish, waiting-m3pro, soul-leaving, multitask".to_string(),
                            other => format!("unknown tool: {}", other),
                        };
                        serde_json::json!({
                            "jsonrpc": "2.0",
                            "id": id,
                            "result": {"content": [{"type": "text", "text": text}], "isError": false}
                        })
                    }
                    _ => serde_json::json!({
                        "jsonrpc": "2.0",
                        "id": id,
                        "error": {"code": -32601, "message": format!("method not found: {}", method)}
                    }),
                };
                println!("{}", serde_json::to_string(&resp)?);
            }
            Err(e) => {
                tracing::warn!("bad JSON: {} (line: {:?})", e, line);
            }
        }
    }
    Ok(())
}
