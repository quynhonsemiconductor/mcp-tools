import { z } from 'zod';
import { Tool, ToolHandler } from '../../../registry/index.ts';
import { CatchErrors } from '../../../utils/index.ts';
import type { IClientGenerator } from '../api/model/types/i-client-generator.ts';
import { ProvideClientGenerator } from '../api/provideClientGenerator.ts';
import path from 'path';
import os from 'os';
const DEFAULT_DIRECTORY_PATH = path.resolve(os.homedir());
export const OpenApiClientGeneratorToolSchema = z.object({
  inputSpecFilePath: z
    .string()
    .describe('The path to the OpenAPI specification file to generate client code from'),
  generator: z
    .string()
    .describe(
      'The target language/framework for client generation (e.g., typescript-fetch, java, python, kotlin)',
    ),
  outputDirectory: z
    .string()
    .optional()
    .describe(
      'The directory path where the generated client code will be saved. Defaults to home directory.',
    ),
});

export type OpenApiClientGeneratorToolParams = z.infer<typeof OpenApiClientGeneratorToolSchema>;

/**
 * MCP tool for generating client code from OpenAPI specifications.
 * Uses openapi-generator CLI to create language-specific client libraries
 * from OpenAPI/Swagger definition files.
 */
@Tool({
  id: 'open-api-client-generator-tool',
  name: 'generateOpenApiClient',
  description:
    'A tool to generate client code from OpenAPI specifications. ' +
    'Supports multiple languages and frameworks including TypeScript, Java, Python, Kotlin, and more. ' +
    'Requires openapi-generator CLI to be installed globally.',
  category: 'Swagger',
  parameters: OpenApiClientGeneratorToolSchema,
  version: '1.0.0',
  includeByDefault: true,
  annotations: {
    title: 'Generate client code from OpenAPI specifications.',
    readOnlyHint: false,
    openWorldHint: false,
  },
})
export class OpenApiClientGeneratorTool implements ToolHandler {
  generator: IClientGenerator;

  /**
   * Creates a new OpenApiClientGeneratorTool instance.
   * Initializes with the provided client generator or creates a default one.
   *
   * @param generator - Optional client generator instance, defaults to ProvideClientGenerator()
   */
  constructor(generator: IClientGenerator = ProvideClientGenerator()) {
    this.generator = generator;
  }

  /**
   * Executes the OpenAPI client generation process.
   * Spawns the openapi-generator CLI to create client code in the specified
   * language/framework from the provided OpenAPI specification file.
   *
   * @param params - Generation parameters including input spec path, target generator, and output directory
   * @returns Success message with the generation output and destination path
   * @throws Error when generation fails due to invalid spec file, unsupported generator, or CLI execution issues
   */
  @CatchErrors()
  async execute(params: OpenApiClientGeneratorToolParams): Promise<string> {
    const outputDirectory = params.outputDirectory ?? DEFAULT_DIRECTORY_PATH;
    const output = await this.generator.create(
      params.inputSpecFilePath,
      params.generator,
      outputDirectory,
    );
    return `Client code generated successfully!\nOutput: ${output}\nSaved to: ${outputDirectory}`;
  }
}
