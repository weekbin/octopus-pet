// actions.rs — 唯一的状态变更逻辑点。
//
// 所有协议入口 (MCP stdio / HTTP fallback) 都调用这里的 apply_* 函数,
// 场景校验 / 12 字截断 / bubble 3s / affection 递增只有一份实现。
//
// 状态权威是前端 XState:
//   - 有 webview 时 (app = Some): 写 SharedState 镜像 + emit "octopus://event",
//     前端 FSM 处理后再经 sync_state 回写镜像 (actions 的写只是 emit 前同步)。
//   - headless 时 (app = None, --mcp-stdio): 无 webview, 直接写 SharedState,
//     供 CLI 测试 / 无 GUI 场景查询。

use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter};

use crate::mcp_stdio::SCENES;
use crate::state_bridge::SharedState;

pub const BUBBLE_DURATION_MS: u64 = 3_000;
pub const MAX_AFFECTION: u32 = 100;
pub const MAX_BUBBLE_CHARS: usize = 12;

/// pet_show / pet_set_state: 强制切场景。
pub fn apply_show(
    app: Option<&AppHandle>,
    state: &Arc<Mutex<SharedState>>,
    scene: &str,
    now: u64,
) -> Result<String, String> {
    if !SCENES.contains(&scene) {
        return Err(format!("unknown scene: {}", scene));
    }
    {
        let mut s = state.lock().expect("state lock");
        s.scene = scene.to_string();
        s.bubble = None;
        s.bubble_hide_at = None;
    }
    if let Some(app) = app {
        let _ = app.emit(
            "octopus://event",
            serde_json::json!({"type": "FORCE_SCENE", "scene": scene, "now": now}),
        );
    }
    Ok(format!("switched to {}", scene))
}

/// pet_ask: 弹气泡 (≤ 12 字)。
pub fn apply_ask(
    app: Option<&AppHandle>,
    state: &Arc<Mutex<SharedState>>,
    text: &str,
    now: u64,
) -> Result<String, String> {
    if text.is_empty() {
        return Err("text is required".to_string());
    }
    let truncated: String = text.chars().take(MAX_BUBBLE_CHARS).collect();
    {
        let mut s = state.lock().expect("state lock");
        s.bubble = Some(truncated.clone());
        s.bubble_hide_at = Some(now + BUBBLE_DURATION_MS);
    }
    if let Some(app) = app {
        let _ = app.emit(
            "octopus://event",
            serde_json::json!({"type": "ASK", "text": truncated, "now": now}),
        );
    }
    Ok(format!("bubble: {}", truncated))
}

/// pet_pet: 摸头, affection += 5 (cap 100), 气泡 "啊~"。
pub fn apply_pet(
    app: Option<&AppHandle>,
    state: &Arc<Mutex<SharedState>>,
    now: u64,
) -> Result<String, String> {
    let affection = {
        let mut s = state.lock().expect("state lock");
        s.affection = (s.affection + 5).min(MAX_AFFECTION);
        s.bubble = Some("啊~".to_string());
        s.bubble_hide_at = Some(now + BUBBLE_DURATION_MS);
        s.affection
    };
    if let Some(app) = app {
        let _ = app.emit("octopus://event", serde_json::json!({"type": "PET", "now": now}));
    }
    Ok(format!("petted (+5 affection, now {})", affection))
}
