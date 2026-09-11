import { z } from 'zod';
import { CatchErrors } from '../../utils';
import { Tool, ToolHandler } from '../registry';
import { KnowledgeGraphManager } from './manager';

/**
 * Schema for entity creation
 */
const EntitySchema = z.object({
  name: z.string().describe('Human-readable name for the entity'),
  entityType: z.string().describe('Type or category of the entity'),
  observations: z.array(z.string()).describe('List of observations about this entity'),
});

/**
 * Schema for createEntities tool parameters
 */
export const CreateEntitiesSchema = z.object({
  entities: z.array(EntitySchema).describe('Array of entities to create in the knowledge graph'),
});

export type CreateEntitiesParams = z.infer<typeof CreateEntitiesSchema>;

/**
 * Tool for creating multiple entities in the knowledge graph
 */
@Tool({
  id: 'create-entities',
  name: 'createEntities',
  description: 'Create multiple new entities in the knowledge graph',
  category: 'Knowledge Graph',
  parameters: CreateEntitiesSchema,
  version: '1.0.0',
  annotations: {
    title: 'Create Knowledge Graph Entities',
    readOnlyHint: false,
  },
})
export class CreateEntitiesTool implements ToolHandler {
  @CatchErrors()
  async execute(args: CreateEntitiesParams): Promise<string> {
    const manager = KnowledgeGraphManager.getInstance();
    const created = await manager.createEntities(args.entities);

    return JSON.stringify(created, null, 2);
  }
}
