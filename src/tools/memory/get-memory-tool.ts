import { z } from 'zod';
import vectorDBService from '../../services/vectordb';
import { CatchErrors } from '../../utils';
import { Tool, ToolHandler } from '../registry';

export const GetMemorySchema = z.object({
  text: z.string().describe('The text to search for in the memories'),
});

export type GetMemoryParams = z.infer<typeof GetMemorySchema>;

@Tool({
  id: 'get-memory',
  name: 'getMemory',
  description:
    'When the user wants to remember something important, they can use this tool to retrieve a memory.',
  category: 'Memory',
  parameters: GetMemorySchema,
  version: '1.0.0',
  annotations: {
    title: 'Get A Memory',
    readOnlyHint: true,
  },
})
export class GetMemoryTool implements ToolHandler {
  @CatchErrors()
  async execute(args: GetMemoryParams): Promise<string> {
    return JSON.stringify(await vectorDBService.search(args.text));
  }
}
