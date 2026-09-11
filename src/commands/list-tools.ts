import chalk from 'chalk';
import { z } from 'zod';
import { loadConfig } from '../config';
import { BUNDLED_TOOL_DELIMITER } from '../gateway/bundled-mcp-manager';
import { LOCAL_TOOL_DELIMITER } from '../gateway/local-mcp-client';
import { LocalMCPManager } from '../gateway/local-mcp-manager';
import { REMOTE_TOOL_DELIMITER, REMOTE_TOOL_ID_PREFIX } from '../gateway/remote-mcp-client';
import { RemoteMCPManager } from '../gateway/remote-mcp-manager';
import { displayError, displayHeader, writeJsonOutput } from '../lib/display';
import { registry, ToolConfig } from '../registry';
import { BUNDLED_CATEGORY, LOCAL_CATEGORY, REMOTE_CATEGORY } from '../registry/types';
import { notifyIfUpdateAvailable } from '../utils/update-utils';
import { initializeBundledMCPs } from './bundled-mcp';
import { initializeLocalMCPs } from './local-mcp';
import { initializeRemoteMCPs } from './remote-mcp';

/**
 * Clean description by removing markdown and limiting length
 * @param description The description to clean
 * @param maxLength Maximum length for the description
 * @returns Cleaned description
 */
export function cleanDescription(description: string, maxLength: number = 120): string {
  if (!description) return '';

  // Replace markdown links with just their text content
  let clean = description.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');

  // Remove markdown code blocks
  clean = clean.replace(/```[\s\S]*?```/g, '');

  // Remove inline code blocks
  clean = clean.replace(/`([^`]+)`/g, '$1');

  // Remove other common markdown syntax
  clean = clean
    .replace(/[*_~#]+/g, '') // Remove emphasis and headers
    .replace(/\n+/g, ' ') // Replace newlines with spaces
    .replace(/\s+/g, ' ') // Normalize whitespace
    .replace(/\*\*/g, '') // Remove bold markers
    .replace(/\*/g, '') // Remove italic markers
    .trim(); // Trim extra whitespace

  // Limit length and add ellipsis if needed
  if (clean.length > maxLength) {
    return clean.substring(0, maxLength - 3) + '...';
  }

  return clean;
}

/**
 * Write JSON output to stdout and wait for it to be flushed
 */
async function dumpToolJson(tools: ToolConfig[], showFiltered: boolean): Promise<void> {
  const output: any = {
    tools: tools.map((tool) => {
      const params = z.toJSONSchema(tool.parameters, {
        unrepresentable: 'any',
      });
      return {
        name: tool.name,
        id: tool.id,
        description: tool.description,
        category: tool.category,
        parameters:
          params && typeof params === 'object' && 'properties' in params
            ? params.properties
            : undefined,
        ...(tool.envVars && tool.envVars.length > 0 ? { envVars: tool.envVars } : {}),
        ...(tool.optionalEnvVars && tool.optionalEnvVars.length > 0
          ? { optionalEnvVars: tool.optionalEnvVars }
          : {}),
        provider: tool.provider ?? 'native',
      };
    }),
    totalCount: tools.length,
  };

  if (showFiltered) {
    const config = loadConfig();
    output.filterConfig = config.tools || null;
  }

  await writeJsonOutput(output);
}

/**
 * List all registered tools command
 */
export async function listTools(): Promise<void> {
  // Check if --filtered flag is provided
  const showFiltered = process.argv.includes('--filtered');
  const outputJson = process.argv.includes('--json');
  const nativeOnly = process.argv.includes('--native');
  let remoteMCPManager: RemoteMCPManager | null = null;
  let localMCPManager: LocalMCPManager | null = null;
  try {
    // Load configuration first
    const config = loadConfig();

    // Initialize the registry to discover tools
    await registry.initialize();
    if (!nativeOnly) {
      await initializeBundledMCPs(registry);
      remoteMCPManager = await initializeRemoteMCPs(config, registry);
      localMCPManager = await initializeLocalMCPs(config, registry);
    }
    const tools = registry.getAllTools(showFiltered);
    const categories = registry.getCategories(showFiltered);

    if (outputJson) {
      await dumpToolJson(tools, showFiltered);
      return;
    }

    displayHeader();

    const label = nativeOnly ? ' (Native Only)' : showFiltered ? ' (Filtered by Config)' : '';
    console.log(
      `📋 Available Tools${label}: ${tools.length} tool(s) in ${categories.length} categories\n`,
    );
    console.log(`Using configuration: ${config.source || 'default'}`);

    // Group tools by category
    const toolsByCategory: Record<string, typeof tools> = {};
    const bundledPrefix = BUNDLED_CATEGORY;
    const remotePrefix = REMOTE_CATEGORY;
    const localPrefix = LOCAL_CATEGORY;
    categories.forEach((category) => {
      const categoryTools = registry.getToolsByCategory(category, showFiltered);

      if (category === bundledPrefix || category === remotePrefix || category === localPrefix) {
        // Further group bundled/remote/local tools by their source MCP
        const toolsByMCP: Record<string, typeof tools> = {};

        // Group tools by their source MCP based on their ID
        categoryTools.forEach((tool) => {
          // For bundled MCPs, the tool ID format is: mcpName{BUNDLED_TOOL_DELIMITER}toolName
          // For remote MCPs, we look for the pattern: remote-{serverName}-{toolName}
          // For local MCPs, the tool ID format is: local-{serverId}-{toolName}
          let sourceMCP = 'Unknown MCP';

          if (tool.id.includes(BUNDLED_TOOL_DELIMITER)) {
            sourceMCP = tool.id.split(BUNDLED_TOOL_DELIMITER)[0];
          } else if (
            tool.id.startsWith(REMOTE_TOOL_ID_PREFIX) &&
            tool.name.includes(REMOTE_TOOL_DELIMITER)
          ) {
            // Remote MCP tool: extract server name from tool name (server__tool format)
            sourceMCP = tool.name.split(REMOTE_TOOL_DELIMITER)[0];
          } else if (tool.id.startsWith('local-') && tool.name.includes(LOCAL_TOOL_DELIMITER)) {
            // Local MCP tool: extract server name from tool name (server__tool format)
            sourceMCP = tool.name.split(LOCAL_TOOL_DELIMITER)[0];
          }

          if (!toolsByMCP[sourceMCP]) {
            toolsByMCP[sourceMCP] = [];
          }
          toolsByMCP[sourceMCP].push(tool);
        });

        // Create a separate category for each MCP
        Object.entries(toolsByMCP).forEach(([mcpName, mcpTools]) => {
          const prefix =
            category === bundledPrefix
              ? bundledPrefix
              : category === remotePrefix
                ? remotePrefix
                : localPrefix;
          toolsByCategory[`${prefix} ${mcpName}`] = mcpTools;
        });
      } else {
        toolsByCategory[category] = categoryTools;
      }
    });

    // Display tools by category
    Object.entries(toolsByCategory)
      .sort(([a], [b]) => {
        const isBundledA = a.startsWith(bundledPrefix);
        const isBundledB = b.startsWith(bundledPrefix);

        if (isBundledA && !isBundledB) return 1;
        if (!isBundledA && isBundledB) return -1;

        return a.localeCompare(b); // Sort alphabetically otherwise
      })
      .forEach(([category, categoryTools]) => {
        console.log(chalk.bold(chalk.cyan(`\n${category} (${categoryTools.length}):`))); // Bold cyan color
        console.log(chalk.cyan('─'.repeat(category.length + 4))); // Cyan separator

        // Display each tool in the category
        categoryTools
          .sort((a, b) => a.name.localeCompare(b.name)) // Sort tools alphabetically
          .forEach((tool) => {
            // Strip the source prefix so only the vendor's own tool name is shown.
            //
            // Everything after the FIRST delimiter is kept, because a vendor's tool
            // name may itself contain the delimiter: AWS Knowledge exposes
            // `aws___read_documentation`, so the registered name is
            // `aws-knowledge-mcp-server__aws___read_documentation`. Splitting and
            // taking index 1 returned just "aws" for all five of its tools.
            const afterFirst = (value: string, delimiter: string): string => {
              const at = value.indexOf(delimiter);
              return at === -1 ? value : value.slice(at + delimiter.length) || value;
            };

            let displayName = tool.name;

            if (category.startsWith(bundledPrefix) && tool.id.includes(BUNDLED_TOOL_DELIMITER)) {
              displayName = afterFirst(tool.id, BUNDLED_TOOL_DELIMITER);
            } else if (tool.name.includes(REMOTE_TOOL_DELIMITER)) {
              displayName = afterFirst(tool.name, REMOTE_TOOL_DELIMITER);
            } else if (
              category.startsWith(localPrefix) &&
              tool.name.includes(LOCAL_TOOL_DELIMITER)
            ) {
              displayName = afterFirst(tool.name, LOCAL_TOOL_DELIMITER);
            }

            console.log(
              `• ${chalk.bold(chalk.greenBright(displayName))}${tool.version ? ` ${chalk.dim(`(v${tool.version})`)}` : ''}`,
            );

            console.log(`  ${cleanDescription(tool.description)}`);
          });
      });

    console.log('\n');

    // Show configuration info if filtered
    if (showFiltered) {
      const config = loadConfig();
      if (config.tools) {
        console.log('⚙️  Active Configuration:');
        if (config.tools.include) console.log(`  Including: ${config.tools.include.join(', ')}`);
        if (config.tools.exclude) console.log(`  Excluding: ${config.tools.exclude.join(', ')}`);
        if (config.tools.includeCategories)
          console.log(`  Including Categories: ${config.tools.includeCategories.join(', ')}`);
        if (config.tools.excludeCategories)
          console.log(`  Excluding Categories: ${config.tools.excludeCategories.join(', ')}`);
        if (config.tools.includeMCPs)
          console.log(`  Including Bundled MCPs: ${config.tools.includeMCPs.join(', ')}`);
        if (config.tools.includeRemoteMCPs)
          console.log(`  Including Remote MCPs: ${config.tools.includeRemoteMCPs.join(', ')}`);
        if (config.tools.includeLocalMCPs)
          console.log(`  Including Local MCPs: ${config.tools.includeLocalMCPs.join(', ')}`);

        // Warn if both include and includeCategories are populated
        if (
          config.tools.include &&
          config.tools.include.length > 0 &&
          config.tools.includeCategories &&
          config.tools.includeCategories.length > 0
        ) {
          console.log(
            `\n${chalk.yellow('ℹ️  Note:')} Both 'include' and 'includeCategories' are specified.`,
          );
          console.log(
            `   Tools matching ${chalk.bold('either')} condition will be included (union/OR logic).`,
          );
          console.log(`   Tools in 'exclude' will still be excluded regardless.`);
        }
      }
    }

    // Help message for configuration
    console.log(`💡 Tip: Create a .qnscmcp.yaml file to customize available tools`);
    console.log(`   To see filtered tools only, use the --filtered flag`);

    // Run a silent update check at the end
    try {
      await notifyIfUpdateAvailable();
    } catch {
      // Silently ignore any errors from the update check
    }
  } catch (error) {
    displayError('Error listing tools', error);
    process.exit(1);
  } finally {
    // Clean up remote connections
    if (remoteMCPManager) {
      await remoteMCPManager.disconnect();
    }
    if (localMCPManager) {
      await localMCPManager.disconnect();
    }
  }
}
