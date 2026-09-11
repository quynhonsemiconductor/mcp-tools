/**
 * Theme Manager
 * Handles theme switching between light, dark, and auto (system preference)
 */

class ThemeManager {
  constructor() {
    this.STORAGE_KEY = 'mcp-tools-theme';
    this.themes = ['light', 'auto', 'dark'];
    this.currentTheme = this.loadTheme();
    this.systemPreference = this.getSystemPreference();
    
    // Listen for system preference changes
    this.mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    this.mediaQuery.addEventListener('change', () => {
      this.systemPreference = this.getSystemPreference();
      if (this.currentTheme === 'auto') {
        this.applyTheme('auto');
      }
    });
  }

  /**
   * Get system color scheme preference
   * @returns {string} 'dark' or 'light'
   */
  getSystemPreference() {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  /**
   * Load theme from localStorage or default to 'auto'
   * @returns {string} Theme name
   */
  loadTheme() {
    const saved = localStorage.getItem(this.STORAGE_KEY);
    return this.themes.includes(saved) ? saved : 'auto';
  }

  /**
   * Save theme to localStorage
   * @param {string} theme - Theme name
   */
  saveTheme(theme) {
    localStorage.setItem(this.STORAGE_KEY, theme);
  }

  /**
   * Apply theme to document
   * @param {string} theme - Theme name ('light', 'dark', or 'auto')
   */
  applyTheme(theme) {
    this.currentTheme = theme;
    this.saveTheme(theme);

    // Determine actual theme to apply
    const actualTheme = theme === 'auto' ? this.systemPreference : theme;
    
    // Update document attribute
    document.documentElement.setAttribute('data-theme', actualTheme);
    
    // Update Water.css stylesheet
    this.updateWaterCSS(actualTheme);
    
    // Dispatch custom event for other components
    window.dispatchEvent(new CustomEvent('themechange', { 
      detail: { theme: this.currentTheme, actualTheme } 
    }));
  }

  /**
   * Update Water.css stylesheet link
   * @param {string} actualTheme - 'light' or 'dark'
   */
  updateWaterCSS(actualTheme) {
    const waterLink = document.querySelector('link[href*="water.css"]');
    if (waterLink) {
      const newHref = actualTheme === 'dark' 
        ? 'https://cdn.jsdelivr.net/npm/water.css@2/out/dark.min.css'
        : 'https://cdn.jsdelivr.net/npm/water.css@2/out/water.min.css';
      waterLink.href = newHref;
    }
  }

  /**
   * Cycle to next theme
   */
  cycleTheme() {
    const currentIndex = this.themes.indexOf(this.currentTheme);
    const nextIndex = (currentIndex + 1) % this.themes.length;
    this.applyTheme(this.themes[nextIndex]);
  }

  /**
   * Get current theme
   * @returns {string} Current theme name
   */
  getTheme() {
    return this.currentTheme;
  }

  /**
   * Get actual applied theme (resolves 'auto' to 'light' or 'dark')
   * @returns {string} Actual theme name
   */
  getActualTheme() {
    return this.currentTheme === 'auto' ? this.systemPreference : this.currentTheme;
  }

  /**
   * Initialize theme on page load
   */
  init() {
    this.applyTheme(this.currentTheme);
    
    // Set up theme toggle when DOM is loaded
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => this.setupThemeToggle());
    } else {
      this.setupThemeToggle();
    }
  }

  /**
   * Set up theme toggle button functionality
   */
  setupThemeToggle() {
    const toggleBtn = document.getElementById('theme-toggle');
    const themeIcon = document.getElementById('theme-icon');
    
    if (toggleBtn && themeIcon) {
      // Set initial icon
      this.updateThemeIcon(themeIcon);
      
      // Add click listener
      toggleBtn.addEventListener('click', () => {
        this.cycleTheme();
        this.updateThemeIcon(themeIcon);
      });
      
      // Listen for theme changes (including system preference changes)
      window.addEventListener('themechange', () => {
        this.updateThemeIcon(themeIcon);
      });
    }
  }

  /**
   * Update theme toggle icon based on current theme
   * @param {HTMLElement} iconElement - Icon element to update
   */
  updateThemeIcon(iconElement) {
    const icons = {
      'light': '☀️',
      'auto': '🌓', 
      'dark': '🌙'
    };
    
    iconElement.textContent = icons[this.currentTheme] || '🌓';
    
    // Update button title for accessibility
    const toggleBtn = document.getElementById('theme-toggle');
    if (toggleBtn) {
      const themeNames = {
        'light': 'Light',
        'auto': 'Auto (System)',
        'dark': 'Dark'
      };
      toggleBtn.title = `Current: ${themeNames[this.currentTheme]}. Click to cycle themes.`;
    }
  }
}

// Create and export global instance
window.themeManager = new ThemeManager();

// Initialize theme immediately (before DOM load to prevent FOUC)
window.themeManager.init();
