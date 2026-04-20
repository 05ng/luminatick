import { Hono } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { Env } from "../bindings";
import { AppVariables, Article } from "../types";
import { CustomerAuthService } from "../services/customer-auth.service";
import { TicketService } from "../services/ticket.service";
import { BroadcastService } from "../services/broadcast.service";
import { StorageService } from "../services/storage.service";
import { authMiddleware } from "../middleware/auth.middleware";
import { roleGuard } from "../middleware/role.guard";
import { rateLimiter } from "../middleware/rate-limiter";
import { decryptString } from "../utils/crypto";
import { verifyTurnstileToken } from "../utils/turnstile";

const app = new Hono<{ Bindings: Env; Variables: AppVariables }>();

// --- PUBLIC CONFIG ROUTE ---
app.get('/config', async (c) => {
  const result = await c.env.DB.prepare("SELECT value FROM config WHERE key = 'TICKET_PREFIX' LIMIT 1").first<{value: string}>();
  const siteKeyResult = await c.env.DB.prepare("SELECT value FROM config WHERE key = 'TURNSTILE_SITE_KEY' LIMIT 1").first<{value: string}>();
  return c.json({ 
    TICKET_PREFIX: result?.value || '#',
    TURNSTILE_SITE_KEY: siteKeyResult?.value || undefined
  });
});

// --- AUTHENTICATION ROUTES ---

app.post('/auth/request', rateLimiter(5, 60000), async (c) => {
  const body = await c.req.json();
  
  // Turnstile verification
  try {
    const isValid = await verifyTurnstileToken(c.env, body.turnstileToken, c.req.header('CF-Connecting-IP'));
    if (!isValid) {
      return c.json({ error: 'Turnstile validation failed or token missing' }, 400);
    }
  } catch (error: any) {
    if (error.message.includes('APP_MASTER_KEY')) {
      return c.json({ error: "Server misconfiguration: APP_MASTER_KEY is missing." }, 500);
    }
    return c.json({ error: 'Internal server error during Turnstile validation' }, 500);
  }

  const authService = new CustomerAuthService(c.env);

  await authService.requestAuth(body.email, body.type, body.baseUrl);
  return c.json({ success: true });
});

app.post('/auth/verify', rateLimiter(5, 60000), async (c) => {
  const body = await c.req.json();
  const authService = new CustomerAuthService(c.env);
  const result = await authService.verifyAuth(body.token);
  if (!result) return c.json({ error: 'Invalid token' }, 401);
  
  setCookie(c, 'lumina_customer_token', result.token, {
    httpOnly: true,
    secure: c.req.url.startsWith('https'),
    sameSite: 'Lax',
    path: '/',
    maxAge: 7 * 24 * 60 * 60 // 7 days
  });
  
  return c.json(result);
});

app.post('/auth/logout', authMiddleware, roleGuard(['customer']), async (c) => {
  deleteCookie(c, 'lumina_customer_token', { path: '/' });
  return c.json({ success: true });
});

app.get('/auth/me', authMiddleware, roleGuard(['customer']), async (c) => {
  const payload = c.get('jwtPayload');
  const user = await c.env.DB.prepare('SELECT id, email, full_name, role, created_at, last_login_at FROM users WHERE id = ?').bind(payload.sub).first<any>();
  return c.json({ user });
});

// --- TICKET ROUTES ---

app.get('/tickets', authMiddleware, roleGuard(['customer']), async (c) => {
  const payload = c.get('jwtPayload');
  const ticketService = new TicketService(c.env);
  const page = parseInt(c.req.query('page') || '1');
  const limit = parseInt(c.req.query('limit') || '50');
  const tickets = await ticketService.findTickets({ page, limit, customerEmail: payload.email });
  return c.json(tickets);
});

app.post('/tickets', authMiddleware, roleGuard(['customer']), rateLimiter(3, 60000), async (c) => {
  const payload = c.get('jwtPayload');
  const body = await c.req.json();
  const ticketService = new TicketService(c.env);
  
  // Turnstile verification
  try {
    const isValid = await verifyTurnstileToken(c.env, body.turnstileToken, c.req.header('CF-Connecting-IP'));
    if (!isValid) {
      return c.json({ error: 'Turnstile validation failed or token missing' }, 400);
    }
  } catch (error: any) {
    if (error.message.includes('APP_MASTER_KEY')) {
      return c.json({ error: "Server misconfiguration: APP_MASTER_KEY is missing." }, 500);
    }
    return c.json({ error: 'Internal server error during Turnstile validation' }, 500);
  }

  const result = await ticketService.createTicketWithArticle({
    subject: body.subject,
    customer_email: payload.email,
    source: 'portal',
    body: body.message,
    sender_id: payload.sub,
    sender_type: 'customer'
  });
  return c.json(result, 201);
});

app.get('/tickets/:id', authMiddleware, roleGuard(['customer']), async (c) => {
  const payload = c.get('jwtPayload');
  const ticketId = c.req.param('id')!;
  const ticketService = new TicketService(c.env);
  const ticket = await ticketService.findTicketById(ticketId);
  
  if (!ticket || ticket.customer_email !== payload.email) {
    return c.json({ error: 'Not found' }, 404);
  }
  
  // Exclude internal notes
  const articles = await c.env.DB.prepare(
    'SELECT * FROM articles WHERE ticket_id = ? AND is_internal = FALSE ORDER BY created_at ASC'
  ).bind(ticketId).all<Article>();

  await ticketService.hydrateArticles(articles.results);

  // Fetch attachments for these articles
  const attachments = await c.env.DB.prepare(
    `SELECT a.* FROM attachments a
     JOIN articles art ON a.article_id = art.id
     WHERE art.ticket_id = ? AND art.is_internal = FALSE`
  ).bind(ticketId).all<any>();

  const articlesWithAttachments = articles.results.map((article: any) => ({
    ...article,
    attachments: attachments.results.filter((att: any) => att.article_id === article.id).map((a: any) => ({ id: a.id, filename: a.file_name, size: a.file_size, contentType: a.content_type, storageKey: a.r2_key })),
  }));
  
  return c.json({ ticket, articles: articlesWithAttachments });
});

app.post('/tickets/:id/messages', authMiddleware, roleGuard(['customer']), rateLimiter(5, 60000), async (c) => {
  const payload = c.get('jwtPayload');
  const ticketId = c.req.param('id')!;
  const body = await c.req.json();
  const ticketService = new TicketService(c.env);
  
  const ticket = await ticketService.findTicketById(ticketId);
  if (!ticket || ticket.customer_email !== payload.email) {
    return c.json({ error: 'Not found' }, 404);
  }
  
  const article = await ticketService.createArticle({
    ticket_id: ticketId,
    body: body.message,
    sender_type: 'customer',
    sender_id: payload.sub
  });

  const attachments: any[] = [];
  if (Array.isArray(body.attachments)) {
    const expectedPrefix = `customer-attachments/${payload.sub}/`;
    for (const att of body.attachments) {
      const r2Key = att.storageKey || att.key;
      if (!r2Key || typeof r2Key !== 'string' || !r2Key.startsWith(expectedPrefix)) {
        return c.json({ error: 'Unauthorized attachment access' }, 403);
      }

      if (!att.filename || typeof att.filename !== 'string') {
        return c.json({ error: "Invalid attachment filename" }, 400);
      }
      const sanitizedFilename = att.filename.replace(/^.*[\\/]/, '').replace(/[\r\n]/g, '');

      if (typeof att.size !== 'number' || att.size < 0 || att.size > 10 * 1024 * 1024) {
        return c.json({ error: "Invalid attachment size" }, 400);
      }

      const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf', 'text/plain', 'text/csv'];
      if (!allowedTypes.includes(att.contentType)) {
        return c.json({ error: "Unsupported attachment content type" }, 415);
      }

      const added = await ticketService.addAttachment({
        article_id: article.id,
        file_name: sanitizedFilename,
        file_size: att.size,
        content_type: att.contentType,
        r2_key: r2Key
      });
      attachments.push({ id: added.id, filename: added.file_name, size: added.file_size, contentType: added.content_type, storageKey: added.r2_key });
    }
  }
  
  // Update ticket timestamp
  await ticketService.updateTicketTimestamp(ticketId);

  // Broadcast the update
  const broadcastService = new BroadcastService(c.env);
  await broadcastService.broadcast("article.created", {
    ticketId,
    articleId: article.id,
    senderType: "customer",
    isInternal: false,
  });

  return c.json({ ...article, attachments }, 201);
});

// --- ATTACHMENT ROUTES ---
app.get('/attachments/:id/download', authMiddleware, roleGuard(['customer']), async (c) => {
  const attachmentId = c.req.param('id');
  const payload = c.get('jwtPayload');
  
  const attachment = await c.env.DB.prepare(`
    SELECT a.r2_key, a.file_name, a.content_type, t.customer_email 
    FROM attachments a
    JOIN articles art ON a.article_id = art.id
    JOIN tickets t ON art.ticket_id = t.id
    WHERE a.id = ?
  `).bind(attachmentId).first<any>();

  if (!attachment || attachment.customer_email !== payload.email) {
    return c.json({ error: 'Not found or unauthorized' }, 404);
  }

  const storage = new StorageService(c.env);
  const response = await storage.getAttachment(attachment.r2_key);
  if (!response) return c.json({ error: 'File not found in storage' }, 404);
  
  // Make response mutable to change headers
  const newResponse = new Response(response.body, response);
  const safeFileName = (attachment.file_name || 'attachment').replace(/^.*[\\/]/, '').replace(/[\r\n"]/g, '_');
  newResponse.headers.set('Content-Disposition', `attachment; filename="${safeFileName}"`);
  return newResponse;
});


app.post('/attachments/upload', authMiddleware, roleGuard(['customer']), async (c) => {
  const payload = c.get('jwtPayload');
  
  // Early payload size check via Content-Length (10MB + slight overhead for multipart boundaries)
  const MAX_FILE_SIZE = 10 * 1024 * 1024;
  const contentLength = parseInt(c.req.header('content-length') || '0', 10);
  if (contentLength > MAX_FILE_SIZE + 50000) {
    return c.json({ error: 'Payload too large. File must be under 10MB' }, 413);
  }

  const body = await c.req.parseBody();
  const file = body['file'] as File;

  if (!file) {
    return c.json({ error: 'File is required' }, 400);
  }

  const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf', 'text/plain', 'text/csv'];
  if (!allowedMimeTypes.includes(file.type)) {
    return c.json({ error: 'Unsupported media type' }, 415);
  }

  // Double-check actual file size after parsing
  if (file.size > MAX_FILE_SIZE) {
    return c.json({ error: 'File exceeds maximum allowed size of 10MB' }, 413);
  }

  const fileName = file.name || '';
  const lastDotIndex = fileName.lastIndexOf('.');
  const hasExtension = lastDotIndex !== -1 && lastDotIndex < fileName.length - 1;
  const rawExt = hasExtension ? fileName.substring(lastDotIndex + 1) : '';
  const fileExt = rawExt.replace(/[^a-zA-Z0-9]/g, '');
  const extPart = fileExt ? `.${fileExt}` : '';
  
  const key = `customer-attachments/${payload.sub}/${crypto.randomUUID()}${extPart}`;

  try {
    await c.env.ATTACHMENTS_BUCKET.put(key, file.stream(), {
      httpMetadata: { contentType: file.type || 'application/octet-stream' },
    });
    return c.json({ key });
  } catch (error: any) {
    console.error('Error uploading file:', error);
    return c.json({ error: 'Failed to upload file' }, 500);
  }
});

export default app;
