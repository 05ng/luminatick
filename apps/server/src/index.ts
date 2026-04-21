import { VectorizeWorkflow } from './workflows/vectorize.workflow';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { Env } from './bindings';
import { EmailHandler } from './handlers/email.handler';
import { InboundEmailService } from './services/email/inbound.service';
import { AutomationService } from './services/automation.service';
import auth from './handlers/auth.handler';
import dashboard from './handlers/dashboard.handler';
import knowledge from './handlers/knowledge.handler';
import settings from './handlers/settings.handler';
import channels from './handlers/channels.handler';
import permissions from './handlers/permissions.handler';
import v1 from './handlers/v1.handler';
import widget from './handlers/widget.handler';
import customerHandler from './handlers/customer.handler';
import { AuthService } from './services/auth/auth.service';
import { NotificationDO } from './durable_objects/NotificationDO';
import { rateLimiter } from './middleware/rate-limiter';
import { AppVariables } from './types';

const app = new Hono<{ Bindings: Env; Variables: AppVariables }>();

// Real-time WebSocket connection
app.get('/api/realtime', async (c) => {
  const upgradeHeader = c.req.header('Upgrade');
  if (!upgradeHeader || upgradeHeader !== 'websocket') {
    return c.json({ error: 'Expected Upgrade: websocket' }, 426);
  }

  const token = c.req.query('token');
  if (!token) return c.json({ error: 'Unauthorized' }, 401);

  let user = null;
  try {
    const authService = new AuthService(c.env);
    user = await authService.verifyToken(token); // Verify auth before passing to DO
    if (!user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }
  } catch (err) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  // Construct a new Request and inject trusted headers
  const newReq = new Request(c.req.raw.url, c.req.raw);
  newReq.headers.set('X-User-ID', user.id);
  newReq.headers.set('X-User-Name', user.full_name || user.email);

  const id = c.env.NOTIFICATION_DO.idFromName('global');
  const obj = c.env.NOTIFICATION_DO.get(id);
  return obj.fetch(newReq);
});

// Enable CORS for the dashboard, portal, and widget
app.use('/api/*', cors({
  origin: (origin, c) => {
    // Widget needs to be embedded on any site
    if (c.req.path.startsWith('/api/v1/widget')) {
      return origin || '*';
    }

    if (!origin) return c.env.PORTAL_URL || 'http://localhost:5173';

    // In a single-tenant environment using JWTs (no cookies), reflecting the 
    // incoming origin allows users to bind any custom domain seamlessly.
    return origin;
  },
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowHeaders: ['Content-Type', 'Authorization', 'X-Lumina-Source'],
  exposeHeaders: ['Content-Length'],
  maxAge: 600,
  credentials: true,
}));

// Health check
app.get('/health', (c) => c.text('OK'));

// Test endpoint for simulating inbound emails removed for security reasons in production.


// API Routes
app.route('/api/auth', auth);
app.route('/api/permissions', permissions);
app.route('/api/knowledge', knowledge);
app.route('/api/settings', settings);
app.route('/api/channels', channels);
app.route('/api/v1/customer', customerHandler);
app.route('/api/v1/widget', widget);
app.route('/api/v1', v1);
app.route('/api', dashboard);

export { NotificationDO, VectorizeWorkflow };

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    return app.fetch(request, env, ctx);
  },

  async email(message: ForwardableEmailMessage, env: Env, ctx: ExecutionContext): Promise<void> {
    const handler = new EmailHandler(env);
    await handler.handleEmail(message, ctx);
  },

  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    const automationService = new AutomationService(env);
    const result = await automationService.runRetention();
    console.log(`Retention run complete: ${result.deleted_tickets} tickets deleted, ${result.deleted_attachments} attachments deleted.`);
  },
};
