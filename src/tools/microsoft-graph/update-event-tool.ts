/**
 * update-event-tool.ts — change or cancel a meeting that already exists.
 *
 * Creating an event without being able to change or cancel it is half a feature: the
 * next thing anyone wants is to move the time or call it off, and doing that by hand
 * defeats the point.
 *
 * Cancelling goes through Graph's cancel action rather than a delete, because a delete
 * removes the event from the organiser's calendar and leaves it on everyone else's.
 * Cancel withdraws the invitation and tells the attendees.
 */

import { z } from 'zod';
import { Tool, ToolHandler } from '../registry';
import { CatchErrors, UserError } from '../../utils';
import { graphRequest } from './api';

export const UpdateCalendarEventSchema = z.object({
  eventId: z.string().min(1).describe('Event to change, from createCalendarEvent or listCalendarEvents'),
  cancel: z
    .boolean()
    .default(false)
    .describe('Cancel the meeting and notify attendees. Other fields are ignored when true.'),
  cancelMessage: z
    .string()
    .optional()
    .describe('Note sent to attendees when cancelling, e.g. why it is off'),
  subject: z.string().optional().describe('New title'),
  start: z.string().optional().describe('New start in ISO 8601. Requires end and timeZone.'),
  end: z.string().optional().describe('New end in ISO 8601'),
  timeZone: z
    .string()
    .default('SE Asia Standard Time')
    .describe('Windows time zone name for the new times, not an IANA name'),
  body: z.string().optional().describe('New agenda or description'),
  location: z.string().optional().describe('New room or place'),
});

export type UpdateCalendarEventParams = z.input<typeof UpdateCalendarEventSchema>;

@Tool({
  id: 'microsoft-update-event',
  name: 'updateCalendarEvent',
  description:
    'Change or cancel an existing meeting on the signed-in user calendar. Pass cancel to call it off and notify attendees; otherwise pass only the fields to change.',
  category: 'Microsoft 365',
  parameters: UpdateCalendarEventSchema,
  version: '1.0.0',
  annotations: {
    title: 'Update Calendar Event',
    readOnlyHint: false,
    // Cancelling withdraws a meeting from other people's calendars, which is visible
    // to them and not something to do speculatively.
    destructiveHint: true,
    idempotentHint: false,
    openWorldHint: true,
  },
})
export class UpdateCalendarEventTool implements ToolHandler {
  /**
   * Change or cancel the event.
   *
   * @param args - Event id, and either cancel or the fields to change
   * @returns JSON string describing what changed
   */
  @CatchErrors()
  async execute(args: UpdateCalendarEventParams): Promise<string> {
    const { eventId, cancel, cancelMessage, subject, start, end, timeZone, body, location } =
      UpdateCalendarEventSchema.parse(args);
    const base = `/me/events/${encodeURIComponent(eventId)}`;

    if (cancel) {
      // Graph's cancel action, not DELETE: a delete takes the event off the organiser's
      // calendar and leaves it on the attendees', so they keep an appointment nobody is
      // hosting.
      await graphRequest(`${base}/cancel`, {
        method: 'POST',
        body: JSON.stringify({ comment: cancelMessage ?? '' }),
      });
      return JSON.stringify({ cancelled: true, eventId, notified: true }, null, 2);
    }

    // A one-sided time change would move only one end of the meeting, so require both.
    if ((start && !end) || (end && !start)) {
      throw new UserError('Changing the time needs both start and end, or the meeting would be open ended.');
    }
    if (start && end && new Date(end).getTime() <= new Date(start).getTime()) {
      throw new UserError(`The end time ${end} is not after the start time ${start}.`);
    }

    const patch: Record<string, unknown> = {};
    if (subject) patch.subject = subject;
    if (body) patch.body = { contentType: 'Text', content: body };
    if (location) patch.location = { displayName: location };
    if (start && end) {
      patch.start = { dateTime: start, timeZone };
      patch.end = { dateTime: end, timeZone };
    }

    if (Object.keys(patch).length === 0) {
      throw new UserError(
        'Nothing to change. Pass at least one of subject, start with end, body or location, or pass cancel to call the meeting off.',
      );
    }

    const updated = await graphRequest<{ id?: string; webLink?: string; subject?: string }>(base, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    });

    return JSON.stringify(
      {
        updated: true,
        eventId: updated.id ?? eventId,
        changed: Object.keys(patch),
        subject: updated.subject,
        link: updated.webLink,
      },
      null,
      2,
    );
  }
}
