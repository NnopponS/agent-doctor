import { DIAGNOSTIC_RULE_REGISTRY } from './rules.js';
import { calculateCostEstimates, profileToolTokens } from './tokenizer.js';
import {
  DiagnosticFinding,
  HandshakeTiming,
  HealthGrade,
  McpPromptDefinition,
  McpResourceDefinition,
  McpToolDefinition,
  ServerDiagnosisReport,
  ToolTokenProfile,
} from './types.js';

export interface AnalyzeServerInput {
  serverName: string;
  mode: 'live-stdio' | 'static-schema';
  protocolVersion?: string | null;
  serverInfo?: { name: string; version: string } | null;
  timing?: HandshakeTiming | null;
  tools: McpToolDefinition[];
  resources?: McpResourceDefinition[];
  prompts?: McpPromptDefinition[];
  extraFindings?: DiagnosticFinding[];
}

export function scoreToGrade(score: number): HealthGrade {
  if (score >= 95) return 'A+';
  if (score >= 88) return 'A';
  if (score >= 76) return 'B';
  if (score >= 62) return 'C';
  if (score >= 48) return 'D';
  return 'F';
}

export function analyzeMcpServer(input: AnalyzeServerInput): ServerDiagnosisReport {
  const rawProfiles = input.tools.map((tool) => profileToolTokens(tool));
  const totalTokens = rawProfiles.reduce((acc, item) => acc + item.totalTokens, 0);
  const claude5TotalTokens = rawProfiles.reduce((acc, item) => acc + item.claude5Tokens, 0);

  const profiles: ToolTokenProfile[] = rawProfiles
    .map((p) => ({
      ...p,
      shareOfServerPct:
        totalTokens > 0 ? Number(((p.totalTokens / totalTokens) * 100).toFixed(1)) : 0,
    }))
    .sort((a, b) => b.totalTokens - a.totalTokens);

  const ruleFindings = DIAGNOSTIC_RULE_REGISTRY.flatMap((rule) =>
    rule.evaluate({
      serverName: input.serverName,
      tools: input.tools,
      profiles,
      totalTokens,
      timing: input.timing ?? null,
    }),
  );

  const findings: DiagnosticFinding[] = [...(input.extraFindings ?? []), ...ruleFindings];

  // Calculate potential token savings from verbose descriptions (>350 chars) & deep schemas
  let estimatedTokenSavingsIfOptimized = 0;
  for (const p of profiles) {
    if (p.descriptionTokens > 80) {
      estimatedTokenSavingsIfOptimized += Math.round((p.descriptionTokens - 55) * 0.85);
    }
    if (p.maxDepth > 4) {
      estimatedTokenSavingsIfOptimized += Math.round(p.schemaTokens * 0.2);
    }
  }

  // Score calculation across 4 pillars: Schema (40), Tokens & Cache (30), Protocol & Latency (15), Security (15)
  let schemaPenalty = 0;
  let tokenPenalty = 0;
  let latencyPenalty = 0;
  let securityPenalty = 0;

  for (const f of findings) {
    const weight = f.severity === 'error' ? 12 : f.severity === 'warning' ? 5 : 1.0;
    if (f.category === 'schema' || f.category === 'ergonomics') {
      schemaPenalty += weight;
    } else if (f.category === 'tokens' || f.category === 'cache') {
      tokenPenalty += weight;
    } else if (f.category === 'protocol') {
      latencyPenalty += weight;
    } else if (f.category === 'security') {
      securityPenalty += weight;
    }
  }

  const schemaScore = Math.max(0, Math.round(40 - Math.min(40, schemaPenalty)));
  const tokenScore = Math.max(0, Math.round(30 - Math.min(30, tokenPenalty)));
  const latencyScore = Math.max(0, Math.round(15 - Math.min(15, latencyPenalty)));
  const securityScore = Math.max(0, Math.round(15 - Math.min(15, securityPenalty)));

  const score = Math.max(0, Math.min(100, schemaScore + tokenScore + latencyScore + securityScore));
  const grade = scoreToGrade(score);
  const hasErrors = findings.some((f) => f.severity === 'error');

  return {
    serverName: input.serverName,
    mode: input.mode,
    protocolVersion: input.protocolVersion ?? null,
    serverInfo: input.serverInfo ?? null,
    timing: input.timing ?? null,
    toolCount: input.tools.length,
    resourceCount: input.resources?.length ?? 0,
    promptCount: input.prompts?.length ?? 0,
    tools: profiles,
    totalTokens,
    claude5TotalTokens,
    estimatedTokenSavingsIfOptimized,
    costEstimates: calculateCostEstimates(totalTokens),
    findings,
    scoreBreakdown: {
      schemaScore,
      tokenScore,
      latencyScore,
      securityScore,
    },
    score,
    grade,
    passed: !hasErrors && score >= 70,
    timestamp: new Date().toISOString(),
  };
}

