// state_bridge.rs — Commands callable from the webview via `invoke()`.
// In V1 these are mostly no-ops because the FSM state lives in React. W2 will
// move state into Rust and round-trip via these commands.

use serde::Serialize;
use tauri::AppHandle;

#[derive(Serialize)]
pub struct StateResponse {
    pub ok: bool,
    pub message: String,
}

#[tauri::command]
pub fn get_state() -> StateResponse {
    StateResponse {
        ok: true,
        message: "state lives in webview; use tauri events".into(),
    }
}

#[tauri::command]
pub fn force_scene(scene: String, app: AppHandle) -> StateResponse {
    use tauri::Emitter;
    let _ = app.emit(
        "octopus://event",
        serde_json::json!({"type": "FORCE_SCENE", "scene": scene, "now": now_ms()}),
    );
    StateResponse {
        ok: true,
        message: format!("forced scene: {}", scene),
    }
}

#[tauri::command]
pub fn ask(text: String, app: AppHandle) -> StateResponse {
    use tauri::Emitter;
    let truncated: String = text.chars().take(12).collect();
    let _ = app.emit(
        "octopus://event",
        serde_json::json!({"type": "ASK", "text": truncated, "now": now_ms()}),
    );
    StateResponse {
        ok: true,
        message: format!("asked: {}", truncated),
    }
}

#[tauri::command]
pub fn pet(app: AppHandle) -> StateResponse {
    use tauri::Emitter;
    let _ = app.emit(
        "octopus://event",
        serde_json::json!({"type": "PET", "now": now_ms()}),
    );
    StateResponse {
        ok: true,
        message: "petted".into(),
    }
}

fn now_ms() -> u64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}
