/* eslint-disable no-console -- runs at process bootstrap before the logger/config exist; fatal env errors must print directly then exit */
import dotenv from 'dotenv';
import { z } from 'zod';
import { coreEnvSchema } from './env/core';
import { cruxEnvSchema } from './env/crux';
import { githubEnvSchema } from './env/github';
import { k6EnvSchema } from './env/k6';
import { locationToCoordsEnvSchema } from './env/location-to-coords';
import { newRelicEnvSchema } from './env/newrelic';
import { remoteMcpCredentialsEnvSchema } from './env/remote-mcp-credentials';
import { sanitizeEnv } from './env-sanitize';

// Re-exported for backwards compatibility with existing import sites.
export { isUnresolvedPlaceholder } from './env-sanitize';

dotenv.config();

/**
 * Combined env var schema, composed from per-integration schemas under
 * src/env/*.ts. Add a new integration's vars in its own file there and
 * merge it in below — don't add fields directly to this object, so each
 * integration's env vars ship (and are reviewable) in its own file.
 */
export const schema = coreEnvSchema
  .merge(githubEnvSchema)
  .merge(newRelicEnvSchema)
  .merge(k6EnvSchema)
  .merge(cruxEnvSchema)
  .merge(locationToCoordsEnvSchema)
  .merge(remoteMcpCredentialsEnvSchema);

const parsed = schema.safeParse(sanitizeEnv(process.env));

if (!parsed.success) {
  console.error(
    '❌ Invalid environment variables:',
    JSON.stringify(parsed.error.format(), null, 4),
  );
  process.exit(1);
}

export type EnvVarSchema = z.infer<typeof schema>;

export default parsed.data;
