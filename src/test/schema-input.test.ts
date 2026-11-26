import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseToolInput } from '../schema-input.js';
import { analyzeMcpServer } from '../analyzer.js';
import { OPTIMIZED_SAMPLE_TOOLS } from '../demo-fixtures.js';

test('static schema accepts all three supported formats without mutation', () => {
  const tools = OPTIMIZED_SAMPLE_TOOLS;
  for (const format of [tools, { tools }, { jsonrpc: '2.0', id: 1, result: { tools } }]) {
    const value = parseToolInput(JSON.stringify(format));
    assert.deepEqual(value, tools);
    assert.equal(analyzeMcpServer({mode:'static-schema',serverName:'fixture',tools:value}).toolCount, tools.length);
  }
});

test('invalid envelope, text, tool shape and structural limits fail clearly', () => {
  assert.throws(() => parseToolInput('{}'), /Expected a tool array/);
  assert.throws(() => parseToolInput('[null]'), /Tool 1 needs/);
  assert.throws(() => parseToolInput('[{"name":"read","description":2}]'), /description must be text/);
  assert.throws(() => parseToolInput('[{"name":"read","inputSchema":[]}]'), /inputSchema must be an object/);
  assert.throws(() => parseToolInput(' '.repeat(1_000_001)), /exceeds/);
  assert.throws(() => parseToolInput(JSON.stringify(Array.from({length:501},()=>({name:'read'})))), /500 tools/);
  assert.throws(() => parseToolInput('[{"name":"read","inputSchema":{"nested":'+'['.repeat(70)+'0'+']'.repeat(70)+'}}]'), /deeply nested/);
});
