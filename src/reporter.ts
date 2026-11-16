import { ConfigScanReport, ServerDiagnosisReport } from './types.js';

function makeBar(pct: number, width = 18): string {
  const filled = Math.max(0, Math.min(width, Math.round((pct / 100) * width)));
  return '#'.repeat(filled) + '-'.repeat(width - filled);
}

export function formatTerminalReport(report: ServerDiagnosisReport): string {
  const lines: string[] = [];
  const divider = '='.repeat(76);
  const thinDivider = '-'.repeat(76);

  lines.push(divider);
  lines.push(
    `MCP-DOCTOR REPORT | Server: ${report.serverName} | Score: ${report.score}/100 (${report.grade}) | ${
      report.passed ? 'PASSED' : 'ACTION NEEDED'
    }`,
  );
  lines.push(divider);

  lines.push(
    `Mode: ${report.mode} | Tools: ${report.toolCount} | Resources: ${report.resourceCount} | Prompts: ${report.promptCount}`,
  );
  if (report.protocolVersion || report.serverInfo) {
    lines.push(
      `Protocol: ${report.protocolVersion ?? 'unknown'} | Implementation: ${
        report.serverInfo ? `${report.serverInfo.name}@${report.serverInfo.version}` : 'n/a'
      }`,
    );
  }
  if (report.timing) {
    lines.push(
      `Handshake Latency: total=${report.timing.totalMs}ms (spawn=${report.timing.spawnMs}ms, init=${report.timing.initializeMs}ms, tools/list=${report.timing.toolsListMs}ms)`,
    );
  }

  lines.push(thinDivider);
  lines.push(
    `CONTEXT TOKEN FOOTPRINT: ~${report.totalTokens.toLocaleString()} tokens/turn` +
      (report.estimatedTokenSavingsIfOptimized > 0
        ? ` (Est. savings if optimized: ~${report.estimatedTokenSavingsIfOptimized.toLocaleString()} tokens/turn)`
        : ''),
  );
  lines.push(
    `Pillar Scores: Schema ${report.scoreBreakdown.schemaScore}/40 | Tokens ${report.scoreBreakdown.tokenScore}/30 | Latency ${report.scoreBreakdown.latencyScore}/15 | Security ${report.scoreBreakdown.securityScore}/15`,
  );

  if (report.tools.length > 0) {
    lines.push('');
    lines.push('Top Tools by Per-Turn Token Tax:');
    for (const tool of report.tools.slice(0, 10)) {
      const bar = makeBar(tool.shareOfServerPct);
      lines.push(
        `  ${tool.name.padEnd(34).slice(0, 34)} [${bar}] ${String(tool.totalTokens).padStart(5)} tok (${tool.shareOfServerPct
          .toFixed(1)
          .padStart(5)}%) | params=${tool.parameterCount} depth=${tool.maxDepth}`,
      );
    }
  }

  lines.push('');
  lines.push('Estimated Input Token Cost (Context Tax Only):');
  for (const c of report.costEstimates) {
    lines.push(
      `  ${c.label.padEnd(20)} $${c.inputPricePer1MTokensUsd.toFixed(2)}/1M -> $${c.costPer100TurnsUsd.toFixed(
        4,
      )} / 100 turns | $${c.costPer1kTurnsUsd.toFixed(3)} / 1,000 turns`,
    );
  }

  lines.push(thinDivider);
  if (report.findings.length === 0) {
    lines.push('DIAGNOSTIC FINDINGS: 0 issues detected. Clean MCP contract.');
  } else {
    const errors = report.findings.filter((f) => f.severity === 'error').length;
    const warnings = report.findings.filter((f) => f.severity === 'warning').length;
    const infos = report.findings.filter((f) => f.severity === 'info').length;
    lines.push(
      `DIAGNOSTIC FINDINGS (${report.findings.length} total: ${errors} error, ${warnings} warning, ${infos} info):`,
    );
    for (const f of report.findings) {
      const badge =
        f.severity === 'error' ? '[ERROR]' : f.severity === 'warning' ? '[WARN ]' : '[INFO ]';
      lines.push(`  ${badge} ${f.ruleId} (${f.target}): ${f.message}`);
      lines.push(`          Fix: ${f.suggestion}`);
    }
  }

  lines.push(divider);
  return lines.join('\n');
}

export function formatMarkdownReport(report: ServerDiagnosisReport): string {
  const lines: string[] = [];
  lines.push(`# MCP Doctor Report: \`${report.serverName}\``);
  lines.push('');
  lines.push(
    `**Health Score:** \`${report.score}/100\` (**Grade ${report.grade}**) · **Status:** ${
      report.passed ? 'PASSED' : 'ACTION NEEDED'
    } · **Per-Turn Context Tax:** \`~${report.totalTokens.toLocaleString()} tokens\``,
  );
  lines.push('');
  lines.push('## Score Breakdown');
  lines.push('');
  lines.push('| Pillar | Score | Max |');
  lines.push('| :--- | :---: | :---: |');
  lines.push(`| Schema & Ergonomics | ${report.scoreBreakdown.schemaScore} | 40 |`);
  lines.push(`| Context Token Efficiency | ${report.scoreBreakdown.tokenScore} | 30 |`);
  lines.push(`| Handshake Latency | ${report.scoreBreakdown.latencyScore} | 15 |`);
  lines.push(`| Boundary Security | ${report.scoreBreakdown.securityScore} | 15 |`);

  if (report.tools.length > 0) {
    lines.push('');
    lines.push('## Tool Token Footprint');
    lines.push('');
    lines.push('| Tool | Total Tokens | Share | Params | Max Depth |');
    lines.push('| :--- | :---: | :---: | :---: | :---: |');
    for (const t of report.tools) {
      lines.push(
        `| \`${t.name}\` | ${t.totalTokens} | ${t.shareOfServerPct}% | ${t.parameterCount} | ${t.maxDepth} |`,
      );
    }
  }

  lines.push('');
  lines.push('## Context Tax Cost per 1,000 Turns');
  lines.push('');
  lines.push('| Model | Input Rate ($/1M) | Cost / 100 Turns | Cost / 1,000 Turns |');
  lines.push('| :--- | :---: | :---: | :---: |');
  for (const c of report.costEstimates) {
    lines.push(
      `| ${c.label} | $${c.inputPricePer1MTokensUsd.toFixed(2)} | $${c.costPer100TurnsUsd.toFixed(
        4,
      )} | $${c.costPer1kTurnsUsd.toFixed(3)} |`,
    );
  }

  lines.push('');
  lines.push('## Diagnostic Findings');
  lines.push('');
  if (report.findings.length === 0) {
    lines.push('No schema, token, protocol, or security issues found.');
  } else {
    lines.push('| Rule | Severity | Target | Finding | Recommended Fix |');
    lines.push('| :--- | :---: | :--- | :--- | :--- |');
    for (const f of report.findings) {
      lines.push(
        `| \`${f.ruleId}\` | **${f.severity.toUpperCase()}** | \`${f.target}\` | ${f.message} | ${f.suggestion} |`,
      );
    }
  }

  return lines.join('\n');
}

export function formatConfigScanReport(scan: ConfigScanReport): string {
  const lines: string[] = [];
  lines.push('='.repeat(76));
  lines.push(`MCP CONFIG SCAN | File: ${scan.configPath}`);
  lines.push(`Configured Servers: ${scan.serverCount}`);
  lines.push('-'.repeat(76));

  if (scan.secretWarnings.length === 0) {
    lines.push('Secret Audit: 0 plaintext API keys detected in server env blocks.');
  } else {
    lines.push(`Secret Audit: ${scan.secretWarnings.length} potential plaintext secret(s) found:`);
    for (const w of scan.secretWarnings) {
      lines.push(
        `  [WARN ] ${w.serverName}.env.${w.envKey} (${w.patternName}): ${w.maskedPreview}`,
      );
      lines.push(`          Fix: ${w.suggestion}`);
    }
  }

  if (scan.duplicateCommands.length > 0) {
    lines.push('');
    lines.push('Duplicate Server Definitions:');
    for (const dup of scan.duplicateCommands) {
      lines.push(`  [WARN ] ${dup}`);
    }
  }

  for (const srvReport of scan.serverReports) {
    lines.push('');
    lines.push(formatTerminalReport(srvReport));
  }

  lines.push('='.repeat(76));
  return lines.join('\n');
}
