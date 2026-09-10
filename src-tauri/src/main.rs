// Octopus Pet — Tauri 2 main entrypoint.
// Per plan §1.8 + §1.9: 200x200 transparent always-on-top window, MCP stdio server,
// React frontend served via Vite.
//
// CLI:
//   octopus-pet                  → MCP stdio server (default; for mcode plugin)
//   octopus-pet --mcp-stdio      → MCP stdio server (alias of default)
//   octopus-pet --gui            → Tauri GUI window + MCP stdio server (interactive)
//   octopus-pet --mcp-stdio --http-fallback
//                                → MCP stdio + HTTP fallback server (per AGENTS.md §1.6)
//
// mcode plugin launches this binary per `mcp.json` with stdio piped. The default
// mode is the simplest "just run an MCP server" path, with no Tauri window
// initialized. Interactive users wanting the desktop pet window add `--gui`.

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    let args: Vec<String> = std::env::args().collect();
    let want_gui = args.iter().any(|a| a == "--gui" || a == "--window");
    let want_mcp = args.iter().any(|a| a == "--mcp-stdio")
        || !want_gui;  // default to MCP when neither --gui nor --mcp-stdio is passed

    if want_mcp && !want_gui {
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
