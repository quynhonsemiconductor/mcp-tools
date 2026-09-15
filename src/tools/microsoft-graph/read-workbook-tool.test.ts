/**
 * Tests for workbook name checking.
 *
 * The workbook API only opens Excel formats, and Graph answers a workbook call on
 * anything else with a generic failure that does not say so. These pin the extensions
 * accepted, including the ones people forget: macro-enabled and template workbooks.
 */

import { describe, expect, it } from 'bun:test';
import '../../test-utils/mocks';
import { assertWorkbookName, isWorkbookName } from './read-workbook-tool';

describe('isWorkbookName', () => {
  it('accepts the Excel formats the workbook API can open', () => {
    for (const name of ['data.xlsx', 'macro.xlsm', 'template.xltx', 'template.xltm']) {
      expect(isWorkbookName(name)).toBe(true);
    }
  });

  it('is case insensitive, since Windows uploads often carry capitals', () => {
    expect(isWorkbookName('REPORT.XLSX')).toBe(true);
    expect(isWorkbookName('Report.Xlsx')).toBe(true);
  });

  it('rejects the legacy .xls format, which the workbook API cannot open', () => {
    // Worth pinning: .xls looks like a spreadsheet and is not supported, so it has to
    // go through readMicrosoftFile instead.
    expect(isWorkbookName('old.xls')).toBe(false);
  });

  it('rejects other documents', () => {
    for (const name of ['notes.docx', 'deck.pptx', 'policy.pdf', 'data.csv', 'plain.txt']) {
      expect(isWorkbookName(name)).toBe(false);
    }
  });

  it('does not match an extension appearing mid-name', () => {
    expect(isWorkbookName('xlsx-notes.txt')).toBe(false);
    expect(isWorkbookName('report.xlsx.bak')).toBe(false);
  });
});

describe('assertWorkbookName', () => {
  it('passes a workbook through', () => {
    expect(() => assertWorkbookName('budget.xlsx')).not.toThrow();
  });

  it('names the alternative rather than only refusing', () => {
    let message = '';
    try {
      assertWorkbookName('policy.pdf');
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    expect(message).toContain('policy.pdf');
    expect(message).toContain('readMicrosoftFile');
  });
});
