import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ApiKeyService } from '../apiKey.service';

describe('ApiKeyService', () => {
  let env: any;
  let service: ApiKeyService;
  let mockDb: any;

  beforeEach(() => {
    mockDb = {
      prepare: vi.fn().mockReturnThis(),
      bind: vi.fn().mockReturnThis(),
      all: vi.fn(),
      first: vi.fn(),
      run: vi.fn(),
    };
    env = { DB: mockDb };
    service = new ApiKeyService(env);
    
    // Polyfill for crypto in Node environment for Vitest
    if (typeof global.crypto === 'undefined') {
        const { webcrypto } = require('crypto');
        (global as any).crypto = webcrypto;
    }
  });

  describe('createKey', () => {
    it('should create a new API key and return its components', async () => {
      mockDb.run.mockResolvedValue({ success: true });
      
      const name = "Test Key";
      const result = await service.createKey(name);

      expect(result.name).toBe(name);
      expect(result.apiKey).toMatch(/^lt_[a-zA-Z0-9]{8}\.[a-zA-Z0-9]{32}$/);
      expect(result.prefix).toHaveLength(8);
      expect(result.keyHash).toBeDefined();
      expect(mockDb.prepare).toHaveBeenCalledWith(expect.stringContaining("INSERT INTO api_keys"));
      expect(mockDb.bind).toHaveBeenCalledWith(
        expect.any(String), // id
        name,
        result.keyHash,
        result.prefix,
        expect.any(String) // now
      );
    });
  });

  describe('validateKey', () => {
    it('should return true for a valid and active key', async () => {
      const apiKey = "lt_abcdefgh.12345678901234567890123456789012";
      mockDb.first.mockResolvedValue({ id: "key-123" });
      mockDb.run.mockResolvedValue({ success: true });

      const isValid = await service.validateKey(apiKey);

      expect(isValid).toBe(true);
      expect(mockDb.prepare).toHaveBeenCalledWith(expect.stringContaining("SELECT id FROM api_keys"));
      expect(mockDb.prepare).toHaveBeenCalledWith(expect.stringContaining("UPDATE api_keys SET last_used_at"));
    });

    it('should return false for an invalid key prefix', async () => {
      const apiKey = "invalid_prefix_abcdefgh.12345678901234567890123456789012";
      const isValid = await service.validateKey(apiKey);
      expect(isValid).toBe(false);
      expect(mockDb.prepare).not.toHaveBeenCalled();
    });

    it('should return false if key is not found in DB', async () => {
      const apiKey = "lt_abcdefgh.12345678901234567890123456789012";
      mockDb.first.mockResolvedValue(null);

      const isValid = await service.validateKey(apiKey);
      expect(isValid).toBe(false);
    });
  });

  describe('listKeys', () => {
    it('should list all API keys', async () => {
      const mockKeys = [{ id: '1', name: 'Key 1' }, { id: '2', name: 'Key 2' }];
      mockDb.all.mockResolvedValue({ results: mockKeys });

      const keys = await service.listKeys();

      expect(keys).toEqual(mockKeys);
      expect(mockDb.prepare).toHaveBeenCalledWith(expect.stringContaining("SELECT id, name"));
    });
  });

  describe('revokeKey', () => {
    it('should update is_active to 0', async () => {
      mockDb.run.mockResolvedValue({ success: true });

      await service.revokeKey("key-123");

      expect(mockDb.prepare).toHaveBeenCalledWith(expect.stringContaining("UPDATE api_keys SET is_active = 0"));
      expect(mockDb.bind).toHaveBeenCalledWith("key-123");
    });
  });
});
