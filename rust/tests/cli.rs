use serde_json::{json, Value};
use std::{
    fs,
    io::Write,
    path::PathBuf,
    process::{Command, Stdio},
};

fn invoke(args: &[&str], stdin: Option<&str>) -> std::process::Output {
    let mut command = Command::new(env!("CARGO_BIN_EXE_agent-doctor"));
    command
        .args(args)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    if stdin.is_some() {
        command.stdin(Stdio::piped());
    }
    let mut child = command.spawn().unwrap();
    if let Some(input) = stdin {
        if let Err(e) = child.stdin.take().unwrap().write_all(input.as_bytes()) {
            assert_eq!(e.kind(), std::io::ErrorKind::BrokenPipe);
        }
    }
    child.wait_with_output().unwrap()
}

fn fixture(name: &str, schema: Value) -> PathBuf {
    let dir =
        std::env::temp_dir().join(format!("agent-doctor-test-{}-{}", std::process::id(), name));
    fs::create_dir_all(&dir).unwrap();
    let path = dir.join("tools with spaces.json");
    fs::write(&path, schema.to_string()).unwrap();
    path
}

fn search(description: &str, required: &[&str], values: &[&str]) -> Value {
    json!({
        "name": "search",
        "description": description,
        "inputSchema": {"type":"object", "properties":{
            "query":{"type":"string"}, "scope":{"type":"string", "enum":values}
        }, "required":required}
    })
}

#[test]
fn audit_accepts_jsonrpc_on_stdin_and_reports_missing_description() {
    let input =
        json!({"jsonrpc":"2.0","result":{"tools":[search("", &["query"], &["docs","code"])]}});
    let output = invoke(&["audit", "-", "--json"], Some(&input.to_string()));
    assert!(
        output.status.success(),
        "{}",
        String::from_utf8_lossy(&output.stderr)
    );
    let report: Value = serde_json::from_slice(&output.stdout).unwrap();
    assert_eq!(report["toolCount"], 1);
    assert!(report["compactBytes"].as_u64().unwrap() > 0);
    assert_eq!(report["findings"][0]["code"], "AD001");
}

#[test]
fn gate_detects_tool_removal_required_argument_and_enum_narrowing() {
    let base = fixture(
        "breaking-base",
        json!([search("Search docs", &["query"], &["docs","code"]), {
            "name":"list", "description":"List docs","inputSchema":{"type":"object"}
        }]),
    );
    let next = fixture(
        "breaking-next",
        json!({"tools":[search("Search everything", &["query","scope"], &["docs"])]}),
    );
    let output = invoke(
        &[
            "compare",
            base.to_str().unwrap(),
            next.to_str().unwrap(),
            "--json",
            "--fail-on-breaking",
        ],
        None,
    );
    assert_eq!(
        output.status.code(),
        Some(2),
        "{}",
        String::from_utf8_lossy(&output.stderr)
    );
    let report: Value = serde_json::from_slice(&output.stdout).unwrap();
    let codes: Vec<_> = report["changes"]
        .as_array()
        .unwrap()
        .iter()
        .map(|c| c["code"].as_str().unwrap())
        .collect();
    assert!(codes.contains(&"tool-removed"));
    assert!(codes.contains(&"required-added"));
    assert!(codes.contains(&"enum-narrowed"));
    assert!(codes.contains(&"description-changed"));
    assert_eq!(report["breakingCount"], 3);
}

#[test]
fn gate_does_not_fail_for_description_edit_or_enum_widening() {
    let base = fixture(
        "edit-base",
        json!([search("Search", &["query"], &["docs"])]),
    );
    let next = fixture(
        "edit-next",
        json!([search("Search docs", &["query"], &["docs", "code"])]),
    );
    let output = invoke(
        &[
            "compare",
            base.to_str().unwrap(),
            next.to_str().unwrap(),
            "--fail-on-breaking",
        ],
        None,
    );
    assert!(
        output.status.success(),
        "{}",
        String::from_utf8_lossy(&output.stderr)
    );
    assert!(String::from_utf8(output.stdout)
        .unwrap()
        .contains("0 breaking"));
}

#[test]
fn errors_are_not_empty_success_and_do_not_echo_payloads() {
    for input in [
        r#"{"jsonrpc":"2.0","error":{"message":"do-not-echo"}}"#.to_string(),
        format!(
            "[{},{}]",
            search("one", &[], &["docs"]),
            search("two", &[], &["code"])
        ),
        format!(
            r#"[{{"name":"huge","description":"{}"}}]"#,
            "a".repeat(1_000_001)
        ),
    ] {
        let output = invoke(&["audit", "-", "--json"], Some(&input));
        assert_eq!(output.status.code(), Some(1));
        assert!(output.stdout.is_empty());
        assert!(!String::from_utf8_lossy(&output.stderr).contains("do-not-echo"));
    }
}
