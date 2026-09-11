import { z } from 'zod';
import { Tool, type ToolHandler } from '../../registry';
import { CatchErrors } from '../../utils';
import { resolveAndScan } from './resolve-workspace';
import { getBuildOrder } from './workspace-graph';

// ---------- schemas ----------

export const BuildOrderSchema = z.object({
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

export type BuildOrderParams = z.input<typeof BuildOrderSchema>;

// ---------- tool ----------

@Tool({
  id: 'npm-build-order',
  name: 'npmBuildOrder',
  description:
    'Compute the layered build order for an npm package in a flat sibling-folders workspace. ' +
    'Returns layers of packages that can be built in parallel, ordered so that dependencies come before dependents. ' +
    'Each package includes projen detection. ' +
    'Useful for cascading version updates through large package chains and for fixing dependabot alerts in the correct bottom-up order.',
  category: 'NPM',
  parameters: BuildOrderSchema,
  annotations: {
    title: 'NPM Build Order',
    readOnlyHint: true,
    idempotentHint: true,
    openWorldHint: false,
  },
})
export class BuildOrderTool implements ToolHandler {
  @CatchErrors()
  // eslint-disable-next-line @typescript-eslint/require-await -- execute() must return a Promise to satisfy the ToolHandler interface; this implementation is fully synchronous
  async execute(args: BuildOrderParams): Promise<string> {
    const {
      package: pkg,
      workspace: workspaceDir,
      includeDev,
      depth,
    } = BuildOrderSchema.parse(args);

    const workspace = resolveAndScan(workspaceDir, depth);
    const layers = getBuildOrder(pkg, workspace, { includeDev });
    return JSON.stringify(layers, null, 2);
  }
}
