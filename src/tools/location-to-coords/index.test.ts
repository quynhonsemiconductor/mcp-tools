import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from 'bun:test';

// Mock Tool decorator
const mockToolDecorator = () => <T>(target: T): T => target;
// mock.module's factory here is synchronous, so the returned Promise|void is never pending; fire-and-forget by design
void mock.module('../registry', () => ({
  Tool: mockToolDecorator,
}));

// Mock env module to provide a test API key
void mock.module('../../env', () => ({
  default: { GEOCODE_MAPS_API_KEY: 'test-api-key-123' },
}));

// Import after mocks
import { UserError } from '../../utils';
import { LocationToCoordsTool } from './index';

describe('LocationToCoordsTool', () => {
  let locationTool: LocationToCoordsTool;
  let mockFetch: ReturnType<typeof spyOn>;

  beforeEach(() => {
    // Create a new instance of the tool
    locationTool = new LocationToCoordsTool();

    // Mock global.fetch with a minimal implementation.
    // `typeof fetch` (Bun) is a callable with a `preconnect` static method, which a plain
    // arrow function can't structurally satisfy, so the function itself needs a cast here.
    mockFetch = spyOn(global, 'fetch').mockImplementation(
      ((_input: string | URL | Request, _init?: RequestInit): Promise<Response> => {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({}),
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
    test('should return coordinates for a valid location', async () => {
      // Setup mock data
      const mockLocationData = [
        {
          place_id: 123456,
          lat: '37.7749',
          lon: '-122.4194',
          display_name: 'San Francisco, California, USA',
          type: 'city',
          importance: 0.9,
        },
      ];

      // Mock successful fetch response
      mockFetch.mockImplementation(() =>
        Promise.resolve({
          ok: true,
          json: async () => mockLocationData,
        }),
      );

      // Execute
      const result = await locationTool.execute({ location: 'San Francisco' });

      // Verify
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('https://geocode.maps.co/search?q=San%20Francisco'),
        expect.objectContaining({
          headers: expect.objectContaining({
            'User-Agent': 'location-to-coords-mcp/1.0',
          }),
        }),
      );

      // Verify the API key is included in the URL
      expect(mockFetch.mock.calls[0][0]).toMatch(/api_key=[a-zA-Z0-9-]+/);

      // Verify result
      const parsedResult = JSON.parse(result);
      expect(parsedResult).toEqual(mockLocationData[0]);
      expect(parsedResult.lat).toBe('37.7749');
      expect(parsedResult.lon).toBe('-122.4194');
    });

    test('should handle empty response', async () => {
      // Mock empty response
      mockFetch.mockImplementation(() =>
        Promise.resolve({
          ok: true,
          json: async () => [],
        }),
      );

      // Execute and verify
      try {
        await locationTool.execute({ location: 'NonExistentPlace' });
        expect().fail('Expected an error to be thrown but no error was thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(UserError);
      }
    });

    test('should handle fetch errors', async () => {
      // Mock fetch network error
      mockFetch.mockImplementation(() => {
        throw new Error('Network error');
      });

      // Execute and verify
      try {
        await locationTool.execute({ location: 'San Francisco' });
        expect().fail('Expected an error to be thrown but no error was thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(UserError);
      }
    });

    test('should handle non-OK HTTP responses', async () => {
      // Mock non-OK response
      mockFetch.mockImplementation(() =>
        Promise.resolve({
          ok: false,
          status: 404,
        }),
      );

      // Execute and verify
      try {
        await locationTool.execute({ location: 'San Francisco' });
        expect().fail('Expected an error to be thrown but no error was thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(UserError);
      }
    });
  });

  describe('getCoordinates', () => {
    test('should return first result from multiple locations', async () => {
      // Setup mock data with multiple results
      const mockLocationData = [
        {
          place_id: 123456,
          lat: '37.7749',
          lon: '-122.4194',
          display_name: 'San Francisco, CA, USA',
          type: 'city',
        },
        {
          place_id: 234567,
          lat: '37.7845',
          lon: '-122.4235',
          display_name: 'San Francisco City Hall, CA, USA',
          type: 'landmark',
        },
      ];

      // Mock successful fetch response
      mockFetch.mockImplementation(() =>
        Promise.resolve({
          ok: true,
          json: async () => mockLocationData,
        }),
      );

      // Execute
      const result = await locationTool.execute({ location: 'San Francisco' });

      // Verify that only the first result is returned
      const parsedResult = JSON.parse(result);
      expect(parsedResult).toEqual(mockLocationData[0]);
      expect(parsedResult).not.toEqual(mockLocationData[1]);
    });

    test('should handle special characters in location names', async () => {
      // Mock successful fetch response
      mockFetch.mockImplementation(() =>
        Promise.resolve({
          ok: true,
          json: async () => [{ lat: '48.8566', lon: '2.3522' }],
        }),
      );

      // Execute with location containing special characters
      await locationTool.execute({ location: 'Paris, Île-de-France' });

      // Verify URL encoding was applied
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('q=Paris%2C%20%C3%8Ele-de-France'),
        expect.any(Object),
      );
    });
  });

  describe('makeRequest', () => {
    test('should handle JSON parsing errors', async () => {
      // Mock response with invalid JSON
      mockFetch.mockImplementation(() =>
        Promise.resolve({
          ok: true,
          json: async () => {
            throw new SyntaxError('Invalid JSON');
          },
        }),
      );

      // Execute and verify
      try {
        await locationTool.execute({ location: 'San Francisco' });
        expect().fail('Expected an error to be thrown but no error was thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(UserError);
      }
    });
  });
});
