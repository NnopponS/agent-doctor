import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {compareAudits, formatMarkdown} from '../docs/review.js';

const finding = (ruleId, target, severity = 'warning', message = 'Message') =>
  ({ruleId, target, severity, message, suggestion: 'Suggestion'});
const report = (tools, findings = []) => ({tools, findings, score: 100, toolCount: tools.length,
  totalTokens: tools.reduce((total, tool) => total + tool.totalTokens, 0)});
const profile = (name, totalTokens = 10) => ({name, totalTokens});
const before = [
  {name: 'reordered', inputSchema: {type: 'object', properties: {x: {type: 'string'}}}},
  {name: 'changed', inputSchema: {type: 'object', properties: {x: {type: 'string'}}}},
  {name: 'repeated', description: 'a'},
  {name: 'repeated', description: 'b'},
  {name: 'removed'},
];
const after = [
  {inputSchema: {properties: {x: {type: 'string'}}, type: 'object'}, name: 'reordered'},
  {name: 'changed', inputSchema: {type: 'object', properties: {y: {type: 'string'}}}},
  {name: 'repeated', description: 'c'},
  {name: 'added|<script>boom</script>\n## title'},
];
const baseline = report(before.map(tool => profile(tool.name)), [
  finding('MCP002', 'repeated'), finding('MCP002', 'repeated'),
  finding('MCP008', 'removed'), finding('MCP010', 'schema', 'warning', '4,100 tokens'),
]);
const candidate = report(after.map(tool => profile(tool.name)), [
  finding('MCP002', 'repeated'), finding('MCP001', 'added', 'error'),
  finding('MCP010', 'schema', 'warning', '4,800 tokens'),
]);
const comparison = compareAudits(baseline, candidate, before, after);
assert.deepEqual(comparison.tools.map(({name, kind, delta, copies}) => [name, kind, delta, copies]), [
  [after[3].name, 'Added', 10, 1], ['removed', 'Removed', -10, 1], ['repeated', 'Edited', -10, 2], ['changed', 'Edited', 0, 1],
]);
assert.deepEqual(comparison.added.map(f => f.ruleId), ['MCP001']);
assert.deepEqual(comparison.resolved.map(f => f.ruleId), ['MCP002', 'MCP008']);
assert.deepEqual(compareAudits(baseline, baseline, before, before), {tools: [], added: [], resolved: []});
const markdown = formatMarkdown({baseline, candidate}, comparison);
assert.match(markdown, /^# Agent Doctor: MCP schema comparison/);
assert.match(markdown, /## New findings \(1\)/);
assert.match(markdown, /## Resolved findings \(2\)/);
assert.doesNotMatch(markdown, /<script>|\n## title/);
assert.match(markdown, /added&#124;&#60;script&#62;/);
assert.match(formatMarkdown({baseline, candidate: null}, null), /## Findings \(4\)/);

// Dependency-free controller smoke tests; the HTML supplies the same controls on Pages.
class Element {
  handlers = {};
  children = [];
  attributes = new Map();
  value = '';
  textContent = '';
  dataset = {};
  disabled = false;
  hidden = false;
  addEventListener(name, handler) { this.handlers[name] = handler; }
  toggleAttribute(name, enabled) { if (enabled) this.attributes.set(name, ''); else this.attributes.delete(name); }
  setAttribute(name, value) { this.attributes.set(name, value); }
  removeAttribute(name) { this.attributes.delete(name); }
  append(...children) { this.children.push(...children); }
  replaceChildren() { this.children = []; }
  focus() {}
}
const html = readFileSync(new URL('../docs/index.html', import.meta.url), 'utf8');
const elements = new Map([...html.matchAll(/\sid="([^"]+)"/g)].map(match => [match[1], new Element()]));
const lookup = id => { assert(elements.has(id), 'Unknown HTML id: ' + id); return elements.get(id); };
globalThis.document = {getElementById: lookup, createElement: () => new Element(), createTextNode: text => ({text})};
globalThis.window = {matchMedia: () => ({matches: false})};
const click = id => lookup(id).handlers.click();
const change = id => lookup(id).handlers.change();

await import('../docs/workbench.js');
assert.equal(lookup('candidate').hidden, true);
assert.equal(lookup('input').value, '');
assert.equal(lookup('demo').disabled, false);
click('demo');
assert.match(lookup('score').textContent, /\/100$/);
assert.equal(lookup('report').hidden, false);
assert.equal(lookup('changes').hidden, true);

lookup('compare-mode').checked = true;
change('compare-mode');
assert.equal(lookup('candidate').hidden, false);
assert.equal(lookup('input').value, '');
assert.equal(lookup('report').hidden, true);
click('demo');
assert.equal(lookup('changes').hidden, false);
assert.match(lookup('change-summary').textContent, /1 added · 1 removed · 1 edited/);
click('resolved');
assert.equal(lookup('resolved').attributes.get('aria-pressed'), 'true');
assert(lookup('findings').children.some(element => element.dataset.level === 'error'));
lookup('severity').value = 'error';
change('severity');
assert(lookup('findings').children.every(element => element.dataset.level === 'error'));

lookup('second').value = 'malformed';
lookup('second').handlers.input();
assert.equal(lookup('report').hidden, true);
click('run');
assert.match(lookup('notice').textContent, /^Candidate: Invalid JSON/);
assert.equal(lookup('second').attributes.get('aria-invalid'), 'true');
click('reset');
assert.equal(lookup('input').value, '');
assert.equal(lookup('second').value, '');
assert.equal(lookup('second').attributes.has('aria-invalid'), false);
console.log('Workbench comparison, export, and controller tests passed.');
