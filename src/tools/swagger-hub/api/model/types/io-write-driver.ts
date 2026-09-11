/**
 * Interface for writing documents to the file system.
 * Provides a contract for different file writing implementations.
 */
export interface IoWriteDriver {
  /**
   * Writes document content to the specified destination path.
   *
   * @param directory - The name of the directory where the document should be written.
   * @param fileName
   * @param contents - The document content to write as a string
   * @returns Promise resolving to the number of bytes written
   */
  writeDocument(directory: string, fileName: string, contents: string): Promise<string>;
}
