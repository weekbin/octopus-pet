// http_fallback.rs — HTTP :9527 fallback server per plan §1.6.
//
// Why: mcode (and other clients) primarily talk MCP over stdio. But for
// debugging, browser inspection, or load balancers, a small HTTP endpoint
// that exposes the same 6 tools + state query is useful. Disabled by default
// (env OCTOPUS_HTTP_FALLBACK=true to enable, OCTOPUS_PORT to change port).
//
// Endpoints:
//   GET  /health          → {ok: true, version}
//   GET  /state           → current OctopusState JSON
//   GET  /scenes          → list of 14 scenes
//   POST /show            → {"state": "payday"}       (force scene)
//   POST /ask             → {"text": "hello"}         (ask bubble)
//   POST /pet             → {}                        (pet, affection +5)
//
// POST 端点全部委托给 actions::apply_* (唯一逻辑点), 与 MCP 行为一致,
// 并持有 AppHandle → emit "octopus://event" → 前端 XState 实时响应。
//
// We use plain TCP + hand-rolled HTTP/1.1 (no framework) to keep the binary
// small and avoid pulling axum/hyper. octocat-pet is a tiny app; HTTP fallback
// is dev-only.

use std::io::{BufRead, BufReader, Read, Write};
use std::net::{TcpListener, TcpStream};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use tauri::AppHandle;

use crate::actions;
use crate::mcp_stdio::SCENES;
use crate::state_bridge::SharedState;

pub fn start(
    app: Option<AppHandle>,
    state: Arc<Mutex<SharedState>>,
    port: u16,
) -> std::io::Result<()> {
    let listener = TcpListener::bind(("127.0.0.1", port))?;
    let bound_port = listener.local_addr()?.port();
    tracing::info!("HTTP fallback listening on http://127.0.0.1:{}", bound_port);
    eprintln!("OCTOPUS_HTTP_FALLBACK_URL=http://127.0.0.1:{}", bound_port);

    for stream in listener.incoming() {
        match stream {
            Ok(s) => {
                let state = state.clone();
                let app = app.clone();
                std::thread::spawn(move || {
                    if let Err(e) = handle_client(s, app.as_ref(), state) {
                        tracing::warn!("HTTP client error: {:?}", e);
                    }
                });
            }
            Err(e) => tracing::warn!("HTTP accept error: {:?}", e),
        }
    }
    Ok(())
}

fn handle_client(
    mut stream: TcpStream,
    app: Option<&AppHandle>,
    state: Arc<Mutex<SharedState>>,
) -> std::io::Result<()> {
    stream.set_read_timeout(Some(Duration::from_secs(5)))?;
    stream.set_write_timeout(Some(Duration::from_secs(5)))?;

    let mut reader = BufReader::new(stream.try_clone()?);
    let mut request_line = String::new();
    reader.read_line(&mut request_line)?;
    let parts: Vec<&str> = request_line.split_whitespace().collect();
    if parts.len() < 2 {
        return write_response(&mut stream, 400, "Bad Request", "text/plain", b"bad request");
    }
    let method = parts[0];
    let path = parts[1];
    tracing::debug!("HTTP {} {}", method, path);

    // Read headers (we don't actually need them; consume until empty line)
    let mut content_length: usize = 0;
    loop {
        let mut line = String::new();
        reader.read_line(&mut line)?;
        if line == "\r\n" || line == "\n" || line.is_empty() {
            break;
        }
        if let Some(v) = line.to_lowercase().strip_prefix("content-length:") {
            content_length = v.trim().parse().unwrap_or(0);
        }
    }

    // Read body if present
    let mut body = vec![0u8; content_length];
    if content_length > 0 {
        reader.read_exact(&mut body)?;
    }

    // Route
    let (status, ctype, resp_body) = route(method, path, &body, app, state);
    write_response(&mut stream, status, status_text(status), ctype, &resp_body)
}

fn route(
    method: &str,
    path: &str,
    body: &[u8],
    app: Option<&AppHandle>,
    state: Arc<Mutex<SharedState>>,
) -> (u16, &'static str, Vec<u8>) {
    let body_str = String::from_utf8_lossy(body).to_string();
    match (method, path) {
        ("GET", "/health") => (
            200,
            "application/json",
            format!(r#"{{"ok":true,"version":"{}"}}"#, env!("CARGO_PKG_VERSION")).into_bytes(),
        ),
        ("GET", "/state") => {
            let s = state.lock().expect("state lock");
            let body = serde_json::to_vec(&*s).unwrap_or_else(|_| b"{}".to_vec());
            (200, "application/json", body)
        }
        ("GET", "/scenes") => {
            let body = serde_json::to_vec(SCENES).unwrap_or_else(|_| b"[]".to_vec());
            (200, "application/json", body)
        }
        ("POST", "/show") => {
            let v: serde_json::Value = serde_json::from_str(&body_str).unwrap_or_default();
            let scene = v.get("state").and_then(|x| x.as_str()).unwrap_or("");
            let now = now_ms();
            match actions::apply_show(app, &state, scene, now) {
                Ok(msg) => (
                    200,
                    "application/json",
                    format!(r#"{{"ok":true,"message":"{}"}}"#, msg).into_bytes(),
                ),
                Err(e) => (
                    400,
                    "application/json",
                    format!(r#"{{"error":"{}"}}"#, e).into_bytes(),
                ),
            }
        }
        ("POST", "/ask") => {
            let v: serde_json::Value = serde_json::from_str(&body_str).unwrap_or_default();
            let text = v.get("text").and_then(|x| x.as_str()).unwrap_or("");
            let now = now_ms();
            match actions::apply_ask(app, &state, text, now) {
                Ok(msg) => (
                    200,
                    "application/json",
                    format!(r#"{{"ok":true,"message":"{}"}}"#, msg).into_bytes(),
                ),
                Err(e) => (
                    400,
                    "application/json",
                    format!(r#"{{"error":"{}"}}"#, e).into_bytes(),
                ),
            }
        }
        ("POST", "/pet") => {
            let now = now_ms();
            match actions::apply_pet(app, &state, now) {
                Ok(msg) => (
                    200,
                    "application/json",
                    format!(r#"{{"ok":true,"message":"{}"}}"#, msg).into_bytes(),
                ),
                Err(e) => (
                    400,
                    "application/json",
                    format!(r#"{{"error":"{}"}}"#, e).into_bytes(),
                ),
            }
        }
        _ => (404, "text/plain", b"not found".to_vec()),
    }
}

fn write_response(
    stream: &mut TcpStream,
    status: u16,
    status_text: &str,
    content_type: &str,
    body: &[u8],
) -> std::io::Result<()> {
    let header = format!(
        "HTTP/1.1 {status} {status_text}\r\nContent-Type: {content_type}\r\nContent-Length: {}\r\nAccess-Control-Allow-Origin: *\r\nConnection: close\r\n\r\n",
        body.len()
    );
    stream.write_all(header.as_bytes())?;
    stream.write_all(body)?;
    stream.flush()?;
    Ok(())
}

fn status_text(code: u16) -> &'static str {
    match code {
        200 => "OK",
        400 => "Bad Request",
        404 => "Not Found",
        500 => "Internal Server Error",
        _ => "Unknown",
    }
}

fn now_ms() -> u64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}
