import { z } from 'zod';
import vectorDBService from '../../services/vectordb';
import { CatchErrors } from '../../utils';
import { Tool, ToolHandler } from '../registry';

export const ClearMemorySchema = z.object({});

export type ClearMemoryParams = z.infer<typeof ClearMemorySchema>;

@Tool({
  id: 'clear-memory',
  name: 'clearMemory',
  description: 'When the user wants to remove all previously stored memories.',
  category: 'Memory',
  parameters: ClearMemorySchema,
  version: '1.0.0',
  annotations: {
    title: 'Clear Memory',
    readOnlyHint: false,
  },
})
export class ClearMemoryTool implements ToolHandler {
  @CatchErrors()
  async execute(_args: ClearMemoryParams): Promise<string> {
    await vectorDBService.reset();

    return 'Memory cleared';
  }
}
