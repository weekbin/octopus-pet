// Octopus Pet — Tauri 2 main entrypoint.
// Per plan §1.8 + §1.9: 200x200 transparent always-on-top window, MCP stdio server
// (V1 stub), React frontend served via Vite.
//
// CLI:
//   octopus-pet                    → Tauri GUI window + MCP stdio server
//   octopus-pet --mcp-stdio        → MCP stdio server only (no window, for headless / test)

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    let args: Vec<String> = std::env::args().collect();
    if args.iter().any(|a| a == "--mcp-stdio") {
        // Headless: just run the MCP stdio server, no Tauri window.
        let rt = tokio::runtime::Runtime::new().expect("failed to create tokio runtime");
        rt.block_on(async {
            // The MCP stdio server doesn't need a Tauri AppHandle for V1 stub;
            // it just logs. We pass a dummy by creating a minimal builder.
            // For now: log and read stdin forever.
            tracing_subscriber::fmt()
                .with_env_filter(
                    tracing_subscriber::EnvFilter::try_from_default_env()
                        .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("info")),
                )
                .init();
            tracing::info!("octopus-pet --mcp-stdio mode (V1 stub, no Tauri window)");
            octopus_pet_lib::run_mcp_only().await
        });
    } else {
        octopus_pet_lib::run()
    }
}
