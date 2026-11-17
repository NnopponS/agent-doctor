# AGENTS.md

`agent-doctor` is a zero-dependency TypeScript/Node.js CLI, MCP 2026 server, and AAIF 4-layer stack auditor.

## Verification Commands

- Build & Run Full Test Suite: `npm test`
- Typecheck Only: `npm run typecheck`
- Run AAIF 4-Layer Self-Audit: `node dist/cli.js stack . --ci`
- Run Live MCP Stdio Self-Check: `node dist/cli.js check "node dist/cli.js mcp" --ci`

## Architecture Boundaries

- Zero external runtime npm dependencies (`node:*` standard library only).
- `src/tokenizer.ts`: Late-2026 frontier model matrix (Claude 5.5 / Fable 5.2, GPT-6 / Codex, Gemini 4 / 3.8, DeepSeek V4-Pro, Qwen 3.8 Max) + cache-busting detection.
- `src/stack-auditor.ts`: Audits `AGENTS.md`, `.agents/skills/*/SKILL.md`, `.mcp.json`, and `/.well-known/agent-card.json` (A2A).
- `src/fixer.ts`: Automatic schema healing, key canonicalization, prompt-cache stabilization, and MCP 2026 annotation synthesis.
- Never write debug logs to `stdout` when running in `mcp` stdio mode; log diagnostics to `stderr`.
