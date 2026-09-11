import { z } from 'zod';
import { CatchErrors } from '../../utils';
import { Tool, ToolHandler } from '../registry';
import { KnowledgeGraphManager } from './manager';

/**
 * Schema for searchNodes tool parameters
 */
export const SearchNodesSchema = z.object({
  query: z.string().describe('Search query string to find matching entities'),
  searchIn: z
    .array(z.enum(['name', 'content', 'observations', 'type']))
    .default(['name', 'content'])
    .describe('Fields to search in'),
  limit: z
    .number()
    .int()
    .min(1)
    .max(100)
    .default(10)
    .describe('Maximum number of results to return'),
  exactMatch: z
    .boolean()
    .default(false)
    .describe('Whether to use exact string matching instead of fuzzy search'),
});

export type SearchNodesParams = z.infer<typeof SearchNodesSchema>;

/**
 * Tool for searching entities/nodes in the knowledge graph
 */
@Tool({
  id: 'search-nodes',
  name: 'searchNodes',
  description: 'Search for entities/nodes in the knowledge graph by content, name, or other fields',
  category: 'Knowledge Graph',
  parameters: SearchNodesSchema,
  version: '1.0.0',
  annotations: {
    title: 'Search Knowledge Graph Nodes',
    readOnlyHint: true,
    openWorldHint: true,
  },
})
export class SearchNodesTool implements ToolHandler {
  /**
   * Execute the searchNodes operation
   */
  @CatchErrors()
  async execute(args: SearchNodesParams): Promise<string> {
    const manager = KnowledgeGraphManager.getInstance();
    const searchResult = await manager.searchNodes(args.query);

    // Apply limit
    const limitedEntities = searchResult.entities.slice(0, args.limit || 10);
    const limitedRelations = searchResult.relations.filter(
      (r) =>
        limitedEntities.some((e) => e.name === r.from) &&
        limitedEntities.some((e) => e.name === r.to),
    );

    const result = {
      query: args.query,
      matches: {
        entities: limitedEntities,
        relations: limitedRelations,
      },
      summary: {
        entityMatches: limitedEntities.length,
        relationMatches: limitedRelations.length,
        totalFound: searchResult.entities.length,
        limited: searchResult.entities.length > (args.limit || 10),
      },
    };

    return JSON.stringify(result, null, 2);
  }
}
