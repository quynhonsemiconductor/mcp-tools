import { z } from 'zod';
import vectorDBService from '../../services/vectordb';
import { CatchErrors } from '../../utils';
import { Tool, ToolHandler } from '../registry';

export const RemoveMemorySchema = z.object({
  id: z.string().describe('The memory ID to be removed'),
});

export type RemoveMemoryParams = z.infer<typeof RemoveMemorySchema>;

@Tool({
  id: 'remove-memory',
  name: 'removeMemory',
  description: 'When the user wants to remove a specific memory.',
  category: 'Memory',
  parameters: RemoveMemorySchema,
  version: '1.0.0',
  annotations: {
    title: 'Remove Memory',
    readOnlyHint: false,
  },
})
export class RemoveMemoryTool implements ToolHandler {
  @CatchErrors()
  async execute(args: RemoveMemoryParams): Promise<string> {
    await vectorDBService.removeDocument(args.id);

    return 'Removed memory';
  }
}
