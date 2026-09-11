import { z } from 'zod';
import { Tool, type ToolHandler } from '../../registry';
import { CatchErrors } from '../../utils';
import { resolveAndScan } from './resolve-workspace';
import { runDoctor } from './workspace-graph';

export const DoctorSchema = z.object({
  workspace: z
    .string()
    .optional()
    .describe('Workspace root directory. Defaults to autodetect from cwd.'),
  depth: z
    .number()
    .int()
    .min(1)
    .max(5)
    .optional()
    .default(1)
    .describe(
      'How many directory levels deep to scan for packages. Default 1 (flat siblings only).',
    ),
});

export type DoctorParams = z.input<typeof DoctorSchema>;

@Tool({
  id: 'npm-doctor',
  name: 'npmDoctor',
  description:
    'Report issues in the workspace: version drift between declared and on-disk versions, ' +
    'and dependency cycles. Returns an empty array if no issues are found. ' +
    'Useful for catching problems before they surface during builds.',
  category: 'NPM',
  parameters: DoctorSchema,
  annotations: {
    title: 'NPM Doctor',
    readOnlyHint: true,
    idempotentHint: true,
    openWorldHint: false,
  },
})
export class DoctorTool implements ToolHandler {
  @CatchErrors()
  // eslint-disable-next-line @typescript-eslint/require-await -- execute() must return a Promise to satisfy the ToolHandler interface; this implementation is fully synchronous
  async execute(args: DoctorParams): Promise<string> {
    const { workspace: workspaceDir, depth } = DoctorSchema.parse(args);
    const workspace = resolveAndScan(workspaceDir, depth);
    const issues = runDoctor(workspace);
    return JSON.stringify(issues, null, 2);
  }
}
