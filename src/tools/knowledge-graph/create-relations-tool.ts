import { z } from 'zod';
import { CatchErrors } from '../../utils';
import { Tool, ToolHandler } from '../registry';
import { KnowledgeGraphManager } from './manager';

/**
 * Schema for relation creation
 */
const RelationSchema = z.object({
  from: z.string().describe('Name of the source entity'),
  to: z.string().describe('Name of the target entity'),
  relationType: z.string().describe('Type or label of the relationship'),
});

/**
 * Schema for createRelations tool parameters
 */
export const CreateRelationsSchema = z.object({
  relations: z
    .array(RelationSchema)
    .describe('Array of relations to create in the knowledge graph'),
});

export type CreateRelationsParams = z.infer<typeof CreateRelationsSchema>;

/**
 * Tool for creating multiple relations in the knowledge graph
 */
@Tool({
  id: 'create-relations',
  name: 'createRelations',
  description:
    'Create multiple new relations between entities in the knowledge graph. Relations should be in active voice',
  category: 'Knowledge Graph',
  parameters: CreateRelationsSchema,
  version: '1.0.0',
  annotations: {
    title: 'Create Knowledge Graph Relations',
    readOnlyHint: false,
  },
})
export class CreateRelationsTool implements ToolHandler {
  /**
   * Execute the createRelations operation
   */ @CatchErrors()
  async execute(args: CreateRelationsParams): Promise<string> {
    const manager = KnowledgeGraphManager.getInstance();
    const created = await manager.createRelations(args.relations);

    return JSON.stringify(created, null, 2);
  }
}
