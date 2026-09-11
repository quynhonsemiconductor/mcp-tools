import fs from 'fs';
import os from 'os';
import path from 'path';
import { QNSC_MCP_DIR } from '../config';
import { BundledMCPManager } from '../gateway/bundled-mcp-manager';
import { displayError, displayHeader } from '../lib/display';
import { promptRegistry, registry } from '../registry';

const DEFAULT_BUNDLED_MCP_DIR = path.join(QNSC_MCP_DIR, 'bundled');

/**
 * Command to generate a default config file
 */
export async function generateConfig(outputPath?: string): Promise<void> {
  try {
    // Display header
    displayHeader();

    // Initialize the registry to discover tools
    await registry.initialize();
    await promptRegistry.initialize();

    // Get all tools and categories
    const tools = registry.getAllTools();
    const categories = registry.getCategories();

    // Discover bundled MCPs
    const bundledMcpManager = new BundledMCPManager(DEFAULT_BUNDLED_MCP_DIR);
    await bundledMcpManager.initialize();
    const bundledMcps = bundledMcpManager.getBundledMCPs();

    // Using YAML for better readability with comments
    const yamlConfig = `# QNSC MCP Configuration

# This file controls which tools are available to your coding assistant.
#
# HOW FILTERING WORKS:
# Tools are included if they match ANY of these conditions:
#   - Listed in 'include' (supports glob patterns like "github-*")
#   - Their category is in 'includeCategories'
#   - They have includeByDefault: true (for core/essential tools)
#
# Tools are excluded if they match ANY of these conditions:
#   - Listed in 'exclude' (supports glob patterns)
#   - Their category is in 'excludeCategories'
#
# IMPORTANT: Exclusions always take precedence over inclusions.
# Example: If a tool is in both 'include' and 'exclude', it will be excluded.
#
# TIP: You can use both 'include' and 'includeCategories' together.
# They work as a union (OR) - any tool matching either will be included.

# TOOL FILTERING OPTIONS
# Uncomment and modify any of the sections below to filter tools
tools: {}
  # Only include these specific tools (uncomment and adjust as needed)
  # include:
${tools
  .slice(0, 5)
  .map(
    (tool) =>
      `  #   - "${tool.id}"  # ${tool.name}: ${tool.description.substring(0, 60)}${tool.description.length > 60 ? '...' : ''}`,
  )
  .join('\n')}

  # Exclude these specific tools (uncomment and adjust as needed)
  # exclude:
${tools
  .slice(0, 3)
  .map((tool) => `  #   - "${tool.id}"  # ${tool.name}`)
  .join('\n')}

  # Only include tools in these categories (uncomment and adjust as needed)
  # includeCategories:
${categories.map((category) => `  #   - "${category}"`).join('\n')}

  # Exclude all tools in these categories (uncomment and adjust as needed)
  # excludeCategories:
${categories
  .slice(0, 2)
  .map((category) => `  #   - "${category}"`)
  .join('\n')}

  # Include tools from these bundled MCP servers (uncomment and adjust as needed)
  # includeMCPs:
${bundledMcps
  .map(
    (bundled) =>
      `  #   - "${bundled.name}"`.padEnd(30) + `# ${bundled.tools.length} tools available`,
  )
  .join('\n')}

# AVAILABLE CATEGORIES:
${categories.map((category) => `# - "${category}"`).join('\n')}

# AVAILABLE TOOLS:
${tools.map((tool) => `# - ${tool.id} (${tool.name}): ${tool.description.substring(0, 60)}${tool.description.length > 60 ? '...' : ''}`).join('\n')}

# AVAILABLE BUNDLED MCPs:
${bundledMcps.map((bundled) => `# - ${bundled.name} (v${bundled.version}): ${bundled.tools.length} tools available`).join('\n')}
`;

    // Determine where to save the config file
    let targetPath: string;
    if (outputPath) {
      targetPath = path.resolve(outputPath);
    } else {
      // Default to YAML format in the .qnscmcp directory
      const homedir = os.homedir();
      const qnscmcpDir = path.join(homedir, '.qnscmcp');

      // Create directory if it doesn't exist
      if (!fs.existsSync(qnscmcpDir)) {
        fs.mkdirSync(qnscmcpDir, { recursive: true });
      }

      targetPath = path.join(qnscmcpDir, 'config.yaml');
    }

    // Check if file already exists and force flag is not present
    if (
      fs.existsSync(targetPath) &&
      !process.argv.includes('--force') &&
      !process.argv.includes('-f')
    ) {
      console.log(`⚠️  Configuration file already exists at ${targetPath}`);
      console.log('To overwrite, use --force or -f flag');
      return;
    }

    // Write the file
    fs.writeFileSync(targetPath, yamlConfig, 'utf8');

    console.log(`✅ Created configuration file at: ${targetPath}`);
    console.log('Edit this file to customize which tools are available to Claude');
    console.log('\nTo use this configuration:');
    console.log('1. Uncomment and modify the sections you want to use');
    console.log('2. Run qnsc-mcp with this configuration using:');
    console.log(`   qnsc-mcp --config ${targetPath}`);
    console.log(
      '\nNote: You only need to supply the config flag if you want to use a config outside of your home directory, the current directory or you have a custom name for your config file.',
    );
    console.log('\nTo see which tools will be available with your configuration:');
    console.log('   qnsc-mcp list-tools --filtered');
  } catch (error) {
    displayError('Error generating configuration', error);
    process.exit(1);
  }
}
