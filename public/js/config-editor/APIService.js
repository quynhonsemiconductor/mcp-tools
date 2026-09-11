/**
 * APIService.js
 * 
 * Manages all backend API communication for the config editor.
 * Provides centralized error handling, logging, and caching.
 */

/**
 * APIService class - handles backend API communication
 */
export class APIService {
  constructor() {
    // Cache for setup documentation
    this._setupDocCache = {};
  }

  /**
   * Fetch all MCP servers using the unified endpoint
   * @returns {Promise<Array>} Array of MCP server objects
   */
  async fetchAllMcps() {
    try {
      console.log('APIService: Fetching all MCPs from /api/mcps');
      const response = await fetch('/api/mcps');
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      const mcps = data.mcps || [];
      
      console.log(`APIService: Loaded ${mcps.length} MCP servers:`, 
        mcps.map(m => `${m.name} (${m.provider})`));
      
      return mcps;
      
    } catch (error) {
      console.error('APIService: Error fetching MCPs:', error);
      throw new Error(`Failed to fetch MCPs: ${error.message}`);
    }
  }

  /**
   * Fetch current configuration
   * @returns {Promise<Object>} Current configuration object
   */
  async fetchCurrentConfig() {
    try {
      console.log('APIService: Fetching current config from /api/config');
      const response = await fetch('/api/config');
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const config = await response.json();
      console.log('APIService: Config fetched successfully', config.source || 'default');
      
      return config;
      
    } catch (error) {
      console.error('APIService: Error fetching config:', error);
      throw new Error(`Failed to fetch config: ${error.message}`);
    }
  }

  /**
   * Fetch setup documentation for a specific tool
   * @param {string} toolId - Tool identifier
   * @param {string} [sourceType] - Optional source type (bundled, remote, local, native)
   * @returns {Promise<Object>} Setup documentation object
   */
  async fetchSetupDocumentation(toolId, sourceType) {
    const cacheKey = sourceType ? `${toolId}:${sourceType}` : toolId;
    
    // Return cached result if available
    if (this._setupDocCache[cacheKey]) {
      console.log(`APIService: Using cached setup docs for: ${toolId} (${sourceType || 'any'})`);
      return this._setupDocCache[cacheKey];
    }

    try {
      console.log(`APIService: Fetching setup documentation for: ${toolId} (${sourceType || 'any'})`);
      
      let url = `/api/setup/${encodeURIComponent(toolId)}`;
      if (sourceType) {
        url += `?type=${encodeURIComponent(sourceType)}`;
      }
      
      const response = await fetch(url);
      
      // 404 is expected when setup docs don't exist
      if (response.status === 404) {
        const result = { exists: false, toolId, sourceType };
        this._setupDocCache[cacheKey] = result;
        return result;
      }
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const data = await response.json();
      console.log(`APIService: Setup docs fetched for ${toolId} (${sourceType || 'any'}):`, data.source);
      
      // Cache the result
      this._setupDocCache[cacheKey] = data;
      return data;
      
    } catch (error) {
      console.error('APIService: Error fetching setup documentation:', error);
      return {
        exists: false,
        error: error.message,
        toolId,
        sourceType
      };
    }
  }

  /**
   * Save configuration to backend
   * @param {string} yaml - YAML configuration content
   * @param {string} [filePath] - Optional file path to save to
   * @returns {Promise<Object>} Save result
   */
  async saveConfig(yaml, filePath) {
    try {
      console.log('APIService: Saving config to /api/config', filePath ? `(${filePath})` : '');
      
      const formData = new FormData();
      formData.append('content', yaml);
      
      if (filePath) {
        formData.append('filePath', filePath);
      }
      
      const response = await fetch('/api/config', {
        method: 'POST',
        body: formData
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const result = await response.json();
      console.log('APIService: Config saved successfully');
      
      return { success: true, ...result };
      
    } catch (error) {
      console.error('APIService: Error saving config:', error);
      throw new Error(`Failed to save configuration: ${error.message}`);
    }
  }

  /**
   * Parse uploaded configuration file
   * @param {File} file - Configuration file to parse
   * @returns {Promise<Object>} Parsed configuration object
   */
  async parseConfig(file) {
    try {
      console.log('APIService: Parsing config file:', file.name);
      
      const formData = new FormData();
      formData.append('config', file);
      
      const response = await fetch('/api/config/parse', {
        method: 'POST',
        body: formData
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText);
      }
      
      const config = await response.json();
      console.log('APIService: Config parsed successfully');
      
      return config;
      
    } catch (error) {
      console.error('APIService: Error parsing config:', error);
      throw new Error(`Failed to parse configuration: ${error.message}`);
    }
  }

  /**
   * Fetch tools for remote MCPs (lazy loaded with initialization)
   * @returns {Promise<Object>} Remote MCPs with their tools
   */
  async fetchRemoteMcpTools() {
    try {
      console.log('APIService: Fetching remote MCP tools from /api/remote-mcps/tools');
      const response = await fetch('/api/remote-mcps/tools');
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      console.log('APIService: Remote MCP tools loaded:', data.mcps?.length || 0, 'MCPs');
      
      return data;
      
    } catch (error) {
      console.error('APIService: Error fetching remote MCP tools:', error);
      throw new Error(`Failed to fetch remote MCP tools: ${error.message}`);
    }
  }

  /**
   * Fetch tools for local MCPs (lazy loaded with initialization)
   * @returns {Promise<Object>} Local MCPs with their tools
   */
  async fetchLocalMcpTools() {
    try {
      console.log('APIService: Fetching local MCP tools from /api/local-mcps/tools');
      const response = await fetch('/api/local-mcps/tools');
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      console.log('APIService: Local MCP tools loaded:', data.mcps?.length || 0, 'MCPs');
      
      return data;
      
    } catch (error) {
      console.error('APIService: Error fetching local MCP tools:', error);
      throw new Error(`Failed to fetch local MCP tools: ${error.message}`);
    }
  }

  /**
   * Clear setup documentation cache
   */
  clearSetupDocCache() {
    console.log('APIService: Clearing setup doc cache');
    this._setupDocCache = {};
  }

  /**
   * Clear specific cache entry
   * @param {string} toolId - Tool identifier
   * @param {string} [sourceType] - Optional source type
   */
  clearSetupDocCacheEntry(toolId, sourceType) {
    const cacheKey = sourceType ? `${toolId}:${sourceType}` : toolId;
    if (this._setupDocCache[cacheKey]) {
      console.log(`APIService: Clearing cache for: ${toolId} (${sourceType || 'any'})`);
      delete this._setupDocCache[cacheKey];
    }
  }
}

/**
 * Create and export a singleton instance
 */
export const apiService = new APIService();
