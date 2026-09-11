/**
 * ConfigGenerator.js
 * 
 * Manages configuration generation for YAML and MCP formats.
 * Handles environment variable collection and format-specific transformations.
 */

import { getParentCategory } from './UtilityHelpers.js';

/**
 * ConfigGenerator class - generates configuration in various formats
 */
export class ConfigGenerator {
  constructor(stateManager) {
    this._stateManager = stateManager;
  }

  /**
   * Generate YAML configuration
   * @returns {string} YAML configuration string
   */
  generateYaml() {
    try {
      let yaml = '# QNSC MCP Configuration\n\n';

      const currentConfig = this._stateManager.getCurrentConfig();

      const { logging } = currentConfig;
      yaml += 'logging:\n';
      yaml += `  enabled: ${logging.enabled}\n`;
      yaml += `  level: ${logging.level}\n`;
      yaml += `  maxSize: ${logging.maxSize}\n`;
      yaml += `  maxFiles: ${logging.maxFiles}\n\n`;

      yaml += '# HOW FILTERING WORKS:\n';
      yaml += '# Tools are included if they match ANY of these conditions:\n';
      yaml += '#   - Listed in "include" (supports glob patterns like "github-*")\n';
      yaml += '#   - Their category is in "includeCategories"\n';
      yaml += '#   - They have includeByDefault: true (for core/essential tools)\n';
      yaml += '#\n';
      yaml += '# Tools are excluded if they match ANY of these conditions:\n';
      yaml += '#   - Listed in "exclude" (supports glob patterns)\n';
      yaml += '#   - Their category is in "excludeCategories"\n';
      yaml += '#\n';
      yaml += '# IMPORTANT: Exclusions always take precedence over inclusions.\n';
      yaml += '# TIP: You can use both "include" and "includeCategories" together (union/OR).\n\n';

      yaml += '# Tools configuration\n';
      yaml += 'tools:\n';
      
      const {
        include,
        exclude,
        includeCategories,
        excludeCategories,
        includeMCPs,
        includeRemoteMCPs,
        includeLocalMCPs
      } = currentConfig.tools;
      
      yaml += '  # Include specific tools (supports glob patterns)\n';
      if (include && include.length > 0) {
        yaml += '  include:\n';
        include.forEach((toolId) => {
          // Escape backslashes for Windows paths in YAML
          const escapedToolId = toolId.replace(/\\/g, '\\\\');
          yaml += `    - "${escapedToolId}"\n`;
        });
        yaml += '\n';
      } else {
        yaml += '  # include:\n';
      }

      yaml += '  # Exclude specific tools (takes precedence over include)\n';
      if (exclude && exclude.length > 0) {
        yaml += '  exclude:\n';
        exclude.forEach((toolId) => {
          // Escape backslashes for Windows paths in YAML
          const escapedToolId = toolId.replace(/\\/g, '\\\\');
          yaml += `    - "${escapedToolId}"\n`;
        });
        yaml += '\n';
      } else {
        yaml += '  # exclude:\n';
      }

      yaml += '  # Include tools by category (works with include as union/OR)\n';
      if (includeCategories && includeCategories.length > 0) {
        yaml += '  includeCategories:\n';
        [...includeCategories].sort().forEach((category) => {
          // Escape backslashes for Windows paths in YAML
          const escapedCategory = category.replace(/\\/g, '\\\\');
          yaml += `    - "${escapedCategory}"\n`;
        });
        yaml += '\n';
      } else {
        yaml += '  # includeCategories:\n';
      }

      yaml += '  # Exclude tools by category (takes precedence)\n';
      if (excludeCategories && excludeCategories.length > 0) {
        yaml += '  excludeCategories:\n';
        excludeCategories.forEach((category) => {
          // Escape backslashes for Windows paths in YAML
          const escapedCategory = category.replace(/\\/g, '\\\\');
          yaml += `    - "${escapedCategory}"\n`;
        });
        yaml += '\n';
      } else {
        yaml += '  # excludeCategories:\n';
      }
      
      yaml += '  # Only include tools from these bundled MCP servers\n';
      if (includeMCPs && includeMCPs.length > 0) {
        yaml += '  includeMCPs:\n';
        [...includeMCPs].sort().forEach((mcp) => {
          // Escape backslashes for Windows paths in YAML
          const escapedMcp = mcp.replace(/\\/g, '\\\\');
          yaml += `    - "${escapedMcp}"\n`;
        });
        yaml += '\n';
      } else {
        yaml += '  # includeMCPs:\n';
      }

      yaml += '  # Only include tools from these remote MCP servers\n';
      if (includeRemoteMCPs && includeRemoteMCPs.length > 0) {
        yaml += '  includeRemoteMCPs:\n';
        [...includeRemoteMCPs].sort().forEach((remoteMcp) => {
          // Escape backslashes for Windows paths in YAML
          const escapedRemoteMcp = remoteMcp.replace(/\\/g, '\\\\');
          yaml += `    - "${escapedRemoteMcp}"\n`;
        });
        yaml += '\n';
      } else {
        yaml += '  # includeRemoteMCPs:\n';
      }

      yaml += '  # Only include tools from these local MCP servers\n';
      if (includeLocalMCPs && includeLocalMCPs.length > 0) {
        yaml += '  includeLocalMCPs:\n';
        [...includeLocalMCPs].sort().forEach((localMcp) => {
          // Escape backslashes for Windows paths in YAML
          const escapedLocalMcp = localMcp.replace(/\\/g, '\\\\');
          yaml += `    - "${escapedLocalMcp}"\n`;
        });
        yaml += '\n';
      } else {
        yaml += '  # includeLocalMCPs:\n';
      }

      // Handle mcpArgs section if present
      const { mcpArgs } = currentConfig.tools;
      if (mcpArgs && Object.keys(mcpArgs).length > 0) {
        yaml += '\n  # CLI arguments for MCP servers\n';
        yaml += '  mcpArgs:\n';
        Object.keys(mcpArgs).sort().forEach((mcpName) => {
          const args = mcpArgs[mcpName];
          if (args && args.length > 0) {
            yaml += `    ${mcpName}:\n`;
            args.forEach((arg) => {
              // Escape backslashes for Windows paths in YAML
              const escapedArg = arg.replace(/\\/g, '\\\\');
              yaml += `      - "${escapedArg}"\n`;
            });
          }
        });
      }

      // Handle prompts section if present
      const { prompts } = currentConfig;
      if (prompts && prompts.repositories && prompts.repositories.length > 0) {
        yaml += '\n# Prompt repositories configuration\n';
        yaml += 'prompts:\n';
        yaml += '  repositories:\n';
        prompts.repositories.forEach((repo) => {
          yaml += `    - type: "${repo.type || 'remote'}"\n`;
          // Escape backslashes for Windows paths in YAML
          const escapedRepo = repo.repo.replace(/\\/g, '\\\\');
          yaml += `      repo: "${escapedRepo}"\n`;
          if (repo.branch) {
            const escapedBranch = repo.branch.replace(/\\/g, '\\\\');
            yaml += `      branch: "${escapedBranch}"\n`;
          }
          if (repo.include && repo.include.length > 0) {
            yaml += `      include:\n`;
            repo.include.forEach((pattern) => {
              // Escape backslashes for Windows paths in YAML
              const escapedPattern = pattern.replace(/\\/g, '\\\\');
              yaml += `        - "${escapedPattern}"\n`;
            });
          }
        });
      }
      
      // Handle knowledgeGraph section if present
      const { knowledgeGraph } = currentConfig;
      if (knowledgeGraph && knowledgeGraph.filePath) {
        yaml += '\n# Knowledge graph configuration\n';
        yaml += 'knowledgeGraph:\n';
        // Escape backslashes for Windows paths in YAML
        const escapedPath = knowledgeGraph.filePath.replace(/\\/g, '\\\\');
        yaml += `  filePath: "${escapedPath}"\n`;
      }
      
      return yaml;
    } catch (error) {
      console.error('ConfigGenerator: Error generating YAML:', error);
      return 'Error generating YAML configuration';
    }
  }

  /**
   * Generate MCP configuration for specific format
   * @param {string} format - Configuration format (claude-code, copilot-cli, visual-studio-code, etc.)
   * @returns {string} JSON configuration string
   */
  generateMcpConfig(format) {
    try {
      const envVars = this.collectEnvironmentVariables();
      
      let config;
      if (format === 'claude-code') {
        config = this._generateCommonConfig(envVars);
      } else if (format === 'copilot-cli') {
        config = this._generateCommonConfig(envVars);
        config.mcpServers['qnsc-mcp'].type = 'local';
        config.mcpServers['qnsc-mcp']['tools'] = ['*'];
      } else if (format === 'intellij-ides' || format === 'xcode') {
        config = this._generateCommonConfig(envVars);
        config['servers'] = config['mcpServers'];
        delete config['mcpServers'];
      } else if (format === 'visual-studio-code') {
        config = this._generateVSCodeConfig(envVars);
      } else {
        config = {};
      }
      
      return JSON.stringify(config, null, 2).replace(
        '"[existing servers]": "[existing servers]"',
        '[existing servers]'
      );
    } catch (error) {
      console.error('ConfigGenerator: Error generating MCP config:', error);
      return '{}';
    }
  }

  /**
   * Collect environment variables from active tools/MCPs
   * @returns {Array<Object>} Array of environment variable objects
   */
  collectEnvironmentVariables() {
    const envVarsMap = new Map();
    const mcps = this._stateManager.getMcps();
    const currentConfig = this._stateManager.getCurrentConfig();
    
    // Collect from all active MCPs
    mcps.forEach(mcp => {
      let isActive = false;
      
      if (mcp.provider === 'native') {
        // Check if any tools are enabled
        isActive = mcp.tools.some(tool => {
          const category = tool.category;
          const parentCategory = getParentCategory(category);
          const include = currentConfig.tools?.include || [];
          const exclude = currentConfig.tools?.exclude || [];
          const includeCategories = currentConfig.tools?.includeCategories || [];
          const excludeCategories = currentConfig.tools?.excludeCategories || [];

          // Check if tool is explicitly excluded (exclusions take precedence)
          if (exclude.includes(tool.id) ||
              excludeCategories.includes(category) ||
              excludeCategories.includes(parentCategory)) {
            return false;
          }

          // Check if tool is explicitly included
          if (include.includes(tool.id)) {
            return true;
          }

          // Check if category or parent category is in includeCategories
          const isCategoryIncluded = includeCategories.includes(category) ||
                                     includeCategories.includes(parentCategory);

          // If includeCategories is specified, only include tools in those categories
          if (includeCategories.length > 0) {
            return isCategoryIncluded;
          }

          // If no specific inclusions specified, include all tools by default
          // (unless excluded, which we already checked above)
          return true;
        });
      } else if (mcp.provider === 'bundled') {
        isActive = currentConfig.tools?.includeMCPs?.includes(mcp.name);
      } else if (mcp.provider === 'remote') {
        isActive = currentConfig.tools?.includeRemoteMCPs?.includes(mcp.id);
      } else if (mcp.provider === 'local') {
        isActive = currentConfig.tools?.includeLocalMCPs?.includes(mcp.id);
      }
      
      if (isActive && mcp.envVars) {
        mcp.envVars.forEach(envVar => {
          const key = envVar.key || envVar.name || envVar;
          if (!envVarsMap.has(key)) {
            envVarsMap.set(key, {
              name: key,
              description: envVar.description || `Environment variable for ${mcp.name}`,
              required: envVar.required !== undefined ? envVar.required : true
            });
          }
        });
      }
    });
    
    return Array.from(envVarsMap.values());
  }

  /**
   * Generate common config format (Claude Code, Copilot CLI, etc.)
   * @private
   * @param {Array<Object>} envVars - Environment variables
   * @returns {Object} Configuration object
   */
  _generateCommonConfig(envVars) {
    const config = {
      mcpServers: {
        'qnsc-mcp': {
          type: 'stdio',
          command: 'qnsc-mcp',
          args: [],
          env: {}
        }
      }
    };
    
    envVars.forEach((envVar) => {
      config.mcpServers['qnsc-mcp'].env[envVar.name] = '';
    });
    
    config.mcpServers['[existing servers]'] = '[existing servers]';
    
    return config;
  }

  /**
   * Generate VS Code config format
   * @private
   * @param {Array<Object>} envVars - Environment variables
   * @returns {Object} Configuration object
   */
  _generateVSCodeConfig(envVars) {
    const config = {
      servers: {
        'qnsc-mcp': {
          type: 'stdio',
          command: 'qnsc-mcp',
          env: {}
        }
      },
      inputs: []
    };
    
    envVars.forEach((envVar) => {
      const inputId = `qnsc_mcp_${envVar.name.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
      config.servers['qnsc-mcp'].env[envVar.name] = `\${input:${inputId}}`;
      
      config.inputs.push({
        type: 'promptString',
        id: inputId,
        description: envVar.description || envVar.name,
        password:
          envVar.name.toLowerCase().includes('token') ||
          envVar.name.toLowerCase().includes('secret') ||
          envVar.name.toLowerCase().includes('password')
      });
    });
    
    config.servers['[existing servers]'] = '[existing servers]';
    
    return config;
  }

  /**
   * Generate configuration instructions for specific format
   * @param {string} format - Configuration format
   * @returns {string} HTML instructions
   */
  generateConfigInstructions(format) {
    let instructionsHtml = '';
    
    if (format === 'claude-code') {
      instructionsHtml = `
        <h4>Claude Code Configuration</h4>
        <p>To configure QNSC MCP Tools for Claude Code, update your Claude configuration file:</p>
        <div class="file-path">~/.claude.json</div>
        <ol>
          <li>Open your Claude configuration file at the path shown above</li>
          <li>Update the <code>mcpServers</code> section with the configuration from the preview above</li>
          <li>Configure the required environment variables in the <code>env</code> section</li>
        </ol>
      `;
    } else if (format === 'copilot-cli') {
      instructionsHtml = `
        <h4>GitHub Copilot CLI Configuration</h4>
        <p>To configure QNSC MCP Tools for GitHub Copilot CLI:</p>
        <div class="file-path">~/.copilot/mcp-config.json</div>
        <ol>
          <li>Open your Copilot CLI configuration file at the path shown above</li>
          <li>Update the <code>mcpServers</code> section with the configuration from the preview above</li>
          <li>Configure the required environment variables in the <code>env</code> section</li>
        </ol>
      `;
    } else if (format === 'visual-studio-code') {
      instructionsHtml = `
        <h4>Visual Studio Code Configuration</h4>
        <p>To configure QNSC MCP Tools for Visual Studio Code:</p>
        <ol>
          <li>Open VS Code and press <code>Ctrl+Shift+P</code> (or <code>Cmd+Shift+P</code> on Mac)</li>
          <li>Type and select <code>MCP: Open User Configuration</code></li>
          <li>Add the configuration from the preview above</li>
          <li>The inputs will prompt you for values when the MCP server starts</li>
        </ol>
      `;
    } else if (format === 'intellij-ides') {
      instructionsHtml = `
        <h4>IntelliJ IDEA & JetBrains IDEs Configuration</h4>
        <p>To configure QNSC MCP Tools for IntelliJ IDEA or other JetBrains IDEs:</p>
        <div class="file-path">~/.config/intellij-mcp/config.json</div>
        <ol>
          <li>Open the MCP configuration file for your IDE</li>
          <li>Update the <code>servers</code> section with the configuration from the preview above</li>
          <li>Configure the required environment variables in the <code>env</code> section</li>
          <li>Restart your IDE to apply the changes</li>
        </ol>
      `;
    } else if (format === 'xcode') {
      instructionsHtml = `
        <h4>Xcode Configuration</h4>
        <p>To configure QNSC MCP Tools for Xcode:</p>
        <div class="file-path">~/Library/Application Support/Xcode/mcp-config.json</div>
        <ol>
          <li>Open the MCP configuration file for Xcode</li>
          <li>Update the <code>servers</code> section with the configuration from the preview above</li>
          <li>Configure the required environment variables in the <code>env</code> section</li>
          <li>Restart Xcode to apply the changes</li>
        </ol>
      `;
    } else {
      instructionsHtml = `
        <h4>Configuration Instructions</h4>
        <p>Please select a configuration format to see specific instructions.</p>
      `;
    }
    
    return instructionsHtml;
  }
}

/**
 * Factory function to create ConfigGenerator with stateManager
 * @param {Object} stateManager - StateManager instance
 * @returns {ConfigGenerator} ConfigGenerator instance
 */
export function createConfigGenerator(stateManager) {
  return new ConfigGenerator(stateManager);
}
