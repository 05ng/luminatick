import { describe, it, expect, vi, beforeEach } from 'vitest';
import { VectorService, VectorMetadata } from '../vector.service';
import { Env } from '../../bindings';

describe('VectorService', () => {
  let vectorService: VectorService;
  let mockEnv: Env;

  beforeEach(() => {
    mockEnv = {
      VECTOR_INDEX: {
        upsert: vi.fn(),
        query: vi.fn(),
        deleteByIds: vi.fn(),
      },
    } as any;
    vectorService = new VectorService(mockEnv);
  });

  describe('upsert', () => {
    it('should upsert single vector with metadata', async () => {
      const metadata: VectorMetadata = {
        id: '123',
        source_id: 'src-123',
        type: 'document',
        text: 'Sample text',
      };
      const vector = [0.1, 0.2];

      await vectorService.upsert('123', vector, metadata);

      expect(mockEnv.VECTOR_INDEX.upsert).toHaveBeenCalledWith([
        {
          id: '123',
          values: vector,
          metadata,
        },
      ]);
    });

    it('should throw error if upsert fails', async () => {
      (mockEnv.VECTOR_INDEX.upsert as any).mockRejectedValue(new Error('Upsert Failed'));

      await expect(vectorService.upsert('123', [0.1], {} as any)).rejects.toThrow('Failed to update vector index');
    });
  });

  describe('search', () => {
    it('should search for nearest vectors and return metadata', async () => {
      const mockMatches = {
        matches: [
          { score: 0.8, metadata: { id: 'm1', text: 'match 1' } },
          { score: 0.75, metadata: { id: 'm2', text: 'match 2' } },
        ],
      };
      (mockEnv.VECTOR_INDEX.query as any).mockResolvedValue(mockMatches);

      const result = await vectorService.search([0.1, 0.2]);

      expect(mockEnv.VECTOR_INDEX.query).toHaveBeenCalledWith([0.1, 0.2], {
        topK: 5,
        returnMetadata: true,
      });
      expect(result).toHaveLength(2);
      expect(result[0].text).toBe('match 1');
    });

    it('should pass filter to VECTOR_INDEX.query when provided', async () => {
      (mockEnv.VECTOR_INDEX.query as any).mockResolvedValue({ matches: [] });

      await vectorService.search([0.1, 0.2], 5, { category_id: 'cat-123' });

      expect(mockEnv.VECTOR_INDEX.query).toHaveBeenCalledWith([0.1, 0.2], {
        topK: 5,
        filter: { category_id: 'cat-123' },
        returnMetadata: true,
      });
    });

    it('should return empty array if no matches', async () => {
      (mockEnv.VECTOR_INDEX.query as any).mockResolvedValue({ matches: [] });

      const result = await vectorService.search([0.1, 0.2]);

      expect(result).toEqual([]);
    });

    it('should return empty array on error', async () => {
      (mockEnv.VECTOR_INDEX.query as any).mockRejectedValue(new Error('Search Failed'));

      const result = await vectorService.search([0.1, 0.2]);

      expect(result).toEqual([]);
    });
  });

  describe('delete', () => {
    it('should delete vectors by ids', async () => {
      await vectorService.delete(['id1', 'id2']);

      expect(mockEnv.VECTOR_INDEX.deleteByIds).toHaveBeenCalledWith(['id1', 'id2']);
    });

    it('should not call deleteByIds if ids array is empty', async () => {
      await vectorService.delete([]);

      expect(mockEnv.VECTOR_INDEX.deleteByIds).not.toHaveBeenCalled();
    });

    it('should throw error if delete fails', async () => {
      (mockEnv.VECTOR_INDEX.deleteByIds as any).mockRejectedValue(new Error('Delete Failed'));

      await expect(vectorService.delete(['id1'])).rejects.toThrow('Failed to delete from vector index');
    });
  });
});
