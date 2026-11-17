import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { analyzeMcpServer } from '../analyzer.js';
import { generateHealthBadgeSvg } from '../badge.js';
import { parseMcpConfigFile } from '../config-scanner.js';
import { BLOATED_SAMPLE_TOOLS, OPTIMIZED_SAMPLE_TOOLS } from '../demo-fixtures.js';
import { fixMcpTools } from '../fixer.js';
import { inspectStdioServer, parseCommandString } from '../inspector.js';
import { MCP_DOCTOR_TOOLS } from '../mcp-server.js';
import { formatMarkdownReport, formatTerminalReport } from '../reporter.js';
import { formatSarifReport } from '../sarif.js';
import { generateAgentSkillMarkdown, generateLlmsTxt } from '../skill-generator.js';
import {
  auditA2AAgentCard,
  auditAgentStack,
  auditAgentsMd,
  auditSkillMd,
  migrateToolsToSkills,
} from '../stack-auditor.js';
import { calculateCostEstimates, estimateTextTokens } from '../tokenizer.js';
import { startWebDashboard } from '../web-ui.js';

test('estimateTextTokens and calculateCostEstimates cover 2026 frontier models and cache pricing', () => {
  const tok = estimateTextTokens('Search workspace files by regex pattern.');
  assert.ok(tok >= 5 && tok <= 15, `Expected reasonable token count, got ${tok}`);

  const costs = calculateCostEstimates(10_000);
  assert.equal(costs.length, 10);

  const sonnet55 = costs.find((c) => c.modelId === 'claude-sonnet-5-5');
  assert.ok(sonnet55, 'Expected Claude Sonnet 5.5 in 2026 pricing matrix');
  assert.equal(sonnet55.tokenizerMultiplier, 1.3);
  assert.equal(sonnet55.effectiveTokens, 13_000);
  assert.equal(sonnet55.costPer1kTurnsUsd, 26);
  assert.equal(sonnet55.cachedCostPer1kTurnsUsd, 1.3);
  assert.ok(sonnet55.cacheBustPenaltyPer1kTurnsUsd > 24);

  const gpt6Astra = costs.find((c) => c.modelId === 'gpt-6-astra');
  assert.ok(gpt6Astra, 'Expected GPT-6 Astra');
  const gemini4Argon = costs.find((c) => c.modelId === 'gemini-4-argon');
  assert.ok(gemini4Argon, 'Expected Gemini 4 Argon');
  const deepseekV4 = costs.find((c) => c.modelId === 'deepseek-v4-pro');
  assert.ok(deepseekV4, 'Expected DeepSeek V4-Pro');
  const qwen38 = costs.find((c) => c.modelId === 'qwen-3.8-max');
  assert.ok(qwen38, 'Expected Qwen 3.8 Max');
});

test('analyzeMcpServer flags schema, cache-busting, security, and ergonomics defects on bloated tools', () => {
  const report = analyzeMcpServer({
    serverName: 'bloated-test-server',
    mode: 'static-schema',
    tools: BLOATED_SAMPLE_TOOLS,
  });

  const ruleIds = new Set(report.findings.map((f) => f.ruleId));
  assert.ok(ruleIds.has('MCP001'), 'Should flag missing root type:"object" (MCP001)');
  assert.ok(ruleIds.has('MCP002'), 'Should flag short description on query_database_raw (MCP002)');
  assert.ok(ruleIds.has('MCP003'), 'Should flag overly long description >550 chars (MCP003)');
  assert.ok(ruleIds.has('MCP004'), 'Should flag untyped sql parameter (MCP004)');
  assert.ok(ruleIds.has('MCP005'), 'Should flag undocumented parameters (MCP005)');
  assert.ok(ruleIds.has('MCP006'), 'Should flag ghost required parameter (MCP006)');
  assert.ok(ruleIds.has('MCP007'), 'Should flag schema nesting depth > 4 (MCP007)');
  assert.ok(ruleIds.has('MCP014'), 'Should flag unconstrained shell execution tool (MCP014)');
  assert.ok(ruleIds.has('MCP015'), 'Should flag mode string parameter without enum (MCP015)');
  assert.ok(ruleIds.has('MCP018'), 'Should flag volatile timestamp cache-busting signal (MCP018)');
  assert.ok(ruleIds.has('MCP019'), 'Should flag missing MCP 2026 safety annotations (MCP019)');
  assert.equal(report.passed, false);
});

test('analyzeMcpServer awards 100/100 (A+) to optimized and self agent-doctor tools', () => {
  const optReport = analyzeMcpServer({
    serverName: 'optimized-server',
    mode: 'static-schema',
    tools: OPTIMIZED_SAMPLE_TOOLS,
  });
  assert.equal(optReport.findings.length, 0);
  assert.equal(optReport.score, 100);
  assert.equal(optReport.grade, 'A+');
  assert.equal(optReport.passed, true);

  const selfReport = analyzeMcpServer({
    serverName: 'agent-doctor-self',
    mode: 'static-schema',
    tools: MCP_DOCTOR_TOOLS,
  });
  assert.equal(selfReport.findings.length, 0);
  assert.equal(selfReport.score, 100);
  assert.equal(selfReport.grade, 'A+');
});

test('fixMcpTools heals schema defects, strips cache-busting timestamps, and synthesizes MCP 2026 annotations', () => {
  const fixRes = fixMcpTools(BLOATED_SAMPLE_TOOLS, 'bloated-test-server');
  assert.ok(fixRes.actions.length >= 8);
  assert.ok(fixRes.afterReport.score >= 90, `Expected fixed score >= 90, got ${fixRes.afterReport.score}`);
  assert.equal(
    fixRes.afterReport.findings.filter((f) => f.severity === 'error').length,
    0,
    'Auto-fix must resolve all schema and cache errors',
  );
  assert.ok(fixRes.tokensSaved > 50, `Expected significant token savings, got ${fixRes.tokensSaved}`);

  const shellTool = fixRes.fixedTools.find((t) => t.name === 'execute_unrestricted_shell_command');
  assert.ok(shellTool && !/\b202\d-\d{2}-\d{2}T/.test(shellTool.description ?? ''));
  assert.equal(shellTool?.annotations?.destructiveHint, true);

  const sarif = formatSarifReport(fixRes.beforeReport, 'bloated.json') as {
    version: string;
    runs: Array<{ results: unknown[] }>;
  };
  assert.equal(sarif.version, '2.1.0');
  assert.ok(sarif.runs[0].results.length > 0);

  const svg = generateHealthBadgeSvg(fixRes.afterReport);
  assert.ok(svg.startsWith('<svg') && svg.includes('Agent Doctor'));
});

test('parseMcpConfigFile detects plaintext API keys, duplicate commands, and legacy SSE transport', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-doctor-test-'));
  const cfgPath = path.join(tmpDir, 'mcp.json');
  fs.writeFileSync(
    cfgPath,
    JSON.stringify({
      mcpServers: {
        alpha: {
          command: 'node',
          args: ['server.js'],
          env: {
            OPENAI_API_KEY: 'sk-proj-1234567890abcdefghijklmnop',
          },
        },
        beta: {
          command: 'node',
          args: ['server.js'],
          env: {
            SAFE_VAR: 'production',
          },
        },
        legacyRemote: {
          url: 'http://mcp.internal.example.com/sse',
          transport: 'sse',
        },
      },
    }),
    'utf8',
  );

  const parsed = parseMcpConfigFile(cfgPath);
  assert.equal(parsed.servers.length, 2);
  assert.equal(parsed.secretWarnings.length, 1);
  assert.equal(parsed.secretWarnings[0].serverName, 'alpha');
  assert.equal(parsed.secretWarnings[0].envKey, 'OPENAI_API_KEY');
  assert.equal(parsed.duplicateCommands.length, 1);
  assert.equal(parsed.transportWarnings.length, 2);

  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('AAIF 4-layer stack auditor validates AGENTS.md, SKILL.md, A2A agent-card.json, and MCP-to-Skill migration', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-doctor-stack-'));
  fs.writeFileSync(
    path.join(tmpDir, 'AGENTS.md'),
    '# Project Rules\n\nRun `npm test` before finishing.\n',
    'utf8',
  );
  const skillDir = path.join(tmpDir, '.agents', 'skills', 'demo-skill');
  fs.mkdirSync(skillDir, { recursive: true });
  fs.writeFileSync(path.join(skillDir, 'SKILL.md'), generateAgentSkillMarkdown(), 'utf8');

  fs.mkdirSync(path.join(tmpDir, '.well-known'), { recursive: true });
  fs.writeFileSync(
    path.join(tmpDir, '.well-known', 'agent-card.json'),
    JSON.stringify({
      name: 'demo-agent',
      version: '2.0.0',
      description: 'Demo A2A agent card',
      url: 'https://agent.example.com/a2a',
      capabilities: { streaming: true, pushNotifications: false },
      securitySchemes: { oauth2: { type: 'oauth2' } },
      defaultInputModes: ['text/plain', 'application/json'],
      defaultOutputModes: ['text/plain', 'application/json'],
      skills: [
        {
          id: 'audit',
          name: 'Audit Agent Stack',
          description: 'Audits AAIF stack layers',
          tags: ['aaif', 'mcp'],
        },
      ],
    }),
    'utf8',
  );

  fs.writeFileSync(path.join(tmpDir, '.mcp.json'), JSON.stringify({ mcpServers: {} }), 'utf8');

  const stackReport = await auditAgentStack(tmpDir);
  assert.equal(stackReport.passed, true);
  assert.equal(stackReport.score, 100);
  assert.equal(stackReport.layers.length, 4);

  const migrOut = path.join(tmpDir, '.agents', 'migrated');
  const migration = migrateToolsToSkills(BLOATED_SAMPLE_TOOLS, migrOut);
  assert.equal(migration.migrated.length, 3);
  assert.ok(migration.totalTokensSavedPerTurn > 200);

  const a2aBad = auditA2AAgentCard({ url: 'http://insecure.example.com' }, 'bad.json');
  assert.ok(a2aBad.some((f) => f.ruleId === 'A2A001'));
  assert.ok(a2aBad.some((f) => f.ruleId === 'A2A002'));

  const agentsRes = auditAgentsMd('No commands here', 'AGENTS.md');
  assert.ok(agentsRes.findings.some((f) => f.ruleId === 'AGT002'));

  const skillRes = auditSkillMd('# Missing frontmatter', 'SKILL.md');
  assert.ok(skillRes.findings.some((f) => f.ruleId === 'SKL001'));

  const llms = generateLlmsTxt();
  assert.ok(llms.includes('agent-doctor (v2.0.0)') && llms.includes('Claude Sonnet 5.5'));

  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('inspectStdioServer performs real JSON-RPC 2.0 (2026-07-28) handshake against agent-doctor mcp mode', async () => {
  const cliJsPath = path.resolve(process.cwd(), 'dist', 'cli.js');
  const target = parseCommandString(`node "${cliJsPath}" mcp`, 'agent-doctor');
  const report = await inspectStdioServer(target, { timeoutMs: 6000 });

  assert.equal(report.serverName, 'agent-doctor');
  assert.equal(report.protocolVersion, '2026-07-28');
  assert.equal(report.toolCount, 7);
  assert.equal(report.score, 100);
  assert.equal(report.grade, 'A+');
  assert.equal(report.passed, true);
  assert.ok(report.timing && report.timing.totalMs > 0);

  const termOut = formatTerminalReport(report);
  const mdOut = formatMarkdownReport(report);
  assert.ok(termOut.includes('Score: 100/100 (A+)'));
  assert.ok(mdOut.includes('# Agent Doctor Report: `agent-doctor`'));
});

test('startWebDashboard serves HTML UI and v2.0 JSON API endpoints', async () => {
  const { server, url } = await startWebDashboard({ host: '127.0.0.1', port: 0 });
  try {
    const htmlRes = await fetch(`${url}/`);
    assert.equal(htmlRes.status, 200);
    const htmlText = await htmlRes.text();
    assert.ok(htmlText.includes('AGENT-DOCTOR v2.0'));

    const demoRes = await fetch(`${url}/api/demo?preset=optimized`);
    assert.equal(demoRes.status, 200);
    const demoJson = (await demoRes.json()) as { report: { score: number; grade: string } };
    assert.equal(demoJson.report.score, 100);
    assert.equal(demoJson.report.grade, 'A+');

    const fixRes = await fetch(`${url}/api/fix`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ serverName: 'api-test', tools: BLOATED_SAMPLE_TOOLS }),
    });
    assert.equal(fixRes.status, 200);
    const fixJson = (await fixRes.json()) as { afterReport: { score: number }; tokensSaved: number };
    assert.ok(fixJson.afterReport.score >= 90);
    assert.ok(fixJson.tokensSaved > 50);

    const stackRes = await fetch(`${url}/api/stack?dir=.`);
    assert.equal(stackRes.status, 200);
    const stackJson = (await stackRes.json()) as { layers: unknown[] };
    assert.equal(stackJson.layers.length, 4);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
