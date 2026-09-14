/**
 * list-calendar-tool.ts — the signed-in user's meetings over a date range.
 *
 * Meetings are where decisions get made, and they are the hardest thing to recover
 * afterwards: a Teams thread at least has text, but a meeting leaves only a subject
 * and a list of who was there. That is still enough to answer "when did we discuss
 * this" and "who was in the room".
 */

import { z } from 'zod';
import { Tool, ToolHandler } from '../registry';
import { CatchErrors } from '../../utils';
import { graphRequest } from './api';

export const ListCalendarEventsSchema = z.object({
  daysAhead: z
    .number()
    .int()
    .min(-365)
    .max(365)
    .default(7)
    .describe(
      'Days from today to cover. Positive looks forward, negative looks back over past meetings.',
    ),
  limit: z.number().int().min(1).max(50).default(20).describe('Maximum events to return'),
});

export type ListCalendarEventsParams = z.input<typeof ListCalendarEventsSchema>;

interface CalendarResponse {
  value?: {
    id?: string;
    subject?: string;
    start?: { dateTime?: string; timeZone?: string };
    end?: { dateTime?: string };
    isAllDay?: boolean;
    isCancelled?: boolean;
    location?: { displayName?: string };
    onlineMeeting?: { joinUrl?: string } | null;
    organizer?: { emailAddress?: { name?: string; address?: string } };
    attendees?: {
      emailAddress?: { name?: string; address?: string };
      status?: { response?: string };
    }[];
  }[];
}

@Tool({
  id: 'microsoft-list-calendar',
  name: 'listCalendarEvents',
  description:
    'List the signed-in user calendar over a date range. Use for questions about meetings — what is scheduled, when something was discussed, or who attended. Pass a negative daysAhead to look at past meetings.',
  category: 'Microsoft 365',
  parameters: ListCalendarEventsSchema,
  version: '1.0.0',
  annotations: {
    title: 'List Calendar Events',
    readOnlyHint: true,
    openWorldHint: true,
  },
})
export class ListCalendarEventsTool implements ToolHandler {
  /**
   * List events over the requested window.
   *
   * @param args - Days ahead or behind, and a result limit
   * @returns JSON string of calendar events in time order
   */
  @CatchErrors()
  async execute(args: ListCalendarEventsParams): Promise<string> {
    const { daysAhead, limit } = ListCalendarEventsSchema.parse(args);

    // calendarView rather than /me/events, because it expands recurring series into
    // their occurrences. /me/events returns the series master, so a weekly stand-up
    // would appear once with its original date and answer the question wrongly.
    const now = new Date();
    const other = new Date(now.getTime() + daysAhead * 86_400_000);
    const [start, end] = daysAhead >= 0 ? [now, other] : [other, now];

    const path =
      `/me/calendarView?startDateTime=${start.toISOString()}` +
      `&endDateTime=${end.toISOString()}` +
      `&$top=${limit}&$orderby=start/dateTime` +
      '&$select=id,subject,start,end,isAllDay,isCancelled,location,onlineMeeting,organizer,attendees';

    const response = await graphRequest<CalendarResponse>(path);
    const events = response.value ?? [];

    return JSON.stringify(
      {
        from: start.toISOString(),
        to: end.toISOString(),
        count: events.length,
        events: events.map((event) => ({
          subject: event.subject,
          start: event.start?.dateTime,
          end: event.end?.dateTime,
          // Graph returns these times in UTC unless asked otherwise, so state it
          // rather than leaving a bare timestamp to be misread as local.
          timeZone: event.start?.timeZone ?? 'UTC',
          allDay: event.isAllDay,
          ...(event.isCancelled ? { cancelled: true } : {}),
          organizer: event.organizer?.emailAddress?.name,
          attendees: (event.attendees ?? [])
            .map((attendee) => attendee.emailAddress?.name || attendee.emailAddress?.address)
            .filter(Boolean),
          location: event.location?.displayName || undefined,
          joinUrl: event.onlineMeeting?.joinUrl || undefined,
        })),
      },
      null,
      2,
    );
  }
}
