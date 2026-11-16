import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { analyzeMcpServer } from '../analyzer.js';
import { parseMcpConfigFile } from '../config-scanner.js';
import { BLOATED_SAMPLE_TOOLS, OPTIMIZED_SAMPLE_TOOLS } from '../demo-fixtures.js';
import { inspectStdioServer, parseCommandString } from '../inspector.js';
import { MCP_DOCTOR_TOOLS } from '../mcp-server.js';
import { formatMarkdownReport, formatTerminalReport } from '../reporter.js';
import { calculateCostEstimates, estimateTextTokens } from '../tokenizer.js';
import { startWebDashboard } from '../web-ui.js';

test('estimateTextTokens and calculateCostEstimates produce deterministic results', () => {
  const tok = estimateTextTokens('Search workspace files by regex pattern.');
  assert.ok(tok >= 5 && tok <= 15, `Expected reasonable token count, got ${tok}`);

  const costs = calculateCostEstimates(10_000);
  assert.equal(costs.length, 5);
  const sonnet = costs.find((c) => c.modelId === 'claude-sonnet-4');
  assert.ok(sonnet);
  assert.equal(sonnet.costPerTurnUsd, 0.03);
  assert.equal(sonnet.costPer1kTurnsUsd, 30);
});

test('analyzeMcpServer flags schema, security, and ergonomics defects on bloated tools', () => {
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
  assert.equal(report.passed, false);
});

test('analyzeMcpServer awards 100/100 (A+) to optimized and self MCP tools', () => {
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
    serverName: 'mcp-doctor-self',
    mode: 'static-schema',
    tools: MCP_DOCTOR_TOOLS,
  });
  assert.equal(selfReport.findings.length, 0);
  assert.equal(selfReport.score, 100);
  assert.equal(selfReport.grade, 'A+');
});

test('parseMcpConfigFile detects plaintext API keys and duplicate commands', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-doctor-test-'));
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

  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('inspectStdioServer performs real JSON-RPC 2.0 handshake against mcp-doctor mcp mode', async () => {
  const cliJsPath = path.resolve(process.cwd(), 'dist', 'cli.js');
  const target = parseCommandString(`node "${cliJsPath}" mcp`, 'mcp-doctor');
  const report = await inspectStdioServer(target, { timeoutMs: 6000 });

  assert.equal(report.serverName, 'mcp-doctor');
  assert.equal(report.protocolVersion, '2024-11-05');
  assert.equal(report.toolCount, 4);
  assert.equal(report.score, 100);
  assert.equal(report.grade, 'A+');
  assert.equal(report.passed, true);
  assert.ok(report.timing && report.timing.totalMs > 0);

  const termOut = formatTerminalReport(report);
  const mdOut = formatMarkdownReport(report);
  assert.ok(termOut.includes('Score: 100/100 (A+)'));
  assert.ok(mdOut.includes('# MCP Doctor Report: `mcp-doctor`'));
});

test('startWebDashboard serves HTML UI and JSON API endpoints', async () => {
  const { server, url } = await startWebDashboard({ host: '127.0.0.1', port: 0 });
  try {
    const htmlRes = await fetch(`${url}/`);
    assert.equal(htmlRes.status, 200);
    const htmlText = await htmlRes.text();
    assert.ok(htmlText.includes('Universal MCP Server Inspector'));

    const demoRes = await fetch(`${url}/api/demo?preset=optimized`);
    assert.equal(demoRes.status, 200);
    const demoJson = (await demoRes.json()) as { report: { score: number; grade: string } };
    assert.equal(demoJson.report.score, 100);
    assert.equal(demoJson.report.grade, 'A+');
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
