import { Context, Next } from "hono";
import { Env } from "../bindings";

/**
 * Simple in-memory rate limiter for Cloudflare Workers.
 * Note: This is per-isolate. For a truly distributed rate limiter, 
 * use Cloudflare's rate limiting service or a Durable Object.
 */
const rateLimitMap = new Map<string, { count: number; reset: number }>();

export const rateLimiter = (limit: number, windowMs: number) => {
  return async (c: Context<{ Bindings: Env; Variables: any }>, next: Next) => {
    // Skip rate limiting if disabled via environment variable
    if (c.env.DISABLE_RATE_LIMIT === "true") {
      return await next();
    }

    const ip = c.req.header("cf-connecting-ip") || "unknown";
    const key = `${ip}:${c.req.path}`;
    const now = Date.now();

    const record = rateLimitMap.get(key);

    if (!record || now > record.reset) {
      rateLimitMap.set(key, { count: 1, reset: now + windowMs });
    } else {
      record.count++;
      if (record.count > limit) {
        return c.json({ error: "Too many requests, please try again later." }, 429);
      }
    }

    await next();
  };
};
