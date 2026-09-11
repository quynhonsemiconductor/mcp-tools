import { z } from 'zod';
import { Tool, type ToolHandler } from '../../registry';
import { CatchErrors } from '../../utils';
import { resolveAndScan } from './resolve-workspace';
import { listPackages } from './workspace-graph';

export const ListSchema = z.object({
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

export type ListParams = z.input<typeof ListSchema>;

@Tool({
  id: 'npm-list',
  name: 'npmList',
  description:
    'List every package in the workspace with its name, folder, version, and projen status. ' +
    'Useful for discovering what packages exist before running other npm tools.',
  category: 'NPM',
  parameters: ListSchema,
  annotations: {
    title: 'NPM List Packages',
    readOnlyHint: true,
    idempotentHint: true,
    openWorldHint: false,
  },
})
export class ListTool implements ToolHandler {
  @CatchErrors()
  // eslint-disable-next-line @typescript-eslint/require-await -- execute() must return a Promise to satisfy the ToolHandler interface; this implementation is fully synchronous
  async execute(args: ListParams): Promise<string> {
    const { workspace: workspaceDir, depth } = ListSchema.parse(args);
    const workspace = resolveAndScan(workspaceDir, depth);
    const packages = listPackages(workspace);
    return JSON.stringify(
      packages.map((p) => ({
        name: p.name,
        folder: p.folder,
        version: p.version,
        projen: p.projen,
      })),
      null,
      2,
    );
  }
}
