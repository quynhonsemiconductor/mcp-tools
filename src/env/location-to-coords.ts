import { z } from 'zod';

/** src/tools/location-to-coords env vars (geocode.maps.co) */
export const locationToCoordsEnvSchema = z.object({
  GEOCODE_MAPS_API_KEY: z
    .string()
    .optional()
    .describe('geocode.maps.co API key for location-to-coords tool'),
});
