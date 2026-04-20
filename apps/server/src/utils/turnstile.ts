import { Env } from "../bindings";
import { decryptString } from "./crypto";

/**
 * Verifies a Cloudflare Turnstile token if the TURNSTILE_SECRET_KEY is configured.
 * 
 * @param env The environment bindings (contains DB and APP_MASTER_KEY)
 * @param token The turnstile token provided by the client
 * @param ip The client's IP address (optional)
 * @returns true if valid or if Turnstile is disabled, false if invalid
 */
export async function verifyTurnstileToken(env: Env, token?: string, ip?: string): Promise<boolean> {
  const secretKeyResult = await env.DB.prepare("SELECT value FROM config WHERE key = 'TURNSTILE_SECRET_KEY' LIMIT 1").first<{value: string}>();
  
  if (!secretKeyResult?.value) {
    // Turnstile is disabled
    return true;
  }

  if (!env.APP_MASTER_KEY) {
    throw new Error("Server misconfiguration: APP_MASTER_KEY is missing.");
  }

  if (!token) {
    // Token is required when Turnstile is enabled
    return false;
  }

  const secretKey = await decryptString(secretKeyResult.value, env.APP_MASTER_KEY);
  
  const formData = new FormData();
  formData.append('secret', secretKey);
  formData.append('response', token);
  if (ip) {
    formData.append('remoteip', ip);
  }
  
  const turnstileRes = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    body: formData,
  });
  
  const turnstileData = await turnstileRes.json() as { success: boolean };
  return turnstileData.success === true;
}
