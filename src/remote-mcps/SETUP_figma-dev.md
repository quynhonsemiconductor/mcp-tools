# Figma Dev Mode MCP Server

## Description

This is a **local desktop** MCP (Model Context Protocol) server that runs through the Figma desktop application. When enabled in Dev Mode, the Figma desktop app hosts an MCP server locally at `http://localhost:3845/mcp` that provides direct access to your currently selected designs, FigJam diagrams, and Make prototypes. This enables AI agents to generate code from Figma frames, extract design tokens and variables, retrieve component information, and access Code Connect documentation to maintain consistency with your design system.

**Key Advantages:**
- **Selection-based workflow**: Works with your current selection in Figma Desktop
- **Real-time design access**: No need to copy/paste URLs or file keys
- **Enhanced features**: Includes Make resource integration and Code Connect
- **No authentication required**: Runs locally without OAuth tokens

**Note:** This differs from the bundled Figma tool (which uses the REST API with a personal access token) and from Figma's remote MCP server at `https://mcp.figma.com/mcp` (which is URL-based and doesn't require the desktop app).

## Prerequisites

- **Figma Desktop Application**: [Download and install the Figma desktop app](https://www.figma.com/downloads/) (latest version)
- **Figma Account**: Dev or Full seat on Professional, Organization, or Enterprise plan (required for desktop MCP server)
- **Access to Design Files**: Permission to view/edit the Figma files you want to work with
- **MCP-Compatible Editor**: Code editor that supports MCP servers (VS Code, Cursor, Windsurf, Claude Code, etc.)

## Secrets

| Secret Name | Description | How to Obtain |
|-------------|-------------|---------------|
| N/A - No Authentication Required | The desktop MCP server runs locally and requires no API keys or authentication tokens | 1. Install and open the Figma desktop app<br>2. Open or create a design file<br>3. Switch to Dev Mode (toolbar at bottom or Shift+D)<br>4. In the **MCP server** section of the inspect panel, click **Enable desktop MCP server**<br>5. Server runs at `http://127.0.0.1:3845/mcp` - no credentials needed |

## Additional Configuration

### Enabling the Desktop MCP Server

1. **Open Figma Desktop App**
   - Ensure you have the [latest version installed](https://www.figma.com/downloads/)
   - Launch the application and sign in

2. **Open a Design File**
   - Create a new file or open an existing Figma Design, FigJam, or Make file

3. **Switch to Dev Mode**
   - Click the Dev Mode toggle in the toolbar at the bottom
   - Or use keyboard shortcut: `Shift + D`

4. **Enable MCP Server**
   - In the inspect panel (right sidebar), locate the **MCP server** section
   - Click **Enable desktop MCP server**
   - A confirmation message appears when the server is running

5. **Verify Server is Running**
   - The server runs at: `http://127.0.0.1:3845/mcp` (or `http://localhost:3845/mcp`)
   - Keep the Figma desktop app open while using the MCP server

**Important:** The Figma desktop app must remain open and the MCP server must be enabled for the connection to work.

### Key Capabilities

When connected, the desktop server provides:

- **Code Generation**: Convert Figma frames into code with full layout, styling, and component information
- **Design Token Extraction**: Pull variables, color styles, text styles, and effect styles
- **Component Mapping**: Access component definitions, variants, and properties
- **FigJam Resources**: Retrieve content from FigJam diagrams for workflow integration
- **Make Resources**: Access code from Make prototypes to bridge design and development
- **Code Connect Integration**: Maintain consistency between generated code and your actual component library

### Using the Desktop MCP Server

The desktop server supports **two workflows**:

#### 1. Selection-Based (Recommended)
1. In Figma Desktop, select a frame, layer, or component
2. In your editor/IDE, prompt: "Generate code for my current Figma selection"
3. The MCP server automatically accesses your current selection

This is the fastest workflow and doesn't require copying URLs.

#### 2. Link-Based
1. Copy a link to a Figma frame or layer (right-click → Copy link)
2. In your editor/IDE, prompt: "Implement the design at [paste URL]"
3. The MCP server extracts the file key and node ID from the URL

Example URL format:
```
https://www.figma.com/design/<FILE_KEY>/My-Design?node-id=45-678
                          ^^^^^^^^^^                  ^^^^^^^
                          File Key                    Node ID
```

**Note:** Your AI client won't navigate to the URL, but it extracts the identifiers needed by the MCP server.

### Recommended Setup Rules

For optimal output, configure custom rules in your MCP client. Example rules to add:

```
- Always extract and use design tokens (colors, typography, spacing) from Figma
- Prefer component reuse over creating new implementations
- Match the exact spacing and layout from the Figma frame
- Use semantic HTML and accessible markup
- Follow the project's existing component patterns when available
```

See [Figma's custom rules guide](https://developers.figma.com/docs/figma-mcp-server/add-custom-rules/) for more examples.

## Troubleshooting

### Common Issues

**Issue: Connection Failed / Cannot Connect to Server**
- **Cause:** Figma desktop app not running or MCP server not enabled
- **Solution:**
  1. Open the Figma desktop app (must be running)
  2. Open a design file and switch to Dev Mode (Shift+D)
  3. Enable the desktop MCP server in the inspect panel
  4. Verify the confirmation message appears
  5. Check that your editor is configured with `http://localhost:3845/mcp`

**Issue: Tools Not Loading or Connection Lost**
- **Cause:** Figma desktop app closed or MCP server disabled
- **Solution:**
  1. Ensure Figma desktop app remains open
  2. Verify you're still in Dev Mode (toggle at bottom toolbar)
  3. Check the MCP server is still enabled in the inspect panel
  4. Restart the Figma desktop app if needed
  5. Re-enable the desktop MCP server after restart

**Issue: Desktop App Required / Plan Restrictions**
- **Cause:** Using Starter plan or View/Collab seat
- **Solution:**
  1. Desktop MCP server requires a Dev or Full seat on paid plans
  2. Starter plan users have limited access (6 tool calls/month)
  3. Consider upgrading to Professional, Organization, or Enterprise plan
  4. Alternatively, use the bundled Figma REST API tool with a personal access token

**Issue: Selection Not Found / Nothing Selected**
- **Cause:** No frame or layer selected in Figma Desktop when using selection-based workflow
- **Solution:**
  1. In Figma Desktop, click to select a specific frame, layer, or component
  2. Ensure you can see the selection highlight in Figma
  3. Try prompting again with the selection active
  4. If using link-based workflow, provide a valid Figma URL instead

**Issue: File or Node Not Found (404)**
- **Cause:** Invalid file or trying to access a file you don't have permission to view
- **Solution:**
  1. Verify you have the file open in Figma Desktop
  2. Check that you have view or edit access to the file
  3. If using link-based workflow, copy the URL directly from Figma
  4. Ensure the file hasn't been deleted or moved

**Issue: Server Stuck or Extremely Slow**
- **Cause:** Processing a large or complex frame
- **Solution:**
  1. Select smaller, more focused frames instead of entire pages
  2. Avoid frames with hundreds of nested layers
  3. Simplify the design by flattening or componentizing complex sections
  4. Use specific node selections rather than top-level frames

**Issue: Getting 500 Internal Server Error**
- **Cause:** Issue with the local desktop MCP server or corrupted Figma file
- **Solution:**
  1. Restart the Figma desktop app
  2. Disable and re-enable the desktop MCP server
  3. Try a different file or simpler frame to isolate the issue
  4. Update Figma desktop app to the latest version
  5. Check [Figma's status page](https://status.figma.com/) for known issues
  6. Contact Figma support if the problem persists

**Issue: Port 3845 Already in Use**
- **Cause:** Another application is using port 3845 or Figma instance already running
- **Solution:**
  1. Quit all instances of the Figma desktop app
  2. Check for any background Figma processes and terminate them
  3. Restart the Figma desktop app
  4. Re-enable the desktop MCP server
  5. If issue persists, restart your computer

**Issue: Returned Web/React Code Instead of Expected Framework**
- **Cause:** MCP server returns design data; the AI agent chooses implementation approach
- **Solution:**
  1. Be explicit in your prompt: "Generate iOS Swift code for..." or "Create Android Compose code..."
  2. Add framework-specific rules to your MCP client configuration
  3. Provide example code in your existing project for the AI to reference
  4. The MCP server provides design context; framework choice is controlled by your prompt

## Additional Resources

- [Guide to the Figma MCP Server (Help Center)](https://help.figma.com/hc/en-us/articles/32132100833559-Guide-to-the-Figma-MCP-server)
- [Figma MCP Server Documentation](https://developers.figma.com/docs/figma-mcp-server/)
- [Desktop Server Installation Guide](https://developers.figma.com/docs/figma-mcp-server/local-server-installation/)
- [Figma MCP Tools and Prompts Reference](https://developers.figma.com/docs/figma-mcp-server/tools-and-prompts/)
- [Writing Effective Prompts for Best Output](https://developers.figma.com/docs/figma-mcp-server/write-effective-prompts/)
- [Code Connect Integration](https://developers.figma.com/docs/figma-mcp-server/code-connect-integration/)
- [Structuring Figma Files for Better Code](https://developers.figma.com/docs/figma-mcp-server/structure-figma-file/)