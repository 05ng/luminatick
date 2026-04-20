import { Hono } from "hono";
import { Env } from "../bindings";
import { authMiddleware } from "../middleware/auth.middleware";
import { mfaGuard } from "../middleware/mfa.guard";
import { roleGuard } from "../middleware/role.guard";
import { permissionGuard } from "../middleware/permission.guard";
import { AppVariables } from "../types";
import { z } from "zod";
import filters from "./filters.handler";
import { CloudflareService } from "../services/cloudflare.service";
import { encryptString, decryptString } from "../utils/crypto";

const settings = new Hono<{ Bindings: Env; Variables: AppVariables }>();

// Apply auth and MFA globally
settings.use("*", authMiddleware, mfaGuard);

// Mount filters router
settings.route("/filters", filters);

const updateSettingsSchema = z.record(
  z.string()
    .min(1, "Key cannot be empty")
    .max(100, "Key is too long")
    .regex(/^[A-Z0-9_]+$/, "Key must be uppercase alphanumeric and underscores only"),
  z.string()
    .max(5000, "Value is too long")
);

const settingsPayloadSchema = z.record(z.unknown()).refine(data => Object.keys(data).length <= 50, {
  message: "Too many settings provided",
});

/**
 * Helper to determine if a setting key is sensitive
 */
function isSensitiveKey(key: string): boolean {
  if (key === 'TURNSTILE_SITE_KEY') return false;
  return key.endsWith('_TOKEN') || key.endsWith('_KEY') || key.endsWith('_SECRET') || key.includes('PASSWORD') || key.includes('_ACCESS_KEY_');
}

/**
 * GET /api/settings/usage
 * Fetch usage stats from Cloudflare GraphQL Analytics API
 */
settings.get("/usage", roleGuard(["admin"]), async (c) => {
  try {
    const cfService = new CloudflareService(c.env);
    const stats = await cfService.getUsageStats();
    return c.json(stats);
  } catch (err: any) {
    if (err.message === 'Cloudflare credentials not configured') {
      return c.json({ error: err.message }, 400);
    }
    return c.json({ error: err.message }, 500);
  }
});

/**
 * GET /api/settings
 * Fetch all global settings as a key-value object
 */
settings.get("/", roleGuard(["admin", "agent"]), permissionGuard("general"), async (c) => {
  const { results } = await c.env.DB.prepare("SELECT key, value FROM config").all();
  const settingsObj: Record<string, string> = {};
  
  for (const row of results as { key: string; value: string }[]) {
    if (isSensitiveKey(row.key) && row.value) {
      if (!c.env.APP_MASTER_KEY) {
        return c.json({ error: "APP_MASTER_KEY is missing. Cannot verify settings." }, 500);
      }
      settingsObj[row.key] = "••••••••"; // Mask sensitive values
    } else {
      settingsObj[row.key] = row.value;
    }
  }
  return c.json(settingsObj);
});

/**
 * PUT /api/settings
 * Update multiple global settings
 */
settings.put("/", roleGuard(["admin", "agent"]), permissionGuard("general"), async (c) => {
  const body = await c.req.json();
  const payloadResult = settingsPayloadSchema.safeParse(body);
  if (!payloadResult.success) {
    return c.json({ error: payloadResult.error.errors[0].message }, 400);
  }

  const result = updateSettingsSchema.safeParse(body);
  if (!result.success) {
    return c.json({ error: result.error.errors[0].message }, 400);
  }

  const updates = result.data;
  const statements = [];

  for (let [key, value] of Object.entries(updates)) {
    // Prevent modification of agent_settings_permissions via general settings endpoint
    if (key === 'agent_settings_permissions') {
      return c.json({ error: "Cannot modify agent permissions via this endpoint" }, 403);
    }

    // Skip updating if the value is the mask placeholder
    if (isSensitiveKey(key) && value === "••••••••") {
      continue;
    }

    if (isSensitiveKey(key) && value) {
      if (!c.env.APP_MASTER_KEY) {
        return c.json({ error: "APP_MASTER_KEY is missing. Cannot encrypt sensitive settings." }, 500);
      }
      value = await encryptString(value, c.env.APP_MASTER_KEY);
    }

    statements.push(
      c.env.DB.prepare(
        "INSERT INTO config (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP"
      ).bind(key, value)
    );
  }

  if (statements.length > 0) {
    await c.env.DB.batch(statements);
  }

  return c.json({ success: true });
});

export default settings;
