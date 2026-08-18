// mcp_stdio.rs — MCP stdio server (V1 stub).
//
// Per plan §1.6 + §1.8 + §1.9.4: the .app is spawned by mcode as a child process
// with --mcp-stdio flag; the plugin runs JSON-RPC 2.0 over stdin/stdout per
// modelcontextprotocol.io spec 2024-11-05.
//
// V1 (W1 D5) scope:
//   - Listen on stdin for JSON-RPC requests
//   - Handle `initialize`, `tools/list`, `tools/call` (with the 6 tools from §1.9.4)
//   - Emit `tauri://event` events to the webview for each tool call so the React
//     side updates the FSM
//
// W2 will flesh out: full MCP schema, resources, prompts, proper error handling.

use anyhow::Result;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tauri::{AppHandle, Emitter};
use tokio::io::{AsyncBufReadExt, BufReader};

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

const TOOL_PET_SHOW: &str = "pet_show";
const TOOL_PET_ASK: &str = "pet_ask";
const TOOL_PET_GET_STATE: &str = "pet_get_state";
const TOOL_PET_SET_STATE: &str = "pet_set_state";
const TOOL_PET_PET: &str = "pet_pet";
const TOOL_PET_LIST_STATES: &str = "pet_list_states";

const TOOLS: &[&str] = &[
    TOOL_PET_SHOW,
    TOOL_PET_ASK,
    TOOL_PET_GET_STATE,
    TOOL_PET_SET_STATE,
    TOOL_PET_PET,
    TOOL_PET_LIST_STATES,
];

const SCENES: &[&str] = &[
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

pub async fn serve(_app: AppHandle) -> Result<()> {
    let stdin = tokio::io::stdin();
    let mut reader = BufReader::new(stdin);
    let mut buf = String::new();

    tracing::info!("MCP stdio server starting (V1 stub)");

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
                let resp = handle_request(&_app, req).await;
                let s = serde_json::to_string(&resp)?;
                println!("{}", s);
            }
            Err(e) => {
                tracing::warn!("MCP stdio: bad JSON: {} (line: {:?})", e, line);
            }
        }
    }
    Ok(())
}

async fn handle_request(app: &AppHandle, req: JsonRpcRequest) -> JsonRpcResponse {
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
                "capabilities": {
                    "tools": {}
                }
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
                        "properties": {
                            "state": {"type": "string", "enum": SCENES}
                        },
                        "required": ["state"]
                    })),
                    tool_schema(TOOL_PET_ASK, "弹气泡 (≤ 12 字)", json!({
                        "type": "object",
                        "properties": {
                            "text": {"type": "string", "maxLength": 12}
                        },
                        "required": ["text"]
                    })),
                    tool_schema(TOOL_PET_GET_STATE, "查当前 OctopusState (含 scene/frame/bubble/affection/position)", json!({"type": "object"})),
                    tool_schema(TOOL_PET_SET_STATE, "pet_show 别名", json!({
                        "type": "object",
                        "properties": {
                            "state": {"type": "string", "enum": SCENES}
                        },
                        "required": ["state"]
                    })),
                    tool_schema(TOOL_PET_PET, "摸头, affection += 5", json!({"type": "object"})),
                    tool_schema(TOOL_PET_LIST_STATES, "返回 14 场景列表", json!({"type": "object"})),
                ]
            })),
            error: None,
        },
        "tools/call" => handle_tool_call(app, id, req.params).await,
        _ => JsonRpcResponse {
            jsonrpc: "2.0".into(),
            id,
            result: None,
            error: Some(json!({
                "code": -32601,
                "message": format!("method not found: {}", req.method)
            })),
        },
    }
}

fn tool_schema(name: &str, description: &str, input_schema: Value) -> Value {
    json!({
        "name": name,
        "description": description,
        "inputSchema": input_schema
    })
}

async fn handle_tool_call(app: &AppHandle, id: Value, params: Value) -> JsonRpcResponse {
    let name = params.get("name").and_then(|v| v.as_str()).unwrap_or("");
    let args = params.get("arguments").cloned().unwrap_or(json!({}));

    let (result_text, event_to_emit) = match name {
        TOOL_PET_SHOW | TOOL_PET_SET_STATE => {
            let state = args.get("state").and_then(|v| v.as_str()).unwrap_or("");
            if !SCENES.contains(&state) {
                return err_response(id, -32602, format!("unknown scene: {}", state));
            }
            (
                format!("switched to {}", state),
                Some(json!({"type": "FORCE_SCENE", "scene": state, "now": chrono_now_ms()})),
            )
        }
        TOOL_PET_ASK => {
            let text = args.get("text").and_then(|v| v.as_str()).unwrap_or("");
            if text.is_empty() {
                return err_response(id, -32602, "text is required".to_string());
            }
            let text = if text.chars().count() > 12 {
                text.chars().take(12).collect::<String>()
            } else {
                text.to_string()
            };
            (
                format!("bubble: {}", text),
                Some(json!({"type": "ASK", "text": text, "now": chrono_now_ms()})),
            )
        }
        TOOL_PET_PET => (
            "pet!".to_string(),
            Some(json!({"type": "PET", "now": chrono_now_ms()})),
        ),
        TOOL_PET_GET_STATE => {
            // V1 stub: return a placeholder. The actual state lives in the webview;
            // we should round-trip via tauri events, but for V1 we just emit a
            // request and let the webview respond via a different channel.
            return JsonRpcResponse {
                jsonrpc: "2.0".into(),
                id,
                result: Some(json!({
                    "content": [{"type": "text", "text": "see octopus://state/get-response"}],
                    "isError": false
                })),
                error: None,
            };
        }
        TOOL_PET_LIST_STATES => {
            return JsonRpcResponse {
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
            };
        }
        other => return err_response(id, -32602, format!("unknown tool: {}", other)),
    };

    if let Some(evt) = event_to_emit {
        if let Err(e) = app.emit("octopus://event", evt) {
            tracing::error!("failed to emit octopus://event: {:?}", e);
        }
    }

    JsonRpcResponse {
        jsonrpc: "2.0".into(),
        id,
        result: Some(json!({
            "content": [{"type": "text", "text": result_text}],
            "isError": false
        })),
        error: None,
    }
}

fn err_response(id: Value, code: i32, message: String) -> JsonRpcResponse {
    JsonRpcResponse {
        jsonrpc: "2.0".into(),
        id,
        result: None,
        error: Some(json!({"code": code, "message": message})),
    }
}

fn chrono_now_ms() -> u64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}
