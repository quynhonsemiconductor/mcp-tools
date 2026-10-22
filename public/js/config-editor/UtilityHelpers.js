/**
 * UtilityHelpers.js
 * 
 * Pure utility functions used across the config editor.
 * These functions have no side effects and can be easily tested.
 */

/**
 * Escape HTML to prevent XSS attacks
 * @param {string} text - Text to escape
 * @returns {string} Escaped HTML
 */
export function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Convert markdown content to sanitized HTML
 * @param {string} markdown - Markdown text to convert
 * @returns {string} Sanitized HTML
 */
export function convertMarkdownToHtml(markdown) {
  if (typeof marked !== 'undefined' && typeof DOMPurify !== 'undefined') {
    marked.setOptions({
      gfm: true,
      breaks: true,
      headerIds: true,
      mangle: false
    });
    
    const rawHtml = marked.parse(markdown);
    return DOMPurify.sanitize(rawHtml, {
      ALLOWED_TAGS: ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'a', 'ul', 'ol', 'li', 
                     'code', 'pre', 'strong', 'em', 'table', 'thead', 'tbody', 'tr', 
                     'th', 'td', 'blockquote', 'br', 'hr'],
      ALLOWED_ATTR: ['href', 'id', 'class']
    });
  }
  
  console.warn('marked.js or DOMPurify not loaded, displaying raw markdown');
  return `<pre>${escapeHtml(markdown)}</pre>`;
}

/**
 * Group tools by category
 * @param {Array} tools - Array of tool objects
 * @returns {Object} Tools grouped by category
 */
export function groupToolsByCategory(tools) {
  const grouped = {};
  tools.forEach(tool => {
    const category = tool.category || 'Uncategorized';
    if (!grouped[category]) {
      grouped[category] = [];
    }
    grouped[category].push(tool);
  });
  return grouped;
}

/**
 * Extract parent category from a category name
 * For categorized tools like "Github: Actions", "Github: Branches", etc.,
 * this extracts the parent category name (e.g., "GitHub")
 * @param {string} category - Category name
 * @returns {string} Parent category name
 */
export function getParentCategory(category) {
  const colonIndex = category.indexOf(':');
  if (colonIndex !== -1) {
    return category.substring(0, colonIndex).trim();
  }
  return category;
}

/**
 * Get tristate for a category group
 * @param {Array} categoryTools - Array of tools in the category
 * @param {string} category - Category name
 * @param {Object} config - Current configuration object
 * @returns {string} 'included', 'excluded', or 'neutral'
 */
export function getCategoryTristate(categoryTools, category, config) {
  const tools = config.tools || {};
  
  // Check if category is explicitly included/excluded at category level
  const isCategoryIncluded = tools.includeCategories?.includes(category);
  const isCategoryExcluded = tools.excludeCategories?.includes(category);
  
  if (isCategoryExcluded) {
    return 'excluded';
  }
  
  let includedCount = 0;
  let excludedCount = 0;
  
  categoryTools.forEach(tool => {
    const isExplicitlyIncluded = tools.include?.includes(tool.id);
    const isExplicitlyExcluded = tools.exclude?.includes(tool.id);
    
    // PRECEDENCE: Explicit include > Explicit exclude > Category include
    if (isExplicitlyIncluded) {
      // Explicit include takes precedence over exclude patterns
      includedCount++;
    } else if (isExplicitlyExcluded) {
      excludedCount++;
    } else if (isCategoryIncluded) {
      // Tool is implicitly included via category
      includedCount++;
    }
  });
  
  // All tools explicitly included
  if (includedCount === categoryTools.length) {
    return 'included';
  }
  
  // All tools explicitly excluded
  if (excludedCount === categoryTools.length) {
    return 'excluded';
  }
  
  // Mixed or neutral
  return 'neutral';
}

/**
 * Get tristate for an individual tool
 * @param {string} toolId - Tool identifier
 * @param {Object} config - Current configuration object
 * @returns {string} 'included', 'excluded', or 'neutral'
 */
export function getToolTristate(toolId, config) {
  const tools = config.tools || {};

  const isExplicitlyIncluded = tools.include?.includes(toolId);
  const isExplicitlyExcluded = tools.exclude?.includes(toolId);

  if (isExplicitlyIncluded) {
    return 'included';
  } else if (isExplicitlyExcluded) {
    return 'excluded';
  }

  return 'neutral';
}

/**
 * Deep structural equality for plain JSON-like values (objects, arrays, primitives).
 * Object key order does NOT matter; array element order does. Intended for comparing
 * configuration snapshots without depending on key insertion order.
 * @param {*} a
 * @param {*} b
 * @returns {boolean} True if a and b are deeply equal
 */
export function deepEqual(a, b) {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) {
    return false;
  }
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;
  return aKeys.every(
    (key) => Object.prototype.hasOwnProperty.call(b, key) && deepEqual(a[key], b[key])
  );
}
