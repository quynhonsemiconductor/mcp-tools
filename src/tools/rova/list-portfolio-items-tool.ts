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

export const ListRovaPortfolioItemsSchema = z.object({
  // Required by Rova, not an oversight here. Its own comment explains it: the Type
  // selector has exactly two choices and no combined "All", so a caller that omits it is
  // asking the wrong question rather than asking for everything.
  type: z.enum(ROVA_PORTFOLIO_TYPES).describe('Epics or features. Rova requires one or the other.'),
  projectId: z
    .string()
    .optional()
    .describe('Restrict to one project, from listRovaProjects. Omit to span every readable project.'),
  search: z.string().max(255).optional().describe('Match on name'),
  state: z
    .enum(ROVA_PORTFOLIO_STATES)
    .optional()
    .describe('Keep only this funnel state. Filtered here, since Rova does not filter the list by state.'),
  includeArchived: z
    .boolean()
    .optional()
    .describe('Include archived items, which are hidden by default'),
  limit: z.number().int().min(1).max(100).default(25).describe('Maximum items to return'),
});

export type ListRovaPortfolioItemsParams = z.input<typeof ListRovaPortfolioItemsSchema>;

@Tool({
  id: 'rova-list-portfolio-items',
  name: 'listRovaPortfolioItems',
  description:
    'List Rova epics and features in a project. These sit above work items: an epic contains features, a feature contains stories. Their states form a funnel from intake to done, not the story delivery flow.',
  category: 'Rova',
  // Declared so the bundle offers a prompt for it at install and passes it through.
  // Without this the tools appear with no way to supply a token, and every call fails
  // on a missing variable — which is how ROVA_API_TOKEN was first shipped.
  envVars: ['ROVA_API_TOKEN'],
  optionalEnvVars: ['ROVA_API_URL'],
  parameters: ListRovaPortfolioItemsSchema,
  version: '1.0.0',
  annotations: { title: 'List Rova Portfolio Items', readOnlyHint: true, openWorldHint: true },
})
export class ListRovaPortfolioItemsTool implements ToolHandler {
  /**
   * List epics and features.
   *
   * @param args - Project and optional filters
   * @returns JSON string of item summaries
   */
  @CatchErrors()
  async execute(args: ListRovaPortfolioItemsParams): Promise<string> {
    const { type, projectId, search, state, includeArchived, limit } =
      ListRovaPortfolioItemsSchema.parse(args);

    const params = new URLSearchParams({ type, limit: String(limit) });
    if (projectId) params.set('projectId', projectId);
    if (search) params.set('search', search);
    if (includeArchived) params.set('includeArchived', 'true');

    const body = await rovaRequest<RovaPage<RovaPortfolioItem>>(
      `/portfolio-items?${params.toString()}`,
    );
    let items = rovaItems(body);

    // Rova's list takes no state filter, so this narrows the page that came back. The
    // total below still reports what Rova matched, which is the honest number.
    if (state) items = items.filter((item) => item.state === state);

    return JSON.stringify(
      {
        projectId,
        filters: { type, projectId, search, state, includeArchived },
        count: items.length,
        totalMatching: body?.pageInfo?.total,
        items: items.map(summarisePortfolioItem),
      },
      null,
      2,
    );
  }
}

