import {
  DiagnosticFinding,
  FindingCategory,
  FindingSeverity,
  HandshakeTiming,
  McpToolDefinition,
  ToolTokenProfile,
} from './types.js';

export interface RuleEvaluationContext {
  serverName: string;
  tools: McpToolDefinition[];
  profiles: ToolTokenProfile[];
  totalTokens: number;
  timing: HandshakeTiming | null;
}

export interface DiagnosticRuleDefinition {
  id: string;
  title: string;
  severity: FindingSeverity;
  category: FindingCategory;
  evaluate: (ctx: RuleEvaluationContext) => DiagnosticFinding[];
}

const VALID_TOOL_NAME_REGEX = /^[a-zA-Z0-9_-]{1,64}$/;
const HIGH_RISK_TOOL_REGEX = /(?:^|_|-)(?:exec|execute|shell|bash|powershell|cmd|run_command|delete|drop|remove|sql|query_raw|eval|write_file|overwrite)(?:$|_|-)/i;
const ENUM_CANDIDATE_PARAM_REGEX = /^(?:mode|status|format|action|level|severity|sort|order|protocol|encoding|transport)$/i;

export const DIAGNOSTIC_RULE_REGISTRY: readonly DiagnosticRuleDefinition[] = [
  {
    id: 'MCP001',
    title: 'Root inputSchema must be a JSON Schema object',
    severity: 'error',
    category: 'schema',
    evaluate: ({ tools }) =>
      tools
        .filter((t) => !t.inputSchema || t.inputSchema.type !== 'object')
        .map((t) => ({
          ruleId: 'MCP001',
          severity: 'error',
          category: 'schema',
          target: t.name,
          message: `Tool "${t.name}" is missing inputSchema.type === "object" (found: ${JSON.stringify(t.inputSchema?.type ?? null)}).`,
          suggestion: 'Set inputSchema: { type: "object", properties: { ... }, additionalProperties: false } per the MCP specification.',
        })),
  },
  {
    id: 'MCP002',
    title: 'Tool description must be present and informative',
    severity: 'warning',
    category: 'schema',
    evaluate: ({ tools }) =>
      tools
        .filter((t) => !t.description || t.description.trim().length < 15)
        .map((t) => ({
          ruleId: 'MCP002',
          severity: 'warning',
          category: 'schema',
          target: t.name,
          message: `Tool "${t.name}" has a missing or overly short description (${t.description?.trim().length ?? 0} chars).`,
          suggestion: 'Provide a concise 1-2 sentence description stating what the tool does, when to call it, and what it returns.',
        })),
  },
  {
    id: 'MCP003',
    title: 'Tool description should not bloat system prompt context',
    severity: 'warning',
    category: 'ergonomics',
    evaluate: ({ tools }) =>
      tools
        .filter((t) => (t.description?.length ?? 0) > 550)
        .map((t) => ({
          ruleId: 'MCP003',
          severity: 'warning',
          category: 'ergonomics',
          target: t.name,
          message: `Tool "${t.name}" description is ${t.description!.length} chars (> 550 chars), inflating every conversation turn.`,
          suggestion: 'Trim inline examples and long prose from the tool description; move reference docs into an MCP resource or concise parameter descriptions.',
        })),
  },
  {
    id: 'MCP004',
    title: 'Every inputSchema property must declare a type or schema composition',
    severity: 'warning',
    category: 'schema',
    evaluate: ({ profiles }) =>
      profiles
        .filter((p) => p.untypedParams.length > 0)
        .map((p) => ({
          ruleId: 'MCP004',
          severity: 'warning',
          category: 'schema',
          target: p.name,
          message: `Tool "${p.name}" has untyped parameters: ${p.untypedParams.join(', ')}.`,
          suggestion: 'Add an explicit JSON Schema "type" (e.g., "string", "number", "boolean", "array", "object") or "enum" to each property.',
        })),
  },
  {
    id: 'MCP005',
    title: 'Input parameters should include concise descriptions',
    severity: 'info',
    category: 'ergonomics',
    evaluate: ({ profiles }) =>
      profiles
        .filter((p) => p.undocumentedParams.length > 0)
        .map((p) => ({
          ruleId: 'MCP005',
          severity: 'info',
          category: 'ergonomics',
          target: p.name,
          message: `Tool "${p.name}" has ${p.undocumentedParams.length} parameter(s) without descriptions: ${p.undocumentedParams.join(', ')}.`,
          suggestion: 'Add a short "description" to each parameter so models do not hallucinate units, formats, or path conventions.',
        })),
  },
  {
    id: 'MCP006',
    title: 'Required fields must exist in inputSchema.properties',
    severity: 'error',
    category: 'schema',
    evaluate: ({ tools }) => {
      const findings: DiagnosticFinding[] = [];
      for (const tool of tools) {
        const required = Array.isArray(tool.inputSchema?.required) ? tool.inputSchema!.required : [];
        const propKeys = new Set(Object.keys(tool.inputSchema?.properties ?? {}));
        const ghostRequired = required.filter((reqName) => !propKeys.has(reqName));
        if (ghostRequired.length > 0) {
          findings.push({
            ruleId: 'MCP006',
            severity: 'error',
            category: 'schema',
            target: tool.name,
            message: `Tool "${tool.name}" lists required field(s) missing from properties: ${ghostRequired.join(', ')}.`,
            suggestion: 'Remove ghost entries from "required" or define those fields under "inputSchema.properties".',
          });
        }
      }
      return findings;
    },
  },
  {
    id: 'MCP007',
    title: 'Avoid deeply nested input schemas (> 4 levels)',
    severity: 'warning',
    category: 'schema',
    evaluate: ({ profiles }) =>
      profiles
        .filter((p) => p.maxDepth > 4)
        .map((p) => ({
          ruleId: 'MCP007',
          severity: 'warning',
          category: 'schema',
          target: p.name,
          message: `Tool "${p.name}" has schema nesting depth ${p.maxDepth} (> 4 levels).`,
          suggestion: 'Flatten nested objects into top-level parameters to reduce LLM JSON generation failures and token overhead.',
        })),
  },
  {
    id: 'MCP008',
    title: 'Single tool exceeds 400 tokens (moderate context weight)',
    severity: 'warning',
    category: 'tokens',
    evaluate: ({ profiles }) =>
      profiles
        .filter((p) => p.totalTokens > 400 && p.totalTokens <= 1000)
        .map((p) => ({
          ruleId: 'MCP008',
          severity: 'warning',
          category: 'tokens',
          target: p.name,
          message: `Tool "${p.name}" costs ~${p.totalTokens} tokens per turn (${p.shareOfServerPct}% of server payload).`,
          suggestion: 'Shorten verbose parameter descriptions or split multi-purpose mega-tools into focused tools.',
        })),
  },
  {
    id: 'MCP009',
    title: 'Single tool exceeds 1,000 tokens (severe context bloat)',
    severity: 'error',
    category: 'tokens',
    evaluate: ({ profiles }) =>
      profiles
        .filter((p) => p.totalTokens > 1000)
        .map((p) => ({
          ruleId: 'MCP009',
          severity: 'error',
          category: 'tokens',
          target: p.name,
          message: `Tool "${p.name}" costs ~${p.totalTokens} tokens on every turn (> 1,000 token threshold).`,
          suggestion: 'Refactor this tool schema immediately: extract bulky inline documentation and flatten repetitive sub-schemas.',
        })),
  },
  {
    id: 'MCP010',
    title: 'Server tools/list payload exceeds 4,000 tokens',
    severity: 'warning',
    category: 'tokens',
    evaluate: ({ serverName, totalTokens }) =>
      totalTokens > 4000 && totalTokens <= 10000
        ? [
            {
              ruleId: 'MCP010',
              severity: 'warning',
              category: 'tokens',
              target: serverName,
              message: `Server "${serverName}" consumes ~${totalTokens.toLocaleString()} tokens before the first user message.`,
              suggestion: 'Consider lazy-loading rarely used tools or grouping domain tools into smaller, task-specific MCP servers.',
            },
          ]
        : [],
  },
  {
    id: 'MCP011',
    title: 'Server tools/list payload exceeds 10,000 tokens',
    severity: 'error',
    category: 'tokens',
    evaluate: ({ serverName, totalTokens }) =>
      totalTokens > 10000
        ? [
            {
              ruleId: 'MCP011',
              severity: 'error',
              category: 'tokens',
              target: serverName,
              message: `Server "${serverName}" consumes ~${totalTokens.toLocaleString()} tokens per turn (> 10,000 token critical threshold).`,
              suggestion: 'Enable lazy tool discovery or prune low-frequency tools; this server significantly degrades context window capacity and cost.',
            },
          ]
        : [],
  },
  {
    id: 'MCP012',
    title: 'Server exposes more than 25 tools in a single flat list',
    severity: 'warning',
    category: 'ergonomics',
    evaluate: ({ serverName, tools }) =>
      tools.length > 25
        ? [
            {
              ruleId: 'MCP012',
              severity: 'warning',
              category: 'ergonomics',
              target: serverName,
              message: `Server "${serverName}" registers ${tools.length} tools (> 25 tools degrades LLM tool selection accuracy).`,
              suggestion: 'Consolidate overlapping CRUD operations or expose a smaller core toolset with on-demand sub-tools.',
            },
          ]
        : [],
  },
  {
    id: 'MCP013',
    title: 'Tool name must follow portable identifier rules',
    severity: 'error',
    category: 'ergonomics',
    evaluate: ({ tools }) =>
      tools
        .filter((t) => !VALID_TOOL_NAME_REGEX.test(t.name))
        .map((t) => ({
          ruleId: 'MCP013',
          severity: 'error',
          category: 'ergonomics',
          target: t.name,
          message: `Tool name "${t.name}" violates ^[a-zA-Z0-9_-]{1,64}$ required by major LLM providers.`,
          suggestion: 'Rename the tool using snake_case or kebab-case ASCII characters (max 64 chars).',
        })),
  },
  {
    id: 'MCP014',
    title: 'High-risk execution or destructive tool lacks schema constraints',
    severity: 'warning',
    category: 'security',
    evaluate: ({ tools }) => {
      const findings: DiagnosticFinding[] = [];
      for (const tool of tools) {
        if (!HIGH_RISK_TOOL_REGEX.test(tool.name)) continue;
        const props = Object.values(tool.inputSchema?.properties ?? {});
        const hasConstraints = props.some(
          (p) =>
            Array.isArray(p?.enum) ||
            typeof p?.pattern === 'string' ||
            typeof p?.maxLength === 'number' ||
            typeof p?.maximum === 'number',
        );
        const hasReadOnlyHint = tool.annotations?.readOnlyHint === true;
        if (!hasConstraints && !hasReadOnlyHint) {
          findings.push({
            ruleId: 'MCP014',
            severity: 'warning',
            category: 'security',
            target: tool.name,
            message: `High-privilege tool "${tool.name}" accepts unconstrained parameters without enum, pattern, maxLength, or MCP safety annotations.`,
            suggestion: 'Add input validation constraints (enum, pattern, maxLength) and MCP annotations ({ destructiveHint: true }) to guard boundary execution.',
          });
        }
      }
      return findings;
    },
  },
  {
    id: 'MCP015',
    title: 'Mode/status string parameters should use enum constraints',
    severity: 'info',
    category: 'schema',
    evaluate: ({ tools }) => {
      const findings: DiagnosticFinding[] = [];
      for (const tool of tools) {
        const props = tool.inputSchema?.properties ?? {};
        const candidates = Object.entries(props)
          .filter(
            ([paramName, prop]) =>
              ENUM_CANDIDATE_PARAM_REGEX.test(paramName) &&
              prop?.type === 'string' &&
              !Array.isArray(prop?.enum),
          )
          .map(([paramName]) => paramName);
        if (candidates.length > 0) {
          findings.push({
            ruleId: 'MCP015',
            severity: 'info',
            category: 'schema',
            target: tool.name,
            message: `Tool "${tool.name}" has mode/type string parameter(s) without an "enum" list: ${candidates.join(', ')}.`,
            suggestion: 'Add an "enum" array of valid string values so the model cannot invent unsupported modes.',
          });
        }
      }
      return findings;
    },
  },
  {
    id: 'MCP016',
    title: 'Cold-start MCP handshake should complete within 2,000 ms',
    severity: 'warning',
    category: 'protocol',
    evaluate: ({ serverName, timing }) =>
      timing && timing.totalMs > 2000
        ? [
            {
              ruleId: 'MCP016',
              severity: 'warning',
              category: 'protocol',
              target: serverName,
              message: `Server "${serverName}" took ${Math.round(timing.totalMs)} ms to complete initialize + tools/list (> 2,000 ms).`,
              suggestion: 'Defer heavy network/database initialization until the first tool call so IDE startup and tool discovery stay sub-second.',
            },
          ]
        : [],
  },
];
