import { Env } from '../bindings';
import { AiService } from './ai.service';
import { VectorService } from './vector.service';

export class KnowledgeService {
  private aiService: AiService;
  private vectorService: VectorService;
  private readonly MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

  constructor(private env: Env) {
    this.aiService = new AiService(env);
    this.vectorService = new VectorService(env);
  }

  async uploadAndProcess(title: string, fileName: string, content: Uint8Array, contentType: string): Promise<string> {
    if (content.length > this.MAX_FILE_SIZE) {
      throw new Error('File too large. Maximum size is 10MB.');
    }

    // Sanitize fileName to prevent directory traversal (e.g., ../../)
    const safeFileName = fileName.replace(/^.*[\\/]/, '').replace(/[^a-zA-Z0-9.\-_]/g, '_');

    const docId = crypto.randomUUID();
    const filePath = `knowledge/${docId}/${safeFileName}`;

    await this.env.ATTACHMENTS_BUCKET.put(filePath, content, {
      httpMetadata: { contentType },
    });

    const isText = contentType.startsWith('text/') || 
                  fileName.endsWith('.txt') || 
                  fileName.endsWith('.md') ||
                  fileName.endsWith('.csv');

    if (!isText) {
      await this.env.DB.prepare(
        'INSERT INTO knowledge_docs (id, title, file_path, status) VALUES (?, ?, ?, ?)'
      ).bind(docId, title, filePath, 'unsupported_type').run();
      throw new Error(`Format not supported for direct vectorization: ${contentType}`);
    }

    await this.env.DB.prepare(
      'INSERT INTO knowledge_docs (id, title, file_path, status) VALUES (?, ?, ?, ?)'
    ).bind(docId, title, filePath, 'processing').run();

    if (this.env.VECTORIZE_WORKFLOW) {
      await this.env.VECTORIZE_WORKFLOW.create({
        id: `create_upload_${docId}`,
        payload: {
          action: 'create',
          documentId: docId
        }
      });
    }

    return docId;
  }

  /**
   * Split text into chunks and store in Vectorize purely.
   * Implements sliding-window overlap to preserve context across chunk boundaries.
   * Avoids D1 FTS usage to preserve Free Tier write operations.
   */
  async processAndStoreVectors(sourceId: string, text: string, type: 'document' | 'qa', categoryId?: string | null, title?: string): Promise<number> {
    const chunks = this.chunkText(text);

    // Sanitize title to prevent prompt injection and DoS
    const safeTitle = title ? title.replace(/[\r\n]+/g, ' ').substring(0, 200).trim() : '';

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const chunkText = safeTitle ? `Title: ${safeTitle}\n\n${chunk}` : chunk;
      const vectorId = type === 'qa' ? `qa_${sourceId}_${i}` : `doc_${sourceId}_${i}`;
      
      const embedding = await this.aiService.generateEmbeddings(chunkText);
      const metadata: any = {
        source_id: sourceId,
        type: type,
        text: chunkText,
      };
      if (categoryId) {
        metadata.category_id = categoryId;
      }
      await this.vectorService.upsert(vectorId, embedding, metadata);
    }
    return chunks.length;
  }

  private chunkText(text: string, maxChunkSize: number = 1500, overlap: number = 200): string[] {
    const chunks: string[] = [];
    // Split on double newlines, or before Markdown headers and lists to keep structures intact
    const blocks = text.split(/\n\n+|(?=\n#{1,6} )|(?=\n[-*] )|(?=\n\d+\. )/);
    
    let currentChunk = '';

    for (const block of blocks) {
      const cleanBlock = block.trim();
      if (!cleanBlock) continue;

      const separator = currentChunk ? '\n\n' : '';
      if ((currentChunk.length + separator.length + cleanBlock.length) <= maxChunkSize) {
        currentChunk += separator + cleanBlock;
      } else {
        if (currentChunk) chunks.push(currentChunk);
        
        // Start next chunk with the overlap from the previous one
        let overlapContext = '';
        if (currentChunk.length > 0 && overlap > 0) {
          const tail = currentChunk.slice(-overlap);
          const match = tail.match(/[.!?]\s+(.*)$/);
          overlapContext = match && match[1] ? match[1] : tail;
        }
        
        currentChunk = overlapContext;
        
        // If a single block is larger than maxChunkSize, split it by sentences
        if (cleanBlock.length > maxChunkSize) {
          const sentences = cleanBlock.split(/(?<=[.!?])\s+/);
          for (const sentence of sentences) {
            const sentenceSep = currentChunk ? ' ' : '';
            if ((currentChunk.length + sentenceSep.length + sentence.length) <= maxChunkSize) {
              currentChunk += sentenceSep + sentence;
            } else {
              if (currentChunk) chunks.push(currentChunk);
              
              if (currentChunk.length > 0 && overlap > 0) {
                const tail = currentChunk.slice(-overlap);
                const match = tail.match(/[.!?]\s+(.*)$/);
                currentChunk = match && match[1] ? match[1] : tail;
              } else {
                currentChunk = '';
              }
              currentChunk += (currentChunk ? ' ' : '') + sentence;
            }
          }
        } else {
          currentChunk += (currentChunk ? '\n\n' : '') + cleanBlock;
        }
      }
    }
    
    if (currentChunk) chunks.push(currentChunk);
    
    // Deduplicate if the very last chunk is somehow identical (rare but possible with exact splits)
    return chunks.filter((item, index) => chunks.indexOf(item) === index);
  }

  // Category Methods
  async createCategory(name: string, parentId?: string): Promise<string> {
    const id = crypto.randomUUID();
    await this.env.DB.prepare(
      'INSERT INTO knowledge_categories (id, name, parent_id) VALUES (?, ?, ?)'
    )
      .bind(id, name, parentId || null)
      .run();
    return id;
  }

  async getCategories() {
    return (await this.env.DB.prepare('SELECT * FROM knowledge_categories ORDER BY created_at ASC').all()).results;
  }

  async deleteCategory(id: string) {
    try {
      await this.env.DB.prepare('DELETE FROM knowledge_categories WHERE id = ?').bind(id).run();
    } catch (error: any) {
      if (error.message?.includes('FOREIGN KEY constraint failed')) {
        throw new Error('Cannot delete category because it contains articles or subcategories. Please remove or reassign them first.');
      }
      throw error;
    }
  }

  // Article Methods
  async createArticle(title: string, content: string, categoryId: string | null): Promise<string> {
    const docId = crypto.randomUUID();
    const fileName = `${title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.md`;
    const filePath = `knowledge/${docId}/${fileName}`;

    await this.env.ATTACHMENTS_BUCKET.put(filePath, content, {
      httpMetadata: { contentType: 'text/markdown' },
    });

    await this.env.DB.prepare(
      'INSERT INTO knowledge_docs (id, title, file_path, status, category_id) VALUES (?, ?, ?, ?, ?)'
    )
      .bind(docId, title, filePath, 'processing', categoryId)
      .run();

    // Trigger workflow
    if (this.env.VECTORIZE_WORKFLOW) {
      await this.env.VECTORIZE_WORKFLOW.create({
        id: `create_doc_${docId}`,
        payload: {
          action: 'create',
          documentId: docId,
          categoryId: categoryId
        }
      });
    }

    return docId;
  }

  async updateArticle(id: string, title: string, content: string, categoryId: string | null): Promise<void> {
    const doc = await this.env.DB.prepare('SELECT file_path, chunk_count, category_id, status FROM knowledge_docs WHERE id = ?')
      .bind(id)
      .first<{ file_path: string, chunk_count: number, category_id: string | null, status: string }>();

    if (!doc) {
      throw new Error('Document not found');
    }

    const filePath = doc.file_path;
    let currentContent = '';
    try {
      const object = await this.env.ATTACHMENTS_BUCKET.get(filePath);
      if (object) {
        currentContent = await object.text();
      }
    } catch (e) {
      console.warn('Could not read existing file from R2', e);
    }

    const contentChanged = currentContent !== content;
    const categoryChanged = doc.category_id !== categoryId;

    if (contentChanged) {
      await this.env.ATTACHMENTS_BUCKET.put(filePath, content, {
        httpMetadata: { contentType: 'text/markdown' },
      });
    }

    await this.env.DB.prepare(
      'UPDATE knowledge_docs SET title = ?, category_id = ?, status = ? WHERE id = ?'
    )
      .bind(title, categoryId, contentChanged ? 'processing' : 'active', id)
      .run();

    if ((contentChanged || categoryChanged) && this.env.VECTORIZE_WORKFLOW) {
      await this.env.VECTORIZE_WORKFLOW.create({
        id: `update_doc_${id}_${Date.now()}`,
        payload: {
          action: 'update',
          documentId: id,
          categoryId: categoryId,
          contentChanged
        }
      });
    }
  }

  async getArticleContent(id: string): Promise<string> {
    const doc = await this.env.DB.prepare('SELECT file_path FROM knowledge_docs WHERE id = ?')
      .bind(id)
      .first<{ file_path: string }>();

    if (!doc) throw new Error('Document not found');

    const object = await this.env.ATTACHMENTS_BUCKET.get(doc.file_path);
    if (!object) throw new Error('File not found in storage');

    return await object.text();
  }

  async listDocuments() {
    return (await this.env.DB.prepare('SELECT * FROM knowledge_docs ORDER BY created_at DESC').all()).results;
  }

  async getDocument(id: string) {
    return await this.env.DB.prepare('SELECT * FROM knowledge_docs WHERE id = ?')
      .bind(id)
      .first();
  }

  async deleteDocument(id: string) {
    const doc = await this.env.DB.prepare('SELECT file_path, chunk_count FROM knowledge_docs WHERE id = ?')
      .bind(id)
      .first<{ file_path: string, chunk_count: number }>();

    if (doc) {
      await this.env.ATTACHMENTS_BUCKET.delete(doc.file_path);
      
      // Delete all related vectors from Vectorize
      const vectorIdsToDelete = [];
      const chunkCount = doc.chunk_count || 100; // Fallback to 100 if undefined or 0 to be safe for old docs
      for (let i = 0; i < chunkCount; i++) {
        vectorIdsToDelete.push(`doc_${id}_${i}`);
      }
      if (vectorIdsToDelete.length > 0) {
        await this.vectorService.delete(vectorIdsToDelete);
      }

      await this.env.DB.prepare('DELETE FROM knowledge_docs WHERE id = ?').bind(id).run();
    }
  }

  async markArticleAsQA(articleId: string, type: 'question' | 'answer' | null): Promise<void> {
    const prevArticle = await this.env.DB.prepare('SELECT body, chunk_count FROM articles WHERE id = ?')
      .bind(articleId)
      .first<{ body: string, chunk_count: number }>();

    if (!prevArticle) return;
    
    // Optimistic UI/Status: you might want to add a status to articles table, 
    // but right now it directly updates DB. The workflow will overwrite.

    if (this.env.VECTORIZE_WORKFLOW) {
      await this.env.VECTORIZE_WORKFLOW.create({
        id: `qa_mark_${articleId}_${Date.now()}`,
        payload: {
          action: 'qa_mark',
          documentId: articleId,
          qaType: type
        }
      });
    } else {
      // Fallback
      if (type) {
        const chunkCount = await this.processAndStoreVectors(articleId, prevArticle.body, 'qa');
        await this.env.DB.prepare('UPDATE articles SET qa_type = ?, chunk_count = ? WHERE id = ?')
          .bind(type, chunkCount, articleId)
          .run();
      } else {
        await this.deleteQAVectors(articleId, prevArticle.chunk_count || 10);
        await this.env.DB.prepare('UPDATE articles SET qa_type = NULL, chunk_count = 0 WHERE id = ?')
          .bind(articleId)
          .run();
      }
    }
  }

  
  async deleteDocumentVectors(id: string, chunkCount: number) {
    const vectorIdsToDelete = [];
    for (let i = 0; i < chunkCount; i++) {
      vectorIdsToDelete.push(`doc_${id}_${i}`);
    }
    if (vectorIdsToDelete.length > 0) {
      await this.vectorService.delete(vectorIdsToDelete);
    }
  }

  async deleteQAVectors(id: string, chunkCount: number) {
    const vectorIdsToDelete = [];
    for (let i = 0; i < chunkCount; i++) {
      vectorIdsToDelete.push(`qa_${id}_${i}`);
    }
    if (vectorIdsToDelete.length > 0) {
      await this.vectorService.delete(vectorIdsToDelete);
    }
  }

  async updateDocumentMetadata(id: string, categoryId?: string | null) {
    const doc = await this.env.DB.prepare('SELECT chunk_count FROM knowledge_docs WHERE id = ?')
      .bind(id)
      .first<{ chunk_count: number }>();
    if (!doc || !doc.chunk_count) return;

    const vectorIds = [];
    for (let i = 0; i < doc.chunk_count; i++) {
      vectorIds.push(`doc_${id}_${i}`);
    }
    
    const vectors = await this.vectorService.getByIds(vectorIds);
    if (vectors && vectors.length > 0) {
      const updatedVectors = vectors.map((v: any) => {
        const newMetadata = { ...v.metadata };
        if (categoryId) {
          newMetadata.category_id = categoryId;
        } else {
          delete newMetadata.category_id;
        }
        return {
          id: v.id,
          values: v.values,
          metadata: newMetadata
        };
      });
      await this.vectorService.upsertMany(updatedVectors);
    }
  }

  async getAiSuggestion(ticketId: string): Promise<string> {
    // 1. Get last 5 messages for better context
    const messages = await this.env.DB.prepare(
      'SELECT body, sender_type FROM articles WHERE ticket_id = ? ORDER BY created_at DESC LIMIT 5'
    )
      .bind(ticketId)
      .all<{ body: string, sender_type: string }>();

    if (messages.results.length === 0) return 'No context found.';

    // Reverse messages to chronological order
    const orderedMessages = messages.results.reverse();

    // Find the most recent message that has actual text for the embedding query
    // Basic regex to strip HTML tags if any, to ensure we don't query just "<p><br></p>"
    // Truncate to 8000 chars to prevent Event Loop blocking (CPU DoS) on massive payloads.
    // Use a stricter regex /<[a-zA-Z\/][^>]*>/g to avoid stripping legitimate text like "5 < 6".
    const validMessages = orderedMessages.filter(m => {
      if (!m.body) return false;
      return m.body.substring(0, 8000).replace(/<[a-zA-Z\/][^>]*>/g, '').trim().length > 0;
    });

    if (validMessages.length === 0) {
      return 'No text context found in recent messages to generate a suggestion.';
    }

    const lastValidMessage = validMessages[validMessages.length - 1].body.substring(0, 8000).replace(/<[a-zA-Z\/][^>]*>/g, '').trim();

    // Construct multi-turn context
    const chatHistory = orderedMessages.map(m => `${m.sender_type === 'customer' ? 'User' : 'Agent'}: ${m.body}`).join('\n');

    // 2. Search Vectorize using the last valid message (most relevant for retrieval)
    const queryEmbedding = await this.aiService.generateEmbeddings(lastValidMessage);
    const relevantChunks = await this.vectorService.search(queryEmbedding);

    // 3. Generate suggestion
    return await this.aiService.generateSuggestion({
      input: chatHistory,
      context: relevantChunks.map((c) => c.text),
    });
  }
  async search(query: string, limit: number = 3, categoryId?: string): Promise<{ content: string }[]> {
    // Rely solely on Dense Semantic Search (Vectorize) to preserve D1 read/write limits.
    // Cloudflare Vectorize offers generous free-tier limits, making it the most cost-effective retrieval engine.
    const embedding = await this.aiService.generateEmbeddings(query);
    const filter = categoryId ? { category_id: categoryId } : undefined;
    const vectorResults = await this.vectorService.search(embedding, limit, filter);

    return vectorResults.map(r => ({ content: r.text }));
  }
}
