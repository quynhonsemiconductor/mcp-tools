# Knowledge Graph Memory Server

A MCP (Model Context Protocol) server implementation providing persistent memory using a local knowledge graph. This allows GitHub Copilot to remember information about users and contexts across conversations through structured entity-relationship storage.

## Core Concepts

### Entities
Entities are the primary nodes in the knowledge graph. Each entity has:
- A unique name (identifier)
- An entity type (e.g., "person", "organization", "event", "project")
- A list of observations

Example:
```json
{
  "name": "Patrick_Developer",
  "entityType": "person",
  "observations": ["Expert in TypeScript development", "Works on MCP toolkit integration"]
}
```

### Relations
Relations define directed connections between entities. They are always stored in active voice and describe how entities interact or relate to each other.

Example:
```json
{
  "from": "Patrick_Developer",
  "to": "QNSC",
  "relationType": "works_at"
}
```

### Observations
Observations are discrete pieces of information about an entity. They are:

- Stored as strings
- Attached to specific entities
- Can be added or removed independently
- Should be atomic (one fact per observation)

Example:
```json
{
  "entityName": "Patrick_Developer",
  "observations": [
    "Expert in TypeScript development",
    "Works on MCP toolkit integration",
    "Prefers debugging through systematic approaches"
  ]
}
```

## Storage Format

The knowledge graph is stored in a JSON Lines format in a local file. Each line contains either an entity or relation object:

```json
{"type": "entity", "name": "Patrick_Developer", "entityType": "person", "observations": ["Expert in TypeScript development"]}
{"type": "relation", "from": "Patrick_Developer", "to": "MCP_Toolkit", "relationType": "contributes_to"}
```

### Storage Location Configuration

The storage location can be configured through the QNSC MCP configuration file (`.qnscmcp.yaml` or `.qnscmcp.yml`):

```yaml
# QNSC MCP Configuration
knowledgeGraph:
  # Path to the knowledge graph storage file
  # Default: ~/.qnscmcp/knowledge-graph.json
  filePath: /path/to/your/custom/knowledge-graph.json
```

**Configuration File Locations** (checked in order):
1. Path specified by `--config` command line argument
2. `./.qnscmcp.yaml` or `./.qnscmcp.yml` in the current directory  
3. `~/.qnscmcp/config.yaml` or `~/.qnscmcp/config.yml` in the home directory

**Default Location**: If no configuration is provided, the knowledge graph will be stored at `~/.qnscmcp/knowledge-graph.json`.

## MCP Server Implementation

This server implements the Model Context Protocol specification and exposes the following tools:
### Tools

- **create_entities**
  - Create multiple new entities in the knowledge graph
  - Input: `entities` (array of objects)
    - Each object contains:
      - `name` (string): Entity identifier
      - `entityType` (string): Type classification  
      - `observations` (string[]): Associated observations
  - Ignores entities with existing names
  - Returns: Array of newly created entities

- **create_relations**
  - Create multiple new relations between entities in the knowledge graph
  - Input: `relations` (array of objects)
    - Each object contains:
      - `from` (string): Source entity name
      - `to` (string): Target entity name
      - `relationType` (string): Relationship type in active voice
  - Skips duplicate relations
  - Returns: Array of newly created relations

- **add_observations**
  - Add new observations to existing entities
  - Input: `observations` (array of objects)
    - Each object contains:
      - `entityName` (string): Target entity
      - `contents` (string[]): New observations to add
  - Returns: Object with entityName and addedObservations for each entity
  - Throws error if entity doesn't exist

- **delete_entities**
  - Remove entities and their relations from the knowledge graph
  - Input: `entityNames` (string[])
  - Performs cascading deletion of associated relations
  - Returns: Success message

- **delete_observations**
  - Remove specific observations from entities
  - Input: `deletions` (array of objects)
    - Each object contains:
      - `entityName` (string): Target entity
      - `observations` (string[]): Observations to remove
  - Silent operation if observation doesn't exist
  - Returns: Success message

- **delete_relations**
  - Remove specific relations from the knowledge graph
  - Input: `relations` (array of objects)
    - Each object contains:
      - `from` (string): Source entity name
      - `to` (string): Target entity name
      - `relationType` (string): Relationship type
  - Silent operation if relation doesn't exist
  - Returns: Success message

- **read_graph**
  - Read the entire knowledge graph structure
  - Input: No parameters required
  - Returns: Complete graph with all entities and relations

- **search_nodes**
  - Search for entities based on query string
  - Input: `query` (string)
  - Searches across:
    - Entity names (case-insensitive)
    - Entity types (case-insensitive)
    - Observation content (case-insensitive)
  - Returns: Filtered graph with matching entities and their interconnecting relations

- **open_nodes**
  - Retrieve specific entities by name
  - Input: `names` (string[])
  - Returns: Graph containing requested entities and relations between them
  - Silently skips non-existent entities

## Usage with GitHub Copilot

To optimize knowledge graph usage with GitHub Copilot, consider implementing these patterns:

### 1. User Identification
- Assume you are interacting with a specific user context
- If user identity is unclear, proactively gather identifying information
- Create person entities for recurring users and collaborators

### 2. Memory Retrieval Pattern
- Begin conversations by retrieving relevant context from the knowledge graph
- Use `search_nodes` to find related entities based on current context
- Reference the knowledge graph as your "persistent memory"

### 3. Information Categories
While conversing, capture new information in these categories:
   - **Identity**: Name, role, location, organization, skills
   - **Behaviors**: Work patterns, preferences, habits
   - **Preferences**: Communication style, tools, methodologies
   - **Goals**: Projects, objectives, learning targets
   - **Relationships**: Professional and project relationships

### 4. Memory Update Strategy
When new information is gathered:
   - Create entities for significant people, organizations, and projects
   - Connect entities using meaningful relations
   - Store factual observations as atomic statements
   - Update existing entities rather than creating duplicates

### 5. Example Workflow
```typescript
// 1. Search for existing context
const existingContext = await searchNodes("Patrick developer");

// 2. Create new entities for discovered information
await createEntities([{
  name: "MCP_Toolkit_Project",
  entityType: "project", 
  observations: ["TypeScript-based MCP server", "Uses FastMCP framework"]
}]);

// 3. Create relationships
await createRelations([{
  from: "Patrick_Developer",
  to: "MCP_Toolkit_Project", 
  relationType: "contributes_to"
}]);

// 4. Add new observations
await addObservations([{
  entityName: "Patrick_Developer",
  contents: ["Successfully integrated knowledge-graph tools"]
}]);
```

## Configuration

### Knowledge Graph Storage Path

Configure the storage location in your `.qnscmcp.yaml` file:

```yaml
knowledgeGraph:
  filePath: /custom/path/to/knowledge-graph.json
```

**Configuration Examples:**

```yaml
# Windows absolute path
knowledgeGraph:
  filePath: C:\data\knowledge-graph.json

# Linux/macOS absolute path  
knowledgeGraph:
  filePath: /home/user/data/knowledge-graph.json

# Relative path (relative to working directory)
knowledgeGraph:
  filePath: ./data/knowledge-graph.json

# Default (if not specified)
# ~/.qnscmcp/knowledge-graph.json
```

**Configuration File Locations** (checked in order):
1. Path specified by `--config` command line argument
2. `./.qnscmcp.yaml` or `./.qnscmcp.yml` in the current directory  
3. `~/.qnscmcp/config.yaml` or `~/.qnscmcp/config.yml` in the home directory

## Development

The knowledge graph uses a simple file-based storage system with JSON Lines format for persistence. The `KnowledgeGraphManager` class handles all graph operations and automatically manages file I/O.

Key implementation details:
- Entities are uniquely identified by name
- Relations are stored as directed edges with type labels
- All operations are atomic and immediately persisted
- Memory file is created automatically if it doesn't exist
