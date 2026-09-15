/**
 * milestones-tool.ts — dated commitments, and the work tied to them.
 *
 * A milestone in Rova is not a timebox like an iteration: it is a date something is
 * promised by, with work items, releases, projects and teams linked to it. So the useful
 * read is the milestone together with what it depends on, and the artifacts are fetched
 * alongside it.
 */

import { z } from 'zod';
import { Tool, ToolHandler } from '../registry';
import { CatchErrors } from '../../utils';
import { rovaItems, rovaRequest, type RovaPage } from './api';
import { summariseWorkItem, type RovaWorkItem } from './types';

/** From `milestone_status`. */
export const ROVA_MILESTONE_STATUSES = [
  'planned',
  'at_risk',
  'met',
  'missed',
  'cancelled',
  'completed',
] as const;

interface RovaMilestone {
  id?: string;
  name?: string;
  status?: string;
  description?: string | null;
  notes?: string | null;
  ownerId?: string | null;
  ownerName?: string | null;
  targetStartDate?: string | null;
  targetEndDate?: string | null;
  projectId?: string;
  artifactCount?: number;
  createdAt?: string;
  updatedAt?: string;
}

/**
 * Reduce a milestone for a list.
 *
 * @param milestone - Milestone from the API
 * @returns The fields worth listing
 */
function summarise(milestone: RovaMilestone) {
  return {
    milestoneId: milestone.id,
    name: milestone.name,
    status: milestone.status,
    owner: milestone.ownerName || undefined,
    targetStart: milestone.targetStartDate || undefined,
    targetEnd: milestone.targetEndDate || undefined,
    artifactCount: milestone.artifactCount ?? undefined,
  };
}

export const ListRovaMilestonesSchema = z.object({
  projectId: z
    .string()
    .min(1)
    .describe('Project whose milestones to list, from listRovaProjects. Rova requires it.'),
  milestoneId: z
    .string()
    .optional()
    .describe('Read one milestone with the work items linked to it, rather than listing all'),
  status: z
    .enum(ROVA_MILESTONE_STATUSES)
    .optional()
    .describe('Keep only this status. Filtered here, since Rova does not filter the list by status.'),
  limit: z.number().int().min(1).max(100).default(25).describe('Maximum milestones to return'),
});

export type ListRovaMilestonesParams = z.input<typeof ListRovaMilestonesSchema>;

@Tool({
  id: 'rova-list-milestones',
  name: 'listRovaMilestones',
  description:
    'List the milestones of a Rova project with their target dates and status, or pass milestoneId to read one with the work items linked to it. Use for dated commitments and whether they are at risk.',
  category: 'Rova',
  parameters: ListRovaMilestonesSchema,
  version: '1.0.0',
  annotations: { title: 'List Rova Milestones', readOnlyHint: true, openWorldHint: true },
})
export class ListRovaMilestonesTool implements ToolHandler {
  /**
   * List milestones, or read one with its linked work.
   *
   * @param args - Project, optional milestone id, optional status and a limit
   * @returns JSON string of milestones, or one milestone with its artifacts
   */
  @CatchErrors()
  async execute(args: ListRovaMilestonesParams): Promise<string> {
    const { projectId, milestoneId, status, limit } = ListRovaMilestonesSchema.parse(args);

    if (milestoneId) {
      const milestone = await rovaRequest<RovaMilestone>(
        `/milestones/${encodeURIComponent(milestoneId)}`,
      );
      let artifacts: RovaWorkItem[] = [];
      // The items route, not the links route: links give ids, items give the work itself,
      // which is what a question about a milestone is actually about.
      try {
        artifacts = rovaItems<RovaWorkItem>(
          await rovaRequest<RovaPage<RovaWorkItem>>(
            `/milestones/${encodeURIComponent(milestoneId)}/artifacts/items?limit=100`,
          ),
        );
      } catch {
        artifacts = [];
      }

      return JSON.stringify(
        {
          ...summarise(milestone),
          description: milestone.description || undefined,
          notes: milestone.notes || undefined,
          linkedWorkItems: artifacts.length,
          workItems: artifacts.map(summariseWorkItem),
        },
        null,
        2,
      );
    }

    const body = await rovaRequest<RovaPage<RovaMilestone>>(
      `/milestones?projectId=${encodeURIComponent(projectId)}&limit=${limit}`,
    );
    let milestones = rovaItems<RovaMilestone>(body);
    if (status) milestones = milestones.filter((milestone) => milestone.status === status);

    return JSON.stringify(
      {
        projectId,
        count: milestones.length,
        totalMatching: body?.pageInfo?.total,
        hint: 'Pass milestoneId to see the work items linked to one of these.',
        milestones: milestones.map(summarise),
      },
      null,
      2,
    );
  }
}

export const CreateRovaMilestoneSchema = z.object({
  projectId: z.string().min(1).describe('Project the milestone belongs to'),
  name: z.string().min(1).max(255).describe('What is being committed to'),
  description: z.string().max(5000).optional().describe('What it covers'),
  notes: z.string().max(10_000).optional().describe('Additional notes'),
  status: z
    .enum(ROVA_MILESTONE_STATUSES)
    .optional()
    .describe('Status. Omit to start at the default.'),
  ownerId: z.string().optional().describe('Owner user id'),
  targetStartDate: z.string().optional().describe('Target start, YYYY-MM-DD'),
  targetEndDate: z.string().optional().describe('Target date it is promised by, YYYY-MM-DD'),
  releaseIds: z
    .array(z.string())
    .default([])
    .describe(
      'Releases this milestone covers. Rova requires the field even when nothing is linked yet, so it defaults to empty rather than being omitted.',
    ),
  teamIds: z.array(z.string()).optional().describe('Teams accountable for it'),
});

export type CreateRovaMilestoneParams = z.input<typeof CreateRovaMilestoneSchema>;

@Tool({
  id: 'rova-create-milestone',
  name: 'createRovaMilestone',
  description:
    'Create a Rova milestone: a dated commitment in a project, optionally linked to releases and teams. Work items are attached afterwards.',
  category: 'Rova',
  parameters: CreateRovaMilestoneSchema,
  version: '1.0.0',
  annotations: {
    title: 'Create Rova Milestone',
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: true,
  },
})
export class CreateRovaMilestoneTool implements ToolHandler {
  /**
   * Create a milestone.
   *
   * @param args - Project, name and optional detail
   * @returns JSON string with the new milestone's id
   */
  @CatchErrors()
  async execute(args: CreateRovaMilestoneParams): Promise<string> {
    const parsed = CreateRovaMilestoneSchema.parse(args);

    // releaseIds is sent unconditionally: Rova's create schema does not mark it optional,
    // so leaving it out fails validation even when there is nothing to link. Everything
    // else is sent only when given, so Rova's own defaults still apply.
    const payload: Record<string, unknown> = {
      projectId: parsed.projectId,
      name: parsed.name,
      releaseIds: parsed.releaseIds,
    };
    for (const key of [
      'description',
      'notes',
      'status',
      'ownerId',
      'targetStartDate',
      'targetEndDate',
      'teamIds',
    ] as const) {
      if (parsed[key] !== undefined) payload[key] = parsed[key];
    }

    const created = await rovaRequest<RovaMilestone>('/milestones', {
      method: 'POST',
      body: JSON.stringify(payload),
    });

    return JSON.stringify({ created: true, projectId: parsed.projectId, ...summarise(created) }, null, 2);
  }
}
