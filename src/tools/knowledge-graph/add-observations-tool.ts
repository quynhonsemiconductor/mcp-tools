import { z } from 'zod';
import { CatchErrors } from '../../utils';
import { Tool, ToolHandler } from '../registry';
import { KnowledgeGraphManager } from './manager';

/**
 * Schema for adding observations to entities
 */
export const AddObservationsSchema = z.object({
  observations: z
    .array(
      z.object({
        entityName: z.string().describe('The name of the entity to add the observations to'),
        contents: z.array(z.string()).describe('An array of observation contents to add'),
      }),
    )
    .describe('Array of observations to add to entities'),
});

export type AddObservationsParams = z.infer<typeof AddObservationsSchema>;

/**
 * Tool for adding observations to an existing entity in the knowledge graph
 */
@Tool({
  id: 'add-observations',
  name: 'addObservations',
  description: 'Add new observations to existing entities in the knowledge graph',
  category: 'Knowledge Graph',
  parameters: AddObservationsSchema,
  version: '1.0.0',
  annotations: {
    title: 'Add Knowledge Graph Observations',
    readOnlyHint: false,
  },
})
export class AddObservationsTool implements ToolHandler {
  /**
   * Execute the addObservations operation
   */ @CatchErrors()
  async execute(args: AddObservationsParams): Promise<string> {
    const manager = KnowledgeGraphManager.getInstance();
    const results = await manager.addObservations(args.observations);

    return JSON.stringify(results, null, 2);
  }
}
