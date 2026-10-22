// MCP Tools Config Editor - Refactored to use unified /api/mcps endpoint

// Import modules
import {
  convertMarkdownToHtml,
  escapeHtml
} from './config-editor/UtilityHelpers.js';

import { apiService } from './config-editor/APIService.js';
import { createConfigGenerator } from './config-editor/ConfigGenerator.js';
import { domManager } from './config-editor/DOMManager.js';
import { createEventHandlers } from './config-editor/EventHandlers.js';
import { createMCPManager } from './config-editor/MCPManager.js';
import { createRenderingEngine } from './config-editor/RenderingEngine.js';
import { stateManager } from './config-editor/StateManager.js';
import { createTabManager } from './config-editor/TabManager.js';

// Initialization guard to prevent double-init from race conditions
let _configEditorInitialized = false;

// Initialize modules
const configGenerator = createConfigGenerator(stateManager);
const tabManager = createTabManager();
const renderingEngine = createRenderingEngine(stateManager, domManager, configGenerator);
const mcpManager = createMCPManager({ stateManager, domManager, apiService, renderingEngine, tabManager });

// Initialize event handlers with callbacks
const eventHandlers = createEventHandlers({
  onNavigate: (path) => {
    if (typeof navigate === 'function') {
      navigate(path);
    }
  },
  onFileUpload: uploadConfig,
  onCopyConfig: copyConfigToClipboard,
  onDownloadConfig: downloadConfig,
  onResetConfig: resetConfig,
  onSaveConfig: saveConfig,
  onLoggingChange: (field, value) => {
    // Get current config, update it, and set it back
    const config = stateManager.getCurrentConfig();
    if (field === 'enabled') {
      config.logging.enabled = value;
    } else if (field === 'level') {
      config.logging.level = value;
    } else if (field === 'maxSize') {
      config.logging.maxSize = value;
    } else if (field === 'maxFiles') {
      config.logging.maxFiles = value;
    }
    stateManager.setCurrentConfig(config);
    updatePreviews();
  },
  onFormatChange: () => {
    renderMcpConfigPreview();
    renderConfigInstructions();
  },
  onTabChange: (container, tabId) => {
    if (container === 'sidebar') {
      tabManager.activateSidebarTab(tabId);
    } else if (container === 'main') {
      tabManager.activateMainTab(tabId);
    } else if (container === 'tools') {
      tabManager.activateToolsTab(tabId);
    }
  },
  onCategoryClick: selectMcp,
  onCategoryToggle: toggleCategory,
  onMcpClick: selectMcp,
  onMcpToggle: toggleMcp,
  onCategoryGroupToggle: (category, newState, isNative, mcpId) => {
    if (isNative) {
      toggleNativeCategoryGroupTristate(category, newState);
    } else {
      toggleCategoryGroupTristate(mcpId, category, newState);
    }
  },
  onToolToggle: toggleToolTristate
});

// Legacy state object - now backed by StateManager
// This maintains backward compatibility while we refactor
const configEditorState = {
  get mcps() { return stateManager.getMcps(); },
  set mcps(value) { stateManager.setMcps(value); },
  
  get categorizedTools() { return stateManager.getCategorizedTools(); },
  set categorizedTools(value) { stateManager.setCategorizedTools(value); },
  
  get currentConfig() { return stateManager.getCurrentConfig(); },
  set currentConfig(value) { stateManager.setCurrentConfig(value); },
  
  get originalConfig() { return stateManager.getOriginalConfig(); },
  set originalConfig(value) { stateManager.setOriginalConfig(value); },
  
  get selectedMcp() { return stateManager.getSelectedMcp(); },
  set selectedMcp(value) { stateManager.setSelectedMcp(value, this.selectedProvider); },
  
  get selectedProvider() { return stateManager.getSelectedProvider(); },
  set selectedProvider(value) { stateManager.setSelectedMcp(this.selectedMcp, value); },
  
  get isUploadedConfig() { return stateManager.isUploadedConfig(); },
  set isUploadedConfig(value) { stateManager.setUploadedConfig(value); }
};

/**
 * Update setup tab visibility and render content
 */
async function updateSetupTabVisibility(toolId, displayName, sourceType) {
  const setupTabBtn = domManager.setupTabBtn;
  const setupContent = domManager.setupContent;
  const setupToolName = domManager.setupToolName;
  
  if (!setupTabBtn || !setupContent || !setupToolName) {
    console.error('Setup tab DOM elements not found');
    return { exists: false, content: '' };
  }
  
  setupContent.innerHTML = '<p class="setup-loading">⏳ Loading setup instructions...</p>';
  
  try {
    const setupDoc = await apiService.fetchSetupDocumentation(toolId, sourceType);
    
    if (setupDoc.exists && setupDoc.content) {
      console.log(`Showing setup tab for: ${displayName} (${sourceType || 'any'})`);
      setupTabBtn.style.display = '';
      
      setupToolName.textContent = displayName || toolId;
      
      const htmlContent = convertMarkdownToHtml(setupDoc.content);
      setupContent.innerHTML = htmlContent;
      
      if (typeof hljs !== 'undefined') {
        setupContent.querySelectorAll('pre code').forEach((block) => {
          hljs.highlightElement(block);
        });
      }
      
      return setupDoc;
      
    } else {
      console.log(`No setup documentation found for: ${toolId} (${sourceType || 'any'})`);
      setupTabBtn.style.display = 'none';
      
      const setupTab = domManager.setupTab;
      if (setupTab && setupTab.classList.contains('active')) {
        console.log('Switching from setup tab to preview tab');
        tabManager.activateMainTab('preview-tab');
      }
      
      setupContent.innerHTML = '<p class="setup-not-available">Setup documentation not available for this tool.</p>';
      
      return { exists: false, content: '' };
    }
    
  } catch (error) {
    console.error('Error updating setup tab:', error);
    setupContent.innerHTML = `<div class="setup-error">
      <strong>Error loading setup instructions:</strong><br>
      ${escapeHtml(error.message)}
    </div>`;
    setupTabBtn.style.display = 'none';
    return { exists: false, content: '' };
  }
}

/**
 * Initialize config editor
 */
async function initConfigEditor() {
  // Prevent double initialization from race conditions between app.js and module fallback
  if (_configEditorInitialized) {
    return;
  }
  _configEditorInitialized = true;

  try {
    const mcps = await apiService.fetchAllMcps();
    configEditorState.mcps = mcps;
    
    // For backward compatibility, populate categorizedTools from native tools
    const nativeMcps = mcps.filter(m => m.provider === 'native');
    if (nativeMcps && nativeMcps.length > 0) {
      const categorized = {};
      nativeMcps.forEach(mcp => {
        if (mcp.tools) {
          mcp.tools.forEach(tool => {
            if (!categorized[tool.category]) {
              categorized[tool.category] = {
                parentToolId: tool.category.toLowerCase(),
                tools: []
              };
            }
            categorized[tool.category].tools.push(tool);
          });
        }
      });
      configEditorState.categorizedTools = categorized;
    }
    
  } catch (error) {
    console.error('Error fetching MCPs:', error);
    configEditorState.mcps = [];
    configEditorState.categorizedTools = {};
  }

  try {
    const config = await apiService.fetchCurrentConfig();

    configEditorState.originalConfig = JSON.parse(JSON.stringify(config));
    configEditorState.currentConfig = config;
    configEditorState.isUploadedConfig = false;

    updateLoggingUI();
  } catch (error) {
    console.error('Error fetching config:', error);
  }

  function updatePendingChangesMessage() {
    const el = domManager.pendingChangesMessage;
    if (!el) return;
    el.classList.toggle('hidden', !stateManager.isDirty());
  }
  stateManager.subscribe(updatePendingChangesMessage);
  updatePendingChangesMessage();

  renderAllMcps();
  updatePreviews();
  tabManager.updateTabVisibility(false, false);
  
  // Load external MCP tools asynchronously (remote & local)
  // This happens in the background after the initial render
  mcpManager.loadAllExternalMcpTools().catch(error => {
    console.error('Error loading external MCP tools:', error);
  });
  
  eventHandlers.setupAllListeners({
    navConfig: domManager.navConfig,
    configFileInput: domManager.configFileInput,
    copyConfigButton: domManager.copyConfigButton,
    downloadConfigButton: domManager.downloadConfigButton,
    resetConfigButton: domManager.resetConfigButton,
    saveConfigButton: domManager.saveConfigButton,
    loggingEnabled: domManager.loggingEnabled,
    loggingLevel: domManager.loggingLevel,
    loggingMaxSize: domManager.loggingMaxSize,
    loggingMaxFiles: domManager.loggingMaxFiles,
    mcpFormatSelect: domManager.mcpFormatSelect
  });
}

/**
 * Update logging UI based on current config
 */
function updateLoggingUI() {
  const { logging } = configEditorState.currentConfig;

  const loggingEnabled = domManager.loggingEnabled;
  const loggingLevel = domManager.loggingLevel;
  const loggingMaxSize = domManager.loggingMaxSize;
  const loggingMaxFiles = domManager.loggingMaxFiles;

  if (loggingEnabled) loggingEnabled.checked = logging.enabled;
  if (loggingLevel) loggingLevel.value = logging.level;
  if (loggingMaxSize) loggingMaxSize.value = logging.maxSize;
  if (loggingMaxFiles) loggingMaxFiles.value = logging.maxFiles;
}

/**
 * Render all MCPs in their respective tabs
 */
function renderAllMcps() {
  renderingEngine.renderAllMcps();
  
  // Re-attach event listeners after rendering
  attachMcpEventListeners();
}

/**
 * Select an MCP (unified for all providers)
 * Orchestrates selection, rendering, and tab switching
 */
async function selectMcp(mcpIdOrCategory, provider) {
  const result = await mcpManager.selectMcp(mcpIdOrCategory, provider);
  
  if (!result) return;
  
  // Render tools and secrets based on result
  if (result.type === 'native') {
    renderToolsEditor(result.category, result.tools);
    renderingEngine.renderSecretsEditor(result.category, result.envVars);
  } else {
    renderMcpTools(result.mcpId, result.provider, result.tools);
    renderingEngine.renderMcpSecrets(result.mcpId, result.provider, result.envVars);
  }
  
  // Update setup tab
  const displayName = result.type === 'native' ? result.category : result.displayName;
  const setupDoc = await updateSetupTabVisibility(mcpIdOrCategory, displayName, provider);
  
  // Switch to appropriate tab
  let targetTab = 'preview-tab';
  if (result.hasTools) {
    targetTab = 'tools-tab';
  } else if (result.hasSecrets) {
    targetTab = 'secrets-tab';
  } else if (setupDoc && setupDoc.exists) {
    targetTab = 'setup-tab';
  }
  tabManager.activateToolsTab(targetTab);
}

/**
 * Render tools editor for native category
 */
function renderToolsEditor(category, tools) {
  renderingEngine.renderToolsEditor(category, tools);
  eventHandlers.attachToolsEditorEventListeners();
}

/**
 * Render MCP tools with category grouping
 */
function renderMcpTools(mcpId, provider, tools) {
  renderingEngine.renderMcpTools(mcpId, provider, tools);
  eventHandlers.attachToolsEditorEventListeners();
}

/**
 * Refresh tools for the currently selected MCP
 * Called when tools are loaded asynchronously for a selected MCP
 */
function refreshSelectedMcpTools(mcpId, provider, tools) {
  // Re-render the tools panel with the new tools
  renderMcpTools(mcpId, provider, tools);
  
  // Update tab visibility and switch to tools tab if tools are now available
  const hasTools = tools && tools.length > 0;
  if (hasTools) {
    // Show the tools tab since we now have tools
    tabManager.updateTabVisibility(true, false);
    
    // Switch to tools tab automatically
    tabManager.activateToolsTab('tools-tab');
    
    console.log(`Switched to Tools tab for ${mcpId} (${provider})`);
  }
}

/**
 * Toggle a category (native only)
 */
function toggleCategory(category, parentCategory, enabled) {
  mcpManager.toggleCategory(category, parentCategory, enabled);
  updatePreviews();
}

/**
 * Toggle an MCP (unified for all providers)
 */
function toggleMcp(mcpId, provider, enabled) {
  mcpManager.toggleMcp(mcpId, provider, enabled);
  updatePreviews();
}

/**
 * Toggle an individual tool with tristate
 */
function toggleToolTristate(toolId, state) {
  mcpManager.toggleToolTristate(toolId, state);
  updatePreviews();
}

/**
 * Toggle a category group with tristate (for bundled/remote/local MCPs)
 */
function toggleCategoryGroupTristate(mcpId, category, state) {
  mcpManager.toggleCategoryGroupTristate(mcpId, category, state);
  updatePreviews();
  
  // No need to re-render - the toggle state is already updated in the DOM by the event handler
  // Re-rendering would cause all collapsed sections to expand, which is a bug
}

/**
 * Toggle a native category group with tristate
 */
function toggleNativeCategoryGroupTristate(category, state) {
  mcpManager.toggleNativeCategoryGroupTristate(category, state);
  updatePreviews();
  
  // No need to re-render - the toggle state is already updated in the DOM by the event handler
  // Re-rendering would cause all collapsed sections to expand, which is a bug
}

/**
 * Update all configuration previews
 */
function updatePreviews() {
  renderingEngine.renderYamlPreview();
  renderingEngine.renderMcpConfigPreview();
  renderingEngine.renderConfigInstructions();
}

/**
 * Render MCP config preview (delegates to RenderingEngine)
 */
function renderMcpConfigPreview() {
  renderingEngine.renderMcpConfigPreview();
}

/**
 * Render configuration instructions (delegates to RenderingEngine)
 */
function renderConfigInstructions() {
  renderingEngine.renderConfigInstructions();
}

/**
 * Copy config to clipboard
 */
function copyConfigToClipboard() {
  const yaml = configGenerator.generateYaml();
  
  navigator.clipboard.writeText(yaml)
    .then(() => {
      const previewHeader = document.querySelector('.config-preview h3');
      if (previewHeader) {
        const successMessage = document.createElement('span');
        successMessage.textContent = ' (Copied!)';
        successMessage.style.color = '#4caf50';
        successMessage.style.marginLeft = '10px';
        previewHeader.appendChild(successMessage);
        
        setTimeout(() => {
          previewHeader.removeChild(successMessage);
        }, 2000);
      }
    })
    .catch((err) => {
      console.error('Error copying to clipboard:', err);
      alert('Failed to copy configuration to clipboard');
    });
}

/**
 * Download config
 */
function downloadConfig() {
  const yaml = configGenerator.generateYaml();
  const blob = new Blob([yaml], { type: 'text/yaml' });
  const url = URL.createObjectURL(blob);
  
  const a = document.createElement('a');
  a.href = url;
  a.download = 'mcp-tools-config.yaml';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Reset config
 */
async function resetConfig() {
  if (confirm('Discard unsaved changes and revert to the last saved configuration?')) {
    configEditorState.currentConfig = JSON.parse(JSON.stringify(configEditorState.originalConfig));
    configEditorState.isUploadedConfig = false;
    
    updateLoggingUI();
    renderAllMcps();
    updatePreviews();
    
    const fileNameSpan = domManager.fileNameSpan;
    if (fileNameSpan) {
      fileNameSpan.textContent = '';
    }
  }
}

/**
 * Save config
 */
async function saveConfig() {
  const yaml = configGenerator.generateYaml();
  const configPath = configEditorState.currentConfig.source || '';
  
  try {
    await apiService.saveConfig(yaml, configPath);
    // The persisted config is now the baseline, so the pending-changes
    // indicator clears (isDirty compares currentConfig vs originalConfig).
    configEditorState.originalConfig = JSON.parse(JSON.stringify(configEditorState.currentConfig));
    alert('Configuration saved successfully!');
  } catch (error) {
    console.error('Error saving config:', error);
    alert(`Error saving configuration: ${error.message}`);
  }
}

/**
 * Upload config
 */
async function uploadConfig() {
  const configFileInput = domManager.configFileInput;
  const fileNameSpan = domManager.fileNameSpan;
  
  if (!configFileInput.files || configFileInput.files.length === 0) {
    return;
  }
  
  try {
    const config = await apiService.parseConfig(configFileInput.files[0]);
    
    configEditorState.originalConfig = JSON.parse(JSON.stringify(config));
    configEditorState.currentConfig = config;
    configEditorState.isUploadedConfig = true;
    
    updateLoggingUI();
    renderAllMcps();
    updatePreviews();
    
    if (fileNameSpan) {
      fileNameSpan.textContent = configFileInput.files[0].name;
    }
  } catch (error) {
    console.error('Error uploading config:', error);
    alert(`Error loading configuration: ${error.message}`);
  }
}

// Expose initConfigEditor globally so app.js can call it
// This avoids race conditions since app.js loads synchronously and this module loads asynchronously
window.initConfigEditor = initConfigEditor;

/**
 * Event listener attachment functions
 * These functions attach event listeners after rendering
 */
function attachMcpEventListeners() {
  eventHandlers.attachMcpEventListeners({
    mcpServersList: domManager.mcpServersList,
    remoteMcpServersList: domManager.remoteMcpServersList,
    localMcpServersList: domManager.localMcpServersList
  });
}

// Expose to window for MCPManager to call after re-rendering
window.attachMcpEventListeners = attachMcpEventListeners;
window.refreshSelectedMcpTools = refreshSelectedMcpTools;

// If we're already on /config when this module loads, initialize the config editor
// This handles the case where app.js already navigated to /config before this module loaded
// The initialization guard prevents double-init if app.js already called initConfigEditor()
if (window.location.pathname === '/config') {
  initConfigEditor();
}
