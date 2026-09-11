import { BunIoWriteDriver } from './data/bun-io-write-driver.ts';

/**
 * Factory function that provides a configured IoWriteDriver instance.
 * Returns a BunIoWriteDriver for efficient file operations using Bun's native capabilities.
 *
 * @returns A new BunIoWriteDriver instance ready for document writing operations
 */
export const ProvideIoWriteDriver = () => {
  return new BunIoWriteDriver();
};
