import { z } from 'zod';
import { Tool, type ToolHandler } from '../../registry';
import { CatchErrors } from '../../utils';
import { resolveAndScan } from './resolve-workspace';
import { getTree } from './workspace-graph';

export const TreeSchema = z
  .object({
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
    owned: z
      .boolean()
      .optional()
      .default(false)
      .describe('Only show intra-workspace (owned) dependencies'),
    external: z
      .boolean()
      .optional()
      .default(false)
      .describe('Only show external (non-workspace) dependencies'),
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
  })
  .refine((v) => !(v.owned && v.external), {
    message: 'owned and external are mutually exclusive; use one or neither',
    path: ['owned'],
  });

export type TreeParams = z.input<typeof TreeSchema>;

@Tool({
  id: 'npm-tree',
  name: 'npmTree',
  description:
    'Print the full recursive dependency tree of a package showing the path through dependencies. ' +
    'Includes cycle detection. ' +
    'Use --owned to show only workspace packages or --external for only third-party deps. ' +
    'Useful for understanding why a dependency is pulled in.',
  category: 'NPM',
  parameters: TreeSchema,
  annotations: {
    title: 'NPM Dependency Tree',
    readOnlyHint: true,
    idempotentHint: true,
    openWorldHint: false,
  },
})
export class TreeTool implements ToolHandler {
  @CatchErrors()
  // eslint-disable-next-line @typescript-eslint/require-await -- execute() must return a Promise to satisfy the ToolHandler interface; this implementation is fully synchronous
  async execute(args: TreeParams): Promise<string> {
    const {
      package: pkg,
      workspace: workspaceDir,
      includeDev,
      owned,
      external,
      depth,
    } = TreeSchema.parse(args);
    const workspace = resolveAndScan(workspaceDir, depth);
    const tree = getTree(pkg, workspace, { includeDev, owned, external });
    return JSON.stringify(tree, null, 2);
  }
}
