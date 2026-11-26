const order = {error: 0, warning: 1, info: 2};
const findingKey = finding => JSON.stringify([finding.ruleId, finding.target, finding.severity]);

export function prioritize(findings) {
  return [...findings].sort((a, b) => order[a.severity] - order[b.severity]);
}

// Match occurrences, not just keys: a rule can yield multiple findings for one tool.
function unmatched(findings, otherFindings) {
  const counts = new Map();
  for (const finding of otherFindings) {
    const key = findingKey(finding);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return findings.filter(finding => {
    const key = findingKey(finding);
    const count = counts.get(key) ?? 0;
    if (!count) return true;
    counts.set(key, count - 1);
    return false;
  });
}

function signature(value) {
  if (Array.isArray(value)) return '[' + value.map(signature).join(',') + ']';
  if (value && typeof value === 'object') {
    return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + signature(value[key])).join(',') + '}';
  }
  return JSON.stringify(value);
}

function groupTools(definitions, profiles) {
  const groups = new Map();
  for (const tool of definitions) {
    if (!groups.has(tool.name)) groups.set(tool.name, {versions: [], tokens: 0});
    groups.get(tool.name).versions.push(signature(tool));
  }
  for (const group of groups.values()) group.versions.sort();
  for (const profile of profiles) groups.get(profile.name).tokens += profile.totalTokens;
  return groups;
}

export function compareAudits(baseline, candidate, baselineTools, candidateTools) {
  const before = groupTools(baselineTools, baseline.tools);
  const after = groupTools(candidateTools, candidate.tools);
  const tools = [];
  for (const name of new Set([...before.keys(), ...after.keys()])) {
    const oldTool = before.get(name);
    const newTool = after.get(name);
    if (oldTool && newTool && oldTool.versions.length === newTool.versions.length &&
        oldTool.versions.every((version, i) => version === newTool.versions[i])) continue;
    const previous = oldTool?.tokens ?? null;
    const current = newTool?.tokens ?? null;
    tools.push({name, kind: !oldTool ? 'Added' : !newTool ? 'Removed' : 'Edited', previous, current,
      delta: (current ?? 0) - (previous ?? 0), copies: Math.max(oldTool?.versions.length ?? 0, newTool?.versions.length ?? 0)});
  }
  tools.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta) || a.name.localeCompare(b.name));
  return {
    tools,
    added: prioritize(unmatched(candidate.findings, baseline.findings)),
    resolved: prioritize(unmatched(baseline.findings, candidate.findings)),
  };
}

const markdownText = value => String(value).replace(/\s+/g, ' ').trim().replace(/[&<>"'\\`*_{}\[\]()#+\-.!|~]/g, char => '&#' + char.charCodeAt(0) + ';');
const signed = number => number > 0 ? '+' + number : String(number);

function markdownFindings(title, findings) {
  return [
    '## ' + title + ' (' + findings.length + ')',
    '',
    ...(findings.length ? findings.map(finding =>
      '- **' + markdownText(finding.severity) + ' · ' + markdownText(finding.ruleId) + '** [' + markdownText(finding.target) +
      '] ' + markdownText(finding.message) + ' ' + markdownText(finding.suggestion)) : ['None.']),
    '',
  ];
}

export function formatMarkdown(report, review) {
  const {baseline, candidate} = report;
  const lines = [
    '# Agent Doctor: ' + (candidate ? 'MCP schema comparison' : 'MCP schema audit'),
    '',
    'Static analysis only. Scores and token counts are estimates, not a security or compatibility verdict.',
    '',
    ...(candidate ? [
      '| Metric | Baseline | Candidate | Change |',
      '| --- | ---: | ---: | ---: |',
      '| Health score / 100 | ' + baseline.score + ' | ' + candidate.score + ' | ' + signed(candidate.score - baseline.score) + ' |',
      '| Estimated schema tokens | ' + baseline.totalTokens + ' | ' + candidate.totalTokens + ' | ' + signed(candidate.totalTokens - baseline.totalTokens) + ' |',
      '| Findings | ' + baseline.findings.length + ' | ' + candidate.findings.length + ' | ' + signed(candidate.findings.length - baseline.findings.length) + ' |',
      '| Tools | ' + baseline.toolCount + ' | ' + candidate.toolCount + ' | ' + signed(candidate.toolCount - baseline.toolCount) + ' |',
      '',
      '## Tool changes (' + review.tools.length + ')',
      '',
      ...(review.tools.length ? [
        '| Tool | Change | Baseline tokens | Candidate tokens | Δ tokens |',
        '| --- | --- | ---: | ---: | ---: |',
        ...review.tools.map(tool => '| ' + markdownText(tool.name) + (tool.copies > 1 ? ' (grouped by name)' : '') + ' | ' + tool.kind +
          ' | ' + (tool.previous ?? '—') + ' | ' + (tool.current ?? '—') + ' | ' + signed(tool.delta) + ' |'),
      ] : ['No added, removed, or edited tools.']),
      '',
      ...markdownFindings('New findings', review.added),
      ...markdownFindings('Resolved findings', review.resolved),
      ...markdownFindings('All candidate findings', prioritize(candidate.findings)),
    ] : [
      '- Health score: ' + baseline.score + '/100',
      '- Estimated schema tokens: ' + baseline.totalTokens,
      '- Tools: ' + baseline.toolCount,
      '',
      ...markdownFindings('Findings', prioritize(baseline.findings)),
    ]),
  ];
  return lines.join('\n');
}
