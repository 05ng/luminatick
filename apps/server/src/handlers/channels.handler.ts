import { Hono } from "hono";
import { Env } from "../bindings";
import { authMiddleware } from "../middleware/auth.middleware";
import { mfaGuard } from "../middleware/mfa.guard";
import { roleGuard } from "../middleware/role.guard";
import { permissionGuard } from "../middleware/permission.guard";
import { AppVariables } from "../types";
import { z } from "zod";

const channels = new Hono<{ Bindings: Env; Variables: AppVariables }>();

// Apply auth, MFA, and role-based access control
channels.use("*", authMiddleware, mfaGuard, roleGuard(["admin", "agent"]), permissionGuard("channels_email"));

const createEmailSchema = z.object({
  email_address: z.string().email("Invalid email address"),
  name: z.string().optional(),
  group_id: z.string().uuid().optional().nullable(),
  is_default: z.boolean().default(false),
});

/**
 * GET /api/channels/emails
 * List all support email addresses
 */
channels.get("/emails", async (c) => {
  const { results } = await c.env.DB.prepare("SELECT * FROM support_emails ORDER BY created_at ASC").all();
  return c.json(results);
});

/**
 * POST /api/channels/emails
 * Add a new support email address
 */
channels.post("/emails", async (c) => {
  const body = await c.req.json();
  const result = createEmailSchema.safeParse(body);
  if (!result.success) {
    return c.json({ error: result.error.errors[0].message }, 400);
  }

  const { email_address, name, group_id, is_default } = result.data;
  const id = crypto.randomUUID();

  try {
    if (is_default) {
      await c.env.DB.batch([
        c.env.DB.prepare("UPDATE support_emails SET is_default = 0"),
        c.env.DB.prepare(
          "INSERT INTO support_emails (id, email_address, name, group_id, is_default) VALUES (?, ?, ?, ?, ?)"
        ).bind(id, email_address, name || null, group_id || null, 1)
      ]);
    } else {
      await c.env.DB.prepare(
        "INSERT INTO support_emails (id, email_address, name, group_id, is_default) VALUES (?, ?, ?, ?, ?)"
      ).bind(id, email_address, name || null, group_id || null, 0).run();
    }

    const email = await c.env.DB.prepare("SELECT * FROM support_emails WHERE id = ?").bind(id).first();
    return c.json(email, 201);
  } catch (error: any) {
    if (error.message.includes("UNIQUE constraint failed")) {
      return c.json({ error: "Email address already exists" }, 409);
    }
    throw error;
  }
});

/**
 * DELETE /api/channels/emails/:id
 * Remove a support email address
 */
channels.delete("/emails/:id", async (c) => {
  const id = c.req.param("id");
  const idSchema = z.string().uuid();
  const result = idSchema.safeParse(id);
  
  if (!result.success) {
    return c.json({ error: "Invalid ID format" }, 400);
  }

  await c.env.DB.prepare("DELETE FROM support_emails WHERE id = ?").bind(id).run();

  return c.json({ success: true });
});

export default channels;
