import readline from 'node:readline';
import { analyzeMcpServer } from './analyzer.js';
import { scanMcpConfig } from './config-scanner.js';
import { inspectStdioServer, parseCommandString } from './inspector.js';
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
      'Spawn an MCP stdio server command, run initialize + tools/list handshake, measure cold-start latency, and return a full health & token-tax report.',
    inputSchema: {
      type: 'object',
      properties: {
        commandLine: {
          type: 'string',
          description: 'Full stdio command to launch the MCP server (e.g., "node dist/index.js").',
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
    annotations: { readOnlyHint: true },
  },
  {
    name: 'audit_tool_schemas',
    description:
      'Statically audit an array of MCP tool definitions for JSON Schema bugs, missing types, per-turn token bloat, and security risks.',
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
          description: 'Array of MCP tool objects ({ name, description, inputSchema }).',
        },
      },
      required: ['tools'],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'estimate_context_cost',
    description:
      'Calculate per-turn, 100-turn, and 1,000-turn USD context costs for a given MCP token count across Claude, GPT, Gemini, and DeepSeek models.',
    inputSchema: {
      type: 'object',
      properties: {
        totalTokens: {
          type: 'number',
          description: 'Total tokens consumed by MCP tool definitions.',
          minimum: 0,
          maximum: 2000000,
        },
      },
      required: ['totalTokens'],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'scan_mcp_config',
    description:
      'Inspect an MCP configuration file (.mcp.json, claude_desktop_config.json, .cursor/mcp.json) for hardcoded API keys and duplicate server commands.',
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
    annotations: { readOnlyHint: true },
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
        protocolVersion: '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: {
          name: 'mcp-doctor',
          version: '1.0.0',
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
