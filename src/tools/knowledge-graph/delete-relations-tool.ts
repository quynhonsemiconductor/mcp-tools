import { z } from 'zod';
import { CatchErrors } from '../../utils';
import { Tool, ToolHandler } from '../registry';
import { KnowledgeGraphManager } from './manager';

/**
 * Schema for relation deletion
 */
export const DeleteRelationsSchema = z.object({
  relations: z
    .array(
      z.object({
        from: z.string().describe('Source entity name'),
        to: z.string().describe('Target entity name'),
        relationType: z.string().describe('Type of the relation'),
      }),
    )
    .describe('Array of relations to delete from the knowledge graph'),
});

export type DeleteRelationsParams = z.infer<typeof DeleteRelationsSchema>;

/**
 * Tool for deleting relations from the knowledge graph
 */
@Tool({
  id: 'delete-relations',
  name: 'deleteRelations',
  description: 'Delete multiple relations from the knowledge graph',
  category: 'Knowledge Graph',
  parameters: DeleteRelationsSchema,
  version: '1.0.0',
  annotations: {
    title: 'Delete Knowledge Graph Relations',
    readOnlyHint: false,
  },
})
export class DeleteRelationsTool implements ToolHandler {
  /**
   * Execute the deleteRelations operation
   */
  @CatchErrors()
  async execute(args: DeleteRelationsParams): Promise<string> {
    const manager = KnowledgeGraphManager.getInstance();
    await manager.deleteRelations(args.relations);

    const relationCount = args.relations.length;
    const relationList = args.relations
      .map((r) => `${r.from} -> ${r.to} (${r.relationType})`)
      .join(', ');

    return `Successfully deleted ${relationCount} relations: ${relationList}`;
  }
}
