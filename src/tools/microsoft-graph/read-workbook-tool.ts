/**
 * read-workbook-tool.ts — read spreadsheet cells as rows and columns.
 *
 * readMicrosoftFile can already open an .xlsx, but only by converting it to PDF, which
 * flattens the grid: a row arrives as a run of space-separated words with no column
 * boundaries. That is fine for a spreadsheet written like a document and useless for
 * one holding data, which is what most spreadsheets outside engineering are.
 *
 * Graph's workbook API returns the grid itself, so a question like "what is the total
 * in column D" becomes answerable rather than guesswork.
 *
 * Cell text is used rather than raw values, because values return dates as Excel serial
 * numbers — the date 3 Aug 2026 arrives as 46237, which reads as an ordinary number and
 * would be reported as one. The formatted text is what a person sees in the cell.
 */

import { z } from 'zod';
import { Tool, ToolHandler } from '../registry';
import { CatchErrors, UserError } from '../../utils';
import { graphRequest } from './api';

/** Cells returned in one call, to keep a large sheet from swamping the reply. */
const MAX_CELLS = 4000;

export const ReadMicrosoftWorkbookSchema = z.object({
  itemId: z
    .string()
    .min(1)
    .describe('Workbook id, as returned by searchMicrosoftFiles or listRecentMicrosoftFiles'),
  driveId: z
    .string()
    .optional()
    .describe(
      'Drive holding the workbook. Required for anything outside the user own OneDrive, such as a SharePoint site — pass the driveId from the search or recent result.',
    ),
  worksheet: z
    .string()
    .optional()
    .describe('Worksheet name. Omit to list the worksheets in the workbook.'),
  maxRows: z
    .number()
    .int()
    .min(1)
    .max(500)
    .default(100)
    .describe('Maximum rows to return from the used range'),
});

export type ReadMicrosoftWorkbookParams = z.input<typeof ReadMicrosoftWorkbookSchema>;

interface WorksheetList {
  value?: { id?: string; name?: string; position?: number; visibility?: string }[];
}

interface UsedRange {
  address?: string;
  rowCount?: number;
  columnCount?: number;
  text?: string[][];
}

@Tool({
  id: 'microsoft-read-workbook',
  name: 'readMicrosoftWorkbook',
  description:
    'Read an Excel workbook as rows and columns. Call without a worksheet to list the sheets, then again with one to read its cells. Prefer this over readMicrosoftFile for spreadsheets holding data, because that route converts to PDF and loses the columns.',
  category: 'Microsoft 365',
  parameters: ReadMicrosoftWorkbookSchema,
  version: '1.0.0',
  annotations: {
    title: 'Read Microsoft Workbook',
    readOnlyHint: true,
    openWorldHint: true,
  },
})
export class ReadMicrosoftWorkbookTool implements ToolHandler {
  /**
   * List worksheets, or read one of them.
   *
   * @param args - Workbook id, optional drive, optional worksheet, row cap
   * @returns JSON string of worksheet names, or the used range as rows
   */
  @CatchErrors()
  async execute(args: ReadMicrosoftWorkbookParams): Promise<string> {
    const { itemId, driveId, worksheet, maxRows } = ReadMicrosoftWorkbookSchema.parse(args);
    const base = driveId
      ? `/drives/${encodeURIComponent(driveId)}/items/${encodeURIComponent(itemId)}`
      : `/me/drive/items/${encodeURIComponent(itemId)}`;

    if (!worksheet) {
      const sheets = await graphRequest<WorksheetList>(`${base}/workbook/worksheets`);
      const names = (sheets.value ?? [])
        // A hidden sheet is usually scratch space or lookup data, so say so rather
        // than presenting it as equivalent to the rest.
        .map((sheet) => ({ name: sheet.name, hidden: sheet.visibility !== 'Visible' }));
      return JSON.stringify(
        {
          itemId,
          hint: 'Call again with one of these worksheet names to read its cells.',
          count: names.length,
          worksheets: names,
        },
        null,
        2,
      );
    }

    // `text` rather than `values`: values give dates as Excel serial numbers.
    // valuesOnly keeps formulas out, since the result of a formula is what is wanted.
    const range = await graphRequest<UsedRange>(
      `${base}/workbook/worksheets/${encodeURIComponent(worksheet)}` +
        `/usedRange(valuesOnly=true)?$select=address,rowCount,columnCount,text`,
    );

    const rows = range.text ?? [];
    if (rows.length === 0) {
      return JSON.stringify({ itemId, worksheet, address: range.address, rows: [], note: 'The worksheet is empty.' }, null, 2);
    }

    const columnCount = range.columnCount ?? rows[0]?.length ?? 0;
    // Two limits, because either dimension alone can be the problem: a sheet can be
    // long and narrow or short and very wide.
    const rowBudget = columnCount > 0 ? Math.max(1, Math.floor(MAX_CELLS / columnCount)) : maxRows;
    const limit = Math.min(maxRows, rowBudget);
    const returned = rows.slice(0, limit);

    return JSON.stringify(
      {
        itemId,
        worksheet,
        address: range.address,
        totalRows: range.rowCount,
        totalColumns: columnCount,
        returnedRows: returned.length,
        ...(returned.length < rows.length
          ? {
              truncated: true,
              note: `Showing the first ${returned.length} of ${rows.length} rows. Raise maxRows, or read a narrower sheet.`,
            }
          : {}),
        // Cell text as displayed, so a date reads as a date.
        rows: returned,
      },
      null,
      2,
    );
  }
}

/**
 * Reject a workbook request early when the file is plainly not a spreadsheet.
 *
 * Graph answers a workbook call on a non-spreadsheet with a generic failure, so the
 * name check gives a usable message instead.
 *
 * @param name - File name to check
 * @returns True when the extension is one the workbook API accepts
 */
export function isWorkbookName(name: string): boolean {
  return /\.(xlsx|xlsm|xltx|xltm)$/i.test(name);
}

/** Raise a clear error for a file the workbook API cannot open. */
export function assertWorkbookName(name: string): void {
  if (!isWorkbookName(name)) {
    throw new UserError(
      `${name} is not an Excel workbook. The workbook API accepts .xlsx, .xlsm, .xltx and .xltm; ` +
        'use readMicrosoftFile for anything else.',
    );
  }
}
