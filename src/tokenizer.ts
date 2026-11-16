import {
  JsonSchemaProperty,
  McpToolDefinition,
  ModelCostEstimate,
  ToolTokenProfile,
} from './types.js';

export interface ModelPricingSpec {
  modelId: string;
  label: string;
  inputPricePer1MTokensUsd: number;
}

export const MODEL_PRICING_TABLE: readonly ModelPricingSpec[] = [
  { modelId: 'claude-sonnet-4', label: 'Claude Sonnet 4', inputPricePer1MTokensUsd: 3.0 },
  { modelId: 'claude-opus-4', label: 'Claude Opus 4', inputPricePer1MTokensUsd: 15.0 },
  { modelId: 'gpt-5', label: 'GPT-5', inputPricePer1MTokensUsd: 2.5 },
  { modelId: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro', inputPricePer1MTokensUsd: 1.25 },
  { modelId: 'deepseek-v3', label: 'DeepSeek V3', inputPricePer1MTokensUsd: 0.27 },
];

/**
 * Deterministic BPE token estimator tuned for structured JSON tool schemas
 * and prose descriptions (cl100k_base / o200k_base / Claude tokenizer approximation).
 */
export function estimateTextTokens(text: string): number {
  if (!text) return 0;
  const normalized = text.trim();
  if (normalized.length === 0) return 0;

  const words = normalized.split(/\s+/);
  let tokenCount = 0;

  for (const word of words) {
    const punctuationMatches = word.match(/[{}[\](),.:;"'`/\\|<>+=*?!@#$%^&~-]/g);
    const punctCount = punctuationMatches ? punctuationMatches.length : 0;
    const stripped = word.replace(/[{}[\](),.:;"'`/\\|<>+=*?!@#$%^&~-]/g, '');

    if (stripped.length === 0) {
      tokenCount += Math.max(1, Math.ceil(punctCount * 0.75));
      continue;
    }

    const camelParts = stripped.split(/(?=[A-Z])/).filter(Boolean);
    if (camelParts.length > 1) {
      for (const part of camelParts) {
        tokenCount += Math.max(1, Math.ceil(part.length / 4.2));
      }
    } else {
      tokenCount += Math.max(1, Math.ceil(stripped.length / 4.0));
    }

    tokenCount += Math.ceil(punctCount * 0.65);
  }

  return Math.max(1, tokenCount);
}

/**
 * Estimates the token footprint of a serialized JSON Schema or tool object,
 * accounting for LLM system-prompt framing overhead per tool.
 */
export function estimateSchemaTokens(schema: unknown): number {
  if (!schema || typeof schema !== 'object') return 4;
  const serialized = JSON.stringify(schema);
  return estimateTextTokens(serialized) + 6;
}

export function computeSchemaMaxDepth(node: unknown, currentDepth = 0): number {
  if (!node || typeof node !== 'object') return currentDepth;
  const obj = node as Record<string, unknown>;
  let maxDepth = currentDepth;

  if (obj.properties && typeof obj.properties === 'object') {
    for (const prop of Object.values(obj.properties as Record<string, unknown>)) {
      maxDepth = Math.max(maxDepth, computeSchemaMaxDepth(prop, currentDepth + 1));
    }
  }

  if (obj.items && typeof obj.items === 'object') {
    maxDepth = Math.max(maxDepth, computeSchemaMaxDepth(obj.items, currentDepth + 1));
  }

  for (const combiner of ['anyOf', 'oneOf', 'allOf'] as const) {
    if (Array.isArray(obj[combiner])) {
      for (const branch of obj[combiner] as unknown[]) {
        maxDepth = Math.max(maxDepth, computeSchemaMaxDepth(branch, currentDepth + 1));
      }
    }
  }

  return maxDepth;
}

export function profileToolTokens(tool: McpToolDefinition): Omit<ToolTokenProfile, 'shareOfServerPct'> {
  const description = tool.description ?? '';
  const nameTokens = estimateTextTokens(tool.name) + 4;
  const descriptionTokens = estimateTextTokens(description);
  const schemaTokens = estimateSchemaTokens(tool.inputSchema);
  const totalTokens = nameTokens + descriptionTokens + schemaTokens;

  const properties: Record<string, JsonSchemaProperty> =
    tool.inputSchema?.properties && typeof tool.inputSchema.properties === 'object'
      ? tool.inputSchema.properties
      : {};
  const paramEntries = Object.entries(properties);
  const requiredList = Array.isArray(tool.inputSchema?.required) ? tool.inputSchema.required : [];

  const undocumentedParams: string[] = [];
  const untypedParams: string[] = [];

  for (const [paramName, prop] of paramEntries) {
    if (!prop || typeof prop !== 'object') {
      untypedParams.push(paramName);
      undocumentedParams.push(paramName);
      continue;
    }
    if (!prop.description || prop.description.trim().length === 0) {
      undocumentedParams.push(paramName);
    }
    const hasType =
      Boolean(prop.type) ||
      Boolean(prop.$ref) ||
      Array.isArray(prop.anyOf) ||
      Array.isArray(prop.oneOf) ||
      Array.isArray(prop.allOf) ||
      Array.isArray(prop.enum);
    if (!hasType) {
      untypedParams.push(paramName);
    }
  }

  const maxDepth = computeSchemaMaxDepth(tool.inputSchema, 0);

  return {
    name: tool.name,
    descriptionLength: description.length,
    descriptionTokens,
    schemaTokens,
    totalTokens,
    parameterCount: paramEntries.length,
    requiredCount: requiredList.length,
    undocumentedParams,
    untypedParams,
    maxDepth,
  };
}

export function calculateCostEstimates(totalTokens: number): ModelCostEstimate[] {
  return MODEL_PRICING_TABLE.map((spec) => {
    const costPerTurnUsd = (totalTokens / 1_000_000) * spec.inputPricePer1MTokensUsd;
    return {
      modelId: spec.modelId,
      label: spec.label,
      inputPricePer1MTokensUsd: spec.inputPricePer1MTokensUsd,
      costPerTurnUsd: Number(costPerTurnUsd.toFixed(6)),
      costPer100TurnsUsd: Number((costPerTurnUsd * 100).toFixed(4)),
      costPer1kTurnsUsd: Number((costPerTurnUsd * 1000).toFixed(3)),
    };
  });
}
