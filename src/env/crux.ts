import { z } from 'zod';

/** src/tools/crux env vars (Google Chrome UX Report) */
export const cruxEnvSchema = z.object({
  GOOGLE_CRUX_API_KEY: z.string().optional().describe('Google CrUX (Chrome UX Report) API key'),
});
