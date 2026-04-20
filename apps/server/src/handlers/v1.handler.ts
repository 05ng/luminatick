import { Hono } from "hono";
import { z } from "zod";
import { Env } from "../bindings";
import { TicketService } from "../services/ticket.service";
import { apiAuthMiddleware } from "../middleware/api-auth.middleware";
import { rateLimiter } from "../middleware/rate-limiter";
import { Ticket, Article, AppVariables } from "../types";

const createTicketSchema = z.object({
  subject: z.string().min(1, "Subject is required"),
  customer_email: z.string().email("Invalid email address"),
  body: z.string().optional(),
  priority: z.enum(["low", "normal", "high", "urgent"]).default("normal"),
  status: z.enum(["open", "pending", "resolved", "closed"]).default("open"),
  group_id: z.string().uuid().optional().nullable(),
  assigned_to: z.string().uuid().optional().nullable(),
  custom_fields: z.record(z.union([z.string(), z.number(), z.boolean(), z.null()])).optional(),
});

const updateTicketSchema = z.object({
  status: z.enum(["open", "pending", "resolved", "closed"]).optional(),
  priority: z.enum(["low", "normal", "high", "urgent"]).optional(),
  assigned_to: z.string().uuid().nullable().optional(),
  group_id: z.string().uuid().nullable().optional(),
  custom_fields: z.record(z.union([z.string(), z.number(), z.boolean(), z.null()])).nullable().optional(),
});

const v1 = new Hono<{ Bindings: Env; Variables: AppVariables }>();

/**
 * Apply API Authentication to all v1 routes.
 */
v1.use("*", apiAuthMiddleware);

/**
 * POST /api/v1/tickets
 * Create a new ticket via the external API.
 */
v1.post("/tickets", rateLimiter(10, 60000), async (c) => {
  const body = await c.req.json();
  const ticketService = new TicketService(c.env, c.executionCtx);

  const result = createTicketSchema.safeParse(body);
  if (!result.success) {
    return c.json({ error: "Validation failed", details: result.error.flatten().fieldErrors }, 400);
  }
  const validData = result.data;

  try {
    const ticket = await ticketService.createTicket({
      subject: validData.subject,
      customer_email: validData.customer_email,
      priority: validData.priority,
      status: validData.status,
      source: 'api',
      group_id: validData.group_id || null,
      assigned_to: validData.assigned_to || null,
      custom_fields: validData.custom_fields
    });

    if (validData.body) {
      await ticketService.createArticle({
        ticket_id: ticket.id,
        body: validData.body,
        sender_type: 'customer',
        is_internal: false
      });
    }

    return c.json(ticket, 201);
  } catch (error) {
    console.error("API Create Ticket Error:", error);
    return c.json({ error: "Failed to create ticket" }, 500);
  }
});

/**
 * GET /api/v1/tickets/:id
 * Retrieve ticket details and articles.
 */
v1.get("/tickets/:id", async (c) => {
  const id = c.req.param("id");
  const ticketService = new TicketService(c.env);

  const ticket = await ticketService.findTicketById(id);
  if (!ticket) {
    return c.json({ error: "Ticket not found" }, 404);
  }

  const { results: articles } = await c.env.DB.prepare(
    "SELECT * FROM articles WHERE ticket_id = ? AND is_internal = 0 ORDER BY created_at ASC"
  )
    .bind(id)
    .all<Article>();

  await ticketService.hydrateArticles(articles);

  return c.json({
    ...ticket,
    articles
  });
});

/**
 * POST /api/v1/tickets/:id/articles
 * Add a new article (comment/reply) to an existing ticket.
 */
v1.post("/tickets/:id/articles", rateLimiter(10, 60000), async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json();
  const ticketService = new TicketService(c.env, c.executionCtx);

  if (!body.body) {
    return c.json({ error: "Missing required field: body" }, 400);
  }

  const ticket = await ticketService.findTicketById(id);
  if (!ticket) {
    return c.json({ error: "Ticket not found" }, 404);
  }

  try {
    const article = await ticketService.createArticle({
      ticket_id: id,
      body: body.body,
      sender_type: body.sender_type || 'customer',
      is_internal: body.is_internal || false
    });

    await ticketService.updateTicketTimestamp(id);

    return c.json(article, 201);
  } catch (error) {
    console.error("API Add Article Error:", error);
    return c.json({ error: "Failed to add article" }, 500);
  }
});

/**
 * PATCH /api/v1/tickets/:id
 * Update ticket properties (status, priority, etc.).
 */
v1.patch("/tickets/:id", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json();
  const ticketService = new TicketService(c.env, c.executionCtx);

  const ticket = await ticketService.findTicketById(id);
  if (!ticket) {
    return c.json({ error: "Ticket not found" }, 404);
  }

  const result = updateTicketSchema.safeParse(body);
  if (!result.success) {
    return c.json({ error: "Validation failed", details: result.error.flatten().fieldErrors }, 400);
  }
  const validData = result.data;

  const allowedUpdates = ["status", "priority", "group_id", "assigned_to", "custom_fields"] as const;
  const updates: string[] = [];
  const params: any[] = [];

  for (const key of allowedUpdates) {
    if (validData[key] !== undefined) {
      updates.push(`${key} = ?`);
      if (key === "custom_fields") {
        params.push(validData[key] ? JSON.stringify(validData[key]) : null);
      } else {
        params.push(validData[key]);
      }
    }
  }

  if (updates.length === 0) {
    return c.json({ error: "No valid updates provided" }, 400);
  }

  updates.push("updated_at = ?");
  params.push(new Date().toISOString());
  params.push(id);

  try {
    await c.env.DB.prepare(`UPDATE tickets SET ${updates.join(", ")} WHERE id = ?`)
      .bind(...params)
      .run();

    const updatedTicket = await ticketService.findTicketById(id);
    return c.json(updatedTicket);
  } catch (error) {
    console.error("API Update Ticket Error:", error);
    return c.json({ error: "Failed to update ticket" }, 500);
  }
});

export default v1;
