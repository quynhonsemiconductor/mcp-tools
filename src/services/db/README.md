# Tool Call Database Service

This service provides SQLite-based persistence for tool call history, including:
- Input payloads
- Execution times
- Success/failure status
- Result data

## Database Location

The database is stored in the user's home directory at `~/.qnscmcp/toolcalls.db`.

## Schema

The `tool_calls` table has the following schema:

| Column | Type | Description |
|--------|------|-------------|
| id | INTEGER | Primary key (autoincrement) |
| toolId | TEXT | Identifier of the tool |
| payload | TEXT | JSON string of the input payload |
| runTimeMs | INTEGER | Execution time in milliseconds |
| status | TEXT | 'success' or 'failure' |
| result | TEXT | JSON string of result or error message |
| timestamp | INTEGER | Unix timestamp of the call |

## Usage Examples

### Recording Tool Calls

```typescript
import dbService from './services/db/index';

// Record a successful tool call
dbService.recordToolCall({
  toolId: 'myTool',
  payload: JSON.stringify({ param1: 'value1' }),
  runTimeMs: 150,
  status: 'success',
  result: JSON.stringify({ success: true })
});

// Record a failed tool call
dbService.recordToolCall({
  toolId: 'myTool',
  payload: JSON.stringify({ param1: 'value1' }),
  runTimeMs: 75,
  status: 'failure',
  result: 'Error: Something went wrong'
});
```

### Using the Tool Tracker

```typescript
import { createTrackedTool } from './services/db/tool-tracker';

// Original tool implementation
async function myToolImplementation(payload) {
  // Tool logic here
  return { result: 'success' };
}

// Create a wrapped version for automatic tracking
const trackedTool = createTrackedTool('myTool', myToolImplementation);

// Using the tracked tool
try {
  const result = await trackedTool({ param: 'value' });
  // Tool call automatically recorded with success status
} catch (error) {
  // Tool call automatically recorded with failure status
  // Error is re-thrown and should be handled here
}
```

### Integration with Tool Registry

```typescript
import { createTrackedTool } from './services/db/tool-tracker';
import { Tool } from './tools/registry';

// Original tool implementation
async function weatherToolImplementation(params) {
  const { lat, lng } = params;
  // Implementation logic
  return { temp: 72, conditions: 'sunny' };
}

// Register the tracked tool
export const weatherTool: Tool = {
  name: 'getWeatherForecast',
  description: 'Get the weather forecast for a location',
  execute: createTrackedTool('getWeatherForecast', weatherToolImplementation)
};
```

## API Reference

The database service provides the following methods:

### `recordToolCall(toolCall: ToolCall): number`

Records a new tool call in the database.

- **Parameters**: `toolCall` - The tool call to record
- **Returns**: The ID of the inserted record

### `getToolCall(id: number): ToolCall | null`

Gets a specific tool call by ID.

- **Parameters**: `id` - The ID of the tool call
- **Returns**: The tool call or null if not found

### `getAllToolCalls(): ToolCall[]`

Gets all tool calls, sorted by timestamp in descending order.

- **Returns**: Array of tool calls

### `getToolCallsByToolId(toolId: string): ToolCall[]`

Gets all tool calls for a specific tool.

- **Parameters**: `toolId` - The ID of the tool
- **Returns**: Array of tool calls for the specified tool

### `getToolCallsByStatus(status: 'success' | 'failure'): ToolCall[]`

Gets all tool calls with a specific status.

- **Parameters**: `status` - The status to filter by
- **Returns**: Array of tool calls with the specified status

### `close(): void`

Closes the database connection.

## Tool Tracker

The tool tracker provides additional functionality to wrap tool implementations with automatic tracking:

### `trackToolExecution<T, R>(toolId: string, payload: T, fn: (payload: T) => Promise<R>): Promise<R>`

Wraps a tool function execution with tracking.

- **Parameters**: 
  - `toolId` - The identifier for the tool
  - `payload` - The input payload to pass to the tool
  - `fn` - The tool function to execute
- **Returns**: The result from the tool function

### `createTrackedTool<T, R>(toolId: string, fn: (payload: T) => Promise<R>): (payload: T) => Promise<R>`

Creates a wrapped version of a tool function with built-in tracking.

- **Parameters**:
  - `toolId` - The identifier for the tool
  - `fn` - The tool function to wrap
- **Returns**: A wrapped function that tracks execution

## Error Handling

The tool tracker is designed to be fault-tolerant. If database operations fail for any reason, the errors are logged but won't affect the tool's execution.