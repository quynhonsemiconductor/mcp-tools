/**
 * StateManager.js
 *
 * Centralized state management for the config editor.
 * Provides controlled access to application state with getters and setters.
 */

import { deepEqual } from './UtilityHelpers.js';

/**
 * StateManager class - manages application state
 */
export class StateManager {
  constructor(initialState = null) {
    this._state = initialState || {
      mcps: [],
      categorizedTools: {},
      currentConfig: {
        tools: {
          include: [],
          exclude: [],
          includeCategories: [],
          excludeCategories: [],
          includeMCPs: [],
          includeRemoteMCPs: [],
          includeLocalMCPs: [],
          mcpArgs: {}
        },
        logging: {
          enabled: true,
          level: 'info',
          maxSize: 5,
          maxFiles: 5
        },
        prompts: {
          repositories: []
        }
      },
      originalConfig: null,
      selectedMcp: null,
      selectedProvider: null,
      isUploadedConfig: false
    };
    
    // Observers for state changes (optional, for future use)
    this._observers = [];
  }
  
  /**
   * Get the entire state (read-only copy)
   * @returns {Object} Deep copy of current state
   */
  getState() {
    return JSON.parse(JSON.stringify(this._state));
  }
  
  /**
   * Set entire state (replaces current state)
   * @param {Object} newState - New state object
   */
  setState(newState) {
    this._state = JSON.parse(JSON.stringify(newState));
    this._notifyObservers();
  }
  
  /**
   * Get MCPs array
   * @returns {Array} Array of MCP servers
   */
  getMcps() {
    return [...this._state.mcps];
  }
  
  /**
   * Set MCPs array
   * @param {Array} mcps - Array of MCP servers
   */
  setMcps(mcps) {
    this._state.mcps = [...mcps];
    this._notifyObservers();
  }
  
  /**
   * Update tools and connection status for a specific MCP
   * @param {string} mcpId - MCP identifier
   * @param {string} provider - Provider type ('remote', 'local', 'bundled')
   * @param {Array} tools - Array of tool objects
   * @param {boolean} [connected] - Optional connection status
   */
  updateMcpTools(mcpId, provider, tools, connected) {
    // Find the MCP in the state
    const mcpIndex = this._state.mcps.findIndex(
      m => m.id === mcpId && m.provider === provider
    );
    
    if (mcpIndex === -1) {
      console.warn(`StateManager: MCP not found: ${mcpId} (${provider})`);
      return;
    }
    
    // Create a new array to maintain immutability
    const updatedMcps = [...this._state.mcps];
    const updates = {
      ...updatedMcps[mcpIndex],
      tools: [...tools]
    };
    
    // Update connection status if provided
    if (connected !== undefined) {
      updates.connected = connected;
    }
    
    updatedMcps[mcpIndex] = updates;
    
    this._state.mcps = updatedMcps;
    console.log(`StateManager: Updated tools for ${mcpId} (${provider}):`, tools.length, 'tools', connected !== undefined ? `connected: ${connected}` : '');
    this._notifyObservers();
  }
  
  /**
   * Get categorized tools (for backward compatibility)
   * @returns {Object} Categorized tools object
   */
  getCategorizedTools() {
    return { ...this._state.categorizedTools };
  }
  
  /**
   * Set categorized tools
   * @param {Object} categorizedTools - Categorized tools object
   */
  setCategorizedTools(categorizedTools) {
    this._state.categorizedTools = { ...categorizedTools };
    this._notifyObservers();
  }
  
  /**
   * Get current configuration
   * @returns {Object} Current configuration object
   */
  getCurrentConfig() {
    return JSON.parse(JSON.stringify(this._state.currentConfig));
  }
  
  /**
   * Set current configuration
   * @param {Object} config - Configuration object
   */
  setCurrentConfig(config) {
    this._state.currentConfig = JSON.parse(JSON.stringify(config));
    this._notifyObservers();
  }
  
  /**
   * Update current configuration (partial update)
   * @param {Object} updates - Partial configuration updates
   */
  updateCurrentConfig(updates) {
    this._state.currentConfig = {
      ...this._state.currentConfig,
      ...updates
    };
    this._notifyObservers();
  }
  
  /**
   * Get original configuration
   * @returns {Object|null} Original configuration object
   */
  getOriginalConfig() {
    return this._state.originalConfig ?
      JSON.parse(JSON.stringify(this._state.originalConfig)) :
      null;
  }

  /**
   * Set original configuration (baseline)
   * @param {Object} config - Original configuration object
   */
  setOriginalConfig(config) {
    this._state.originalConfig = JSON.parse(JSON.stringify(config));
    this._notifyObservers();
  }

  /**
   * Check whether the staged config differs from the saved baseline.
   * Uses a deep, key-order-independent equality check.
   * @returns {boolean} True when currentConfig differs from originalConfig
   */
  isDirty() {
    if (!this._state.originalConfig) {
      return false;
    }
    return !deepEqual(this._state.currentConfig, this._state.originalConfig);
  }
  
  /**
   * Get selected MCP ID or category
   * @returns {string|null} Selected MCP identifier
   */
  getSelectedMcp() {
    return this._state.selectedMcp;
  }
  
  /**
   * Get selected provider type
   * @returns {string|null} Provider type ('native', 'bundled', 'remote', 'local')
   */
  getSelectedProvider() {
    return this._state.selectedProvider;
  }
  
  /**
   * Set selected MCP and provider
   * @param {string|null} mcpId - MCP identifier or category name
   * @param {string|null} provider - Provider type
   */
  setSelectedMcp(mcpId, provider = null) {
    this._state.selectedMcp = mcpId;
    this._state.selectedProvider = provider;
    this._notifyObservers();
  }
  
  /**
   * Check if current config is uploaded
   * @returns {boolean} True if config was uploaded by user
   */
  isUploadedConfig() {
    return this._state.isUploadedConfig;
  }
  
  /**
   * Set uploaded config flag
   * @param {boolean} isUploaded - Whether config was uploaded
   */
  setUploadedConfig(isUploaded) {
    this._state.isUploadedConfig = isUploaded;
    this._notifyObservers();
  }
  
  /**
   * Reset configuration to original
   */
  resetToOriginalConfig() {
    if (this._state.originalConfig) {
      this._state.currentConfig = JSON.parse(JSON.stringify(this._state.originalConfig));
      this._state.isUploadedConfig = false;
      this._notifyObservers();
    }
  }
  
  /**
   * Register an observer for state changes
   * @param {Function} callback - Function to call when state changes
   * @returns {Function} Unsubscribe function
   */
  subscribe(callback) {
    this._observers.push(callback);
    // Return unsubscribe function
    return () => {
      const index = this._observers.indexOf(callback);
      if (index > -1) {
        this._observers.splice(index, 1);
      }
    };
  }
  
  /**
   * Notify all observers of state change
   * @private
   */
  _notifyObservers() {
    this._observers.forEach(callback => {
      try {
        callback(this.getState());
      } catch (error) {
        console.error('Error in state observer:', error);
      }
    });
  }
}

/**
 * Create and export a singleton instance
 */
export const stateManager = new StateManager();
