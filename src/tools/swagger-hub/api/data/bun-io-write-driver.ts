import type { IoWriteDriver } from '../model/types/io-write-driver.ts';
import * as path from 'path';
import * as fs from 'fs';

/**
 * Bun-based implementation of the IoWriteDriver interface.
 * Uses Bun's native file writing capabilities for efficient document storage.
 */
export class BunIoWriteDriver implements IoWriteDriver {
  /**
   * Writes document content to the specified destination using Bun's file writer.
   *
   * @param directory - The full file path where the document should be written
   * @param fileName
   * @param contents - The document content to write as a string
   * @returns Promise resolving to the file location.
   */
  async writeDocument(directory: string, fileName: string, contents: string): Promise<string> {
    // Ensure the directory exists, create if it doesn't
    if (!fs.existsSync(directory)) {
      fs.mkdirSync(directory, { recursive: true });
    }
    const fullPath = path.join(directory, fileName);
    await Bun.write(fullPath, contents);
    return fullPath;
  }
}
