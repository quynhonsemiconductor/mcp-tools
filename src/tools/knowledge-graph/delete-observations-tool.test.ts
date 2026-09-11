import { beforeEach, describe, expect, it } from 'bun:test';
import {
  DeleteObservationsParams,
  DeleteObservationsSchema,
  DeleteObservationsTool,
} from './delete-observations-tool';
import { KnowledgeGraphManager } from './manager';

describe('DeleteObservationsTool', () => {
  let tool: DeleteObservationsTool;

  beforeEach(() => {
    tool = new DeleteObservationsTool();
  });
  describe('Schema Validation', () => {
    it('should validate correct structure', () => {
      const validParams = {
        deletions: [
          {
            entityName: 'entity-1',
            observations: ['observation 1', 'observation 2'],
          },
        ],
      };

      const result = DeleteObservationsSchema.safeParse(validParams);
      expect(result.success).toBe(true);
    });

    it('should reject missing deletions', () => {
      const invalidParams = {};

      const result = DeleteObservationsSchema.safeParse(invalidParams);
      expect(result.success).toBe(false);
    });

    it('should reject missing entityName in deletion', () => {
      const invalidParams = {
        deletions: [
          {
            observations: ['observation 1'],
          },
        ],
      };

      const result = DeleteObservationsSchema.safeParse(invalidParams);
      expect(result.success).toBe(false);
    });

    it('should reject missing observations in deletion', () => {
      const invalidParams = {
        deletions: [
          {
            entityName: 'entity-1',
          },
        ],
      };

      const result = DeleteObservationsSchema.safeParse(invalidParams);
      expect(result.success).toBe(false);
    });
  });
  describe('Tool Execution', () => {
    it('should be defined and instantiable', () => {
      expect(tool).toBeDefined();
      expect(tool.execute).toBeDefined();
    });
    it('should return success message with observation count and list', async () => {
      const params: DeleteObservationsParams = {
        deletions: [
          {
            entityName: 'test-entity',
            observations: ['First observation', 'Second observation'],
          },
        ],
      };

      const result = await tool.execute(params);
      expect(result).toContain('Successfully deleted 2 observations from 1 entities');
      expect(result).toContain('test-entity');
    });

    it('should handle single observation deletion', async () => {
      const params: DeleteObservationsParams = {
        deletions: [
          {
            entityName: 'test-entity',
            observations: ['Single observation'],
          },
        ],
      };

      const result = await tool.execute(params);
      expect(result).toContain('Successfully deleted 1 observations from 1 entities');
      expect(result).toContain('test-entity');
    });

    it('should handle multiple entities', async () => {
      const params: DeleteObservationsParams = {
        deletions: [
          {
            entityName: 'entity-1',
            observations: ['Obs 1'],
          },
          {
            entityName: 'entity-2',
            observations: ['Obs 2', 'Obs 3'],
          },
        ],
      };

      const result = await tool.execute(params);
      expect(result).toContain('Successfully deleted 3 observations from 2 entities');
      expect(result).toContain('entity-1, entity-2');
    });

    it('should handle errors gracefully', async () => {
      // Mock the manager to throw an error
      const originalDeleteObservations = KnowledgeGraphManager.prototype.deleteObservations;
      KnowledgeGraphManager.prototype.deleteObservations = async () => {
        throw new Error('File corruption detected');
      };

      const params: DeleteObservationsParams = {
        deletions: [
          {
            entityName: 'test-entity',
            observations: ['test-observation'],
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
      KnowledgeGraphManager.prototype.deleteObservations = originalDeleteObservations;
    });

    it('should handle non-existent entities gracefully', async () => {
      const params: DeleteObservationsParams = {
        deletions: [
          {
            entityName: 'non-existent-entity',
            observations: ['some-observation'],
          },
        ],
      };
      let error: unknown;
      try {
        const result = await tool.execute(params);
        expect(result).toContain(
          'Successfully deleted 1 observations from 1 entities: non-existent-entity',
        );
      } catch (e) {
        error = e;
      }

      // Non-existent entities should be handled gracefully
      expect(error).toBeUndefined();
    });
  });
});
