import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { inspectStdioServer } from './inspector.js';
import {
  ConfigScanReport,
  ConfigSecretWarning,
  McpServerTarget,
  ServerDiagnosisReport,
} from './types.js';

interface SecretPattern {
  name: string;
  regex: RegExp;
}

const SECRET_PATTERNS: readonly SecretPattern[] = [
  { name: 'OpenAI / Anthropic / API Secret Key (sk-...)', regex: /\bsk-[a-zA-Z0-9_-]{16,}\b/ },
  { name: 'GitHub Personal Access Token (ghp_/github_pat_)', regex: /\b(?:ghp|gho|ghu|ghs|ghr)_[a-zA-Z0-9]{20,}\b|\bgithub_pat_[a-zA-Z0-9_]{20,}\b/ },
  { name: 'Google AI / Cloud API Key (AIza...)', regex: /\bAIza[0-9A-Za-z_-]{30,}\b/ },
  { name: 'Slack Token (xoxb-/xoxp-)', regex: /\bxox[baprs]-[0-9A-Za-z-]{16,}\b/ },
  { name: 'AWS Access Key ID (AKIA...)', regex: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: 'Hardcoded Bearer / High-Entropy Token', regex: /\bBearer\s+[A-Za-z0-9._-]{20,}\b/ },
];

export function maskSecret(value: string): string {
  if (value.length <= 8) return '****';
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

export function getDefaultConfigCandidates(cwd = process.cwd()): string[] {
  const home = os.homedir();
  const appData = process.env.APPDATA ?? path.join(home, 'AppData', 'Roaming');
  return [
    path.join(cwd, '.mcp.json'),
    path.join(cwd, '.cursor', 'mcp.json'),
    path.join(cwd, '.vscode', 'mcp.json'),
    path.join(appData, 'Claude', 'claude_desktop_config.json'),
    path.join(home, '.cursor', 'mcp.json'),
    path.join(home, '.codeium', 'windsurf', 'mcp_config.json'),
  ];
}

export function parseMcpConfigFile(configPath: string): {
  servers: McpServerTarget[];
  secretWarnings: ConfigSecretWarning[];
  duplicateCommands: string[];
} {
  const rawContent = fs.readFileSync(configPath, 'utf8');
  const parsed = JSON.parse(rawContent) as Record<string, unknown>;
  const serversMap =
    (parsed.mcpServers as Record<string, unknown> | undefined) ??
    (parsed.servers as Record<string, unknown> | undefined) ??
    {};

  const servers: McpServerTarget[] = [];
  const secretWarnings: ConfigSecretWarning[] = [];
  const seenSignatures = new Map<string, string>();
  const duplicateCommands: string[] = [];

  for (const [serverName, rawDef] of Object.entries(serversMap)) {
    if (!rawDef || typeof rawDef !== 'object') continue;
    const def = rawDef as Record<string, unknown>;
    if (typeof def.command !== 'string') continue;

    const args = Array.isArray(def.args) ? def.args.map(String) : [];
    const envObj: Record<string, string> = {};
    if (def.env && typeof def.env === 'object') {
      for (const [k, v] of Object.entries(def.env as Record<string, unknown>)) {
        const strVal = String(v ?? '');
        envObj[k] = strVal;

        for (const pat of SECRET_PATTERNS) {
          if (pat.regex.test(strVal)) {
            secretWarnings.push({
              serverName,
              envKey: k,
              patternName: pat.name,
              maskedPreview: maskSecret(strVal),
              suggestion: `Move plaintext secret in "${k}" out of ${path.basename(configPath)} into an OS keychain or environment variable reference.`,
            });
            break;
          }
        }
      }
    }

    const signature = `${def.command} ${args.join(' ')}`.trim();
    if (seenSignatures.has(signature)) {
      duplicateCommands.push(
        `Servers "${seenSignatures.get(signature)}" and "${serverName}" run the identical command: ${signature}`,
      );
    } else {
      seenSignatures.set(signature, serverName);
    }

    servers.push({
      name: serverName,
      command: def.command,
      args,
      env: Object.keys(envObj).length > 0 ? envObj : undefined,
      cwd: typeof def.cwd === 'string' ? def.cwd : undefined,
    });
  }

  return { servers, secretWarnings, duplicateCommands };
}

export async function scanMcpConfig(
  configPath: string,
  options: { runLiveCheck?: boolean; timeoutMs?: number } = {},
): Promise<ConfigScanReport> {
  const { servers, secretWarnings, duplicateCommands } = parseMcpConfigFile(configPath);
  const serverReports: ServerDiagnosisReport[] = [];

  if (options.runLiveCheck) {
    for (const srv of servers) {
      const report = await inspectStdioServer(srv, { timeoutMs: options.timeoutMs ?? 6000 });
      serverReports.push(report);
    }
  }

  return {
    configPath,
    serverCount: servers.length,
    servers,
    secretWarnings,
    duplicateCommands,
    serverReports,
  };
}
