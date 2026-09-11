# Knowledge Base

Solutions to common support questions, documented from real issues reported in [Discussions](https://github.com/quynhonsemiconductor/mcp-tools/discussions).

!!! tip "Contributing"
    If you're on-call and resolve a recurring issue, add it here. This reduces repeat questions and helps the next person find the answer faster.

## Categories

<div class="grid cards" markdown>

-   :material-bug:{ .lg .middle } **Known Issues & Workarounds**

    ---

    Active bugs with documented workarounds

    [:octicons-arrow-right-24: Known Issues](known-issues.md)

-   :material-book-open-variant:{ .lg .middle } **How-To Guides**

    ---

    Step-by-step guides for common tasks

    [:octicons-arrow-right-24: How-To Guides](how-to-guides.md)

</div>

## Quick Links

| Problem | Solution |
|---------|----------|
| Managing API keys across multiple IDEs | [Share env vars via shell profile](how-to-guides.md#sharing-credentials-across-multiple-clients) |
| VS Code keeps asking for API keys | [Clear cached input values](how-to-guides.md#refreshing-expired-vs-code-input-tokens) |
| JetBrains has no `${input:...}` syntax | [Use environment variables](how-to-guides.md#jetbrains-api-key-management) |
| Installing on WSL or Linux | [Linux/WSL Setup Guide](../quickstart/linux.md) |
| How do I update to the latest version? | [Updating QNSC MCP Toolkit](how-to-guides.md#updating-qnsc-mcp-toolkit) |

## Existing Guides

These topics are already covered in the main documentation:

- **Setup & Installation** — [Getting Started](../quickstart/getting-started.md), [macOS](../quickstart/macOS.md), [Windows](../quickstart/windows.md)
- **IDE Configuration** — [VS Code](../quickstart/clients/vs-code.md), [JetBrains](../quickstart/clients/jetbrains.md), [Claude Desktop & Claude Code](../quickstart/clients/claude.md)
- **API Keys** — [API Key Setup](../quickstart/api-keys.md)
- **Config & YAML Issues** — [Troubleshooting](../troubleshooting.md) (doctor command, rescue mode, YAML syntax)
- **SSO & Authentication** — [SSO Auth Guide](../quickstart/sso-auth.md)

## Reporting New Issues

If your issue isn't covered here:

1. Run `qnsc-mcp doctor --verbose` and copy the output
2. Check `qnsc-mcp view-logs --lines 50` for error details
3. Post in [Discussions](https://github.com/quynhonsemiconductor/mcp-tools/discussions) with the above info plus your OS and IDE
4. If it's a confirmed bug, [open a GitHub issue](https://github.com/quynhonsemiconductor/mcp-tools/issues/new)
