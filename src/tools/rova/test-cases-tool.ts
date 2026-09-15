/**
 * test-cases-tool.ts — test cases on a work item, and the results of running them.
 *
 * Test cases hang off a work item rather than a project: there is no project-wide list, so
 * the question is always "what tests cover this story". A story and its tests are read
 * together in practice, which is why listing them takes the work item's id.
 *
 * Four tools cover the loop: see the tests for a piece of work, read one with its history,
 * add a test, record a run.
 */

import { z } from 'zod';
import { Tool, ToolHandler } from '../registry';
import { CatchErrors, UserError } from '../../utils';
import { rovaCurrentUserId, rovaItems, rovaRequest, type RovaPage } from './api';

/** From `test_case_method`. The schema defaults to manual. */
export const ROVA_TEST_METHODS = ['manual', 'automated'] as const;

/** From `test_case_priority`. The schema defaults to normal. */
export const ROVA_TEST_PRIORITIES = ['low', 'normal', 'high', 'urgent'] as const;

/**
 * Verdicts a result may record, from `test_verdict` with `not_run` removed.
 *
 * Rova filters it out deliberately: a result records an outcome, never its absence. A test
 * that has not run has no result, rather than a result saying so.
 */
export const ROVA_TEST_VERDICTS = ['pass', 'fail', 'blocked', 'error', 'inconclusive'] as const;

interface RovaTestCase {
  id?: string;
  testCaseKey?: string;
  name?: string;
  type?: string | null;
  method?: string;
  priority?: string;
  ownerName?: string | null;
  assigneeName?: string | null;
  lastVerdict?: string | null;
  lastRunDate?: string | null;
  workItemId?: string;
  createdAt?: string;
}

interface RovaTestResult {
  id?: string;
  build?: string;
  runDate?: string;
  verdict?: string;
  durationMinutes?: number | null;
  testerName?: string | null;
  notes?: string | null;
  createdAt?: string;
}

/**
 * Reduce a test case for a list.
 *
 * @param testCase - Test case from the API
 * @returns The fields worth listing
 */
function summarise(testCase: RovaTestCase) {
  return {
    testCaseKey: testCase.testCaseKey,
    id: testCase.id,
    name: testCase.name,
    type: testCase.type || undefined,
    method: testCase.method,
    priority: testCase.priority,
    assignee: testCase.assigneeName || undefined,
    // Maintained by a trigger on the test case, so it is the latest outcome without
    // reading the results. Absent means the test has never been run.
    lastVerdict: testCase.lastVerdict || undefined,
    lastRun: testCase.lastRunDate || undefined,
  };
}

export const ListRovaTestCasesSchema = z.object({
  workItemId: z
    .string()
    .min(1)
    .describe('Work item whose test cases to list. Test cases belong to a work item, not a project.'),
  limit: z.number().int().min(1).max(100).default(50).describe('Maximum test cases to return'),
});

export type ListRovaTestCasesParams = z.input<typeof ListRovaTestCasesSchema>;

@Tool({
  id: 'rova-list-test-cases',
  name: 'listRovaTestCases',
  description:
    'List the test cases covering a Rova work item, with each one latest verdict. Use to see what tests exist for a story, or which are failing. Test cases belong to a work item, so use getRovaWorkItem first to get its id.',
  category: 'Rova',
  parameters: ListRovaTestCasesSchema,
  version: '1.0.0',
  annotations: { title: 'List Rova Test Cases', readOnlyHint: true, openWorldHint: true },
})
export class ListRovaTestCasesTool implements ToolHandler {
  /**
   * List the tests covering a work item.
   *
   * @param args - Work item id and a limit
   * @returns JSON string of test case summaries, with a verdict tally
   */
  @CatchErrors()
  async execute(args: ListRovaTestCasesParams): Promise<string> {
    const { workItemId, limit } = ListRovaTestCasesSchema.parse(args);
    const body = await rovaRequest<RovaPage<RovaTestCase>>(
      `/work-items/${encodeURIComponent(workItemId)}/test-cases?limit=${limit}`,
    );
    const cases = rovaItems<RovaTestCase>(body);

    // Tallied here because "are the tests passing" is the question behind the list, and
    // counting rows by verdict is work the caller should not have to repeat.
    const tally: Record<string, number> = {};
    for (const testCase of cases) {
      const verdict = testCase.lastVerdict || 'not_run';
      tally[verdict] = (tally[verdict] ?? 0) + 1;
    }

    return JSON.stringify(
      {
        workItemId,
        count: cases.length,
        ...(cases.length > 0 ? { byLastVerdict: tally } : {}),
        testCases: cases.map(summarise),
      },
      null,
      2,
    );
  }
}

export const GetRovaTestCaseSchema = z
  .object({
    testCaseKey: z.string().optional().describe('Test case key, as people refer to it'),
    id: z.string().optional().describe('Test case id, if the key is not to hand'),
    includeResults: z.boolean().default(true).describe('Include the run history'),
  })
  .describe('Read one Rova test case');

export type GetRovaTestCaseParams = z.input<typeof GetRovaTestCaseSchema>;

@Tool({
  id: 'rova-get-test-case',
  name: 'getRovaTestCase',
  description:
    'Read one Rova test case with its run history: what was tested, on which build, and how it went.',
  category: 'Rova',
  parameters: GetRovaTestCaseSchema,
  version: '1.0.0',
  annotations: { title: 'Get Rova Test Case', readOnlyHint: true, openWorldHint: true },
})
export class GetRovaTestCaseTool implements ToolHandler {
  /**
   * Read a test case by key or id.
   *
   * @param args - Key or id, and whether to include results
   * @returns JSON string of the test case and its run history
   */
  @CatchErrors()
  async execute(args: GetRovaTestCaseParams): Promise<string> {
    const { testCaseKey, id, includeResults } = GetRovaTestCaseSchema.parse(args);
    if (!testCaseKey && !id) {
      throw new UserError('Give either testCaseKey or id.');
    }

    const testCase = testCaseKey
      ? await rovaRequest<RovaTestCase>(`/test-cases/by-key/${encodeURIComponent(testCaseKey)}`)
      : await rovaRequest<RovaTestCase>(`/test-cases/${encodeURIComponent(String(id))}`);

    let results: RovaTestResult[] = [];
    const resolvedId = testCase.id ?? id;
    if (includeResults && resolvedId) {
      // Losing the history should not lose the test case itself.
      try {
        results = rovaItems<RovaTestResult>(
          await rovaRequest<RovaPage<RovaTestResult>>(
            `/test-cases/${encodeURIComponent(resolvedId)}/test-results?limit=50`,
          ),
        );
      } catch {
        results = [];
      }
    }

    return JSON.stringify(
      {
        ...summarise(testCase),
        owner: testCase.ownerName || undefined,
        workItemId: testCase.workItemId,
        createdAt: testCase.createdAt,
        ...(includeResults
          ? {
              runCount: results.length,
              results: results.map((result) => ({
                verdict: result.verdict,
                build: result.build,
                runDate: result.runDate,
                tester: result.testerName || undefined,
                durationMinutes: result.durationMinutes ?? undefined,
                notes: result.notes || undefined,
              })),
            }
          : {}),
      },
      null,
      2,
    );
  }
}

export const CreateRovaTestCaseSchema = z.object({
  workItemId: z.string().min(1).describe('Work item this test covers'),
  name: z.string().min(1).max(500).describe('What the test checks'),
  type: z
    .string()
    .max(60)
    .optional()
    .describe('Test case type, as configured for the project, e.g. "Functional"'),
  method: z.enum(ROVA_TEST_METHODS).optional().describe('Manual or automated. Defaults to manual.'),
  priority: z.enum(ROVA_TEST_PRIORITIES).optional().describe('Priority. Defaults to normal.'),
  assigneeId: z.string().optional().describe('Who should run it. Omit to leave unassigned.'),
});

export type CreateRovaTestCaseParams = z.input<typeof CreateRovaTestCaseSchema>;

@Tool({
  id: 'rova-create-test-case',
  name: 'createRovaTestCase',
  description:
    'Create a Rova test case under a work item. Use when a story needs a test written against it.',
  category: 'Rova',
  parameters: CreateRovaTestCaseSchema,
  version: '1.0.0',
  annotations: {
    title: 'Create Rova Test Case',
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: true,
  },
})
export class CreateRovaTestCaseTool implements ToolHandler {
  /**
   * Create a test case under a work item.
   *
   * @param args - Work item, name and optional detail
   * @returns JSON string with the new test case's key and id
   */
  @CatchErrors()
  async execute(args: CreateRovaTestCaseParams): Promise<string> {
    const { workItemId, ...rest } = CreateRovaTestCaseSchema.parse(args);
    const payload: Record<string, unknown> = { name: rest.name };
    for (const key of ['type', 'method', 'priority', 'assigneeId'] as const) {
      if (rest[key] !== undefined) payload[key] = rest[key];
    }

    const created = await rovaRequest<RovaTestCase>(
      `/work-items/${encodeURIComponent(workItemId)}/test-cases`,
      { method: 'POST', body: JSON.stringify(payload) },
    );

    return JSON.stringify({ created: true, workItemId, ...summarise(created) }, null, 2);
  }
}

export const RecordRovaTestResultSchema = z.object({
  testCaseId: z.string().min(1).describe('Test case that was run, from listRovaTestCases'),
  verdict: z
    .enum(ROVA_TEST_VERDICTS)
    .describe(
      'How it went. There is no "not run": a result records an outcome, and a test that has not run simply has no result.',
    ),
  build: z.string().min(1).max(255).describe('Build or version it was run against'),
  runDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'runDate must be a date only, as YYYY-MM-DD')
    .optional()
    .describe('Date of the run, YYYY-MM-DD. Defaults to today.'),
  durationMinutes: z.number().int().min(0).optional().describe('How long the run took'),
  testerId: z
    .string()
    .optional()
    .describe('Who ran it. Defaults to the signed-in user, which is the usual case.'),
  notes: z.string().max(4000).optional().describe('What happened, especially for a failure'),
});

export type RecordRovaTestResultParams = z.input<typeof RecordRovaTestResultSchema>;

@Tool({
  id: 'rova-record-test-result',
  name: 'recordRovaTestResult',
  description:
    'Record the result of running a Rova test case: the verdict, the build and when. The tester defaults to the signed-in user and the date to today.',
  category: 'Rova',
  parameters: RecordRovaTestResultSchema,
  version: '1.0.0',
  annotations: {
    title: 'Record Rova Test Result',
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: true,
  },
})
export class RecordRovaTestResultTool implements ToolHandler {
  /**
   * Record a run against a test case.
   *
   * @param args - Test case, verdict, build and optional detail
   * @returns JSON string confirming the recorded result
   */
  @CatchErrors()
  async execute(args: RecordRovaTestResultParams): Promise<string> {
    const parsed = RecordRovaTestResultSchema.parse(args);

    // Both are required by Rova and both have an obvious intent: the person recording a
    // run is normally the person who ran it, today. Requiring a uuid and a date for that
    // would make the tool unusable in conversation.
    const testerId = parsed.testerId ?? (await rovaCurrentUserId());
    const runDate = parsed.runDate ?? new Date().toISOString().slice(0, 10);

    const payload: Record<string, unknown> = {
      verdict: parsed.verdict,
      build: parsed.build,
      runDate,
      testerId,
    };
    if (parsed.durationMinutes !== undefined) payload.durationMinutes = parsed.durationMinutes;
    if (parsed.notes !== undefined) payload.notes = parsed.notes;

    const created = await rovaRequest<RovaTestResult>(
      `/test-cases/${encodeURIComponent(parsed.testCaseId)}/test-results`,
      { method: 'POST', body: JSON.stringify(payload) },
    );

    return JSON.stringify(
      {
        recorded: true,
        resultId: created.id,
        testCaseId: parsed.testCaseId,
        verdict: created.verdict ?? parsed.verdict,
        build: created.build ?? parsed.build,
        runDate: created.runDate ?? runDate,
        tester: created.testerName || undefined,
      },
      null,
      2,
    );
  }
}
