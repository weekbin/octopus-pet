// mcp_roundtrip.rs — integration test for the MCP stdio server.
//
// We invoke the binary with --mcp-stdio, feed it JSON-RPC requests on stdin,
// and verify the responses on stdout. This catches:
//   - JSON-RPC 2.0 protocol conformance
//   - initialize handshake
//   - tools/list schema
//   - tools/call dispatch
//
// Run with: `cargo test --test mcp_roundtrip -- --nocapture`

use std::io::Write;
use std::process::{Command, Stdio};

fn octopus_pet_bin() -> std::path::PathBuf {
    // Tests run from src-tauri/, so the binary is at target/debug/octopus-pet.
    let mut p = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    p.push("target");
    p.push("debug");
    p.push("octopus-pet");
    p
}

fn run_mcp(requests: &[&str]) -> Vec<serde_json::Value> {
    let bin = octopus_pet_bin();
    if !bin.exists() {
        // Try release path (CI sometimes builds release only)
        let release = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("target")
            .join("release")
            .join("octopus-pet");
        if !release.exists() {
            panic!(
                "octopus-pet binary not found at {:?} or {:?}; build with `cargo build` first",
                bin, release
            );
        }
        return run_mcp_with(Command::new(release), requests);
    }
    run_mcp_with(Command::new(&bin), requests)
}

fn run_mcp_with(mut cmd: Command, requests: &[&str]) -> Vec<serde_json::Value> {
    use std::io::Read;

    cmd.stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .arg("--mcp-stdio");

    let mut child = cmd.spawn().expect("failed to spawn octopus-pet");
    let mut stdin = child.stdin.take().expect("no stdin");

    for req in requests {
        writeln!(stdin, "{}", req).expect("failed to write to stdin");
    }
    drop(stdin); // EOF

    let mut out = String::new();
    child
        .stdout
        .as_mut()
        .unwrap()
        .read_to_string(&mut out)
        .expect("failed to read stdout");

    let status = child.wait().expect("failed to wait");
    if !status.success() {
        let mut err = String::new();
        let _ = child.stderr.unwrap().read_to_string(&mut err);
        panic!(
            "octopus-pet exited with status {:?}\nstdout:\n{}\nstderr:\n{}",
            status, out, err
        );
    }

    out.lines()
        .filter(|l| !l.is_empty())
        .map(|l| serde_json::from_str(l).expect("invalid JSON in response"))
        .collect()
}

#[test]
fn initialize_handshake() {
    let responses = run_mcp(&[r#"{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}"#]);

    assert_eq!(responses.len(), 1);
    let r = &responses[0];
    assert_eq!(r["jsonrpc"], "2.0");
    assert_eq!(r["id"], 1);

    let result = &r["result"];
    assert_eq!(result["protocolVersion"], "2024-11-05");
    assert_eq!(result["serverInfo"]["name"], "octopus-pet");
    assert!(result["capabilities"]["tools"].is_object());
}

#[test]
fn tools_list_returns_six_tools() {
    let responses = run_mcp(&[r#"{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}"#]);
    assert_eq!(responses.len(), 1);

    let tools = responses[0]["result"]["tools"].as_array().expect("tools must be array");
    assert_eq!(tools.len(), 6, "expected 6 MCP tools per plan §1.9.4");

    let names: Vec<&str> = tools.iter().map(|t| t["name"].as_str().unwrap()).collect();
    assert!(names.contains(&"pet_show"));
    assert!(names.contains(&"pet_ask"));
    assert!(names.contains(&"pet_get_state"));
    assert!(names.contains(&"pet_set_state"));
    assert!(names.contains(&"pet_pet"));
    assert!(names.contains(&"pet_list_states"));
}

#[test]
fn tools_call_returns_content() {
    let responses = run_mcp(&[r#"{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"pet_show","arguments":{"state":"payday"}}}"#]);
    assert_eq!(responses.len(), 1);
    let content = &responses[0]["result"]["content"];
    assert!(content.is_array());
    let text = content[0]["text"].as_str().expect("text field");
    assert!(text.contains("payday"), "stub should mention state, got: {}", text);
}

#[test]
fn unknown_method_returns_error() {
    let responses = run_mcp(&[r#"{"jsonrpc":"2.0","id":4,"method":"nonexistent","params":{}}"#]);
    assert_eq!(responses.len(), 1);
    let r = &responses[0];
    assert!(r["error"].is_object());
    assert_eq!(r["error"]["code"], -32601);
}

#[test]
fn multiple_sequential_requests() {
    let responses = run_mcp(&[
        r#"{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}"#,
        r#"{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}"#,
        r#"{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"pet_pet","arguments":{}}}"#,
    ]);
    assert_eq!(responses.len(), 3);
    assert_eq!(responses[0]["id"], 1);
    assert_eq!(responses[1]["id"], 2);
    assert_eq!(responses[2]["id"], 3);
}

#[test]
fn state_persists_across_calls() {
    // pet_show payday, then pet_get_state, then pet_pet; verify state changes persist.
    let responses = run_mcp(&[
        r#"{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"pet_show","arguments":{"state":"payday"}}}"#,
        r#"{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"pet_pet","arguments":{}}}"#,
        r#"{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"pet_get_state","arguments":{}}}"#,
    ]);
    assert_eq!(responses.len(), 3);
    let state_text = responses[2]["result"]["content"][0]["text"]
        .as_str()
        .expect("get_state returns text");
    let state: serde_json::Value = serde_json::from_str(state_text).expect("state is JSON");
    assert_eq!(state["scene"], "payday", "pet_show should persist");
    assert_eq!(state["affection"], 5, "pet_pet should bump affection to 5");
    assert_eq!(state["bubble"], "啊~", "pet_pet should set bubble");
}

#[test]
fn show_rejects_unknown_scene() {
    let responses = run_mcp(&[r#"{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"pet_show","arguments":{"state":"NOT_A_SCENE"}}}"#]);
    assert!(responses[0]["error"].is_object());
    assert_eq!(responses[0]["error"]["code"], -32602);
}

#[test]
fn list_states_returns_14() {
    let responses = run_mcp(&[r#"{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"pet_list_states","arguments":{}}}"#]);
    let text = responses[0]["result"]["content"][0]["text"]
        .as_str()
        .expect("list returns text");
    let arr: serde_json::Value = serde_json::from_str(text).expect("list is JSON array");
    let arr = arr.as_array().expect("must be array");
    assert_eq!(arr.len(), 14, "exactly 14 scenes per plan §1.9.2");
}
