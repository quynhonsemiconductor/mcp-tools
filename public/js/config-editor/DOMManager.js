/**
 * DOMManager.js
 * 
 * Manages DOM element references and queries.
 * Provides caching and lazy loading for better performance.
 */

/**
 * DOMManager class - manages DOM element references
 */
export class DOMManager {
  constructor() {
    // Cache for DOM elements
    this._cache = new Map();
    
    // Initialize immediately available elements
    this._initializeElements();
  }
  
  /**
   * Initialize DOM element references
   * @private
   */
  _initializeElements() {
    // Navigation
    this._cache.set('navConfig', document.getElementById('nav-config'));
    
    // Lists and containers
    this._cache.set('categoriesList', document.getElementById('categories-list'));
    this._cache.set('toolsConfigList', document.getElementById('tools-config-list'));
    this._cache.set('secretsConfigList', document.getElementById('secrets-config-list'));
    this._cache.set('mcpServersList', document.getElementById('mcps-list'));
    this._cache.set('mcpToolsList', document.getElementById('mcp-tools-list'));
    this._cache.set('mcpSecretsList', document.getElementById('mcp-secrets-list'));
    this._cache.set('remoteMcpServersList', document.getElementById('remote-mcps-list'));
    this._cache.set('localMcpServersList', document.getElementById('local-mcps-list'));
    
    // Preview elements
    this._cache.set('yamlPreview', document.getElementById('yaml-preview'));
    this._cache.set('mcpConfigPreview', document.getElementById('mcp-config-preview'));
    this._cache.set('mcpFormatSelect', document.getElementById('mcp-format-select'));
    this._cache.set('configInstructionsContent', document.getElementById('config-instructions-content'));
    
    // File input
    this._cache.set('configFileInput', document.getElementById('config-file'));
    this._cache.set('fileNameSpan', document.getElementById('file-name'));
    
    // Buttons
    this._cache.set('copyConfigButton', document.getElementById('copy-config'));
    this._cache.set('downloadConfigButton', document.getElementById('download-config'));
    this._cache.set('resetConfigButton', document.getElementById('reset-config'));
    this._cache.set('saveConfigButton', document.getElementById('save-config'));
    this._cache.set('pendingChangesMessage', document.getElementById('pending-changes-message'));
    
    // Logging configuration
    this._cache.set('loggingEnabled', document.getElementById('logging-enabled'));
    this._cache.set('loggingLevel', document.getElementById('logging-level'));
    this._cache.set('loggingMaxSize', document.getElementById('logging-max-size'));
    this._cache.set('loggingMaxFiles', document.getElementById('logging-max-files'));
    
    // Setup tab elements
    this._cache.set('setupTabBtn', document.getElementById('setup-tab-btn'));
    this._cache.set('setupContent', document.getElementById('setup-content'));
    this._cache.set('setupToolName', document.getElementById('setup-tool-name'));
    this._cache.set('setupTab', document.getElementById('setup-tab'));
  }
  
  /**
   * Get an element by ID with caching
   * @param {string} id - Element ID
   * @returns {HTMLElement|null} DOM element or null
   */
  getElementById(id) {
    if (!this._cache.has(id)) {
      const element = document.getElementById(id);
      this._cache.set(id, element);
    }
    return this._cache.get(id);
  }
  
  /**
   * Get elements by selector (not cached)
   * @param {string} selector - CSS selector
   * @returns {NodeList} List of matching elements
   */
  querySelectorAll(selector) {
    return document.querySelectorAll(selector);
  }
  
  /**
   * Get single element by selector (not cached)
   * @param {string} selector - CSS selector
   * @returns {HTMLElement|null} First matching element or null
   */
  querySelector(selector) {
    return document.querySelector(selector);
  }
  
  /**
   * Clear the cache (useful for testing or dynamic content)
   */
  clearCache() {
    this._cache.clear();
  }
  
  /**
   * Refresh a specific element in cache
   * @param {string} id - Element ID to refresh
   */
  refreshElement(id) {
    this._cache.delete(id);
    return this.getElementById(id);
  }
  
  // Convenience getters for commonly used elements
  
  get navConfig() {
    return this.getElementById('nav-config');
  }
  
  get categoriesList() {
    return this.getElementById('categories-list');
  }
  
  get toolsConfigList() {
    return this.getElementById('tools-config-list');
  }
  
  get secretsConfigList() {
    return this.getElementById('secrets-config-list');
  }
  
  get mcpServersList() {
    return this.getElementById('mcps-list');
  }
  
  get mcpToolsList() {
    return this.getElementById('mcp-tools-list');
  }
  
  get mcpSecretsList() {
    return this.getElementById('mcp-secrets-list');
  }
  
  get remoteMcpServersList() {
    return this.getElementById('remote-mcps-list');
  }
  
  get localMcpServersList() {
    return this.getElementById('local-mcps-list');
  }
  
  get yamlPreview() {
    return this.getElementById('yaml-preview');
  }
  
  get mcpConfigPreview() {
    return this.getElementById('mcp-config-preview');
  }
  
  get mcpFormatSelect() {
    return this.getElementById('mcp-format-select');
  }
  
  get configInstructionsContent() {
    return this.getElementById('config-instructions-content');
  }
  
  get configFileInput() {
    return this.getElementById('config-file');
  }
  
  get fileNameSpan() {
    return this.getElementById('file-name');
  }
  
  get copyConfigButton() {
    return this.getElementById('copy-config');
  }
  
  get downloadConfigButton() {
    return this.getElementById('download-config');
  }
  
  get resetConfigButton() {
    return this.getElementById('reset-config');
  }
  
  get saveConfigButton() {
    return this.getElementById('save-config');
  }

  get pendingChangesMessage() {
    return this.getElementById('pending-changes-message');
  }

  get loggingEnabled() {
    return this.getElementById('logging-enabled');
  }
  
  get loggingLevel() {
    return this.getElementById('logging-level');
  }
  
  get loggingMaxSize() {
    return this.getElementById('logging-max-size');
  }
  
  get loggingMaxFiles() {
    return this.getElementById('logging-max-files');
  }
  
  get setupTabBtn() {
    return this.getElementById('setup-tab-btn');
  }
  
  get setupContent() {
    return this.getElementById('setup-content');
  }
  
  get setupToolName() {
    return this.getElementById('setup-tool-name');
  }
  
  get setupTab() {
    return this.getElementById('setup-tab');
  }
}

/**
 * Create and export a singleton instance
 */
export const domManager = new DOMManager();
