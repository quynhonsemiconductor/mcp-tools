import { z } from 'zod';
import { CatchErrors } from '../../utils';
import { Tool, ToolHandler } from '../registry';
import { K6ApiError, K6Client } from './api';
import type { TestRunResult } from './api';

/**
 * Schema definition for the get scenario results tool parameters
 */
export const GetScenarioResultsToolSchema = z.object({
  projectId: z.string().describe('ID of the project containing the scenario'),
  scenarioName: z.string().describe('Name of the load test (scenario) to retrieve results for'),
  testRunId: z
    .string()
    .optional()
    .describe('Optional specific test run ID to fetch. If omitted, returns recent runs.'),
  top: z
    .number()
    .optional()
    .default(10)
    .describe('Maximum number of recent test runs to return (default: 10)'),
});

/**
 * Type for the get scenario results tool parameters
 */
export type GetScenarioResultsToolParams = z.input<typeof GetScenarioResultsToolSchema>;

/**
 * Build a TestRunResult object from raw run data
 */
function buildRunResult(
  run: {
    id: number;
    test_id: number;
    status: string;
    result: string | null;
    created: string;
    ended: string | null;
    started_by: string | null;
  },
  loadTestId: string,
  loadTestName: string,
): TestRunResult {
  const durationMs =
    run.ended && run.created
      ? new Date(run.ended).getTime() - new Date(run.created).getTime()
      : null;
  return {
    testRunId: String(run.id),
    loadTestId,
    loadTestName,
    status: run.status,
    result: run.result,
    created: run.created,
    ended: run.ended,
    startedBy: run.started_by,
    durationSeconds: durationMs !== null ? Math.round(durationMs / 1000) : null,
  };
}

/**
 * Retrieve test run results for a scenario (load test) in a k6 Cloud project
 */
@Tool({
  id: 'k6-get-scenario-results',
  name: 'getK6ScenarioResults',
  description:
    'Retrieve test run results for a scenario (load test) in a k6 Cloud project. Finds the load test by name and returns recent or specific test run results with status, duration, and metadata.',
  category: 'k6',
  parameters: GetScenarioResultsToolSchema,
  version: '1.0.0',
  envVars: ['GRAFANA_K6_TOKEN'],
  annotations: {
    title: 'Get k6 Scenario Results',
    readOnlyHint: true,
    openWorldHint: true,
  },
})
export class GetScenarioResultsTool implements ToolHandler {
  /**
   * Execute the get scenario results tool
   */
  @CatchErrors()
  async execute(args: GetScenarioResultsToolParams): Promise<string> {
    const client = new K6Client();
    const top = Math.min(args.top ?? 10, 1000);

    // If a specific testRunId is given, fetch it directly
    if (args.testRunId) {
      const run = await client.getTestRun(args.testRunId);
      const result = buildRunResult(run, String(run.test_id), args.scenarioName);
      return JSON.stringify(
        {
          projectId: args.projectId,
          scenarioName: args.scenarioName,
          testRunId: args.testRunId,
          results: [result],
          summary: { totalRecords: 1, loadTestId: String(run.test_id) },
        },
        null,
        2,
      );
    }

    // Find the load test by exact name in the project
    const loadTests = await client.listProjectLoadTests(args.projectId, {
      name: args.scenarioName,
    });

    let loadTest: { id: number; name: string } | undefined;

    if (!loadTests.value || loadTests.value.length === 0) {
      // Try broader search – partial match across all project load tests
      const allInProject = await client.listProjectLoadTests(args.projectId, {
        top: 1000,
      });
      const partialMatches = (allInProject.value || []).filter((lt) =>
        lt.name.toLowerCase().includes(args.scenarioName.toLowerCase()),
      );

      if (partialMatches.length === 0) {
        return JSON.stringify(
          {
            projectId: args.projectId,
            scenarioName: args.scenarioName,
            results: [],
            summary: { totalRecords: 0 },
          },
          null,
          2,
        );
      }

      if (partialMatches.length > 1) {
        const matchList = partialMatches.map((lt) => `${lt.name} (id=${lt.id})`).join(', ');
        throw new K6ApiError(
          'INVALID_INPUT',
          `Multiple load tests match "${args.scenarioName}": ${matchList}. Please use a more specific name or the exact load test name.`,
        );
      }

      loadTest = partialMatches[0];
    } else {
      loadTest = loadTests.value[0];
    }

    // List recent test runs for that load test
    const runsData = await client.listLoadTestRuns(String(loadTest.id), {
      top,
      orderby: 'created desc',
    });

    const results: TestRunResult[] = (runsData.value || []).map((r) =>
      buildRunResult(r, String(loadTest.id), loadTest.name),
    );

    return JSON.stringify(
      {
        projectId: args.projectId,
        scenarioName: args.scenarioName,
        results,
        summary: {
          totalRecords: results.length,
          loadTestId: String(loadTest.id),
        },
      },
      null,
      2,
    );
  }
}
