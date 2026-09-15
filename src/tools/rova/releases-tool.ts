/**
 * releases-tool.ts — releases and what is in them.
 *
 * Answers "what is shipping" and "what is in this release". The artifacts are fetched with
 * the release because the second question follows the first almost every time, and a
 * release without its contents is a date and a name.
 */

import { z } from 'zod';
import { Tool, ToolHandler } from '../registry';
import { CatchErrors } from '../../utils';
import { rovaItems, rovaRequest, type RovaPage } from './api';
import { summariseWorkItem, type RovaWorkItem } from './types';

interface RovaRelease {
  id?: string;
  name?: string;
  state?: string;
  startDate?: string | null;
  releaseDate?: string | null;
  projectId?: string;
  theme?: string | null;
  plannedVelocity?: number | null;
}

export const ListRovaReleasesSchema = z.object({
  projectId: z.string().min(1).describe('Project whose releases to list, from listRovaProjects'),
  releaseId: z
    .string()
    .optional()
    .describe('Read one release and the stories and defects in it, rather than listing all'),
  limit: z.number().int().min(1).max(100).default(25).describe('Maximum releases to return'),
});

export type ListRovaReleasesParams = z.input<typeof ListRovaReleasesSchema>;

@Tool({
  id: 'rova-list-releases',
  name: 'listRovaReleases',
  description:
    'List the releases of a Rova project, or pass releaseId to read one with the stories and defects it contains. Use for what is shipping and when.',
  category: 'Rova',
  // Declared so the bundle offers a prompt for it at install and passes it through.
  // Without this the tools appear with no way to supply a token, and every call fails
  // on a missing variable — which is how ROVA_API_TOKEN was first shipped.
  envVars: ['ROVA_API_TOKEN'],
  optionalEnvVars: ['ROVA_API_URL'],
  parameters: ListRovaReleasesSchema,
  version: '1.0.0',
  annotations: { title: 'List Rova Releases', readOnlyHint: true, openWorldHint: true },
})
export class ListRovaReleasesTool implements ToolHandler {
  /**
   * List releases, or read one with its contents.
   *
   * @param args - Project, optional release id, and a limit
   * @returns JSON string of releases, or one release with its artifacts
   */
  @CatchErrors()
  async execute(args: ListRovaReleasesParams): Promise<string> {
    const { projectId, releaseId, limit } = ListRovaReleasesSchema.parse(args);

    if (releaseId) {
      const release = await rovaRequest<RovaRelease>(
        `/releases/${encodeURIComponent(releaseId)}`,
      );
      let artifacts: RovaWorkItem[] = [];
      // A release with no readable contents is still worth returning; losing the whole
      // answer because the artifact list failed would be worse.
      try {
        artifacts = rovaItems(
          await rovaRequest<RovaPage<RovaWorkItem>>(
            `/releases/${encodeURIComponent(releaseId)}/artifacts?limit=100`,
          ),
        );
      } catch {
        artifacts = [];
      }

      return JSON.stringify(
        {
          releaseId: release.id ?? releaseId,
          name: release.name,
          state: release.state,
          theme: release.theme || undefined,
          start: release.startDate || undefined,
          releaseDate: release.releaseDate || undefined,
          plannedVelocity: release.plannedVelocity ?? undefined,
          artifactCount: artifacts.length,
          artifacts: artifacts.map(summariseWorkItem),
        },
        null,
        2,
      );
    }

    const body = await rovaRequest<RovaPage<RovaRelease>>(
      `/releases?projectId=${encodeURIComponent(projectId)}&limit=${limit}`,
    );
    const releases = rovaItems(body);

    return JSON.stringify(
      {
        projectId,
        count: releases.length,
        hint: 'Pass releaseId to see the stories and defects in one of these.',
        releases: releases.map((release) => ({
          releaseId: release.id,
          name: release.name,
          state: release.state,
          theme: release.theme || undefined,
          start: release.startDate || undefined,
          releaseDate: release.releaseDate || undefined,
        })),
      },
      null,
      2,
    );
  }
}
