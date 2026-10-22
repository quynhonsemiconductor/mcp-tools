# Config Editor Module Architecture

## Overview

The Config Editor is a modular JavaScript application for managing MCP Tools configuration through a web interface. The codebase has been refactored from a single 1,900+ line file into 10 focused modules following single responsibility principles.

## Architecture

```
config-editor.js (716 lines) - Main Orchestrator
├── UtilityHelpers.js (151 lines) - Pure utility functions
├── StateManager.js (246 lines) - Centralized state management
├── DOMManager.js (229 lines) - DOM element access and caching
├── APIService.js (201 lines) - Backend API communication
├── ConfigGenerator.js (397 lines) - YAML and MCP config generation
├── TabManager.js (135 lines) - Tab navigation and visibility
├── RenderingEngine.js (553 lines) - UI rendering logic
├── EventHandlers.js (419 lines) - Event listener management
└── MCPManager.js (381 lines) - MCP business logic operations
```

## Module Descriptions

### config-editor.js - Main Orchestrator

**Purpose:** Application entry point that coordinates all modules

**Key Responsibilities:**
- Initialize all modules with dependency injection
- Provide wrapper functions for external API
- Handle application lifecycle
- Coordinate inter-module communication

**Public API:**
```javascript
window.initConfigEditor()      // Initialize the application
window.updatePreviews()         // Update configuration previews
window.copyConfig()             // Copy configuration to clipboard
window.downloadConfig()         // Download configuration as file
window.resetConfig()            // Reset to default configuration
window.saveConfig()             // Save configuration to backend
```

### UtilityHelpers.js

**Purpose:** Pure utility functions with no side effects

**Key Functions:**
- `debounce(func, wait)` - Debounce function calls
- `escapeHtml(text)` - Escape HTML special characters
- `sanitizeToolName(name)` - Sanitize tool names for display
- `formatJson(obj, indent)` - Format JSON with indentation
- `deepClone(obj)` - Deep clone objects
- `compareArrays(arr1, arr2)` - Compare array contents
- `generateId()` - Generate unique IDs

**Usage:**
```javascript
import { debounce, escapeHtml } from './UtilityHelpers.js';

const debouncedSearch = debounce((query) => {
  console.log('Searching:', query);
}, 300);
```

### StateManager.js

**Purpose:** Centralized state management with controlled mutations

**Key Features:**
- Single source of truth for application state
- Observer pattern for state change notifications
- Proxy-based state access with validation
- State persistence and restoration

**State Structure:**
```javascript
{
  currentConfig: {
    logging: { enabled, level, maxSize, maxFiles },
    tools: { include, exclude, includeCategories, excludeCategories,
             includeMCPs, includeRemoteMCPs, includeLocalMCPs }
  },
  allMCPs: { bundled, remote, local, native },
  selectedCategory: null,
  currentFormat: 'claude'
}
```

**Usage:**
```javascript
import { createStateManager } from './StateManager.js';

const stateManager = createStateManager();
stateManager.setState({ selectedCategory: 'Github' });
const category = stateManager.getState('selectedCategory');

// Subscribe to changes
stateManager.subscribe((newState, oldState) => {
  console.log('State changed:', newState);
});
```

### DOMManager.js

**Purpose:** DOM element access with caching and validation

**Key Features:**
- Cached element references for performance
- Validation and error handling
- Single point of DOM access
- Type-safe element retrieval

**Usage:**
```javascript
import { createDOMManager } from './DOMManager.js';

const domManager = createDOMManager();
const element = domManager.getElementById('config-preview');
const buttons = domManager.querySelectorAll('.tab-button');
```

### APIService.js

**Purpose:** Backend API communication

**Key Features:**
- RESTful API integration
- Error handling and retry logic
- Response transformation
- Loading state management

**API Endpoints:**
- `GET /api/mcps` - Fetch all MCP servers
- `GET /api/config` - Fetch current configuration
- `POST /api/config` - Save configuration
- `GET /api/setup/:name` - Fetch setup documentation

**Usage:**
```javascript
import { createAPIService } from './APIService.js';

const apiService = createAPIService();
const mcps = await apiService.fetchAllMCPs();
await apiService.saveConfig(config);
```

### ConfigGenerator.js

**Purpose:** Generate YAML and MCP configuration formats

**Key Features:**
- YAML configuration generation
- Multi-format MCP configuration (Claude, VS Code, IntelliJ, etc.)
- Environment variable management
- Configuration validation

**Supported Formats:**
- Claude Code
- Visual Studio Code
- GitHub Copilot CLI
- IntelliJ IDEs
- Xcode

**Usage:**
```javascript
import { createConfigGenerator } from './ConfigGenerator.js';

const generator = createConfigGenerator(stateManager);
const yaml = generator.generateYAML();
const mcpConfig = generator.generateMCPConfig('vscode');
```

### TabManager.js

**Purpose:** Tab navigation and visibility management

**Key Features:**
- Tab switching with state management
- Active tab tracking
- Tab content visibility control
- Event-driven tab changes

**Usage:**
```javascript
import { createTabManager } from './TabManager.js';

const tabManager = createTabManager(domManager, callbacks);
tabManager.switchTab('bundled');
const activeTab = tabManager.getActiveTab();
```

### RenderingEngine.js

**Purpose:** All UI rendering logic

**Key Features:**
- Category and tool list rendering
- MCP server list rendering
- Setup documentation display
- Preview rendering
- Markdown to HTML conversion

**Key Methods:**
- `renderCategories(categories)` - Render native categories
- `renderToolsForCategory(category)` - Render tools for selected category
- `renderMCPs(mcps, type)` - Render MCP server lists
- `renderConfigPreview(yaml)` - Render YAML preview
- `renderMCPConfigPreview(config)` - Render MCP config preview

**Usage:**
```javascript
import { createRenderingEngine } from './RenderingEngine.js';

const engine = createRenderingEngine(domManager, stateManager, configGenerator);
engine.renderCategories(categories);
engine.renderToolsForCategory('Github');
```

### EventHandlers.js

**Purpose:** Event listener setup and management

**Key Features:**
- Centralized event binding
- Callback-based event delegation
- Event cleanup and teardown
- Debounced event handlers

**Event Types:**
- Tab switching events
- Category selection events
- MCP toggle events
- Tool toggle events
- Configuration change events
- File upload events
- Action button events

**Usage:**
```javascript
import { createEventHandlers } from './EventHandlers.js';

const handlers = createEventHandlers(domManager, {
  onTabSwitch: (tab) => console.log('Tab:', tab),
  onCategorySelect: (cat) => console.log('Category:', cat),
  // ... other callbacks
});

handlers.setupEventListeners();
```

### MCPManager.js

**Purpose:** MCP business logic operations

**Key Features:**
- Category selection with tristate logic
- MCP toggle operations
- Tool-level toggle management
- State synchronization
- UI update coordination

**Key Methods:**
- `selectMcp(name, type)` - Select an MCP and show details
- `toggleCategory(categoryName)` - Toggle entire category inclusion
- `toggleMcp(mcpName, type)` - Toggle individual MCP
- `toggleToolTristate(categoryName, toolName)` - Toggle individual tool
- `toggleCategoryGroupTristate(groupName)` - Toggle native category group
- `toggleNativeCategoryGroupTristate(groupName)` - Toggle native category group

**Usage:**
```javascript
import { createMCPManager } from './MCPManager.js';

const manager = createMCPManager(stateManager, domManager, apiService, 
                                  renderingEngine, tabManager);
manager.selectMcp('github', 'remote');
manager.toggleCategory('Knowledge Graph');
```

## Module Dependencies

```
UtilityHelpers (no dependencies)
    ↓
StateManager (uses UtilityHelpers)
    ↓
DOMManager (no dependencies)
    ↓
APIService (uses UtilityHelpers)
    ↓
ConfigGenerator (uses StateManager, UtilityHelpers)
    ↓
TabManager (uses DOMManager)
    ↓
RenderingEngine (uses DOMManager, StateManager, ConfigGenerator, UtilityHelpers)
    ↓
EventHandlers (uses DOMManager)
    ↓
MCPManager (uses StateManager, DOMManager, APIService, RenderingEngine, TabManager)
    ↓
config-editor.js (orchestrates all modules)
```

## Design Patterns

### Factory Pattern
Each module exports a factory function that creates instances with dependency injection:

```javascript
export function createModuleName(dependencies) {
  // Module implementation
  return {
    // Public API
  };
}
```

### Observer Pattern
StateManager implements observer pattern for state change notifications:

```javascript
stateManager.subscribe((newState, oldState) => {
  // React to state changes
});
```

### Module Pattern
Modules encapsulate private state and expose only public APIs:

```javascript
export function createModule() {
  // Private state
  let privateVar = null;
  
  // Private functions
  function privateFunction() { }
  
  // Public API
  return {
    publicMethod() { }
  };
}
```

## Testing

The modules have been tested using Playwright browser automation:

```javascript
// Example test flow
await browser.navigate('http://localhost:5678/config');
await browser.click('Knowledge Graph category');
await browser.click('Bundled MCPs tab');
await browser.click('figma checkbox');
// Verify YAML preview updated
```

## Development Guidelines

### Adding New Features

1. **Identify the appropriate module** based on responsibility
2. **Add function to module** with proper JSDoc
3. **Update module's public API** if needed
4. **Test thoroughly** with Playwright
5. **Update documentation** in this README

### Adding New Modules

1. **Create module file** in `config-editor/` folder
2. **Follow factory pattern** with dependency injection
3. **Export factory function** as named export
4. **Import in config-editor.js** and initialize
5. **Wire up dependencies** in orchestrator
6. **Update this README** with module description

### Code Style

- Use ES6 modules with explicit imports/exports
- Follow factory pattern for module creation
- Use JSDoc for all public functions
- Keep modules under 500 lines
- Use camelCase for variables/functions
- Use PascalCase for classes/types
- Use descriptive variable names

## Performance Considerations

### Element Caching
DOMManager caches DOM elements to avoid repeated queries:

```javascript
// Good - cached
const element = domManager.getElementById('my-element');

// Avoid - not cached
const element = document.getElementById('my-element');
```

### Debouncing
Use debounce for expensive operations:

```javascript
import { debounce } from './UtilityHelpers.js';

const expensiveOperation = debounce(() => {
  // Heavy computation
}, 300);
```

### State Updates
Batch state updates when possible:

```javascript
// Good - single update
stateManager.setState({
  selectedCategory: 'Github',
  currentFormat: 'vscode'
});

// Avoid - multiple updates
stateManager.setState({ selectedCategory: 'Github' });
stateManager.setState({ currentFormat: 'vscode' });
```

## Troubleshooting

### Common Issues

**Module not found errors:**
- Ensure all modules are in `public/js/config-editor/` folder
- Check import paths are correct
- Verify modules are exported correctly

**State not updating:**
- Check StateManager observers are registered
- Verify setState is called with proper structure
- Check console for state validation errors

**UI not rendering:**
- Verify DOMManager can find elements
- Check RenderingEngine is initialized
- Look for errors in browser console

**Events not firing:**
- Ensure EventHandlers.setupEventListeners() is called
- Verify callbacks are provided to EventHandlers
- Check event listeners are bound to correct elements

## Future Improvements

- Add unit tests for individual modules
- Implement undo/redo functionality
- Add configuration validation
- Improve error messaging
- Add keyboard shortcuts
- Implement drag-and-drop for tool ordering
- Add configuration templates
- Implement configuration comparison

## Resources

- Original monolithic file: `config-editor.js.backup` (1,900+ lines)
- Refactoring plan: `/PLAN.md`
- Dev server: `bun run dev:web`
- API documentation: `/docs/api.md`

## Maintainers

Built and maintained by the QNSC platform team.

For questions or contributions, see [CONTRIBUTING.md](../../../CONTRIBUTING.md).
