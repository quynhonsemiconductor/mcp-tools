import { z } from 'zod';
import { Tool, ToolHandler } from '../../../registry/index.ts';
import { ProvideOpenApiClient } from '../api/index.ts';
import { CatchErrors } from '../../../utils/index.ts';
import type { IOpenApiClient } from '../api/model/types/i-open-api-client.ts';
import type { IoWriteDriver } from '../api/model/types/io-write-driver.ts';
import { ProvideIoWriteDriver } from '../api/provideIoWriteDriver.ts';
import * as yaml from 'js-yaml';
import path from 'path';
import os from 'os';

const DEFAULT_DIRECTORY_PATH = path.resolve(os.homedir());

export const SaveSwaggerDocToolSchema = z.object({
  url: z.string().describe('The address of the document'),
  docType: z
    .string()
    .optional()
    .default('json')
    .describe('Document type. Can be .json or .yaml, defaults to .json.'),
  destination: z
    .string()
    .optional()
    .default(`${DEFAULT_DIRECTORY_PATH}/api_definitions`)
    .describe(
      'The name of the directory in which to save an api definition. ' +
        'Defaults the users home directory in a folder called api_definitions.' +
        'Be prepared to copy or move the saved contents to a user specified location.',
    ),
});

export type SaveSwaggerDocToolParams = z.input<typeof SaveSwaggerDocToolSchema>;

/**
 * MCP tool for downloading and saving OpenAPI documents from SwaggerHub to local files.
 * Retrieves API specifications from SwaggerHub URLs and saves them to the local filesystem
 * with support for both JSON and YAML formats.
 */
@Tool({
  id: 'save-swagger-document-tool',
  name: 'saveSwaggerHubDocument',
  description:
    'A tool to save an openapi definition.' +
    'This should be ideally used in conjunction with search results from swagger hub.' +
    'When the definition is found, unless told otherwise, place the definition in a folder called api_definitions. The name should be the apis name.' +
    'Dont forget about the chosen file extension when saving.',
  category: 'Swagger',
  parameters: SaveSwaggerDocToolSchema,
  envVars: ['SWAGGER_HUB_API_KEY'],
  version: '1.0.0',
  includeByDefault: true,
  annotations: {
    title: 'Save openapi documents to local files.',
    readOnlyHint: true,
    openWorldHint: false,
  },
})
export class SaveSwaggerDocTool implements ToolHandler {
  client: IOpenApiClient;
  writer: IoWriteDriver;

  /**
   * Creates a new SaveSwaggerDocTool instance.
   * Initializes with the provided OpenAPI client and file writer or creates default ones.
   *
   * @param client - Optional OpenAPI client instance, defaults to ProvideOpenApiClient()
   * @param writer - Optional file writer instance, defaults to ProvideIoWriteDriver()
   */
  constructor(
    client: IOpenApiClient = ProvideOpenApiClient(),
    writer: IoWriteDriver = ProvideIoWriteDriver(),
  ) {
    this.client = client;
    this.writer = writer;
  }

  /**
   * Executes the SwaggerHub document download and save operation.
   * Retrieves an OpenAPI document from the specified SwaggerHub URL and saves it
   * to the local filesystem at the specified destination path.
   *
   * @param params - Save parameters including SwaggerHub URL, document format, and destination path
   * @returns Success message confirming the document was saved with the file path
   * @throws Error when download fails due to invalid URL, authentication issues, or file system problems
   */
  @CatchErrors()
  async execute(params: SaveSwaggerDocToolParams): Promise<string> {
    const docType = params.docType ?? 'json';
    const document = await this.client.getDocumentDetail(params.url, docType);
    const path = await this.writer.writeDocument(
      params.destination ?? DEFAULT_DIRECTORY_PATH,
      `${document.info?.title ?? 'openapi'}-${document.info?.version ?? 'v1'}` + `.${docType}`,
      docType === 'json' ? JSON.stringify(document) : yaml.dump(document),
    );
    return `Document saved successfully at ${path}!`;
  }
}
