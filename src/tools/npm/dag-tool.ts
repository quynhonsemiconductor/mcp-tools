import { z } from 'zod';
import { Tool, type ToolHandler } from '../../registry';
import { CatchErrors } from '../../utils';
import { resolveAndScan } from './resolve-workspace';
import { getDag } from './workspace-graph';

export const DagSchema = z.object({
  package: z.string().describe('Package name, folder name, or filesystem path to resolve'),
  workspace: z
    .string()
    .optional()
    .describe('Workspace root directory. Defaults to autodetect from cwd.'),
  includeDev: z
    .boolean()
    .optional()
    .default(false)
    .describe('Include devDependencies when traversing'),
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

export type DagParams = z.input<typeof DagSchema>;

@Tool({
  id: 'npm-dag',
  name: 'npmDag',
  description:
    'Show the flattened directed acyclic graph of owned (intra-workspace) packages reachable from a package. ' +
    'Each node lists its direct workspace dependencies. No repeats — each package appears once. ' +
    'Useful for understanding the dependency relationships between workspace packages.',
  category: 'NPM',
  parameters: DagSchema,
  annotations: {
    title: 'NPM Dependency DAG',
    readOnlyHint: true,
    idempotentHint: true,
    openWorldHint: false,
  },
})
export class DagTool implements ToolHandler {
  @CatchErrors()
  // eslint-disable-next-line @typescript-eslint/require-await -- execute() must return a Promise to satisfy the ToolHandler interface; this implementation is fully synchronous
  async execute(args: DagParams): Promise<string> {
    const { package: pkg, workspace: workspaceDir, includeDev, depth } = DagSchema.parse(args);
    const workspace = resolveAndScan(workspaceDir, depth);
    const dag = getDag(pkg, workspace, { includeDev });
    return JSON.stringify(dag, null, 2);
  }
}
