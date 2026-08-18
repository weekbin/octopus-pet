// Octopus Pet — Tauri 2 main entrypoint.
// Per plan §1.8 + §1.9: 200x200 transparent always-on-top window, MCP stdio server,
// React frontend served via Vite.
//
// CLI:
//   octopus-pet                    → Tauri GUI window + MCP stdio server
//   octopus-pet --mcp-stdio        → MCP stdio server only (no window, for headless / test)

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    let args: Vec<String> = std::env::args().collect();
    if args.iter().any(|a| a == "--mcp-stdio") {
        use tracing_subscriber::EnvFilter;
        let filter = EnvFilter::try_from_default_env()
            .unwrap_or_else(|_| EnvFilter::new("info"));
        tracing_subscriber::fmt()
            .with_env_filter(filter)
            .with_writer(std::io::stderr)
            .with_ansi(false)
            .init();
        let rt = tokio::runtime::Runtime::new().expect("failed to create tokio runtime");
        let _ = rt.block_on(octopus_pet_lib::run_mcp_only());
    } else {
        octopus_pet_lib::run()
    }
}
