import path from 'path';
import { LocalIndex } from 'vectra';
import { QNSC_MCP_DIR } from '../../config';
import env from '../../env';
import { UserError } from '../../utils';
import { logDebug, logError } from '../logger';

// Define the database file path
const DB_PATH = path.join(QNSC_MCP_DIR, 'vectra.db');

export interface SearchResult {
  score: number;
  text: string;
  id: string;
}

class VectorDBService {
  private index: LocalIndex;
  private isIndexCreated: boolean = false;

  constructor() {
    this.index = new LocalIndex(DB_PATH);
  }

  private async ensureIndex(): Promise<void> {
    if (!this.isIndexCreated) {
      if (!(await this.index.isIndexCreated())) {
        await this.index.createIndex();
      }
      this.isIndexCreated = true;
    }
  }

  async getIndex(): Promise<LocalIndex> {
    await this.ensureIndex();

    return this.index;
  }

  private async getVectors(text: string): Promise<number[]> {
    // TODO: call api to get vectors for the text
    logDebug(`generating vectors for text: ${text}`);

    if (!env.QNSC_MCP_API_KEY) {
      throw new UserError('QNSC_MCP_API_KEY is not set in the environment variables');
    }

    if (!env.QNSC_MCP_API_BASE_URL) {
      throw new UserError('QNSC_MCP_API_BASE_URL is not set in the environment variables');
    }

    const url = `${env.QNSC_MCP_API_BASE_URL}/mcp/embeddings`;
    logDebug(`Fetching vectors from: ${url}}`);

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'X-Api-Key': env.QNSC_MCP_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ text }),
      redirect: 'follow',
    });

    if (!response.ok) {
      throw new UserError(`Failed to get vectors: ${response.statusText}`);
    }

    const data: unknown = await response.json();
    if (
      typeof data !== 'object' ||
      data === null ||
      !('embeddings' in data) ||
      !Array.isArray((data as { embeddings: unknown }).embeddings)
    ) {
      throw new UserError('Invalid response format from vector API');
    }

    return (data as { embeddings: number[] }).embeddings;
  }

  async addDocument(text: string): Promise<string> {
    logDebug(`adding document to vector db`);

    await this.ensureIndex();

    let vector;

    try {
      vector = await this.getVectors(text);
    } catch (error) {
      logError(`Error generating vectors: ${String(error)}`);
      throw new UserError(`Failed to generate vectors for the memory. Please try again.`);
    }

    const memory = await this.index.insertItem({
      vector,
      metadata: { text, date: new Date().toISOString() },
    });

    return memory.id;
  }

  async updateDocument(id: string, text: string): Promise<void> {
    logDebug(`updating document with id: ${id} in vector db`);

    await this.ensureIndex();

    const existingItem = await this.index.getItem(id);
    if (!existingItem) {
      throw new UserError(`Memory with id ${id} does not exist`);
    }

    await this.removeDocument(id);

    const vectors = await this.getVectors(text);
    await this.index.insertItem({
      vector: vectors,
      metadata: { text, date: new Date().toISOString() },
    });
  }

  async removeDocument(id: string): Promise<void> {
    logDebug(`removing document with id: ${id} from vector db`);

    await this.ensureIndex();
    await this.index.deleteItem(id);
  }

  async search(query: string, limit: number = 3): Promise<SearchResult[]> {
    logDebug(`searching vector db for query: ${query}`);

    await this.ensureIndex();

    const vectors = await this.getVectors(query);
    const results = await this.index.queryItems(vectors, query, limit);

    if (results.length > 0) {
      return results.map((result) => ({
        score: result.score,
        text: String(result.item.metadata.text),
        id: result.item.id,
      }));
    } else {
      return [];
    }
  }

  async reset(): Promise<void> {
    logDebug(`resetting vector db`);
    await this.index.deleteIndex();
    this.isIndexCreated = false;
  }
}

const vectorDBService = new VectorDBService();
export default vectorDBService;
