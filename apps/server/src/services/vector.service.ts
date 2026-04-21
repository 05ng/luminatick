import { Env } from '../bindings';

export interface VectorMetadata extends Record<string, any> {
  source_id: string;
  type: 'document' | 'qa';
  text: string;
  category_id?: string;
}

export class VectorService {
  constructor(private env: Env) {}

  async upsert(id: string, vector: number[], metadata: VectorMetadata): Promise<void> {
    try {
      const { text, ...safeMetadata } = metadata;
      console.log(`[VectorService] Upserting vector [${id}] of length ${vector?.length} with metadata:`, JSON.stringify(safeMetadata));
      if (!vector || vector.length === 0) {
        throw new Error('Vector is empty or undefined');
      }
      
      await this.env.VECTOR_INDEX.upsert([
        {
          id,
          values: vector,
          metadata,
        },
      ]);
    } catch (error: any) {
      console.error(`Vectorize Upsert Error [${id}]:`, error?.message || error);
      console.error('Error details:', error);
      throw new Error(`Failed to update vector index: ${error?.message || 'Unknown error'}`);
    }
  }

  async getByIds(ids: string[]) {
    try {
      if (ids.length === 0) return [];
      return await this.env.VECTOR_INDEX.getByIds(ids);
    } catch (error) {
      console.error('Vectorize GetByIds Error:', error);
      return [];
    }
  }

  async upsertMany(vectors: any[]): Promise<void> {
    try {
      if (vectors.length === 0) return;
      await this.env.VECTOR_INDEX.upsert(vectors);
    } catch (error) {
      console.error('Vectorize UpsertMany Error:', error);
      throw new Error('Failed to update vector index with multiple vectors');
    }
  }

  async search(vector: number[], topK: number = 5, filter?: Record<string, any>): Promise<VectorMetadata[]> {
    try {
      const results = await this.env.VECTOR_INDEX.query(vector, {
        topK,
        filter,
        returnMetadata: true,
      });

      if (!results.matches) return [];

      return results.matches
        .filter((m) => m.score !== undefined && m.score >= 0.7)
        .map((m) => m.metadata as unknown as VectorMetadata);
    } catch (error) {
      console.error('Vectorize Search Error:', error);
      return [];
    }
  }

  async delete(ids: string[]): Promise<void> {
    try {
      if (ids.length === 0) return;
      await this.env.VECTOR_INDEX.deleteByIds(ids);
    } catch (error) {
      console.error('Vectorize Delete Error:', error);
      throw new Error('Failed to delete from vector index');
    }
  }
}
