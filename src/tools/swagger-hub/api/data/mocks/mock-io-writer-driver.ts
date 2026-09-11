import type { IoWriteDriver } from '../../model/types/io-write-driver.ts';
import * as path from 'path';

/**
 * Mock implementation of IoWriteDriver for testing purposes.
 * Provides a stubbed file writing capability without actually writing to the filesystem.
 * Used in unit tests to verify file writing logic without creating actual files.
 */
export class MockIoWriteDriver implements IoWriteDriver {
  async writeDocument(directory: string, fileName: string, contents: string): Promise<string> {
    return path.join(directory, fileName);
  }
}
