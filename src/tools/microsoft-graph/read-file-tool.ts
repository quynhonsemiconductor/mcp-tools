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
import { graphRequest, graphRequestBytes, graphRequestText } from './api';
import { pdfToText, readStrategyFor } from './document-text';

/**
 * Largest text returned, to avoid flooding the context with one document.
 *
 * Applied to the extracted text, not the source file. A 5 MB slide deck can hold a
 * couple of pages of words, and rejecting it on its file size refused documents that
 * were perfectly readable — which is what happened to the first real PowerPoint
 * tried against this tool.
 */
const MAX_TEXT_CHARS = 400_000;

/**
 * Largest source file downloaded, so a huge binary is not fetched only to be
 * discarded. Generous, because a slide deck is mostly images.
 */
const MAX_SOURCE_BYTES = 64 * 1024 * 1024;

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
    'Read the text of a file in OneDrive or SharePoint that the signed-in user can access. Takes an item id from searchMicrosoftFiles. Handles plain text, JSON, XML and YAML directly, PDFs by extraction, and Word, PowerPoint and Excel documents by converting them first.',
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
    const strategy = readStrategyFor(mimeType);
    if (!strategy) {
      throw new UserError(
        `"${meta.name}" is ${mimeType}, which has no text to extract. ` +
          `Open it at ${meta.webUrl ?? 'its web URL'} instead.`,
      );
    }

    if ((meta.size ?? 0) > MAX_SOURCE_BYTES) {
      throw new UserError(
        `"${meta.name}" is ${Math.round((meta.size ?? 0) / 1024 / 1024)} MB, above the ` +
          `${MAX_SOURCE_BYTES / 1024 / 1024} MB limit for downloading.`,
      );
    }

    // /content returns the file itself, not JSON. PDFs and Office documents come
    // back as bytes; Graph converts the latter to PDF because it has no text
    // conversion of its own.
    let content: string;
    let pages: number | undefined;
    if (strategy === 'text') {
      content = await graphRequestText(`${base}/content`);
    } else {
      const path = strategy === 'pdf' ? `${base}/content` : `${base}/content?format=pdf`;
      const extracted = await pdfToText(await graphRequestBytes(path));
      content = extracted.text;
      pages = extracted.pages;
    }

    const truncated = content.length > MAX_TEXT_CHARS;
    if (truncated) {
      content = `${content.slice(0, MAX_TEXT_CHARS)}\n\n[truncated: the document holds more text than fits in one response]`;
    }

    return JSON.stringify(
      {
        name: meta.name,
        mimeType,
        sizeBytes: meta.size,
        url: meta.webUrl,
        pages,
        extractedVia: strategy,
        truncated,
        content,
      },
      null,
      2,
    );
  }
}
