import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StorageService } from '../storage.service';

describe('StorageService', () => {
  let storageService: StorageService;
  let mockEnv: any;
  let mockBucket: any;

  beforeEach(() => {
    mockBucket = {
      put: vi.fn(),
      get: vi.fn(),
    };
    mockEnv = {
      ATTACHMENTS_BUCKET: mockBucket,
    };
    storageService = new StorageService(mockEnv);
  });

  describe('uploadAttachment', () => {
    it('should upload an attachment and return the correct key', async () => {
      const ticketId = 'ticket-123';
      const articleId = 'article-456';
      const fileName = 'test.pdf';
      const content = new Uint8Array([1, 2, 3]);
      const contentType = 'application/pdf';

      const expectedKey = `attachments/${ticketId}/${articleId}/${fileName}`;
      mockBucket.put.mockResolvedValue({ key: expectedKey });

      const result = await storageService.uploadAttachment(
        ticketId,
        articleId,
        fileName,
        content,
        contentType
      );

      expect(result).toBe(expectedKey);
      expect(mockBucket.put).toHaveBeenCalledWith(expectedKey, content, {
        httpMetadata: { contentType },
      });
    });
  });

  describe('getAttachment', () => {
    it('should return a Response when the attachment exists', async () => {
      const key = 'attachments/123/456/test.pdf';
      const mockContent = new Uint8Array([1, 2, 3]);
      const mockEtag = 'etag-123';
      
      const mockR2Object = {
        body: new ReadableStream({
          start(controller) {
            controller.enqueue(mockContent);
            controller.close();
          },
        }),
        httpEtag: mockEtag,
        writeHttpMetadata: vi.fn((headers: Headers) => {
          headers.set('content-type', 'application/pdf');
        }),
      };

      mockBucket.get.mockResolvedValue(mockR2Object);

      const response = await storageService.getAttachment(key);

      expect(mockBucket.get).toHaveBeenCalledWith(key);
      expect(response).toBeInstanceOf(Response);
      expect(response!.headers.get('content-type')).toBe('application/pdf');
      expect(response!.headers.get('etag')).toBe(mockEtag);
      
      const responseBody = new Uint8Array(await response!.arrayBuffer());
      expect(responseBody).toEqual(mockContent);
    });

    it('should return null when the attachment does not exist', async () => {
      const key = 'non-existent-key';
      mockBucket.get.mockResolvedValue(null);

      const response = await storageService.getAttachment(key);

      expect(mockBucket.get).toHaveBeenCalledWith(key);
      expect(response).toBeNull();
    });
  });
});
