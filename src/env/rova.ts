import { z } from 'zod';

/** src/tools/rova env vars (Rova project management) */
export const rovaEnvSchema = z.object({
  ROVA_API_URL: z
    .string()
    .optional()
    .describe('Base URL of the Rova API, e.g. https://rova-api.qnsc.vn. Defaults to production.'),
  ROVA_API_TOKEN: z
    .string()
    .optional()
    .describe(
      'Personal Rova API token, created in Rova under API tokens. Opaque and revocable, and it carries your identity so results are scoped to the projects you can read.',
    ),
});
