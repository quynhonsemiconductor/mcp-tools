import env from '../../../env.ts';
import { SwaggerHubClient } from './data/swagger-hub-client.ts';

const baseUrl = 'https://api.swaggerhub.com';

/**
 * Factory function that provides a configured OpenAPI client for SwaggerHub operations.
 * Creates and returns a SwaggerHubClient instance with the required API key authentication.
 *
 * @returns A configured SwaggerHubClient instance ready for API operations
 * @throws Error when SWAGGER_HUB_API_KEY environment variable is not found
 */
export const ProvideOpenApiClient = () => {
  return new SwaggerHubClient({
    apiKey: env.SWAGGER_HUB_API_KEY!,
    baseUrl: baseUrl,
  });
};
