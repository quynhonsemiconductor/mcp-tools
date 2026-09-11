import { beforeEach, describe, expect, it } from 'bun:test';
import {
  CreateRelationsParams,
  CreateRelationsSchema,
  CreateRelationsTool,
} from './create-relations-tool';
import { KnowledgeGraphManager } from './manager';

describe('CreateRelationsTool', () => {
  let tool: CreateRelationsTool;

  beforeEach(async () => {
    // Clear the graph before each test
    const manager = KnowledgeGraphManager.getInstance();
    await manager.clearGraph();
    tool = new CreateRelationsTool();
  });

  it('should validate the schema', () => {
    const schemaShape = CreateRelationsSchema.shape;
    expect(Object.keys(schemaShape)).toContain('relations');
  });

  describe('Schema Validation', () => {
    it('should validate correct relation structure', () => {
      const validParams = {
        relations: [
          {
            from: 'entity-1',
            to: 'entity-2',
            relationType: 'related_to',
          },
        ],
      };

      const result = CreateRelationsSchema.safeParse(validParams);
      expect(result.success).toBe(true);
    });
    it('should validate relation without optional fields', () => {
      const validParams = {
        relations: [
          {
            from: 'entity-1',
            to: 'entity-2',
            relationType: 'connected_to',
          },
        ],
      };

      const result = CreateRelationsSchema.safeParse(validParams);
      expect(result.success).toBe(true);
    });

    it('should reject missing required fields', () => {
      const invalidParams = {
        relations: [
          {
            from: 'entity-1',
            // missing to and relationType
          },
        ],
      };

      const result = CreateRelationsSchema.safeParse(invalidParams);
      expect(result.success).toBe(false);
    });
  });

  describe('Tool Execution', () => {
    it('should be defined and instantiable', () => {
      expect(tool).toBeDefined();
      expect(tool.execute).toBeDefined();
    });
    it('should execute successfully with valid params', async () => {
      // First create entities to create relations between
      const manager = KnowledgeGraphManager.getInstance();
      await manager.createEntities([
        { name: 'entity-1', entityType: 'concept', observations: [] },
        { name: 'entity-2', entityType: 'concept', observations: [] },
        { name: 'entity-3', entityType: 'concept', observations: [] },
      ]);

      const params: CreateRelationsParams = {
        relations: [
          {
            from: 'entity-1',
            to: 'entity-2',
            relationType: 'connects_to',
          },
          {
            from: 'entity-2',
            to: 'entity-3',
            relationType: 'leads_to',
          },
        ],
      };

      const result = await tool.execute(params);
      const parsed = JSON.parse(result);
      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed.length).toBe(2);
      expect(parsed[0]).toHaveProperty('from');
      expect(parsed[0]).toHaveProperty('to');
      expect(parsed[0]).toHaveProperty('relationType');
    });
    it('should handle single relation', async () => {
      // First create entities to create relations between
      const manager = KnowledgeGraphManager.getInstance();
      await manager.createEntities([
        { name: 'entity-a', entityType: 'concept', observations: [] },
        { name: 'entity-b', entityType: 'concept', observations: [] },
      ]);

      const params: CreateRelationsParams = {
        relations: [
          {
            from: 'entity-a',
            to: 'entity-b',
            relationType: 'is_related_to',
          },
        ],
      };

      const result = await tool.execute(params);
      const parsed = JSON.parse(result);
      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed.length).toBe(1);
      expect(parsed[0].from).toBe('entity-a');
      expect(parsed[0].to).toBe('entity-b');
    });

    it('should handle errors gracefully', async () => {
      // Mock the manager to throw an error
      const originalCreateRelations = KnowledgeGraphManager.prototype.createRelations;
      KnowledgeGraphManager.prototype.createRelations = async () => {
        throw new Error('Database connection error');
      };

      const params: CreateRelationsParams = {
        relations: [
          {
            from: 'entity-a',
            to: 'entity-b',
            relationType: 'test_relation',
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
      KnowledgeGraphManager.prototype.createRelations = originalCreateRelations;
    });

    it('should handle empty relations array', async () => {
      const params: CreateRelationsParams = {
        relations: [],
      };

      let error: unknown;
      try {
        const result = await tool.execute(params);
        expect(result).toBeDefined();
      } catch (e) {
        error = e;
      }

      // Empty relations array should not cause error
      expect(error).toBeUndefined();
    });
  });
});
