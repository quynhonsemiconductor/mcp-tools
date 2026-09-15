import { z } from 'zod';
import { Tool, ToolHandler } from '../registry';
import { CatchErrors, UserError } from '../../utils';
import { rovaItems, rovaRequest, type RovaPage } from './api';
import {
  ROVA_ESTIMATE_SIZES,
  ROVA_PORTFOLIO_STATES,
  ROVA_PORTFOLIO_TYPES,
  summarisePortfolioItem,
  type RovaPortfolioItem,
} from './portfolio-types';

export const GetRovaPortfolioItemSchema = z.object({
  id: z.string().min(1).describe('Portfolio item id, from listRovaPortfolioItems'),
  includeChildren: z
    .boolean()
    .default(true)
    .describe('Include the items beneath this one: features under an epic, stories under a feature'),
});

export type GetRovaPortfolioItemParams = z.input<typeof GetRovaPortfolioItemSchema>;

@Tool({
  id: 'rova-get-portfolio-item',
  name: 'getRovaPortfolioItem',
  description:
    'Read one Rova epic or feature in full, with what sits beneath it. Use to see how a feature breaks down, or what an epic contains.',
  category: 'Rova',
  parameters: GetRovaPortfolioItemSchema,
  version: '1.0.0',
  annotations: { title: 'Get Rova Portfolio Item', readOnlyHint: true, openWorldHint: true },
})
export class GetRovaPortfolioItemTool implements ToolHandler {
  /**
   * Read one item, with its children.
   *
   * @param args - Item id and whether to include children
   * @returns JSON string of the item and what is beneath it
   */
  @CatchErrors()
  async execute(args: GetRovaPortfolioItemParams): Promise<string> {
    const { id, includeChildren } = GetRovaPortfolioItemSchema.parse(args);
    const item = await rovaRequest<RovaPortfolioItem>(
      `/portfolio-items/${encodeURIComponent(id)}`,
    );

    let children: RovaPortfolioItem[] = [];
    if (includeChildren) {
      // Losing the children should not lose the item, which is what was asked for.
      try {
        children = rovaItems(
          await rovaRequest<RovaPage<RovaPortfolioItem>>(
            `/portfolio-items/${encodeURIComponent(id)}/children`,
          ),
        );
      } catch {
        children = [];
      }
    }

    return JSON.stringify(
      {
        ...summarisePortfolioItem(item),
        project: item.projectKey || item.projectId,
        description: item.description || undefined,
        notes: item.notes || undefined,
        // Rova's own field name, and the interesting one on a portfolio item: it is the
        // outcome rather than the acceptance criteria of a story.
        whatSuccessLooksLike: item.whatSuccessLooksLike || undefined,
        refinedItemCountEstimate: item.refinedItemCountEstimate ?? undefined,
        plannedStart: item.plannedStartDate || undefined,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
        ...(includeChildren
          ? { childCount: children.length, children: children.map(summarisePortfolioItem) }
          : {}),
      },
      null,
      2,
    );
  }
}

