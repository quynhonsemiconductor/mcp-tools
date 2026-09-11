import { z } from 'zod';
import { CatchErrors, UserError } from '../../utils';
import { fetchJson } from '../../utils/http';
import { Tool, ToolHandler } from '../registry';

const NWS_API_BASE = 'https://api.weather.gov';
const USER_AGENT = 'weather-mcp/1.0';

/**
 * Schema definition for the Weather tool parameters
 */
export const WeatherSchema = z.object({
  latitude: z.number().describe('Latitude for forecast').min(-90).max(90),
  longitude: z.number().describe('Longitude for forecast').min(-180).max(180),
});

/**
 * Type for the Weather tool parameters
 */
export type WeatherParams = z.infer<typeof WeatherSchema>;

/**
 * Weather - Get weather forecasts based on location
 */
@Tool({
  id: 'weather',
  name: 'getWeatherForecast',
  description: 'Get the weather forecast for a given latitude and longitude',
  category: 'Utility',
  parameters: WeatherSchema,
  version: '1.0.0',
  annotations: {
    title: 'Weather Forecast',
    readOnlyHint: true,
  },
})
export class WeatherTool implements ToolHandler {
  /**
   * Execute the weather forecast tool
   */
  @CatchErrors()
  async execute(args: WeatherParams): Promise<string> {
    const { latitude, longitude } = args;
    return await this.getForecast(latitude, longitude);
  }

  /**
   * Makes a request to the National Weather Service (NWS) API and retrieves data in GeoJSON format.
   *
   * @param url - The URL to send the request to.
   * @returns A promise that resolves to a record containing the response data
   * @throws Will throw an error if the HTTP response status is not OK
   */
  private async makeNWSRequest(url: string): Promise<Record<string, unknown>> {
    const headers = {
      'User-Agent': USER_AGENT,
      Accept: 'application/geo+json',
    };

    try {
      return await fetchJson(url, headers);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new UserError(`Error fetching data from NWS API: ${message}`);
    }
  }

  /**
   * Retrieves a weather forecast for a given latitude and longitude.
   *
   * This function makes use of the National Weather Service (NWS) API to fetch
   * forecast data. It first retrieves the forecast URL for the specified location
   * and then fetches the detailed forecast data.
   *
   * @param latitude - The latitude of the location for which to retrieve the forecast.
   * @param longitude - The longitude of the location for which to retrieve the forecast.
   * @returns A promise that resolves to a string containing the forecast data in JSON format
   */
  private async getForecast(latitude: number, longitude: number): Promise<string> {
    const url = `${NWS_API_BASE}/points/${latitude},${longitude}`;
    const pointsResponse = (await this.makeNWSRequest(url)) as {
      properties?: { forecast?: string };
    };

    const forecastUrl = pointsResponse?.properties?.forecast;
    if (!forecastUrl) {
      throw new UserError('Failed to get forecast URL from NWS API');
    }

    const forecastResponse = (await this.makeNWSRequest(forecastUrl)) as {
      properties?: { periods?: unknown[] };
    };

    if (!forecastResponse?.properties?.periods) {
      throw new UserError('Failed to get forecast periods from NWS API');
    }

    return JSON.stringify(forecastResponse.properties.periods.slice(0, 4), null, 2);
  }
}
