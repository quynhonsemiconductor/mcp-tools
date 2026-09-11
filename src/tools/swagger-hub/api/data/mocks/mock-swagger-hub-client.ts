import type {
  SwaggerHubApiDetailedSearchResponse,
  OpenApiDocumentDetail,
} from '../../model/types/index.ts';
import type { IOpenApiClient } from '../../model/types/i-open-api-client.ts';

/**
 * Mock implementation of IOpenApiClient for testing purposes.
 * Provides stubbed responses for all OpenAPI client operations without making actual API calls.
 * Used in unit tests to isolate functionality and avoid external dependencies.
 */
export class MockOpenApiClient implements IOpenApiClient {
  async uploadDocument(
    apiName: string,
    _document: string,
    _documentType: string,
    _spec: string,
    _apiVersion: string,
    _isPrivate: boolean,
  ): Promise<void> {
    return Promise.resolve();
  }
  async search(
    text: string,
    owner?: string,
    page?: string,
    limit?: string,
  ): Promise<SwaggerHubApiDetailedSearchResponse> {
    return {
      name: '',
      description: '',
      url: '',
      offset: 1,
      totalCount: 1,
      apis: [
        {
          url: '',
          paths: [],
        },
      ],
    };
  }
  async getDocumentDetail(
    url: string,
    docType: string,
    flatten?: boolean,
    resolved?: boolean,
  ): Promise<OpenApiDocumentDetail> {
    return Promise.resolve({
      url: url,
      openapi: '3.0.0',
      info: {
        title: 'Test API',
        description: 'A test API document',
        version: '1.0.0',
      },
      servers: [
        {
          url: 'https://api.example.com',
          description: 'Production server',
        },
      ],
      paths: ['/users', '/orders'],
    });
  }
}
