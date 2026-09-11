import type { IClientGenerator } from '../../model/types/i-client-generator.ts';

/**
 * Mock implementation of IClientGenerator for testing purposes.
 * Provides a stubbed client generation capability without actually running openapi-generator CLI.
 * Used in unit tests to verify client generation logic without spawning child processes.
 */
export class MockClientGenerator implements IClientGenerator {
  async create(
    inputSpecFilePath: string,
    generator: string,
    outputDirectory: string,
  ): Promise<string> {
    return `Generated ${generator} client from ${inputSpecFilePath}`;
  }
}
