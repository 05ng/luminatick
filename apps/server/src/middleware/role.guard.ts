import { Context, Next } from "hono";
import { Env } from "../bindings";
import { AppVariables } from "../types";

/**
 * Middleware to restrict access based on user role.
 * Should be placed AFTER 'authMiddleware'.
 */
export const roleGuard = (allowedRoles: string[]) => {
  return async (c: Context<{ Bindings: Env; Variables: AppVariables }>, next: Next) => {
    const payload = c.get("jwtPayload");

    if (!payload) {
      return c.json({ error: "Unauthorized", message: "No session found" }, 401);
    }

    if (!allowedRoles.includes(payload.role)) {
      return c.json(
        { error: "Forbidden", message: "Insufficient permissions" },
        403
      );
    }

    await next();
  };
};
