# Contributing to mcp-doctor

Contributions that add high-signal diagnostic rules, improve BPE token estimation accuracy, or expand MCP client config discovery are welcome.

## Development Workflow

```bash
npm install
npm run typecheck
npm test
```

## Adding a Diagnostic Rule

All diagnostic rules live in [`src/rules.ts`](src/rules.ts) inside `DIAGNOSTIC_RULE_REGISTRY`.

1. Assign the next sequential `MCP0XX` identifier.
2. Choose an accurate `severity` (`error`, `warning`, or `info`) and `category` (`protocol`, `schema`, `tokens`, `security`, or `ergonomics`).
3. Provide a concrete `suggestion` string explaining how the server author can fix the finding.
4. Add a unit test in [`src/test/mcp-doctor.test.ts`](src/test/mcp-doctor.test.ts) covering both a failing fixture and a clean fixture.
5. Verify that `MCP_DOCTOR_TOOLS` and `OPTIMIZED_SAMPLE_TOOLS` continue to score `100/100 (A+)`.
