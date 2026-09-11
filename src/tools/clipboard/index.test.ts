import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';

import { setupStandardMocks } from '../../test-utils/mocks';
const { mockExecuteOSAScript } = setupStandardMocks();

// Import the module we're testing
import { ClipboardTool } from './index';

// Now import the mocked modules
import { UserError } from '../../utils';

describe('ClipboardTool', () => {
  let clipboardTool: ClipboardTool;
  let consoleErrorSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    // Create a new instance for each test
    clipboardTool = new ClipboardTool();

    // Clear previous mock calls
    mockExecuteOSAScript.mockClear();

    // Spy on console.error
    consoleErrorSpy = spyOn(console, 'error');
  });

  afterEach(() => {
    // Restore console.error
    consoleErrorSpy.mockRestore();
  });

  describe('execute', () => {
    it('should return text content when clipboard contains text', async () => {
      // Mock clipboard returning plain text
      const testText = 'This is some text from the clipboard';
      mockExecuteOSAScript.mockImplementation(() => testText);

      // Call the function
      const result = await clipboardTool.execute();

      // Verify result
      expect(result).toEqual({
        content: [
          {
            type: 'text',
            text: testText,
          },
        ],
      });

      // Verify the AppleScript was executed
      expect(mockExecuteOSAScript).toHaveBeenCalledWith(expect.stringContaining('clipboard'));
    });

    it('should return PNG image content when clipboard contains PNG data', async () => {
      // Mock clipboard returning PNG data
      const pngHexData = '504E47F123456789ABCDEF'; // Sample hex data
      const pngDataResponse = `«data PNGf${pngHexData}»`;
      mockExecuteOSAScript.mockImplementation(() => pngDataResponse);

      // Mock imageContent returning the expected content
      const mockImageContentResult = {
        type: 'image' as const, // Using const assertion to specify literal type
        mimeType: 'image/png',
        data: Buffer.from(pngHexData, 'hex').toString('base64'),
      };

      // Call the function
      const result = await clipboardTool.execute();

      // Verify result
      expect(result).toEqual({
        content: [mockImageContentResult],
      });
    });

    it('should return binary data content when clipboard contains generic data', async () => {
      // Mock clipboard returning generic binary data
      const binaryHexData = '444154410123456789ABCDEF'; // Sample hex data
      const binaryDataResponse = `«data DATA${binaryHexData}»`;
      mockExecuteOSAScript.mockImplementation(() => binaryDataResponse);

      // Expected base64 representation of the hex data
      const expectedBase64 = Buffer.from(binaryHexData, 'hex').toString('base64');

      // Call the function
      const result = await clipboardTool.execute();

      // Verify result
      expect(result).toEqual({
        content: [
          {
            type: 'image' as const,
            mimeType: 'application/octet-stream',
            data: expectedBase64,
          },
        ],
      });
    });

    it('should handle error when accessing clipboard fails', async () => {
      // Mock executeOSAScript to throw an error
      const errorMessage = 'Failed to execute AppleScript';
      mockExecuteOSAScript.mockImplementation(() => {
        throw new Error(errorMessage);
      });

      // Expect execute to throw a UserError with the right message
      try {
        await clipboardTool.execute();
        // If we get here, the test should fail because no error was thrown
        expect().fail('Expected an error to be thrown but no error was thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(UserError);
      }
    });

    it('should pass the correct AppleScript command', async () => {
      // Mock a simple text response
      mockExecuteOSAScript.mockImplementation(() => 'test');

      // Execute the function
      await clipboardTool.execute();

      // Verify the AppleScript command
      const expectedCommand = expect.stringContaining('if ((clipboard info) as string)');
      expect(mockExecuteOSAScript).toHaveBeenCalledWith(expectedCommand);
    });
  });
});
