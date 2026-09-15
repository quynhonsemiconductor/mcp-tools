import { z } from 'zod';

/** src/tools/microsoft-graph env vars (Microsoft 365) */
export const microsoftEnvSchema = z.object({
  MICROSOFT_MAIL_ALLOWED_DOMAINS: z
    .string()
    .optional()
    .describe(
      "Extra domains sendOutlookMail and createCalendarEvent may address, comma separated. The signed-in user's own domain is always allowed; anything else is refused, so that content written by an outsider and read by these tools cannot cause mail to reach an outside address.",
    ),
});
