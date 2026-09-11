import { z } from 'zod';
import env from '../../env';
import { CatchErrors } from '../../utils';
import { Tool, ToolHandler } from '../registry';
import type { ProjectInfo } from './api';
import { K6ApiError, K6Client } from './api';

/**
 * Schema definition for the list user projects tool parameters
 */
export const ListUserProjectsToolSchema = z.object({});

/**
 * Type for the list user projects tool parameters
 */
export type ListUserProjectsToolParams = z.infer<typeof ListUserProjectsToolSchema>;

/** Minimal shape read from a k6 /v3/account/me response */
interface K6UserInfo {
  email?: string;
}

/** Minimal shape read from a k6 project record */
interface K6ProjectRecord {
  id?: string | number;
  project_id?: string | number;
  name?: string;
}

/**
 * Validate auth, retrieve all projects the authenticated user is associated
 * with, and verify accessibility of each project
 */
@Tool({
  id: 'k6-list-user-projects',
  name: 'listK6UserProjects',
  description:
    'Validate k6 Cloud authentication and list all projects the authenticated user has access to, including per-project accessibility checks',
  category: 'k6',
  parameters: ListUserProjectsToolSchema,
  version: '1.0.0',
  envVars: ['GRAFANA_K6_TOKEN'],
  annotations: {
    title: 'List k6 User Projects',
    readOnlyHint: true,
    openWorldHint: true,
  },
})
export class ListUserProjectsTool implements ToolHandler {
  /**
   * Execute the list user projects tool
   */
  @CatchErrors()
  async execute(_args: ListUserProjectsToolParams): Promise<string> {
    const client = new K6Client();

    // Implicit auth validation
    const me = await client.getMe();
    const user = me?.user as K6UserInfo | undefined;
    const email = user?.email ?? 'unknown';

    // Probe v6 API if stackId is configured
    let v6Status = 'not tested (GRAFANA_K6_STACK_ID not set)';
    if (env.GRAFANA_K6_STACK_ID) {
      try {
        await client.listLoadTests({ top: 1 });
        v6Status = 'ok';
      } catch (e) {
        v6Status = `error: ${e instanceof Error ? e.message : String(e)}`;
      }
    }

    // Fetch all projects across orgs
    const allProjects = (await client.listAllProjects()) as K6ProjectRecord[];

    // Per-project accessibility check (parallel)
    const projectMeta = allProjects.map((proj) => {
      const projectId = String(proj.id ?? proj.project_id ?? '');
      const projectName = proj.name ?? '';
      return { projectId, projectName };
    });

    const results = await Promise.allSettled(
      projectMeta.map((p) => client.getProject(p.projectId)),
    );

    const projects: ProjectInfo[] = projectMeta.map((p, i) => {
      const result = results[i];
      let accessible = true;
      if (result.status === 'rejected') {
        const err: unknown = result.reason;
        if (err instanceof K6ApiError && ['AUTH_ERROR', 'NOT_FOUND'].includes(err.code)) {
          accessible = false;
        } else {
          throw err;
        }
      }
      return { projectId: p.projectId, projectName: p.projectName, accessible };
    });

    return JSON.stringify(
      {
        authenticatedUser: email,
        v6ApiStatus: v6Status,
        projects,
        summary: {
          totalProjects: projects.length,
          accessibleProjects: projects.filter((p) => p.accessible).length,
        },
      },
      null,
      2,
    );
  }
}
