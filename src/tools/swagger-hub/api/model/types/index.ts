/**
 * Configuration settings for SwaggerHub API client
 */
export type SwaggerHubConfiguration = {
  /** API key for authenticating with SwaggerHub */
  apiKey: string;
  /** Base URL for the SwaggerHub API */
  baseUrl: string;
};

export type SwaggerHubApiSearchResponse = {
  name: string;
  description: string;
  url: string;
  offset: number;
  totalCount: number;
  apis: Api[];
};

export type Api = {
  name: string;
  description?: string;
  tags?: string[];
  properties: Property[];
  versions?: string[];
};

export type Property = {
  type: string;
  url?: string;
  value?: string;
};

export type SwaggerHubApiDetailedSearchResponse = {
  name: string;
  description: string;
  url: string;
  offset: number;
  totalCount: number;
  apis: OpenApiDocumentDetail[];
};

export type OpenApiDocumentDetail = {
  url?: string;
  openapi?: string;
  info?: InfoDetail;
  servers?: ServerConfiguration[];
  paths?: string[];
  versions?: string[];
};

type InfoDetail = {
  title: string;
  description: string;
  version: string;
};

type ServerConfiguration = {
  url: string;
  description: string;
};
