import { z } from 'zod';
import env from '../../env';
import { CatchErrors, UserError } from '../../utils';
import { fetchJson } from '../../utils/http';
import { Tool, ToolHandler } from '../registry';

const GEOCODE_API_BASE = 'https://geocode.maps.co/search';
const USER_AGENT = 'location-to-coords-mcp/1.0';

/**
 * Schema definition for the Location to Coordinates tool parameters
 */
export const LocationToCoordsSchema = z.object({
  location: z.string().describe('Name of a location or POI'),
});

/**
 * Type for the Location to Coordinates tool parameters
 */
export type LocationToCoordsParams = z.infer<typeof LocationToCoordsSchema>;

/**
 * Location to Coordinates - Convert location names to geographic coordinates
 */
@Tool({
  id: 'location-to-coords',
  name: 'getCoordinatesFromLocation',
  description: 'Convert a location or POI to latitude and longitude coordinates',
  category: 'Utility',
  parameters: LocationToCoordsSchema,
  envVars: ['GEOCODE_MAPS_API_KEY'],
  version: '1.0.0',
  annotations: {
    title: 'Get Coordinates from Location',
    readOnlyHint: true,
    openWorldHint: true,
  },
})
export class LocationToCoordsTool implements ToolHandler {
  /**
   * Execute the location to coordinates conversion
   * @param args The search parameters
   * @returns A string with location data in JSON format
   */
  @CatchErrors()
  async execute(args: LocationToCoordsParams): Promise<string> {
    return await this.getCoordinates(args.location);
  }

  /**
   * Makes an HTTP GET request to the specified URL and returns the parsed JSON response.
   *
   * @param url - The URL to send the request to.
   * @returns A promise that resolves to an array of records if the request is successful
   * @throws Will throw an error if the HTTP response status is not OK
   */
  private async makeRequest(url: string): Promise<Record<string, unknown>[]> {
    const headers = {
      'User-Agent': USER_AGENT,
      Accept: 'application/geo+json',
    };

    return fetchJson<Record<string, unknown>[]>(url, headers);
  }

  /**
   * Retrieves the geographical coordinates for a given location.
   *
   * @param location - The name or address of the location to retrieve coordinates for.
   * @returns A promise that resolves to a stringified JSON representation of the first response object
   * @throws UserError if no location data is returned
   */
  private async getCoordinates(location: string): Promise<string> {
    if (!env.GEOCODE_MAPS_API_KEY) {
      throw new UserError('GEOCODE_MAPS_API_KEY is not set in the environment variables');
    }

    const url = `${GEOCODE_API_BASE}?q=${encodeURIComponent(location)}&api_key=${env.GEOCODE_MAPS_API_KEY}`;

    const response = await this.makeRequest(url);
    if (!response || response.length === 0) {
      throw new UserError('No location data returned.');
    }

    return JSON.stringify(response[0], null, 2);
  }
}
