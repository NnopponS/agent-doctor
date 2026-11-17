import { DIAGNOSTIC_RULE_REGISTRY } from './rules.js';
import { ServerDiagnosisReport } from './types.js';

export function formatSarifReport(
  report: ServerDiagnosisReport,
  artifactUri = 'mcp-tools.json',
): Record<string, unknown> {
  const rules = [
    {
      id: 'MCP000',
      name: 'HandshakeFailure',
      shortDescription: { text: 'MCP stdio process failed to spawn or complete initialize handshake' },
      defaultConfiguration: { level: 'error' },
    },
    ...DIAGNOSTIC_RULE_REGISTRY.map((r) => ({
      id: r.id,
      name: r.title.replace(/[^a-zA-Z0-9]+/g, ''),
      shortDescription: { text: r.title },
      defaultConfiguration: {
        level: r.severity === 'error' ? 'error' : r.severity === 'warning' ? 'warning' : 'note',
      },
    })),
    {
      id: 'MCP017',
      name: 'StdoutPollution',
      shortDescription: { text: 'Non-JSON output written to stdout during active MCP session' },
      defaultConfiguration: { level: 'error' },
    },
    {
      id: 'MCP020',
      name: 'DeprecatedTransportOrPlaintextHttp',
      shortDescription: {
        text: 'Remote MCP server uses legacy SSE or unencrypted HTTP instead of Streamable HTTP + OAuth 2.1',
      },
      defaultConfiguration: { level: 'warning' },
    },
  ];

  const results = report.findings.map((f) => ({
    ruleId: f.ruleId,
    level: f.severity === 'error' ? 'error' : f.severity === 'warning' ? 'warning' : 'note',
    message: {
      text: `${f.message} Fix: ${f.suggestion}`,
    },
    locations: [
      {
        physicalLocation: {
          artifactLocation: {
            uri: artifactUri,
          },
          region: {
            startLine: 1,
          },
        },
        logicalLocations: [
          {
            name: f.target,
            kind: 'function',
          },
        ],
      },
    ],
  }));

  return {
    $schema: 'https://json.schemastore.org/sarif-2.1.0.json',
    version: '2.1.0',
    runs: [
      {
        tool: {
          driver: {
            name: 'agent-doctor',
            informationUri: 'https://github.com/NnopponS/agent-doctor',
            version: '2.0.0',
            rules,
          },
        },
        results,
      },
    ],
  };
}
