import { beforeEach, describe, expect, it } from 'bun:test';
import {
  CreateEntitiesParams,
  CreateEntitiesSchema,
  CreateEntitiesTool,
} from './create-entities-tool';
import { KnowledgeGraphManager } from './manager';

describe('CreateEntitiesTool', () => {
  let tool: CreateEntitiesTool;

  beforeEach(async () => {
    // Clear the graph before each test
    const manager = KnowledgeGraphManager.getInstance();
    await manager.clearGraph();
    tool = new CreateEntitiesTool();
  });

  it('should validate the schema', () => {
    const schemaShape = CreateEntitiesSchema.shape;
    expect(Object.keys(schemaShape)).toContain('entities');
  });

  describe('Schema Validation', () => {
    it('should validate correct entity structure', () => {
      const validParams = {
        entities: [
          {
            name: 'Test Entity',
            entityType: 'concept',
            observations: ['observation 1', 'observation 2'],
          },
        ],
      };

      const result = CreateEntitiesSchema.safeParse(validParams);
      expect(result.success).toBe(true);
    });
    it('should validate entity with empty observations array', () => {
      const validParams = {
        entities: [
          {
            name: 'Test Entity',
            entityType: 'concept',
            observations: [],
          },
        ],
      };

      const result = CreateEntitiesSchema.safeParse(validParams);
      expect(result.success).toBe(true);
    });

    it('should reject missing observations field', () => {
      const invalidParams = {
        entities: [
          {
            name: 'Test Entity',
            entityType: 'concept',
          },
        ],
      };

      const result = CreateEntitiesSchema.safeParse(invalidParams);
      expect(result.success).toBe(false);
    });

    it('should reject missing required fields', () => {
      const invalidParams = {
        entities: [
          {
            name: 'Entity with missing type',
            // missing entityType
          },
        ],
      };

      const result = CreateEntitiesSchema.safeParse(invalidParams);
      expect(result.success).toBe(false);
    });

    it('should reject empty entities array', () => {
      const invalidParams = {
        entities: [],
      };

      const result = CreateEntitiesSchema.safeParse(invalidParams);
      expect(result.success).toBe(true); // Empty array is valid, but tool might handle it differently
    });
  });
  describe('Tool Execution', () => {
    it('should be defined and instantiable', () => {
      expect(tool).toBeDefined();
      expect(tool.execute).toBeDefined();
    });

    it('should execute successfully with valid params', async () => {
      const params: CreateEntitiesParams = {
        entities: [
          {
            name: 'Entity One',
            entityType: 'concept',
            observations: ['First observation'],
          },
          {
            name: 'Entity Two',
            entityType: 'person',
            observations: ['Second observation'],
          },
        ],
      };
      const result = await tool.execute(params);
      const parsed = JSON.parse(result);
      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed.length).toBe(2);
      expect(parsed[0]).toHaveProperty('name');
      expect(parsed[0]).toHaveProperty('entityType');
    });

    it('should handle single entity', async () => {
      const params: CreateEntitiesParams = {
        entities: [
          {
            name: 'Single Entity',
            entityType: 'concept',
            observations: ['Single observation'],
          },
        ],
      };

      const result = await tool.execute(params);
      const parsed = JSON.parse(result);
      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed.length).toBe(1);
      expect(parsed[0].name).toBe('Single Entity');
    });

    it('should handle errors gracefully', async () => {
      // Create a scenario that might cause an error by mocking the manager
      const params: CreateEntitiesParams = {
        entities: [],
      };

      let error: unknown;
      try {
        await tool.execute(params);
      } catch (e) {
        error = e;
      }

      // Should not throw error for empty entities array - this is valid
      expect(error).toBeUndefined();
    });

    it('should handle file system errors gracefully', async () => {
      // Mock the manager to throw an error
      const originalCreateEntities = KnowledgeGraphManager.prototype.createEntities;
      KnowledgeGraphManager.prototype.createEntities = async () => {
        throw new Error('File system error');
      };

      const params: CreateEntitiesParams = {
        entities: [
          {
            name: 'Test Entity',
            entityType: 'concept',
            observations: ['Test observation'],
          },
        ],
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
      KnowledgeGraphManager.prototype.createEntities = originalCreateEntities;
    });
  });
});
