import { describe, expect, it } from 'bun:test';
import { createSuggestionMessage, findClosestMatch } from './string-similarity';

describe('findClosestMatch', () => {
  const mcpCandidates = ['figma-dev', 'aws-knowledge-mcp-server', 'sharepoint'];

  it('returns null for empty candidates', () => {
    expect(findClosestMatch('figma', [])).toBeNull();
  });

  it('finds close match with isGoodMatch true', () => {
    const result = findClosestMatch('figma', mcpCandidates);
    expect(result).not.toBeNull();
    expect(result!.match).toBe('figma-dev');
    expect(result!.isGoodMatch).toBe(true);
  });

  it('returns best match even when not good enough', () => {
    const result = findClosestMatch('xyz', mcpCandidates);
    expect(result).not.toBeNull();
    expect(result!.isGoodMatch).toBe(false);
  });

  it('respects custom threshold', () => {
    const highThreshold = findClosestMatch('figma', mcpCandidates, 0.9);
    expect(highThreshold!.isGoodMatch).toBe(false);

    const lowThreshold = findClosestMatch('figma', mcpCandidates, 0.3);
    expect(lowThreshold!.isGoodMatch).toBe(true);
  });

  it('handles exact matches', () => {
    const result = findClosestMatch('aws-knowledge-mcp-server', mcpCandidates);
    expect(result!.match).toBe('aws-knowledge-mcp-server');
    expect(result!.similarity).toBe(1);
    expect(result!.isGoodMatch).toBe(true);
  });

  it('handles common typos', () => {
    // Transposed letters
    expect(findClosestMatch('fimga-dev', mcpCandidates)!.match).toBe('figma-dev');

    // Missing letters
    expect(findClosestMatch('aws-knowlege-mcp-server', mcpCandidates)!.match).toBe(
      'aws-knowledge-mcp-server',
    );

    // Extra letters
    expect(findClosestMatch('sharepointt', mcpCandidates)!.match).toBe('sharepoint');
  });
});

describe('createSuggestionMessage', () => {
  const validValues = ['figma-dev', 'aws-knowledge-mcp-server', 'sharepoint'];

  it('appends suggestion when good match exists', () => {
    const result = createSuggestionMessage('Unknown MCP: "figma"', 'figma', validValues);
    expect(result).toBe('Unknown MCP: "figma"\n  Did you mean "figma-dev"?');
  });

  it('returns original message when no good match exists', () => {
    const result = createSuggestionMessage('Unknown MCP: "xyz"', 'xyz', validValues);
    expect(result).toBe('Unknown MCP: "xyz"');
  });

  it('returns original message for empty candidates', () => {
    const result = createSuggestionMessage('Unknown tool: "test"', 'test', []);
    expect(result).toBe('Unknown tool: "test"');
  });

  it('respects custom threshold', () => {
    // With high threshold, "figma" won't match "figma-dev" well enough
    const highThreshold = createSuggestionMessage('Unknown: "figma"', 'figma', validValues, 0.9);
    expect(highThreshold).toBe('Unknown: "figma"');

    // With low threshold, it will suggest
    const lowThreshold = createSuggestionMessage('Unknown: "figma"', 'figma', validValues, 0.3);
    expect(lowThreshold).toContain('Did you mean');
  });

  it('does not suggest exact matches', () => {
    // If the user typed exactly what exists, don't suggest it back to them
    const result = createSuggestionMessage(
      'Unknown: "aws-knowledge-mcp-server"',
      'aws-knowledge-mcp-server',
      validValues,
    );
    expect(result).toBe('Unknown: "aws-knowledge-mcp-server"');
  });

  it('does not suggest case-insensitive exact matches', () => {
    // Case variations should also not trigger suggestions
    const result = createSuggestionMessage('Unknown: "SHAREPOINT"', 'SHAREPOINT', validValues);
    expect(result).toBe('Unknown: "SHAREPOINT"');
  });

  it('handles common typos', () => {
    const result = createSuggestionMessage(
      'Unknown: "sharepointt"',
      'sharepointt',
      validValues,
    );
    expect(result).toContain('Did you mean "sharepoint"?');
  });
});
