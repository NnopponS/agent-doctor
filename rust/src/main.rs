use agent_doctor::{audit, compare, parse, Catalog, MAX_BYTES};
use serde::Serialize;
use std::{
    env,
    fs::File,
    io::{self, Read, Write},
    process::ExitCode,
};

const HELP: &str = "Agent Doctor — local MCP tool contract auditing

USAGE
  agent-doctor audit <file|-> [--json]
  agent-doctor compare <baseline|-> <candidate|-> [--json] [--fail-on-breaking]

Use - to read one input from stdin. Input is a JSON tool list, not a command.
The compatibility gate checks selected structural changes, not all JSON Schema.
Exit status: 0 success; 1 invalid input or usage; 2 breaking changes when gated.";

fn load(path: &str) -> Result<Catalog, String> {
    let source: Box<dyn Read> = if path == "-" {
        Box::new(io::stdin().lock())
    } else {
        Box::new(File::open(path).map_err(|e| format!("Could not open input: {e}"))?)
    };
    let mut bytes = Vec::new();
    source
        .take((MAX_BYTES + 1) as u64)
        .read_to_end(&mut bytes)
        .map_err(|e| format!("Could not read input: {e}"))?;
    parse(&bytes)
}

fn json(out: &mut impl Write, data: &impl Serialize) -> Result<(), String> {
    serde_json::to_writer_pretty(&mut *out, data).map_err(|e| e.to_string())?;
    writeln!(out).map_err(|e| e.to_string())
}

fn run(args: &[String], output: &mut impl Write) -> Result<u8, String> {
    if args.is_empty() || matches!(args, [arg] if arg == "--help" || arg == "-h") {
        writeln!(output, "{HELP}").map_err(|e| e.to_string())?;
        return Ok(0);
    }
    if matches!(args, [arg] if arg == "--version" || arg == "-V") {
        writeln!(output, "agent-doctor {}", env!("CARGO_PKG_VERSION"))
            .map_err(|e| e.to_string())?;
        return Ok(0);
    }
    let mut paths = Vec::new();
    let mut as_json = false;
    let mut gate = false;
    let mut flags = true;
    for arg in &args[1..] {
        match (flags, arg.as_str()) {
            (true, "--") => flags = false,
            (true, "--json") => as_json = true,
            (true, "--fail-on-breaking") => gate = true,
            (true, flag) if flag.starts_with('-') && flag != "-" => {
                return Err("Unknown option. Run agent-doctor --help.".into())
            }
            _ => paths.push(arg.as_str()),
        }
    }
    match (args[0].as_str(), paths.as_slice()) {
        ("audit", [path]) if !gate => {
            let report = audit(&load(path)?);
            if as_json {
                json(output, &report)?;
            } else {
                writeln!(
                    output,
                    "{} tools · {} compact UTF-8 bytes · {} findings",
                    report.tool_count,
                    report.compact_bytes,
                    report.findings.len()
                )
                .map_err(|e| e.to_string())?;
                for f in report.findings {
                    writeln!(output, "{}  {}: {}", f.code, f.tool, f.message)
                        .map_err(|e| e.to_string())?;
                }
            }
            Ok(0)
        }
        ("compare", &[baseline, candidate]) => {
            if baseline == "-" && candidate == "-" {
                return Err("Only one comparison input can come from stdin.".into());
            }
            let old = load(baseline).map_err(|e| format!("Baseline: {e}"))?;
            let new = load(candidate).map_err(|e| format!("Candidate: {e}"))?;
            let report = compare(&old, &new);
            if as_json {
                json(output, &report)?;
            } else {
                writeln!(
                    output,
                    "{} changes · {} breaking · compact UTF-8 bytes: {} → {}",
                    report.changes.len(),
                    report.breaking_count,
                    report.baseline.compact_bytes,
                    report.candidate.compact_bytes
                )
                .map_err(|e| e.to_string())?;
                for c in &report.changes {
                    let target = c
                        .property
                        .as_ref()
                        .map_or_else(|| c.tool.clone(), |p| format!("{}.{p:?}", c.tool));
                    writeln!(
                        output,
                        "{}  {}  {}: {}",
                        if c.breaking { "BREAKING" } else { "REVIEW" },
                        c.code,
                        target,
                        c.message
                    )
                    .map_err(|e| e.to_string())?;
                }
            }
            Ok(if gate && report.breaking_count != 0 {
                2
            } else {
                0
            })
        }
        _ => Err("Invalid arguments. Run agent-doctor --help.".into()),
    }
}

fn main() -> ExitCode {
    let mut out = io::stdout().lock();
    let args = env::args().skip(1).collect::<Vec<_>>();
    match run(&args, &mut out) {
        Ok(status) => match out.flush() {
            Ok(()) => ExitCode::from(status),
            Err(e) => {
                eprintln!("Could not write output: {e}");
                ExitCode::FAILURE
            }
        },
        Err(error) => {
            eprintln!("{error}");
            ExitCode::FAILURE
        }
    }
}
