import { describe, it, expect, vi, beforeEach } from 'vitest';
import { KnowledgeService } from '../knowledge.service';
import { AiService } from '../ai.service';
import { VectorService } from '../vector.service';
import { Env } from '../../bindings';

vi.mock('../ai.service');
vi.mock('../vector.service');

describe('KnowledgeService', () => {
  let knowledgeService: KnowledgeService;
  let mockEnv: Env;
  let mockAiService: any;
  let mockVectorService: any;

  beforeEach(() => {
    mockEnv = {
      DB: {
        prepare: vi.fn().mockReturnValue({
          bind: vi.fn().mockReturnThis(),
          run: vi.fn().mockResolvedValue({}),
          first: vi.fn().mockResolvedValue({}),
          all: vi.fn().mockResolvedValue({ results: [] }),
        }),
      },
      ATTACHMENTS_BUCKET: {
        put: vi.fn().mockResolvedValue({}),
        get: vi.fn().mockResolvedValue(null),
        delete: vi.fn().mockResolvedValue({}),
      },
      AI: {},
      VECTOR_INDEX: {},
      VECTORIZE_WORKFLOW: {
        create: vi.fn().mockResolvedValue({}),
      },
    } as any;

    knowledgeService = new KnowledgeService(mockEnv);
    mockAiService = (knowledgeService as any).aiService;
    mockVectorService = (knowledgeService as any).vectorService;
  });

  describe('chunkText', () => {
    it('should split text into chunks based on paragraph boundaries', () => {
      const text = 'Paragraph 1.\n\nParagraph 2.\n\nParagraph 3.';
      const chunks = (knowledgeService as any).chunkText(text, 25, 0);
      
      expect(chunks).toHaveLength(3);
      expect(chunks[0]).toBe('Paragraph 1.');
      expect(chunks[1]).toBe('Paragraph 2.');
      expect(chunks[2]).toBe('Paragraph 3.');
    });

    it('should split large paragraphs into sentences', () => {
      const longParagraph = 'This is sentence one. This is sentence two. This is sentence three.';
      const chunks = (knowledgeService as any).chunkText(longParagraph, 30, 0);
      
      expect(chunks.length).toBeGreaterThan(1);
    });
  });

  describe('processAndStoreVectors', () => {
    it('should prepend title to chunk text when title is provided', async () => {
      mockAiService.generateEmbeddings.mockResolvedValue([0.1, 0.2]);
      await knowledgeService.processAndStoreVectors('doc1', 'Content 1', 'document', null, 'My Title');
      
      expect(mockAiService.generateEmbeddings).toHaveBeenCalledWith('Title: My Title\n\nContent 1');
      expect(mockVectorService.upsert).toHaveBeenCalledWith(
        'doc_doc1_0',
        [0.1, 0.2],
        expect.objectContaining({ text: 'Title: My Title\n\nContent 1' })
      );
    });

    it('should not prepend title if not provided', async () => {
      mockAiService.generateEmbeddings.mockResolvedValue([0.1, 0.2]);
      await knowledgeService.processAndStoreVectors('doc1', 'Content 1', 'document');
      
      expect(mockAiService.generateEmbeddings).toHaveBeenCalledWith('Content 1');
      expect(mockVectorService.upsert).toHaveBeenCalledWith(
        'doc_doc1_0',
        [0.1, 0.2],
        expect.objectContaining({ text: 'Content 1' })
      );
    });
  });

  describe('uploadAndProcess', () => {
    it('should store file in R2 and D1, and trigger VECTORIZE_WORKFLOW', async () => {
      const content = new TextEncoder().encode('Sample text content for KB.');

      const docId = await knowledgeService.uploadAndProcess('Test Doc', 'test.txt', content, 'text/plain');

      expect(mockEnv.ATTACHMENTS_BUCKET.put).toHaveBeenCalledWith(
        expect.stringContaining('knowledge/'),
        content,
        expect.any(Object)
      );
      expect(mockEnv.DB.prepare).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO knowledge_docs'));
      expect(mockEnv.VECTORIZE_WORKFLOW.create).toHaveBeenCalledWith({
        id: `create_upload_${docId}`,
        payload: {
          action: 'create',
          documentId: docId
        }
      });
    });

    it('should fail if file is too large', async () => {
      const largeContent = new Uint8Array(11 * 1024 * 1024);
      await expect(knowledgeService.uploadAndProcess('Large', 'file.txt', largeContent, 'text/plain')).rejects.toThrow('File too large');
    });

    it('should mark as unsupported for binary formats in MVP', async () => {
      const content = new Uint8Array([1, 2, 3]);
      await expect(knowledgeService.uploadAndProcess('Binary', 'image.png', content, 'image/png')).rejects.toThrow('Format not supported');
      expect(mockEnv.DB.prepare).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO knowledge_docs'));
    });
  });

  describe('createArticle', () => {
    it('should store in R2 and D1, and trigger VECTORIZE_WORKFLOW', async () => {
      const docId = await knowledgeService.createArticle('Test Title', 'Test Content', 'cat-123');

      expect(mockEnv.ATTACHMENTS_BUCKET.put).toHaveBeenCalledWith(
        expect.stringContaining('knowledge/'),
        'Test Content',
        expect.any(Object)
      );
      expect(mockEnv.DB.prepare).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO knowledge_docs'));
      expect(mockEnv.VECTORIZE_WORKFLOW.create).toHaveBeenCalledWith({
        id: `create_doc_${docId}`,
        payload: {
          action: 'create',
          documentId: docId,
          categoryId: 'cat-123'
        }
      });
    });
  });

  describe('updateArticle', () => {
    it('should update R2 and D1, and trigger VECTORIZE_WORKFLOW', async () => {
      mockEnv.DB.prepare('').first.mockResolvedValue({ file_path: 'knowledge/doc/test.md', chunk_count: 1, category_id: 'cat-123', status: 'active' });
      mockEnv.ATTACHMENTS_BUCKET.get.mockResolvedValue({ text: vi.fn().mockResolvedValue('Old Content') });

      await knowledgeService.updateArticle('doc-123', 'New Title', 'New Content', 'cat-123');

      expect(mockEnv.ATTACHMENTS_BUCKET.put).toHaveBeenCalledWith(
        'knowledge/doc/test.md',
        'New Content',
        expect.any(Object)
      );
      expect(mockEnv.DB.prepare).toHaveBeenCalledWith(expect.stringContaining('UPDATE knowledge_docs SET title = ?, category_id = ?, status = ? WHERE id = ?'));
      expect(mockEnv.VECTORIZE_WORKFLOW.create).toHaveBeenCalledWith({
        id: expect.stringContaining('update_doc_doc-123_'),
        payload: {
          action: 'update',
          documentId: 'doc-123',
          categoryId: 'cat-123',
          contentChanged: true
        }
      });
    });

    it('should throw if document not found', async () => {
      mockEnv.DB.prepare('').first.mockResolvedValue(null);
      await expect(knowledgeService.updateArticle('doc-123', 'Title', 'Content', null)).rejects.toThrow('Document not found');
    });
  });

  describe('markArticleAsQA', () => {
    it('should trigger VECTORIZE_WORKFLOW when marked as QA', async () => {
      mockEnv.DB.prepare('').first.mockResolvedValue({ body: 'Helpful article text.' });

      await knowledgeService.markArticleAsQA('art-123', 'answer');

      expect(mockEnv.VECTORIZE_WORKFLOW.create).toHaveBeenCalledWith({
        id: expect.stringContaining('qa_mark_art-123_'),
        payload: {
          action: 'qa_mark',
          documentId: 'art-123',
          qaType: 'answer'
        }
      });
    });

    it('should trigger VECTORIZE_WORKFLOW when unmarked', async () => {
      mockEnv.DB.prepare('').first.mockResolvedValue({ body: 'Text', chunk_count: 2 });
      await knowledgeService.markArticleAsQA('art-123', null);

      expect(mockEnv.VECTORIZE_WORKFLOW.create).toHaveBeenCalledWith({
        id: expect.stringContaining('qa_mark_art-123_'),
        payload: {
          action: 'qa_mark',
          documentId: 'art-123',
          qaType: null
        }
      });
    });
  });

  describe('getAiSuggestion', () => {
    it('should fetch context and generate suggestion', async () => {
      mockEnv.DB.prepare('').all.mockResolvedValue({
        results: [{ body: 'How to fix login?', sender_type: 'customer' }]
      });
      mockAiService.generateEmbeddings.mockResolvedValue([0.1]);
      mockVectorService.search.mockResolvedValue([{ text: 'Go to reset page.' }]);
      mockAiService.generateSuggestion.mockResolvedValue('Suggested response: Go to reset page.');

      const result = await knowledgeService.getAiSuggestion('ticket-123');

      expect(mockEnv.DB.prepare).toHaveBeenCalledWith(expect.stringContaining('SELECT body, sender_type FROM articles'));
      expect(mockAiService.generateEmbeddings).toHaveBeenCalledWith('How to fix login?');
      expect(mockVectorService.search).toHaveBeenCalledWith([0.1]);
      expect(mockAiService.generateSuggestion).toHaveBeenCalledWith({
        input: 'User: How to fix login?',
        context: ['Go to reset page.'],
      });
      expect(result).toBe('Suggested response: Go to reset page.');
    });
  });

  describe('search', () => {
    it('should search vectorize with just the query if categoryId is not provided', async () => {
      mockAiService.generateEmbeddings.mockResolvedValue([0.1, 0.2]);
      mockVectorService.search.mockResolvedValue([{ text: 'Result 1' }, { text: 'Result 2' }]);

      const result = await knowledgeService.search('test query');

      expect(mockAiService.generateEmbeddings).toHaveBeenCalledWith('test query');
      expect(mockVectorService.search).toHaveBeenCalledWith([0.1, 0.2], 3, undefined);
      expect(result).toEqual([{ content: 'Result 1' }, { content: 'Result 2' }]);
    });

    it('should pass categoryId as filter to VectorService.search', async () => {
      mockAiService.generateEmbeddings.mockResolvedValue([0.3, 0.4]);
      mockVectorService.search.mockResolvedValue([{ text: 'Category Result' }]);

      const result = await knowledgeService.search('test query', 5, 'cat-456');

      expect(mockAiService.generateEmbeddings).toHaveBeenCalledWith('test query');
      expect(mockVectorService.search).toHaveBeenCalledWith([0.3, 0.4], 5, { category_id: 'cat-456' });
      expect(result).toEqual([{ content: 'Category Result' }]);
    });
  });
});
