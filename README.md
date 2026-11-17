<div align="center">

<img src="./docs/assets/banner.svg" alt="Agent Doctor — 2026 AAIF Agent Stack Inspector, Prompt-Cache Profiler & Schema Auto-Healer" width="100%" />

<p>
  <a href="https://github.com/NnopponS/agent-doctor/actions/workflows/ci.yml"><img src="https://github.com/NnopponS/agent-doctor/actions/workflows/ci.yml/badge.svg" alt="CI Status" /></a>
  <img src="./docs/assets/health-badge.svg" alt="Agent Doctor Self-Audit Score" />
  <img src="https://img.shields.io/badge/Node.js-%3E%3D18.0-339933?style=flat-square&logo=node.js&logoColor=white" alt="Node.js >= 18" />
  <img src="https://img.shields.io/badge/Dependencies-0%20runtime-0284c7?style=flat-square" alt="Zero Runtime Dependencies" />
  <img src="https://img.shields.io/badge/AAIF_2026-AGENTS.md_%7C_SKILL.md_%7C_MCP_%7C_A2A-7c3aed?style=flat-square" alt="AAIF 2026" />
  <a href="https://nnoppons.github.io/agent-doctor/"><img src="https://img.shields.io/badge/Live_Playground-GitHub_Pages-16a34a?style=flat-square" alt="Live Playground" /></a>
  <a href="./LICENSE"><img src="https://img.shields.io/badge/License-MIT-f59e0b?style=flat-square" alt="MIT License" /></a>
</p>

<h3>One-Command 2026 AAIF Agent Stack Auditor, Prompt-Cache Profiler &amp; Schema Auto-Healer</h3>

**[Interactive Web Playground](https://nnoppons.github.io/agent-doctor/)** · **[`llms.txt` (AI Agent Index)](./llms.txt)** · **[MCP Registry (`server.json`)](./server.json)** · **[A2A Agent Card](./.well-known/agent-card.json)**

</div>

---

## Why `agent-doctor` v2.0? (Late-2026 Agent Stack Reality)

In 2026, production AI coding stacks span **4 interoperable layers** under the Agentic AI Foundation (AAIF):

1. **`AGENTS.md` / `CLAUDE.md`** — Always-on repository instructions loaded on every turn.
2. **`SKILL.md` (Agent Skills)** — Progressive-disclosure workflows (~100-token YAML frontmatter; full body loaded on demand).
3. **MCP (`2026-07-28` Spec)** — Tool contracts with behavioral annotations (`readOnlyHint`, `destructiveHint`), `Streamable HTTP`, and `OAuth 2.1` (RFC 9728 + CIMD).
4. **A2A (`/.well-known/agent-card.json`)** — Agent2Agent horizontal discovery cards.

Small mistakes across these layers silently wreck performance and budgets:
- **Prompt-Cache Busting (`MCP018`)**: A single volatile timestamp or UUID inside a tool description breaks prefix prompt caching across turns—turning `$0.10/1M` cache hits on **Claude Sonnet 5.5**, **GPT-6.1 Sol**, or **Gemini 4 Argon** into `$2.00–$10.00/1M` cache-miss bills.
- **Claude 5.x Tokenizer Inflation**: Anthropic models from 4.7+ (**Claude Sonnet 5.5**, **Opus 5.5**, **Fable 5.2**) use the updated tokenizer generating **~30% more tokens** for identical schemas.
- **Deprecated SSE & Missing Safety Annotations (`MCP019` / `MCP020`)**: Legacy dual-endpoint HTTP+SSE configs and tools without `readOnlyHint`/`destructiveHint` fail modern enterprise gateways.

`agent-doctor` catches, profiles, and **automatically heals** all of these in **one zero-dependency binary**.

---

## 30-Second Quickstart

```bash
# 1. Audit your entire repository's 4-layer AAIF stack (AGENTS.md + SKILL.md + MCP 2026 + A2A)
npx -y github:NnopponS/agent-doctor stack . --ci

# 2. Live-inspect any MCP 2026 stdio server (handshake latency + prompt-cache check + 20 rules)
npx -y github:NnopponS/agent-doctor check "node dist/cli.js mcp" --ci

# 3. Auto-fix broken schemas, canonicalize property keys, scrub timestamps & add MCP 2026 annotations
npx -y github:NnopponS/agent-doctor fix examples/bloated-tools.json --out examples/fixed-tools.json

# 4. Migrate bloated always-on MCP tools into progressive SKILL.md bundles (~90% token reduction)
npx -y github:NnopponS/agent-doctor migrate-skills examples/bloated-tools.json --dir .agents/skills

# 5. Validate an A2A Agent Card or launch the local Web Inspector Dashboard
npx -y github:NnopponS/agent-doctor a2a .well-known/agent-card.json --ci
npx -y github:NnopponS/agent-doctor ui
```

---

## 2026 Frontier Model Cost Matrix (Built-In)

`agent-doctor` calculates **Effective Tokens** (including Claude 5.x's `1.30x` tokenizer multiplier) and shows both **Prefix-Cached** and **Uncached (Cache-Bust Penalty)** 1,000-turn bills:

| Provider | Model | Tokenizer Factor | Input Rate ($/1M) | Cache Hit ($/1M) |
| :--- | :--- | :---: | :---: | :---: |
| **Anthropic** | **Claude Sonnet 5.5** (`claude-sonnet-5-5`) | `1.30x` | `$2.00` | `$0.10` |
| **Anthropic** | **Claude Opus 5.5** (`claude-opus-5-5`) | `1.30x` | `$4.00` | `$0.20` |
| **Anthropic** | **Claude Fable 5.2** (`claude-fable-5-2`) | `1.30x` | `$8.00` | `$0.20` |
| **OpenAI** | **GPT-6 Astra** | `1.00x` | `$10.00` | `$1.00` |
| **OpenAI** | **GPT-6.1 Sol** | `1.00x` | `$2.00` | `$0.10` |
| **OpenAI** | **GPT-5.3 Codex** (`gpt-5.3-codex`) | `1.00x` | `$1.75` | `$0.175` |
| **Google** | **Gemini 4 Argon** | `1.00x` | `$2.00` | `$0.10` |
| **Google** | **Gemini 3.8 Flash** | `1.00x` | `$0.75` | `$0.075` |
| **DeepSeek** | **DeepSeek V4-Pro** | `1.05x` | `$0.66` | `$0.022` |
| **Alibaba** | **Qwen 3.8 Max** | `1.05x` | `$2.00` | `$0.20` |

---

## Key Features & Commands

| Command | Purpose |
| :--- | :--- |
| `agent-doctor stack [dir]` | Audits all 4 AAIF layers (`AGENTS.md`, `SKILL.md`, `.mcp.json` / `server.json`, `agent-card.json`) |
| `agent-doctor check "<cmd>"` | Spawns an MCP stdio server with `2026-07-28` handshake, times `initialize` + `tools/list`, runs 20 rules |
| `agent-doctor fix <tools.json>` | Fixes `MCP001`–`MCP019`, sorts property keys for deterministic cache prefixes, strips volatile timestamps |
| `agent-doctor migrate-skills <tools.json>` | Converts bloated MCP tools into progressive-disclosure `.agents/skills/<slug>/SKILL.md` files |
| `agent-doctor a2a <agent-card.json>` | Audits Agent2Agent cards for identity, TLS, `securitySchemes`, `streaming`, and `skills[]` |
| `agent-doctor scan-config [mcp.json]` | Detects plaintext API keys (`sk-`, `ghp_`, `AIza`, `AKIA`), duplicate servers, and legacy SSE URLs (`MCP020`) |
| `agent-doctor badge <target> --out <svg>` | Generates an embeddable SVG Health Score + Token Tax badge |
| `agent-doctor init-skill` | Installs `agent-doctor` as a portable `SKILL.md` in `.agents/skills/agent-doctor/` |
| `agent-doctor ui` | Launches the localhost Web Dashboard (`http://127.0.0.1:4310`) |
| `agent-doctor mcp` | Runs `agent-doctor` itself as a 7-tool MCP 2026 server |

---

## Use in GitHub Actions (CI + SARIF Security Tab)

```yaml
- name: Audit AI Agent Stack & MCP Schemas
  uses: NnopponS/agent-doctor@v2
  with:
    stack-dir: '.'
    fail-on-issues: 'true'
```

Export OASIS **SARIF 2.1.0** for GitHub Code Scanning:

```bash
npx -y github:NnopponS/agent-doctor analyze tools.json --sarif > agent-doctor.sarif
```

---

## Diagnostic Rule Matrix

- **Schema & Ergonomics (`MCP001`–`MCP007`, `MCP013`, `MCP015`)**: Root `type: "object"`, missing/verbose descriptions (`> 550` chars), untyped/undocumented parameters, ghost `required` fields, nesting depth `> 4`, portable naming, missing `enum`.
- **Context Token & Prompt Caching (`MCP008`–`MCP011`, `MCP018`)**: Single tool `> 400` / `> 1,000` tok, server payload `> 4,000` / `> 10,000` tok, volatile timestamps/UUIDs that bust prefix prompt caching.
- **MCP 2026 Protocol, Transport & Latency (`MCP000`, `MCP016`, `MCP017`, `MCP019`, `MCP020`)**: Non-JSON stdout pollution, cold-start `> 2,000 ms`, missing `readOnlyHint`/`destructiveHint` annotations, deprecated HTTP+SSE or unencrypted HTTP endpoints.
- **AAIF Stack (`AGT001`–`AGT002`, `SKL001`–`SKL003`, `A2A001`–`A2A004`, `SEC001`)**: `AGENTS.md` `> 1,500` tok budget, `SKILL.md` frontmatter `> 120` tok budget, A2A Agent Card TLS & security schemes, and hardcoded credential detection.

---

## Self-Hosted MCP Server (`agent-doctor mcp`)

Add `agent-doctor` directly to `.mcp.json`, Claude Code, Cursor, or Codex:

```json
{
  "mcpServers": {
    "agent-doctor": {
      "command": "npx",
      "args": ["-y", "github:NnopponS/agent-doctor", "mcp"]
    }
  }
}
```

Exposes 7 read-only annotated tools: `diagnose_mcp_server`, `audit_tool_schemas`, `auto_fix_tool_schemas`, `estimate_context_cost`, `scan_mcp_config`, `audit_agent_stack`, and `generate_mcp_badge`.

---

## License

MIT © [Worapon Sangsasri (NnopponS)](https://github.com/NnopponS)
