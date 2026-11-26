import {analyzeMcpServer} from './engine/analyzer.js';
import {parseToolInput} from './engine/schema-input.js';
import {compareAudits, formatMarkdown, prioritize} from './review.js';

const $ = id => document.getElementById(id);
const format = new Intl.NumberFormat('en');
const PAGE_SIZE = 15;
const sample = [
  {
    name: 'lookup_device_status',
    description: 'Look up the device status. Catalog generated 2026-11-17T03:00:00Z. ' +
      'Use this lookup to return the recorded state for a known device identifier. '.repeat(10),
    inputSchema: {type: 'object', properties: {deviceId: {type: 'string'}}, required: ['deviceId', 'obsoleteFilter']},
  },
  {
    name: 'lookup_legacy_device',
    description: 'Return the status of a retired device from the archive.',
    inputSchema: {type: 'object', properties: {}},
    annotations: {readOnlyHint: true, destructiveHint: false},
  },
  {
    name: 'list_status_codes',
    description: 'List device status codes and their meanings.',
    inputSchema: {type: 'object', properties: {}},
    annotations: {readOnlyHint: true, destructiveHint: false},
  },
];
const sampleCandidate = [
  {
    name: 'lookup_device_status',
    description: 'Return the latest recorded status for a known device.',
    inputSchema: {type: 'object', properties: {deviceId: {type: 'string', description: 'Exact device identifier.'}}, required: ['deviceId']},
    annotations: {readOnlyHint: true, destructiveHint: false},
  },
  {
    name: 'search_device_logs',
    description: 'Find log entries for a device.',
    inputSchema: {type: 'object', properties: {deviceId: {type: 'string'}}, required: ['deviceId']},
    annotations: {readOnlyHint: true, destructiveHint: false},
  },
  sample[2],
];
const fields = [
  {text: $('input'), file: $('open'), label: 'Baseline'},
  {text: $('second'), file: $('open-second'), label: 'Candidate'},
];
const findingViews = {current: 'Candidate', added: 'New', resolved: 'Resolved', baseline: 'Baseline'};
const pendingFiles = new Map();
let result = null;
let selectedView = 'current';
let isExample = false;

function el(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}

function isCompare() {
  return $('compare-mode').checked;
}

function note(message, error = false) {
  $('notice').textContent = message;
  $('notice').toggleAttribute('data-error', error);
}

function clearErrors() {
  for (const {text} of fields) {
    text.removeAttribute('aria-invalid');
    text.removeAttribute('aria-errormessage');
  }
}

function showEmpty(title, description) {
  result = null;
  $('report').hidden = true;
  $('empty').hidden = false;
  $('report-mode').textContent = 'Static tool-schema analysis';
  $('empty-title').textContent = title;
  $('empty-description').textContent = description;
}

function markChanged(message) {
  if (result) showEmpty('Run the changed inputs', 'The previous report no longer matches your input.');
  clearErrors();
  if (message) note(message);
}

function syncInputControls() {
  const busy = pendingFiles.has(fields[0]) || (isCompare() && pendingFiles.has(fields[1]));
  const hasInput = fields.some(({text}) => text.value.trim());
  $('demo').disabled = busy || (hasInput && !isExample);
  $('demo').title = hasInput && !isExample ? 'Clear the inputs before replacing them with the example.' : '';
  $('reset').disabled = !hasInput && !pendingFiles.size;
  $('run').disabled = busy;
}

function syncMode() {
  const compare = isCompare();
  $('candidate').hidden = !compare;
  $('input-label').textContent = compare ? 'Baseline JSON' : 'Tool JSON';
  $('run').textContent = compare ? 'Compare schemas' : 'Run audit';
  $('demo').textContent = compare ? 'Try comparison' : 'Try example';
  syncInputControls();
}

function auditInput(field) {
  const {text, label} = field;
  const prefix = isCompare() ? label + ': ' : '';
  try {
    if (!text.value.trim()) throw new Error('Paste tool JSON or open a JSON file.');
    const definitions = parseToolInput(text.value);
    // Both versions use the same label so server-wide findings can match across runs.
    const report = analyzeMcpServer({mode: 'static-schema', serverName: 'schema', tools: definitions});
    return {report, definitions};
  } catch (error) {
    text.setAttribute('aria-invalid', 'true');
    text.setAttribute('aria-errormessage', 'notice');
    text.focus();
    const message = error instanceof SyntaxError ? 'Invalid JSON. Check quotes, commas, and brackets.' : error.message;
    throw new Error(prefix + message);
  }
}

const signed = delta => delta > 0 ? '+' + format.format(delta) : delta < 0 ? '−' + format.format(-delta) : '0';

function moreRows(root, button, rows, renderRow, reset = false) {
  if (reset) root.replaceChildren();
  const start = root.children.length;
  const page = rows.slice(start, start + PAGE_SIZE).map(renderRow);
  root.append(...page);
  const left = rows.length - root.children.length;
  button.hidden = left <= 0;
  button.textContent = left > 0 ? 'Show ' + Math.min(left, PAGE_SIZE) + ' more' : '';
  if (!reset && page.length) {
    const target = page[0].querySelector('summary') ?? page[0];
    if (target === page[0]) target.tabIndex = -1;
    target.focus();
  }
}

function toolRow(tool) {
  const row = el('tr');
  const name = el('th');
  name.scope = 'row';
  const tag = el('span', tool.kind + (tool.copies > 1 ? ' · grouped name' : ''), 'tool-tag');
  tag.dataset.kind = tool.kind;
  name.append(el('code', tool.name, 'tool-name'), tag);
  row.append(name, ...[tool.previous, tool.current].map(tokens => el('td', tokens === null ? '—' : format.format(tokens))), el('td', signed(tool.delta)));
  return row;
}

function findingRow(finding) {
  const details = el('details', undefined, 'finding');
  details.dataset.level = finding.severity;
  const summary = el('summary');
  summary.append(el('span', finding.severity), document.createTextNode(finding.ruleId + ' · ' + finding.target));
  details.append(summary, el('p', finding.message), el('p', finding.suggestion));
  return details;
}

function renderFindings(reset) {
  if (!result) return;
  const {report, review} = result;
  const groups = {
    current: (report.candidate ?? report.baseline).findings,
    baseline: report.baseline.findings,
    added: review?.added ?? [],
    resolved: review?.resolved ?? [],
  };
  for (const [id, label] of Object.entries(findingViews)) {
    $(id).textContent = label + ' ' + format.format(groups[id].length);
    $(id).setAttribute('aria-pressed', String(id === selectedView));
  }

  const severity = $('severity').value;
  const selected = groups[selectedView];
  const rows = prioritize(selected.filter(finding => severity === 'all' || severity === finding.severity));
  moreRows($('findings'), $('more-findings'), rows, findingRow, reset);
  $('finding-count').textContent = rows.length
    ? format.format($('findings').children.length) + ' of ' + format.format(rows.length) + ' shown' + (rows.length === selected.length ? '' : ' after filtering')
    : selected.length ? 'No findings match this severity.' : 'No findings in this view.';
}

function render() {
  const {report, review} = result;
  const {baseline, candidate} = report;
  const view = candidate ?? baseline;
  $('empty').hidden = true;
  $('report').hidden = false;
  $('report-mode').textContent = (isExample ? 'Example · ' : '') + (candidate ? 'Candidate compared with baseline' : 'Single schema audit');
  for (const [id, current, previous, suffix] of [
    ['score', view.score, baseline.score, '/100'],
    ['tokens', view.totalTokens, baseline.totalTokens, ''],
    ['issues', view.findings.length, baseline.findings.length, ''],
  ]) {
    $(id).textContent = format.format(current) + suffix;
    const metricChange = $(id + '-change');
    metricChange.hidden = !candidate;
    if (candidate) metricChange.textContent = signed(current - previous) + ' vs baseline';
  }

  $('changes').hidden = !review;
  $('context').hidden = !!review;
  $('finding-views').hidden = !review;
  if (review) {
    const counts = {Added: 0, Removed: 0, Edited: 0};
    for (const tool of review.tools) counts[tool.kind]++;
    $('change-count').textContent = format.format(baseline.toolCount) + ' → ' + format.format(view.toolCount) + ' tools';
    $('change-summary').textContent = review.tools.length
      ? Object.entries(counts).map(([kind, count]) => format.format(count) + ' ' + kind.toLowerCase()).join(' · ')
      : 'No added, removed, or edited tools.';
    $('change-table').hidden = !review.tools.length;
    moreRows($('change-rows'), $('more-tools'), review.tools, toolRow, true);
  } else {
    $('tool-count').textContent = view.toolCount > 8 ? 'Top 8 of ' + format.format(view.toolCount) : format.format(view.toolCount) + ' tools';
    $('bars').replaceChildren();
    for (const tool of view.tools.slice(0, 8)) {
      const row = el('li');
      const meter = el('progress');
      meter.max = Math.max(1, view.totalTokens);
      meter.value = tool.totalTokens;
      meter.setAttribute('aria-label', 'Estimated tokens for ' + tool.name);
      row.append(el('code', tool.name), meter, el('b', format.format(tool.totalTokens)));
      $('bars').append(row);
    }
  }

  selectedView = 'current';
  $('severity').value = 'all';
  renderFindings(true);
}

function run() {
  if ($('run').disabled) return;
  clearErrors();
  try {
    const baseline = auditInput(fields[0]);
    const candidate = isCompare() ? auditInput(fields[1]) : null;
    result = {
      report: {format: 'agent-doctor-static-report-v1', baseline: baseline.report, candidate: candidate?.report ?? null},
      review: candidate ? compareAudits(baseline.report, candidate.report, baseline.definitions, candidate.definitions) : null,
    };
    render();
    note(candidate ? 'Comparison complete.' : 'Audit complete.');
    $('result-title').focus({preventScroll: true});
    if (window.matchMedia('(max-width: 800px)').matches) $('result-title').closest('.panel').scrollIntoView({block: 'start'});
  } catch (error) {
    showEmpty('No report', 'Fix the input and run the audit again.');
    note(error.message, true);
  }
}

function download(extension) {
  if (!result) return;
  const {report, review} = result;
  const markdown = extension === 'md';
  const content = markdown ? formatMarkdown(report, review) : JSON.stringify(report, null, 2) + '\n';
  const url = URL.createObjectURL(new Blob([content], {type: markdown ? 'text/markdown;charset=utf-8' : 'application/json'}));
  const link = el('a');
  link.href = url;
  link.download = 'agent-doctor-' + (review ? 'comparison' : 'audit') + '.' + extension;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

for (const field of fields) {
  const {text, file} = field;
  text.addEventListener('input', () => {
    pendingFiles.delete(field);
    isExample = false;
    markChanged(result ? 'JSON changed. Run the audit again.' : 'Run the audit to see results.');
    syncInputControls();
  });
  text.addEventListener('keydown', event => {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      event.preventDefault();
      run();
    }
  });
  file.addEventListener('change', async () => {
    const selected = file.files?.[0];
    if (!selected) return;
    file.value = '';
    const request = {};
    pendingFiles.set(field, request);
    syncInputControls();
    try {
      if (selected.size > 1_000_000) throw new Error('Choose a JSON file up to 1 MB.');
      const content = await selected.text();
      if (pendingFiles.get(field) !== request) return;
      text.value = content;
      isExample = false;
      markChanged('JSON loaded. Run the audit when ready.');
    } catch (error) {
      if (pendingFiles.get(field) === request) note(error.message, true);
    } finally {
      if (pendingFiles.get(field) === request) {
        pendingFiles.delete(field);
        syncInputControls();
      }
    }
  });
}

for (const id of ['audit-mode', 'compare-mode']) $(id).addEventListener('change', () => {
  if (!isCompare()) pendingFiles.delete(fields[1]);
  if (isExample) {
    fields[0].text.value = '';
    fields[1].text.value = '';
    isExample = false;
  }
  markChanged(isCompare() ? 'Add the baseline and candidate JSON.' : 'Add JSON or try the built-in example.');
  syncMode();
});
$('run').addEventListener('click', run);
$('demo').addEventListener('click', () => {
  isExample = true;
  fields[0].text.value = JSON.stringify({tools: sample}, null, 2);
  fields[1].text.value = isCompare() ? JSON.stringify({jsonrpc: '2.0', id: 1, result: {tools: sampleCandidate}}, null, 2) : '';
  syncInputControls();
  run();
});
$('reset').addEventListener('click', () => {
  pendingFiles.clear();
  isExample = false;
  for (const {text, file} of fields) { text.value = ''; file.value = ''; }
  clearErrors();
  showEmpty('No audit yet', 'Add a schema or try the built-in example to see results here.');
  note('Inputs cleared.');
  syncInputControls();
  fields[0].text.focus();
});
$('severity').addEventListener('change', () => renderFindings(true));
for (const id of Object.keys(findingViews)) $(id).addEventListener('click', () => {
  selectedView = id;
  renderFindings(true);
});
$('more-findings').addEventListener('click', () => renderFindings(false));
$('more-tools').addEventListener('click', () => {
  if (result?.review) moreRows($('change-rows'), $('more-tools'), result.review.tools, toolRow);
});
$('markdown').addEventListener('click', () => download('md'));
$('download').addEventListener('click', () => download('json'));

syncMode();
note('No sign-in required. Files up to 1 MB.');
