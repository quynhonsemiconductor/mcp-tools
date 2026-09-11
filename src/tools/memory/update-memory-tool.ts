import { z } from 'zod';
import vectorDBService from '../../services/vectordb/index.ts';
import { CatchErrors } from '../../utils/index.ts';
import { Tool, ToolHandler } from '../registry.ts';

export const UpdateMemorySchema = z.object({
  id: z.string().describe('The ID of the memory to be updated'),
  memory: z.string().describe('The new memory content to be updated'),
});

export type UpdateMemoryParams = z.infer<typeof UpdateMemorySchema>;

@Tool({
  id: 'update-memory',
  name: 'updateMemory',
  description: 'When the user wants to update an existing memory.',
  category: 'Memory',
  envVars: ['QNSC_MCP_API_KEY'],
  parameters: UpdateMemorySchema,
  version: '1.0.0',
  annotations: {
    title: 'Update Memory',
    readOnlyHint: false,
  },
})
export class UpdateMemoryTool implements ToolHandler {
  @CatchErrors()
  async execute(args: UpdateMemoryParams): Promise<string> {
    await vectorDBService.updateDocument(args.id, args.memory);

    return `Update memory ID ${args.id}`;
  }
}
