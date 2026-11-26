import type { McpToolDefinition } from './types.js';

const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

/** Accept a tool array, a tools/list result, or its JSON-RPC response envelope. */
export function parseToolInput(text: string): McpToolDefinition[] {
  if (text.length > 1_000_000) throw new Error('Tool input exceeds 1 MB of text.');
  const payload: unknown = JSON.parse(text);
  const rows: unknown = Array.isArray(payload) ? payload : record(payload)
    ? (Array.isArray(payload.tools) ? payload.tools : record(payload.result) ? payload.result.tools : undefined)
    : undefined;
  if (!Array.isArray(rows)) throw new Error('Expected a tool array, { tools: [...] }, or { result: { tools: [...] } }.');
  if (rows.length > 500) throw new Error('Audit at most 500 tools at a time.');
  for (const [i, tool] of rows.entries()) {
    if (!record(tool) || typeof tool.name !== 'string' || !tool.name.trim()) {
      throw new Error('Tool ' + (i + 1) + ' needs a nonempty name.');
    }
    if (tool.description !== undefined && typeof tool.description !== 'string') {
      throw new Error('Tool ' + (i + 1) + ' description must be text.');
    }
    if (tool.inputSchema != null && !record(tool.inputSchema)) {
      throw new Error('Tool ' + (i + 1) + ' inputSchema must be an object.');
    }
  }
  const stack: [unknown, number][] = [[rows, 0]];
  let count = 0;
  while (stack.length) {
    const [node, depth] = stack.pop()!;
    if (++count > 100_000 || depth > 64) throw new Error('Tool input is too deeply nested or complex.');
    if (node && typeof node === 'object') {
      for (const value of Object.values(node)) stack.push([value, depth + 1]);
    }
  }
  return rows as McpToolDefinition[];
}
