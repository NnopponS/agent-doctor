import { spawn } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import { analyzeMcpServer } from './analyzer.js';
import {
  DiagnosticFinding,
  HandshakeTiming,
  McpPromptDefinition,
  McpResourceDefinition,
  McpServerTarget,
  McpToolDefinition,
  ServerDiagnosisReport,
} from './types.js';

interface JsonRpcResponse {
  jsonrpc: string;
  id?: number | string;
  result?: Record<string, unknown>;
  error?: { code: number; message: string; data?: unknown };
}

export interface InspectOptions {
  timeoutMs?: number;
}

export function parseCommandString(commandLine: string, defaultName = 'stdio-server'): McpServerTarget {
  const tokens: string[] = [];
  let current = '';
  let inQuotes: '"' | "'" | null = null;

  for (let i = 0; i < commandLine.length; i++) {
    const ch = commandLine[i];
    if (inQuotes) {
      if (ch === inQuotes) {
        inQuotes = null;
      } else {
        current += ch;
      }
    } else if (ch === '"' || ch === "'") {
      inQuotes = ch;
    } else if (/\s/.test(ch)) {
      if (current.length > 0) {
        tokens.push(current);
        current = '';
      }
    } else {
      current += ch;
    }
  }
  if (current.length > 0) tokens.push(current);

  const [command = '', ...args] = tokens;
  return {
    name: defaultName,
    command,
    args,
  };
}

export async function inspectStdioServer(
  target: McpServerTarget,
  options: InspectOptions = {},
): Promise<ServerDiagnosisReport> {
  const timeoutMs = options.timeoutMs ?? 8000;
  const startWall = performance.now();
  const extraFindings: DiagnosticFinding[] = [];

  return new Promise<ServerDiagnosisReport>((resolve) => {
    let settled = false;
    const pendingRequests = new Map<
      number,
      { resolve: (res: JsonRpcResponse) => void; reject: (err: Error) => void }
    >();

    const child = spawn(target.command, target.args, {
      cwd: target.cwd ?? process.cwd(),
      env: { ...process.env, ...(target.env ?? {}) },
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: process.platform === 'win32' && /\.(cmd|bat|ps1)$/i.test(target.command),
    });

    const spawnMs = Number((performance.now() - startWall).toFixed(2));
    let stdoutBuffer = '';
    let nonJsonStdoutLines = 0;

    const cleanup = () => {
      try {
        child.kill();
      } catch {
        // Ignore cleanup errors on already-exited child process
      }
    };

    const failAndResolve = (message: string, suggestion: string) => {
      if (settled) return;
      settled = true;
      cleanup();
      extraFindings.push({
        ruleId: 'MCP000',
        severity: 'error',
        category: 'protocol',
        target: target.name,
        message,
        suggestion,
      });
      resolve(
        analyzeMcpServer({
          serverName: target.name,
          mode: 'live-stdio',
          protocolVersion: null,
          serverInfo: null,
          timing: {
            spawnMs,
            initializeMs: 0,
            toolsListMs: 0,
            resourcesListMs: null,
            promptsListMs: null,
            totalMs: Number((performance.now() - startWall).toFixed(2)),
          },
          tools: [],
          extraFindings,
        }),
      );
    };

    const overallTimer = setTimeout(() => {
      failAndResolve(
        `Timed out after ${timeoutMs} ms waiting for MCP stdio handshake from "${target.command}".`,
        'Verify the server starts cleanly without interactive prompts and writes valid newline-delimited JSON-RPC 2.0 to stdout.',
      );
    }, timeoutMs);

    child.on('error', (err) => {
      clearTimeout(overallTimer);
      failAndResolve(
        `Failed to spawn "${target.command}": ${err.message}`,
        'Confirm the executable is on PATH or specify an absolute path in the server configuration.',
      );
    });

    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      stdoutBuffer += chunk;
      let newlineIdx = stdoutBuffer.indexOf('\n');
      while (newlineIdx !== -1) {
        const line = stdoutBuffer.slice(0, newlineIdx).trim();
        stdoutBuffer = stdoutBuffer.slice(newlineIdx + 1);
        if (line.length > 0) {
          try {
            const parsed = JSON.parse(line) as JsonRpcResponse;
            if (typeof parsed.id === 'number' && pendingRequests.has(parsed.id)) {
              const req = pendingRequests.get(parsed.id)!;
              pendingRequests.delete(parsed.id);
              req.resolve(parsed);
            }
          } catch {
            nonJsonStdoutLines++;
          }
        }
        newlineIdx = stdoutBuffer.indexOf('\n');
      }
    });

    let nextId = 1;
    const sendRequest = (method: string, params: Record<string, unknown> = {}): Promise<JsonRpcResponse> => {
      const id = nextId++;
      const payload = JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n';
      return new Promise((reqResolve, reqReject) => {
        pendingRequests.set(id, { resolve: reqResolve, reject: reqReject });
        child.stdin.write(payload, (err) => {
          if (err) {
            pendingRequests.delete(id);
            reqReject(err);
          }
        });
      });
    };

    const sendNotification = (method: string, params: Record<string, unknown> = {}) => {
      const payload = JSON.stringify({ jsonrpc: '2.0', method, params }) + '\n';
      child.stdin.write(payload);
    };

    (async () => {
      try {
        const initStart = performance.now();
        const initRes = await sendRequest('initialize', {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'mcp-doctor', version: '1.0.0' },
        });
        const initializeMs = Number((performance.now() - initStart).toFixed(2));

        if (initRes.error) {
          clearTimeout(overallTimer);
          failAndResolve(
            `MCP initialize returned JSON-RPC error (${initRes.error.code}): ${initRes.error.message}`,
            'Ensure the server supports the MCP initialize handshake.',
          );
          return;
        }

        sendNotification('notifications/initialized', {});

        const resultObj = initRes.result ?? {};
        const protocolVersion =
          typeof resultObj.protocolVersion === 'string' ? resultObj.protocolVersion : null;
        const rawServerInfo = resultObj.serverInfo as Record<string, unknown> | undefined;
        const serverInfo = rawServerInfo
          ? {
              name: String(rawServerInfo.name ?? target.name),
              version: String(rawServerInfo.version ?? '0.0.0'),
            }
          : null;
        const capabilities = (resultObj.capabilities as Record<string, unknown> | undefined) ?? {};

        const toolsStart = performance.now();
        const toolsRes = await sendRequest('tools/list', {});
        const toolsListMs = Number((performance.now() - toolsStart).toFixed(2));
        const rawTools = Array.isArray(toolsRes.result?.tools)
          ? (toolsRes.result!.tools as McpToolDefinition[])
          : [];

        let resourcesListMs: number | null = null;
        let rawResources: McpResourceDefinition[] = [];
        if (capabilities.resources) {
          const resStart = performance.now();
          const resReply = await sendRequest('resources/list', {});
          resourcesListMs = Number((performance.now() - resStart).toFixed(2));
          if (Array.isArray(resReply.result?.resources)) {
            rawResources = resReply.result!.resources as McpResourceDefinition[];
          }
        }

        let promptsListMs: number | null = null;
        let rawPrompts: McpPromptDefinition[] = [];
        if (capabilities.prompts) {
          const prmStart = performance.now();
          const prmReply = await sendRequest('prompts/list', {});
          promptsListMs = Number((performance.now() - prmStart).toFixed(2));
          if (Array.isArray(prmReply.result?.prompts)) {
            rawPrompts = prmReply.result!.prompts as McpPromptDefinition[];
          }
        }

        if (nonJsonStdoutLines > 0) {
          extraFindings.push({
            ruleId: 'MCP017',
            severity: 'error',
            category: 'protocol',
            target: target.name,
            message: `Server wrote ${nonJsonStdoutLines} non-JSON line(s) to stdout during MCP session.`,
            suggestion: 'Route all console/debug logging to stderr (console.error / process.stderr); stdout is strictly reserved for JSON-RPC 2.0 frames.',
          });
        }

        const totalMs = Number((performance.now() - startWall).toFixed(2));
        const timing: HandshakeTiming = {
          spawnMs,
          initializeMs,
          toolsListMs,
          resourcesListMs,
          promptsListMs,
          totalMs,
        };

        clearTimeout(overallTimer);
        if (!settled) {
          settled = true;
          cleanup();
          resolve(
            analyzeMcpServer({
              serverName: serverInfo?.name ?? target.name,
              mode: 'live-stdio',
              protocolVersion,
              serverInfo,
              timing,
              tools: rawTools,
              resources: rawResources,
              prompts: rawPrompts,
              extraFindings,
            }),
          );
        }
      } catch (err) {
        clearTimeout(overallTimer);
        failAndResolve(
          `Unexpected error during MCP stdio handshake: ${(err as Error).message}`,
          'Check server stderr logs and verify JSON-RPC 2.0 framing.',
        );
      }
    })();
  });
}
