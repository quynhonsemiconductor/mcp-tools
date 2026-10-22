/**
 * MCPManager - Business logic for MCP operations
 * 
 * Handles:
 * - MCP selection and UI updates
 * - Category toggling (native and MCP)
 * - MCP server toggling
 * - Tool tristate toggling
 * - Category group tristate toggling
 */

import { getCategoryTristate, getParentCategory } from './UtilityHelpers.js';

/**
 * Create MCPManager with dependencies
 * @param {Object} dependencies - Required dependencies
 * @param {Object} dependencies.stateManager - State management
 * @param {Object} dependencies.domManager - DOM management
 * @param {Object} dependencies.apiService - API service
 * @param {Object} dependencies.renderingEngine - Rendering engine
 * @param {Object} dependencies.tabManager - Tab manager
 * @returns {Object} MCPManager instance
 */
export function createMCPManager({ stateManager, domManager, apiService, renderingEngine, tabManager }) {
  
  /**
   * Select an MCP (unified for all providers)
   * @param {string} mcpIdOrCategory - MCP ID or category name
   * @param {string} provider - Provider type (native, bundled, remote, local)
   */
  async function selectMcp(mcpIdOrCategory, provider) {
    stateManager.setSelectedMcp(mcpIdOrCategory, provider);
    
    // Update UI to reflect selection
    document.querySelectorAll('.category-item, .mcp-item').forEach((item) => {
      item.classList.remove('active');
    });
    
    const selector = provider === 'native' 
      ? `.category-item[data-category="${mcpIdOrCategory}"]`
      : `.mcp-item[data-mcp="${mcpIdOrCategory}"][data-provider="${provider}"]`;
    
    document.querySelector(selector)?.classList.add('active');
    
    // Find the MCP data
    let mcp;
    const mcps = stateManager.getMcps();
    
    if (provider === 'native') {
      // For native MCPs, find by category name (mcpIdOrCategory is the category)
      mcp = mcps.find(m => m.provider === 'native' && m.category === mcpIdOrCategory);
      
      // If not found, it might be a parent category - collect all matching native MCPs
      if (!mcp) {
        const matchingMcps = mcps.filter(m => 
          m.provider === 'native' && 
          m.category &&
          (m.category === mcpIdOrCategory || getParentCategory(m.category) === mcpIdOrCategory)
        );
        
        if (matchingMcps.length > 0) {
          // Aggregate unique envVars from all matching MCPs
          const envVarsMap = new Map();
          for (const m of matchingMcps) {
            if (m.envVars) {
              for (const envVar of m.envVars) {
                const key = envVar.key || envVar.name || envVar;
                if (!envVarsMap.has(key)) {
                  envVarsMap.set(key, envVar);
                }
              }
            }
          }
          
          // Create a virtual MCP that aggregates all matching MCPs
          mcp = {
            id: 'native-' + mcpIdOrCategory.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
            provider: 'native',
            category: mcpIdOrCategory,
            tools: matchingMcps.flatMap(m => m.tools || []),
            envVars: Array.from(envVarsMap.values())
          };
        }
      }
    } else {
      mcp = mcps.find(m => 
        (m.id === mcpIdOrCategory || m.name === mcpIdOrCategory) && m.provider === provider
      );
    }
    
    if (!mcp) {
      console.error(`MCP not found: ${mcpIdOrCategory} (${provider})`);
      return;
    }
    
    // Show/hide appropriate tool lists
    const toolsConfigList = domManager.getElementById('tools-config-list');
    const mcpToolsList = domManager.getElementById('mcp-tools-list');
    const secretsConfigList = domManager.getElementById('secrets-config-list');
    const mcpSecretsList = domManager.getElementById('mcp-secrets-list');
    
    if (provider === 'native') {
      if (toolsConfigList) toolsConfigList.style.display = 'block';
      if (mcpToolsList) mcpToolsList.style.display = 'none';
      if (secretsConfigList) secretsConfigList.style.display = 'block';
      if (mcpSecretsList) mcpSecretsList.style.display = 'none';
    } else {
      if (toolsConfigList) toolsConfigList.style.display = 'none';
      if (mcpToolsList) mcpToolsList.style.display = 'block';
      if (secretsConfigList) secretsConfigList.style.display = 'none';
      if (mcpSecretsList) mcpSecretsList.style.display = 'block';
    }
    
    // Update headers
    const toolsHeader = domManager.getElementById('tools-header');
    const secretsHeader = domManager.getElementById('secrets-header');
    
    if (provider === 'native') {
      if (toolsHeader) toolsHeader.innerHTML = '<h3>Tools Configuration</h3>';
      if (secretsHeader) secretsHeader.innerHTML = '<h3>Environment Variables</h3>';
    } else {
      if (toolsHeader) toolsHeader.innerHTML = '<h3>MCP Server Tools</h3>';
      if (secretsHeader) secretsHeader.innerHTML = '<h3>MCP Server Environment Variables</h3>';
    }
    
    // Determine what tools/secrets to render
    let tools = [];
    let hasTools = false;
    let hasSecrets = false;
    
    if (provider === 'native') {
      // Check if this is a parent category (like "GitHub" for "Github: Actions", etc.)
      const isParentCategory = mcp.tools.some(t => 
        t.category !== mcpIdOrCategory && getParentCategory(t.category) === mcpIdOrCategory
      );
      
      if (isParentCategory) {
        // Filter native tools by parent category - get all sub-categories
        tools = mcp.tools.filter(t => getParentCategory(t.category) === mcpIdOrCategory);
      } else {
        // Filter native tools by exact category
        tools = mcp.tools.filter(t => t.category === mcpIdOrCategory);
      }
      
      hasTools = tools.length > 0;
      hasSecrets = mcp.envVars && mcp.envVars.length > 0;
    } else {
      tools = mcp.tools || [];
      hasTools = tools.length > 0;
      hasSecrets = mcp.envVars && mcp.envVars.length > 0;
    }
    
    tabManager.updateTabVisibility(hasTools, hasSecrets);
    
    // Render tools and secrets (delegate to callbacks for now)
    if (provider === 'native') {
      // These will be called via callbacks from config-editor.js
      // We can't call them directly to avoid circular dependencies
      return {
        type: 'native',
        category: mcpIdOrCategory,
        tools,
        envVars: mcp.envVars || [],
        hasTools,
        hasSecrets
      };
    } else {
      return {
        type: 'mcp',
        mcpId: mcpIdOrCategory,
        provider,
        tools,
        envVars: mcp.envVars || [],
        hasTools,
        hasSecrets,
        displayName: mcp.name
      };
    }
  }
  
  /**
   * Toggle a category (native only)
   * @param {string} category - Category name
   * @param {string} parentCategory - Parent category name (if applicable)
   * @param {boolean} enabled - Enable or disable
   */
  function toggleCategory(category, parentCategory, enabled) {
    const currentConfig = stateManager.getCurrentConfig();
    const { tools } = currentConfig;
    
    if (!tools.includeCategories) tools.includeCategories = [];
    if (!tools.excludeCategories) tools.excludeCategories = [];
    
    // Find sub-categories that belong to this parent category.
    // For parent categories like "Github", this finds "Github: Actions", "Github: Branches", etc.
    // For leaf categories like "k6", this finds nothing (tool.category === category filters them out).
    const lookupParent = parentCategory || category;
    const mcps = stateManager.getMcps();
    const nativeMcp = mcps.find(m => m.provider === 'native');
    const subCategories = new Set();
    if (nativeMcp) {
      nativeMcp.tools.forEach(tool => {
        if (getParentCategory(tool.category) === lookupParent && tool.category !== category) {
          subCategories.add(tool.category);
        }
      });
    }

    if (subCategories.size > 0) {
      // Parent category toggle - expand to all sub-categories
      subCategories.forEach(subCat => {
        if (enabled) {
          if (!tools.includeCategories.includes(subCat)) {
            tools.includeCategories.push(subCat);
          }
          tools.excludeCategories = tools.excludeCategories.filter(c => c !== subCat);
        } else {
          if (!tools.excludeCategories.includes(subCat)) {
            tools.excludeCategories.push(subCat);
          }
          tools.includeCategories = tools.includeCategories.filter(c => c !== subCat);
        }
      });
    } else {
      // Single category toggle (leaf category with no sub-categories)
      if (enabled) {
        if (!tools.includeCategories.includes(category)) {
          tools.includeCategories.push(category);
        }
        tools.excludeCategories = tools.excludeCategories.filter(c => c !== category);
      } else {
        if (!tools.excludeCategories.includes(category)) {
          tools.excludeCategories.push(category);
        }
        tools.includeCategories = tools.includeCategories.filter(c => c !== category);
      }
    }
    
    // Persist the changes back to state manager
    stateManager.setCurrentConfig(currentConfig);
  }
  
  /**
   * Toggle an MCP (unified for all providers)
   * @param {string} mcpId - MCP ID
   * @param {string} provider - Provider type (bundled, remote, local)
   * @param {boolean} enabled - Enable or disable
   */
  function toggleMcp(mcpId, provider, enabled) {
    const currentConfig = stateManager.getCurrentConfig();
    const { tools } = currentConfig;
    
    const configField = provider === 'bundled' ? 'includeMCPs' : 
                        provider === 'remote' ? 'includeRemoteMCPs' :
                        'includeLocalMCPs';
    
    if (!tools[configField]) tools[configField] = [];
    
    if (enabled) {
      if (!tools[configField].includes(mcpId)) {
        tools[configField].push(mcpId);
      }
    } else {
      tools[configField] = tools[configField].filter(id => id !== mcpId);
    }
    
    // Persist the changes back to state manager
    stateManager.setCurrentConfig(currentConfig);
  }
  
  /**
   * Toggle an individual tool with tristate
   * @param {string} toolId - Tool ID
   * @param {string} state - New state (included, excluded, neutral)
   */
  function toggleToolTristate(toolId, state) {
    const currentConfig = stateManager.getCurrentConfig();
    const { tools } = currentConfig;
    
    if (!tools.include) tools.include = [];
    if (!tools.exclude) tools.exclude = [];
    
    if (state === 'included') {
      // Explicitly include the tool
      if (!tools.include.includes(toolId)) {
        tools.include.push(toolId);
      }
      tools.exclude = tools.exclude.filter(id => id !== toolId);
    } else if (state === 'excluded') {
      // Explicitly exclude the tool
      if (!tools.exclude.includes(toolId)) {
        tools.exclude.push(toolId);
      }
      tools.include = tools.include.filter(id => id !== toolId);
    } else {
      // Neutral - remove from both lists
      tools.include = tools.include.filter(id => id !== toolId);
      tools.exclude = tools.exclude.filter(id => id !== toolId);
    }
    
    // Persist the changes back to state manager
    stateManager.setCurrentConfig(currentConfig);
    
    // Update category group tristate if needed
    const toolElement = document.querySelector(`[data-tool-id="${toolId}"]`);
    if (toolElement) {
      const categoryGroup = toolElement.closest('.tool-category-group');
      if (categoryGroup) {
        const categoryToggle = categoryGroup.querySelector('.tristate-toggle');
        if (categoryToggle) {
          const category = categoryToggle.dataset.category;
          
          // Find all tools in this category to recalculate group state
          const allToolsInCategory = Array.from(categoryGroup.querySelectorAll('.tool-item')).map(
            el => el.dataset.toolId
          );
          
          const categoryTools = allToolsInCategory.map(id => ({ id }));
          const newCategoryState = getCategoryTristate(categoryTools, category, currentConfig);
          categoryToggle.dataset.state = newCategoryState;
        }
      }
    }
  }
  
  /**
   * Toggle a category group with tristate (for bundled/remote/local MCPs)
   * @param {string} mcpId - MCP ID
   * @param {string} category - Category name
   * @param {string} state - New state (included, excluded, neutral)
   */
  function toggleCategoryGroupTristate(mcpId, category, state) {
    const mcps = stateManager.getMcps();
    const mcp = mcps.find(m => m.id === mcpId || m.name === mcpId);
    if (!mcp || !mcp.tools) return;
    
    const currentConfig = stateManager.getCurrentConfig();
    const { tools } = currentConfig;
    
    if (!tools.includeCategories) tools.includeCategories = [];
    if (!tools.excludeCategories) tools.excludeCategories = [];
    
    if (state === 'included') {
      // Add category to includeCategories
      if (!tools.includeCategories.includes(category)) {
        tools.includeCategories.push(category);
      }
      tools.excludeCategories = tools.excludeCategories.filter(c => c !== category);
    } else if (state === 'excluded') {
      // Add category to excludeCategories
      if (!tools.excludeCategories.includes(category)) {
        tools.excludeCategories.push(category);
      }
      tools.includeCategories = tools.includeCategories.filter(c => c !== category);
    } else {
      // Neutral - remove from both lists
      tools.includeCategories = tools.includeCategories.filter(c => c !== category);
      tools.excludeCategories = tools.excludeCategories.filter(c => c !== category);
    }
    
    // Persist the changes back to state manager
    stateManager.setCurrentConfig(currentConfig);
  }
  
  /**
   * Toggle a native category group with tristate
   * @param {string} category - Category name
   * @param {string} state - New state (included, excluded, neutral)
   */
  function toggleNativeCategoryGroupTristate(category, state) {
    const mcps = stateManager.getMcps();
    const nativeMcp = mcps.find(m => m.provider === 'native');
    if (!nativeMcp || !nativeMcp.tools) return;
    
    const categoryTools = nativeMcp.tools.filter(t => t.category === category);
    
    // Get the current config and modify it
    const currentConfig = stateManager.getCurrentConfig();
    const { tools } = currentConfig;
    
    if (!tools.include) tools.include = [];
    if (!tools.exclude) tools.exclude = [];
    if (!tools.includeCategories) tools.includeCategories = [];
    if (!tools.excludeCategories) tools.excludeCategories = [];
    
    if (state === 'included') {
      // Add category to includeCategories
      if (!tools.includeCategories.includes(category)) {
        tools.includeCategories.push(category);
      }
      tools.excludeCategories = tools.excludeCategories.filter(c => c !== category);
    } else if (state === 'excluded') {
      // Add category to excludeCategories
      tools.includeCategories = tools.includeCategories.filter(c => c !== category);
      if (!tools.excludeCategories.includes(category)) {
        tools.excludeCategories.push(category);
      }
    } else {
      // Neutral - remove from both lists
      tools.includeCategories = tools.includeCategories.filter(c => c !== category);
      tools.excludeCategories = tools.excludeCategories.filter(c => c !== category);
    }
    
    // Save the modified config back to state manager
    stateManager.setCurrentConfig(currentConfig);
  }
  
  /**
   * Load tools for remote MCPs (lazy loading)
   * This fetches tools asynchronously after the remote MCPs initialize
   */
  async function loadRemoteMcpTools() {
    try {
      console.log('MCPManager: Loading remote MCP tools...');
      const data = await apiService.fetchRemoteMcpTools();
      
      if (!data || !data.mcps) {
        console.warn('MCPManager: No remote MCPs returned');
        return;
      }
      
      // Update each MCP's tools in the state
      for (const remoteMcp of data.mcps) {
        stateManager.updateMcpTools(remoteMcp.id, 'remote', remoteMcp.tools, remoteMcp.connected);
      }
      
      // Re-render the remote MCPs list to show updated tools
      const mcps = stateManager.getMcps();
      const remoteMcps = mcps.filter(m => m.provider === 'remote');
      renderingEngine.renderMcpsList(remoteMcps, 'remote', domManager.remoteMcpServersList);
      
      // Re-attach event listeners after re-rendering
      // This needs to be called from config-editor.js where attachMcpEventListeners is defined
      if (window.attachMcpEventListeners) {
        window.attachMcpEventListeners();
      }
      
      // Check if any of the updated MCPs is currently selected and re-render its tools
      const selectedMcp = stateManager.getSelectedMcp();
      const selectedProvider = stateManager.getSelectedProvider();
      if (selectedProvider === 'remote' && selectedMcp) {
        const updatedMcp = data.mcps.find(m => m.id === selectedMcp);
        if (updatedMcp && window.refreshSelectedMcpTools) {
          console.log(`MCPManager: Refreshing tools for selected MCP: ${selectedMcp}`);
          window.refreshSelectedMcpTools(selectedMcp, 'remote', updatedMcp.tools);
        }
      }
      
      console.log('MCPManager: Remote MCP tools loaded successfully');
    } catch (error) {
      console.error('MCPManager: Error loading remote MCP tools:', error);
    }
  }
  
  /**
   * Load tools for local MCPs (lazy loading)
   * This fetches tools asynchronously after the local MCPs initialize
   */
  async function loadLocalMcpTools() {
    try {
      console.log('MCPManager: Loading local MCP tools...');
      const data = await apiService.fetchLocalMcpTools();
      
      if (!data || !data.mcps) {
        console.warn('MCPManager: No local MCPs returned');
        return;
      }
      
      // Update each MCP's tools in the state
      for (const localMcp of data.mcps) {
        stateManager.updateMcpTools(localMcp.id, 'local', localMcp.tools, localMcp.connected);
      }
      
      // Re-render the local MCPs list to show updated tools
      const mcps = stateManager.getMcps();
      const localMcps = mcps.filter(m => m.provider === 'local');
      renderingEngine.renderMcpsList(localMcps, 'local', domManager.localMcpServersList);
      
      // Re-attach event listeners after re-rendering
      // This needs to be called from config-editor.js where attachMcpEventListeners is defined
      if (window.attachMcpEventListeners) {
        window.attachMcpEventListeners();
      }
      
      // Check if any of the updated MCPs is currently selected and re-render its tools
      const selectedMcp = stateManager.getSelectedMcp();
      const selectedProvider = stateManager.getSelectedProvider();
      if (selectedProvider === 'local' && selectedMcp) {
        const updatedMcp = data.mcps.find(m => m.id === selectedMcp);
        if (updatedMcp && window.refreshSelectedMcpTools) {
          console.log(`MCPManager: Refreshing tools for selected MCP: ${selectedMcp}`);
          window.refreshSelectedMcpTools(selectedMcp, 'local', updatedMcp.tools);
        }
      }
      
      console.log('MCPManager: Local MCP tools loaded successfully');
    } catch (error) {
      console.error('MCPManager: Error loading local MCP tools:', error);
    }
  }
  
  /**
   * Load tools for all external MCPs (both remote and local)
   * Convenience method to load both in parallel
   */
  async function loadAllExternalMcpTools() {
    console.log('MCPManager: Loading all external MCP tools...');
    await Promise.all([
      loadRemoteMcpTools(),
      loadLocalMcpTools()
    ]);
    console.log('MCPManager: All external MCP tools loaded');
  }
  
  return {
    selectMcp,
    toggleCategory,
    toggleMcp,
    toggleToolTristate,
    toggleCategoryGroupTristate,
    toggleNativeCategoryGroupTristate,
    loadRemoteMcpTools,
    loadLocalMcpTools,
    loadAllExternalMcpTools
  };
}
