import { z } from 'zod';
import vectorDBService from '../../services/vectordb/index.ts';
import { CatchErrors } from '../../utils/index.ts';
import { Tool, ToolHandler } from '../registry.ts';

export const AddMemorySchema = z.object({
  memory: z.string().describe('The memory content to be added'),
});

export type AddMemoryParams = z.infer<typeof AddMemorySchema>;

@Tool({
  id: 'add-memory',
  name: 'addMemory',
  description:
    'When the user wants to remember something important, they can use this tool to add a memory for future retrieval.',
  category: 'Memory',
  parameters: AddMemorySchema,
  envVars: ['QNSC_MCP_API_KEY'],
  version: '1.0.0',
  annotations: {
    title: 'Add Memory',
    readOnlyHint: false,
  },
})
export class AddMemoryTool implements ToolHandler {
  @CatchErrors()
  async execute(args: AddMemoryParams): Promise<string> {
    const memoryId = await vectorDBService.addDocument(args.memory);

    return `Add memory ID ${memoryId}`;
  }
}
