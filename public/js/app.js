// MCP Tools Web Interface

// DOM Elements
const homeView = document.getElementById('home-view');
const toolsView = document.getElementById('tools-view');
const historyView = document.getElementById('history-view');
const logsView = document.getElementById('logs-view');
const toolsList = document.getElementById('tools-list');
const toolHistory = document.getElementById('tool-history');
const recentCalls = document.getElementById('recent-calls');
const navHome = document.getElementById('nav-home');
const navTools = document.getElementById('nav-tools');
const navHistory = document.getElementById('nav-history');
const navLogs = document.getElementById('nav-logs');
const configView = document.getElementById('config-view');
const navConfig = document.getElementById('nav-config');
const historySearch = document.getElementById('history-search');
const toolList = document.getElementById('tool-list');
const toolListContainer = document.getElementById('tool-list-container');
const selectedToolDisplay = document.getElementById('selected-tool');

// State
let tools = [];
let currentTool = null;
let templates = {};
let searchTerm = '';
let historySearchTerm = '';

// Template Initialization
async function loadTemplates() {
  try {
    // Load Handlebars templates, partials, etc
    const response = await fetch('/templates');
    if (!response.ok) throw new Error(`Failed to load templates!`);

    const templatesResp = await response.json();

    for (const [name, templateText] of Object.entries(templatesResp)) {
      if (templateText.includes('{{!-- PARTIAL --}}')) {
        Handlebars.registerPartial(name, templateText);
      } else {
        templates[name] = Handlebars.compile(templateText);
      }
    }

    // Register helpers
    Handlebars.registerHelper('formatDate', function (timestamp) {
      // Convert seconds to milliseconds for JavaScript Date
      return new Date(timestamp * 1000).toLocaleString();
    });

    Handlebars.registerHelper('formatJson', function (json) {
      try {
        if (typeof json === 'string') {
          return JSON.stringify(JSON.parse(json), null, 2);
        }
        return JSON.stringify(json, null, 2);
      } catch (e) {
        return json || '';
      }
    });

    Handlebars.registerHelper('substring', function (str, start, end) {
      if (typeof str !== 'string') return '';
      // Make sure we have a string to work with
      str = str || '';
      const shortened = str.substring(start, end);

      return shortened.length < str.length ? `${shortened}...` : shortened;
    });

    // Helper to check if a string is empty or undefined
    Handlebars.registerHelper('isEmpty', function (value) {
      return !value || value === '';
    });

    // After templates are loaded, first load tools data
    const toolsResponse = await fetchAPI('/tools');
    tools = toolsResponse?.tools || [];

    // Then initialize the app with navigation
    navigate(window.location.pathname);
  } catch (error) {
    console.error('Error loading templates:', error);
  }
}

// Router
async function navigate(route) {
  // Clean up logs auto-refresh when navigating away from /logs
  if (typeof window.stopLogsAutoRefresh === 'function') {
    window.stopLogsAutoRefresh();
  }

  switch (route) {
    case '/':
      homeView.classList.remove('hidden');
      toolsView.classList.add('hidden');
      historyView.classList.add('hidden');
      configView.classList.add('hidden');
      logsView.classList.add('hidden');
      navHome.classList.add('active');
      navTools.classList.remove('active');
      navHistory.classList.remove('active');
      navConfig.classList.remove('active');
      navLogs.classList.remove('active');
      loadRecentCalls();
      break;
    case '/tools':
      homeView.classList.add('hidden');
      toolsView.classList.remove('hidden');
      historyView.classList.add('hidden');
      configView.classList.add('hidden');
      logsView.classList.add('hidden');
      navHome.classList.remove('active');
      navTools.classList.add('active');
      navHistory.classList.remove('active');
      navConfig.classList.remove('active');
      navLogs.classList.remove('active');
      await loadTools();
      break;
    case '/history':
      homeView.classList.add('hidden');
      toolsView.classList.add('hidden');
      historyView.classList.remove('hidden');
      configView.classList.add('hidden');
      logsView.classList.add('hidden');
      navHome.classList.remove('active');
      navTools.classList.remove('active');
      navHistory.classList.add('active');
      navConfig.classList.remove('active');
      navLogs.classList.remove('active');
      // Ensure tools are loaded for history search
      if (!tools || tools.length === 0) {
        await loadTools();
      }
      if (currentTool) {
        loadToolHistory(currentTool);
      }
      break;
    case '/config':
      homeView.classList.add('hidden');
      toolsView.classList.add('hidden');
      historyView.classList.add('hidden');
      configView.classList.remove('hidden');
      logsView.classList.add('hidden');
      navHome.classList.remove('active');
      navTools.classList.remove('active');
      navHistory.classList.remove('active');
      navConfig.classList.add('active');
      navLogs.classList.remove('active');
      // Initialize config editor if available (loaded asynchronously as module)
      if (typeof window.initConfigEditor === 'function') {
        window.initConfigEditor().catch(err => {
          console.error('Config editor initialization failed:', err);
        });
      }
      break;
    case '/logs':
      homeView.classList.add('hidden');
      toolsView.classList.add('hidden');
      historyView.classList.add('hidden');
      configView.classList.add('hidden');
      logsView.classList.remove('hidden');
      navHome.classList.remove('active');
      navTools.classList.remove('active');
      navHistory.classList.remove('active');
      navConfig.classList.remove('active');
      navLogs.classList.add('active');
      if (typeof window.initLogsViewer === 'function') {
        window.initLogsViewer().catch(err => {
          console.error('Logs viewer initialization failed:', err);
          // The logs view is already visible at this point, so a silent throw
          // leaves the user staring at a blank panel. Surface the failure.
          const logViewer = document.getElementById('log-content');
          if (logViewer) {
            const message = err && err.message ? err.message : String(err);
            logViewer.innerHTML =
              `<span class="log-level-error">Logs viewer failed to initialize: ${message}. Try reloading the page.</span>`;
          }
        });
      }
      break;
    default:
      navigate('/');
  }
}

// API Calls
async function fetchAPI(endpoint) {
  try {
    const response = await fetch(`/api${endpoint}`);
    if (!response.ok) {
      throw new Error(`API Error: ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.error('API Error:', error);
    return null;
  }
}

async function loadRecentCalls() {
  const calls = await fetchAPI('/tools/recent');
  renderRecentCalls(calls);
}

async function loadTools() {
  const response = await fetchAPI('/tools');
  tools = response?.tools || [];
  renderTools();
}

async function loadToolHistory(toolId) {
  const history = await fetchAPI(`/tools/${toolId}/history`);
  renderToolHistory(toolId, history);
}

// Rendering
function renderRecentCalls(calls) {
  if (!calls || calls.length === 0) {
    recentCalls.innerHTML = templates['empty-state']({
      title: 'No Recent Tool Calls',
      message: 'No tool calls have been recorded yet.'
    });
    return;
  }

  // Format calls for template
  recentCalls.innerHTML = templates['recent-calls']({ calls });
}

function renderTools() {
  if (!tools || tools.length === 0) {
    toolsList.innerHTML = templates['empty-state']({
      title: 'No Tools Available',
      message: 'No tools have been registered in the system yet.'
    });
    return;
  }

  // Filter tools based on search term if one exists (search by name, description, or ID)
  const filteredTools = (
    searchTerm
      ? tools.filter(
          (tool) =>
            tool.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            tool.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
            (tool.description &&
              tool.description.toLowerCase().includes(searchTerm.toLowerCase()))
        )
      : tools
  ).map((tool) => {
    const parts = tool.name.split('__');
    if (parts.length > 1) {
      tool.category = parts[0].trim();
      tool.name = parts.slice(1).join('__').trim();
    }

    return tool;
  });

  // Show empty state if no tools match search
  if (filteredTools.length === 0) {
    toolsList.innerHTML = templates['empty-state']({
      title: 'No Matching Tools',
      message: `No tools match the search term "${searchTerm}". Try a different search.`
    });
    return;
  }

  // Group tools by category
  const toolsByCategory = filteredTools.reduce((acc, tool) => {
    // Make sure category is never undefined
    const category = tool.category || 'Uncategorized';
    if (!acc[category]) {
      acc[category] = [];
    }
    acc[category].push(tool);
    return acc;
  }, {});

  // Create HTML for each category
  let html = '';

  // Sort categories alphabetically
  const sortedCategories = Object.keys(toolsByCategory).sort();

  sortedCategories.forEach(category => {
    const toolsInCategory = toolsByCategory[category];

    // Add category header
    html += `<div class="category-section">
      <h2 class="category-header">${category}</h2>
      <div class="tools-grid category-grid">
    `;

    // Add tools for this category
    html += toolsInCategory
      .map(tool => templates['tool-card'](tool))
      .join('');

    html += '</div></div>';
  });

  toolsList.innerHTML = html;
}

function renderToolHistory(toolId, historyItems) {
  currentTool = toolId;
  const tool = tools.find((t) => t.id === toolId) || { name: toolId };

  // Update selected tool display
  if (selectedToolDisplay) {
    selectedToolDisplay.innerHTML = `
      <h3>${tool.name}</h3>
      <div class="tool-category">${tool.category || 'Uncategorized'}</div>
      <div class="tool-description">${tool.description || 'No description available'}</div>
    `;
    selectedToolDisplay.classList.add('active');
  }

  if (!historyItems || historyItems.error || historyItems.length === 0) {
    toolHistory.innerHTML = templates['empty-state']({
      title: 'No History Available',
      message: `No usage history found for ${tool.name}.`
    });
    return;
  }

  const html = templates['tool-history']({
    name: tool.name,
    historyItems: historyItems
  });

  toolHistory.innerHTML = html;
}

// Display filtered tools for history view
function displayFilteredTools() {
  if (!tools || !toolList) return;

  // Show/hide the tool list container based on search input
  if (historySearchTerm.length > 0) {
    toolListContainer.classList.add('active');
  } else {
    toolListContainer.classList.remove('active');
    return;
  }

  // Filter tools based on search term (search by name, category, or ID)
  const filteredTools = historySearchTerm
    ? tools.filter(
        (tool) =>
          tool.name.toLowerCase().includes(historySearchTerm.toLowerCase()) ||
          tool.id.toLowerCase().includes(historySearchTerm.toLowerCase()) ||
          (tool.category &&
            tool.category
              .toLowerCase()
              .includes(historySearchTerm.toLowerCase()))
      )
    : [];

  // Sort alphabetically by name
  const sortedTools = [...filteredTools].sort((a, b) =>
    a.name.localeCompare(b.name)
  );

  // Limit to first 20 matches for performance
  const limitedTools = sortedTools.slice(0, 20);

  // Display the filtered tools
  if (limitedTools.length === 0) {
    toolList.innerHTML = '<p class="empty-message">No matching tools found</p>';
    return;
  }
  const toolListHtml = limitedTools
    .map((tool) => {
      const isActive = tool.id === currentTool;
      return `
      <div class="tool-list-item ${isActive ? 'active' : ''}" data-tool-id="${tool.id}">
        <span class="tool-list-name">${tool.name}</span>
        <span class="tool-list-category">${tool.category || 'Uncategorized'}</span>
      </div>
    `;
    })
    .join('');

  toolList.innerHTML = toolListHtml;

  // Add click event listeners to tool items
  document.querySelectorAll('.tool-list-item').forEach((item) => {
    item.addEventListener('click', function () {
      const toolId = this.dataset.toolId;
      selectHistoryTool(toolId);
    });
  });
}

// Select a tool from history view and load its history
function selectHistoryTool(toolId) {
  const tool = tools.find((t) => t.id === toolId);
  if (!tool) return;

  // Update current tool
  currentTool = toolId;

  // Update selected tool display
  selectedToolDisplay.innerHTML = `
    <h3>${tool.name}</h3>
    <div class="tool-category">${tool.category || 'Uncategorized'}</div>
    <div class="tool-description">${tool.description || 'No description available'}</div>
  `;

  // Load tool history
  loadToolHistory(toolId);

  // Hide the tool list after selection
  toolListContainer.classList.remove('active');

  // Clear the search input
  if (historySearch) {
    historySearch.value = '';
    historySearchTerm = '';
  }
}

// Event Handlers
window.viewToolHistory = async function (toolId) {
  // Ensure tools are loaded
  if (!tools || tools.length === 0) {
    await loadTools();
  }

  // Ensure tools is an array after loading
  if (!Array.isArray(tools)) {
    console.error('Tools is not an array after loading');
    return;
  }

  currentTool = toolId;
  navigate('/history');
  // We'll show the selected tool info after navigation completes
  setTimeout(() => {
    selectHistoryTool(toolId);
  }, 100);
};

window.viewToolDetails = async function (toolId) {
  // If we're not on the tools page, navigate there first
  if (!toolsView.classList.contains('hidden') === false) {
    await navigate('/tools');
    history.pushState({}, '', '/tools');
  }
  
  // Ensure tools are loaded
  if (!tools || tools.length === 0) {
    await loadTools();
  }

  // Ensure tools is an array after loading
  if (!Array.isArray(tools)) {
    console.error('Tools is not an array after loading');
    return;
  }

  // First find the tool in our local cache
  let tool = tools.find((t) => t.id === toolId);
  
  // If not found, try normalizing the tool ID for local MCP tools
  // Convert hyphen format to double-underscore format (e.g., "local-playwright-local-browser-wait-for" -> "local-playwright-local__browser-wait-for")
  if (!tool && toolId.startsWith('local-')) {
    // Remove the "local-" prefix
    const withoutPrefix = toolId.substring(6);
    // Find the first hyphen after the server name and replace subsequent hyphens with double underscores
    const parts = withoutPrefix.split('-');
    if (parts.length > 1) {
      // Try different combinations: the server name could be 1, 2, or 3 parts
      for (let i = 1; i < Math.min(parts.length, 4); i++) {
        const serverName = parts.slice(0, i).join('-');
        const toolName = parts.slice(i).join('-');
        const normalizedId = `local-${serverName}__${toolName}`;
        tool = tools.find((t) => t.id === normalizedId);
        if (tool) {
          toolId = normalizedId; // Update toolId to the normalized version
          break;
        }
      }
    }
  }
  
  if (!tool) {
    console.error('Tool not found:', toolId);
    return;
  }

  // Get additional tool details if needed
  let fullTool = tool;
  try {
    const detailedTool = await fetchAPI(`/tools/${toolId}`);
    if (detailedTool) {
      fullTool = detailedTool;
    }
  } catch (e) {
    console.error('Error fetching tool details:', e);
  }

  // Extract parameters from schema if available
  if (fullTool.parameters) {
    try {
      // Process Zod schema structure if it's available
      let paramList = [];

      // Convert the parameters to an array of parameter objects
      // The structure depends on how parameters are stored in the tool registration
      if (fullTool.parameters && fullTool.parameters.properties) {
        const shape = fullTool.parameters;

        for (const [name, param] of Object.entries(shape.properties)) {
          paramList.push({
            name,
            description: param.description,
            type: param.type || 'unknown'
            // required
          });
        }
      }

      fullTool.parameters = paramList;
      
      // Ensure environment variables are properly formatted for display
      if (!Array.isArray(fullTool.envVars)) {
        fullTool.envVars = [];
      }
    } catch (e) {
      console.error('Error processing parameters:', e);
      fullTool.parameters = [];
    }
  } else {
    fullTool.parameters = [];
  }

  // Ensure we have access to the template
  if (!templates['tool-modal']) {
    console.error('Tool modal template not loaded');
    return;
  }

  // Render the modal
  const modalContainer = document.getElementById('modal-container');
  if (!modalContainer) {
    console.error('Modal container element not found');
    return;
  }

  modalContainer.innerHTML = templates['tool-modal'](fullTool);

  // Add event listener to close when clicking outside
  const modalBackdrop = document.querySelector('.modal-backdrop');
  if (modalBackdrop) {
    modalBackdrop.addEventListener('click', closeModal);
  }
};

window.closeModal = function () {
  const modalContainer = document.getElementById('modal-container');
  modalContainer.innerHTML = '';
};

// Navigation event listeners
navHome.addEventListener('click', function (e) {
  e.preventDefault();
  navigate('/');
  history.pushState({}, '', '/');
});

navTools.addEventListener('click', function (e) {
  e.preventDefault();
  navigate('/tools');
  history.pushState({}, '', '/tools');
});

navHistory.addEventListener('click', function (e) {
  e.preventDefault();
  navigate('/history');
  history.pushState({}, '', '/history');
});

navConfig.addEventListener('click', function (e) {
  e.preventDefault();
  navigate('/config');
  history.pushState({}, '', '/config');
});

navLogs.addEventListener('click', function (e) {
  e.preventDefault();
  navigate('/logs');
  history.pushState({}, '', '/logs');
});

// Handle back/forward navigation
window.addEventListener('popstate', function () {
  navigate(window.location.pathname);
});

// Initialize
document.addEventListener('DOMContentLoaded', function () {
  // First load templates, then initialize the app
  loadTemplates();

  // Add event listener for main search input
  const toolsSearch = document.getElementById('tools-search');
  if (toolsSearch) {
    console.log('Tools search element found:', toolsSearch);
    toolsSearch.addEventListener('input', function (e) {
      searchTerm = e.target.value.trim();
      console.log('Search term updated:', searchTerm);
      renderTools();
    });

    // Also check if there's already a value in the search field
    if (toolsSearch.value) {
      searchTerm = toolsSearch.value.trim();
      console.log('Initial search term:', searchTerm);
      renderTools();
    }
  } else {
    console.error('Tools search element not found!');
  }

  // Add event listener for history search input
  if (historySearch) {
    historySearch.addEventListener('input', function (e) {
      historySearchTerm = e.target.value.trim();
      displayFilteredTools();
    });

    // Handle clicks outside the tool list to close it
    document.addEventListener('click', function (e) {
      if (
        !historySearch.contains(e.target) &&
        !toolListContainer.contains(e.target)
      ) {
        toolListContainer.classList.remove('active');
      }
    });

    // Handle focus on the search input
    historySearch.addEventListener('focus', function () {
      if (historySearchTerm) {
        toolListContainer.classList.add('active');
      }
    });
  }
});