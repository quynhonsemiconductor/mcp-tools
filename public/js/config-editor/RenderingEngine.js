/**
 * RenderingEngine.js
 * 
 * Handles all UI rendering logic for the config editor.
 * Generates HTML and updates DOM elements based on state.
 */

import { escapeHtml, getCategoryTristate, getParentCategory, getToolTristate, groupToolsByCategory } from './UtilityHelpers.js';

/**
 * RenderingEngine class
 * Centralizes all rendering operations
 */
class RenderingEngine {
  /**
   * @param {Object} stateManager - Reference to state manager
   * @param {Object} domManager - Reference to DOM manager
   * @param {Object} configGenerator - Reference to config generator
   */
  constructor(stateManager, domManager, configGenerator) {
    this.stateManager = stateManager;
    this.domManager = domManager;
    this.configGenerator = configGenerator;
  }

  /**
   * Render all MCPs in their respective tabs
   */
  renderAllMcps() {
    const mcps = this.stateManager.getMcps();
    
    // Separate MCPs by provider type
    const nativeMcps = mcps.filter(m => m.provider === 'native');
    const bundledMcps = mcps.filter(m => m.provider === 'bundled');
    const remoteMcps = mcps.filter(m => m.provider === 'remote');
    const localMcps = mcps.filter(m => m.provider === 'local');
    
    // Render native tools as categories
    if (nativeMcps && nativeMcps.length > 0) {
      this.renderNativeCategories(nativeMcps);
    }
    
    // Render bundled MCPs
    this.renderMcpsList(bundledMcps, 'bundled', this.domManager.mcpServersList);
    
    // Render remote MCPs
    this.renderMcpsList(remoteMcps, 'remote', this.domManager.remoteMcpServersList);
    
    // Render local MCPs
    this.renderMcpsList(localMcps, 'local', this.domManager.localMcpServersList);
  }

  /**
   * Render native tools as categories
   * @param {Array} nativeMcps - Array of native MCP objects
   */
  renderNativeCategories(nativeMcps) {
    const container = this.domManager.categoriesList;
    if (!container || !nativeMcps || nativeMcps.length === 0) {
      if (container) {
        container.innerHTML = '<p>No native tools found.</p>';
      }
      return;
    }
    
    const html = this._generateNativeCategoriesHtml(nativeMcps);
    container.innerHTML = html;
  }

  /**
   * Generate HTML for native categories
   * @private
   */
  _generateNativeCategoriesHtml(nativeMcps) {
    const config = this.stateManager.getCurrentConfig();
    const selectedMcp = this.stateManager.getSelectedMcp();
    const selectedProvider = this.stateManager.getSelectedProvider();
    
    // Collect all tools from all native MCPs
    const allTools = nativeMcps.flatMap(mcp => mcp.tools || []);
    
    // Group tools by category
    const groupedByCategory = groupToolsByCategory(allTools);
    
    // Further group by parent category
    const parentCategories = {};
    for (const category of Object.keys(groupedByCategory)) {
      const parentCategory = getParentCategory(category);
      if (!parentCategories[parentCategory]) {
        parentCategories[parentCategory] = {};
      }
      parentCategories[parentCategory][category] = groupedByCategory[category];
    }
    
    const categories = Object.keys(parentCategories).sort();
    
    return categories.map((parentCategory) => {
      const subCategories = parentCategories[parentCategory];
      const allTools = Object.values(subCategories).flat();
      
      // For single category (no sub-categories), use the original category name
      const isSingleCategory = Object.keys(subCategories).length === 1;
      const displayCategory = isSingleCategory ? Object.keys(subCategories)[0] : parentCategory;
      
      // Check if any sub-category or tool is included/excluded
      const hasIncludedCategories = Object.keys(subCategories).some(cat =>
        config.tools?.includeCategories?.includes(cat)
      );
      const hasExcludedCategories = Object.keys(subCategories).some(cat =>
        config.tools?.excludeCategories?.includes(cat)
      );
      const hasIndividuallyIncludedTools = allTools.some((tool) =>
        config.tools?.include?.includes(tool.id)
      );
      const hasIndividuallyExcludedTools = allTools.some((tool) =>
        config.tools?.exclude?.includes(tool.id)
      );
      
      const shouldBeIndeterminate =
        (hasIncludedCategories && (hasExcludedCategories || hasIndividuallyExcludedTools)) ||
        (!hasIncludedCategories && hasIndividuallyIncludedTools);
      
      let checked = shouldBeIndeterminate
        ? false
        : config.tools?.includeCategories?.length
          ? hasIncludedCategories
          : false;
      
      const indeterminateClass = shouldBeIndeterminate ? 'indeterminate-init' : '';
      const isActive = displayCategory === selectedMcp && selectedProvider === 'native';
      
      return `
        <div class="category-item ${isActive ? 'active' : ''}" data-category="${displayCategory}" data-parent-category="${parentCategory}" data-provider="native">
          <span class="category-name">${escapeHtml(displayCategory)}</span>
          <div class="category-toggle">
            <label class="toggle-switch">
              <input type="checkbox" class="category-checkbox ${indeterminateClass}" data-category="${displayCategory}" data-parent-category="${parentCategory}" ${checked ? 'checked' : ''}>
              <span class="toggle-slider"></span>
            </label>
          </div>
        </div>
      `;
    }).join('');
  }

  /**
   * Render MCPs list for bundled, remote, or local providers
   * @param {Array} mcps - Array of MCP objects
   * @param {string} provider - Provider type
   * @param {HTMLElement} container - DOM container element
   */
  renderMcpsList(mcps, provider, container) {
    if (!container) return;
    
    if (!mcps || mcps.length === 0) {
      container.innerHTML = `<p>No ${provider} MCP servers found.</p>`;
      return;
    }
    
    const html = this._generateMcpsListHtml(mcps, provider);
    container.innerHTML = html;
  }

  /**
   * Generate HTML for MCPs list
   * @private
   */
  _generateMcpsListHtml(mcps, provider) {
    const config = this.stateManager.getCurrentConfig();
    const selectedMcp = this.stateManager.getSelectedMcp();
    const selectedProvider = this.stateManager.getSelectedProvider();
    
    const sortedMcps = [...mcps].sort((a, b) => a.name.localeCompare(b.name));
    
    return sortedMcps.map((mcp) => {
      const configField = provider === 'bundled' ? 'includeMCPs' : 
                          provider === 'remote' ? 'includeRemoteMCPs' :
                          'includeLocalMCPs';
      
      const isIncluded = config.tools?.[configField]?.includes(mcp.id || mcp.name);
      const isActive = mcp.id === selectedMcp && selectedProvider === provider;
      
      // Check for individually included/excluded tools
      const tools = mcp.tools || [];
      const hasIndividuallyIncludedTools = tools.some((tool) =>
        config.tools?.include?.includes(tool.id)
      );
      const hasIndividuallyExcludedTools = tools.some((tool) =>
        config.tools?.exclude?.includes(tool.id)
      );
      
      const shouldBeIndeterminate =
        (isIncluded && hasIndividuallyExcludedTools) ||
        (!isIncluded && hasIndividuallyIncludedTools);
      
      let checked = shouldBeIndeterminate ? false : isIncluded || mcp.enabled;
      const indeterminateClass = shouldBeIndeterminate ? 'indeterminate-init' : '';
      
      // Build display based on provider type
      let displayHtml = '';
      if (provider === 'bundled') {
        displayHtml = `
          <div class="mcp-info">
            <span class="mcp-name">${escapeHtml(mcp.displayName)}</span>
            <span class="mcp-version">${escapeHtml(mcp.version || '')}</span>
          </div>
        `;
      } else {
        const statusClass = `status-${mcp.connected ? 'connected' : 'disconnected'}`;
        const showError = provider === 'local' && mcp.enabled && !mcp.connected;
        const errorIcon = showError ? `<span class="mcp-error-icon" title="Enabled but not connected — check the server configuration or logs" aria-label="Enabled but not connected">⚠️</span>` : '';
        displayHtml = `
          <div class="mcp-info">
            <span class="mcp-name">${escapeHtml(mcp.displayName)}</span>
            <div class="mcp-status">
              ${errorIcon}<span class="status-indicator ${statusClass}"></span>
            </div>
          </div>
        `;
      }
      
      return `
        <div class="mcp-item ${isActive ? 'active' : ''}" data-mcp="${mcp.id || mcp.name}" data-provider="${provider}">
          ${displayHtml}
          <div class="mcp-toggle">
            <label class="toggle-switch">
              <input type="checkbox" class="mcp-checkbox ${indeterminateClass}" data-mcp="${mcp.id || mcp.name}" data-provider="${provider}" ${checked ? 'checked' : ''}>
              <span class="toggle-slider"></span>
            </label>
          </div>
        </div>
      `;
    }).join('');
  }

  /**
   * Render tools editor for native category
   * @param {string} category - Category name
   * @param {Array} tools - Array of tool objects
   */
  renderToolsEditor(category, tools) {
    const container = this.domManager.toolsConfigList;
    if (!container) return;
    
    if (!tools || tools.length === 0) {
      container.innerHTML = '<p>No tools found in this category.</p>';
      return;
    }
    
    const html = this._generateToolsEditorHtml(tools, true);
    container.innerHTML = html;
  }

  /**
   * Render MCP tools with category grouping
   * @param {string} mcpId - MCP identifier
   * @param {string} provider - Provider type
   * @param {Array} tools - Array of tool objects
   */
  renderMcpTools(mcpId, provider, tools) {
    const container = this.domManager.mcpToolsList;
    if (!container) return;
    
    if (!tools || tools.length === 0) {
      container.innerHTML = '<p>No tools found in this MCP server.</p>';
      return;
    }
    
    const html = this._generateToolsEditorHtml(tools, false, mcpId);
    container.innerHTML = html;
  }

  /**
   * Generate HTML for tools editor (shared by native and MCP tools)
   * @private
   */
  _generateToolsEditorHtml(tools, isNative, mcpId = null) {
    const config = this.stateManager.getCurrentConfig();
    
    // Group tools by category
    const groupedByCategory = groupToolsByCategory(tools);
    const categories = Object.keys(groupedByCategory).sort();
    
    return categories.map((category) => {
      const categoryTools = groupedByCategory[category];
      
      // Determine tristate for category group
      const tristate = getCategoryTristate(categoryTools, category, config);
      
      const toolsHtml = categoryTools.map(tool => {
        const toolTristate = getToolTristate(tool.id, config);
        
        return `
          <div class="tool-item" data-tool-id="${tool.id}">
            <div class="tool-details">
              <div class="tool-name">${escapeHtml(tool.name)}</div>
              <div class="tool-description">${escapeHtml(tool.description)}</div>
            </div>
            <div class="tool-toggle">
              <div class="tristate-toggle-small" data-state="${toolTristate}" data-tool-id="${tool.id}">
                <div class="toggle-track"></div>
                <div class="toggle-thumb"></div>
              </div>
            </div>
          </div>
        `;
      }).join('');
      
      const mcpAttr = mcpId ? `data-mcp="${mcpId}"` : '';
      const nativeAttr = isNative ? 'data-native="true"' : '';
      
      // Don't show category toggle if:
      // 1. Category is "Uncategorized"
      // 2. For MCP tools: Category name matches the MCP name (e.g., "Cortex" category in cortex MCP)
      // 3. For native tools: Category is a top-level single-category group (e.g., "Cortex", "Datadog")
      //    But allow categories with prefixes like "GitHub: Actions" to show toggle
      const categoryMatchesMcp = mcpId && category.toLowerCase() === mcpId.toLowerCase();
      const isNativeSingleCategory = isNative && !category.includes(':');
      const showCategoryToggle = category !== 'Uncategorized' && !categoryMatchesMcp && !isNativeSingleCategory;
      const categoryToggleHtml = showCategoryToggle ? `
              <div class="tristate-toggle" data-state="${tristate}" data-category="${category}" ${nativeAttr} ${mcpAttr}>
                <div class="toggle-track"></div>
                <div class="toggle-thumb"></div>
              </div>
      ` : '';
      
      return `
        <div class="tool-category-group">
          <div class="tool-category-header">
            <div class="category-header-content">
              <span class="category-expand-icon">▼</span>
              <span class="category-name">${escapeHtml(category)}</span>
              <span class="category-count">(${categoryTools.length})</span>
            </div>
            <div class="category-toggle">
              ${categoryToggleHtml}
            </div>
          </div>
          <div class="tool-category-content">
            ${toolsHtml}
          </div>
        </div>
      `;
    }).join('');
  }

  /**
   * Render secrets editor (native or MCP)
   * @param {string} categoryOrMcpId - Category or MCP identifier
   * @param {Array} envVars - Array of environment variables
   */
  renderSecretsEditor(categoryOrMcpId, envVars) {
    const selectedProvider = this.stateManager.getSelectedProvider();
    const container = selectedProvider === 'native' ? 
      this.domManager.secretsConfigList : this.domManager.mcpSecretsList;
    
    if (!container) return;
    
    if (!envVars || envVars.length === 0) {
      container.innerHTML = '<p>No environment variables required.</p>';
      return;
    }
    
    const html = this._generateSecretsHtml(envVars);
    container.innerHTML = html;
  }

  /**
   * Generate HTML for secrets/environment variables
   * @private
   */
  _generateSecretsHtml(envVars) {
    const sortedEnvVars = [...envVars].sort((a, b) => {
      const nameA = a.key || a.name || a;
      const nameB = b.key || b.name || b;
      return nameA.localeCompare(nameB);
    });
    
    return sortedEnvVars.map((envVar) => {
      const name = envVar.key || envVar.name || envVar;
      const description = envVar.description || `Environment variable: ${name}`;
      const required = envVar.required !== undefined ? envVar.required : true;
      
      return `
        <div class="secret-item">
          <div class="secret-header">
            ${escapeHtml(name)}
            ${required ? '<span class="required-badge">Required</span>' : ''}
          </div>
          <div class="secret-description">${escapeHtml(description)}</div>
        </div>
      `;
    }).join('');
  }

  /**
   * Render MCP secrets (alias for renderSecretsEditor)
   * @param {string} mcpId - MCP identifier
   * @param {string} provider - Provider type
   * @param {Array} envVars - Array of environment variables
   */
  renderMcpSecrets(mcpId, provider, envVars) {
    this.renderSecretsEditor(mcpId, envVars);
  }

  /**
   * Render YAML preview with syntax highlighting
   */
  renderYamlPreview() {
    const container = this.domManager.yamlPreview;
    if (!container) return;
    
    const yaml = this.configGenerator.generateYaml();
    
    container.innerHTML = '';
    const codeElement = document.createElement('code');
    codeElement.className = 'language-yaml';
    codeElement.textContent = yaml;
    container.appendChild(codeElement);
    
    if (window.hljs) {
      hljs.highlightElement(codeElement);
    }
  }

  /**
   * Render MCP config preview with syntax highlighting
   */
  renderMcpConfigPreview() {
    const container = this.domManager.mcpConfigPreview;
    if (!container) return;
    
    const mcpFormatSelect = this.domManager.mcpFormatSelect;
    const format = mcpFormatSelect ? mcpFormatSelect.value : 'claude-code';
    const mcpConfig = this.configGenerator.generateMcpConfig(format);
    
    container.innerHTML = '';
    const codeElement = document.createElement('code');
    codeElement.className = 'language-json';
    codeElement.textContent = mcpConfig;
    container.appendChild(codeElement);
    
    if (window.hljs) {
      hljs.highlightElement(codeElement);
    }
  }

  /**
   * Render configuration instructions based on selected format
   */
  renderConfigInstructions() {
    const container = this.domManager.configInstructionsContent;
    if (!container) return;
    
    const mcpFormatSelect = this.domManager.mcpFormatSelect;
    const format = mcpFormatSelect ? mcpFormatSelect.value : 'claude-code';
    const instructionsHtml = this.configGenerator.generateConfigInstructions(format);
    container.innerHTML = instructionsHtml;
  }
}

/**
 * Factory function to create RenderingEngine instances
 * @param {Object} stateManager - State manager instance
 * @param {Object} domManager - DOM manager instance
 * @param {Object} configGenerator - Config generator instance
 * @returns {RenderingEngine} New RenderingEngine instance
 */
export function createRenderingEngine(stateManager, domManager, configGenerator) {
  return new RenderingEngine(stateManager, domManager, configGenerator);
}
