import { z } from 'zod';
import { CatchErrors } from '../../utils';
import { Tool, ToolHandler } from '../registry';
import { K6Client, K6ApiError } from './api';
import type { LoadTestInfo } from './api';

/**
 * Schema definition for the list project load tests tool parameters
 */
export const ListProjectLoadTestsToolSchema = z.object({
  projectId: z.string().optional().describe('ID of the project to list load tests for'),
  projectName: z
    .string()
    .optional()
    .describe('Name of the project (used for lookup if projectId is not provided)'),
});

/**
 * Type for the list project load tests tool parameters
 */
export type ListProjectLoadTestsToolParams = z.infer<typeof ListProjectLoadTestsToolSchema>;

/** Minimal shape read from a k6 project record for lookup purposes */
interface K6ProjectSummary {
  id?: string | number;
  name?: string;
}

/**
 * Resolve a project ID from either projectId or projectName
 */
async function resolveProjectId(
  client: K6Client,
  input: ListProjectLoadTestsToolParams,
): Promise<{ projectId: string; projectName?: string }> {
  if (input.projectId) {
    return { projectId: input.projectId };
  }

  if (!input.projectName) {
    throw new K6ApiError('INVALID_INPUT', 'Either projectId or projectName must be provided.');
  }

  const allProjects = (await client.listAllProjects()) as K6ProjectSummary[];
  const needle = input.projectName.toLowerCase();
  const match = allProjects.find((p) => (p.name ?? '').toLowerCase() === needle);
  if (!match) {
    const partial = allProjects.filter((p) => (p.name ?? '').toLowerCase().includes(needle));
    if (partial.length === 1) {
      return {
        projectId: String(partial[0].id),
        projectName: String(partial[0].name),
      };
    }
    const hint =
      partial.length > 0
        ? ` Partial matches: ${partial.map((p) => `${p.name ?? ''} (${p.id ?? ''})`).join(', ')}`
        : '';
    throw new K6ApiError('NOT_FOUND', `No project found with name "${input.projectName}".${hint}`);
  }
  return {
    projectId: String(match.id),
    projectName: String(match.name),
  };
}

/**
 * List all load tests in a k6 Cloud project by ID or name
 */
@Tool({
  id: 'k6-list-project-load-tests',
  name: 'listK6ProjectLoadTests',
  description:
    'List all load tests in a k6 Cloud project. Resolves project by ID or name (with partial matching) and paginates through all load tests.',
  category: 'k6',
  parameters: ListProjectLoadTestsToolSchema,
  version: '1.0.0',
  envVars: ['GRAFANA_K6_TOKEN'],
  annotations: {
    title: 'List k6 Project Load Tests',
    readOnlyHint: true,
    openWorldHint: true,
  },
})
export class ListProjectLoadTestsTool implements ToolHandler {
  /**
   * Execute the list project load tests tool
   */
  @CatchErrors()
  async execute(args: ListProjectLoadTestsToolParams): Promise<string> {
    const client = new K6Client();
    const { projectId, projectName } = await resolveProjectId(client, args);
    const loadTests: LoadTestInfo[] = [];
    let skip = 0;
    const top = 100;

    while (true) {
      const page = await client.listProjectLoadTests(projectId, {
        top,
        skip,
        count: true,
      });

      for (const lt of page.value) {
        loadTests.push({
          loadTestId: String(lt.id),
          name: lt.name,
          projectId: String(lt.project_id),
          created: lt.created,
          updated: lt.updated,
          baselineTestRunId: lt.baseline_test_run_id ? String(lt.baseline_test_run_id) : null,
        });
      }

      if (page.value.length < top) break;
      skip += top;
    }

    return JSON.stringify(
      {
        projectId,
        projectName,
        loadTests,
        summary: { totalLoadTests: loadTests.length },
      },
      null,
      2,
    );
  }
}
