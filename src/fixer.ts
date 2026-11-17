import { analyzeMcpServer } from './analyzer.js';
import {
  JsonSchemaProperty,
  McpToolDefinition,
  ServerDiagnosisReport,
} from './types.js';

export interface SchemaFixAction {
  toolName: string;
  ruleId: string;
  description: string;
}

export interface AutoFixResult {
  serverName: string;
  originalTools: McpToolDefinition[];
  fixedTools: McpToolDefinition[];
  actions: SchemaFixAction[];
  beforeReport: ServerDiagnosisReport;
  afterReport: ServerDiagnosisReport;
  tokensSaved: number;
  scoreDelta: number;
}

const HIGH_RISK_TOOL_REGEX =
  /(?:^|_|-)(?:exec|execute|shell|bash|powershell|cmd|run_command|delete|drop|remove|sql|query_raw|eval|write_file|overwrite)(?:$|_|-)/i;
const ENUM_CANDIDATE_PARAM_REGEX =
  /^(?:mode|status|format|action|level|severity|sort|order|protocol|encoding|transport)$/i;

function humanizeIdentifier(id: string): string {
  return id
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim()
    .toLowerCase();
}

function inferPropertyType(paramName: string, prop: JsonSchemaProperty): string {
  if (typeof prop.default === 'number') return 'number';
  if (typeof prop.default === 'boolean') return 'boolean';
  if (Array.isArray(prop.default) || prop.items) return 'array';
  if (prop.properties) return 'object';
  if (/^(?:is|has|should|enable|disable|allow|force|dryRun|runLive)/i.test(paramName)) {
    return 'boolean';
  }
  if (/(?:Count|Limit|Timeout|Ms|Port|Index|Size|Depth|Minimum|Maximum|Score)$/i.test(paramName)) {
    return 'number';
  }
  if (/(?:List|Items|Array|Paths|Tags|Ids)$/i.test(paramName)) {
    return 'array';
  }
  return 'string';
}

function defaultEnumForCandidate(paramName: string): string[] | undefined {
  const lower = paramName.toLowerCase();
  if (lower === 'mode') return ['sync', 'async', 'auto'];
  if (lower === 'format') return ['json', 'markdown', 'text'];
  if (lower === 'order') return ['asc', 'desc'];
  if (lower === 'severity' || lower === 'level') return ['info', 'warning', 'error'];
  return undefined;
}

function compressVerboseDescription(desc: string, maxChars = 240): string {
  const withoutExamples = desc
    .replace(/\bExample\s*\d*\s*:[\s\S]*/i, '')
    .replace(/\bNote\s*:[\s\S]*/i, '')
    .trim();
  const base = withoutExamples.length >= 20 ? withoutExamples : desc.trim();
  if (base.length <= maxChars) return base;

  const sentences = base.split(/(?<=[.!?])\s+/);
  let acc = '';
  for (const s of sentences) {
    if ((acc + ' ' + s).trim().length <= maxChars) {
      acc = (acc + ' ' + s).trim();
    } else {
      break;
    }
  }
  if (acc.length >= 20) return acc;
  return base.slice(0, maxChars - 3).trimEnd() + '...';
}

function clampSchemaDepth(
  prop: JsonSchemaProperty,
  currentDepth: number,
  maxAllowedDepth: number,
  toolName: string,
  actions: SchemaFixAction[],
): JsonSchemaProperty {
  const clone: JsonSchemaProperty = { ...prop };
  if (clone.properties && typeof clone.properties === 'object') {
    if (currentDepth >= maxAllowedDepth) {
      delete clone.properties;
      clone.type = 'object';
      clone.description =
        clone.description ?? 'Structured configuration object (flattened for schema ergonomics).';
      actions.push({
        toolName,
        ruleId: 'MCP007',
        description: `Collapsed nested object properties beyond depth ${maxAllowedDepth}.`,
      });
    } else {
      const nextProps: Record<string, JsonSchemaProperty> = {};
      for (const [k, v] of Object.entries(clone.properties)) {
        nextProps[k] = clampSchemaDepth(
          v ?? {},
          currentDepth + 1,
          maxAllowedDepth,
          toolName,
          actions,
        );
      }
      clone.properties = nextProps;
    }
  }
  return clone;
}

export function fixMcpTools(
  tools: McpToolDefinition[],
  serverName = 'mcp-server',
): AutoFixResult {
  const beforeReport = analyzeMcpServer({
    serverName: `${serverName} (before)`,
    mode: 'static-schema',
    tools,
  });

  const actions: SchemaFixAction[] = [];

  const fixedTools: McpToolDefinition[] = tools.map((orig) => {
    const tool: McpToolDefinition = JSON.parse(JSON.stringify(orig));

    // 1. Normalize invalid tool name (MCP013)
    if (!/^[a-zA-Z0-9_-]{1,64}$/.test(tool.name)) {
      const sanitized = tool.name
        .replace(/[^a-zA-Z0-9_-]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .slice(0, 64) || 'unnamed_tool';
      actions.push({
        toolName: tool.name,
        ruleId: 'MCP013',
        description: `Normalized tool name "${tool.name}" -> "${sanitized}".`,
      });
      tool.name = sanitized;
    }

    // 2. Fix missing or overly short description (MCP002)
    if (!tool.description || tool.description.trim().length < 15) {
      const humanized = humanizeIdentifier(tool.name);
      tool.description = `Execute ${humanized} operation and return structured results.`;
      actions.push({
        toolName: tool.name,
        ruleId: 'MCP002',
        description: `Synthesized missing/short description for "${tool.name}".`,
      });
    } else if (tool.description.length > 550) {
      // 3. Compress overly long description (MCP003)
      const prevLen = tool.description.length;
      tool.description = compressVerboseDescription(tool.description, 240);
      actions.push({
        toolName: tool.name,
        ruleId: 'MCP003',
        description: `Compressed verbose description from ${prevLen} chars to ${tool.description.length} chars.`,
      });
    }

    // 4. Ensure root inputSchema has type: "object" (MCP001)
    if (!tool.inputSchema || typeof tool.inputSchema !== 'object') {
      tool.inputSchema = {
        type: 'object',
        properties: {},
        additionalProperties: false,
      };
      actions.push({
        toolName: tool.name,
        ruleId: 'MCP001',
        description: 'Created root inputSchema with type: "object".',
      });
    } else if (tool.inputSchema.type !== 'object') {
      tool.inputSchema.type = 'object';
      if (tool.inputSchema.additionalProperties === undefined) {
        tool.inputSchema.additionalProperties = false;
      }
      actions.push({
        toolName: tool.name,
        ruleId: 'MCP001',
        description: 'Set root inputSchema.type = "object" and additionalProperties = false.',
      });
    }

    const rawProps =
      tool.inputSchema.properties && typeof tool.inputSchema.properties === 'object'
        ? tool.inputSchema.properties
        : {};
    const fixedProps: Record<string, JsonSchemaProperty> = {};

    for (const [paramName, rawProp] of Object.entries(rawProps)) {
      let prop: JsonSchemaProperty =
        rawProp && typeof rawProp === 'object' ? { ...rawProp } : {};

      // 5. Infer missing property type (MCP004)
      const hasType =
        Boolean(prop.type) ||
        Boolean(prop.$ref) ||
        Array.isArray(prop.anyOf) ||
        Array.isArray(prop.oneOf) ||
        Array.isArray(prop.allOf) ||
        Array.isArray(prop.enum);
      if (!hasType) {
        prop.type = inferPropertyType(paramName, prop);
        actions.push({
          toolName: tool.name,
          ruleId: 'MCP004',
          description: `Inferred type "${prop.type}" for untyped parameter "${paramName}".`,
        });
      }

      // 6. Synthesize missing parameter description (MCP005)
      if (!prop.description || prop.description.trim().length === 0) {
        prop.description = `Parameter for ${humanizeIdentifier(paramName)}.`;
        actions.push({
          toolName: tool.name,
          ruleId: 'MCP005',
          description: `Added concise description for parameter "${paramName}".`,
        });
      }

      // 7. Add enum for mode/status candidates (MCP015)
      if (
        ENUM_CANDIDATE_PARAM_REGEX.test(paramName) &&
        prop.type === 'string' &&
        !Array.isArray(prop.enum)
      ) {
        const candidateEnum = defaultEnumForCandidate(paramName);
        if (candidateEnum) {
          prop.enum = candidateEnum;
          actions.push({
            toolName: tool.name,
            ruleId: 'MCP015',
            description: `Added enum [${candidateEnum.join(', ')}] to "${paramName}".`,
          });
        }
      }

      // 8. Clamp excessive nesting depth > 3 so root+prop depth stays <= 4 (MCP007)
      prop = clampSchemaDepth(prop, 1, 3, tool.name, actions);

      fixedProps[paramName] = prop;
    }

    // Canonicalize property key ordering for deterministic prefix prompt caching
    const sortedProps: Record<string, JsonSchemaProperty> = {};
    for (const k of Object.keys(fixedProps).sort()) {
      sortedProps[k] = fixedProps[k];
    }
    tool.inputSchema.properties = sortedProps;

    // 8b. Strip volatile prompt-cache busting patterns from description (MCP018)
    if (tool.description) {
      const scrubbed = tool.description
        .replace(/\b202\d-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?Z?)?\b/g, '<timestamp>')
        .replace(
          /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi,
          '<uuid>',
        );
      if (scrubbed !== tool.description) {
        tool.description = scrubbed;
        actions.push({
          toolName: tool.name,
          ruleId: 'MCP018',
          description: 'Scrubbed volatile timestamp/UUID from description to preserve prefix prompt caching.',
        });
      }
    }

    // 9. Remove ghost required entries (MCP006)
    if (Array.isArray(tool.inputSchema.required)) {
      const validReq = tool.inputSchema.required.filter((r) =>
        Object.prototype.hasOwnProperty.call(sortedProps, r),
      );
      if (validReq.length !== tool.inputSchema.required.length) {
        const removed = tool.inputSchema.required.filter((r) => !validReq.includes(r));
        actions.push({
          toolName: tool.name,
          ruleId: 'MCP006',
          description: `Removed ghost required parameter(s): ${removed.join(', ')}.`,
        });
        tool.inputSchema.required = validReq;
      }
    }

    // 10. Guard high-risk tools with maxLength and annotations (MCP014) + MCP 2026 annotations (MCP019)
    if (HIGH_RISK_TOOL_REGEX.test(tool.name)) {
      const propsList = Object.values(sortedProps);
      const hasConstraints = propsList.some(
        (p) =>
          Array.isArray(p.enum) ||
          typeof p.pattern === 'string' ||
          typeof p.maxLength === 'number' ||
          typeof p.maximum === 'number',
      );
      if (!hasConstraints) {
        const firstStringProp = Object.entries(sortedProps).find(
          ([, p]) => p.type === 'string',
        );
        if (firstStringProp) {
          firstStringProp[1].maxLength = 2048;
          actions.push({
            toolName: tool.name,
            ruleId: 'MCP014',
            description: `Added maxLength: 2048 boundary constraint on "${firstStringProp[0]}" for high-risk tool "${tool.name}".`,
          });
        }
      }
      tool.annotations = {
        ...(tool.annotations ?? {}),
        readOnlyHint: false,
        destructiveHint: true,
      };
    } else if (
      !tool.annotations ||
      (typeof tool.annotations.readOnlyHint !== 'boolean' &&
        typeof tool.annotations.destructiveHint !== 'boolean' &&
        typeof tool.annotations.idempotentHint !== 'boolean')
    ) {
      const isReadOnly = /^(?:get|list|read|search|find|fetch|query|inspect|analyze|audit|scan|estimate|check|describe)(?:$|_|-)/i.test(
        tool.name,
      );
      tool.annotations = {
        ...(tool.annotations ?? {}),
        readOnlyHint: isReadOnly,
        destructiveHint: false,
        idempotentHint: isReadOnly,
      };
      actions.push({
        toolName: tool.name,
        ruleId: 'MCP019',
        description: `Synthesized MCP 2026 annotations ({ readOnlyHint: ${isReadOnly}, destructiveHint: false }) for "${tool.name}".`,
      });
    }

    return tool;
  });

  const afterReport = analyzeMcpServer({
    serverName: `${serverName} (fixed)`,
    mode: 'static-schema',
    tools: fixedTools,
  });

  return {
    serverName,
    originalTools: tools,
    fixedTools,
    actions,
    beforeReport,
    afterReport,
    tokensSaved: Math.max(0, beforeReport.totalTokens - afterReport.totalTokens),
    scoreDelta: afterReport.score - beforeReport.score,
  };
}
