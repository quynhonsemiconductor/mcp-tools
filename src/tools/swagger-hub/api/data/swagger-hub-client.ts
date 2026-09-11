import type {
  Api,
  OpenApiDocumentDetail,
  SwaggerHubApiDetailedSearchResponse,
  SwaggerHubApiSearchResponse,
  SwaggerHubConfiguration,
} from '../model/types/index.ts';

import {
  ChunkArray,
  CleanDetailedResponse,
  CleanSearchResponse,
  ParseProperties,
  QueryBuilder,
} from '../processing/index.ts';
import type { IOpenApiClient } from '../model/types/i-open-api-client.ts';
import * as yaml from 'js-yaml';
const DEFAULT_OWNER = 'QNSC';

/**
 * SwaggerHub API client implementation for managing OpenAPI documents.
 * Provides concrete implementation of IOpenApiClient interface with full
 * SwaggerHub integration including document upload, search, and retrieval.
 */
export class SwaggerHubClient implements IOpenApiClient {
  private configuration: SwaggerHubConfiguration;
  private readonly headers: { [key: string]: string };

  /**
   * Creates a new SwaggerHub client instance.
   * Initializes the client with configuration and sets up authentication headers.
   *
   * @param configuration - SwaggerHub configuration containing API key and base URL
   */
  constructor(configuration: SwaggerHubConfiguration) {
    this.configuration = configuration;
    this.headers = {
      Authorization: `${this.configuration.apiKey}`,
    };
  }

  /**
   * Uploads an OpenAPI document to SwaggerHub.
   * Creates or updates an API specification in the QNSC organization.
   *
   * @param apiName - The name of the API to create or update
   * @param document - The OpenAPI document content as a string
   * @param documentType - The document format type, must be either "json" or "yaml"
   * @param spec - The OpenAPI specification version (e.g., "3.0.0", "3.0.1", "3.1.0")
   * @param apiVersion - The version of the API being uploaded (e.g., "1.0.0", "v2")
   * @param isPrivate - Whether the API should be marked as private in SwaggerHub
   * @returns A promise that resolves when the upload is complete
   * @throws Error when upload fails due to invalid document format, authentication issues, or network problems
   */
  async uploadDocument(
    apiName: string,
    document: string,
    documentType: string,
    spec: string,
    apiVersion: string,
    isPrivate: boolean,
  ): Promise<void> {
    this.headers['Content-Type'] =
      documentType === 'json' ? 'application/json' : 'application/yaml';
    const url =
      `${this.configuration.baseUrl}/apis/${DEFAULT_OWNER}/${apiName}` +
      QueryBuilder(
        ['version', apiVersion],
        ['isPrivate', `${isPrivate}`],
        ['specification', `openapi-${spec}`],
      );
    await fetch(url, {
      headers: this.headers,
      body: document,
      method: 'POST',
    });
  }

  /**
   * Searches for OpenAPI documents in SwaggerHub using the provided query.
   * Returns a paginated list of matching API specifications with detailed document information.
   * Automatically fetches full document details for each matching API.
   *
   * @param text - The search query string to match against API names, descriptions, and content
   * @param organization - Optional organization name to filter results by ownership, defaults to QNSC
   * @param page - Optional page number for pagination, if not provided uses SwaggerHub default
   * @param limit - Optional maximum number of results per page, if not provided uses SwaggerHub default
   * @returns A promise that resolves to detailed search response containing matching APIs with full document details
   * @throws Error when search fails due to invalid query parameters or network issues
   */
  async search(
    text: string,
    organization?: string,
    page?: string,
    limit?: string,
  ): Promise<SwaggerHubApiDetailedSearchResponse> {
    const org = organization ?? DEFAULT_OWNER;
    const params: [string, string][] = [
      ['specType', 'API'],
      ['owner', org],
      ['sort', 'NAME'],
      ['query', `${encodeURIComponent(text)}`],
    ];
    if (page) {
      params.push(['page', page]);
    }
    if (limit) {
      params.push(['limit', limit]);
    }
    const url = `${this.configuration.baseUrl}/specs` + QueryBuilder(...params);
    const res = await fetch(url, {
      headers: this.headers,
      method: 'GET',
    });
    const docs = (await res.json()) as SwaggerHubApiSearchResponse;
    const cleanedDocs = CleanSearchResponse(docs);
    return this.getOpenApiDocumentBatch(cleanedDocs, 'json');
  }

  /**
   * Retrieves the complete OpenAPI document from a SwaggerHub URL.
   * Downloads and returns the full specification with optional processing options.
   *
   * @param url - The SwaggerHub URL pointing to the OpenAPI document
   * @param docType - The expected document format type ("json" or "yaml")
   * @param flatten - Optional flag to flatten the document structure by resolving $ref references
   * @param resolved - Optional flag to return a fully resolved document with all external references inlined
   * @returns A promise that resolves to the complete OpenAPI document details
   * @throws Error when document retrieval fails due to invalid URL, access permissions, or network issues
   */
  async getDocumentDetail(
    url: string,
    docType: string,
    flatten?: boolean,
    resolved?: boolean,
  ): Promise<OpenApiDocumentDetail> {
    this.headers['Accept'] = docType === 'json' ? 'application/json' : 'application/yaml';
    let updatedUrl = `${url}/swagger.${docType}`;
    if (flatten) {
      updatedUrl += QueryBuilder(['flatten', `${flatten}`]);
    }
    if (resolved) {
      updatedUrl += QueryBuilder(['resolved', `${resolved}`]);
    }
    const result = await fetch(updatedUrl, {
      headers: this.headers,
      method: 'GET',
    });
    if (docType === 'yaml') {
      const doc = await result.text();
      const docResult = yaml.load(doc, {
        json: true,
      });
      return docResult as OpenApiDocumentDetail;
    }
    return (await result.json()) as OpenApiDocumentDetail;
  }

  /**
   * Fetches detailed document information for multiple APIs in controlled batches.
   * Processes APIs in chunks of 5 to avoid rate limiting and overwhelming the SwaggerHub API.
   *
   * @param response - The search response containing APIs to fetch details for
   * @param docType - The document format type ("json" or "yaml")
   * @param flatten - Optional flag to flatten document structures
   * @param resolved - Optional flag to resolve external references
   * @returns A promise that resolves to a detailed search response with expanded API information
   */
  private async getOpenApiDocumentBatch(
    response: SwaggerHubApiSearchResponse,
    docType: string,
    flatten?: boolean,
    resolved?: boolean,
  ): Promise<SwaggerHubApiDetailedSearchResponse> {
    const expandedApis: OpenApiDocumentDetail[] = [];
    // We'll process the APIs in chunks of 5 to avoid overwhelming the API and getting rate limited.
    const chunks = ChunkArray(response.apis, 5);
    for (const chunk of chunks) {
      const chunkResults = await Promise.all(
        chunk.map((api) => this.getApiDetail(api, docType, flatten, resolved)),
      );
      expandedApis.push(...chunkResults);
    }
    return {
      ...response,
      apis: expandedApis,
    };
  }

  /**
   * Fetches detailed information for a single API.
   * Extracts the primary URL from API properties and retrieves the full document detail.
   *
   * @param api - The API object to fetch details for
   * @param docType - The document format type ("json" or "yaml")
   * @param flatten - Optional flag to flatten document structures
   * @param resolved - Optional flag to resolve external references
   * @returns A promise that resolves to the complete API document detail with URL information
   */
  private async getApiDetail(
    api: Api,
    docType: string,
    flatten?: boolean,
    resolved?: boolean,
  ): Promise<OpenApiDocumentDetail> {
    const result = ParseProperties(api);
    const openApiDoc = await this.getDocumentDetail(result[0], docType, flatten, resolved);
    const cleanedDoc = CleanDetailedResponse(openApiDoc);
    return {
      url: result[0],
      versions: api.versions,
      ...cleanedDoc,
    };
  }
}
