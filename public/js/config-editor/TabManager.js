/**
 * TabManager.js
 * 
 * Manages tab navigation and visibility across different tab containers.
 * Handles activating/deactivating tabs, updating visibility based on content,
 * and managing tab state.
 */

/**
 * TabManager class
 * Centralizes all tab-related operations for consistent behavior
 */
class TabManager {
  /**
   * Activate a tab in the sidebar tab container
   * @param {string} tabId - ID of the tab to activate
   */
  activateSidebarTab(tabId) {
    document.querySelectorAll('.sidebar-tabs-container .tab-btn').forEach((btn) => {
      btn.classList.remove('active');
    });

    document.querySelectorAll('.sidebar-tabs-container .tab-pane').forEach((pane) => {
      pane.classList.remove('active');
    });

    document.querySelector(`.sidebar-tabs-container .tab-btn[data-tab="${tabId}"]`)?.classList.add('active');
    document.getElementById(tabId)?.classList.add('active');
  }

  /**
   * Activate a tab in the main content area
   * @param {string} tabId - ID of the tab to activate
   */
  activateMainTab(tabId) {
    document.querySelectorAll('.main-tabs-container .tab-btn').forEach((btn) => {
      btn.classList.remove('active');
    });

    document.querySelectorAll('.main-tabs-container .tab-pane').forEach((pane) => {
      pane.classList.remove('active');
    });

    const tabBtn = document.querySelector(`.main-tabs-container .tab-btn[data-tab="${tabId}"]`);
    const tabPane = document.getElementById(tabId);
    
    if (tabBtn && tabPane) {
      tabBtn.classList.add('active');
      tabPane.classList.add('active');
    }
  }

  /**
   * Activate a tool tab in the tool content area
   * @param {string} tabId - ID of the tab to activate
   */
  activateToolsTab(tabId) {
    document.querySelectorAll('.tools-tabs-container .tab-btn').forEach((btn) => {
      btn.classList.remove('active');
    });

    document.querySelectorAll('.tools-tabs-container .tab-pane').forEach((pane) => {
      pane.classList.remove('active');
    });

    const tabBtn = document.querySelector(`.tools-tabs-container .tab-btn[data-tab="${tabId}"]`);
    const tabPane = document.getElementById(tabId);
    
    if (tabBtn && tabPane) {
      tabBtn.classList.add('active');
      tabPane.classList.add('active');
    }
  }

  /**
   * Update tab visibility based on available data
   * Automatically switches to appropriate tab if current active tab is hidden
   * @param {boolean} hasTools - Whether tools are available
   * @param {boolean} hasSecrets - Whether secrets are available
   */
  updateTabVisibility(hasTools, hasSecrets) {
    const toolsTabBtn = document.querySelector('.tools-tabs-container .tab-btn[data-tab="tools-tab"]');
    const secretsTabBtn = document.querySelector('.tools-tabs-container .tab-btn[data-tab="secrets-tab"]');
    
    if (toolsTabBtn) {
      toolsTabBtn.style.display = hasTools ? 'inline-block' : 'none';
    }
    
    if (secretsTabBtn) {
      secretsTabBtn.style.display = hasSecrets ? 'inline-block' : 'none';
    }
    
    const toolsTab = document.getElementById('tools-tab');
    const secretsTab = document.getElementById('secrets-tab');
    
    // If tools tab is active but has no tools, switch to appropriate tab
    if (!hasTools && toolsTab && toolsTab.classList.contains('active')) {
      this.activateMainTab('preview-tab');
      this.activateToolsTab('secrets-tab');
    }
    
    // If secrets tab is active but has no secrets, switch to appropriate tab
    if (!hasSecrets && secretsTab && secretsTab.classList.contains('active')) {
      this.activateMainTab('preview-tab');
      this.activateToolsTab('tools-tab');
    }
  }

  /**
   * Get the currently active tab in a container
   * @param {string} containerSelector - Selector for the tab container
   * @returns {string|null} ID of the active tab or null if none active
   */
  getActiveTab(containerSelector) {
    const activeBtn = document.querySelector(`${containerSelector} .tab-btn.active`);
    return activeBtn ? activeBtn.getAttribute('data-tab') : null;
  }
}

/**
 * Factory function to create TabManager instances
 * @returns {TabManager} New TabManager instance
 */
export function createTabManager() {
  return new TabManager();
}
