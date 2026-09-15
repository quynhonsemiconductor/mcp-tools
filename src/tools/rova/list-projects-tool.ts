/**
 * list-projects-tool.ts — the Rova projects this person can read.
 *
 * First call in almost any Rova conversation. Several of Rova's collections are only
 * readable within a project and refuse the request otherwise with
 * PROJECT_PERMISSION_DENIED, so a project id has to come from somewhere.
 */

import { z } from 'zod';
import { Tool, ToolHandler } from '../registry';
import { CatchErrors } from '../../utils';
import { rovaItems, rovaRequest, type RovaPage } from './api';

export const ListRovaProjectsSchema = z.object({
  query: z
    .string()
    .optional()
    .describe('Match on project name or key, e.g. "MCPT" or "knowledge". Omit to list all.'),
});

export type ListRovaProjectsParams = z.input<typeof ListRovaProjectsSchema>;

interface RovaProject {
  id?: string;
  key?: string;
  name?: string;
  description?: string | null;
  status?: string;
  leadName?: string | null;
  memberCount?: number;
  startDate?: string | null;
  endDate?: string | null;
}

@Tool({
  id: 'rova-list-projects',
  name: 'listRovaProjects',
  description:
    'List the Rova projects the signed-in user can read, with their keys and ids. Call this first: most other Rova tools need a projectId, and Rova refuses collection requests that lack one.',
  category: 'Rova',
  parameters: ListRovaProjectsSchema,
  version: '1.0.0',
  annotations: {
    title: 'List Rova Projects',
    readOnlyHint: true,
    openWorldHint: true,
  },
})
export class ListRovaProjectsTool implements ToolHandler {
  /**
   * List projects, optionally filtered by name or key.
   *
   * @param args - Optional match text
   * @returns JSON string of projects with the ids other tools need
   */
  @CatchErrors()
  async execute(args: ListRovaProjectsParams): Promise<string> {
    const { query } = ListRovaProjectsSchema.parse(args);

    const body = await rovaRequest<RovaPage<RovaProject> | RovaProject[]>('/projects');
    let projects = rovaItems(body);

    if (query) {
      // Filtered here rather than by the API: the project list is small enough that a
      // round trip per guess at the query parameter name is not worth it.
      const needle = query.toLowerCase();
      projects = projects.filter(
        (project) =>
          (project.key ?? '').toLowerCase().includes(needle) ||
          (project.name ?? '').toLowerCase().includes(needle),
      );
    }

    return JSON.stringify(
      {
        ...(query ? { query } : {}),
        count: projects.length,
        projects: projects.map((project) => ({
          key: project.key,
          name: project.name,
          projectId: project.id,
          status: project.status,
          lead: project.leadName || undefined,
          members: project.memberCount,
        })),
      },
      null,
      2,
    );
  }
}
