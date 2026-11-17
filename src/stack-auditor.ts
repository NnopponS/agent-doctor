import fs from 'node:fs';
import path from 'node:path';
import { scoreToGrade } from './analyzer.js';
import { scanMcpConfig } from './config-scanner.js';
import { calculateCostEstimates, estimateTextTokens, profileToolTokens } from './tokenizer.js';
import {
  A2AAgentCard,
  AgentStackAuditReport,
  DiagnosticFinding,
  McpToolDefinition,
  StackLayerSummary,
} from './types.js';

export function auditA2AAgentCard(
  card: A2AAgentCard,
  sourceName = 'agent-card.json',
): DiagnosticFinding[] {
  const findings: DiagnosticFinding[] = [];

  if (!card.name || !card.version || !card.url || !card.description) {
    const missing = ['name', 'version', 'url', 'description'].filter(
      (k) => !card[k as keyof A2AAgentCard],
    );
    findings.push({
      ruleId: 'A2A001',
      severity: 'error',
      category: 'a2a',
      target: sourceName,
      message: `A2A Agent Card is missing required identity field(s): ${missing.join(', ')}.`,
      suggestion:
        'Provide name, version, description, and canonical HTTPS endpoint url per the AAIF Agent2Agent specification.',
    });
  }

  if (typeof card.url === 'string' && card.url.startsWith('http://') && !card.url.includes('localhost') && !card.url.includes('127.0.0.1')) {
    findings.push({
      ruleId: 'A2A002',
      severity: 'error',
      category: 'security',
      target: sourceName,
      message: `A2A Agent Card URL "${card.url}" uses plaintext HTTP instead of HTTPS.`,
      suggestion: 'Serve remote A2A endpoints over TLS (HTTPS) and declare securitySchemes (OAuth 2.1 / mTLS / Bearer).',
    });
  }

  if (!card.securitySchemes || Object.keys(card.securitySchemes).length === 0) {
    findings.push({
      ruleId: 'A2A002',
      severity: 'warning',
      category: 'security',
      target: sourceName,
      message: `A2A Agent Card "${card.name ?? sourceName}" does not declare securitySchemes.`,
      suggestion:
        'Add securitySchemes (e.g., oauth2 with PKCE / OAuth 2.1 Resource Server metadata) so peer agents can authenticate.',
    });
  }

  if (
    !card.capabilities ||
    typeof card.capabilities.streaming !== 'boolean' ||
    !Array.isArray(card.defaultInputModes) ||
    !Array.isArray(card.defaultOutputModes)
  ) {
    findings.push({
      ruleId: 'A2A003',
      severity: 'warning',
      category: 'a2a',
      target: sourceName,
      message: `A2A Agent Card "${card.name ?? sourceName}" omits explicit streaming capability or defaultInputModes/defaultOutputModes MIME arrays.`,
      suggestion:
        'Declare capabilities: { streaming: true, pushNotifications: false } and defaultInputModes/defaultOutputModes (e.g., ["text/plain", "application/json"]).',
    });
  }

  if (!Array.isArray(card.skills) || card.skills.length === 0) {
    findings.push({
      ruleId: 'A2A004',
      severity: 'error',
      category: 'a2a',
      target: sourceName,
      message: `A2A Agent Card "${card.name ?? sourceName}" declares 0 skills.`,
      suggestion:
        'Populate skills: [{ id, name, description, tags, examples }] so orchestrator agents can route tasks accurately.',
    });
  } else {
    for (const skill of card.skills) {
      if (!skill.id || !skill.name || !skill.description || !Array.isArray(skill.tags)) {
        findings.push({
          ruleId: 'A2A004',
          severity: 'warning',
          category: 'a2a',
          target: `${sourceName}#${skill.id || skill.name || 'skill'}`,
          message: `A2A skill "${skill.name || skill.id || 'unnamed'}" is missing id, description, or discovery tags.`,
          suggestion: 'Include id, name, concise description, and tags[] on every A2A skill entry.',
        });
      }
    }
  }

  return findings;
}

export function auditAgentsMd(
  content: string,
  fileName = 'AGENTS.md',
): { tokens: number; findings: DiagnosticFinding[] } {
  const tokens = estimateTextTokens(content);
  const findings: DiagnosticFinding[] = [];

  if (tokens > 1500) {
    findings.push({
      ruleId: 'AGT001',
      severity: 'warning',
      category: 'agents-md',
      target: fileName,
      message: `Always-on instruction file "${fileName}" consumes ~${tokens} tokens on every turn (> 1,500 token budget).`,
      suggestion:
        'Keep AGENTS.md under 1,500 tokens (build/test commands and core boundaries) and move task-specific workflows into progressive .agents/skills/<name>/SKILL.md files.',
    });
  }

  const hasVerificationCmd = /\b(?:npm\s+test|pnpm\s+test|pytest|cargo\s+test|go\s+test|vitest|jest|npm\s+run\s+build|tsc)\b/i.test(
    content,
  );
  if (!hasVerificationCmd) {
    findings.push({
      ruleId: 'AGT002',
      severity: 'info',
      category: 'agents-md',
      target: fileName,
      message: `"${fileName}" does not specify executable build/test verification commands.`,
      suggestion:
        'Include exact test/typecheck commands in AGENTS.md so coding agents can self-verify changes before completing tasks.',
    });
  }

  return { tokens, findings };
}

export function auditSkillMd(
  content: string,
  fileName = 'SKILL.md',
): { frontmatterTokens: number; bodyTokens: number; findings: DiagnosticFinding[] } {
  const findings: DiagnosticFinding[] = [];
  const fmMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);

  if (!fmMatch) {
    const total = estimateTextTokens(content);
    findings.push({
      ruleId: 'SKL001',
      severity: 'error',
      category: 'skills',
      target: fileName,
      message: `Agent Skill "${fileName}" is missing required YAML frontmatter (--- name / description ---).`,
      suggestion:
        'Add YAML frontmatter with "name" and "description" so AAIF-compatible agents can lazy-load the skill on demand.',
    });
    return { frontmatterTokens: total, bodyTokens: 0, findings };
  }

  const frontmatter = fmMatch[1];
  const body = fmMatch[2];
  const frontmatterTokens = estimateTextTokens(frontmatter);
  const bodyTokens = estimateTextTokens(body);

  const hasName = /^name:\s*\S+/m.test(frontmatter);
  const descMatch = frontmatter.match(/^description:\s*(.+)$/m);

  if (!hasName || !descMatch) {
    findings.push({
      ruleId: 'SKL001',
      severity: 'error',
      category: 'skills',
      target: fileName,
      message: `Agent Skill "${fileName}" frontmatter must define both "name" and "description".`,
      suggestion: 'Specify "name: <slug>" and "description: Use when..." in the YAML frontmatter.',
    });
  }

  if (frontmatterTokens > 120) {
    findings.push({
      ruleId: 'SKL002',
      severity: 'warning',
      category: 'skills',
      target: fileName,
      message: `Skill "${fileName}" YAML frontmatter costs ~${frontmatterTokens} tokens (> 120 token progressive-disclosure budget).`,
      suggestion:
        'Keep YAML frontmatter under ~100 tokens because frontmatter stays in always-on context while the Markdown body loads on demand.',
    });
  }

  if (descMatch && !/\b(?:use\s+when|when\s+the\s+user|whenever|use\s+for|audit|diagnose|inspect)\b/i.test(descMatch[1])) {
    findings.push({
      ruleId: 'SKL003',
      severity: 'info',
      category: 'skills',
      target: fileName,
      message: `Skill "${fileName}" description lacks explicit trigger phrasing (e.g., "Use when...").`,
      suggestion:
        'Start the skill description with "Use when..." so agent routers match user intent accurately.',
    });
  }

  return { frontmatterTokens, bodyTokens, findings };
}

function findSkillFiles(rootDir: string): string[] {
  const results: string[] = [];
  const candidateRoots = [
    path.join(rootDir, '.agents', 'skills'),
    path.join(rootDir, '.claude', 'skills'),
    path.join(rootDir, 'skills'),
  ];

  for (const base of candidateRoots) {
    if (!fs.existsSync(base)) continue;
    const entries = fs.readdirSync(base, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const skillFile = path.join(base, entry.name, 'SKILL.md');
        if (fs.existsSync(skillFile)) {
          results.push(skillFile);
        }
      }
    }
  }
  return results;
}

export async function auditAgentStack(rootDir: string): Promise<AgentStackAuditReport> {
  const resolvedRoot = path.resolve(rootDir);
  const layers: StackLayerSummary[] = [];
  const allFindings: DiagnosticFinding[] = [];

  // Layer 1: AGENTS.md / CLAUDE.md
  const agentMdCandidates = ['AGENTS.md', 'CLAUDE.md', '.github/copilot-instructions.md'];
  const foundAgentMd: string[] = [];
  let agentsMdTokens = 0;
  const agentsMdFindings: DiagnosticFinding[] = [];

  for (const rel of agentMdCandidates) {
    const full = path.join(resolvedRoot, rel);
    if (fs.existsSync(full)) {
      foundAgentMd.push(rel);
      const res = auditAgentsMd(fs.readFileSync(full, 'utf8'), rel);
      agentsMdTokens += res.tokens;
      agentsMdFindings.push(...res.findings);
    }
  }

  layers.push({
    layer: 'agents-md',
    status:
      foundAgentMd.length === 0
        ? 'missing'
        : agentsMdFindings.some((f) => f.severity !== 'info')
          ? 'warning'
          : 'healthy',
    filesInspected: foundAgentMd,
    alwaysOnTokens: agentsMdTokens,
    onDemandTokens: 0,
    findings: agentsMdFindings,
  });
  allFindings.push(...agentsMdFindings);

  // Layer 2: AAIF Agent Skills (SKILL.md)
  const skillFiles = findSkillFiles(resolvedRoot);
  let skillsAlwaysOnTokens = 0;
  let skillsOnDemandTokens = 0;
  const skillFindings: DiagnosticFinding[] = [];
  const skillRelPaths: string[] = [];

  for (const full of skillFiles) {
    const rel = path.relative(resolvedRoot, full).replace(/\\/g, '/');
    skillRelPaths.push(rel);
    const res = auditSkillMd(fs.readFileSync(full, 'utf8'), rel);
    skillsAlwaysOnTokens += res.frontmatterTokens;
    skillsOnDemandTokens += res.bodyTokens;
    skillFindings.push(...res.findings);
  }

  layers.push({
    layer: 'skills',
    status:
      skillRelPaths.length === 0
        ? 'missing'
        : skillFindings.some((f) => f.severity === 'error' || f.severity === 'warning')
          ? 'warning'
          : 'healthy',
    filesInspected: skillRelPaths,
    alwaysOnTokens: skillsAlwaysOnTokens,
    onDemandTokens: skillsOnDemandTokens,
    findings: skillFindings,
  });
  allFindings.push(...skillFindings);

  // Layer 3: MCP Config & Server Manifests
  const mcpCandidates = ['.mcp.json', '.cursor/mcp.json', '.vscode/mcp.json', 'mcp.json', 'server.json'];
  const foundMcpFiles: string[] = [];
  let mcpAlwaysOnTokens = 0;
  const mcpFindings: DiagnosticFinding[] = [];

  for (const rel of mcpCandidates) {
    const full = path.join(resolvedRoot, rel);
    if (!fs.existsSync(full)) continue;
    foundMcpFiles.push(rel);
    if (rel === 'server.json') {
      const raw = JSON.parse(fs.readFileSync(full, 'utf8')) as Record<string, unknown>;
      mcpAlwaysOnTokens += estimateTextTokens(JSON.stringify(raw));
    } else {
      const scan = await scanMcpConfig(full, { runLiveCheck: false });
      mcpFindings.push(...scan.transportWarnings);
      for (const sec of scan.secretWarnings) {
        mcpFindings.push({
          ruleId: 'SEC001',
          severity: 'error',
          category: 'security',
          target: `${rel}#${sec.serverName}.${sec.envKey}`,
          message: `Hardcoded ${sec.patternName} detected in ${rel} (${sec.maskedPreview}).`,
          suggestion: sec.suggestion,
        });
      }
    }
  }

  layers.push({
    layer: 'mcp',
    status:
      foundMcpFiles.length === 0
        ? 'missing'
        : mcpFindings.some((f) => f.severity === 'error' || f.severity === 'warning')
          ? 'warning'
          : 'healthy',
    filesInspected: foundMcpFiles,
    alwaysOnTokens: mcpAlwaysOnTokens,
    onDemandTokens: 0,
    findings: mcpFindings,
  });
  allFindings.push(...mcpFindings);

  // Layer 4: A2A Agent Card
  const a2aCandidates = ['.well-known/agent-card.json', 'agent-card.json', '.well-known/agent.json'];
  const foundA2AFiles: string[] = [];
  let a2aTokens = 0;
  const a2aFindings: DiagnosticFinding[] = [];

  for (const rel of a2aCandidates) {
    const full = path.join(resolvedRoot, rel);
    if (!fs.existsSync(full)) continue;
    foundA2AFiles.push(rel);
    const raw = JSON.parse(fs.readFileSync(full, 'utf8')) as A2AAgentCard;
    a2aTokens += estimateTextTokens(JSON.stringify(raw));
    a2aFindings.push(...auditA2AAgentCard(raw, rel));
  }

  layers.push({
    layer: 'a2a',
    status:
      foundA2AFiles.length === 0
        ? 'missing'
        : a2aFindings.some((f) => f.severity === 'error' || f.severity === 'warning')
          ? 'warning'
          : 'healthy',
    filesInspected: foundA2AFiles,
    alwaysOnTokens: 0,
    onDemandTokens: a2aTokens,
    findings: a2aFindings,
  });
  allFindings.push(...a2aFindings);

  const alwaysOnContextTokens = agentsMdTokens + skillsAlwaysOnTokens + mcpAlwaysOnTokens;
  const onDemandSkillTokens = skillsOnDemandTokens + a2aTokens;

  let penalty = 0;
  for (const f of allFindings) {
    penalty += f.severity === 'error' ? 14 : f.severity === 'warning' ? 6 : 1.5;
  }
  const score = Math.max(0, Math.min(100, Math.round(100 - penalty)));
  const grade = scoreToGrade(score);
  const hasErrors = allFindings.some((f) => f.severity === 'error');

  return {
    rootDir: resolvedRoot,
    score,
    grade,
    passed: !hasErrors && score >= 75,
    alwaysOnContextTokens,
    onDemandSkillTokens,
    layers,
    findings: allFindings,
    costEstimates: calculateCostEstimates(alwaysOnContextTokens),
    timestamp: new Date().toISOString(),
  };
}

export interface MigratedSkillSummary {
  toolName: string;
  skillSlug: string;
  skillPath: string;
  beforeAlwaysOnTokens: number;
  afterFrontmatterTokens: number;
  tokensSavedPerTurn: number;
}

/**
 * Converts bloated always-on MCP tool definitions into progressive-disclosure
 * AAIF Agent Skills (.agents/skills/<slug>/SKILL.md), cutting idle context tokens by ~85-92%.
 */
export function migrateToolsToSkills(
  tools: McpToolDefinition[],
  outputBaseDir: string,
): {
  migrated: MigratedSkillSummary[];
  totalBeforeTokens: number;
  totalAfterAlwaysOnTokens: number;
  totalTokensSavedPerTurn: number;
} {
  const migrated: MigratedSkillSummary[] = [];
  let totalBeforeTokens = 0;
  let totalAfterAlwaysOnTokens = 0;

  for (const tool of tools) {
    const profile = profileToolTokens(tool);
    const slug = tool.name
      .replace(/[^a-zA-Z0-9_-]+/g, '-')
      .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
      .toLowerCase()
      .replace(/^-+|-+$/g, '')
      .slice(0, 48) || 'agent-skill';

    const firstSentence =
      (tool.description ?? `Execute ${tool.name} workflow.`)
        .split(/(?<=[.!?])\s+/)[0]
        ?.slice(0, 140) ?? `Use when invoking ${tool.name}.`;
    const conciseTrigger = firstSentence.toLowerCase().startsWith('use when')
      ? firstSentence
      : `Use when executing or configuring ${tool.name}. ${firstSentence}`.slice(0, 160);

    const frontmatter = `---\nname: ${slug}\ndescription: ${conciseTrigger}\n---`;
    const props = tool.inputSchema?.properties ?? {};
    const paramLines = Object.entries(props).map(
      ([k, v]) => `- \`${k}\` (\`${Array.isArray(v?.type) ? v.type.join('|') : v?.type ?? 'string'}\`): ${v?.description ?? 'Parameter value.'}`,
    );

    const markdown = `${frontmatter}

# ${tool.name}

${tool.description ?? 'Procedural workflow migrated from MCP tool schema.'}

## Parameters

${paramLines.length > 0 ? paramLines.join('\n') : '- None'}

## Input Schema Reference

\`\`\`json
${JSON.stringify(tool.inputSchema ?? { type: 'object', properties: {} }, null, 2)}
\`\`\`
`;

    const skillDir = path.join(path.resolve(outputBaseDir), slug);
    fs.mkdirSync(skillDir, { recursive: true });
    const skillPath = path.join(skillDir, 'SKILL.md');
    fs.writeFileSync(skillPath, markdown, 'utf8');

    const afterFrontmatterTokens = estimateTextTokens(`name: ${slug}\ndescription: ${conciseTrigger}`);
    const saved = Math.max(0, profile.totalTokens - afterFrontmatterTokens);

    totalBeforeTokens += profile.totalTokens;
    totalAfterAlwaysOnTokens += afterFrontmatterTokens;

    migrated.push({
      toolName: tool.name,
      skillSlug: slug,
      skillPath,
      beforeAlwaysOnTokens: profile.totalTokens,
      afterFrontmatterTokens,
      tokensSavedPerTurn: saved,
    });
  }

  return {
    migrated,
    totalBeforeTokens,
    totalAfterAlwaysOnTokens,
    totalTokensSavedPerTurn: Math.max(0, totalBeforeTokens - totalAfterAlwaysOnTokens),
  };
}
