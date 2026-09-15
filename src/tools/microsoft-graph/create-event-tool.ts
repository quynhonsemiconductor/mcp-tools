/**
 * create-event-tool.ts — put a meeting on the signed-in person's calendar.
 *
 * Lower stakes than sending mail: an event can be deleted, and it appears on the
 * organiser's own calendar. Attendees are still notified, so the same domain guard
 * applies — an invitation is as visible to an outsider as an email.
 */

import { z } from 'zod';
import { Tool, ToolHandler } from '../registry';
import { CatchErrors, UserError } from '../../utils';
import { graphRequest } from './api';
import { allowedRecipientDomains, assertRecipientsAllowed } from './send-email-tool';

export const CreateCalendarEventSchema = z.object({
  subject: z.string().min(1).describe('Meeting title'),
  start: z
    .string()
    .min(1)
    .describe('Start time in ISO 8601, e.g. 2026-09-16T14:00:00. Interpreted in the given timeZone.'),
  end: z.string().min(1).describe('End time in ISO 8601, same form as start'),
  timeZone: z
    .string()
    .default('SE Asia Standard Time')
    .describe(
      'Windows time zone name for the times given, e.g. "SE Asia Standard Time". Not an IANA name such as Asia/Ho_Chi_Minh.',
    ),
  attendees: z
    .array(z.string().email())
    .max(50)
    .optional()
    .describe('Addresses to invite. Each receives an invitation, so the domain rules apply.'),
  body: z.string().optional().describe('Agenda or description'),
  location: z.string().optional().describe('Room or place'),
  onlineMeeting: z
    .boolean()
    .default(false)
    .describe('Add a Teams meeting link'),
});

export type CreateCalendarEventParams = z.input<typeof CreateCalendarEventSchema>;

interface Mailbox {
  mail?: string;
  userPrincipalName?: string;
}

interface CreatedEvent {
  id?: string;
  webLink?: string;
  onlineMeeting?: { joinUrl?: string } | null;
}

@Tool({
  id: 'microsoft-create-event',
  name: 'createCalendarEvent',
  description:
    'Create a meeting on the signed-in user calendar and invite attendees. Times are given in ISO 8601 with a Windows time zone name. Attendees must be inside the organisation unless other domains are permitted by configuration.',
  category: 'Microsoft 365',
  parameters: CreateCalendarEventSchema,
  version: '1.0.0',
  annotations: {
    title: 'Create Calendar Event',
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: true,
  },
})
export class CreateCalendarEventTool implements ToolHandler {
  /**
   * Create the event.
   *
   * @param args - Title, start and end, time zone, optional attendees and details
   * @returns JSON string with the event id, link and any meeting join URL
   */
  @CatchErrors()
  async execute(args: CreateCalendarEventParams): Promise<string> {
    const { subject, start, end, timeZone, attendees, body, location, onlineMeeting } =
      CreateCalendarEventSchema.parse(args);

    // Catch a reversed range here rather than creating a meeting that ends before it
    // starts, which Graph accepts and Outlook then displays oddly.
    if (new Date(end).getTime() <= new Date(start).getTime()) {
      throw new UserError(`The end time ${end} is not after the start time ${start}.`);
    }

    if (attendees && attendees.length > 0) {
      const me = await graphRequest<Mailbox>('/me?$select=mail,userPrincipalName');
      const own = (me.mail || me.userPrincipalName || '').split('@')[1] ?? '';
      assertRecipientsAllowed(attendees, allowedRecipientDomains(own));
    }

    const created = await graphRequest<CreatedEvent>('/me/events', {
      method: 'POST',
      body: JSON.stringify({
        subject,
        start: { dateTime: start, timeZone },
        end: { dateTime: end, timeZone },
        ...(body ? { body: { contentType: 'Text', content: body } } : {}),
        ...(location ? { location: { displayName: location } } : {}),
        ...(attendees && attendees.length > 0
          ? {
              attendees: attendees.map((address) => ({
                emailAddress: { address },
                type: 'required',
              })),
            }
          : {}),
        ...(onlineMeeting ? { isOnlineMeeting: true, onlineMeetingProvider: 'teamsForBusiness' } : {}),
      }),
    });

    return JSON.stringify(
      {
        created: true,
        eventId: created.id,
        subject,
        start,
        end,
        timeZone,
        attendees: attendees ?? [],
        link: created.webLink,
        joinUrl: created.onlineMeeting?.joinUrl,
      },
      null,
      2,
    );
  }
}
