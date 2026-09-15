/**
 * read-email-tool.ts — read one message in full, and open what is attached to it.
 *
 * searchOutlookMessages finds a message and returns Graph's bodyPreview, which is
 * capped: a real message came back as 262 characters ending mid-sentence. So an email
 * could be located and not read, which is the half of the job that matters. It also
 * reported hasAttachments without any way to open one.
 *
 * This completes the pair, the same way readMicrosoftFile completes searchMicrosoftFiles.
 */

import { z } from 'zod';
import { Tool, ToolHandler } from '../registry';
import { CatchErrors, UserError } from '../../utils';
import { graphRequest } from './api';
import { htmlToText } from './list-chats-tool';
import { pdfToText, readStrategyFor } from './document-text';

/** Cap on returned body text, mirroring the document reader. */
const MAX_BODY_CHARS = 200_000;

export const ReadOutlookMessageSchema = z.object({
  messageId: z
    .string()
    .min(1)
    .describe('Message id, as returned by searchOutlookMessages'),
  attachmentName: z
    .string()
    .optional()
    .describe(
      'Read this attachment instead of the message body. PDFs and text formats can be read; Office documents cannot, because converting them needs the file to be in a drive. Omit to get the body and the attachment list.',
    ),
});

export type ReadOutlookMessageParams = z.input<typeof ReadOutlookMessageSchema>;

interface MessageDetail {
  id?: string;
  subject?: string;
  receivedDateTime?: string;
  hasAttachments?: boolean;
  webLink?: string;
  from?: { emailAddress?: { name?: string; address?: string } };
  toRecipients?: { emailAddress?: { name?: string; address?: string } }[];
  ccRecipients?: { emailAddress?: { name?: string; address?: string } }[];
  body?: { content?: string; contentType?: string };
}

interface AttachmentList {
  value?: {
    id?: string;
    name?: string;
    contentType?: string;
    size?: number;
    isInline?: boolean;
    '@odata.type'?: string;
    contentBytes?: string;
  }[];
}

@Tool({
  id: 'microsoft-read-email',
  name: 'readOutlookMessage',
  description:
    'Read a full Outlook message and list its attachments. Use after searchOutlookMessages, whose body preview is truncated. Pass attachmentName to read an attached PDF or text file.',
  category: 'Microsoft 365',
  parameters: ReadOutlookMessageSchema,
  version: '1.0.0',
  annotations: {
    title: 'Read Outlook Message',
    readOnlyHint: true,
    openWorldHint: true,
  },
})
export class ReadOutlookMessageTool implements ToolHandler {
  /**
   * Read a message, or one of its attachments.
   *
   * @param args - Message id, and optionally the attachment to read
   * @returns JSON string of the message with its text, or the attachment's text
   */
  @CatchErrors()
  async execute(args: ReadOutlookMessageParams): Promise<string> {
    const { messageId, attachmentName } = ReadOutlookMessageSchema.parse(args);
    const base = `/me/messages/${encodeURIComponent(messageId)}`;

    if (attachmentName) {
      // contentBytes only arrives when attachments are expanded; requesting the
      // collection without it returns metadata and no content.
      const list = await graphRequest<AttachmentList>(
        `${base}/attachments?$select=id,name,contentType,size,isInline`,
      );
      const items = list.value ?? [];
      const match = items.find((item) => item.name === attachmentName);
      if (!match) {
        throw new UserError(
          `No attachment named "${attachmentName}" on this message. ` +
            `Attachments present: ${items.map((i) => i.name).filter(Boolean).join(', ') || 'none'}.`,
        );
      }

      const full = await graphRequest<{ contentBytes?: string; name?: string; contentType?: string }>(
        `${base}/attachments/${encodeURIComponent(String(match.id))}`,
      );
      if (!full.contentBytes) {
        throw new UserError(
          `"${attachmentName}" carries no bytes to read. An item attached as a link to ` +
            'OneDrive or SharePoint has no content on the message itself — search for the ' +
            'file by name and read it with readMicrosoftFile or readMicrosoftWorkbook.',
        );
      }

      const bytes = Buffer.from(full.contentBytes, 'base64');
      const name = full.name ?? attachmentName;
      const mime = full.contentType ?? 'application/octet-stream';
      const strategy = readStrategyFor(mime);

      // Only two strategies apply to an attachment. Graph converts Office documents to
      // PDF, but that endpoint works on a drive item, and an attachment is bytes on a
      // message with no drive item behind it — so a .docx attached to an email cannot be
      // converted the way the same file in OneDrive can.
      if (strategy === 'pdf') {
        const { text, pages } = await pdfToText(new Uint8Array(bytes));
        return JSON.stringify(
          {
            messageId,
            attachment: name,
            contentType: mime,
            sizeBytes: bytes.length,
            pages,
            ...(text.length > MAX_BODY_CHARS ? { truncated: true } : {}),
            content: text.slice(0, MAX_BODY_CHARS),
          },
          null,
          2,
        );
      }

      if (strategy === 'text') {
        const text = new TextDecoder().decode(bytes);
        return JSON.stringify(
          {
            messageId,
            attachment: name,
            contentType: mime,
            sizeBytes: bytes.length,
            ...(text.length > MAX_BODY_CHARS ? { truncated: true } : {}),
            content: text.slice(0, MAX_BODY_CHARS),
          },
          null,
          2,
        );
      }

      throw new UserError(
        `"${name}" is a ${mime} attachment, and text cannot be read from it here. ` +
          'PDFs and text formats are read directly; Office documents are converted by ' +
          'Graph, which needs the file to live in a drive rather than on a message. If a ' +
          'copy exists in OneDrive or SharePoint, find it with searchMicrosoftFiles and ' +
          'read that with readMicrosoftFile or readMicrosoftWorkbook.',
      );
    }

    const message = await graphRequest<MessageDetail>(
      `${base}?$select=id,subject,receivedDateTime,hasAttachments,webLink,from,toRecipients,ccRecipients,body`,
    );

    const raw = message.body?.content ?? '';
    // Outlook stores most messages as HTML even when they read as plain text.
    const text = message.body?.contentType === 'text' ? raw.trim() : htmlToText(raw);

    let attachments: { name?: string; contentType?: string; sizeBytes?: number }[] = [];
    if (message.hasAttachments) {
      const list = await graphRequest<AttachmentList>(
        `${base}/attachments?$select=id,name,contentType,size,isInline`,
      );
      attachments = (list.value ?? [])
        // Inline images are signatures and embedded screenshots; listing them as
        // attachments makes every signed message look like it carries documents.
        .filter((item) => !item.isInline)
        .map((item) => ({ name: item.name, contentType: item.contentType, sizeBytes: item.size }));
    }

    return JSON.stringify(
      {
        messageId,
        subject: message.subject,
        from: message.from?.emailAddress?.address,
        fromName: message.from?.emailAddress?.name,
        to: (message.toRecipients ?? []).map((r) => r.emailAddress?.address).filter(Boolean),
        cc: (message.ccRecipients ?? []).map((r) => r.emailAddress?.address).filter(Boolean),
        received: message.receivedDateTime,
        link: message.webLink,
        ...(attachments.length > 0
          ? { attachments, hint: 'Pass attachmentName to read one of these.' }
          : {}),
        ...(text.length > MAX_BODY_CHARS ? { truncated: true } : {}),
        body: text.slice(0, MAX_BODY_CHARS),
      },
      null,
      2,
    );
  }
}
