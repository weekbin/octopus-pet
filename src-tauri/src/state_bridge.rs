// state_bridge.rs — Commands callable from the webview via invoke(),
// plus the SharedState mirror queried by MCP / HTTP.
//
// 状态权威是前端 XState。Rust 侧 SharedState 只是只读镜像:
//   - webview 每次 FSM context 变化 → invoke sync_state 回写 (只写不 emit)
//   - actions.rs 的 apply_* 在有 webview 时也会写一份 (emit 前同步),
//     headless (--mcp-stdio) 时直写供 CLI 查询

use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};
use tauri::State;

/// 状态镜像 (XState 的投影, 无 frame — 渲染帧由前端组件持有)。
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SharedState {
    pub scene: String,
    pub bubble: Option<String>,
    #[serde(rename = "bubbleHideAt")]
    pub bubble_hide_at: Option<u64>,
    pub affection: u32,
    pub position: Position,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Position {
    pub x: i32,
    pub y: i32,
}

impl Default for SharedState {
    fn default() -> Self {
        Self {
            scene: "pretend-busy".to_string(),
            bubble: None,
            bubble_hide_at: None,
            affection: 0,
            position: Position { x: 100, y: 100 },
        }
    }
}

/// webview → Rust 的镜像回写载荷 (与前端 OctopusState 的同步字段对齐)。
#[derive(Debug, Deserialize)]
pub struct SyncPayload {
    pub scene: String,
    pub bubble: Option<String>,
    #[serde(rename = "bubbleHideAt")]
    pub bubble_hide_at: Option<u64>,
    pub affection: u32,
    pub position: Position,
}

#[derive(Serialize)]
pub struct StateResponse {
    pub ok: bool,
    pub message: String,
}

#[tauri::command]
pub fn get_state(state: State<'_, Arc<Mutex<SharedState>>>) -> StateResponse {
    let s = state.lock().expect("state lock");
    StateResponse {
        ok: true,
        message: serde_json::to_string(&*s).unwrap_or_default(),
    }
}

/// XState 权威状态的镜像回写。只写不 emit (emit 方向是 Rust → webview,
/// 这里反向, 无循环)。
#[tauri::command]
pub fn sync_state(
    payload: SyncPayload,
    state: State<'_, Arc<Mutex<SharedState>>>,
) -> StateResponse {
    let mut s = state.lock().expect("state lock");
    s.scene = payload.scene;
    s.bubble = payload.bubble;
    s.bubble_hide_at = payload.bubble_hide_at;
    s.affection = payload.affection.min(100);
    s.position = payload.position;
    StateResponse {
        ok: true,
        message: "synced".to_string(),
    }
}
