#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { analyzeMcpServer } from './analyzer.js';
import { generateHealthBadgeSvg } from './badge.js';
import { getDefaultConfigCandidates, scanMcpConfig } from './config-scanner.js';
import { BLOATED_SAMPLE_TOOLS, OPTIMIZED_SAMPLE_TOOLS } from './demo-fixtures.js';
import { fixMcpTools } from './fixer.js';
import { inspectStdioServer, parseCommandString } from './inspector.js';
import { startMcpDoctorStdioServer } from './mcp-server.js';
import {
  formatConfigScanReport,
  formatMarkdownReport,
  formatStackAuditReport,
  formatTerminalReport,
} from './reporter.js';
import { formatSarifReport } from './sarif.js';
import { generateAgentSkillMarkdown, generateLlmsTxt } from './skill-generator.js';
import { auditA2AAgentCard, auditAgentStack, migrateToolsToSkills } from './stack-auditor.js';
import { A2AAgentCard, McpToolDefinition } from './types.js';
import { startWebDashboard } from './web-ui.js';

function printHelp(): void {
  console.log(`
agent-doctor v2.0.0 — Universal 2026 AAIF Agent Stack Inspector, Prompt-Cache Profiler & Auto-Healer

Usage:
  agent-doctor stack [dir] [--json] [--ci]
  agent-doctor check "<command>" [--name <name>] [--timeout <ms>] [--json | --markdown | --sarif] [--ci]
  agent-doctor analyze <tools.json> [--name <name>] [--json | --markdown | --sarif] [--ci]
  agent-doctor fix <tools.json> [--out <fixed-tools.json>] [--json]
  agent-doctor migrate-skills <tools.json> [--dir .agents/skills] [--json]
  agent-doctor a2a <agent-card.json> [--json] [--ci]
  agent-doctor badge <tools.json | "<command>"> [--out <badge.svg>]
  agent-doctor scan-config [config.json] [--live] [--json] [--ci]
  agent-doctor init-skill [--dir .agents/skills/agent-doctor]
  agent-doctor llms-txt [--out llms.txt]
  agent-doctor demo [--preset bloated|optimized] [--json | --markdown | --sarif]
  agent-doctor ui [--port 4310] [--host 127.0.0.1]
  agent-doctor mcp

Examples:
  agent-doctor stack . --ci
  agent-doctor check "node dist/cli.js mcp" --ci
  agent-doctor fix examples/bloated-tools.json --out examples/fixed-tools.json
  agent-doctor migrate-skills examples/bloated-tools.json --dir .agents/skills
  agent-doctor a2a .well-known/agent-card.json --ci
  agent-doctor badge "node dist/cli.js mcp" --out docs/assets/health-badge.svg
`);
}

function getFlagValue(args: string[], flag: string): string | undefined {
  const idx = args.indexOf(flag);
  if (idx !== -1 && idx + 1 < args.length) {
    return args[idx + 1];
  }
  return undefined;
}

function loadToolsFromFile(filePath: string): { resolved: string; tools: McpToolDefinition[] } {
  const resolved = path.resolve(filePath);
  const raw = JSON.parse(fs.readFileSync(resolved, 'utf8')) as
    | McpToolDefinition[]
    | { tools?: McpToolDefinition[] };
  const tools = Array.isArray(raw) ? raw : Array.isArray(raw.tools) ? raw.tools : [];
  return { resolved, tools };
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
  const outputSarif = args.includes('--sarif');
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
    console.log(`Agent Doctor v2.0 Web Inspector running at ${url}`);
    console.log('Press Ctrl+C to stop.');
    return;
  }

  if (subcommand === 'stack') {
    const targetDir = args[1] && !args[1].startsWith('--') ? args[1] : '.';
    const report = await auditAgentStack(targetDir);
    if (outputJson) {
      console.log(JSON.stringify(report, null, 2));
    } else {
      console.log(formatStackAuditReport(report));
    }
    if (ciGate && !report.passed) {
      process.exit(1);
    }
    return;
  }

  if (subcommand === 'a2a') {
    const cardPath = args[1];
    if (!cardPath || cardPath.startsWith('--')) {
      console.error('Error: Missing <agent-card.json> path for "agent-doctor a2a".');
      process.exit(1);
    }
    const resolved = path.resolve(cardPath);
    const card = JSON.parse(fs.readFileSync(resolved, 'utf8')) as A2AAgentCard;
    const findings = auditA2AAgentCard(card, path.basename(resolved));
    const hasErrors = findings.some((f) => f.severity === 'error');
    if (outputJson) {
      console.log(JSON.stringify({ file: resolved, passed: !hasErrors, findings }, null, 2));
    } else {
      console.log(`A2A AGENT CARD AUDIT | ${card.name ?? path.basename(resolved)} | Findings: ${findings.length}`);
      if (findings.length === 0) {
        console.log('  [PASS] Valid AAIF Agent2Agent Card.');
      } else {
        for (const f of findings) {
          console.log(`  [${f.severity.toUpperCase()}] ${f.ruleId}: ${f.message}`);
          console.log(`           Fix: ${f.suggestion}`);
        }
      }
    }
    if (ciGate && hasErrors) {
      process.exit(1);
    }
    return;
  }

  if (subcommand === 'migrate-skills') {
    const filePath = args[1];
    if (!filePath || filePath.startsWith('--')) {
      console.error('Error: Missing <tools.json> path for "agent-doctor migrate-skills".');
      process.exit(1);
    }
    const { tools } = loadToolsFromFile(filePath);
    const outDir = getFlagValue(args, '--dir') ?? path.join('.agents', 'skills');
    const result = migrateToolsToSkills(tools, outDir);
    if (outputJson) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log('='.repeat(82));
      console.log(
        `MCP-TO-SKILL PROGRESSIVE MIGRATION | Migrated ${result.migrated.length} tool(s) to ${path.resolve(outDir)}`,
      );
      console.log(
        `Always-On Context Reduction: ~${result.totalBeforeTokens} tok -> ~${result.totalAfterAlwaysOnTokens} tok (Saved ~${result.totalTokensSavedPerTurn} tok/turn)`,
      );
      console.log('-'.repeat(82));
      for (const item of result.migrated) {
        console.log(
          `  ${item.toolName} -> ${item.skillPath} (${item.beforeAlwaysOnTokens} -> ${item.afterFrontmatterTokens} always-on tok)`,
        );
      }
      console.log('='.repeat(82));
    }
    return;
  }

  if (subcommand === 'init-skill') {
    const targetDir = path.resolve(
      getFlagValue(args, '--dir') ?? path.join('.agents', 'skills', 'agent-doctor'),
    );
    fs.mkdirSync(targetDir, { recursive: true });
    const skillPath = path.join(targetDir, 'SKILL.md');
    fs.writeFileSync(skillPath, generateAgentSkillMarkdown(), 'utf8');
    console.log(`Generated AI Agent Skill at: ${skillPath}`);
    return;
  }

  if (subcommand === 'llms-txt') {
    const outPath = getFlagValue(args, '--out');
    const content = generateLlmsTxt();
    if (outPath) {
      const resolved = path.resolve(outPath);
      fs.mkdirSync(path.dirname(resolved), { recursive: true });
      fs.writeFileSync(resolved, content, 'utf8');
      console.log(`Wrote llms.txt to ${resolved}`);
    } else {
      console.log(content);
    }
    return;
  }

  if (subcommand === 'fix') {
    const filePath = args[1];
    if (!filePath || filePath.startsWith('--')) {
      console.error('Error: Missing <tools.json> path for "agent-doctor fix".');
      process.exit(1);
    }
    const { resolved, tools } = loadToolsFromFile(filePath);
    const outPath = getFlagValue(args, '--out');
    const result = fixMcpTools(tools, path.basename(resolved, '.json'));

    if (outPath) {
      const resolvedOut = path.resolve(outPath);
      fs.mkdirSync(path.dirname(resolvedOut), { recursive: true });
      fs.writeFileSync(resolvedOut, JSON.stringify(result.fixedTools, null, 2) + '\n', 'utf8');
    }

    if (outputJson) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }

    console.log('='.repeat(82));
    console.log(
      `AGENT-DOCTOR AUTO-FIX | ${result.beforeReport.score}/100 (${result.beforeReport.grade}) -> ${result.afterReport.score}/100 (${result.afterReport.grade}) [Delta: +${result.scoreDelta}]`,
    );
    console.log(
      `Context Token Footprint: ~${result.beforeReport.totalTokens} tok -> ~${result.afterReport.totalTokens} tok (Saved ~${result.tokensSaved} tok/turn)`,
    );
    console.log('-'.repeat(82));
    console.log(`Applied ${result.actions.length} automated repair(s):`);
    for (const act of result.actions) {
      console.log(`  [FIXED] ${act.ruleId} (${act.toolName}): ${act.description}`);
    }
    if (outPath) {
      console.log('-'.repeat(82));
      console.log(`Wrote repaired tool definitions to: ${path.resolve(outPath)}`);
    }
    console.log('='.repeat(82));
    return;
  }

  if (subcommand === 'badge') {
    const targetArg = args[1];
    if (!targetArg || targetArg.startsWith('--')) {
      console.error('Error: Missing <tools.json | command> for "agent-doctor badge".');
      process.exit(1);
    }
    const outPath = getFlagValue(args, '--out');
    const maybeFile = path.resolve(targetArg);
    const report = fs.existsSync(maybeFile)
      ? analyzeMcpServer({
          serverName: path.basename(maybeFile, '.json'),
          mode: 'static-schema',
          tools: loadToolsFromFile(targetArg).tools,
        })
      : await inspectStdioServer(parseCommandString(targetArg, 'stdio-server'), {
          timeoutMs: 8000,
        });

    const svg = generateHealthBadgeSvg(report);
    if (outPath) {
      const resolvedOut = path.resolve(outPath);
      fs.mkdirSync(path.dirname(resolvedOut), { recursive: true });
      fs.writeFileSync(resolvedOut, svg, 'utf8');
      console.log(`Saved SVG badge (${report.score}/100 ${report.grade}) to ${resolvedOut}`);
    } else {
      console.log(svg);
    }
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
      else if (outputSarif) console.log(JSON.stringify(formatSarifReport(report), null, 2));
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
      console.error('Error: Missing <command> argument for "agent-doctor check".');
      process.exit(1);
    }
    const name = getFlagValue(args, '--name') ?? 'stdio-server';
    const timeoutStr = getFlagValue(args, '--timeout');
    const timeoutMs = timeoutStr ? Number(timeoutStr) : 8000;
    const target = parseCommandString(commandStr, name);
    const report = await inspectStdioServer(target, { timeoutMs });

    if (outputJson) console.log(JSON.stringify(report, null, 2));
    else if (outputSarif) console.log(JSON.stringify(formatSarifReport(report, name), null, 2));
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
      console.error('Error: Missing <tools.json> path for "agent-doctor analyze".');
      process.exit(1);
    }
    const { resolved, tools } = loadToolsFromFile(filePath);
    const name = getFlagValue(args, '--name') ?? path.basename(resolved, '.json');

    const report = analyzeMcpServer({
      serverName: name,
      mode: 'static-schema',
      tools,
    });

    if (outputJson) console.log(JSON.stringify(report, null, 2));
    else if (outputSarif)
      console.log(JSON.stringify(formatSarifReport(report, path.basename(resolved)), null, 2));
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
          'No default MCP config found in workspace or user profile. Pass a path explicitly: agent-doctor scan-config <path/to/mcp.json>',
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
    const hasCriticalTransport = (scan.transportWarnings ?? []).some((w) => w.severity === 'error');
    if (ciGate && (scan.secretWarnings.length > 0 || hasCriticalTransport)) {
      process.exit(1);
    }
    return;
  }

  console.error(`Unknown command: ${subcommand}`);
  printHelp();
  process.exit(1);
}

main().catch((err) => {
  console.error(`agent-doctor fatal error: ${(err as Error).message}`);
  process.exit(1);
});
