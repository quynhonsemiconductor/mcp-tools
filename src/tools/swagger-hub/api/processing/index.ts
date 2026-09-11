import type {
  Api,
  OpenApiDocumentDetail,
  Property,
  SwaggerHubApiSearchResponse,
} from '../model/types';

/**
 * Extracts URL properties from an API object.
 * Flattens the properties array and returns all available URLs.
 *
 * @param props - The API object containing properties to parse
 * @returns Array of URL strings extracted from the API properties
 */
export const ParseProperties = (props: Api): string[] => {
  return props.properties.flatMap((property) => {
    return property.url ?? [];
  });
};

/**
 * Builds a query string from key-value parameter pairs.
 * Constructs a properly formatted URL query string with appropriate separators.
 *
 * @param params - Variable number of key-value tuple pairs for the query string
 * @returns Formatted query string starting with '?' and using '&' separators
 */
export const QueryBuilder = (...params: [string, string][]): string => {
  let requestString = '?';
  params.forEach((queryMap: [string, string], index: number) => {
    const [key, value] = queryMap;
    requestString += index === 0 ? `${key}=${value}` : `&${key}=${value}`;
  });
  return requestString;
};

/**
 * Splits an array into smaller chunks of specified size.
 * Useful for pagination or batch processing of large datasets.
 *
 * @param array - The array to be chunked
 * @param chunkSize - Maximum size of each chunk
 * @returns Array of arrays, each containing up to chunkSize elements
 */
export const ChunkArray = <T>(array: T[], chunkSize: number): T[][] => {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += chunkSize) {
    chunks.push(array.slice(i, i + chunkSize));
  }
  return chunks;
};

/**
 * Cleans the search response by removing unnecessary properties from APIs.
 * Applies API-level cleaning to each API in the search results.
 *
 * @param response - The raw search response from SwaggerHub
 * @returns Cleaned search response with filtered API properties
 */
export const CleanSearchResponse = (
  response: SwaggerHubApiSearchResponse,
): SwaggerHubApiSearchResponse => {
  return {
    ...response,
    apis: response.apis.map((api) => CleanApiResponse(api)),
  };
};

/**
 * Cleans individual API response by keeping only essential properties.
 * Filters properties to include only Swagger specifications and version information.
 *
 * @param api - The API object to clean
 * @returns Cleaned API object with only name, description, and filtered properties
 */
export const CleanApiResponse = (api: Api): Api => {
  const props = api.properties.filter(
    (prop) => prop.type === 'Swagger' || prop.type === 'X-Version' || prop.type === 'X-Versions',
  );
  const swaggerUrl = props.find((item) => item.type === 'Swagger');
  let versions: string[] = [];
  props.forEach((prop) => {
    if (prop.type === 'X-Versions') {
      if (swaggerUrl?.url) versions = GetVersionUrls(prop, swaggerUrl.url);
    }
  });
  return {
    name: api.name,
    description: api.description,
    properties: props,
    versions: versions,
  };
};

/**
 * Cleans the detailed OpenAPI response by keeping only paths.
 * Extracts and returns only the API endpoint paths from the full document detail.
 *
 * @param response - The detailed OpenAPI document response
 * @returns Simplified response containing only the paths as string array
 */
export const CleanDetailedResponse = (response: OpenApiDocumentDetail): OpenApiDocumentDetail => {
  return {
    paths: Object.keys(response.paths as object),
  };
};

const GetVersionUrls = (prop: Property, url: string) => {
  const baseUrl = url.split('/').slice(0, -1).join('/') + '/';
  return (prop.value?.split(',') ?? []).map((value) => baseUrl + value.replace('-', ''));
};
