/**
 * EventHandlers Module
 * 
 * Manages all event listener attachment and handling for the config editor.
 * Separates event handling concerns from rendering and business logic.
 * 
 * @module EventHandlers
 */

/**
 * EventHandlers class
 * Handles event listener attachment for various UI elements
 */
class EventHandlers {
  /**
   * Create an EventHandlers instance
   * @param {Object} callbacks - Callback functions for handling events
   * @param {Function} callbacks.onNavigate - Navigation callback
   * @param {Function} callbacks.onFileUpload - File upload callback
   * @param {Function} callbacks.onCopyConfig - Copy config callback
   * @param {Function} callbacks.onDownloadConfig - Download config callback
   * @param {Function} callbacks.onResetConfig - Reset config callback
   * @param {Function} callbacks.onSaveConfig - Save config callback
   * @param {Function} callbacks.onLoggingChange - Logging config change callback
   * @param {Function} callbacks.onFormatChange - Format change callback
   * @param {Function} callbacks.onTabChange - Tab change callback
   * @param {Function} callbacks.onCategoryClick - Category click callback
   * @param {Function} callbacks.onCategoryToggle - Category toggle callback
   * @param {Function} callbacks.onMcpClick - MCP click callback
   * @param {Function} callbacks.onMcpToggle - MCP toggle callback
   * @param {Function} callbacks.onToolCategoryExpand - Tool category expand callback
   * @param {Function} callbacks.onCategoryGroupToggle - Category group toggle callback
   * @param {Function} callbacks.onToolToggle - Tool toggle callback
   */
  constructor(callbacks) {
    this.callbacks = callbacks;
  }

  /**
   * Setup all event listeners
   * Call this once during initialization
   */
  setupAllListeners(elements) {
    this.setupNavigationListeners(elements);
    this.setupFileUploadListeners(elements);
    this.setupActionButtonListeners(elements);
    this.setupLoggingConfigListeners(elements);
    this.setupFormatSelectListeners(elements);
    this.setupTabListeners(elements);
  }

  /**
   * Setup navigation event listeners
   */
  setupNavigationListeners(elements) {
    const { navConfig } = elements;
    
    if (navConfig) {
      navConfig.addEventListener('click', (e) => {
        e.preventDefault();
        if (this.callbacks.onNavigate) {
          this.callbacks.onNavigate('/config');
        }
        history.pushState({}, '', '/config');
      });
    }
  }

  /**
   * Setup file upload event listeners
   */
  setupFileUploadListeners(elements) {
    const { configFileInput } = elements;
    
    if (configFileInput) {
      configFileInput.addEventListener('change', () => {
        if (this.callbacks.onFileUpload) {
          this.callbacks.onFileUpload();
        }
      });
    }
  }

  /**
   * Setup action button event listeners
   */
  setupActionButtonListeners(elements) {
    const { copyConfigButton, downloadConfigButton, resetConfigButton, saveConfigButton } = elements;
    
    if (copyConfigButton) {
      copyConfigButton.addEventListener('click', () => {
        if (this.callbacks.onCopyConfig) {
          this.callbacks.onCopyConfig();
        }
      });
    }
    
    if (downloadConfigButton) {
      downloadConfigButton.addEventListener('click', () => {
        if (this.callbacks.onDownloadConfig) {
          this.callbacks.onDownloadConfig();
        }
      });
    }
    
    if (resetConfigButton) {
      resetConfigButton.addEventListener('click', () => {
        if (this.callbacks.onResetConfig) {
          this.callbacks.onResetConfig();
        }
      });
    }
    
    if (saveConfigButton) {
      saveConfigButton.addEventListener('click', () => {
        if (this.callbacks.onSaveConfig) {
          this.callbacks.onSaveConfig();
        }
      });
    }
  }

  /**
   * Setup logging configuration event listeners
   */
  setupLoggingConfigListeners(elements) {
    const { loggingEnabled, loggingLevel, loggingMaxSize, loggingMaxFiles } = elements;
    
    if (loggingEnabled) {
      loggingEnabled.addEventListener('change', (e) => {
        if (this.callbacks.onLoggingChange) {
          this.callbacks.onLoggingChange('enabled', loggingEnabled.checked);
        }
      });
    }
    
    if (loggingLevel) {
      loggingLevel.addEventListener('change', (e) => {
        if (this.callbacks.onLoggingChange) {
          this.callbacks.onLoggingChange('level', loggingLevel.value);
        }
      });
    }
    
    if (loggingMaxSize) {
      loggingMaxSize.addEventListener('change', (e) => {
        if (this.callbacks.onLoggingChange) {
          this.callbacks.onLoggingChange('maxSize', parseInt(loggingMaxSize.value, 10));
        }
      });
    }
    
    if (loggingMaxFiles) {
      loggingMaxFiles.addEventListener('change', (e) => {
        if (this.callbacks.onLoggingChange) {
          this.callbacks.onLoggingChange('maxFiles', parseInt(loggingMaxFiles.value, 10));
        }
      });
    }
  }

  /**
   * Setup format select event listeners
   */
  setupFormatSelectListeners(elements) {
    const { mcpFormatSelect } = elements;
    
    if (mcpFormatSelect) {
      mcpFormatSelect.addEventListener('change', () => {
        if (this.callbacks.onFormatChange) {
          this.callbacks.onFormatChange();
        }
      });
    }
  }

  /**
   * Setup tab navigation event listeners
   */
  setupTabListeners(elements) {
    // Sidebar tabs
    document.querySelectorAll('.sidebar-tabs-container .tab-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const tabId = btn.getAttribute('data-tab');
        if (this.callbacks.onTabChange) {
          this.callbacks.onTabChange('sidebar', tabId);
        }
      });
    });

    // Main content tabs
    document.querySelectorAll('.main-tabs-container .tab-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const tabId = btn.getAttribute('data-tab');
        if (this.callbacks.onTabChange) {
          this.callbacks.onTabChange('main', tabId);
        }
      });
    });

    // Tools tabs
    document.querySelectorAll('.tools-tabs-container .tab-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const tabId = btn.getAttribute('data-tab');
        if (this.callbacks.onTabChange) {
          this.callbacks.onTabChange('tools', tabId);
        }
      });
    });
  }

  /**
   * Attach event listeners for category items (native tools)
   */
  attachCategoryEventListeners() {
    // Add event listeners to category items
    document.querySelectorAll('.category-item').forEach((item) => {
      item.addEventListener('click', (e) => {
        if (
          e.target.classList.contains('toggle-switch') ||
          e.target.classList.contains('category-checkbox') ||
          e.target.classList.contains('toggle-slider')
        ) {
          return;
        }
        
        const category = item.dataset.category;
        if (this.callbacks.onCategoryClick) {
          this.callbacks.onCategoryClick(category, 'native');
        }
      });
    });
    
    document.querySelectorAll('.category-checkbox').forEach((checkbox) => {
      checkbox.addEventListener('change', (e) => {
        const category = checkbox.dataset.category;
        const parentCategory = checkbox.dataset.parentCategory;
        if (this.callbacks.onCategoryToggle) {
          this.callbacks.onCategoryToggle(category, parentCategory, checkbox.checked);
        }
      });
      
      if (checkbox.classList.contains('indeterminate-init')) {
        checkbox.indeterminate = true;
        checkbox.classList.add('indeterminate');
        checkbox.classList.remove('indeterminate-init');
      }
    });
  }

  /**
   * Attach event listeners for MCP list items
   */
  attachMcpListEventListeners(container) {
    if (!container) return;
    
    // Add event listeners to MCP items
    container.querySelectorAll('.mcp-item').forEach((item) => {
      item.addEventListener('click', (e) => {
        if (
          e.target.classList.contains('toggle-switch') ||
          e.target.classList.contains('mcp-checkbox') ||
          e.target.classList.contains('toggle-slider')
        ) {
          return;
        }
        
        const mcpId = item.dataset.mcp;
        const provider = item.dataset.provider;
        if (this.callbacks.onMcpClick) {
          this.callbacks.onMcpClick(mcpId, provider);
        }
      });
    });
    
    container.querySelectorAll('.mcp-checkbox').forEach((checkbox) => {
      checkbox.addEventListener('change', (e) => {
        const mcpId = checkbox.dataset.mcp;
        const provider = checkbox.dataset.provider;
        if (this.callbacks.onMcpToggle) {
          this.callbacks.onMcpToggle(mcpId, provider, checkbox.checked);
        }
      });
      
      if (checkbox.classList.contains('indeterminate-init')) {
        checkbox.indeterminate = true;
        checkbox.classList.add('indeterminate');
        checkbox.classList.remove('indeterminate-init');
      }
    });
  }

  /**
   * Attach event listeners for tools editor (category expansion, tristate toggles)
   * Uses event delegation to avoid duplicate listeners
   */
  attachToolsEditorEventListeners() {
    // Remove any existing delegated listener to avoid duplicates
    if (this.toolsEditorDelegate) {
      document.removeEventListener('click', this.toolsEditorDelegate, true);
    }

    // Create delegated event handler
    this.toolsEditorDelegate = (e) => {
      // Handle category header clicks (expand/collapse)
      const headerContent = e.target.closest('.category-header-content');
      if (headerContent && !e.target.closest('.tristate-toggle')) {
        const group = headerContent.closest('.tool-category-group');
        if (!group) return;
        
        const content = group.querySelector('.tool-category-content');
        const icon = group.querySelector('.category-expand-icon');
        
        if (this.callbacks.onToolCategoryExpand) {
          const isExpanded = content.style.display !== 'none';
          this.callbacks.onToolCategoryExpand(group, !isExpanded);
        } else {
          // Default behavior if no callback
          if (content.style.display === 'none') {
            content.style.display = 'block';
            icon.textContent = '▼';
          } else {
            content.style.display = 'none';
            icon.textContent = '▶';
          }
        }
        return;
      }

      // Handle tristate category toggle clicks
      const categoryToggle = e.target.closest('.tristate-toggle');
      if (categoryToggle) {
        e.stopPropagation(); // Prevent event from bubbling to parent header
        const currentState = categoryToggle.dataset.state;
        const category = categoryToggle.dataset.category;
        const isNative = categoryToggle.dataset.native === 'true';
        const mcpId = categoryToggle.dataset.mcp;
        
        // Cycle through states: neutral -> included -> excluded -> neutral
        let newState;
        if (currentState === 'neutral') {
          newState = 'included';
        } else if (currentState === 'included') {
          newState = 'excluded';
        } else {
          newState = 'neutral';
        }
        
        categoryToggle.dataset.state = newState;
        
        // Apply the state change
        if (this.callbacks.onCategoryGroupToggle) {
          this.callbacks.onCategoryGroupToggle(category, newState, isNative, mcpId);
        }
        return;
      }

      // Handle individual tool toggle clicks
      const toolToggle = e.target.closest('.tristate-toggle-small');
      if (toolToggle) {
        e.stopPropagation(); // Prevent event from bubbling to parent header
        const currentState = toolToggle.dataset.state;
        const toolId = toolToggle.dataset.toolId;
        const mcpId = toolToggle.dataset.mcp;
        
        // Cycle through states: neutral -> included -> excluded -> neutral
        let newState;
        if (currentState === 'neutral') {
          newState = 'included';
        } else if (currentState === 'included') {
          newState = 'excluded';
        } else {
          newState = 'neutral';
        }
        
        toolToggle.dataset.state = newState;
        
        // Apply the state change
        if (this.callbacks.onToolToggle) {
          this.callbacks.onToolToggle(toolId, newState, mcpId);
        }
        return;
      }
    };

    // Use capture phase to handle clicks before they bubble
    document.addEventListener('click', this.toolsEditorDelegate, true);
  }

  /**
   * Attach all MCP-related event listeners
   * Combines category and MCP list listeners
   */
  attachMcpEventListeners(containers) {
    this.attachCategoryEventListeners();
    
    if (containers.mcpServersList) {
      this.attachMcpListEventListeners(containers.mcpServersList);
    }
    if (containers.remoteMcpServersList) {
      this.attachMcpListEventListeners(containers.remoteMcpServersList);
    }
    if (containers.localMcpServersList) {
      this.attachMcpListEventListeners(containers.localMcpServersList);
    }
  }
}

/**
 * Factory function to create EventHandlers instance
 * @param {Object} callbacks - Callback functions for event handling
 * @returns {EventHandlers} New EventHandlers instance
 */
export function createEventHandlers(callbacks) {
  return new EventHandlers(callbacks);
}
