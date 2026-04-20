import { Context, Next } from "hono";
import { Env } from "../bindings";
import { AppVariables } from "../types";

/**
 * Middleware to enforce the 'mfa_verified' claim in the JWT.
 * Should be placed AFTER 'authMiddleware'.
 */
export const mfaGuard = async (c: Context<{ Bindings: Env; Variables: AppVariables }>, next: Next) => {
  const payload = c.get("jwtPayload");

  if (!payload) {
    return c.json({ error: "Unauthorized", message: "No session found" }, 401);
  }

  if (payload.mfa_verified === false) {
    return c.json(
      { error: "Forbidden", message: "MFA verification required" },
      403
    );
  }

  await next();
};
