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
        params: {
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
  async processAndStoreVectors(sourceId: string, text: string, type: 'document' | 'qa', categoryId?: string | null, title?: string, tier?: 'answer' | 'sop'): Promise<number> {
    const chunks = this.chunkText(text);

    // Sanitize title to prevent prompt injection and DoS
    const safeTitle = title ? title.replace(/[\r\n]+/g, ' ').substring(0, 200).trim() : '';
    
    // QA types should default to 'sop' tier to prevent leaking ticket context/PII to the public widget
    const effectiveTier = tier ? tier : (type === 'qa' ? 'sop' : 'answer');

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const chunkText = safeTitle ? `Title: ${safeTitle}\n\n${chunk}` : chunk;
      const vectorId = type === 'qa' ? `qa_${sourceId}_${i}` : `doc_${sourceId}_${i}`;
      
      const embedding = await this.aiService.generateEmbeddings(chunkText);
      const metadata: any = {
        source_id: sourceId,
        type: type,
        text: chunkText,
        tier: effectiveTier,
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
    
    // Deduplicate to avoid O(n^2) complexity from indexOf on large arrays
    return Array.from(new Set(chunks));
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
  async createArticle(title: string, content: string, categoryId: string | null, tier?: string): Promise<string> {
    const docId = crypto.randomUUID();
    const fileName = `${title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.md`;
    const filePath = `knowledge/${docId}/${fileName}`;

    await this.env.ATTACHMENTS_BUCKET.put(filePath, content, {
      httpMetadata: { contentType: 'text/markdown' },
    });

    await this.env.DB.prepare(
      'INSERT INTO knowledge_docs (id, title, file_path, status, category_id, tier) VALUES (?, ?, ?, ?, ?, ?)'
    )
      .bind(docId, title, filePath, 'processing', categoryId, tier || 'answer')
      .run();

    // Trigger workflow
    if (this.env.VECTORIZE_WORKFLOW) {
      await this.env.VECTORIZE_WORKFLOW.create({
        id: `create_doc_${docId}`,
        params: {
          action: 'create',
          documentId: docId,
          categoryId: categoryId
        }
      });
    }

    return docId;
  }

  async updateArticle(id: string, title: string, content: string, categoryId: string | null, tier?: string): Promise<void> {
    const doc = await this.env.DB.prepare('SELECT file_path, chunk_count, category_id, status, tier FROM knowledge_docs WHERE id = ?')
      .bind(id)
      .first<{ file_path: string, chunk_count: number, category_id: string | null, status: string, tier: string }>();

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
    const tierChanged = tier && doc.tier !== tier;

    if (contentChanged) {
      await this.env.ATTACHMENTS_BUCKET.put(filePath, content, {
        httpMetadata: { contentType: 'text/markdown' },
      });
    }

    await this.env.DB.prepare(
      'UPDATE knowledge_docs SET title = ?, category_id = ?, status = ?, tier = ? WHERE id = ?'
    )
      .bind(title, categoryId, contentChanged ? 'processing' : 'active', tier || doc.tier, id)
      .run();

    if ((contentChanged || categoryChanged || tierChanged) && this.env.VECTORIZE_WORKFLOW) {
      await this.env.VECTORIZE_WORKFLOW.create({
        id: `update_doc_${id}_${Date.now()}`,
        params: {
          action: 'update',
          documentId: id,
          categoryId: categoryId,
          contentChanged: contentChanged || tierChanged // force re-vectorize to update tier metadata if changed
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
    const prevArticle = await this.env.DB.prepare('SELECT body, body_r2_key, chunk_count FROM articles WHERE id = ?')
      .bind(articleId)
      .first<{ body: string | null, body_r2_key: string | null, chunk_count: number }>();

    if (!prevArticle) return;
    
    // Optimistic UI/Status: you might want to add a status to articles table, 
    // but right now it directly updates DB. The workflow will overwrite.

    if (this.env.VECTORIZE_WORKFLOW) {
      await this.env.VECTORIZE_WORKFLOW.create({
        id: `qa_mark_${articleId}_${Date.now()}`,
        params: {
          action: 'qa_mark',
          documentId: articleId,
          qaType: type
        }
      });
    } else {
      // Fallback
      if (type) {
        let bodyText = prevArticle.body || '';
        if (!bodyText && prevArticle.body_r2_key) {
          try {
            const obj = await this.env.ATTACHMENTS_BUCKET.get(prevArticle.body_r2_key);
            if (obj) {
              bodyText = await obj.text();
            }
          } catch (e) {
            console.error('Failed to fetch article body from R2 for QA vectorization:', e);
          }
        }
        
        const chunkCount = await this.processAndStoreVectors(articleId, bodyText, 'qa');
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
    console.log(`[AI Suggestion] Starting getAiSuggestion for ticket: ${ticketId}`);
    // 1. Get last 5 messages for better context
    const messages = await this.env.DB.prepare(
      'SELECT body, body_r2_key, sender_type FROM articles WHERE ticket_id = ? ORDER BY created_at DESC LIMIT 5'
    )
      .bind(ticketId)
      .all<{ body: string | null, body_r2_key: string | null, sender_type: string }>();

    if (messages.results.length === 0) return 'No context found.';

    // Hydrate bodies from R2 if needed
    const hydratedMessages = await Promise.all(
      messages.results.map(async (m) => {
        let bodyText = m.body || '';
        if (!bodyText && m.body_r2_key) {
          try {
            // Use range to prevent Out of Memory (OOM) errors on extremely large payloads.
            // We only need the first ~8000 chars for AI context anyway.
            const obj = await this.env.ATTACHMENTS_BUCKET.get(m.body_r2_key, { range: { offset: 0, length: 8192 } });
            if (obj) {
              bodyText = await obj.text();
            }
          } catch (e) {
            console.error('Failed to fetch article body for AI suggestion:', e);
          }
        }
        return {
          body: bodyText,
          sender_type: m.sender_type
        };
      })
    );

    // Reverse messages to chronological order
    const orderedMessages = hydratedMessages.reverse();

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

    const lastValidMessage = validMessages[validMessages.length - 1].body.substring(0, 8000).replace(/<[a-zA-Z\\/][^>]*>/g, '').trim();

    console.log(`[AI Suggestion] User question (last valid message):`, lastValidMessage);

    // Construct multi-turn context
    const chatHistory = orderedMessages.map(m => {
      const cleanBody = m.body.replace(/<[a-zA-Z\\/][^>]*>/g, '').trim();
      return `${m.sender_type === 'customer' ? 'User' : 'Agent'}: ${cleanBody}`;
    }).join('\\n');

    // 2. Search Vectorize using the last valid message (most relevant for retrieval)
    const relevantChunks = await this.searchWithFallback(lastValidMessage, 3);

    console.log(`[AI Suggestion] Final context sent to AI:`, relevantChunks.map(c => ({ tier: c.tier, score: c.score, preview: c.content.substring(0, 50) + '...' })));

    const hasSOP = relevantChunks.some(c => c.tier === 'sop');
    const systemInstruction = hasSOP ? 
      'IMPORTANT: The provided context contains Standard Operating Procedures (SOPs) meant for internal use only. DO NOT expose the raw SOP to the user. Instead, read the SOP and ask the user for the required information needed to fulfill it.' : undefined;

    // 3. Generate suggestion
    return await this.aiService.generateSuggestion({
      input: chatHistory,
      context: relevantChunks.map((c) => c.content),
      systemInstruction
    });
  }
  async search(query: string, limit: number = 3, categoryId?: string): Promise<{ content: string }[]> {
    // Rely solely on Dense Semantic Search (Vectorize) to preserve D1 read/write limits.
    // Cloudflare Vectorize offers generous free-tier limits, making it the most cost-effective retrieval engine.
    const embedding = await this.aiService.generateEmbeddings(query);
    
    // Only return public 'answer' tier documents for generic search (used by customer widget)
    const filter: any = { tier: 'answer' };
    if (categoryId) filter.category_id = categoryId;
    
    let vectorResults = await this.vectorService.search(embedding, limit, filter);
    // Filter by threshold for answers to ensure quality
    vectorResults = vectorResults.filter(r => r.score >= 0.60);

    return vectorResults.map(r => ({ content: r.metadata.text.replace(/<[a-zA-Z\/][^>]*>/g, '').trim() }));
  }

  async searchWithFallback(query: string, limit: number = 3, categoryId?: string): Promise<{ content: string, tier: string, score: number }[]> {
    console.log(`[Search] Query:`, query);
    const embedding = await this.aiService.generateEmbeddings(query);
    
    // Search across ALL tiers for agents
    let filter: any = {};
    if (categoryId) filter.category_id = categoryId;
    
    // Fetch a larger pool of vectors (limit * 5) to prevent top-K pushdown where lower-scoring answers push out valid SOPs
    let vectorResults = await this.vectorService.search(embedding, limit * 5, Object.keys(filter).length > 0 ? filter : undefined);
    
    console.log(`[Search] Raw Vectorize results count:`, vectorResults.length);
    console.log(`[Search] all tiers raw matches:`, vectorResults.map(v => ({ id: v.metadata?.source_id, score: v.score, tier: v.metadata?.tier })));
    
    // Apply tier-specific thresholds
    vectorResults = vectorResults.filter(r => {
      const tier = r.metadata?.tier || 'answer';
      // Internal suggestions can use a slightly lower threshold for answers than public search
      if (tier === 'answer') return r.score >= 0.55;
      if (tier === 'sop') return r.score >= 0.50;
      return false;
    });

    // Sort by score descending and take the top 'limit'
    vectorResults.sort((a, b) => b.score - a.score);
    vectorResults = vectorResults.slice(0, limit);

    console.log(`[Search] Filtered results count:`, vectorResults.length);
    console.log(`[Search] Filtered results (scores/tiers):`, vectorResults.map(v => ({ score: v.score, tier: v.metadata?.tier })));

    return vectorResults.map(r => ({ 
      content: (r.metadata?.text || '').replace(/<[a-zA-Z\/][^>]*>/g, '').trim(),
      tier: r.metadata?.tier || 'answer',
      score: r.score
    }));
  }
}
