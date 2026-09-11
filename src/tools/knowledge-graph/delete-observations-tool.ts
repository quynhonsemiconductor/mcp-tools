import { z } from 'zod';
import { CatchErrors } from '../../utils';
import { Tool, ToolHandler } from '../registry';
import { KnowledgeGraphManager } from './manager';

/**
 * Schema for deleteObservations tool parameters
 */
export const DeleteObservationsSchema = z.object({
  deletions: z
    .array(
      z.object({
        entityName: z.string().describe('Name of the entity to remove observations from'),
        observations: z
          .array(z.string())
          .describe('Array of observation strings to remove from the entity'),
      }),
    )
    .describe('Array of deletion operations to perform'),
});

export type DeleteObservationsParams = z.infer<typeof DeleteObservationsSchema>;

/**
 * Tool for deleting observations from an existing entity in the knowledge graph
 */
@Tool({
  id: 'delete-observations',
  name: 'deleteObservations',
  description: 'Delete specific observations from entities in the knowledge graph',
  category: 'Knowledge Graph',
  parameters: DeleteObservationsSchema,
  version: '1.0.0',
  annotations: {
    title: 'Delete Knowledge Graph Observations',
    readOnlyHint: false,
  },
})
export class DeleteObservationsTool implements ToolHandler {
  /**
   * Execute the deleteObservations operation
   */
  @CatchErrors()
  async execute(args: DeleteObservationsParams): Promise<string> {
    const manager = KnowledgeGraphManager.getInstance();
    await manager.deleteObservations(args.deletions);

    const totalObservations = args.deletions.reduce(
      (sum, deletion) => sum + deletion.observations.length,
      0,
    );
    const entitiesAffected = args.deletions.map((d) => d.entityName).join(', ');

    return `Successfully deleted ${totalObservations} observations from ${args.deletions.length} entities: ${entitiesAffected}`;
  }
}
