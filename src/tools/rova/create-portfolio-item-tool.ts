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

export const CreateRovaPortfolioItemSchema = z.object({
  projectId: z.string().min(1).describe('Project to create it in'),
  type: z.enum(ROVA_PORTFOLIO_TYPES).describe('An epic, or a feature'),
  name: z.string().min(1).max(500).describe('Name. Portfolio items carry a name, not a title.'),
  description: z.string().max(50_000).optional().describe('What it is'),
  whatSuccessLooksLike: z.string().max(50_000).optional().describe('The outcome being aimed at'),
  state: z.enum(ROVA_PORTFOLIO_STATES).optional().describe('Funnel state. Omit to start at the default.'),
  preliminaryEstimate: z
    .enum(ROVA_ESTIMATE_SIZES)
    .optional()
    .describe('T-shirt size. What a size means in points is per-project configuration.'),
  parentId: z
    .string()
    .optional()
    .describe('Parent epic, when creating a feature beneath one'),
  ownerId: z.string().optional().describe('Owner user id'),
  plannedStartDate: z.string().optional().describe('Planned start, ISO date'),
  plannedEndDate: z.string().optional().describe('Planned end, ISO date'),
});

export type CreateRovaPortfolioItemParams = z.input<typeof CreateRovaPortfolioItemSchema>;

@Tool({
  id: 'rova-create-portfolio-item',
  name: 'createRovaPortfolioItem',
  description:
    'Create a Rova epic or feature. Use for work described above the story level. Pass parentId to place a feature beneath an epic.',
  category: 'Rova',
  parameters: CreateRovaPortfolioItemSchema,
  version: '1.0.0',
  annotations: {
    title: 'Create Rova Portfolio Item',
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: true,
  },
})
export class CreateRovaPortfolioItemTool implements ToolHandler {
  /**
   * Create an epic or feature.
   *
   * @param args - Project, type, name and optional detail
   * @returns JSON string with the new item's key and id
   */
  @CatchErrors()
  async execute(args: CreateRovaPortfolioItemParams): Promise<string> {
    const parsed = CreateRovaPortfolioItemSchema.parse(args);
    if (parsed.type === 'epic' && parsed.parentId) {
      throw new UserError(
        'An epic is the top of the hierarchy and takes no parent. Give parentId only when creating a feature beneath an epic.',
      );
    }

    // Only what was given: Rova applies its own defaults, and explicit nulls would
    // replace them with nothing.
    const payload: Record<string, unknown> = {
      projectId: parsed.projectId,
      type: parsed.type,
      name: parsed.name,
    };
    for (const key of [
      'description',
      'whatSuccessLooksLike',
      'state',
      'preliminaryEstimate',
      'parentId',
      'ownerId',
      'plannedStartDate',
      'plannedEndDate',
    ] as const) {
      if (parsed[key] !== undefined) payload[key] = parsed[key];
    }

    const created = await rovaRequest<RovaPortfolioItem>('/portfolio-items', {
      method: 'POST',
      body: JSON.stringify(payload),
    });

    return JSON.stringify({ created: true, ...summarisePortfolioItem(created) }, null, 2);
  }
}
