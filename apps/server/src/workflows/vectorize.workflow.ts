import { WorkflowEntrypoint, WorkflowStep, WorkflowEvent } from 'cloudflare:workers';
import { Env } from '../bindings';
import { KnowledgeService } from '../services/knowledge.service';

export type VectorizeJob = {
  action: 'create' | 'update' | 'qa_mark';
  documentId: string;
  categoryId?: string | null;
  qaType?: 'question' | 'answer' | null;
  contentChanged?: boolean;
};

export class VectorizeWorkflow extends WorkflowEntrypoint<Env, VectorizeJob> {
  async run(event: WorkflowEvent<VectorizeJob>, step: WorkflowStep) {
    const { action, documentId, categoryId, qaType, contentChanged } = event.payload;
    const knowledgeService = new KnowledgeService(this.env);

    if (action === 'create' || (action === 'update' && contentChanged)) {
      // Step 1: Delete old vectors if update
      if (action === 'update') {
        await step.do('delete_old_vectors', async () => {
          const doc = await this.env.DB.prepare('SELECT chunk_count FROM knowledge_docs WHERE id = ?')
            .bind(documentId)
            .first<{ chunk_count: number }>();
          
          if (doc && doc.chunk_count > 0) {
            await knowledgeService.deleteDocumentVectors(documentId, doc.chunk_count);
          }
        });
      }

      // Step 2: Fetch and Vectorize
      // Done in one step to prevent large text payloads from exceeding the 1MB workflow state limit.
      const chunkCount = await step.do('fetch_and_vectorize', async () => {
        const contentStr = await knowledgeService.getArticleContent(documentId);
        const doc = await this.env.DB.prepare('SELECT title FROM knowledge_docs WHERE id = ?')
          .bind(documentId)
          .first<{ title: string }>();
          
        return await knowledgeService.processAndStoreVectors(documentId, contentStr, 'document', categoryId, doc?.title);
      });

      // Step 3: Update DB Status
      await step.do('update_status', async () => {
        await this.env.DB.prepare('UPDATE knowledge_docs SET status = ?, chunk_count = ? WHERE id = ?')
          .bind('active', chunkCount, documentId)
          .run();
      });

    } else if (action === 'update' && !contentChanged) {
      // Step 1: Update metadata only
      await step.do('update_metadata', async () => {
        await knowledgeService.updateDocumentMetadata(documentId, categoryId);
      });
    } else if (action === 'qa_mark') {
      if (qaType) {
        // Fetch and vectorize in one step
        const chunkCount = await step.do('fetch_and_vectorize_qa', async () => {
          const article = await this.env.DB.prepare('SELECT body FROM articles WHERE id = ?')
            .bind(documentId)
            .first<{ body: string }>();
          if (!article) throw new Error('Article not found');
          
          return await knowledgeService.processAndStoreVectors(documentId, article.body, 'qa');
        });
        
        await step.do('update_qa_status', async () => {
          await this.env.DB.prepare('UPDATE articles SET qa_type = ?, chunk_count = ? WHERE id = ?')
            .bind(qaType, chunkCount, documentId)
            .run();
        });
      } else {
        await step.do('unmark_qa', async () => {
          const article = await this.env.DB.prepare('SELECT chunk_count FROM articles WHERE id = ?')
            .bind(documentId)
            .first<{ chunk_count: number }>();
            
          if (article && article.chunk_count > 0) {
            await knowledgeService.deleteQAVectors(documentId, article.chunk_count);
          }
          await this.env.DB.prepare('UPDATE articles SET qa_type = NULL, chunk_count = 0 WHERE id = ?')
            .bind(documentId)
            .run();
        });
      }
    }
  }
}
