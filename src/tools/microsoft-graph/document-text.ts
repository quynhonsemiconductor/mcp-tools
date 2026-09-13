/**
 * document-text.ts — extract readable text from the formats people actually store.
 *
 * The read tool used to refuse anything that was not text, which meant it refused
 * most real documents: the files in this tenant are PDFs and PowerPoint decks, so
 * "summarise our security policy" could not work.
 *
 * PDFs are extracted locally. Office documents are converted to PDF by Graph first,
 * because Graph offers no text conversion of its own.
 */

import { extractText, getDocumentProxy } from 'unpdf';
import { UserError } from '../../utils';

/** Formats returned as-is, without conversion. */
const TEXT_LIKE = [
  'text/',
  'application/json',
  'application/xml',
  'application/javascript',
  'application/x-yaml',
];

/** Formats Graph can convert to PDF, from which text is then extracted. */
const CONVERTIBLE_TO_PDF = [
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/msword',
  'application/vnd.ms-powerpoint',
  'application/vnd.ms-excel',
  'application/rtf',
  'application/vnd.oasis.opendocument.text',
];

/** How a file's contents should be fetched, given its type. */
export type ReadStrategy = 'text' | 'pdf' | 'convert-to-pdf';

/**
 * Decide how to read a file of the given type.
 *
 * @param mimeType - The driveItem's reported MIME type
 * @returns The strategy to use, or null when the format cannot be read as text
 */
export function readStrategyFor(mimeType: string): ReadStrategy | null {
  if (TEXT_LIKE.some((prefix) => mimeType.startsWith(prefix))) return 'text';
  if (mimeType === 'application/pdf') return 'pdf';
  if (CONVERTIBLE_TO_PDF.includes(mimeType)) return 'convert-to-pdf';
  return null;
}

/**
 * Extract text from PDF bytes.
 *
 * @param bytes - The PDF file contents
 * @returns The document text, with pages merged
 * @throws UserError when the bytes cannot be parsed as a PDF
 */
export async function pdfToText(bytes: Uint8Array): Promise<{ text: string; pages: number }> {
  try {
    const pdf = await getDocumentProxy(bytes);
    const { totalPages, text } = await extractText(pdf, { mergePages: true });
    return { text: String(text), pages: totalPages };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // A scanned document parses fine and yields nothing, which is different from
    // corrupt bytes — worth saying so rather than returning an empty string.
    throw new UserError(
      `Could not read text from this PDF: ${message}. ` +
        'If it is a scan or an image-only export, it contains no text layer to extract.',
    );
  }
}
