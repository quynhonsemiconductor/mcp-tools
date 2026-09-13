/**
 * read-file-tool.ts — read the text contents of a file the signed-in user can see.
 *
 * Pairs with the search tool: search finds the item, this reads it. Restricted to
 * text-like formats on purpose — returning a binary Office document to a model is
 * not useful, and Graph can convert the common ones to PDF but not to plain text.
 */

import { z } from 'zod';
import { Tool, ToolHandler } from '../registry';
import { CatchErrors, UserError } from '../../utils';
import { graphRequest, graphRequestText } from './api';

/** Largest file returned, to avoid flooding the context with one document. */
const MAX_BYTES = 512 * 1024;

/**
 * Formats worth returning as text. Anything else is refused with its type named,
 * which is more useful than returning bytes the model cannot read.
 */
const TEXT_LIKE = [
  'text/',
  'application/json',
  'application/xml',
  'application/javascript',
  'application/x-yaml',
];

export const ReadMicrosoftFileSchema = z.object({
  itemId: z
    .string()
    .min(1)
    .describe('Graph driveItem id, as returned by searchMicrosoftFiles'),
  driveId: z
    .string()
    .optional()
    .describe('Drive id when the item is not in the signed-in user own drive'),
});

export type ReadMicrosoftFileParams = z.input<typeof ReadMicrosoftFileSchema>;

interface DriveItemMetadata {
  name?: string;
  size?: number;
  webUrl?: string;
  file?: { mimeType?: string };
  folder?: unknown;
}

@Tool({
  id: 'microsoft-read-file',
  name: 'readMicrosoftFile',
  description:
    'Read the text contents of a file in OneDrive or SharePoint that the signed-in user can access. Takes an item id from searchMicrosoftFiles. Text, JSON, XML, YAML and similar formats only.',
  category: 'Microsoft 365',
  parameters: ReadMicrosoftFileSchema,
  version: '1.0.0',
  annotations: {
    title: 'Read Microsoft 365 File',
    readOnlyHint: true,
    openWorldHint: true,
  },
})
export class ReadMicrosoftFileTool implements ToolHandler {
  /**
   * Read a file, refusing folders, oversized items and binary formats with a
   * reason rather than returning something unusable.
   *
   * @param args - Item id, and drive id when the item is not in the user own drive
   * @returns JSON string with the file metadata and its contents
   */
  @CatchErrors()
  async execute(args: ReadMicrosoftFileParams): Promise<string> {
    const { itemId, driveId } = ReadMicrosoftFileSchema.parse(args);
    const base = driveId ? `/drives/${driveId}/items/${itemId}` : `/me/drive/items/${itemId}`;

    const meta = await graphRequest<DriveItemMetadata>(
      `${base}?$select=name,size,webUrl,file,folder`,
    );

    if (meta.folder) {
      throw new UserError(`"${meta.name}" is a folder, not a file.`);
    }

    const mimeType = meta.file?.mimeType ?? 'unknown';
    if (!TEXT_LIKE.some((prefix) => mimeType.startsWith(prefix))) {
      throw new UserError(
        `"${meta.name}" is ${mimeType}, which cannot be returned as text. ` +
          `Open it at ${meta.webUrl ?? 'its web URL'} instead.`,
      );
    }

    if ((meta.size ?? 0) > MAX_BYTES) {
      throw new UserError(
        `"${meta.name}" is ${Math.round((meta.size ?? 0) / 1024)} KB, above the ` +
          `${MAX_BYTES / 1024} KB limit for reading into a conversation.`,
      );
    }

    // /content returns the file itself, not JSON.
    const content = await graphRequestText(`${base}/content`);

    return JSON.stringify(
      {
        name: meta.name,
        mimeType,
        sizeBytes: meta.size,
        url: meta.webUrl,
        content,
      },
      null,
      2,
    );
  }
}
