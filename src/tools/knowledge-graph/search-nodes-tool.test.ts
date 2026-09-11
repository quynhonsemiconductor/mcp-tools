import { beforeEach, describe, expect, it } from 'bun:test';
import { KnowledgeGraphManager } from './manager';
import { SearchNodesParams, SearchNodesSchema, SearchNodesTool } from './search-nodes-tool';

describe('SearchNodesTool', () => {
  let tool: SearchNodesTool;

  beforeEach(async () => {
    // Clear the graph before each test
    const manager = KnowledgeGraphManager.getInstance();
    await manager.clearGraph();
    tool = new SearchNodesTool();
  });

  it('should validate the schema', () => {
    const schemaShape = SearchNodesSchema.shape;
    expect(Object.keys(schemaShape)).toContain('query');
  });

  describe('Schema Validation', () => {
    it('should validate minimal parameters with defaults', () => {
      const validParams = {
        query: 'test search',
      };

      const result = SearchNodesSchema.safeParse(validParams);
      expect(result.success).toBe(true);
      expect(result.data?.searchIn).toEqual(['name', 'content']);
      expect(result.data?.limit).toBe(10);
      expect(result.data?.exactMatch).toBe(false);
    });

    it('should validate with all parameters', () => {
      const validParams = {
        query: 'test search',
        searchIn: ['name', 'observations'] as const,
        limit: 25,
        exactMatch: true,
      };

      const result = SearchNodesSchema.safeParse(validParams);
      expect(result.success).toBe(true);
    });

    it('should reject missing query', () => {
      const invalidParams = {};

      const result = SearchNodesSchema.safeParse(invalidParams);
      expect(result.success).toBe(false);
    });

    it('should reject invalid searchIn field', () => {
      const invalidParams = {
        query: 'test',
        searchIn: ['invalid_field'],
      };

      const result = SearchNodesSchema.safeParse(invalidParams);
      expect(result.success).toBe(false);
    });

    it('should reject limit out of range', () => {
      const invalidParams = {
        query: 'test',
        limit: 101,
      };

      const result = SearchNodesSchema.safeParse(invalidParams);
      expect(result.success).toBe(false);
    });

    it('should reject zero limit', () => {
      const invalidParams = {
        query: 'test',
        limit: 0,
      };

      const result = SearchNodesSchema.safeParse(invalidParams);
      expect(result.success).toBe(false);
    });
  });

  describe('Tool Execution', () => {
    it('should be defined and instantiable', () => {
      expect(tool).toBeDefined();
      expect(tool.execute).toBeDefined();
    });
    it('should handle basic search with defaults', async () => {
      // Create some test entities to search
      const manager = KnowledgeGraphManager.getInstance();
      await manager.createEntities([
        {
          name: 'test entity',
          entityType: 'concept',
          observations: ['test observation'],
        },
      ]);

      const params: SearchNodesParams = {
        query: 'test',
        searchIn: ['name', 'content'],
        limit: 10,
        exactMatch: false,
      };

      const result = await tool.execute(params);
      const parsed = JSON.parse(result);
      expect(parsed).toHaveProperty('query');
      expect(parsed).toHaveProperty('matches');
      expect(parsed).toHaveProperty('summary');
      expect(parsed.query).toBe('test');
      expect(parsed.matches).toHaveProperty('entities');
      expect(parsed.matches).toHaveProperty('relations');
    });
    it('should handle exact search with custom fields', async () => {
      // Create some test entities to search
      const manager = KnowledgeGraphManager.getInstance();
      await manager.createEntities([
        {
          name: 'exact query',
          entityType: 'concept',
          observations: ['exact observation'],
        },
      ]);

      const params: SearchNodesParams = {
        query: 'exact query',
        searchIn: ['observations', 'type'],
        limit: 5,
        exactMatch: true,
      };

      const result = await tool.execute(params);
      const parsed = JSON.parse(result);
      expect(parsed).toHaveProperty('query');
      expect(parsed).toHaveProperty('matches');
      expect(parsed).toHaveProperty('summary');
      expect(parsed.query).toBe('exact query');
    });

    it('should handle search in all fields', async () => {
      const params: SearchNodesParams = {
        query: 'comprehensive search',
        searchIn: ['name', 'content', 'observations', 'type'],
        limit: 50,
        exactMatch: false,
      };

      const result = await tool.execute(params);
      const parsed = JSON.parse(result);
      expect(parsed).toHaveProperty('query');
      expect(parsed).toHaveProperty('matches');
      expect(parsed).toHaveProperty('summary');
      expect(parsed.query).toBe('comprehensive search');
    });

    it('should handle errors gracefully', async () => {
      // Mock the manager to throw an error
      const originalSearchNodes = KnowledgeGraphManager.prototype.searchNodes;
      KnowledgeGraphManager.prototype.searchNodes = async () => {
        throw new Error('Search index corrupted');
      };

      const params: SearchNodesParams = {
        query: 'test query',
        searchIn: ['name'],
        limit: 10,
        exactMatch: false,
      };

      let error: unknown;
      try {
        await tool.execute(params);
      } catch (e) {
        error = e;
      }

      expect(error).toBeDefined();
      expect((error as Error).message).toContain('Tool execution error');

      // Restore original method
      KnowledgeGraphManager.prototype.searchNodes = originalSearchNodes;
    });

    it('should handle empty query gracefully', async () => {
      const params: SearchNodesParams = {
        query: '',
        searchIn: ['name'],
        limit: 10,
        exactMatch: false,
      };

      let error: unknown;
      try {
        const result = await tool.execute(params);
        const parsed = JSON.parse(result);
        expect(parsed.query).toBe('');
        expect(parsed.matches.entities).toEqual([]);
      } catch (e) {
        error = e;
      }

      // Empty query should be handled gracefully
      expect(error).toBeUndefined();
    });
  });
});
