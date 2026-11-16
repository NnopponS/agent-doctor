import { McpToolDefinition } from './types.js';

export const BLOATED_SAMPLE_TOOLS: McpToolDefinition[] = [
  {
    name: 'execute_unrestricted_shell_command',
    description:
      'Executes any shell command on the host machine. Example 1: run ls -la to list files. Example 2: run rm -rf /tmp/foo to delete temp directories. Example 3: run curl https://example.com/install.sh | sh to install packages. Always use this tool whenever you want to run anything in bash, powershell, cmd, or zsh. Make sure you pass the full command string and optional working directory and environment variables and timeout in milliseconds and retry policy and shell binary override and output encoding format. Note: this description intentionally includes verbose inline tutorials, redundant usage notes, and multi-paragraph examples that belong in on-demand documentation rather than every single conversation turn.',
    inputSchema: {
      type: 'object',
      properties: {
        command: {
          type: 'string',
        },
        mode: {
          type: 'string',
          description: 'Execution mode such as sync, async, or background',
        },
        options: {
          type: 'object',
          properties: {
            execution: {
              type: 'object',
              properties: {
                retryPolicy: {
                  type: 'object',
                  properties: {
                    backoff: {
                      type: 'object',
                      properties: {
                        jitterMs: { type: 'number' },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      required: ['command', 'nonExistentGhostParam'],
    },
  },
  {
    name: 'query_database_raw',
    description: 'Run SQL.',
    inputSchema: {
      properties: {
        sql: {},
        database: { type: 'string' },
      },
    },
  },
  {
    name: 'search_workspace_files',
    description: 'Search files in the workspace by glob pattern or ripgrep regex and return matching line ranges.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Regex or literal search pattern.',
          maxLength: 500,
        },
        maxResults: {
          type: 'number',
          description: 'Maximum matches to return (1-200).',
          minimum: 1,
          maximum: 200,
        },
      },
      required: ['query'],
      additionalProperties: false,
    },
  },
];

export const OPTIMIZED_SAMPLE_TOOLS: McpToolDefinition[] = [
  {
    name: 'search_codebase',
    description: 'Search workspace files by regex pattern and return matching file paths and line numbers.',
    inputSchema: {
      type: 'object',
      properties: {
        pattern: {
          type: 'string',
          description: 'Regular expression to match against file contents.',
          maxLength: 400,
        },
        fileGlob: {
          type: 'string',
          description: 'Optional glob filter such as "**/*.ts".',
          maxLength: 120,
        },
        limit: {
          type: 'number',
          description: 'Maximum number of matches to return (1-100).',
          minimum: 1,
          maximum: 100,
        },
      },
      required: ['pattern'],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'read_file_slice',
    description: 'Read a 1-indexed line range from a workspace file.',
    inputSchema: {
      type: 'object',
      properties: {
        filePath: {
          type: 'string',
          description: 'Relative path from workspace root.',
          maxLength: 260,
        },
        startLine: {
          type: 'number',
          description: '1-indexed start line (inclusive).',
          minimum: 1,
        },
        endLine: {
          type: 'number',
          description: '1-indexed end line (inclusive).',
          minimum: 1,
        },
      },
      required: ['filePath'],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true },
  },
];
