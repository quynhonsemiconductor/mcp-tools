# Native Tools

This directory holds the native tool implementations. Each subdirectory is a tool
category; a tool is a `@Tool`-decorated class that auto-registers into the tool registry.

**Note:** Some tools are enabled by default; all others are excluded unless enabled in
`.qnscmcp.yaml`. See the inventory for which are on by default.

## Tool inventory

The authoritative, up-to-date list of every tool — with categories, descriptions,
required environment variables, and default-enabled status — is
[`TOOLS.md`](../../TOOLS.md) at the repo root. It is generated from source **and** from
the running server (`bun run src/mcp.ts list-tools`), so it stays in sync with the code;
this README does not duplicate it.

The native categories that currently exist are:

| Category | Tools | Notes |
|----------|-------|-------|
| GitHub | 92 | Requires `GITHUB_TOKEN` (targets `api.github.com`) |
| Utility | 15 | Time, weather, clipboard, tasks, geocoding, etc. `getCoordinatesFromLocation` uses `GEOCODE_MAPS_API_KEY` |
| Knowledge Graph | 9 | No credentials |
| k6 | 6 | Requires `GRAFANA_K6_TOKEN` |
| NPM | 5 | No credentials |
| Memory | 5 | `addMemory`/`updateMemory` need `QNSC_MCP_API_KEY`, which points at a platform API this org does not host, so those calls cannot succeed here |
| CrUX | 4 | Requires `GOOGLE_CRUX_API_KEY` |
| PostgreSQL | 4 | No credentials (connection supplied at call time) |
| Swagger | 2 | `saveSwaggerHubDocument` needs `SWAGGER_HUB_API_KEY` |

Counts are as of the last `TOOLS.md` generation (142 native tools total); regenerate
`TOOLS.md` if you change the tool set.

## Creating New Tools

To create a new tool, use the built-in tool creation script:

```
bun run new:tool
```

This interactive script will:

1. Guide you through setting up a properly structured tool
2. Generate the tool implementation file with appropriate TypeScript types
3. Create a test file with scaffolding
4. **Automatically create a SETUP.md file** with documentation template
5. Update the tool loader to register your new tool

The generated SETUP.md file includes sections for:

- Tool description and prerequisites
- Required secrets/environment variables table
- Step-by-step setup instructions
- Troubleshooting common issues

Remember to complete the SETUP.md file with your tool's specific configuration requirements to help users set up your tool correctly.

For more details on tool development, please refer to the [Contributing Guide](../../CONTRIBUTING.md).
