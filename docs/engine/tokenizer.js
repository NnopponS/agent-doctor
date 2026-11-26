/**
 * Late-2026 Frontier Agentic Model Pricing & Tokenizer Matrix (USD per 1M input tokens).
 * Reflects official API pricing across Anthropic Claude 5.x, OpenAI GPT-6 / Codex,
 * Google Gemini 4 / 3.8, DeepSeek V4, and Alibaba Qwen 3.8.
 * Note: Anthropic models from 4.7+ (including 5.2 and 5.5) use the 5.x tokenizer (~1.30x token density).
 */
export const MODEL_PRICING_TABLE = [
    {
        modelId: 'claude-sonnet-5-5',
        label: 'Claude Sonnet 5.5',
        provider: 'Anthropic',
        contextWindowTokens: 1_000_000,
        tokenizerMultiplier: 1.3,
        inputPricePer1MTokensUsd: 2.0,
        cachedInputPricePer1MTokensUsd: 0.1,
    },
    {
        modelId: 'claude-opus-5-5',
        label: 'Claude Opus 5.5',
        provider: 'Anthropic',
        contextWindowTokens: 1_000_000,
        tokenizerMultiplier: 1.3,
        inputPricePer1MTokensUsd: 4.0,
        cachedInputPricePer1MTokensUsd: 0.2,
    },
    {
        modelId: 'claude-fable-5-2',
        label: 'Claude Fable 5.2',
        provider: 'Anthropic',
        contextWindowTokens: 1_000_000,
        tokenizerMultiplier: 1.3,
        inputPricePer1MTokensUsd: 8.0,
        cachedInputPricePer1MTokensUsd: 0.2,
    },
    {
        modelId: 'gpt-6-astra',
        label: 'GPT-6 Astra',
        provider: 'OpenAI',
        contextWindowTokens: 1_050_000,
        tokenizerMultiplier: 1.0,
        inputPricePer1MTokensUsd: 10.0,
        cachedInputPricePer1MTokensUsd: 1.0,
    },
    {
        modelId: 'gpt-6.1-sol',
        label: 'GPT-6.1 Sol',
        provider: 'OpenAI',
        contextWindowTokens: 1_050_000,
        tokenizerMultiplier: 1.0,
        inputPricePer1MTokensUsd: 2.0,
        cachedInputPricePer1MTokensUsd: 0.1,
    },
    {
        modelId: 'gpt-5.3-codex',
        label: 'GPT-5.3 Codex',
        provider: 'OpenAI',
        contextWindowTokens: 400_000,
        tokenizerMultiplier: 1.0,
        inputPricePer1MTokensUsd: 1.75,
        cachedInputPricePer1MTokensUsd: 0.175,
    },
    {
        modelId: 'gemini-4-argon',
        label: 'Gemini 4 Argon',
        provider: 'Google',
        contextWindowTokens: 1_000_000,
        tokenizerMultiplier: 1.0,
        inputPricePer1MTokensUsd: 2.0,
        cachedInputPricePer1MTokensUsd: 0.1,
    },
    {
        modelId: 'gemini-3.8-flash',
        label: 'Gemini 3.8 Flash',
        provider: 'Google',
        contextWindowTokens: 1_000_000,
        tokenizerMultiplier: 1.0,
        inputPricePer1MTokensUsd: 0.75,
        cachedInputPricePer1MTokensUsd: 0.075,
    },
    {
        modelId: 'deepseek-v4-pro',
        label: 'DeepSeek V4-Pro',
        provider: 'DeepSeek',
        contextWindowTokens: 1_000_000,
        tokenizerMultiplier: 1.05,
        inputPricePer1MTokensUsd: 0.66,
        cachedInputPricePer1MTokensUsd: 0.022,
    },
    {
        modelId: 'qwen-3.8-max',
        label: 'Qwen 3.8 Max',
        provider: 'Alibaba',
        contextWindowTokens: 1_000_000,
        tokenizerMultiplier: 1.05,
        inputPricePer1MTokensUsd: 2.0,
        cachedInputPricePer1MTokensUsd: 0.2,
    },
];
/**
 * Deterministic BPE token estimator tuned for structured JSON tool schemas
 * and prose descriptions (o200k_base baseline; multiplied by 1.30x for Claude 5.x).
 */
export function estimateTextTokens(text) {
    if (!text)
        return 0;
    const normalized = text.trim();
    if (normalized.length === 0)
        return 0;
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
        }
        else {
            tokenCount += Math.max(1, Math.ceil(stripped.length / 4.0));
        }
        tokenCount += Math.ceil(punctCount * 0.65);
    }
    return Math.max(1, tokenCount);
}
export function estimateSchemaTokens(schema) {
    if (!schema || typeof schema !== 'object')
        return 4;
    const serialized = JSON.stringify(schema);
    return estimateTextTokens(serialized) + 6;
}
export function computeSchemaMaxDepth(node, currentDepth = 0) {
    if (!node || typeof node !== 'object')
        return currentDepth;
    const obj = node;
    let maxDepth = currentDepth;
    if (obj.properties && typeof obj.properties === 'object') {
        for (const prop of Object.values(obj.properties)) {
            maxDepth = Math.max(maxDepth, computeSchemaMaxDepth(prop, currentDepth + 1));
        }
    }
    if (obj.items && typeof obj.items === 'object') {
        maxDepth = Math.max(maxDepth, computeSchemaMaxDepth(obj.items, currentDepth + 1));
    }
    for (const combiner of ['anyOf', 'oneOf', 'allOf']) {
        if (Array.isArray(obj[combiner])) {
            for (const branch of obj[combiner]) {
                maxDepth = Math.max(maxDepth, computeSchemaMaxDepth(branch, currentDepth + 1));
            }
        }
    }
    return maxDepth;
}
/**
 * Detects patterns in tool descriptions or schemas that bust prefix prompt caching
 * across turns on Claude 5.5, GPT-6, Gemini 4, and DeepSeek V4.
 */
export function detectCacheBustingSignals(tool) {
    const signals = [];
    const desc = tool.description ?? '';
    const serialized = JSON.stringify(tool);
    if (/\b202\d-\d{2}-\d{2}T\d{2}:\d{2}/.test(serialized)) {
        signals.push('dynamic ISO-8601 timestamp in tool definition');
    }
    if (/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i.test(desc)) {
        signals.push('embedded session/UUID in description');
    }
    if (/\b(?:current time|server uptime|random seed|generated at|session_id)\s*:/i.test(desc)) {
        signals.push('volatile runtime state in description');
    }
    return signals;
}
export function profileToolTokens(tool) {
    const description = tool.description ?? '';
    const nameTokens = estimateTextTokens(tool.name) + 4;
    const descriptionTokens = estimateTextTokens(description);
    const schemaTokens = estimateSchemaTokens(tool.inputSchema);
    const outputSchemaTokens = tool.outputSchema ? estimateSchemaTokens(tool.outputSchema) : 0;
    const totalTokens = nameTokens + descriptionTokens + schemaTokens + outputSchemaTokens;
    const claude5Tokens = Math.ceil(totalTokens * 1.3);
    const properties = tool.inputSchema?.properties && typeof tool.inputSchema.properties === 'object'
        ? tool.inputSchema.properties
        : {};
    const paramEntries = Object.entries(properties);
    const requiredList = Array.isArray(tool.inputSchema?.required) ? tool.inputSchema.required : [];
    const undocumentedParams = [];
    const untypedParams = [];
    for (const [paramName, prop] of paramEntries) {
        if (!prop || typeof prop !== 'object') {
            untypedParams.push(paramName);
            undocumentedParams.push(paramName);
            continue;
        }
        if (!prop.description || prop.description.trim().length === 0) {
            undocumentedParams.push(paramName);
        }
        const hasType = Boolean(prop.type) ||
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
    const hasOutputSchema = Boolean(tool.outputSchema && typeof tool.outputSchema === 'object' && tool.outputSchema.type === 'object');
    const hasSafetyAnnotations = Boolean(tool.annotations &&
        (typeof tool.annotations.readOnlyHint === 'boolean' ||
            typeof tool.annotations.destructiveHint === 'boolean' ||
            typeof tool.annotations.idempotentHint === 'boolean' ||
            typeof tool.annotations.openWorldHint === 'boolean'));
    const cacheBustingSignals = detectCacheBustingSignals(tool);
    return {
        name: tool.name,
        descriptionLength: description.length,
        descriptionTokens,
        schemaTokens,
        totalTokens,
        claude5Tokens,
        parameterCount: paramEntries.length,
        requiredCount: requiredList.length,
        undocumentedParams,
        untypedParams,
        maxDepth,
        hasOutputSchema,
        hasSafetyAnnotations,
        cacheBustingSignals,
    };
}
export function calculateCostEstimates(totalTokens) {
    return MODEL_PRICING_TABLE.map((spec) => {
        const effectiveTokens = Math.ceil(totalTokens * spec.tokenizerMultiplier);
        const costPerTurnUsd = (effectiveTokens / 1_000_000) * spec.inputPricePer1MTokensUsd;
        const cachedCostPerTurnUsd = (effectiveTokens / 1_000_000) * spec.cachedInputPricePer1MTokensUsd;
        const costPer1kTurnsUsd = Number((costPerTurnUsd * 1000).toFixed(3));
        const cachedCostPer1kTurnsUsd = Number((cachedCostPerTurnUsd * 1000).toFixed(3));
        return {
            modelId: spec.modelId,
            label: spec.label,
            provider: spec.provider,
            contextWindowTokens: spec.contextWindowTokens,
            tokenizerMultiplier: spec.tokenizerMultiplier,
            effectiveTokens,
            inputPricePer1MTokensUsd: spec.inputPricePer1MTokensUsd,
            cachedInputPricePer1MTokensUsd: spec.cachedInputPricePer1MTokensUsd,
            costPerTurnUsd: Number(costPerTurnUsd.toFixed(6)),
            costPer100TurnsUsd: Number((costPerTurnUsd * 100).toFixed(4)),
            costPer1kTurnsUsd,
            cachedCostPer1kTurnsUsd,
            cacheBustPenaltyPer1kTurnsUsd: Number(Math.max(0, costPer1kTurnsUsd - cachedCostPer1kTurnsUsd).toFixed(3)),
        };
    });
}
