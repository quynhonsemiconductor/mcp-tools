import { z } from 'zod';
import { CatchErrors } from '../../utils';
import { Tool, ToolHandler } from '../registry';
import { KnowledgeGraphManager } from './manager';

/**
 * Schema for deleteEntities tool parameters
 */
export const DeleteEntitiesSchema = z.object({
  entityNames: z
    .array(z.string())
    .describe('Array of entity names to delete from the knowledge graph'),
});

export type DeleteEntitiesParams = z.infer<typeof DeleteEntitiesSchema>;

/**
 * Tool for deleting multiple entities from the knowledge graph
 */
@Tool({
  id: 'delete-entities',
  name: 'deleteEntities',
  description: 'Delete multiple entities and their associated relations from the knowledge graph',
  category: 'Knowledge Graph',
  parameters: DeleteEntitiesSchema,
  version: '1.0.0',
  annotations: {
    title: 'Delete Knowledge Graph Entities',
    readOnlyHint: false,
  },
})
export class DeleteEntitiesTool implements ToolHandler {
  /**
   * Execute the deleteEntities operation
   */
  @CatchErrors()
  async execute(args: DeleteEntitiesParams): Promise<string> {
    const manager = KnowledgeGraphManager.getInstance();
    await manager.deleteEntities(args.entityNames);
    const entityCount = args.entityNames.length;
    const entityList = args.entityNames.join(', ');

    return `Successfully deleted ${entityCount} entities: ${entityList}`;
  }
}
