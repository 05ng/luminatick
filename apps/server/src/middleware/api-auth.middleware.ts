import { Context, Next } from "hono";
import { Env } from "../bindings";
import { ApiKeyService } from "../services/auth/apiKey.service";
import { AppVariables } from "../types";

/**
 * Middleware to authenticate requests using an API Key in the X-API-Key header.
 */
export const apiAuthMiddleware = async (c: Context<{ Bindings: Env; Variables: AppVariables }>, next: Next) => {
  const apiKey = c.req.header("X-API-Key");

  if (!apiKey) {
    return c.json({ error: "Missing API Key" }, 401);
  }

  const apiKeyService = new ApiKeyService(c.env);
  const isValid = await apiKeyService.validateKey(apiKey);

  if (!isValid) {
    return c.json({ error: "Invalid or inactive API Key" }, 401);
  }

  await next();
};
