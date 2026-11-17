import {
  AgentStackAuditReport,
  ConfigScanReport,
  ServerDiagnosisReport,
} from './types.js';

function makeBar(pct: number, width = 18): string {
  const filled = Math.max(0, Math.min(width, Math.round((pct / 100) * width)));
  return '#'.repeat(filled) + '-'.repeat(width - filled);
}

export function formatTerminalReport(report: ServerDiagnosisReport): string {
  const lines: string[] = [];
  const divider = '='.repeat(82);
  const thinDivider = '-'.repeat(82);

  lines.push(divider);
  lines.push(
    `AGENT-DOCTOR REPORT | Target: ${report.serverName} | Score: ${report.score}/100 (${report.grade}) | ${
      report.passed ? 'PASSED' : 'ACTION NEEDED'
    }`,
  );
  lines.push(divider);

  lines.push(
    `Mode: ${report.mode} | Tools: ${report.toolCount} | Resources: ${report.resourceCount} | Prompts: ${report.promptCount}`,
  );
  if (report.protocolVersion || report.serverInfo) {
    lines.push(
      `MCP Spec: ${report.protocolVersion ?? 'unknown'} | Implementation: ${
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
    `CONTEXT TOKEN FOOTPRINT: ~${report.totalTokens.toLocaleString()} tok/turn (Claude 5.x 1.3x tokenizer: ~${report.claude5TotalTokens.toLocaleString()} tok/turn)` +
      (report.estimatedTokenSavingsIfOptimized > 0
        ? ` | Est. savings: ~${report.estimatedTokenSavingsIfOptimized.toLocaleString()} tok/turn`
        : ''),
  );
  lines.push(
    `Pillar Scores: Schema ${report.scoreBreakdown.schemaScore}/40 | Tokens & Cache ${report.scoreBreakdown.tokenScore}/30 | Protocol & Latency ${report.scoreBreakdown.latencyScore}/15 | Security ${report.scoreBreakdown.securityScore}/15`,
  );

  if (report.tools.length > 0) {
    lines.push('');
    lines.push('Top Tools by Per-Turn Token Tax:');
    for (const tool of report.tools.slice(0, 10)) {
      const bar = makeBar(tool.shareOfServerPct);
      const annotBadge = tool.hasSafetyAnnotations ? 'annot:yes' : 'annot:no';
      lines.push(
        `  ${tool.name.padEnd(32).slice(0, 32)} [${bar}] ${String(tool.totalTokens).padStart(5)} tok (${tool.shareOfServerPct
          .toFixed(1)
          .padStart(5)}%) | params=${tool.parameterCount} depth=${tool.maxDepth} ${annotBadge}`,
      );
    }
  }

  lines.push('');
  lines.push('2026 Frontier Model Context Cost (1,000 Turns: Prefix-Cached vs Cache-Miss):');
  for (const c of report.costEstimates) {
    lines.push(
      `  ${c.label.padEnd(20)} $${c.inputPricePer1MTokensUsd.toFixed(2)}/1M ($${c.cachedInputPricePer1MTokensUsd.toFixed(
        3,
      )} cached) -> Cached: $${c.cachedCostPer1kTurnsUsd.toFixed(3)}/1k | Uncached: $${c.costPer1kTurnsUsd.toFixed(
        3,
      )}/1k (Cache-bust penalty: +$${c.cacheBustPenaltyPer1kTurnsUsd.toFixed(3)})`,
    );
  }

  lines.push(thinDivider);
  if (report.findings.length === 0) {
    lines.push('DIAGNOSTIC FINDINGS: 0 issues detected. Clean 2026 MCP contract.');
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
  lines.push(`# Agent Doctor Report: \`${report.serverName}\``);
  lines.push('');
  lines.push(
    `**Health Score:** \`${report.score}/100\` (**Grade ${report.grade}**) · **Status:** ${
      report.passed ? 'PASSED' : 'ACTION NEEDED'
    } · **Per-Turn Context Tax:** \`~${report.totalTokens.toLocaleString()} tokens\` (\`~${report.claude5TotalTokens.toLocaleString()} tokens\` on Claude 5.x)`,
  );
  lines.push('');
  lines.push('## Score Breakdown');
  lines.push('');
  lines.push('| Pillar | Score | Max |');
  lines.push('| :--- | :---: | :---: |');
  lines.push(`| Schema & Ergonomics | ${report.scoreBreakdown.schemaScore} | 40 |`);
  lines.push(`| Context Token & Cache Efficiency | ${report.scoreBreakdown.tokenScore} | 30 |`);
  lines.push(`| Protocol & Handshake Latency | ${report.scoreBreakdown.latencyScore} | 15 |`);
  lines.push(`| Boundary Security | ${report.scoreBreakdown.securityScore} | 15 |`);

  if (report.tools.length > 0) {
    lines.push('');
    lines.push('## Tool Token Footprint');
    lines.push('');
    lines.push('| Tool | Base Tokens | Claude 5.x Tokens | Share | Params | Max Depth | MCP 2026 Annotations |');
    lines.push('| :--- | :---: | :---: | :---: | :---: | :---: | :---: |');
    for (const t of report.tools) {
      lines.push(
        `| \`${t.name}\` | ${t.totalTokens} | ${t.claude5Tokens} | ${t.shareOfServerPct}% | ${t.parameterCount} | ${t.maxDepth} | ${
          t.hasSafetyAnnotations ? 'Yes' : 'No'
        } |`,
      );
    }
  }

  lines.push('');
  lines.push('## 2026 Frontier Model Context Cost per 1,000 Turns');
  lines.push('');
  lines.push('| Model | Provider | Input ($/1M) | Cache Hit ($/1M) | Cached / 1k Turns | Uncached / 1k Turns | Cache-Bust Penalty |');
  lines.push('| :--- | :--- | :---: | :---: | :---: | :---: | :---: |');
  for (const c of report.costEstimates) {
    lines.push(
      `| **${c.label}** | ${c.provider} | $${c.inputPricePer1MTokensUsd.toFixed(2)} | $${c.cachedInputPricePer1MTokensUsd.toFixed(
        3,
      )} | $${c.cachedCostPer1kTurnsUsd.toFixed(3)} | $${c.costPer1kTurnsUsd.toFixed(3)} | +$${c.cacheBustPenaltyPer1kTurnsUsd.toFixed(
        3,
      )} |`,
    );
  }

  lines.push('');
  lines.push('## Diagnostic Findings');
  lines.push('');
  if (report.findings.length === 0) {
    lines.push('No schema, token, cache, protocol, or security issues found.');
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
  lines.push('='.repeat(82));
  lines.push(`AGENT-DOCTOR CONFIG SCAN | File: ${scan.configPath}`);
  lines.push(`Configured Servers: ${scan.serverCount}`);
  lines.push('-'.repeat(82));

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

  if (scan.transportWarnings && scan.transportWarnings.length > 0) {
    lines.push('');
    lines.push('MCP 2026 Transport & OAuth 2.1 Findings:');
    for (const tw of scan.transportWarnings) {
      lines.push(`  [${tw.severity.toUpperCase()}] ${tw.ruleId} (${tw.target}): ${tw.message}`);
      lines.push(`          Fix: ${tw.suggestion}`);
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

  lines.push('='.repeat(82));
  return lines.join('\n');
}

export function formatStackAuditReport(report: AgentStackAuditReport): string {
  const lines: string[] = [];
  const divider = '='.repeat(82);
  const thinDivider = '-'.repeat(82);

  lines.push(divider);
  lines.push(
    `AGENT-DOCTOR 2026 AAIF STACK AUDIT | Score: ${report.score}/100 (${report.grade}) | ${
      report.passed ? 'PASSED' : 'ACTION NEEDED'
    }`,
  );
  lines.push(divider);
  lines.push(`Workspace: ${report.rootDir}`);
  lines.push(
    `Always-On Context Tax: ~${report.alwaysOnContextTokens.toLocaleString()} tok/turn | On-Demand Progressive Skills: ~${report.onDemandSkillTokens.toLocaleString()} tok`,
  );
  lines.push(thinDivider);
  lines.push('AAIF 4-Layer Architecture Breakdown:');
  for (const layer of report.layers) {
    const labelMap: Record<string, string> = {
      'agents-md': 'Layer 1: AGENTS.md (Always-On Repo Context)',
      skills: 'Layer 2: SKILL.md (Progressive Agent Skills)',
      mcp: 'Layer 3: MCP 2026 (Tools & OAuth 2.1 Config)',
      a2a: 'Layer 4: A2A Protocol (agent-card.json)',
    };
    lines.push(
      `  ${(labelMap[layer.layer] ?? layer.layer).padEnd(45)} [${layer.status.toUpperCase().padEnd(7)}] | Always-On: ${String(
        layer.alwaysOnTokens,
      ).padStart(5)} tok | On-Demand: ${String(layer.onDemandTokens).padStart(5)} tok | Files: ${
        layer.filesInspected.length > 0 ? layer.filesInspected.join(', ') : 'none'
      }`,
    );
  }

  lines.push(thinDivider);
  if (report.findings.length === 0) {
    lines.push('FINDINGS: 0 issues detected across AGENTS.md, SKILL.md, MCP 2026, and A2A layers.');
  } else {
    lines.push(`FINDINGS (${report.findings.length} total):`);
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
