# Agent Doctor

Audit MCP tool schemas and agent repositories. Find schema issues, see which tools use the most context, and review changes before release.

[Open the browser workbench](https://nnoppons.github.io/agent-doctor/) · [Rust quickstart](#rust-quickstart) · [Node.js quickstart](#quickstart-from-source) · [GitHub Actions](#use-in-github-actions-static-schema--sarif)

[![CI status](https://github.com/NnopponS/agent-doctor/actions/workflows/ci.yml/badge.svg)](https://github.com/NnopponS/agent-doctor/actions/workflows/ci.yml) [![MIT license](https://img.shields.io/badge/license-MIT-green.svg)](./LICENSE)

| If you want to… | Start here |
| --- | --- |
| Inspect or compare exported schemas | [Browser workbench](#browser-workbench). No install or uploads. |
| Check for breaking changes between two tool catalogs | [Native Rust CLI](#rust-quickstart). No Node.js or server needed. |
| Audit `AGENTS.md`, skills, MCP config, and A2A agent cards | [CLI quickstart](#quickstart-from-source) |
| Gate a pull request or export code-scanning results | [GitHub Actions and SARIF](#use-in-github-actions-static-schema--sarif) |

## Browser workbench

1. Open the [workbench](https://nnoppons.github.io/agent-doctor/) and select **Try example**, or paste or open a JSON file.
2. To review a change, select **Compare versions**. Add the baseline and candidate, then select **Compare schemas**.
3. Review tool changes and the **New** and **Resolved** findings. Export **Markdown** for a review or **JSON** for tooling.

The workbench accepts a tool array, a `tools/list` result, or its JSON-RPC response. It uses the TypeScript CLI's static analyzer and input parser. It does not upload your inputs, save them to local storage, launch processes, or connect to MCP servers. Reports include tool names and finding details; review them before sharing.

The comparison matches tools by exact name. A rename appears as a removal and an addition. It matches findings by rule, target, and severity; those checks do not establish compatibility. Health scores and context sizes are estimates, not a security or conformance result.

## Rust quickstart

The native Rust CLI audits tool exports and checks for selected breaking changes. Try the bundled example from a checkout with Rust 1.85+:

```sh
cargo run --locked --manifest-path rust/Cargo.toml -- compare rust/examples/baseline.json rust/examples/breaking.json
```

For CI, add `--json --fail-on-breaking` to get a machine-readable report and exit code 2 if the gate finds a covered break, such as a removed tool, a newly required argument, or a narrowed enum. [Install, use with CI, or see what the gate covers](rust/README.md). This is a standalone native workflow, not a replacement for the Node.js MCP server, browser engine, or broader stack checks.

## Quickstart from source

With Node.js 18+:

```sh
git clone https://github.com/NnopponS/agent-doctor.git
cd agent-doctor
npm ci
npm run build

# Analyze bundled sample, or substitute your own tools/list export.
node dist/cli.js analyze examples/bloated-tools.json --json
node dist/cli.js stack . --ci

# Validate an Agent Card or launch the local dashboard.
node dist/cli.js a2a .well-known/agent-card.json --ci
node dist/cli.js ui
```

Use **analyze** for static files. Use **check** only with a trusted local command you intend to launch.

## CLI commands

| Command | Purpose |
| :--- | :--- |
| `agent-doctor stack [dir]` | Audits repository instructions, agent skills, MCP config, and A2A agent cards |
| `agent-doctor analyze <tools.json>` | Audits an MCP tool-schema export without launching a server |
| `agent-doctor check "<cmd>"` | Starts a trusted local MCP stdio command and checks `initialize` + `tools/list` (legacy lifecycle) |
| `agent-doctor fix <tools.json>` | Applies supported fixes, such as sorting schema keys and removing volatile timestamps |
| `agent-doctor migrate-skills <tools.json>` | Converts bloated MCP tools into progressive-disclosure `.agents/skills/<slug>/SKILL.md` files |
| `agent-doctor a2a <agent-card.json>` | Audits Agent2Agent cards for identity, TLS, `securitySchemes`, `streaming`, and `skills[]` |
| `agent-doctor scan-config [mcp.json]` | Detects plaintext API keys (`sk-`, `ghp_`, `AIza`, `AKIA`), duplicate servers, and legacy SSE URLs (`MCP020`) |
| `agent-doctor badge <target> --out <svg>` | Generates an embeddable SVG Health Score + Token Tax badge |
| `agent-doctor init-skill` | Installs `agent-doctor` as a portable `SKILL.md` in `.agents/skills/agent-doctor/` |
| `agent-doctor ui` | Launches the localhost Web Dashboard (`http://127.0.0.1:4310`) |
| `agent-doctor mcp` | Runs Agent Doctor as a seven-tool MCP server over local stdio |

---

## Use in GitHub Actions (static schema + SARIF)

Place a tools/list JSON export at `tools.json` and add this step after checkout in a job with Node.js 18 or later. Use `stack-dir` instead of `schema-file` for a repository-wide audit. Avoid running untrusted commands in a workflow.

```yaml
- name: Audit AI Agent Stack & MCP Schemas
  uses: NnopponS/agent-doctor@4268f20385c083bc38df50c2df67fd3da2d3388f # tested composite action commit
  with:
    schema-file: 'tools.json'
    sarif-output: 'agent-doctor.sarif'
    fail-on-issues: 'true'
```

Export OASIS **SARIF 2.1.0** for GitHub Code Scanning:

```bash
node dist/cli.js analyze tools.json --sarif > agent-doctor.sarif
```

## Token and cost estimates

Context counts are heuristic estimates, not provider token usage. Cost profiles use the example rates and multipliers in [src/tokenizer.ts](./src/tokenizer.ts). They are not verified provider pricing, tokenizer specifications, or a guarantee of cache hits. Use your own provider's usage and rates for billing decisions.

## Diagnostic rules

- **Schema & Ergonomics (`MCP001`–`MCP007`, `MCP013`, `MCP015`)**: Root `type: "object"`, missing/verbose descriptions (`> 550` chars), untyped/undocumented parameters, ghost `required` fields, nesting depth `> 4`, portable naming, missing `enum`.
- **Context Token & Prompt Caching (`MCP008`–`MCP011`, `MCP018`)**: Single tool `> 400` / `> 1,000` tok, server payload `> 4,000` / `> 10,000` tok, volatile timestamps/UUIDs that bust prefix prompt caching.
- **MCP protocol, transport & latency (`MCP000`, `MCP016`, `MCP017`, `MCP019`, `MCP020`)**: Non-JSON stdout pollution, cold-start `> 2,000 ms`, missing `readOnlyHint`/`destructiveHint` annotations, deprecated HTTP+SSE or unencrypted HTTP endpoints.
- **AAIF Stack (`AGT001`–`AGT002`, `SKL001`–`SKL003`, `A2A001`–`A2A004`, `SEC001`)**: `AGENTS.md` `> 1,500` tok budget, `SKILL.md` frontmatter `> 120` tok budget, A2A Agent Card TLS & security schemes, and hardcoded credential detection.

---

## Run Agent Doctor as a local MCP server

The bundled server and live inspector currently use the legacy initialization flow. The [2026-07-28 MCP revision](https://blog.modelcontextprotocol.io/posts/2026-07-28/) uses stateless per-request metadata instead; the live self-test is not evidence of compatibility with that revision. Static tool-schema audits do not depend on the transport lifecycle.

After the build above, configure an MCP client with the absolute path to the compiled entry point. The example uses the `.mcp.json` format; client configuration varies.

```json
{
  "mcpServers": {
    "agent-doctor": {
      "command": "node",
      "args": ["/absolute/path/to/agent-doctor/dist/cli.js", "mcp"]
    }
  }
}
```

Exposes seven tools with read-only annotations: `diagnose_mcp_server`, `audit_tool_schemas`, `auto_fix_tool_schemas`, `estimate_context_cost`, `scan_mcp_config`, `audit_agent_stack`, and `generate_mcp_badge`.

---

## Development

Run `cargo test --locked --manifest-path rust/Cargo.toml` to test the native CLI. Run `npm test` to build the TypeScript CLI and check the browser workbench. If you edit the analyzer or parser, run `npm run build:pages` and commit the updated `docs/engine/` files. To preview Pages, serve the tracked `docs/` directory with a local HTTP server, for example `python3 -m http.server 8080 --directory docs`.

## License

MIT © [Worapon Sangsasri (NnopponS)](https://github.com/NnopponS)
