import { promises as fs } from 'fs';
import * as path from 'path';
import { getKnowledgeGraphPath } from '../../config';

/**
 * Represents an entity in the knowledge graph with observations
 */
export interface Entity {
  name: string;
  entityType: string;
  observations: string[];
}

/**
 * Represents a relation between two entities in the knowledge graph
 */
export interface Relation {
  from: string;
  to: string;
  relationType: string;
}

/**
 * Represents the complete knowledge graph structure
 */
export interface KnowledgeGraph {
  entities: Entity[];
  relations: Relation[];
}

/**
 * Manages the knowledge graph operations including persistence and CRUD operations
 */
export class KnowledgeGraphManager {
  private static instance: KnowledgeGraphManager | null = null;
  private memoryFilePath: string;

  private constructor() {
    // Knowledge graph data will be stored at the configured path
    this.memoryFilePath = getKnowledgeGraphPath();
  }

  /**
   * Get the singleton instance of KnowledgeGraphManager
   */
  public static getInstance(): KnowledgeGraphManager {
    if (!KnowledgeGraphManager.instance) {
      KnowledgeGraphManager.instance = new KnowledgeGraphManager();
    }
    return KnowledgeGraphManager.instance;
  }

  /**
   * Reset the singleton instance (for testing purposes)
   */
  public static reset(): void {
    KnowledgeGraphManager.instance = null;
  }
  /**
   * Load the knowledge graph from the persistent storage
   */
  private async loadGraph(): Promise<KnowledgeGraph> {
    try {
      const data = await fs.readFile(this.memoryFilePath, 'utf-8');
      const lines = data.split('\n').filter((line) => line.trim() !== '');
      return lines.reduce(
        (graph: KnowledgeGraph, line) => {
          const item = JSON.parse(line) as { type: string; [key: string]: unknown };
          if (item.type === 'entity') {
            graph.entities.push({
              name: item.name as string,
              entityType: item.entityType as string,
              observations: item.observations as string[],
            });
          }
          if (item.type === 'relation') {
            graph.relations.push({
              from: item.from as string,
              to: item.to as string,
              relationType: item.relationType as string,
            });
          }
          return graph;
        },
        { entities: [], relations: [] },
      );
    } catch (error) {
      if (
        error instanceof Error &&
        'code' in error &&
        (error as NodeJS.ErrnoException).code === 'ENOENT'
      ) {
        return { entities: [], relations: [] };
      }
      throw error;
    }
  }

  /**
   * Save the knowledge graph to persistent storage
   */
  private async saveGraph(graph: KnowledgeGraph): Promise<void> {
    // Ensure directory exists
    const dir = path.dirname(this.memoryFilePath);
    await fs.mkdir(dir, { recursive: true });

    const lines = [
      ...graph.entities.map((e) => JSON.stringify({ type: 'entity', ...e })),
      ...graph.relations.map((r) => JSON.stringify({ type: 'relation', ...r })),
    ];
    await fs.writeFile(this.memoryFilePath, lines.join('\n'));
  }

  /**
   * Create new entities in the knowledge graph
   */
  async createEntities(entities: Entity[]): Promise<Entity[]> {
    const graph = await this.loadGraph();
    const newEntities = entities.filter(
      (e) => !graph.entities.some((existingEntity) => existingEntity.name === e.name),
    );
    graph.entities.push(...newEntities);
    await this.saveGraph(graph);
    return newEntities;
  }

  /**
   * Create new relations between entities in the knowledge graph
   */
  async createRelations(relations: Relation[]): Promise<Relation[]> {
    const graph = await this.loadGraph();
    const newRelations = relations.filter(
      (r) =>
        !graph.relations.some(
          (existingRelation) =>
            existingRelation.from === r.from &&
            existingRelation.to === r.to &&
            existingRelation.relationType === r.relationType,
        ),
    );
    graph.relations.push(...newRelations);
    await this.saveGraph(graph);
    return newRelations;
  }

  /**
   * Add observations to existing entities in the knowledge graph
   */
  async addObservations(
    observations: { entityName: string; contents: string[] }[],
  ): Promise<{ entityName: string; addedObservations: string[] }[]> {
    const graph = await this.loadGraph();
    const results = observations.map((o) => {
      const entity = graph.entities.find((e) => e.name === o.entityName);
      if (!entity) {
        throw new Error(`Entity with name ${o.entityName} not found`);
      }
      const newObservations = o.contents.filter(
        (content) => !entity.observations.includes(content),
      );
      entity.observations.push(...newObservations);
      return { entityName: o.entityName, addedObservations: newObservations };
    });
    await this.saveGraph(graph);
    return results;
  }

  /**
   * Delete entities and their associated relations from the knowledge graph
   */
  async deleteEntities(entityNames: string[]): Promise<void> {
    const graph = await this.loadGraph();
    graph.entities = graph.entities.filter((e) => !entityNames.includes(e.name));
    graph.relations = graph.relations.filter(
      (r) => !entityNames.includes(r.from) && !entityNames.includes(r.to),
    );
    await this.saveGraph(graph);
  }

  /**
   * Delete specific observations from entities in the knowledge graph
   */
  async deleteObservations(
    deletions: { entityName: string; observations: string[] }[],
  ): Promise<void> {
    const graph = await this.loadGraph();
    deletions.forEach((d) => {
      const entity = graph.entities.find((e) => e.name === d.entityName);
      if (entity) {
        entity.observations = entity.observations.filter((o) => !d.observations.includes(o));
      }
    });
    await this.saveGraph(graph);
  }

  /**
   * Delete relations from the knowledge graph
   */
  async deleteRelations(relations: Relation[]): Promise<void> {
    const graph = await this.loadGraph();
    graph.relations = graph.relations.filter(
      (r) =>
        !relations.some(
          (delRelation) =>
            r.from === delRelation.from &&
            r.to === delRelation.to &&
            r.relationType === delRelation.relationType,
        ),
    );
    await this.saveGraph(graph);
  }

  /**
   * Read the entire knowledge graph
   */
  async readGraph(): Promise<KnowledgeGraph> {
    return this.loadGraph();
  }

  /**
   * Search for nodes in the knowledge graph based on a query
   */
  async searchNodes(query: string): Promise<KnowledgeGraph> {
    const graph = await this.loadGraph();

    // Filter entities
    const filteredEntities = graph.entities.filter(
      (e) =>
        e.name.toLowerCase().includes(query.toLowerCase()) ||
        e.entityType.toLowerCase().includes(query.toLowerCase()) ||
        e.observations.some((o) => o.toLowerCase().includes(query.toLowerCase())),
    );

    // Create a Set of filtered entity names for quick lookup
    const filteredEntityNames = new Set(filteredEntities.map((e) => e.name));

    // Filter relations to only include those between filtered entities
    const filteredRelations = graph.relations.filter(
      (r) => filteredEntityNames.has(r.from) && filteredEntityNames.has(r.to),
    );

    const filteredGraph: KnowledgeGraph = {
      entities: filteredEntities,
      relations: filteredRelations,
    };

    return filteredGraph;
  }

  /**
   * Open specific nodes in the knowledge graph by their names
   */
  async openNodes(names: string[]): Promise<KnowledgeGraph> {
    const graph = await this.loadGraph();

    // Filter entities
    const filteredEntities = graph.entities.filter((e) => names.includes(e.name));

    // Create a Set of filtered entity names for quick lookup
    const filteredEntityNames = new Set(filteredEntities.map((e) => e.name));

    // Filter relations to only include those between filtered entities
    const filteredRelations = graph.relations.filter(
      (r) => filteredEntityNames.has(r.from) && filteredEntityNames.has(r.to),
    );

    const filteredGraph: KnowledgeGraph = {
      entities: filteredEntities,
      relations: filteredRelations,
    };

    return filteredGraph;
  }

  /**
   * Clear all data from the knowledge graph (for testing)
   */
  async clearGraph(): Promise<void> {
    const emptyGraph = { entities: [], relations: [] };
    await this.saveGraph(emptyGraph);
  }
}

// Export singleton instance
export const knowledgeGraphManager = KnowledgeGraphManager.getInstance();
