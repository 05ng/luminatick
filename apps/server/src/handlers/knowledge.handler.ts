import { Hono } from 'hono';
import { Env } from '../bindings';
import { authMiddleware } from '../middleware/auth.middleware';
import { mfaGuard } from '../middleware/mfa.guard';
import { roleGuard } from '../middleware/role.guard';
import { KnowledgeService } from '../services/knowledge.service';
import { AppVariables } from '../types';
import { z } from 'zod';

const knowledgeHandler = new Hono<{ Bindings: Env; Variables: AppVariables }>();

knowledgeHandler.use('*', authMiddleware, mfaGuard, roleGuard(['agent', 'admin']));

// Article Endpoints
knowledgeHandler.get('/articles', async (c) => {
  const service = new KnowledgeService(c.env);
  const docs = await service.listDocuments();
  return c.json(docs);
});

knowledgeHandler.get('/articles/:id', async (c) => {
  const id = c.req.param('id');
  const service = new KnowledgeService(c.env);
  const doc = await service.getDocument(id);
  if (!doc) {
    return c.json({ error: 'Document not found' }, 404);
  }
  return c.json(doc);
});

knowledgeHandler.delete('/articles/:id', async (c) => {
  const id = c.req.param('id');
  const service = new KnowledgeService(c.env);
  await service.deleteDocument(id);
  return c.json({ success: true });
});

// For backward compatibility or if used by other components
knowledgeHandler.delete('/:id', async (c) => {
  const id = c.req.param('id');
  const service = new KnowledgeService(c.env);
  await service.deleteDocument(id);
  return c.json({ success: true });
});

knowledgeHandler.post('/articles/:id/qa', async (c) => {
  const id = c.req.param('id');
  const { type } = await c.req.json();
  const service = new KnowledgeService(c.env);
  await service.markArticleAsQA(id, type);
  return c.json({ success: true });
});

knowledgeHandler.get('/articles/:id/content', async (c) => {
  const id = c.req.param('id');
  const service = new KnowledgeService(c.env);
  try {
    const content = await service.getArticleContent(id);
    return c.json({ content });
  } catch (error: any) {
    return c.json({ error: error.message }, 404);
  }
});

// File upload (keep at root or move to /articles/upload)
knowledgeHandler.post('/', async (c) => {
  const body = await c.req.parseBody();
  const file = body['file'] as File;
  const title = (body['title'] as string) || file.name;

  if (!file) {
    return c.json({ error: 'No file provided' }, 400);
  }

  const service = new KnowledgeService(c.env);
  const content = new Uint8Array(await file.arrayBuffer());
  const docId = await service.uploadAndProcess(title, file.name, content, file.type);

  return c.json({ id: docId });
});

// AI Suggestions
knowledgeHandler.get('/tickets/:id/ai-suggest', async (c) => {
  const id = c.req.param('id');
  const service = new KnowledgeService(c.env);
  const suggestion = await service.getAiSuggestion(id);
  return c.json({ suggestion });
});

// Zod schemas for new endpoints - using snake_case to match frontend
const categorySchema = z.object({
  name: z.string().min(1, 'Name is required').max(100, 'Name is too long'),
  parent_id: z.string().uuid().optional().nullable(),
});

const articleSchema = z.object({
  title: z.string().min(1, 'Title is required').max(255, 'Title is too long'),
  content: z.string().min(1, 'Content is required'),
  category_id: z.string().uuid().optional().nullable(),
});

// Category endpoints
knowledgeHandler.get('/categories', async (c) => {
  const service = new KnowledgeService(c.env);
  const categories = await service.getCategories();
  return c.json(categories);
});

knowledgeHandler.post('/categories', async (c) => {
  const body = await c.req.json();
  const result = categorySchema.safeParse(body);
  if (!result.success) {
    return c.json({ error: result.error.errors[0].message }, 400);
  }
  
  const { name, parent_id } = result.data;
  const service = new KnowledgeService(c.env);
  const id = await service.createCategory(name, parent_id || undefined);
  return c.json({ id });
});

knowledgeHandler.delete('/categories/:id', async (c) => {
  const id = c.req.param('id');
  const service = new KnowledgeService(c.env);
  try {
    await service.deleteCategory(id);
    return c.json({ success: true });
  } catch (error: any) {
    if (error.message?.includes('contains articles')) {
      return c.json({ error: error.message }, 400);
    }
    throw error;
  }
});

// Created articles (Markdown editor)
knowledgeHandler.post('/articles', async (c) => {
  const body = await c.req.json();
  const result = articleSchema.safeParse(body);
  if (!result.success) {
    return c.json({ error: result.error.errors[0].message }, 400);
  }

  const { title, content, category_id } = result.data;
  const service = new KnowledgeService(c.env);
  const id = await service.createArticle(title, content, category_id || null);
  return c.json({ id });
});

knowledgeHandler.put('/articles/:id', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json();
  const result = articleSchema.safeParse(body);
  if (!result.success) {
    return c.json({ error: result.error.errors[0].message }, 400);
  }

  const { title, content, category_id } = result.data;
  const service = new KnowledgeService(c.env);
  await service.updateArticle(id, title, content, category_id || null);
  return c.json({ success: true });
});

export default knowledgeHandler;
