#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { analyzeMcpServer } from './analyzer.js';
import { getDefaultConfigCandidates, scanMcpConfig } from './config-scanner.js';
import { BLOATED_SAMPLE_TOOLS, OPTIMIZED_SAMPLE_TOOLS } from './demo-fixtures.js';
import { inspectStdioServer, parseCommandString } from './inspector.js';
import { startMcpDoctorStdioServer } from './mcp-server.js';
import {
  formatConfigScanReport,
  formatMarkdownReport,
  formatTerminalReport,
} from './reporter.js';
import { McpToolDefinition } from './types.js';
import { startWebDashboard } from './web-ui.js';

function printHelp(): void {
  console.log(`
mcp-doctor v1.0.0 — Universal MCP Server Inspector, Token Profiler & Schema Auditor

Usage:
  mcp-doctor check "<command>" [--name <name>] [--timeout <ms>] [--json | --markdown] [--ci]
  mcp-doctor analyze <tools.json> [--name <name>] [--json | --markdown] [--ci]
  mcp-doctor scan-config [config.json] [--live] [--json]
  mcp-doctor demo [--preset bloated|optimized] [--json | --markdown]
  mcp-doctor ui [--port 4310] [--host 127.0.0.1]
  mcp-doctor mcp

Examples:
  mcp-doctor check "node dist/cli.js mcp"
  mcp-doctor analyze examples/bloated-tools.json --markdown
  mcp-doctor scan-config .mcp.json --live
  mcp-doctor demo
  mcp-doctor ui --port 4310
`);
}

function getFlagValue(args: string[], flag: string): string | undefined {
  const idx = args.indexOf(flag);
  if (idx !== -1 && idx + 1 < args.length) {
    return args[idx + 1];
  }
  return undefined;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const subcommand = args[0];

  if (!subcommand || subcommand === '--help' || subcommand === '-h' || subcommand === 'help') {
    printHelp();
    return;
  }

  const outputJson = args.includes('--json');
  const outputMarkdown = args.includes('--markdown');
  const ciGate = args.includes('--ci');

  if (subcommand === 'mcp') {
    startMcpDoctorStdioServer();
    return;
  }

  if (subcommand === 'ui') {
    const portStr = getFlagValue(args, '--port');
    const host = getFlagValue(args, '--host') ?? '127.0.0.1';
    const port = portStr ? Number(portStr) : 4310;
    const { url } = await startWebDashboard({ host, port });
    console.log(`MCP Doctor Web Inspector running at ${url}`);
    console.log('Press Ctrl+C to stop.');
    return;
  }

  if (subcommand === 'demo') {
    const preset = getFlagValue(args, '--preset') ?? 'both';
    if (preset === 'bloated' || preset === 'optimized') {
      const report = analyzeMcpServer({
        serverName: preset === 'bloated' ? 'bloated-enterprise-mcp' : 'optimized-clean-mcp',
        mode: 'static-schema',
        tools: preset === 'bloated' ? BLOATED_SAMPLE_TOOLS : OPTIMIZED_SAMPLE_TOOLS,
      });
      if (outputJson) console.log(JSON.stringify(report, null, 2));
      else if (outputMarkdown) console.log(formatMarkdownReport(report));
      else console.log(formatTerminalReport(report));
      return;
    }

    const bloatedReport = analyzeMcpServer({
      serverName: 'before: bloated-enterprise-mcp',
      mode: 'static-schema',
      tools: BLOATED_SAMPLE_TOOLS,
    });
    const optimizedReport = analyzeMcpServer({
      serverName: 'after: optimized-clean-mcp',
      mode: 'static-schema',
      tools: OPTIMIZED_SAMPLE_TOOLS,
    });
    console.log(formatTerminalReport(bloatedReport));
    console.log('');
    console.log(formatTerminalReport(optimizedReport));
    return;
  }

  if (subcommand === 'check') {
    const commandStr = args[1];
    if (!commandStr || commandStr.startsWith('--')) {
      console.error('Error: Missing <command> argument for "mcp-doctor check".');
      process.exit(1);
    }
    const name = getFlagValue(args, '--name') ?? 'stdio-server';
    const timeoutStr = getFlagValue(args, '--timeout');
    const timeoutMs = timeoutStr ? Number(timeoutStr) : 8000;
    const target = parseCommandString(commandStr, name);
    const report = await inspectStdioServer(target, { timeoutMs });

    if (outputJson) console.log(JSON.stringify(report, null, 2));
    else if (outputMarkdown) console.log(formatMarkdownReport(report));
    else console.log(formatTerminalReport(report));

    if (ciGate && !report.passed) {
      process.exit(1);
    }
    return;
  }

  if (subcommand === 'analyze' || subcommand === 'analyze-schema') {
    const filePath = args[1];
    if (!filePath || filePath.startsWith('--')) {
      console.error('Error: Missing <tools.json> path for "mcp-doctor analyze".');
      process.exit(1);
    }
    const resolved = path.resolve(filePath);
    const raw = JSON.parse(fs.readFileSync(resolved, 'utf8')) as
      | McpToolDefinition[]
      | { tools?: McpToolDefinition[] };
    const tools = Array.isArray(raw) ? raw : Array.isArray(raw.tools) ? raw.tools : [];
    const name = getFlagValue(args, '--name') ?? path.basename(resolved, '.json');

    const report = analyzeMcpServer({
      serverName: name,
      mode: 'static-schema',
      tools,
    });

    if (outputJson) console.log(JSON.stringify(report, null, 2));
    else if (outputMarkdown) console.log(formatMarkdownReport(report));
    else console.log(formatTerminalReport(report));

    if (ciGate && !report.passed) {
      process.exit(1);
    }
    return;
  }

  if (subcommand === 'scan-config') {
    const explicitPath = args[1] && !args[1].startsWith('--') ? args[1] : undefined;
    const runLiveCheck = args.includes('--live');

    let targetConfigPath = explicitPath ? path.resolve(explicitPath) : undefined;
    if (!targetConfigPath) {
      const existing = getDefaultConfigCandidates().find((c) => fs.existsSync(c));
      if (!existing) {
        console.error(
          'No default MCP config found in workspace or user profile. Pass a path explicitly: mcp-doctor scan-config <path/to/mcp.json>',
        );
        process.exit(1);
      }
      targetConfigPath = existing;
    }

    const scan = await scanMcpConfig(targetConfigPath, { runLiveCheck });
    if (outputJson) {
      console.log(JSON.stringify(scan, null, 2));
    } else {
      console.log(formatConfigScanReport(scan));
    }
    if (ciGate && scan.secretWarnings.length > 0) {
      process.exit(1);
    }
    return;
  }

  console.error(`Unknown command: ${subcommand}`);
  printHelp();
  process.exit(1);
}

main().catch((err) => {
  console.error(`mcp-doctor fatal error: ${(err as Error).message}`);
  process.exit(1);
});
