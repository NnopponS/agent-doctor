import http from 'node:http';
import { analyzeMcpServer } from './analyzer.js';
import { BLOATED_SAMPLE_TOOLS, OPTIMIZED_SAMPLE_TOOLS } from './demo-fixtures.js';
import { inspectStdioServer, parseCommandString } from './inspector.js';
import { MCP_DOCTOR_TOOLS } from './mcp-server.js';
import { formatMarkdownReport } from './reporter.js';
import { McpToolDefinition } from './types.js';

function renderDashboardHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>MCP Doctor — Universal MCP Inspector & Token Profiler</title>
  <style>
    :root {
      --bg: #0b0f17;
      --panel: #111827;
      --panel-alt: #172033;
      --border: #24324b;
      --text: #e5e7eb;
      --muted: #94a3b8;
      --accent: #38bdf8;
      --good: #22c55e;
      --warn: #f59e0b;
      --err: #ef4444;
      --mono: 'JetBrains Mono', 'Cascadia Code', Consolas, monospace;
      --sans: Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: var(--bg);
      color: var(--text);
      font-family: var(--sans);
      line-height: 1.5;
      padding: 24px;
    }
    .container { max-width: 1240px; margin: 0 auto; }
    header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 1px solid var(--border);
      padding-bottom: 16px;
      margin-bottom: 24px;
      flex-wrap: wrap;
      gap: 12px;
    }
    .brand { display: flex; align-items: center; gap: 12px; }
    .badge-logo {
      background: linear-gradient(135deg, #0284c7, #38bdf8);
      color: #082f49;
      font-weight: 800;
      font-family: var(--mono);
      padding: 6px 10px;
      border-radius: 6px;
      font-size: 14px;
    }
    h1 { font-size: 20px; font-weight: 700; letter-spacing: -0.02em; }
    .subtitle { color: var(--muted); font-size: 13px; }
    .controls { display: flex; gap: 8px; flex-wrap: wrap; }
    button {
      background: var(--panel-alt);
      color: var(--text);
      border: 1px solid var(--border);
      padding: 8px 14px;
      border-radius: 6px;
      cursor: pointer;
      font-size: 13px;
      font-weight: 600;
      transition: all 0.15s ease;
    }
    button:hover { border-color: var(--accent); color: #fff; }
    button.primary {
      background: #0284c7;
      border-color: #38bdf8;
      color: #fff;
    }
    .grid {
      display: grid;
      grid-template-columns: 380px 1fr;
      gap: 20px;
    }
    @media (max-width: 960px) { .grid { grid-template-columns: 1fr; } }
    .card {
      background: var(--panel);
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 18px;
      margin-bottom: 18px;
    }
    .card h2 {
      font-size: 14px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--muted);
      margin-bottom: 12px;
    }
    label { display: block; font-size: 12px; color: var(--muted); margin-bottom: 6px; }
    input, textarea {
      width: 100%;
      background: #070a10;
      border: 1px solid var(--border);
      color: var(--text);
      border-radius: 6px;
      padding: 10px;
      font-family: var(--mono);
      font-size: 12px;
      margin-bottom: 12px;
    }
    textarea { min-height: 220px; resize: vertical; }
    .kpi-row {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 12px;
      margin-bottom: 18px;
    }
    .kpi {
      background: var(--panel-alt);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 14px;
    }
    .kpi .val { font-size: 24px; font-weight: 800; font-family: var(--mono); }
    .kpi .lbl { font-size: 12px; color: var(--muted); }
    .bar-row { margin-bottom: 10px; }
    .bar-head {
      display: flex;
      justify-content: space-between;
      font-family: var(--mono);
      font-size: 12px;
      margin-bottom: 4px;
    }
    .bar-track {
      height: 8px;
      background: #070a10;
      border-radius: 4px;
      overflow: hidden;
    }
    .bar-fill {
      height: 100%;
      background: linear-gradient(90deg, #0284c7, #38bdf8);
    }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th, td {
      text-align: left;
      padding: 8px 10px;
      border-bottom: 1px solid var(--border);
    }
    th { color: var(--muted); font-size: 11px; text-transform: uppercase; }
    .sev-error { color: var(--err); font-weight: 700; font-family: var(--mono); }
    .sev-warning { color: var(--warn); font-weight: 700; font-family: var(--mono); }
    .sev-info { color: var(--accent); font-weight: 700; font-family: var(--mono); }
    code { font-family: var(--mono); font-size: 12px; color: #7dd3fc; }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <div class="brand">
        <span class="badge-logo">MCP-DOCTOR</span>
        <div>
          <h1>Universal MCP Server Inspector & Context Token Profiler</h1>
          <div class="subtitle">Audit JSON-RPC 2.0 handshakes, per-turn token tax, schema defects, and boundary security</div>
        </div>
      </div>
      <div class="controls">
        <button onclick="loadPreset('bloated')">Load Bloated Preset</button>
        <button onclick="loadPreset('optimized')">Load Optimized Preset</button>
        <button onclick="loadPreset('self')">Inspect mcp-doctor Tools</button>
        <button class="primary" onclick="copyMarkdown()">Copy Markdown Report</button>
      </div>
    </header>

    <div class="grid">
      <div>
        <div class="card">
          <h2>1. Live Stdio Server Check</h2>
          <label>Command Line (spawns stdio child & runs initialize + tools/list)</label>
          <input id="cmdInput" value="node dist/cli.js mcp" placeholder="e.g. npx -y @modelcontextprotocol/server-filesystem ." />
          <button class="primary" style="width:100%" onclick="runLiveCheck()">Run Live Handshake Check</button>
        </div>

        <div class="card">
          <h2>2. Static Schema / tools/list JSON Audit</h2>
          <label>Server Name</label>
          <input id="srvName" value="sample-mcp-server" />
          <label>Tools JSON Array</label>
          <textarea id="schemaInput"></textarea>
          <button style="width:100%" onclick="runSchemaAudit()">Analyze Tool Schemas</button>
        </div>
      </div>

      <div>
        <div class="kpi-row">
          <div class="kpi">
            <div class="lbl">Health Score</div>
            <div class="val" id="kpiScore">--</div>
          </div>
          <div class="kpi">
            <div class="lbl">Context Tax / Turn</div>
            <div class="val" id="kpiTokens">--</div>
          </div>
          <div class="kpi">
            <div class="lbl">Handshake Latency</div>
            <div class="val" id="kpiLatency">--</div>
          </div>
          <div class="kpi">
            <div class="lbl">Findings</div>
            <div class="val" id="kpiFindings">--</div>
          </div>
        </div>

        <div class="card">
          <h2>Per-Tool Context Token Distribution</h2>
          <div id="tokenBars"></div>
        </div>

        <div class="card">
          <h2>Estimated Context Cost (Per 100 & 1,000 Turns)</h2>
          <table>
            <thead>
              <tr><th>Model</th><th>Input Rate ($/1M)</th><th>100 Turns</th><th>1,000 Turns</th></tr>
            </thead>
            <tbody id="costTable"></tbody>
          </table>
        </div>

        <div class="card">
          <h2>Diagnostic Findings & Recommended Fixes</h2>
          <table>
            <thead>
              <tr><th>Rule</th><th>Severity</th><th>Target</th><th>Issue & Actionable Fix</th></tr>
            </thead>
            <tbody id="findingsTable"></tbody>
          </table>
        </div>
      </div>
    </div>
  </div>

  <script>
    let currentReport = null;

    async function loadPreset(kind) {
      const res = await fetch('/api/demo?preset=' + encodeURIComponent(kind));
      const data = await res.json();
      document.getElementById('srvName').value = data.report.serverName;
      document.getElementById('schemaInput').value = JSON.stringify(data.tools, null, 2);
      renderReport(data.report);
    }

    async function runSchemaAudit() {
      try {
        const serverName = document.getElementById('srvName').value || 'custom-server';
        const raw = JSON.parse(document.getElementById('schemaInput').value);
        const tools = Array.isArray(raw) ? raw : (raw.tools || []);
        const res = await fetch('/api/analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ serverName, tools })
        });
        const report = await res.json();
        renderReport(report);
      } catch (err) {
        alert('Invalid JSON: ' + err.message);
      }
    }

    async function runLiveCheck() {
      const commandLine = document.getElementById('cmdInput').value.trim();
      if (!commandLine) return;
      document.getElementById('kpiScore').textContent = '...';
      const res = await fetch('/api/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ commandLine })
      });
      const report = await res.json();
      renderReport(report);
    }

    async function copyMarkdown() {
      if (!currentReport) return;
      const res = await fetch('/api/markdown', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(currentReport)
      });
      const data = await res.json();
      await navigator.clipboard.writeText(data.markdown);
      alert('Copied Markdown report to clipboard!');
    }

    function renderReport(r) {
      currentReport = r;
      const scoreEl = document.getElementById('kpiScore');
      scoreEl.textContent = r.score + '/100 (' + r.grade + ')';
      scoreEl.style.color = r.score >= 85 ? 'var(--good)' : r.score >= 65 ? 'var(--warn)' : 'var(--err)';
      document.getElementById('kpiTokens').textContent = '~' + r.totalTokens.toLocaleString() + ' tok';
      document.getElementById('kpiLatency').textContent = r.timing ? r.timing.totalMs + ' ms' : 'static';
      document.getElementById('kpiFindings').textContent = r.findings.length;

      const barsEl = document.getElementById('tokenBars');
      barsEl.innerHTML = r.tools.map(t => \`
        <div class="bar-row">
          <div class="bar-head">
            <span><code>\${t.name}</code> (params: \${t.parameterCount}, depth: \${t.maxDepth})</span>
            <span>\${t.totalTokens} tok (\${t.shareOfServerPct}%)</span>
          </div>
          <div class="bar-track"><div class="bar-fill" style="width:\${Math.max(2, t.shareOfServerPct)}%"></div></div>
        </div>
      \`).join('') || '<div class="subtitle">No tools registered.</div>';

      document.getElementById('costTable').innerHTML = r.costEstimates.map(c => \`
        <tr>
          <td>\${c.label}</td>
          <td>$\${c.inputPricePer1MTokensUsd.toFixed(2)}</td>
          <td>$\${c.costPer100TurnsUsd.toFixed(4)}</td>
          <td><strong>$\${c.costPer1kTurnsUsd.toFixed(3)}</strong></td>
        </tr>
      \`).join('');

      document.getElementById('findingsTable').innerHTML = r.findings.length === 0
        ? '<tr><td colspan="4" style="color:var(--good)">0 issues detected. All MCP checks passed.</td></tr>'
        : r.findings.map(f => \`
          <tr>
            <td><code>\${f.ruleId}</code></td>
            <td class="sev-\${f.severity}">\${f.severity.toUpperCase()}</td>
            <td><code>\${f.target}</code></td>
            <td><div>\${f.message}</div><div class="subtitle">Fix: \${f.suggestion}</div></td>
          </tr>
        \`).join('');
    }

    loadPreset('bloated');
  </script>
</body>
</html>`;
}

export function startWebDashboard(options: { host?: string; port?: number } = {}): Promise<{
  server: http.Server;
  url: string;
}> {
  const host = options.host ?? '127.0.0.1';
  const port = options.port ?? 4310;

  return new Promise((resolve, reject) => {
    const server = http.createServer(async (req, res) => {
      const urlObj = new URL(req.url ?? '/', `http://${host}:${port}`);

      const sendJson = (status: number, payload: unknown) => {
        res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify(payload));
      };

      const readBody = (): Promise<string> =>
        new Promise((bResolve) => {
          let body = '';
          req.on('data', (chunk) => {
            body += chunk;
          });
          req.on('end', () => bResolve(body));
        });

      if (req.method === 'GET' && urlObj.pathname === '/') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(renderDashboardHtml());
        return;
      }

      if (req.method === 'GET' && urlObj.pathname === '/api/demo') {
        const preset = urlObj.searchParams.get('preset') ?? 'bloated';
        const tools: McpToolDefinition[] =
          preset === 'optimized'
            ? OPTIMIZED_SAMPLE_TOOLS
            : preset === 'self'
              ? MCP_DOCTOR_TOOLS
              : BLOATED_SAMPLE_TOOLS;
        const serverName =
          preset === 'optimized'
            ? 'optimized-server'
            : preset === 'self'
              ? 'mcp-doctor'
              : 'bloated-enterprise-server';
        const report = analyzeMcpServer({
          serverName,
          mode: 'static-schema',
          tools,
        });
        sendJson(200, { tools, report });
        return;
      }

      if (req.method === 'POST' && urlObj.pathname === '/api/analyze') {
        try {
          const body = JSON.parse(await readBody()) as {
            serverName?: string;
            tools?: McpToolDefinition[];
          };
          const report = analyzeMcpServer({
            serverName: body.serverName ?? 'custom-server',
            mode: 'static-schema',
            tools: Array.isArray(body.tools) ? body.tools : [],
          });
          sendJson(200, report);
        } catch (err) {
          sendJson(400, { error: (err as Error).message });
        }
        return;
      }

      if (req.method === 'POST' && urlObj.pathname === '/api/check') {
        try {
          const body = JSON.parse(await readBody()) as { commandLine?: string };
          const target = parseCommandString(body.commandLine ?? '', 'live-stdio');
          const report = await inspectStdioServer(target, { timeoutMs: 8000 });
          sendJson(200, report);
        } catch (err) {
          sendJson(400, { error: (err as Error).message });
        }
        return;
      }

      if (req.method === 'POST' && urlObj.pathname === '/api/markdown') {
        try {
          const report = JSON.parse(await readBody());
          sendJson(200, { markdown: formatMarkdownReport(report) });
        } catch (err) {
          sendJson(400, { error: (err as Error).message });
        }
        return;
      }

      sendJson(404, { error: 'Not found' });
    });

    server.on('error', reject);
    server.listen(port, host, () => {
      const addr = server.address();
      const actualPort = typeof addr === 'object' && addr ? addr.port : port;
      resolve({ server, url: `http://${host}:${actualPort}` });
    });
  });
}
