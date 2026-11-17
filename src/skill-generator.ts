export function generateAgentSkillMarkdown(): string {
  return `---
name: agent-doctor
description: Use when auditing, optimizing, or healing 2026 AI agent stacks (AGENTS.md, SKILL.md, MCP 2026 servers, A2A agent-card.json) and profiling prompt-cache vs token costs.
---

# agent-doctor (AAIF 2026 Agent Stack Skill)

Use \`agent-doctor\` to inspect, lint, profile, and automatically heal all 4 layers of the 2026 Agentic AI Foundation (AAIF) stack: \`AGENTS.md\`, \`SKILL.md\`, \`MCP 2026-07-28\`, and \`A2A (Agent2Agent)\`.

## Quick Commands

1. **Audit an entire repository's 4-layer 2026 Agent Stack (\`AGENTS.md\`, \`SKILL.md\`, \`.mcp.json\`, \`agent-card.json\`):**
   \`\`\`bash
   npx -y github:NnopponS/agent-doctor stack . --ci
   \`\`\`

2. **Inspect a live MCP 2026 stdio server (handshake latency + prompt-cache check + 20 rules):**
   \`\`\`bash
   npx -y github:NnopponS/agent-doctor check "<command>" --ci
   \`\`\`

3. **Auto-fix broken tool schemas, synthesize MCP 2026 annotations, and stabilize prefix caching:**
   \`\`\`bash
   npx -y github:NnopponS/agent-doctor fix <tools.json> --out <fixed-tools.json>
   \`\`\`

4. **Migrate bloated MCP tools into progressive-disclosure AAIF \`SKILL.md\` bundles (~90% token reduction):**
   \`\`\`bash
   npx -y github:NnopponS/agent-doctor migrate-skills <tools.json> --dir .agents/skills
   \`\`\`

5. **Audit an A2A (\`/.well-known/agent-card.json\`) manifest or workstation MCP config:**
   \`\`\`bash
   npx -y github:NnopponS/agent-doctor a2a .well-known/agent-card.json
   npx -y github:NnopponS/agent-doctor scan-config .mcp.json
   \`\`\`

## Workflow for AI Coding Agents

- Before shipping any MCP 2026 server, \`AGENTS.md\`, \`SKILL.md\`, or \`agent-card.json\`, run \`agent-doctor stack . --ci\`.
- Ensure the server and stack achieve a Health Score of **>= 90/100 (Grade A or A+)** with **0 errors**.
- Never embed volatile timestamps or UUIDs in tool descriptions (\`MCP018\`), which busts prefix prompt caching on Claude 5.5, GPT-6, and Gemini 4.
- Keep \`AGENTS.md\` under **1,500 tokens** (\`AGT001\`) and \`SKILL.md\` YAML frontmatter under **100 tokens** (\`SKL002\`).
`;
}

export function generateLlmsTxt(): string {
  return `# agent-doctor (v2.0.0)

> Universal 2026 AI Agent Stack Inspector, Prompt-Cache & Token-Tax Profiler, Automatic Schema Healer, and Security Linter for the Agentic AI Foundation (AAIF) 4-Layer Stack (\`AGENTS.md\`, \`SKILL.md\`, \`MCP 2026-07-28\`, and \`A2A Agent2Agent\`).

- Repository: https://github.com/NnopponS/agent-doctor
- Live Playground & Documentation: https://nnoppons.github.io/agent-doctor/
- Author: Worapon Sangsasri (https://github.com/NnopponS)
- License: MIT
- Runtime: Node.js >= 18.0.0 (Zero external runtime dependencies)

## Core Capabilities

- **4-Layer AAIF Stack Auditor (\`agent-doctor stack .\`)**: Audits Layer 1 (\`AGENTS.md\` / \`CLAUDE.md\` always-on budget), Layer 2 (\`.agents/skills/*/SKILL.md\` progressive-disclosure frontmatter budget), Layer 3 (\`MCP 2026-07-28\` Streamable HTTP, OAuth 2.1 Resource Server metadata, and tool schemas), and Layer 4 (\`/.well-known/agent-card.json\` A2A Protocol).
- **2026 Frontier Model Token & Prompt-Cache Profiler**: Calculates effective tokens (including the Claude 5.x 1.30x tokenizer multiplier) and compares 1,000-turn **Prefix-Cached** vs **Cache-Miss** costs across **Claude Sonnet 5.5**, **Claude Opus 5.5**, **Claude Fable 5.2**, **GPT-6 Astra**, **GPT-6.1 Sol**, **GPT-5.3 Codex**, **Gemini 4 Argon**, **Gemini 3.8 Flash**, **DeepSeek V4-Pro**, and **Qwen 3.8 Max**.
- **Prompt-Cache Busting Detector (\`MCP018\`)**: Detects volatile ISO timestamps, UUIDs, and runtime counters inside tool schemas that invalidate 90-97.5% prefix cache discounts across turns.
- **Automatic Schema Healer & Optimizer (\`agent-doctor fix <tools.json> --out <fixed.json>\`)**: Repairs missing \`type: "object"\`, removes ghost \`required\` fields, canonicalizes JSON property keys for deterministic prefix caching, synthesizes MCP 2026 \`annotations\` (\`readOnlyHint\`, \`destructiveHint\`, \`idempotentHint\`), and compresses bloated descriptions.
- **MCP-to-Skill Progressive Disclosure Migrator (\`agent-doctor migrate-skills <tools.json>\`)**: Converts bulky always-on MCP tool definitions into on-demand AAIF \`.agents/skills/<slug>/SKILL.md\` bundles (~85-92% context reduction).
- **A2A Agent Card Validator (\`agent-doctor a2a <agent-card.json>\`)**: Validates Agent2Agent protocol cards (\`name\`, \`version\`, \`url\`, \`capabilities.streaming\`, \`securitySchemes\`, \`skills[]\`).
- **Self-Hosted MCP 2026 Server (\`agent-doctor mcp\`)**: Exposes 7 MCP tools (\`diagnose_mcp_server\`, \`audit_tool_schemas\`, \`auto_fix_tool_schemas\`, \`estimate_context_cost\`, \`scan_mcp_config\`, \`audit_agent_stack\`, \`generate_mcp_badge\`).
`;
}
