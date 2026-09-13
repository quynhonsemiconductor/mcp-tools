/**
 * list-recent-files-tool.ts — what the signed-in user has been working on.
 *
 * Cheap and often the fastest route to a document: people remember editing something
 * yesterday more reliably than they remember what it was called.
 */

import { z } from 'zod';
import { Tool, ToolHandler } from '../registry';
import { CatchErrors } from '../../utils';
import { graphRequest } from './api';

export const ListRecentMicrosoftFilesSchema = z.object({
  limit: z
    .number()
    .int()
    .min(1)
    .max(50)
    .default(15)
    .describe('Maximum number of recent items to return'),
});

export type ListRecentMicrosoftFilesParams = z.input<typeof ListRecentMicrosoftFilesSchema>;

interface RecentItemsResponse {
  value?: {
    id?: string;
    name?: string;
    webUrl?: string;
    size?: number;
    lastModifiedDateTime?: string;
    file?: { mimeType?: string };
    folder?: unknown;
    remoteItem?: { parentReference?: { driveId?: string } };
    parentReference?: { driveId?: string; path?: string };
  }[];
}

@Tool({
  id: 'microsoft-list-recent-files',
  name: 'listRecentMicrosoftFiles',
  description:
    'List the files the signed-in user recently opened or edited across OneDrive and SharePoint. Useful when someone refers to a document by when they worked on it rather than by name.',
  category: 'Microsoft 365',
  parameters: ListRecentMicrosoftFilesSchema,
  version: '1.0.0',
  annotations: {
    title: 'List Recent Microsoft 365 Files',
    readOnlyHint: true,
    openWorldHint: true,
  },
})
export class ListRecentMicrosoftFilesTool implements ToolHandler {
  /**
   * List recent items, newest first as Graph returns them.
   *
   * @param args - Result limit
   * @returns JSON string of recent items, with the ids readMicrosoftFile takes
   */
  @CatchErrors()
  async execute(args: ListRecentMicrosoftFilesParams): Promise<string> {
    const { limit } = ListRecentMicrosoftFilesSchema.parse(args);

    const response = await graphRequest<RecentItemsResponse>(`/me/drive/recent?$top=${limit}`);
    const items = response.value ?? [];

    return JSON.stringify(
      {
        count: items.length,
        results: items.map((item) => ({
          // Same field name readMicrosoftFile expects, so the two compose.
          itemId: item.id,
          name: item.name,
          kind: item.folder ? 'folder' : (item.file?.mimeType ?? 'file'),
          url: item.webUrl,
          sizeBytes: item.size,
          lastModified: item.lastModifiedDateTime,
          // Recent items often live in another drive, and the read tool needs this
          // to find them.
          driveId: item.remoteItem?.parentReference?.driveId ?? item.parentReference?.driveId,
        })),
      },
      null,
      2,
    );
  }
}
