// mcp_stdio.rs — MCP stdio server with shared state.
//
// Per plan §1.6 + §1.8 + §1.9.4: the .app is spawned by mcode as a child process
// with --mcp-stdio flag; the plugin runs JSON-RPC 2.0 over stdin/stdout per
// modelcontextprotocol.io spec 2024-11-05.
//
// The server handles initialize / tools/list / tools/call with the 6 tools
// from §1.9.4. State changes are persisted to SharedState (so HTTP fallback
// and webview see the same picture) AND emitted to the webview as tauri events.

use anyhow::Result;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::sync::{Arc, Mutex};
use tauri::AppHandle;
use tokio::io::{AsyncBufReadExt, BufReader};

use crate::actions;
use crate::state_bridge::SharedState;

#[derive(Debug, Deserialize)]
struct JsonRpcRequest {
    jsonrpc: String,
    id: Option<Value>,
    method: String,
    #[serde(default)]
    params: Value,
}

#[derive(Debug, Serialize)]
struct JsonRpcResponse {
    jsonrpc: String,
    id: Value,
    #[serde(skip_serializing_if = "Option::is_none")]
    result: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<Value>,
}

pub const TOOL_PET_SHOW: &str = "pet_show";
pub const TOOL_PET_ASK: &str = "pet_ask";
pub const TOOL_PET_GET_STATE: &str = "pet_get_state";
pub const TOOL_PET_SET_STATE: &str = "pet_set_state";
pub const TOOL_PET_PET: &str = "pet_pet";
pub const TOOL_PET_LIST_STATES: &str = "pet_list_states";

pub const SCENES: &[&str] = &[
    "pretend-busy",
    "stay-late",
    "breakdown",
    "lying-flat",
    "multi-tasking",
    "payday",
    "salary-rejected",
    "treat-milk-tea",
    "friday-5pm",
    "toilet-slacking",
    "touch-fish",
    "waiting-m3pro",
    "soul-leaving",
    "multitask",
];

/// Start the MCP stdio server. `app` is optional: when None (headless mode),
/// tauri events are not emitted; when Some, tool calls also push to the webview.
pub async fn serve(app: Option<AppHandle>, state: Arc<Mutex<SharedState>>) -> Result<()> {
    let stdin = tokio::io::stdin();
    let mut reader = BufReader::new(stdin);
    let mut buf = String::new();

    tracing::info!("MCP stdio server starting");

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
        match serde_json::from_str::<JsonRpcRequest>(line) {
            Ok(req) => {
                let resp = handle_request(app.as_ref(), &state, req).await;
                println!("{}", serde_json::to_string(&resp)?);
            }
            Err(e) => {
                tracing::warn!("MCP stdio: bad JSON: {} (line: {:?})", e, line);
            }
        }
    }
    Ok(())
}

async fn handle_request(
    app: Option<&AppHandle>,
    state: &Arc<Mutex<SharedState>>,
    req: JsonRpcRequest,
) -> JsonRpcResponse {
    let id = req.id.clone().unwrap_or(Value::Null);
    match req.method.as_str() {
        "initialize" => JsonRpcResponse {
            jsonrpc: "2.0".into(),
            id,
            result: Some(json!({
                "protocolVersion": "2024-11-05",
                "serverInfo": {
                    "name": "octopus-pet",
                    "version": env!("CARGO_PKG_VERSION"),
                },
                "capabilities": { "tools": {} }
            })),
            error: None,
        },
        "tools/list" => JsonRpcResponse {
            jsonrpc: "2.0".into(),
            id,
            result: Some(json!({
                "tools": [
                    tool_schema(TOOL_PET_SHOW, "切场景 (强制 FSM 跳到指定 OctopusScene)", json!({
                        "type": "object",
                        "properties": { "state": { "type": "string", "enum": SCENES } },
                        "required": ["state"]
                    })),
                    tool_schema(TOOL_PET_ASK, "弹气泡 (≤ 12 字)", json!({
                        "type": "object",
                        "properties": { "text": { "type": "string", "maxLength": 12 } },
                        "required": ["text"]
                    })),
                    tool_schema(TOOL_PET_GET_STATE, "查当前 OctopusState (含 scene/frame/bubble/affection/position)", json!({"type": "object"})),
                    tool_schema(TOOL_PET_SET_STATE, "pet_show 别名", json!({
                        "type": "object",
                        "properties": { "state": { "type": "string", "enum": SCENES } },
                        "required": ["state"]
                    })),
                    tool_schema(TOOL_PET_PET, "摸头, affection += 5", json!({"type": "object"})),
                    tool_schema(TOOL_PET_LIST_STATES, "返回 14 场景列表", json!({"type": "object"})),
                ]
            })),
            error: None,
        },
        "tools/call" => handle_tool_call(app, state, id, req.params).await,
        _ => JsonRpcResponse {
            jsonrpc: "2.0".into(),
            id,
            result: None,
            error: Some(json!({ "code": -32601, "message": format!("method not found: {}", req.method) })),
        },
    }
}

fn tool_schema(name: &str, description: &str, input_schema: Value) -> Value {
    json!({ "name": name, "description": description, "inputSchema": input_schema })
}

async fn handle_tool_call(
    app: Option<&AppHandle>,
    state: &Arc<Mutex<SharedState>>,
    id: Value,
    params: Value,
) -> JsonRpcResponse {
    let name = params.get("name").and_then(|v| v.as_str()).unwrap_or("");
    let args = params.get("arguments").cloned().unwrap_or(json!({}));
    let now = now_ms();

    match name {
        TOOL_PET_SHOW | TOOL_PET_SET_STATE => {
            let scene = args.get("state").and_then(|v| v.as_str()).unwrap_or("");
            match actions::apply_show(app, state, scene, now) {
                Ok(msg) => text_response(id, msg),
                Err(e) => err_response(id, -32602, e),
            }
        }
        TOOL_PET_ASK => {
            let text = args.get("text").and_then(|v| v.as_str()).unwrap_or("");
            match actions::apply_ask(app, state, text, now) {
                Ok(msg) => text_response(id, msg),
                Err(e) => err_response(id, -32602, e),
            }
        }
        TOOL_PET_PET => match actions::apply_pet(app, state, now) {
            Ok(msg) => text_response(id, msg),
            Err(e) => err_response(id, -32602, e),
        },
        TOOL_PET_GET_STATE => {
            let s = state.lock().expect("state lock");
            let state_json = serde_json::to_string(&*s).unwrap_or_else(|_| "{}".to_string());
            drop(s);
            JsonRpcResponse {
                jsonrpc: "2.0".into(),
                id,
                result: Some(json!({
                    "content": [{"type": "text", "text": state_json}],
                    "isError": false
                })),
                error: None,
            }
        }
        TOOL_PET_LIST_STATES => JsonRpcResponse {
            jsonrpc: "2.0".into(),
            id,
            result: Some(json!({
                "content": [{
                    "type": "text",
                    "text": serde_json::to_string(SCENES).unwrap()
                }],
                "isError": false
            })),
            error: None,
        },
        other => err_response(id, -32602, format!("unknown tool: {}", other)),
    }
}

fn err_response(id: Value, code: i32, message: String) -> JsonRpcResponse {
    JsonRpcResponse {
        jsonrpc: "2.0".into(),
        id,
        result: None,
        error: Some(json!({ "code": code, "message": message })),
    }
}

fn text_response(id: Value, text: String) -> JsonRpcResponse {
    JsonRpcResponse {
        jsonrpc: "2.0".into(),
        id,
        result: Some(json!({
            "content": [{"type": "text", "text": text}],
            "isError": false
        })),
        error: None,
    }
}

pub fn now_ms() -> u64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}
