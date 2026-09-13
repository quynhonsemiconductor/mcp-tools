/**
 * search-files-tool.ts — find files across the signed-in user's OneDrive and the
 * SharePoint sites they can reach.
 *
 * This is the one people ask for most: "where is that document". Graph's search
 * spans OneDrive and SharePoint together, scoped to what the person already has
 * access to, so no site has to be named up front.
 */

import { z } from 'zod';
import { Tool, ToolHandler } from '../registry';
import { CatchErrors } from '../../utils';
import { graphRequest } from './api';

export const SearchMicrosoftFilesSchema = z.object({
  query: z
    .string()
    .min(1)
    .describe('Text to search for in file names and contents, e.g. "Q3 roadmap"'),
  limit: z
    .number()
    .int()
    .min(1)
    .max(50)
    .default(10)
    .describe('Maximum number of results to return'),
});

export type SearchMicrosoftFilesParams = z.input<typeof SearchMicrosoftFilesSchema>;

/** The subset of Graph's driveItem we return; Graph sends a great deal more. */
interface DriveItemSearchResponse {
  value?: {
    name?: string;
    webUrl?: string;
    size?: number;
    lastModifiedDateTime?: string;
    lastModifiedBy?: { user?: { displayName?: string } };
    parentReference?: { driveId?: string; path?: string };
    file?: { mimeType?: string };
    folder?: unknown;
  }[];
}

@Tool({
  id: 'microsoft-search-files',
  name: 'searchMicrosoftFiles',
  description:
    'Search for files and documents across the signed-in user OneDrive and the SharePoint sites they can access. Returns names, links, sizes and who last changed each item. Use when asked to find a document without being told where it lives.',
  category: 'Microsoft 365',
  parameters: SearchMicrosoftFilesSchema,
  version: '1.0.0',
  annotations: {
    title: 'Search Microsoft 365 Files',
    readOnlyHint: true,
    openWorldHint: true,
  },
})
export class SearchMicrosoftFilesTool implements ToolHandler {
  /**
   * Execute the search.
   *
   * @param args - Query text and result limit
   * @returns JSON string of matching items
   */
  @CatchErrors()
  async execute(args: SearchMicrosoftFilesParams): Promise<string> {
    const { query, limit } = SearchMicrosoftFilesSchema.parse(args);

    // Graph wants the search term single-quoted inside the function call, and a
    // literal quote in the term would otherwise break the URL.
    const escaped = query.replace(/'/g, "''");
    const path =
      `/me/drive/root/search(q='${encodeURIComponent(escaped)}')` +
      `?$top=${limit}&$select=name,webUrl,size,lastModifiedDateTime,lastModifiedBy,parentReference,file,folder`;

    const response = await graphRequest<DriveItemSearchResponse>(path);
    const items = response.value ?? [];

    return JSON.stringify(
      {
        query,
        count: items.length,
        results: items.map((item) => ({
          name: item.name,
          kind: item.folder ? 'folder' : (item.file?.mimeType ?? 'file'),
          url: item.webUrl,
          sizeBytes: item.size,
          lastModified: item.lastModifiedDateTime,
          lastModifiedBy: item.lastModifiedBy?.user?.displayName,
          location: item.parentReference?.path,
        })),
      },
      null,
      2,
    );
  }
}
