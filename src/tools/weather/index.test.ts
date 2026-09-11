import {
  afterEach,
  beforeEach,
  describe,
  expect,
  mock,
  spyOn,
  test
} from 'bun:test';

// Mock dependencies before importing the module
const mockToolDecorator = () => <T>(target: T): T => target;
// mock.module's factory here is synchronous, so the returned Promise|void is never pending; fire-and-forget by design
void mock.module('../registry', () => ({
  Tool: mockToolDecorator
}));

// Import after mocks
import { UserError } from '../../utils';
import { WeatherTool } from './index';

describe('WeatherTool', () => {
  let weatherTool: WeatherTool;
  let mockFetch: ReturnType<typeof spyOn>;

  beforeEach(() => {
    // Create a new instance of the tool
    weatherTool = new WeatherTool();

    // Mock global.fetch with a minimal implementation.
    // `typeof fetch` (Bun) is a callable with a `preconnect` static method, which a plain
    // arrow function can't structurally satisfy, so the function itself needs a cast here.
    mockFetch = spyOn(global, 'fetch').mockImplementation(
      ((_input: string | URL | Request, _init?: RequestInit): Promise<Response> => {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({})
        } as Response);
      }) as typeof fetch,
    );

    // Spy on console.log to prevent logs during tests
    spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    // Restore all mocks
    mockFetch.mockRestore();
  });

  describe('execute', () => {
    test('should return weather forecast for valid coordinates', async () => {
      // Setup mock data for the first and second API calls
      const mockPointsResponse = {
        properties: {
          forecast: 'https://api.weather.gov/gridpoints/ABC/123,456/forecast'
        }
      };

      const mockForecastResponse = {
        properties: {
          periods: [
            {
              number: 1,
              name: 'Today',
              temperature: 75,
              temperatureUnit: 'F',
              detailedForecast: 'Sunny with a high near 75.'
            },
            {
              number: 2,
              name: 'Tonight',
              temperature: 55,
              temperatureUnit: 'F',
              detailedForecast: 'Clear with a low around 55.'
            },
            {
              number: 3,
              name: 'Tomorrow',
              temperature: 80,
              temperatureUnit: 'F',
              detailedForecast: 'Mostly sunny with a high near 80.'
            },
            {
              number: 4,
              name: 'Tomorrow Night',
              temperature: 60,
              temperatureUnit: 'F',
              detailedForecast: 'Partly cloudy with a low around 60.'
            },
            {
              number: 5,
              name: 'Day 3',
              temperature: 85,
              temperatureUnit: 'F',
              detailedForecast: 'Warm and sunny.'
            }
          ]
        }
      };

      // Mock fetch responses for the two sequential API calls
      mockFetch
        .mockImplementationOnce(() =>
          Promise.resolve({
            ok: true,
            json: async () => mockPointsResponse
          })
        )
        .mockImplementationOnce(() =>
          Promise.resolve({
            ok: true,
            json: async () => mockForecastResponse
          })
        );

      // Execute
      const result = await weatherTool.execute({
        latitude: 37.7749,
        longitude: -122.4194
      });

      // Verify first API call to get points data
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.weather.gov/points/37.7749,-122.4194',
        {
          headers: {
            'User-Agent': 'weather-mcp/1.0',
            Accept: 'application/geo+json'
          }
        }
      );

      // Verify second API call to get forecast
      expect(mockFetch.mock.calls[1][0]).toBe(
        'https://api.weather.gov/gridpoints/ABC/123,456/forecast'
      );
      expect(mockFetch.mock.calls[1][1]).toEqual({
        headers: {
          'User-Agent': 'weather-mcp/1.0',
          Accept: 'application/geo+json'
        }
      });

      // Verify result contains only the first 4 forecast periods
      const parsedResult = JSON.parse(result);
      expect(parsedResult).toHaveLength(4);
      expect(parsedResult[0].name).toBe('Today');
      expect(parsedResult[3].name).toBe('Tomorrow Night');
      expect(
        parsedResult.find((p: { name: string }) => p.name === 'Day 3'),
      ).toBeUndefined();
    });

    test('should handle non-OK HTTP response in the first API call', async () => {
      // Mock a non-OK response for the points API call
      mockFetch.mockImplementation(() =>
        Promise.resolve({
          ok: false,
          status: 404
        })
      );

      // Execute and verify
      try {
        await weatherTool.execute({ latitude: 37.7749, longitude: -122.4194 });
        expect().fail('Expected an error to be thrown but no error was thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(UserError);
      }
    });

    test('should handle non-OK HTTP response in the second API call', async () => {
      // Mock responses for sequential API calls - first success, second failure
      mockFetch
        .mockImplementationOnce(() =>
          Promise.resolve({
            ok: true,
            json: async () => ({
              properties: {
                forecast:
                  'https://api.weather.gov/gridpoints/ABC/123,456/forecast'
              }
            })
          })
        )
        .mockImplementationOnce(() =>
          Promise.resolve({
            ok: false,
            status: 500
          })
        );

      // Execute and verify
      try {
        await weatherTool.execute({ latitude: 37.7749, longitude: -122.4194 });
        expect().fail('Expected an error to be thrown but no error was thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(UserError);
      }
    });

    test('should handle missing forecast URL', async () => {
      // Mock a response that lacks the forecast URL
      mockFetch.mockImplementation(() =>
        Promise.resolve({
          ok: true,
          json: async () => ({
            properties: {
              // No forecast property
            }
          })
        })
      );

      // Execute and verify
      try {
        await weatherTool.execute({ latitude: 37.7749, longitude: -122.4194 });
        expect().fail('Expected an error to be thrown but no error was thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(UserError);
      }
    });

    test('should handle missing forecast periods', async () => {
      // Mock responses for sequential API calls
      mockFetch
        .mockImplementationOnce(() =>
          Promise.resolve({
            ok: true,
            json: async () => ({
              properties: {
                forecast:
                  'https://api.weather.gov/gridpoints/ABC/123,456/forecast'
              }
            })
          })
        )
        .mockImplementationOnce(() =>
          Promise.resolve({
            ok: true,
            json: async () => ({
              properties: {
                // No periods property
              }
            })
          })
        );

      // Execute and verify
      try {
        await weatherTool.execute({ latitude: 37.7749, longitude: -122.4194 });
        expect().fail('Expected an error to be thrown but no error was thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(UserError);
      }
    });
  });

  describe('makeNWSRequest', () => {
    test('should handle network errors', async () => {
      // Mock a network error
      mockFetch.mockImplementation(() => {
        throw new Error('Failed to connect');
      });

      // Execute and verify
      try {
        await weatherTool.execute({ latitude: 37.7749, longitude: -122.4194 });
        expect().fail('Expected an error to be thrown but no error was thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(UserError);
      }
    });

    test('should handle JSON parsing errors', async () => {
      // Mock a response with invalid JSON
      mockFetch.mockImplementation(() =>
        Promise.resolve({
          ok: true,
          json: async () => {
            throw new SyntaxError('Invalid JSON');
          }
        })
      );

      // Execute and verify
      try {
        await weatherTool.execute({ latitude: 37.7749, longitude: -122.4194 });
        expect().fail('Expected an error to be thrown but no error was thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(UserError);
      }
    });
  });

  describe('getForecast', () => {
    test('should handle edge case coordinates', async () => {
      // Mock sequential API responses for the edge case coordinates
      mockFetch
        .mockImplementationOnce(() =>
          Promise.resolve({
            ok: true,
            json: async () => ({
              properties: {
                forecast: 'https://api.weather.gov/gridpoints/XYZ/0,0/forecast'
              }
            })
          })
        )
        .mockImplementationOnce(() =>
          Promise.resolve({
            ok: true,
            json: async () => ({
              properties: {
                periods: [
                  {
                    number: 1,
                    name: 'Today',
                    temperature: 90,
                    temperatureUnit: 'F',
                    detailedForecast: 'Very hot'
                  }
                ]
              }
            })
          })
        );

      // Execute
      const result = await weatherTool.execute({ latitude: 0, longitude: 0 });

      // Verify
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.weather.gov/points/0,0',
        expect.any(Object)
      );
      expect(JSON.parse(result)).toHaveLength(1); // Only one period in the mock data
    });

    test('should handle fewer than 4 forecast periods', async () => {
      // Mock API responses with fewer forecast periods
      mockFetch
        .mockImplementationOnce(() =>
          Promise.resolve({
            ok: true,
            json: async () => ({
              properties: {
                forecast:
                  'https://api.weather.gov/gridpoints/ABC/123,456/forecast'
              }
            })
          })
        )
        .mockImplementationOnce(() =>
          Promise.resolve({
            ok: true,
            json: async () => ({
              properties: {
                periods: [
                  {
                    number: 1,
                    name: 'Today',
                    temperature: 75,
                    temperatureUnit: 'F',
                    detailedForecast: 'Sunny'
                  },
                  {
                    number: 2,
                    name: 'Tonight',
                    temperature: 55,
                    temperatureUnit: 'F',
                    detailedForecast: 'Clear'
                  }
                ]
              }
            })
          })
        );

      // Execute
      const result = await weatherTool.execute({
        latitude: 37.7749,
        longitude: -122.4194
      });

      // Verify that all available periods are returned when less than 4
      const parsedResult = JSON.parse(result);
      expect(parsedResult).toHaveLength(2);
      expect(parsedResult[0].name).toBe('Today');
      expect(parsedResult[1].name).toBe('Tonight');
    });
  });
});
