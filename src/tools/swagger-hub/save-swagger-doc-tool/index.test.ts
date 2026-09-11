import { beforeEach, describe, expect, it, mock, spyOn } from 'bun:test';
import { MockOpenApiClient } from '../api/data/mocks/mock-swagger-hub-client.ts';
import { MockIoWriteDriver } from '../api/data/mocks/mock-io-writer-driver.ts';
import type { SaveSwaggerDocTool, SaveSwaggerDocToolParams } from './index.ts';

const mockClient = new MockOpenApiClient();
const mockWriter = new MockIoWriteDriver();
// mock.module's factory here is synchronous, so the returned Promise|void is never pending; fire-and-forget by design
void mock.module('../api', () => ({
  ProvideOpenApiClient: () => mockClient,
  ProvideIoWriteDriver: () => mockWriter,
}));
describe('SaveSwaggerDocTool', () => {
  let mockClient: MockOpenApiClient;
  let mockWriter: MockIoWriteDriver;
  let getDocumentDetailSpy: ReturnType<typeof spyOn>;
  let getWriterDetailSpy: ReturnType<typeof spyOn>;
  let tool: SaveSwaggerDocTool;

  beforeEach(async () => {
    // Create fresh mock instances for each test
    mockClient = new MockOpenApiClient();
    mockWriter = new MockIoWriteDriver();

    // Set up spy on the getDocumentDetail method
    getDocumentDetailSpy = spyOn(mockClient, 'getDocumentDetail');
    getWriterDetailSpy = spyOn(mockWriter, 'writeDocument');

    // Mock the module import to return our mock instances
    // mock.module's factory here is synchronous, so the returned Promise|void is never pending; fire-and-forget by design
    void mock.module('../api', () => ({
      ProvideOpenApiClient: () => mockClient,
      ProvideIoWriteDriver: () => mockWriter,
    }));

    // Import the tool after mocking: require() (not a static import) so this
    // module loads fresh with the mock.module('../api', ...) above already in
    // effect, matching the lazy-load-after-mock pattern used elsewhere (see
    // github/base-tool.ts's getOctokitClass())
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- lazy-load after mock.module so the mocked ../api dependency is picked up
    const { SaveSwaggerDocTool } = require('./index.ts');

    // Create tool instance with our mocks directly
    tool = new SaveSwaggerDocTool(mockClient, mockWriter);
  });

  it('should have the correct parameters schema', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- lazy-load after mock.module so the mocked ../api dependency is picked up
    const { SaveSwaggerDocToolSchema } = require('./index.ts');
    expect(SaveSwaggerDocToolSchema).toBeDefined();

    const schemaShape = SaveSwaggerDocToolSchema.shape;
    expect(Object.keys(schemaShape)).toContain('url');
    expect(Object.keys(schemaShape)).toContain('docType');
    expect(Object.keys(schemaShape)).toContain('destination');
  });

  it('should correctly call the client with the provided parameters and save document', async () => {
    const params: SaveSwaggerDocToolParams = {
      url: 'https://api.swagger.io/v1/apis/test/versions/1.0.0',
      docType: 'json',
      destination: 'api_definitions',
    };
    const result = await tool.execute(params);
    expect(getDocumentDetailSpy).toHaveBeenCalledTimes(1);
    expect(getDocumentDetailSpy).toHaveBeenCalledWith(params.url, params.docType);
    expect(getWriterDetailSpy).toBeCalledTimes(1);
    expect(getWriterDetailSpy).toHaveBeenCalledWith(
      'api_definitions',
      'Test API-1.0.0.json',
      expect.any(String),
    );
    expect(result).toContain('Document saved successfully at');
    expect(result).toContain('api_definitions');
  });

  it('should handle yaml document type correctly', async () => {
    const params: SaveSwaggerDocToolParams = {
      url: 'https://api.swagger.io/v1/apis/test/versions/1.0.0',
      docType: 'yaml',
      destination: 'api_definitions',
    };
    const result = await tool.execute(params);
    expect(getDocumentDetailSpy).toHaveBeenCalledTimes(1);
    expect(getDocumentDetailSpy).toHaveBeenCalledWith(params.url, params.docType);
    expect(getWriterDetailSpy).toBeCalledTimes(1);
    expect(getWriterDetailSpy).toHaveBeenCalledWith(
      'api_definitions',
      'Test API-1.0.0.yaml',
      expect.any(String),
    );
    expect(result).toContain('Document saved successfully at');
  });

  it('should handle API client errors gracefully', async () => {
    // Set up the spy to throw an error
    getDocumentDetailSpy.mockRejectedValue(new Error('API connection failed'));

    const params: SaveSwaggerDocToolParams = {
      url: 'https://api.swagger.io/v1/apis/test/versions/1.0.0',
      docType: 'json',
      destination: 'api_definitions',
    };

    expect(tool.execute(params)).rejects.toThrow('API connection failed');
    expect(getDocumentDetailSpy).toHaveBeenCalledTimes(1);
  });

  it('should handle file write errors gracefully', async () => {
    // Set up the writer to throw an error
    getWriterDetailSpy.mockRejectedValue(new Error('Permission denied: Cannot write to file'));

    const params: SaveSwaggerDocToolParams = {
      url: 'https://api.swagger.io/v1/apis/test/versions/1.0.0',
      docType: 'json',
      destination: 'api_definitions',
    };

    expect(tool.execute(params)).rejects.toThrow('Permission denied: Cannot write to file');
    expect(getDocumentDetailSpy).toHaveBeenCalledTimes(1);
    expect(getWriterDetailSpy).toHaveBeenCalledTimes(1);
  });
});
