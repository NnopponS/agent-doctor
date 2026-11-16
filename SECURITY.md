# Security Policy

## Scope

`mcp-doctor` inspects Model Context Protocol (MCP) servers and configuration files locally. It does not transmit schemas, environment variables, or token counts over the network.

When running `mcp-doctor check "<command>"` or `mcp-doctor scan-config --live`, `mcp-doctor` spawns the target MCP server command as a local child process on your machine. Only run live checks against commands and repositories you trust. For untrusted schemas, use `mcp-doctor analyze <tools.json>`, which performs pure static analysis without spawning child processes.

## Reporting a Vulnerability

Please report security vulnerabilities via GitHub Security Advisories on [`NnopponS/mcp-doctor`](https://github.com/NnopponS/mcp-doctor/security/advisories) or by emailing `worapon.sangs@gmail.com`.
