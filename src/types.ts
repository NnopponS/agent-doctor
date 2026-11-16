export interface JsonSchemaProperty {
  type?: string | string[];
  description?: string;
  enum?: unknown[];
  pattern?: string;
  minLength?: number;
  maxLength?: number;
  minimum?: number;
  maximum?: number;
  default?: unknown;
  items?: JsonSchemaProperty;
  properties?: Record<string, JsonSchemaProperty>;
  required?: string[];
  additionalProperties?: boolean | JsonSchemaProperty;
  anyOf?: JsonSchemaProperty[];
  oneOf?: JsonSchemaProperty[];
  allOf?: JsonSchemaProperty[];
  $ref?: string;
}

export interface McpToolInputSchema {
  type?: string;
  properties?: Record<string, JsonSchemaProperty>;
  required?: string[];
  additionalProperties?: boolean | JsonSchemaProperty;
  $schema?: string;
  [key: string]: unknown;
}

export interface McpToolDefinition {
  name: string;
  description?: string;
  inputSchema?: McpToolInputSchema;
  annotations?: Record<string, unknown>;
}

export interface McpResourceDefinition {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
}

export interface McpPromptDefinition {
  name: string;
  description?: string;
  arguments?: Array<{ name: string; description?: string; required?: boolean }>;
}

export interface McpServerTarget {
  name: string;
  command: string;
  args: string[];
  env?: Record<string, string>;
  cwd?: string;
}

export interface HandshakeTiming {
  spawnMs: number;
  initializeMs: number;
  toolsListMs: number;
  resourcesListMs: number | null;
  promptsListMs: number | null;
  totalMs: number;
}

export interface ToolTokenProfile {
  name: string;
  descriptionLength: number;
  descriptionTokens: number;
  schemaTokens: number;
  totalTokens: number;
  shareOfServerPct: number;
  parameterCount: number;
  requiredCount: number;
  undocumentedParams: string[];
  untypedParams: string[];
  maxDepth: number;
}

export type FindingSeverity = 'error' | 'warning' | 'info';
export type FindingCategory = 'protocol' | 'schema' | 'tokens' | 'security' | 'ergonomics';

export interface DiagnosticFinding {
  ruleId: string;
  severity: FindingSeverity;
  category: FindingCategory;
  target: string;
  message: string;
  suggestion: string;
}

export interface ModelCostEstimate {
  modelId: string;
  label: string;
  inputPricePer1MTokensUsd: number;
  costPerTurnUsd: number;
  costPer100TurnsUsd: number;
  costPer1kTurnsUsd: number;
}

export type HealthGrade = 'A+' | 'A' | 'B' | 'C' | 'D' | 'F';

export interface ServerDiagnosisReport {
  serverName: string;
  mode: 'live-stdio' | 'static-schema';
  protocolVersion: string | null;
  serverInfo: { name: string; version: string } | null;
  timing: HandshakeTiming | null;
  toolCount: number;
  resourceCount: number;
  promptCount: number;
  tools: ToolTokenProfile[];
  totalTokens: number;
  estimatedTokenSavingsIfOptimized: number;
  costEstimates: ModelCostEstimate[];
  findings: DiagnosticFinding[];
  scoreBreakdown: {
    schemaScore: number;
    tokenScore: number;
    latencyScore: number;
    securityScore: number;
  };
  score: number;
  grade: HealthGrade;
  passed: boolean;
  timestamp: string;
}

export interface ConfigSecretWarning {
  serverName: string;
  envKey: string;
  patternName: string;
  maskedPreview: string;
  suggestion: string;
}

export interface ConfigScanReport {
  configPath: string;
  serverCount: number;
  servers: McpServerTarget[];
  secretWarnings: ConfigSecretWarning[];
  duplicateCommands: string[];
  serverReports: ServerDiagnosisReport[];
}
