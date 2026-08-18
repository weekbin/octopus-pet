// state_bridge.rs — Commands callable from the webview via `invoke()`,
// plus the SharedState struct used by both the webview and the HTTP fallback.

use serde::Serialize;
use std::sync::Mutex;
use tauri::{AppHandle, State};

/// Process-wide shared state. The webview updates it via tauri::command
/// (force_scene/ask/pet), and the HTTP fallback reads from it.
#[derive(Debug, Serialize, Clone)]
pub struct SharedState {
    pub scene: String,
    pub frame: u32,
    pub bubble: Option<String>,
    #[serde(rename = "bubbleHideAt")]
    pub bubble_hide_at: Option<u64>,
    pub affection: u32,
    pub position: Position,
}

#[derive(Debug, Serialize, Clone)]
pub struct Position {
    pub x: i32,
    pub y: i32,
}

impl Default for SharedState {
    fn default() -> Self {
        Self {
            scene: "pretend-busy".to_string(),
            frame: 0,
            bubble: None,
            bubble_hide_at: None,
            affection: 0,
            position: Position { x: 100, y: 100 },
        }
    }
}

#[derive(Serialize)]
pub struct StateResponse {
    pub ok: bool,
    pub message: String,
}

#[tauri::command]
pub fn get_state(state: State<'_, Mutex<SharedState>>) -> StateResponse {
    let s = state.lock().expect("state lock");
    StateResponse {
        ok: true,
        message: serde_json::to_string(&*s).unwrap_or_default(),
    }
}

#[tauri::command]
pub fn force_scene(
    scene: String,
    state: State<'_, Mutex<SharedState>>,
    app: AppHandle,
) -> StateResponse {
    let mut s = state.lock().expect("state lock");
    s.scene = scene.clone();
    s.frame = 0;
    use tauri::Emitter;
    let _ = app.emit(
        "octopus://event",
        serde_json::json!({"type": "FORCE_SCENE", "scene": scene, "now": now_ms()}),
    );
    StateResponse {
        ok: true,
        message: format!("forced scene: {}", s.scene),
    }
}

#[tauri::command]
pub fn ask(
    text: String,
    state: State<'_, Mutex<SharedState>>,
    app: AppHandle,
) -> StateResponse {
    let truncated: String = text.chars().take(12).collect();
    let mut s = state.lock().expect("state lock");
    s.bubble = Some(truncated.clone());
    s.bubble_hide_at = Some(now_ms() + 3000);
    use tauri::Emitter;
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
pub fn pet(state: State<'_, Mutex<SharedState>>, app: AppHandle) -> StateResponse {
    let mut s = state.lock().expect("state lock");
    s.affection = (s.affection + 5).min(100);
    s.bubble = Some("啊~".to_string());
    s.bubble_hide_at = Some(now_ms() + 3000);
    use tauri::Emitter;
    let _ = app.emit(
        "octopus://event",
        serde_json::json!({"type": "PET", "now": now_ms()}),
    );
    StateResponse {
        ok: true,
        message: format!("petted, affection: {}", s.affection),
    }
}

fn now_ms() -> u64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

#[allow(dead_code)]
fn _suppress_unused() {
    // Force the AppHandle import to be used (for future events emit in commands).
    let _: Option<AppHandle> = None;
}
