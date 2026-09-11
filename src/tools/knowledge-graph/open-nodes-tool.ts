import { z } from 'zod';
import { CatchErrors } from '../../utils';
import { Tool, ToolHandler } from '../registry';
import { KnowledgeGraphManager } from './manager';

/**
 * Schema for openNodes tool parameters
 */
export const OpenNodesSchema = z.object({
  entityNames: z.array(z.string()).describe('Array of entity names to open/expand'),
  depth: z
    .number()
    .int()
    .min(1)
    .max(5)
    .default(1)
    .describe('Depth of relations to expand (how many levels of connected nodes to include)'),
  includeObservations: z
    .boolean()
    .default(true)
    .describe('Whether to include observations for opened nodes'),
});

export type OpenNodesParams = z.infer<typeof OpenNodesSchema>;

/**
 * Tool for opening/expanding nodes in the knowledge graph to show their connections
 */
@Tool({
  id: 'open-nodes',
  name: 'openNodes',
  description:
    'Open/expand specific nodes in the knowledge graph to show their connections and related entities',
  category: 'Knowledge Graph',
  parameters: OpenNodesSchema,
  version: '1.0.0',
  annotations: {
    title: 'Open Knowledge Graph Nodes',
    readOnlyHint: true,
  },
})
export class OpenNodesTool implements ToolHandler {
  /**
   * Execute the openNodes operation
   */
  @CatchErrors()
  async execute(args: OpenNodesParams): Promise<string> {
    const manager = KnowledgeGraphManager.getInstance();
    const openedGraph = await manager.openNodes(args.entityNames);

    // Filter observations if needed
    let filteredEntities = openedGraph.entities;
    if (!args.includeObservations) {
      filteredEntities = filteredEntities.map((e) => ({
        ...e,
        observations: [],
      }));
    }

    const result = {
      openedEntities: args.entityNames,
      depth: args.depth || 1,
      result: {
        entities: filteredEntities,
        relations: openedGraph.relations,
      },
      summary: {
        entityCount: filteredEntities.length,
        relationCount: openedGraph.relations.length,
        totalObservations: filteredEntities.reduce((sum, e) => sum + e.observations.length, 0),
      },
    };

    return JSON.stringify(result, null, 2);
  }
}
