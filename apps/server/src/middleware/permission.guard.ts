import { Context, Next } from "hono";
import { Env } from "../bindings";
import { AppVariables } from "../types";

export const permissionGuard = (settingKey: string) => {
  return async (c: Context<{ Bindings: Env; Variables: AppVariables }>, next: Next) => {
    const payload = c.get("jwtPayload");

    if (!payload) {
      return c.json({ error: "Unauthorized", message: "No session found" }, 401);
    }

    if (payload.role === "admin") {
      return await next();
    }

    if (payload.role !== "agent") {
      return c.json({ error: "Forbidden", message: "Insufficient permissions" }, 403);
    }

    // Agent check
    try {
      const config = await c.env.DB.prepare("SELECT value FROM config WHERE key = 'agent_settings_permissions'").first<{value: string}>();
      const permissions = config?.value ? JSON.parse(config.value) : {};
      
      if (permissions[settingKey] === true) {
        return await next();
      }
    } catch (e) {
      console.error("Error parsing agent_settings_permissions", e);
    }

    return c.json({ error: "Forbidden", message: `Agent missing permission: ${settingKey}` }, 403);
  };
};
