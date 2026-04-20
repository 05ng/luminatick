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

    const docId = crypto.randomUUID();
    const filePath = `knowledge/${docId}/${fileName}`;

    // 1. Upload to R2
    await this.env.ATTACHMENTS_BUCKET.put(filePath, content, {
      httpMetadata: { contentType },
    });

    // 2. Insert record into D1
    await this.env.DB.prepare(
      'INSERT INTO knowledge_docs (id, title, file_path, status) VALUES (?, ?, ?, ?)'
    )
      .bind(docId, title, filePath, 'processing')
      .run();

    // 3. Extract text & Vectorize
    try {
      // In a production app, use a dedicated microservice or worker for PDF/DOCX
      // For this implementation, we support text-based files directly.
      const isText = contentType.startsWith('text/') || 
                    fileName.endsWith('.txt') || 
                    fileName.endsWith('.md') ||
                    fileName.endsWith('.csv');

      if (isText) {
        const text = new TextDecoder().decode(content);
        const chunkCount = await this.processAndStoreVectors(docId, text, 'document');

        await this.env.DB.prepare('UPDATE knowledge_docs SET status = ?, chunk_count = ? WHERE id = ?')
          .bind('active', chunkCount, docId)
          .run();
      } else {
        // Mark as unsupported for binary formats in this MVP
        await this.env.DB.prepare('UPDATE knowledge_docs SET status = ? WHERE id = ?')
          .bind('unsupported_type', docId)
          .run();
        throw new Error(`Format not supported for direct vectorization: ${contentType}`);
      }
    } catch (error: any) {
      console.error('Vectorization failed:', error);
      await this.env.DB.prepare('UPDATE knowledge_docs SET status = ? WHERE id = ?')
        .bind('error', docId)
        .run();
      throw error;
    }

    return docId;
  }

  /**
   * Split text into chunks and store in Vectorize purely.
   * Implements sliding-window overlap to preserve context across chunk boundaries.
   * Avoids D1 FTS usage to preserve Free Tier write operations.
   */
  private async processAndStoreVectors(sourceId: string, text: string, type: 'document' | 'qa', categoryId?: string | null): Promise<number> {
    const chunks = this.chunkText(text);

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const vectorId = type === 'qa' ? `qa_${sourceId}_${i}` : `doc_${sourceId}_${i}`;
      
      const embedding = await this.aiService.generateEmbeddings(chunk);
      const metadata: any = {
        source_id: sourceId,
        type: type,
        text: chunk,
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

    try {
      const chunkCount = await this.processAndStoreVectors(docId, content, 'document', categoryId);

      await this.env.DB.prepare('UPDATE knowledge_docs SET status = ?, chunk_count = ? WHERE id = ?')
        .bind('active', chunkCount, docId)
        .run();
    } catch (error: any) {
      console.error('Vectorization failed:', error);
      await this.env.DB.prepare('UPDATE knowledge_docs SET status = ? WHERE id = ?')
        .bind('error', docId)
        .run();
      throw error;
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

    // Fetch existing content to compare
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

    if (contentChanged) {
      try {
        const vectorIdsToDelete = [];
        const oldChunkCount = doc.chunk_count || 100; // Fallback to 100 if undefined or 0 to be safe for old docs
        for (let i = 0; i < oldChunkCount; i++) {
          vectorIdsToDelete.push(`doc_${id}_${i}`);
        }
        if (vectorIdsToDelete.length > 0) {
          await this.vectorService.delete(vectorIdsToDelete);
        }

        const chunkCount = await this.processAndStoreVectors(id, content, 'document', categoryId);

        await this.env.DB.prepare('UPDATE knowledge_docs SET status = ?, chunk_count = ? WHERE id = ?')
          .bind('active', chunkCount, id)
          .run();
      } catch (error: any) {
        console.error('Vectorization failed:', error);
        await this.env.DB.prepare('UPDATE knowledge_docs SET status = ? WHERE id = ?')
          .bind('error', id)
          .run();
        throw error;
      }
    } else if (categoryChanged) {
      // Content has not changed, but category changed. Update Vectorize metadata only.
      try {
        const chunkCount = doc.chunk_count || 0;
        if (chunkCount > 0) {
          const vectorIds = [];
          for (let i = 0; i < chunkCount; i++) {
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
      } catch (error: any) {
        console.error('Vector metadata update failed:', error);
      }
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

    if (type) {
      // Vectorize the article (with chunking just in case it's huge)
      const chunkCount = await this.processAndStoreVectors(articleId, prevArticle.body, 'qa');

      await this.env.DB.prepare('UPDATE articles SET qa_type = ?, chunk_count = ? WHERE id = ?')
        .bind(type, chunkCount, articleId)
        .run();
    } else {
      // Unmark - delete from Vectorize (clear possible chunks)
      const vectorIdsToDelete = [];
      const chunkCount = prevArticle.chunk_count || 10;
      for (let i = 0; i < chunkCount; i++) {
        vectorIdsToDelete.push(`qa_${articleId}_${i}`);
      }
      if (vectorIdsToDelete.length > 0) {
        await this.vectorService.delete(vectorIdsToDelete);
      }

      await this.env.DB.prepare('UPDATE articles SET qa_type = NULL, chunk_count = 0 WHERE id = ?')
        .bind(articleId)
        .run();
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
    const lastMessage = orderedMessages[orderedMessages.length - 1].body;
    
    // Construct multi-turn context
    const chatHistory = orderedMessages.map(m => `${m.sender_type === 'customer' ? 'User' : 'Agent'}: ${m.body}`).join('\n');

    // 2. Search Vectorize using the last message (most relevant for retrieval)
    const queryEmbedding = await this.aiService.generateEmbeddings(lastMessage);
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
