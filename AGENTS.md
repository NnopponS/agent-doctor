# AGENTS.md

## Architecture Overview

- `src/types.ts`: Core domain types (`McpToolDefinition`, `ToolTokenProfile`, `DiagnosticFinding`, `ServerDiagnosisReport`, `ConfigScanReport`).
- `src/tokenizer.ts`: Deterministic BPE token estimator for JSON Schema + prose descriptions and per-1,000-turn model cost table.
- `src/rules.ts`: Declarative rule registry (`DIAGNOSTIC_RULE_REGISTRY`, `MCP001`-`MCP016`).
- `src/analyzer.ts`: Pure analysis engine that combines token profiles, rule evaluation, potential token savings, and 4-pillar health scoring (`Schema 40`, `Tokens 30`, `Latency 15`, `Security 15`).
- `src/inspector.ts`: Live JSON-RPC 2.0 stdio client that spawns a target MCP server and measures handshake latency and stdout hygiene (`MCP017`).
- `src/config-scanner.ts`: Parses `.mcp.json`, `.cursor/mcp.json`, and `claude_desktop_config.json` to flag hardcoded secrets and duplicate server commands.
- `src/mcp-server.ts`: Exposes `mcp-doctor` itself as a stdio MCP server (`diagnose_mcp_server`, `audit_tool_schemas`, `estimate_context_cost`, `scan_mcp_config`).
- `src/web-ui.ts`: Local zero-dependency HTTP dashboard (`mcp-doctor ui`).

## Verification

Run before committing any change:

```bash
npm run typecheck
npm test
node dist/cli.js check "node dist/cli.js mcp" --ci
```
