# Resources

This directory contains resource implementations for the MCP server.

## What are Resources?

Resources are static content providers that can be accessed by the MCP server. Unlike tools which perform actions, resources provide static or dynamic content that can be referenced by other components.

## Creating a New Resource

To create a new resource, run:

```bash
bun run new:resource
```

This will prompt you for resource details and generate the necessary files.

## Resource Structure

Each resource is organized in its own directory with the following structure:

```
resources/
  my-resource/
    index.ts      # Main resource implementation
    index.test.ts # Tests for the resource
```

## Resource Categories

<!-- BEGIN RESOURCE CATEGORIES -->
The resources are organized into the following categories:

- **Log** - Resources for log related operations
- **Reference** - Resources for reference related operations

<!-- END RESOURCE CATEGORIES -->

## Resource List

<!-- BEGIN RESOURCE LIST -->
| Resource Name | Category | Description |
|---------------|----------|-------------|
| `mcp server current log` | Log | View the current mcp server log (if there is one). |
| `mcp server log` | Log | View the a specific mcp server log (if there is one). |
| `kong-all-entities` | Reference | Description of all Kong entity types. |
| `kong-entity` | Reference | Description of specific Kong entity type. |

<!-- END RESOURCE LIST -->

## Resource Implementation

Resources must implement the `ResourceHandler` interface:

```typescript
import type { Variables } from '@modelcontextprotocol/sdk/shared/uriTemplate.js';
import { Resource } from '../../registry/resources';
import { ResourceHandler } from '../../registry/resources/types';
import { CatchErrors } from '../../utils';

@Resource({
  id: 'my-resource',
  name: 'My Resource',
  description: 'Description of the resource',
  category: 'Reference',
  arguments: [
    {
      name: 'id',
      description: 'Resource identifier',
      required: true,
    },
  ],
})
export class MyResource implements ResourceHandler {
  @CatchErrors()
  async load(_uri: URL, variables?: Variables): Promise<string> {
    return `Resource content for ${variables?.id}`;
  }
}
```

`category` must be one of the categories listed above (currently `Log` and
`Reference`). See `src/resources/kong/index.ts` for a working example.
