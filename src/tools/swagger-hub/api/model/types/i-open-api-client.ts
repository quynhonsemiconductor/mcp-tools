import type { OpenApiDocumentDetail, SwaggerHubApiDetailedSearchResponse } from './index.ts';

/**
 * Interface for interacting with OpenAPI specifications in SwaggerHub.
 * Provides methods for uploading, searching, and retrieving OpenAPI documents
 * from the SwaggerHub platform.
 */
export interface IOpenApiClient {
  /**
   * Uploads an OpenAPI document to SwaggerHub.
   * Creates or updates an API specification in the specified SwaggerHub organization.
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
  uploadDocument(
    apiName: string,
    document: string,
    documentType: string,
    spec: string,
    apiVersion: string,
    isPrivate: boolean,
  ): Promise<void>;

  /**
   * Searches for OpenAPI documents in SwaggerHub using the provided query.
   * Returns a paginated list of matching API specifications based on the search criteria.
   *
   * @param text - The search query string to match against API names, descriptions, and content
   * @param owner - Optional organization or user name to filter results by ownership
   * @param page - Optional page number for pagination, defaults to "0" if not specified
   * @param limit - Optional maximum number of results per page, defaults to "5" if not specified
   * @returns A promise that resolves to detailed search response containing matching APIs
   * @throws Error when search fails due to invalid query parameters or network issues
   */
  search(
    text: string,
    owner?: string,
    page?: string,
    limit?: string,
  ): Promise<SwaggerHubApiDetailedSearchResponse>;

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
  getDocumentDetail(
    url: string,
    docType: string,
    flatten?: boolean,
    resolved?: boolean,
  ): Promise<OpenApiDocumentDetail>;
}
