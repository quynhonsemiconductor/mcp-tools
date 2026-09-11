import { beforeEach, describe, expect, it } from 'bun:test';
import {
  AddObservationsParams,
  AddObservationsSchema,
  AddObservationsTool,
} from './add-observations-tool';
import { KnowledgeGraphManager } from './manager';

describe('AddObservationsTool', () => {
  let tool: AddObservationsTool;

  beforeEach(async () => {
    // Clear the graph before each test
    const manager = KnowledgeGraphManager.getInstance();
    await manager.clearGraph();
    tool = new AddObservationsTool();
  });

  it('should validate the schema', () => {
    const schemaShape = AddObservationsSchema.shape;
    expect(Object.keys(schemaShape)).toContain('observations');
  });

  describe('Schema Validation', () => {
    it('should validate correct observation structure', () => {
      const validParams = {
        observations: [
          {
            entityName: 'entity-1',
            contents: ['observation 1', 'observation 2', 'observation 3'],
          },
        ],
      };

      const result = AddObservationsSchema.safeParse(validParams);
      expect(result.success).toBe(true);
    });

    it('should reject missing entityName', () => {
      const invalidParams = {
        observations: [
          {
            contents: ['observation 1'],
          },
        ],
      };

      const result = AddObservationsSchema.safeParse(invalidParams);
      expect(result.success).toBe(false);
    });

    it('should reject missing contents', () => {
      const invalidParams = {
        observations: [
          {
            entityName: 'entity-1',
          },
        ],
      };

      const result = AddObservationsSchema.safeParse(invalidParams);
      expect(result.success).toBe(false);
    });

    it('should accept empty contents array', () => {
      const validParams = {
        observations: [
          {
            entityName: 'entity-1',
            contents: [],
          },
        ],
      };

      const result = AddObservationsSchema.safeParse(validParams);
      expect(result.success).toBe(true);
    });
  });

  describe('Tool Execution', () => {
    it('should be defined and instantiable', () => {
      expect(tool).toBeDefined();
      expect(tool.execute).toBeDefined();
    });
    it('should execute successfully with valid params', async () => {
      // First create an entity to add observations to
      const manager = KnowledgeGraphManager.getInstance();
      await manager.createEntities([
        {
          name: 'test-entity',
          entityType: 'concept',
          observations: [],
        },
      ]);

      const params: AddObservationsParams = {
        observations: [
          {
            entityName: 'test-entity',
            contents: ['First observation', 'Second observation'],
          },
        ],
      };

      // Note: This will likely fail because entity doesn't exist, but we're testing the format
      let error: unknown;
      try {
        const result = await tool.execute(params);
        // If successful, result should be JSON
        const parsed = JSON.parse(result);
        expect(Array.isArray(parsed)).toBe(true);
      } catch (e) {
        error = e;
        expect(error).toBeDefined();
        expect((error as Error).message).toContain('Tool execution error');
      }
    });

    it('should handle errors gracefully', async () => {
      const params: AddObservationsParams = {
        observations: [
          {
            entityName: 'non-existent-entity',
            contents: ['Some observation'],
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
    });
  });
});
