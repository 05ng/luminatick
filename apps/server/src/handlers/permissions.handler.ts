import { Hono } from "hono";
import { Env } from "../bindings";
import { authMiddleware } from "../middleware/auth.middleware";
import { mfaGuard } from "../middleware/mfa.guard";
import { roleGuard } from "../middleware/role.guard";
import { AppVariables } from "../types";
import { z } from "zod";

const permissions = new Hono<{ Bindings: Env; Variables: AppVariables }>();

permissions.use("*", authMiddleware, mfaGuard);

// Schema for updating permissions
const updatePermissionsSchema = z.record(z.boolean());

/**
 * GET /api/permissions
 * Fetch current agent permissions mapping.
 * Both admins and agents can read it, so the frontend can adjust UI.
 */
permissions.get("/", async (c) => {
  const config = await c.env.DB.prepare("SELECT value FROM config WHERE key = 'agent_settings_permissions'").first<{value: string}>();
  const perms = config?.value ? JSON.parse(config.value) : {};
  return c.json(perms);
});

/**
 * PUT /api/permissions
 * Update agent permissions mapping (Admin only).
 */
permissions.put("/", roleGuard(["admin"]), async (c) => {
  const body = await c.req.json();
  const result = updatePermissionsSchema.safeParse(body);
  
  if (!result.success) {
    return c.json({ error: "Invalid permissions format" }, 400);
  }

  await c.env.DB.prepare(
    "INSERT INTO config (key, value, updated_at) VALUES ('agent_settings_permissions', ?, CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP"
  ).bind(JSON.stringify(result.data)).run();

  return c.json({ success: true });
});

export default permissions;
