import { StorageService } from "../services/storage.service";
import { Hono } from "hono";
import { z } from "zod";
import { Env } from "../bindings";
import { authMiddleware } from "../middleware/auth.middleware";
import { mfaGuard } from "../middleware/mfa.guard";
import { roleGuard } from "../middleware/role.guard";
import { permissionGuard } from "../middleware/permission.guard";
import { rateLimiter } from "../middleware/rate-limiter";
import { Ticket, Article, User, JWTPayload, AutomationRule, AppVariables } from "../types";
import { ApiKeyService } from "../services/auth/apiKey.service";
import { BroadcastService } from "../services/broadcast.service";
import { EmailService } from "../services/email/outbound.service";
import { TicketService } from "../services/ticket.service";

const createGroupSchema = z.object({
  name: z.string().min(1, "Group name is required"),
  description: z.string().optional().nullable(),
});

const addMemberSchema = z.object({
  userId: z.string().uuid("Invalid User ID format"),
});

const createTicketSchema = z.object({
  subject: z.string().min(1, "Subject is required"),
  customer_email: z.string().email("Invalid email address"),
  body: z.string().min(1, "Message is required"),
  priority: z.enum(["low", "normal", "high", "urgent"]).default("normal"),
  status: z.enum(["open", "pending", "resolved", "closed"]).default("open"),
  group_id: z.string().uuid().optional().nullable(),
  assigned_to: z.string().uuid().optional().nullable(),
  custom_fields: z.record(z.union([z.string(), z.number(), z.boolean(), z.null()])).optional(),
});

const createTicketFieldSchema = z.object({
  name: z.string().min(1, "Name is required"),
  label: z.string().min(1, "Label is required"),
  field_type: z.enum(["text", "textarea", "select", "checkbox"]),
  options: z.string().optional().nullable(),
  is_active: z.boolean().default(true),
});

const updateTicketSchema = z.object({
  status: z.enum(["open", "pending", "resolved", "closed"]).optional(),
  priority: z.enum(["low", "normal", "high", "urgent"]).optional(),
  assigned_to: z.string().uuid().nullable().optional(),
  group_id: z.string().uuid().nullable().optional(),
  custom_fields: z.record(z.union([z.string(), z.number(), z.boolean(), z.null()])).nullable().optional(),
});

const dashboard = new Hono<{ Bindings: Env; Variables: AppVariables }>();

// Apply auth, MFA, and role-based access control to all dashboard routes
dashboard.use("*", authMiddleware, mfaGuard, roleGuard(["agent", "admin"]));

/**
 * GET /api/ticket-fields
 * List all custom ticket fields
 */
dashboard.get("/ticket-fields", async (c) => {
  const { results } = await c.env.DB.prepare(
    "SELECT * FROM ticket_fields ORDER BY name ASC"
  ).all();
  return c.json(results);
});

/**
 * POST /api/ticket-fields
 * Create a new custom ticket field
 */
dashboard.post("/ticket-fields", roleGuard(["admin", "agent"]), permissionGuard("ticket_fields"), async (c) => {
  const body = await c.req.json();
  const result = createTicketFieldSchema.safeParse(body);
  
  if (!result.success) {
    return c.json({ error: result.error.errors[0].message }, 400);
  }

  const { name, label, field_type, options, is_active } = result.data;
  const id = crypto.randomUUID();
  
  try {
    await c.env.DB.prepare(
      "INSERT INTO ticket_fields (id, name, label, field_type, options, is_active) VALUES (?, ?, ?, ?, ?, ?)"
    )
      .bind(id, name, label, field_type, options || null, is_active ? 1 : 0)
      .run();

    const field = await c.env.DB.prepare("SELECT * FROM ticket_fields WHERE id = ?")
      .bind(id)
      .first<any>();

    return c.json(field, 201);
  } catch (error: any) {
    if (error.message.includes("UNIQUE constraint failed")) {
      return c.json({ error: "Ticket field with this name already exists" }, 409);
    }
    throw error;
  }
});

/**
 * GET /api/stats
 * Dashboard overview statistics.
 */
dashboard.get("/stats", async (c) => {
  const [ticketStatus, ticketPriority, totalUsers, totalGroups] = await Promise.all([
    c.env.DB.prepare("SELECT status, COUNT(*) as count FROM tickets GROUP BY status").all(),
    c.env.DB.prepare("SELECT priority, COUNT(*) as count FROM tickets GROUP BY priority").all(),
    c.env.DB.prepare("SELECT COUNT(*) as count FROM users").first<{ count: number }>(),
    c.env.DB.prepare("SELECT COUNT(*) as count FROM groups").first<{ count: number }>()
  ]);

  return c.json({
    ticketsByStatus: ticketStatus.results,
    ticketsByPriority: ticketPriority.results,
    totalUsers: totalUsers?.count || 0,
    totalGroups: totalGroups?.count || 0,
  });
});

/**
 * GET /api/automations
 * List all automation rules.
 */
dashboard.get("/automations", permissionGuard("automations"), async (c) => {
  const { results } = await c.env.DB.prepare("SELECT * FROM automation_rules ORDER BY created_at DESC").all<AutomationRule>();
  return c.json(results);
});

/**
 * POST /api/automations
 * Create a new automation rule.
 */
dashboard.post("/automations", permissionGuard("automations"), async (c) => {
  const payload = await c.req.json();
  const id = crypto.randomUUID();
  const { name, event_type, conditions, action_type, action_config, is_active } = payload;

  if (!name || !event_type || !action_type) {
    return c.json({ error: "Missing required fields" }, 400);
  }

  await c.env.DB.prepare(
    "INSERT INTO automation_rules (id, name, event_type, conditions, action_type, action_config, is_active) VALUES (?, ?, ?, ?, ?, ?, ?)"
  )
    .bind(
      id,
      name,
      event_type,
      conditions || null,
      action_type,
      action_config || null,
      is_active ? 1 : 0
    )
    .run();

  const rule = await c.env.DB.prepare("SELECT * FROM automation_rules WHERE id = ?")
    .bind(id)
    .first<AutomationRule>();

  return c.json(rule, 201);
});

/**
 * PATCH /api/automations/:id
 * Update an automation rule.
 */
dashboard.patch("/automations/:id", permissionGuard("automations"), async (c) => {
  const id = c.req.param("id");
  const payload = await c.req.json();
  
  const allowedFields = ["name", "event_type", "conditions", "action_type", "action_config", "is_active"];
  const updates: string[] = [];
  const params: any[] = [];

  for (const field of allowedFields) {
    if (payload[field] !== undefined) {
      updates.push(`${field} = ?`);
      if (field === 'is_active') {
        params.push(payload[field] ? 1 : 0);
      } else {
        params.push(payload[field]);
      }
    }
  }

  if (updates.length === 0) {
    return c.json({ error: "No valid fields to update" }, 400);
  }

  params.push(id);
  const query = `UPDATE automation_rules SET ${updates.join(", ")} WHERE id = ?`;
  
  await c.env.DB.prepare(query).bind(...params).run();
  
  const rule = await c.env.DB.prepare("SELECT * FROM automation_rules WHERE id = ?")
    .bind(id)
    .first<AutomationRule>();

  return c.json(rule);
});

/**
 * DELETE /api/automations/:id
 * Delete an automation rule.
 */
dashboard.delete("/automations/:id", permissionGuard("automations"), async (c) => {
  const id = c.req.param("id");
  await c.env.DB.prepare("DELETE FROM automation_rules WHERE id = ?").bind(id).run();
  return c.json({ success: true });
});

/**
 * GET /api/api-keys
 * List all API keys for management.
 */
dashboard.get("/api-keys", permissionGuard("api_keys"), async (c) => {
  const apiKeyService = new ApiKeyService(c.env);
  const keys = await apiKeyService.listKeys();
  return c.json(keys);
});

/**
 * POST /api/api-keys
 * Generate a new API key.
 */
dashboard.post("/api-keys", permissionGuard("api_keys"), async (c) => {
  const { name } = await c.req.json();
  if (!name) {
    return c.json({ error: "Name is required" }, 400);
  }

  const apiKeyService = new ApiKeyService(c.env);
  const result = await apiKeyService.createKey(name);
  return c.json(result, 201);
});

/**
 * DELETE /api/api-keys/:id
 * Revoke/Delete an API key.
 */
dashboard.delete("/api-keys/:id", permissionGuard("api_keys"), async (c) => {
  const id = c.req.param("id");
  const apiKeyService = new ApiKeyService(c.env);
  await apiKeyService.deleteKey(id);
  return c.json({ success: true });
});

/**
 * POST /api/tickets
 * Create a new ticket from the dashboard.
 */
dashboard.post("/tickets", async (c) => {
  const body = await c.req.json();
  const result = createTicketSchema.safeParse(body);

  if (!result.success) {
    return c.json({ 
      error: "Validation failed", 
      details: result.error.flatten().fieldErrors 
    }, 400);
  }

  const { subject, customer_email, body: articleBody, priority, status, group_id, assigned_to, custom_fields } = result.data;
  let ctx;
  try { ctx = c.executionCtx; } catch {}
  const ticketService = new TicketService(c.env, ctx);
  const agent = c.get("jwtPayload") as JWTPayload;

  try {
    // 1. Link to existing customer record if it exists
    const customer = await c.env.DB.prepare("SELECT id FROM users WHERE email = ?")
      .bind(customer_email.toLowerCase())
      .first<{ id: string }>();

    // 2. Create the ticket
    const ticket = await ticketService.createTicket({
      subject,
      customer_email: customer_email.toLowerCase(),
      customer_id: customer?.id,
      priority,
      status,
      source: "dashboard",
      group_id: group_id || null,
      assigned_to: assigned_to || null,
      custom_fields,
    });

    // 3. Create the initial article (public message)
    const article = await ticketService.createArticle({
      ticket_id: ticket.id,
      body: articleBody,
      sender_id: customer?.id,
      sender_type: "customer",
      qa_type: "question",
      is_internal: false,
    });
    // 4. Send initial email notification to customer (non-blocking)
    if (c.executionCtx) {
      c.executionCtx.waitUntil((async () => {
        try {
          const emailService = new EmailService(c.env);
          await emailService.sendTicketReply(ticket, article);
        } catch (emailError) {
          console.error("Failed to send initial ticket email:", emailError);
        }
      })());
    }

    return c.json(ticket, 201);
  } catch (error: any) {
    console.error("Dashboard Create Ticket Error:", error);
    return c.json({ error: "Failed to create ticket" }, 500);
  }
});

/**
 * GET /api/tickets
 * List tickets with filters and pagination
 */
dashboard.get("/tickets", async (c) => {
  const options = {
    filterId: c.req.query("filter_id"),
    status: c.req.query("status"),
    priority: c.req.query("priority"),
    assignedTo: c.req.query("assigned_to"),
    groupId: c.req.query("group_id"),
    ticketNo: c.req.query("ticket_no"),
    search: c.req.query("search"),
    page: parseInt(c.req.query("page") || "1"),
    limit: parseInt(c.req.query("limit") || "50"),
  };

  const ticketService = new TicketService(c.env);
  const result = await ticketService.findTickets(options);

  return c.json(result);
});

/**
 * GET /api/tickets/:id
 * Get detailed ticket info with articles and attachments
 */
dashboard.get("/tickets/:id", async (c) => {
  const id = c.req.param("id");

  const ticketService = new TicketService(c.env);
  const ticket = await ticketService.findTicketById(id);

  if (!ticket) {
    return c.json({ error: "Ticket not found" }, 404);
  }

  // Fetch articles
  const { results: articles } = await c.env.DB.prepare(
    "SELECT * FROM articles WHERE ticket_id = ? ORDER BY created_at ASC"
  )
    .bind(id)
    .all<Article>();

  await ticketService.hydrateArticles(articles);

  // Fetch attachments for all articles
  const { results: attachments } = await c.env.DB.prepare(
    `SELECT a.* FROM attachments a 
     JOIN articles art ON a.article_id = art.id 
     WHERE art.ticket_id = ?`
  )
    .bind(id)
    .all<any>();

  // Fetch customer details if available
  let customer = null;
  if (ticket.customer_id) {
    customer = await c.env.DB.prepare(
      "SELECT id, email, role FROM users WHERE id = ?"
    )
      .bind(ticket.customer_id)
      .first<any>();
  }

  // Fetch assignee details
  let assignee = null;
  if (ticket.assigned_to) {
    assignee = await c.env.DB.prepare(
      "SELECT id, email, role FROM users WHERE id = ?"
    )
      .bind(ticket.assigned_to)
      .first<any>();
  }

  // Group attachments by article_id
  const articlesWithAttachments = articles.map((article) => ({
    ...article,
    attachments: attachments.filter((attr: any) => attr.article_id === article.id).map((a: any) => ({ id: a.id, filename: a.file_name, size: a.file_size, contentType: a.content_type, storageKey: a.r2_key })),
  }));

  return c.json({
    ...ticket,
    articles: articlesWithAttachments,
    customer,
    assignee,
  });
});

/**
 * POST /api/tickets/:id/articles
 * Add a new article (agent response or internal note) to a ticket
 */
dashboard.post("/tickets/:id/articles", rateLimiter(10, 60000), async (c) => {
  const ticketId = c.req.param("id");
  const payloadBody = await c.req.json();
  const { body, is_internal, attachments: bodyAttachments } = payloadBody;
  const agent = c.get("jwtPayload") as JWTPayload;

  if (!body) {
    return c.json({ error: "Article body is required" }, 400);
  }

  // Verify ticket exists
  const ticket = await c.env.DB.prepare("SELECT * FROM tickets WHERE id = ?")
    .bind(ticketId)
    .first<Ticket>();

  if (!ticket) {
    return c.json({ error: "Ticket not found" }, 404);
  }

  // RBAC Check: Ensure agents (non-admins) can only post to tickets in their assigned groups.
  // If the ticket is assigned to a group, the agent must be a member of that group.
  if (agent.role === "agent" && ticket.group_id) {
    const groupCheck = await c.env.DB.prepare(
      "SELECT 1 FROM user_groups WHERE user_id = ? AND group_id = ?"
    )
      .bind(agent.sub, ticket.group_id)
      .first<any>();

    if (!groupCheck) {
      return c.json({ error: "Forbidden", message: "You do not have access to this ticket's group" }, 403);
    }
  }

  let ctx;
  try { ctx = c.executionCtx; } catch {}
  const ticketService = new TicketService(c.env, ctx);

  const article = await ticketService.createArticle({
    ticket_id: ticketId,
    sender_id: agent.sub,
    sender_type: "agent",
    body,
    is_internal: is_internal ? true : false,
  });

  // bodyAttachments already extracted above
  const attachments: any[] = [];
  if (Array.isArray(bodyAttachments)) {
    for (const att of bodyAttachments) {
      const storageKey = att.storageKey || att.key;
      
      if (!storageKey || typeof storageKey !== 'string' || !storageKey.startsWith(`agent-attachments/${agent.sub}/`)) {
        return c.json({ error: "Invalid attachment storage key or unauthorized access" }, 403);
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
        r2_key: storageKey
      });
      attachments.push({ id: added.id, filename: added.file_name, size: added.file_size, contentType: added.content_type, storageKey: added.r2_key });
    }
  }

  // Update ticket's updated_at
  await ticketService.updateTicketTimestamp(ticketId);

  if (!is_internal) {
    // 1. Broadcast the update
    const broadcastService = new BroadcastService(c.env);
    await broadcastService.broadcast("article.created", {
      ticketId,
      articleId: article.id,
      senderType: "agent",
      isInternal: false,
    });

    // 2. Send email to customer
    try {
      const emailService = new EmailService(c.env);
      await emailService.sendTicketReply(ticket, article);
    } catch (error) {
      console.error("Failed to send email to customer:", error);
      // We don't fail the request if email fails
    }
  }

  return c.json({ ...article, attachments }, 201);
});

/**
 * PATCH /api/tickets/:id
 * Update ticket properties
 */
dashboard.patch("/tickets/:id", async (c) => {
  const id = c.req.param("id");
  const payload = await c.req.json();
  const agent = c.get("jwtPayload") as JWTPayload;

  const result = updateTicketSchema.safeParse(payload);
  if (!result.success) {
    return c.json({ error: "Validation failed", details: result.error.flatten().fieldErrors }, 400);
  }
  const validData = result.data;

  const allowedFields = ["status", "priority", "assigned_to", "group_id", "custom_fields"] as const;
  const updates: string[] = [];
  const params: any[] = [];

  for (const field of allowedFields) {
    if (validData[field] !== undefined) {
      updates.push(`${field} = ?`);
      if (field === "custom_fields") {
        params.push(validData[field] ? JSON.stringify(validData[field]) : null);
      } else {
        params.push(validData[field]);
      }
    }
  }

  if (updates.length === 0) {
    return c.json({ error: "No valid fields to update" }, 400);
  }

  params.push(id);
  const query = `UPDATE tickets SET ${updates.join(", ")} WHERE id = ?`;
  
  await c.env.DB.prepare(query).bind(...params).run();

  let ctx;
  try { ctx = c.executionCtx; } catch {}
  const ticketService = new TicketService(c.env, ctx);
  await ticketService.updateTicketTimestamp(id);

  // Create a system note for the update
  let updaterName = agent.email;
  const updaterResult = await c.env.DB.prepare("SELECT full_name FROM users WHERE id = ?").bind(agent.sub).first<{full_name: string}>();
  if (updaterResult && updaterResult.full_name) {
    updaterName = updaterResult.full_name;
  }

  const updatesText: string[] = [];
  for (const k of allowedFields) {
    const val = validData[k as keyof typeof validData];
    if (val === undefined) continue;

    if (k === 'assigned_to') {
      if (!val) {
        updatesText.push(`assignee set to Unassigned`);
      } else {
        const assignee = await c.env.DB.prepare("SELECT full_name, email FROM users WHERE id = ?").bind(val).first<{full_name: string, email: string}>();
        updatesText.push(`assignee set to ${assignee?.full_name || assignee?.email || val}`);
      }
    } else if (k === 'group_id') {
      if (!val) {
        updatesText.push(`group set to Unassigned`);
      } else {
        const group = await c.env.DB.prepare("SELECT name FROM groups WHERE id = ?").bind(val).first<{name: string}>();
        updatesText.push(`group set to ${group?.name || val}`);
      }
    } else if (k === 'custom_fields') {
      updatesText.push(`custom fields updated`);
    } else {
      updatesText.push(`${k} set to ${val}`);
    }
  }

  const noteBody = `Ticket updated by ${updaterName}: ${updatesText.join(", ")}`;

  await ticketService.createArticle({
    ticket_id: id,
    sender_id: agent.sub,
    sender_type: "system",
    body: noteBody,
    is_internal: true,
  });

  return c.json({ success: true });
});

/**
 * GET /api/users
 * List all users with pagination and role filter
 */
dashboard.get("/users", permissionGuard("users"), async (c) => {
  const role = c.req.query("role");
  const page = parseInt(c.req.query("page") || "1");
  const limit = parseInt(c.req.query("limit") || "20");
  const offset = (page - 1) * limit;

  let query = "SELECT id, email, full_name, role, mfa_enabled, created_at FROM users";
  const params: any[] = [];

  if (role) {
    query += " WHERE role = ?";
    params.push(role);
  }

  query += " ORDER BY created_at DESC LIMIT ? OFFSET ?";
  params.push(limit, offset);

  const { results } = await c.env.DB.prepare(query)
    .bind(...params)
    .all();

  return c.json({
    users: results,
    page,
    limit,
  });
});

/**
 * GET /api/users/agents
 * List all users with agent or admin role
 */
dashboard.get("/users/agents", async (c) => {
  const { results } = await c.env.DB.prepare(
    "SELECT id, email, full_name, role FROM users WHERE role IN ('admin', 'agent')"
  ).all();
  return c.json(results);
});

/**
 * GET /api/groups
 * List all available groups
 */
dashboard.get("/groups", async (c) => {
  const { results } = await c.env.DB.prepare("SELECT * FROM groups").all();
  return c.json(results);
});

/**
 * POST /api/groups
 * Create a new group (admin only)
 */
dashboard.post("/groups", roleGuard(["admin", "agent"]), permissionGuard("groups"), async (c) => {
  const body = await c.req.json();
  const result = createGroupSchema.safeParse(body);
  
  if (!result.success) {
    return c.json({ error: result.error.errors[0].message }, 400);
  }

  const { name, description } = result.data;
  const id = crypto.randomUUID();
  try {
    await c.env.DB.prepare(
      "INSERT INTO groups (id, name, description) VALUES (?, ?, ?)"
    )
      .bind(id, name, description || null)
      .run();

    const group = await c.env.DB.prepare("SELECT * FROM groups WHERE id = ?")
      .bind(id)
      .first<any>();

    return c.json(group, 201);
  } catch (error: any) {
    if (error.message.includes("UNIQUE constraint failed")) {
      return c.json({ error: "Group with this name already exists" }, 409);
    }
    throw error;
  }
});

/**
 * DELETE /api/groups/:id
 * Delete a group (admin only)
 */
dashboard.delete("/groups/:id", roleGuard(["admin", "agent"]), permissionGuard("groups"), async (c) => {
  const id = c.req.param("id");

  // Check if group exists
  const group = await c.env.DB.prepare("SELECT id FROM groups WHERE id = ?")
    .bind(id)
    .first<any>();
  
  if (!group) {
    return c.json({ error: "Group not found" }, 404);
  }

  // Check if tickets are still assigned to this group (strict check)
  const ticketCount = await c.env.DB.prepare(
    "SELECT COUNT(*) as count FROM tickets WHERE group_id = ?"
  )
    .bind(id)
    .first<{ count: number }>();

  if (ticketCount && ticketCount.count > 0) {
    return c.json(
      { error: "Cannot delete group with associated tickets" },
      400
    );
  }

  // Use batch to ensure atomicity
  await c.env.DB.batch([
    c.env.DB.prepare("DELETE FROM user_groups WHERE group_id = ?").bind(id),
    c.env.DB.prepare("DELETE FROM groups WHERE id = ?").bind(id)
  ]);

  return c.json({ success: true });
});

/**
 * GET /api/groups/:id/members
 * List users belonging to a specific group
 */
dashboard.get("/groups/:id/members", async (c) => {
  const groupId = c.req.param("id");

  // Verify group exists
  const group = await c.env.DB.prepare("SELECT id FROM groups WHERE id = ?")
    .bind(groupId)
    .first<any>();
  if (!group) {
    return c.json({ error: "Group not found" }, 404);
  }

  const { results } = await c.env.DB.prepare(
    `SELECT u.id, u.email, u.full_name, u.role 
     FROM users u 
     JOIN user_groups ug ON u.id = ug.user_id 
     WHERE ug.group_id = ?`
  )
    .bind(groupId)
    .all();

  return c.json(results);
});

/**
 * POST /api/groups/:id/members
 * Add a user to a group (admin only)
 */
dashboard.post("/groups/:id/members", roleGuard(["admin", "agent"]), permissionGuard("groups"), async (c) => {
  const groupId = c.req.param("id");
  const body = await c.req.json();
  const result = addMemberSchema.safeParse(body);

  if (!result.success) {
    return c.json({ error: result.error.errors[0].message }, 400);
  }

  const { userId } = result.data;

  // Verify group exists
  const group = await c.env.DB.prepare("SELECT id FROM groups WHERE id = ?")
    .bind(groupId)
    .first<any>();
  if (!group) {
    return c.json({ error: "Group not found" }, 404);
  }

  // Verify user exists
  const user = await c.env.DB.prepare("SELECT id FROM users WHERE id = ?")
    .bind(userId)
    .first<any>();
  if (!user) {
    return c.json({ error: "User not found" }, 404);
  }

  try {
    await c.env.DB.prepare(
      "INSERT INTO user_groups (user_id, group_id) VALUES (?, ?)"
    )
      .bind(userId, groupId)
      .run();
  } catch (error: any) {
    if (error.message.includes("UNIQUE constraint failed")) {
      return c.json({ error: "User is already a member of this group" }, 409);
    }
    throw error;
  }

  return c.json({ success: true });
});

/**
 * DELETE /api/groups/:id/members/:userId
 * Remove a user from a group (admin only)
 */
dashboard.delete(
  "/groups/:id/members/:userId",
  roleGuard(["admin", "agent"]),
  permissionGuard("groups"),
  async (c) => {
    const groupId = c.req.param("id");
    const userId = c.req.param("userId");

    // Check if the association exists
    const association = await c.env.DB.prepare(
      "SELECT 1 FROM user_groups WHERE user_id = ? AND group_id = ?"
    )
      .bind(userId, groupId)
      .first<any>();

    if (!association) {
      return c.json({ error: "User is not a member of this group" }, 404);
    }

    await c.env.DB.prepare(
      "DELETE FROM user_groups WHERE user_id = ? AND group_id = ?"
    )
      .bind(userId, groupId)
      .run();

    return c.json({ success: true });
  }
);






/**
 * GET /api/attachments/:id/download
 * Download a specific attachment
 */
dashboard.get('/attachments/:id/download', async (c) => {
  const attachmentId = c.req.param('id');
  const agent = c.get('jwtPayload');
  
  const attachment = await c.env.DB.prepare(`
    SELECT a.r2_key, a.file_name, t.group_id
    FROM attachments a
    JOIN articles art ON a.article_id = art.id
    JOIN tickets t ON art.ticket_id = t.id
    WHERE a.id = ?
  `).bind(attachmentId).first<any>();

  if (!attachment) return c.json({ error: 'Not found' }, 404);

  // Group-based RBAC removed as tickets might be serviced by different groups

  const storage = new StorageService(c.env);
  const response = await storage.getAttachment(attachment.r2_key);
  if (!response) return c.json({ error: 'File not found in storage' }, 404);
  
  const newResponse = new Response(response.body, response);
  const safeFileName = (attachment.file_name || 'attachment').replace(/^.*[\\/]/, '').replace(/[\r\n"]/g, '_');
  newResponse.headers.set('Content-Disposition', `attachment; filename="${safeFileName}"`);
  return newResponse;
});

/**
 * POST /api/attachments/upload
 * Upload an attachment
 */
dashboard.post('/attachments/upload', async (c) => {
  const payload = c.get('jwtPayload');

  const MAX_FILE_SIZE = 10 * 1024 * 1024;
  const contentLength = parseInt(c.req.header('content-length') || '0', 10);
  if (contentLength > MAX_FILE_SIZE) {
    return c.json({ error: 'Payload too large. Maximum size is 10MB.' }, 413);
  }

  const formData = await c.req.formData();
  const fileRaw = formData.get('file');

  if (!fileRaw || typeof fileRaw === 'string') {
    return c.json({ error: 'No valid file uploaded' }, 400);
  }
  
  const file = fileRaw as unknown as File;

  if (file.size > MAX_FILE_SIZE) {
    return c.json({ error: 'File too large. Maximum size is 10MB.' }, 413);
  }

  const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf', 'text/plain', 'text/csv'];
  if (!allowedTypes.includes(file.type)) {
    return c.json({ error: 'Unsupported file type. Please upload images, PDFs, or text files.' }, 415);
  }

  const fileExt = file.name.split('.').pop()?.replace(/[^a-zA-Z0-9]/g, '');
  const extPart = fileExt ? `.${fileExt}` : '';
  const key = `agent-attachments/${payload.sub}/${crypto.randomUUID()}${extPart}`;

  try {
    await c.env.ATTACHMENTS_BUCKET.put(key, file.stream(), {
      httpMetadata: { contentType: file.type || 'application/octet-stream' },
    });
    return c.json({ key });
  } catch (error: any) {
    console.error('Error uploading file:', error);
    return c.json({ error: 'Failed to upload file to storage' }, 500);
  }
});

export default dashboard;
