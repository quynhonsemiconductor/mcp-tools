import { CallToolResult, ContentBlock } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { CatchErrors, executeOSAScript } from '../../utils';
import { Tool, ToolHandler } from '../registry';

const osaCommand = `
if ((clipboard info) as string) contains "text" then
  return the clipboard as text
else if ((clipboard info) as string) contains "«class PNGf»" then
  return the clipboard as «class PNGf»
else if ((clipboard info) as string) contains "«class DATA»" then
  return the clipboard as «class DATA»
end if`;

/**
 * Schema definition for the Clipboard tool parameters
 */
export const ClipboardSchema = z.object({});

/**
 * Type for the Clipboard tool parameters
 */
export type ClipboardParams = z.infer<typeof ClipboardSchema>;

/**
 * Clipboard - Access clipboard content
 */
@Tool({
  id: 'clipboard',
  name: 'getClipboardContent',
  description:
    'Fetch the contents of the clipboard (text, images, or binary data). Used to see what is on the clipboard.',
  category: 'Utility',
  parameters: ClipboardSchema,
  version: '1.0.0',
  includeByDefault: true,
  annotations: {
    title: 'Clipboard Access',
    readOnlyHint: true,
  },
})
export class ClipboardTool implements ToolHandler {
  /**
   * Execute the clipboard access operation
   * @returns A ContentResult containing the clipboard content
   */
  @CatchErrors()
  // eslint-disable-next-line @typescript-eslint/require-await -- execute() must return a Promise to satisfy the ToolHandler interface; this implementation is fully synchronous
  async execute(): Promise<CallToolResult> {
    const text = executeOSAScript(osaCommand);
    let content: ContentBlock;

    if (text.startsWith('«data PNGf')) {
      const clean = text.replace('«data PNGf', '').replace('»', '');
      // content = await imageContent({
      //   buffer: Buffer.from(clean, 'hex')
      // });
      content = {
        type: 'image',
        mimeType: 'image/png',
        data: Buffer.from(clean, 'hex').toString('base64'),
      };
    } else if (text.startsWith('«data DATA')) {
      const clean = text.replace('«data DATA', '').replace('»', '');

      content = {
        type: 'image',
        mimeType: 'application/octet-stream',
        data: Buffer.from(clean, 'hex').toString('base64'),
      };
    } else {
      content = {
        type: 'text',
        text,
      };
    }

    return {
      content: [content],
    };
  }
}
