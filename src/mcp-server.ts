import readline from 'node:readline';
import { analyzeMcpServer } from './analyzer.js';
import { generateHealthBadgeSvg } from './badge.js';
import { scanMcpConfig } from './config-scanner.js';
import { fixMcpTools } from './fixer.js';
import { inspectStdioServer, parseCommandString } from './inspector.js';
import { auditAgentStack } from './stack-auditor.js';
import { calculateCostEstimates } from './tokenizer.js';
import { McpToolDefinition } from './types.js';

interface JsonRpcRequest {
  jsonrpc: string;
  id?: number | string;
  method: string;
  params?: Record<string, unknown>;
}

const MCP_DOCTOR_TOOLS: McpToolDefinition[] = [
  {
    name: 'diagnose_mcp_server',
    description:
      'Spawn an MCP stdio server command, run 2026-07-28 initialize + tools/list handshake, measure cold-start latency, and return a full health & prompt-cache report.',
    inputSchema: {
      type: 'object',
      properties: {
        commandLine: {
          type: 'string',
          description: 'Full stdio command to launch the MCP server (e.g., "node dist/cli.js mcp").',
          maxLength: 500,
        },
        serverName: {
          type: 'string',
          description: 'Human-readable name for the inspected MCP server.',
          maxLength: 100,
        },
        timeoutMs: {
          type: 'number',
          description: 'Handshake timeout in milliseconds (500-30000).',
          minimum: 500,
          maximum: 30000,
        },
      },
      required: ['commandLine'],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
  },
  {
    name: 'audit_tool_schemas',
    description:
      'Statically audit an array of MCP tool definitions for JSON Schema bugs, prompt-cache busting patterns, MCP 2026 annotations, and per-turn token tax.',
    inputSchema: {
      type: 'object',
      properties: {
        serverName: {
          type: 'string',
          description: 'Name of the server being audited.',
          maxLength: 100,
        },
        tools: {
          type: 'array',
          description: 'Array of MCP tool objects ({ name, description, inputSchema, annotations }).',
        },
      },
      required: ['tools'],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
  },
  {
    name: 'auto_fix_tool_schemas',
    description:
      'Automatically repair broken MCP tool schemas, canonicalize property keys for prompt-cache hits, synthesize MCP 2026 safety annotations, and compress bloated descriptions.',
    inputSchema: {
      type: 'object',
      properties: {
        serverName: {
          type: 'string',
          description: 'Name of the server whose tool schemas are being repaired.',
          maxLength: 100,
        },
        tools: {
          type: 'array',
          description: 'Array of MCP tool objects ({ name, description, inputSchema }) to repair.',
        },
      },
      required: ['tools'],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
  },
  {
    name: 'estimate_context_cost',
    description:
      'Calculate prefix-cached vs uncached 1,000-turn USD context costs across 2026 frontier models (Claude Sonnet 5.5, Opus 5.5, Fable 5.2, GPT-6 Astra, GPT-6.1 Sol, GPT-5.3 Codex, Gemini 4 Argon, DeepSeek V4-Pro, Qwen 3.8 Max).',
    inputSchema: {
      type: 'object',
      properties: {
        totalTokens: {
          type: 'number',
          description: 'Total base tokens consumed by tool definitions or AGENTS.md.',
          minimum: 0,
          maximum: 2000000,
        },
      },
      required: ['totalTokens'],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
  },
  {
    name: 'scan_mcp_config',
    description:
      'Inspect an MCP configuration file (.mcp.json, claude_desktop_config.json, .cursor/mcp.json) for hardcoded API keys, deprecated SSE transport, and duplicate commands.',
    inputSchema: {
      type: 'object',
      properties: {
        configPath: {
          type: 'string',
          description: 'Path to the MCP JSON configuration file.',
          maxLength: 400,
        },
        runLiveCheck: {
          type: 'boolean',
          description: 'Whether to also spawn each configured server and run live handshake diagnostics.',
        },
      },
      required: ['configPath'],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
  },
  {
    name: 'audit_agent_stack',
    description:
      'Audit a workspace directory across the 4-layer 2026 AAIF Agent Stack: AGENTS.md, .agents/skills/*/SKILL.md, .mcp.json, and A2A agent-card.json.',
    inputSchema: {
      type: 'object',
      properties: {
        rootDir: {
          type: 'string',
          description: 'Workspace directory path to audit across all 4 AAIF layers.',
          maxLength: 400,
        },
      },
      required: ['rootDir'],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
  },
  {
    name: 'generate_mcp_badge',
    description:
      'Generate a shields.io-style SVG health and token badge for an array of MCP tool definitions.',
    inputSchema: {
      type: 'object',
      properties: {
        serverName: {
          type: 'string',
          description: 'Server name for the badge report.',
          maxLength: 100,
        },
        tools: {
          type: 'array',
          description: 'Array of MCP tool objects ({ name, description, inputSchema }).',
        },
      },
      required: ['tools'],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
  },
];

export function startMcpDoctorStdioServer(): void {
  const rl = readline.createInterface({
    input: process.stdin,
    terminal: false,
  });

  const sendReply = (id: number | string | undefined, result: unknown) => {
    if (id === undefined) return;
    process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, result }) + '\n');
  };

  const sendError = (id: number | string | undefined, code: number, message: string) => {
    if (id === undefined) return;
    process.stdout.write(
      JSON.stringify({ jsonrpc: '2.0', id, error: { code, message } }) + '\n',
    );
  };

  rl.on('line', async (line) => {
    const trimmed = line.trim();
    if (!trimmed) return;

    let req: JsonRpcRequest;
    try {
      req = JSON.parse(trimmed) as JsonRpcRequest;
    } catch {
      return;
    }

    if (req.method === 'initialize') {
      sendReply(req.id, {
        protocolVersion: '2026-07-28',
        capabilities: { tools: {} },
        serverInfo: {
          name: 'agent-doctor',
          version: '2.0.0',
        },
      });
      return;
    }

    if (req.method === 'notifications/initialized') {
      return;
    }

    if (req.method === 'tools/list') {
      sendReply(req.id, { tools: MCP_DOCTOR_TOOLS });
      return;
    }

    if (req.method === 'tools/call') {
      const toolName = String(req.params?.name ?? '');
      const args = (req.params?.arguments as Record<string, unknown> | undefined) ?? {};

      try {
        if (toolName === 'diagnose_mcp_server') {
          const commandLine = String(args.commandLine ?? '');
          const serverName = String(args.serverName ?? 'stdio-target');
          const timeoutMs = typeof args.timeoutMs === 'number' ? args.timeoutMs : 8000;
          const target = parseCommandString(commandLine, serverName);
          const report = await inspectStdioServer(target, { timeoutMs });
          sendReply(req.id, {
            content: [{ type: 'text', text: JSON.stringify(report, null, 2) }],
          });
          return;
        }

        if (toolName === 'audit_tool_schemas') {
          const serverName = String(args.serverName ?? 'schema-audit');
          const tools = Array.isArray(args.tools) ? (args.tools as McpToolDefinition[]) : [];
          const report = analyzeMcpServer({
            serverName,
            mode: 'static-schema',
            tools,
          });
          sendReply(req.id, {
            content: [{ type: 'text', text: JSON.stringify(report, null, 2) }],
          });
          return;
        }

        if (toolName === 'auto_fix_tool_schemas') {
          const serverName = String(args.serverName ?? 'schema-fix');
          const tools = Array.isArray(args.tools) ? (args.tools as McpToolDefinition[]) : [];
          const fixResult = fixMcpTools(tools, serverName);
          sendReply(req.id, {
            content: [{ type: 'text', text: JSON.stringify(fixResult, null, 2) }],
          });
          return;
        }

        if (toolName === 'estimate_context_cost') {
          const totalTokens = Number(args.totalTokens ?? 0);
          const estimates = calculateCostEstimates(totalTokens);
          sendReply(req.id, {
            content: [{ type: 'text', text: JSON.stringify({ totalTokens, estimates }, null, 2) }],
          });
          return;
        }

        if (toolName === 'scan_mcp_config') {
          const configPath = String(args.configPath ?? '');
          const runLiveCheck = Boolean(args.runLiveCheck);
          const scan = await scanMcpConfig(configPath, { runLiveCheck });
          sendReply(req.id, {
            content: [{ type: 'text', text: JSON.stringify(scan, null, 2) }],
          });
          return;
        }

        if (toolName === 'audit_agent_stack') {
          const rootDir = String(args.rootDir ?? '.');
          const stackReport = await auditAgentStack(rootDir);
          sendReply(req.id, {
            content: [{ type: 'text', text: JSON.stringify(stackReport, null, 2) }],
          });
          return;
        }

        if (toolName === 'generate_mcp_badge') {
          const serverName = String(args.serverName ?? 'mcp-server');
          const tools = Array.isArray(args.tools) ? (args.tools as McpToolDefinition[]) : [];
          const report = analyzeMcpServer({
            serverName,
            mode: 'static-schema',
            tools,
          });
          const svg = generateHealthBadgeSvg(report);
          sendReply(req.id, {
            content: [{ type: 'text', text: svg }],
          });
          return;
        }

        sendError(req.id, -32601, `Unknown tool: ${toolName}`);
      } catch (err) {
        sendError(req.id, -32603, (err as Error).message);
      }
      return;
    }

    if (req.id !== undefined) {
      sendError(req.id, -32601, `Method not found: ${req.method}`);
    }
  });
}

export { MCP_DOCTOR_TOOLS };
