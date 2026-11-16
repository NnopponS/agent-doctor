# Changelog

## v1.0.0 (2026-11-17)

- Initial release of `@nnoppons/mcp-doctor`.
- Live JSON-RPC 2.0 stdio handshake inspector (`initialize`, `notifications/initialized`, `tools/list`, `resources/list`, `prompts/list`) with millisecond phase timing (`spawnMs`, `initializeMs`, `toolsListMs`).
- Per-tool context token profiler and multi-model USD cost calculator (`Claude Sonnet 4`, `Claude Opus 4`, `GPT-5`, `Gemini 2.5 Pro`, `DeepSeek V3`).
- Declarative 16-rule diagnostic registry (`MCP001`-`MCP016` + `MCP017` stdout hygiene) covering JSON Schema validity, LLM ergonomics, token bloat, cold-start latency, and boundary security.
- Local MCP configuration scanner (`scan-config`) with plaintext API key detection and duplicate server detection.
- Interactive local Web Dashboard (`mcp-doctor ui`) and self-hosted MCP server mode (`mcp-doctor mcp`).
