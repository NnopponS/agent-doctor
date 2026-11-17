---
name: agent-doctor
description: Use when auditing, optimizing, or healing 2026 AI agent stacks (AGENTS.md, SKILL.md, MCP 2026 servers, A2A agent-card.json) and profiling prompt-cache vs token costs.
---

# agent-doctor (AAIF 2026 Agent Stack Skill)

Use `agent-doctor` to inspect, lint, profile, and automatically heal all 4 layers of the 2026 Agentic AI Foundation (AAIF) stack: `AGENTS.md`, `SKILL.md`, `MCP 2026-07-28`, and `A2A (Agent2Agent)`.

## Quick Commands

1. **Audit an entire repository's 4-layer 2026 Agent Stack (`AGENTS.md`, `SKILL.md`, `.mcp.json`, `agent-card.json`):**
   ```bash
   npx -y github:NnopponS/agent-doctor stack . --ci
   ```

2. **Inspect a live MCP 2026 stdio server (handshake latency + prompt-cache check + 20 rules):**
   ```bash
   npx -y github:NnopponS/agent-doctor check "<command>" --ci
   ```

3. **Auto-fix broken tool schemas, synthesize MCP 2026 annotations, and stabilize prefix caching:**
   ```bash
   npx -y github:NnopponS/agent-doctor fix <tools.json> --out <fixed-tools.json>
   ```

4. **Migrate bloated MCP tools into progressive-disclosure AAIF `SKILL.md` bundles (~90% token reduction):**
   ```bash
   npx -y github:NnopponS/agent-doctor migrate-skills <tools.json> --dir .agents/skills
   ```

5. **Audit an A2A (`/.well-known/agent-card.json`) manifest or workstation MCP config:**
   ```bash
   npx -y github:NnopponS/agent-doctor a2a .well-known/agent-card.json
   npx -y github:NnopponS/agent-doctor scan-config .mcp.json
   ```

## Workflow for AI Coding Agents

- Before shipping any MCP 2026 server, `AGENTS.md`, `SKILL.md`, or `agent-card.json`, run `agent-doctor stack . --ci`.
- Ensure the server and stack achieve a Health Score of **>= 90/100 (Grade A or A+)** with **0 errors**.
- Never embed volatile timestamps or UUIDs in tool descriptions (`MCP018`), which busts prefix prompt caching on Claude 5.5, GPT-6, and Gemini 4.
- Keep `AGENTS.md` under **1,500 tokens** (`AGT001`) and `SKILL.md` YAML frontmatter under **100 tokens** (`SKL002`).
