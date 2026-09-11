# Tool Reference

QNSC MCP Toolkit includes a comprehensive library of tools organized by category. Use the navigation to browse tools by category, or enable specific categories in your configuration:

```yaml
tools:
  includeCategories:
    - 'CrUX'
    - 'Github: Issues'
    - 'Github: Pulls'
    - 'Web'
    - 'Utility'
```

## Listing Tools

You can list all available tools from the CLI:

```bash
# List all tools
qnsc-mcp list-tools

# List only enabled tools based on your config
qnsc-mcp list-tools --filtered

# Output as JSON
qnsc-mcp list-tools --json
```

> **Note:** Most tools are disabled by default. Edit your `~/.qnscmcp/config.yaml` to enable the categories you need.
