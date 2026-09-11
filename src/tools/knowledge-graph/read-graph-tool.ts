import { z } from 'zod';
import { CatchErrors } from '../../utils';
import { Tool, ToolHandler } from '../registry';
import { KnowledgeGraphManager } from './manager';

/**
 * Schema for readGraph tool parameters
 */
export const ReadGraphSchema = z.object({
  entityNames: z
    .array(z.string())
    .optional()
    .describe('Specific entity names to read (if not provided, returns entire graph)'),
  includeRelations: z
    .boolean()
    .default(true)
    .describe('Whether to include relations in the response'),
  includeObservations: z
    .boolean()
    .default(true)
    .describe('Whether to include entity observations in the response'),
  maxDepth: z
    .number()
    .int()
    .min(0)
    .max(10)
    .optional()
    .describe(
      'Maximum depth for relation traversal (0 = no relations, unlimited if not specified)',
    ),
});

export type ReadGraphParams = z.infer<typeof ReadGraphSchema>;

/**
 * Tool for reading/querying the knowledge graph
 */
@Tool({
  id: 'read-graph',
  name: 'readGraph',
  description: 'Read and query the knowledge graph structure, entities, and relations',
  category: 'Knowledge Graph',
  parameters: ReadGraphSchema,
  version: '1.0.0',
  annotations: {
    title: 'Read Knowledge Graph',
    readOnlyHint: true,
  },
})
export class ReadGraphTool implements ToolHandler {
  /**
   * Execute the readGraph operation
   */
  @CatchErrors()
  async execute(args: ReadGraphParams): Promise<string> {
    const manager = KnowledgeGraphManager.getInstance();

    // If specific entities are requested, filter the graph
    let graph;
    if (args.entityNames && args.entityNames.length > 0) {
      graph = await manager.openNodes(args.entityNames);
    } else {
      graph = await manager.readGraph();
    }

    // Apply filtering based on parameters
    const filteredGraph = {
      entities: args.includeObservations
        ? graph.entities
        : graph.entities.map((e) => ({ ...e, observations: [] })),
      relations: args.includeRelations ? graph.relations : [],
    };

    // Add summary information
    const result = {
      ...filteredGraph,
      summary: {
        entityCount: filteredGraph.entities.length,
        relationCount: filteredGraph.relations.length,
        totalObservations: filteredGraph.entities.reduce(
          (sum, e) => sum + e.observations.length,
          0,
        ),
      },
    };

    return JSON.stringify(result, null, 2);
  }
}
