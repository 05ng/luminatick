import { Hono } from 'hono';
import { Env } from '../bindings';
import { AiService } from '../services/ai.service';
import { KnowledgeService } from '../services/knowledge.service';
import { TicketService } from '../services/ticket.service';
import { rateLimiter } from '../middleware/rate-limiter';
import { AppVariables } from '../types';
import { z } from 'zod';

const widget = new Hono<{ Bindings: Env; Variables: AppVariables }>();



// Fetch widget configuration
widget.get('/config', async (c) => {
  const { results } = await c.env.DB.prepare(
    'SELECT key, value FROM config WHERE key LIKE "widget.%"'
  ).all();

  const config: Record<string, any> = {
    primaryColor: '#3b82f6',
    title: 'Support',
    welcomeMessage: "Hello! I'm here to help you. What's on your mind?",
    features: {
      aiChat: true,
      ticketForm: true,
    }
  };

  results.forEach((row: any) => {
    const key = row.key.replace('widget.', '');
    if (key.includes('.')) {
      const parts = key.split('.');
      let current = config;
      for (let i = 0; i < parts.length - 1; i++) {
        if (!current[parts[i]]) current[parts[i]] = {};
        current = current[parts[i]];
      }
      current[parts[parts.length - 1]] = row.value;
    } else {
      config[key] = row.value;
    }
  });

  return c.json(config);
});

const chatSchema = z.object({
  message: z.string().min(1, 'Message is required'),
  history: z.array(
    z.object({
      role: z.enum(['user', 'assistant']),
      content: z.string().min(1)
    })
  ).optional().default([]),
  category_id: z.string().optional(),
});

// AI Chat endpoint
widget.post('/chat', rateLimiter(5, 60000), async (c) => {
  const body = await c.req.json();
  const result = chatSchema.safeParse(body);
  if (!result.success) {
    return c.json({ error: 'Validation failed', details: result.error.flatten().fieldErrors }, 400);
  }

  const { message, history, category_id } = result.data;

  const aiService = new AiService(c.env);
  const knowledgeService = new KnowledgeService(c.env);

  // 1. Search for relevant context using Vectorize using just the new message for best retrieval relevance
  const contextResults = await knowledgeService.search(message, 3, category_id);
  const context = contextResults.map(r => r.content).join('\n\n');

  // 2. Generate AI response with history context
  const response = await aiService.generateResponse(message, context, history || []);

  return c.json({ response });
});

const createWidgetTicketSchema = z.object({
  subject: z.string().min(1, "Subject is required"),
  email: z.string().email("Invalid email address"),
  message: z.string().min(1, "Message is required"),
  custom_fields: z.record(z.union([z.string(), z.number(), z.boolean(), z.null()])).optional(),
  metadata: z.record(z.unknown()).optional(),
});

// Ticket Submission endpoint
widget.post('/tickets', rateLimiter(3, 300000), async (c) => {
  const body = await c.req.json();
  const ticketService = new TicketService(c.env, c.executionCtx);

  const result = createWidgetTicketSchema.safeParse(body);
  if (!result.success) {
    return c.json({ error: "Validation failed", details: result.error.flatten().fieldErrors }, 400);
  }
  const validData = result.data;

  try {
    const ticket = await ticketService.createTicket({
      subject: validData.subject,
      customer_email: validData.email,
      priority: 'normal',
      status: 'open',
      source: 'widget',
      custom_fields: validData.custom_fields
    });

    await ticketService.createArticle({
      ticket_id: ticket.id,
      body: validData.message,
      sender_type: 'customer',
      is_internal: false,
      metadata: validData.metadata ? JSON.stringify(validData.metadata) : undefined
    } as any);

    return c.json(ticket, 201);
  } catch (error) {
    console.error("Widget Create Ticket Error:", error);
    return c.json({ error: "Failed to create ticket" }, 500);
  }
});

export default widget;
