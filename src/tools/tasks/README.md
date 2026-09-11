# Task Management Tools

A comprehensive suite of tools for creating, managing, and executing task lists. These tools enable AI to organize work into structured task lists and execute tasks in a systematic manner.

**Note**: This implementation uses a **consolidated approach with 5 tools** instead of many individual tools to stay within tool limits while maintaining full functionality.

## Overview

The task management system provides:
- **Task List Management**: Create, view, and delete task lists
- **Task Operations**: Add, edit, delete, and reorder tasks
- **Task Execution**: Get next tasks and mark them as complete
- **Statistics & Reporting**: Track task completion and performance

## Available Tools

### Consolidated Tool Set

#### 1. `manageTaskLists` - Task List Management
**Actions:** `create`, `get`, `list`, `delete`
- Create new task lists with optional descriptions and metadata
- Retrieve specific task lists with all their tasks
- List all task lists with optional filtering and statistics
- Delete task lists and all associated tasks (with confirmation)

#### 2. `manageTasks` - Task CRUD Operations  
**Actions:** `add`, `edit`, `delete`, `insert`
- Add new tasks to task lists (at end or specific position)
- Edit existing tasks (prompt, notes, status, metadata)
- Delete specific tasks from task lists
- Insert tasks at specific positions within task lists

#### 3. `executeTask` - Task Execution Workflow
**Actions:** `getNext`, `complete`
- Get the next pending task in order from a task list
- Mark tasks as completed with optional completion notes
- Optionally mark tasks as in-progress when retrieving them

#### 4. `reorderTasks` - Task Organization (Standalone)
- Reorder multiple tasks within a task list by updating positions
- Atomic transaction ensures data consistency during reordering

#### 5. `getTaskStatistics` - Analytics & Reporting
- Get task completion statistics for specific lists or globally
- Include detailed breakdowns and performance metrics
- Retrieve task completion history with flexible filtering
- Support for date ranges, status filtering, and result limits

### Action-Based Design Benefits

Each consolidated tool uses an `action` parameter to determine the specific operation:
- **Reduced cognitive load**: Fewer tool names to remember
- **Logical grouping**: Related operations are grouped together
- **Consistent parameters**: Similar parameter patterns across actions
- **Unified error handling**: Consistent error responses within each tool

## Core Concepts

### Task Lists
Task lists are containers that organize related tasks. Each task list has:
- Unique ID and name
- Optional description and metadata
- Status (active, completed, archived)
- Creation and update timestamps

### Tasks
Individual tasks contain:
- Prompt/instruction describing what needs to be done
- Order position within the task list
- Status (pending, in-progress, completed, skipped)
- Optional notes and metadata
- Timestamps for creation, updates, and completion


### Task Status Flow
```
pending → in-progress → completed
    ↓         ↓
  skipped   skipped
```

## Usage Patterns


## Data Storage

Tasks are stored in a dedicated SQLite database (`tasks.db`) separate from the main system database (`toolcalls.db`). This provides data isolation and performance benefits.

**Database Location**: `${QNSC_MCP_DIR}/tasks.db`

The task database service follows the same reliable patterns as the existing `src/services/db/index.ts` service, ensuring consistency and maintainability.

### Database Schema

#### task_lists
- `id` (TEXT) - Unique identifier
- `name` (TEXT) - Human-readable name
- `description` (TEXT) - Optional description
- `status` (TEXT) - active, completed, or archived
- `created_at` (INTEGER) - Creation timestamp
- `updated_at` (INTEGER) - Last update timestamp
- `metadata` (TEXT) - JSON metadata

#### tasks
- `id` (TEXT) - Unique identifier
- `task_list_id` (TEXT) - Reference to parent task list
- `prompt` (TEXT) - Task instruction/description
- `order_position` (INTEGER) - Position in the list
- `status` (TEXT) - pending, in-progress, completed, or skipped
- `created_at` (INTEGER) - Creation timestamp
- `updated_at` (INTEGER) - Last update timestamp
- `completed_at` (INTEGER) - Completion timestamp
- `notes` (TEXT) - Additional notes
- `metadata` (TEXT) - JSON metadata

### Database Benefits
- **Isolation**: Task data is separate from system logs and tool calls
- **Performance**: Task operations don't impact system database performance
- **Backup**: Users can backup task data independently
- **Schema Evolution**: Task schema can evolve independently of system schema

## Error Handling

Common error scenarios and their handling:

- **Task list not found**: Clear error message with the invalid ID
- **Task not found**: Specific error about which task ID was not found
- **Invalid order position**: Validation and helpful error messages
- **Database errors**: Wrapped in user-friendly error messages
- **Concurrent modifications**: Proper transaction handling

## Best Practices

### Task Granularity
- Keep tasks focused on single, specific actions
- Break large tasks into smaller, manageable pieces
- Use clear, actionable language in task prompts

### Task Organization
- Group related tasks into logical task lists
- Use descriptive names for task lists
- Add context in task notes when helpful

### Task Execution
- Use the `executeTask` tool with `markInProgress: true` when starting tasks
- Add completion notes for complex tasks using the `complete` action
- Update task status appropriately using the `edit` action in `manageTasks`

### Performance
- Use task list filtering in `manageTaskLists` to avoid loading unnecessary data
- Archive completed task lists to keep active lists manageable
- Use `getTaskStatistics` to monitor progress and performance

### Consolidated Tool Usage
- Use the `action` parameter to specify the exact operation needed
- Group related operations using the same tool (e.g., all task CRUD operations use `manageTasks`)
- Take advantage of action-specific parameters for maximum flexibility

## Future Enhancements

Planned improvements include:
- Task dependencies and prerequisites
- Task templates and recurring tasks  
- Task prioritization and due dates
- Collaboration features (shared lists, assignments)
- Integration with external project management tools
- Task time tracking and reporting
- Automated task execution based on triggers

## Contributing

When adding new task management functionality:
1. Follow the consolidated tool structure and action-based patterns
2. Add comprehensive error handling for each action
3. Include JSDoc documentation for all new actions
4. Write unit tests for all new functionality
5. Update this README with new features
6. Consider whether new functionality fits into existing tools or requires a new tool

## See Also

- [API Documentation](./types.ts) - TypeScript interfaces and types
