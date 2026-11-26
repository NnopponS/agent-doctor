# Agent Doctor for Rust

Audit an MCP tool catalog locally, then catch changes that could break existing callers before shipping. No Node.js, server connections, or credentials are needed to run the Rust CLI.

## Try it

From the repository root, with Rust 1.85 or newer:

```sh
cargo run --locked --manifest-path rust/Cargo.toml -- audit rust/examples/baseline.json
cargo run --locked --manifest-path rust/Cargo.toml -- compare rust/examples/baseline.json rust/examples/breaking.json
```

The comparison flags two changes: a new required argument and an enum that no longer accepts `api`. To install the standalone command from this checkout:

```sh
cargo install --path rust --locked
agent-doctor audit rust/examples/baseline.json --json
```

Both commands accept a tool array, `{"tools":[...]}`, or a JSON-RPC `result.tools` response. Use `-` for one standard-input argument. Input is capped at 1 MB and 500 tools. Audit sizes are compact UTF-8 bytes, not model tokens. Reports are deterministic for the same input.

## Add a compatibility gate to CI

Export a baseline catalog from your last release and a candidate from the change under review, then run:

```sh
agent-doctor compare baseline.json candidate.json --json --fail-on-breaking
```

| Exit code | Meaning |
| --- | --- |
| 0 | Command succeeded; with the gate enabled, no covered breaking changes were found |
| 1 | Invalid input, usage, or I/O failure |
| 2 | At least one covered breaking change; the report is still written to stdout |

The gate checks tool removal, missing input schemas, newly required arguments, selected top-level type and enum restrictions, and closed argument sets. Other schema changes are flagged for review. It does **not** prove JSON Schema compatibility: nested constraints, references, compositions, custom keywords, output validation, and server behavior need independent tests. Reports include tool and argument names; review them before sharing.

## What still runs on Node.js?

The existing npm package, browser workbench and its TypeScript analyzer, GitHub Action, live stdio inspector and stack auditor remain available. Native audit and compare are a separate implementation with a different report format, not a drop-in replacement for those workflows.
