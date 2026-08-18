// Octopus Pet — Tauri 2 main entrypoint.
// Per plan §1.8 + §1.9: 200x200 transparent always-on-top window, MCP stdio server
// (V1 stub), React frontend served via Vite.

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    octopus_pet_lib::run()
}
