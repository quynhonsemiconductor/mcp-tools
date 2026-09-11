import { beforeEach, describe, expect, it, mock, spyOn } from 'bun:test';
import { MockClientGenerator } from '../api/data/mocks/mock-client-generator.ts';
import type { OpenApiClientGeneratorToolParams } from './index.ts';
import { OpenApiClientGeneratorTool, OpenApiClientGeneratorToolSchema } from './index.ts';
const mockGenerator = new MockClientGenerator();
// mock.module's factory here is synchronous, so the returned Promise|void is never pending; fire-and-forget by design
void mock.module('../api', () => ({
  ProvideClientGenerator: () => mockGenerator,
}));

describe('OpenApiClientGeneratorTool', () => {
  let mockGenerator: MockClientGenerator;
  let createSpy: ReturnType<typeof spyOn>;
  let tool: OpenApiClientGeneratorTool;

  beforeEach(() => {
    // Create fresh mock instance for each test
    mockGenerator = new MockClientGenerator();

    // Set up spy on the create method
    createSpy = spyOn(mockGenerator, 'create');

    // Create tool instance with our mock directly
    tool = new OpenApiClientGeneratorTool(mockGenerator);
  });

  it('should have the correct parameters schema', () => {
    expect(OpenApiClientGeneratorToolSchema).toBeDefined();

    const schemaShape = OpenApiClientGeneratorToolSchema.shape;
    expect(Object.keys(schemaShape)).toContain('inputSpecFilePath');
    expect(Object.keys(schemaShape)).toContain('generator');
    expect(Object.keys(schemaShape)).toContain('outputDirectory');
  });

  it('should correctly generate TypeScript client code', async () => {
    const params: OpenApiClientGeneratorToolParams = {
      inputSpecFilePath: './api_definitions/Test-API-1.0.0.json',
      generator: 'typescript-fetch',
      outputDirectory: './generated-clients/typescript',
    };
    const result = await tool.execute(params);

    expect(createSpy).toHaveBeenCalledTimes(1);
    expect(createSpy).toHaveBeenCalledWith(
      params.inputSpecFilePath,
      params.generator,
      params.outputDirectory,
    );
    expect(result).toContain('Client code generated successfully!');
    // outputDirectory is optional in the schema but always provided by this test case,
    // so it is known to be defined here.
    expect(result).toContain(params.outputDirectory as string);
  });

  it('should correctly generate Java client code', async () => {
    const params: OpenApiClientGeneratorToolParams = {
      inputSpecFilePath: './api_definitions/Test-API-1.0.0.yaml',
      generator: 'java',
      outputDirectory: './generated-clients/java',
    };
    const result = await tool.execute(params);

    expect(createSpy).toHaveBeenCalledTimes(1);
    expect(createSpy).toHaveBeenCalledWith(
      params.inputSpecFilePath,
      params.generator,
      params.outputDirectory,
    );
    expect(result).toContain('Client code generated successfully!');
    expect(result).toContain('generated-clients/java');
  });

  it('should correctly generate Python client code', async () => {
    const params: OpenApiClientGeneratorToolParams = {
      inputSpecFilePath: './api_definitions/Test-API-1.0.0.json',
      generator: 'python',
      outputDirectory: './generated-clients/python',
    };
    const result = await tool.execute(params);

    expect(createSpy).toHaveBeenCalledTimes(1);
    expect(createSpy).toHaveBeenCalledWith(
      params.inputSpecFilePath,
      params.generator,
      params.outputDirectory,
    );
    expect(result).toContain('Client code generated successfully!');
  });

  it('should correctly generate Kotlin client code', async () => {
    const params: OpenApiClientGeneratorToolParams = {
      inputSpecFilePath: './api_definitions/Test-API-1.0.0.yaml',
      generator: 'kotlin',
      outputDirectory: './generated-clients/kotlin',
    };
    const result = await tool.execute(params);

    expect(createSpy).toHaveBeenCalledTimes(1);
    expect(createSpy).toHaveBeenCalledWith(
      params.inputSpecFilePath,
      params.generator,
      params.outputDirectory,
    );
    expect(result).toContain('Client code generated successfully!');
    expect(result).toContain('kotlin');
  });

  it('should handle client generator errors gracefully', async () => {
    // Set up the spy to throw an error
    createSpy.mockRejectedValue(new Error('Invalid OpenAPI specification'));

    const params: OpenApiClientGeneratorToolParams = {
      inputSpecFilePath: './api_definitions/invalid-spec.json',
      generator: 'typescript-fetch',
      outputDirectory: './generated-clients/typescript',
    };

    expect(tool.execute(params)).rejects.toThrow('Invalid OpenAPI specification');
    expect(createSpy).toHaveBeenCalledTimes(1);
  });

  it('should handle unsupported generator errors gracefully', async () => {
    // Set up the spy to throw an error
    createSpy.mockRejectedValue(new Error('Generator "invalid-generator" not found'));

    const params: OpenApiClientGeneratorToolParams = {
      inputSpecFilePath: './api_definitions/Test-API-1.0.0.json',
      generator: 'invalid-generator',
      outputDirectory: './generated-clients/invalid',
    };

    expect(tool.execute(params)).rejects.toThrow('Generator "invalid-generator" not found');
    expect(createSpy).toHaveBeenCalledTimes(1);
  });

  it('should handle file system errors gracefully', async () => {
    // Set up the spy to throw an error
    createSpy.mockRejectedValue(new Error('Output directory does not exist or is not writable'));

    const params: OpenApiClientGeneratorToolParams = {
      inputSpecFilePath: './api_definitions/Test-API-1.0.0.json',
      generator: 'typescript-fetch',
      outputDirectory: '/invalid/path/to/directory',
    };

    expect(tool.execute(params)).rejects.toThrow(
      'Output directory does not exist or is not writable',
    );
    expect(createSpy).toHaveBeenCalledTimes(1);
  });
});
