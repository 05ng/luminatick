import { Hono } from "hono";
import { Env } from "../bindings";
import { authService } from "../services/auth/auth.service";
import { mfaService } from "../services/auth/mfa.service";
import { User, JWTPayload, AppVariables } from "../types";
import { authMiddleware } from "../middleware/auth.middleware";
import { rateLimiter } from "../middleware/rate-limiter";

const auth = new Hono<{ Bindings: Env; Variables: AppVariables }>();

/**
 * Stage 1: Login with credentials
 */
auth.post("/login", rateLimiter(5, 60000), async (c) => {
  const { email, password } = await c.req.json();

  if (!email || !password) {
    return c.json({ error: "Email and password are required" }, 400);
  }

  // Fetch user from DB
  const user = await c.env.DB.prepare(
    "SELECT * FROM users WHERE email = ?"
  )
    .bind(email)
    .first<User>();

  if (!user || !user.password_hash) {
    return c.json({ error: "Invalid credentials" }, 401);
  }

  const isValid = await authService.verifyPassword(password, user.password_hash);
  if (!isValid) {
    return c.json({ error: "Invalid credentials" }, 401);
  }

  const isAgentOrAdmin = user.role === 'admin' || user.role === 'agent';
  const requiresMfa = user.mfa_enabled || isAgentOrAdmin;

  // If MFA is required, return a short-lived pre-mfa token
  if (requiresMfa) {
    const preMfaToken = await authService.generateToken(
      user,
      c.env.JWT_SECRET,
      false, // mfa_verified = false
      "15m" // Give extra time for setup
    );

    return c.json({
      mfa_required: true,
      token: preMfaToken,
      user: {
        id: user.id,
        email: user.email,
        full_name: user.full_name,
        role: user.role,
        mfa_enabled: !!user.mfa_enabled,
      },
    });
  }

  // If MFA is not required and not enabled, return a full token
  const fullToken = await authService.generateToken(
    user,
    c.env.JWT_SECRET,
    true // mfa_verified = true
  );

  return c.json({
    mfa_required: false,
    token: fullToken,
    user: {
      id: user.id,
      email: user.email,
      full_name: user.full_name,
      role: user.role,
      mfa_enabled: !!user.mfa_enabled,
    },
  });
});

/**
 * Stage 2: Verify MFA code
 */
auth.post("/mfa/verify", authMiddleware, rateLimiter(10, 60000), async (c) => {
  const payload = c.get("jwtPayload") as JWTPayload;
  const { code } = await c.req.json();

  if (!code) {
    return c.json({ error: "MFA code is required" }, 400);
  }

  // Fetch user from DB
  const user = await c.env.DB.prepare("SELECT * FROM users WHERE id = ?")
    .bind(payload.sub)
    .first<User>();

  if (!user || !user.mfa_secret || !user.mfa_enabled) {
    return c.json({ error: "MFA is not set up for this user" }, 400);
  }

  // Decrypt the secret
  let decryptedSecret: string;
  try {
    decryptedSecret = await mfaService.decryptSecret(user.mfa_secret, c.env.MFA_ENCRYPTION_KEY);
  } catch (err) {
    return c.json({ error: "Failed to decrypt MFA secret" }, 500);
  }

  const isValid = mfaService.verifyCode(code, decryptedSecret);
  if (!isValid) {
    return c.json({ error: "Invalid MFA code" }, 401);
  }

  // Generate a long-lived full token
  const fullToken = await authService.generateToken(
    user,
    c.env.JWT_SECRET,
    true // mfa_verified = true
  );

  return c.json({
    token: fullToken,
    user: {
      id: user.id,
      email: user.email,
      full_name: user.full_name,
      role: user.role,
      mfa_enabled: !!user.mfa_enabled,
    },
  });
});

/**
 * Stage 3: Setup MFA
 */
auth.post("/mfa/setup", authMiddleware, async (c) => {
  const payload = c.get("jwtPayload") as JWTPayload;

  // Check if MFA is already enabled
  const user = await c.env.DB.prepare("SELECT * FROM users WHERE id = ?")
    .bind(payload.sub)
    .first<User>();

  if (!user) {
    return c.json({ error: "User not found" }, 404);
  }

  if (user.mfa_enabled) {
    return c.json({ error: "MFA is already enabled" }, 400);
  }

  const secret = mfaService.generateSecret();
  const uri = mfaService.getProvisioningUri(user.email, secret);
  const encryptedSecret = await mfaService.encryptSecret(secret, c.env.MFA_ENCRYPTION_KEY);

  // Store the secret temporarily (or permanently but not yet enabled)
  await c.env.DB.prepare(
    "UPDATE users SET mfa_secret = ? WHERE id = ?"
  )
    .bind(encryptedSecret, user.id)
    .run();

  return c.json({
    provisioning_uri: uri,
  });
});

/**
 * Stage 3: Confirm MFA
 */
auth.post("/mfa/confirm", authMiddleware, async (c) => {
  const payload = c.get("jwtPayload") as JWTPayload;
  const { code } = await c.req.json();

  if (!code) {
    return c.json({ error: "MFA code is required" }, 400);
  }

  const user = await c.env.DB.prepare("SELECT * FROM users WHERE id = ?")
    .bind(payload.sub)
    .first<User>();

  if (!user || !user.mfa_secret) {
    return c.json({ error: "MFA setup has not been initiated" }, 400);
  }

  // Decrypt the secret
  let decryptedSecret: string;
  try {
    decryptedSecret = await mfaService.decryptSecret(user.mfa_secret, c.env.MFA_ENCRYPTION_KEY);
  } catch (err) {
    return c.json({ error: "Failed to decrypt MFA secret" }, 500);
  }

  const isValid = mfaService.verifyCode(code, decryptedSecret);
  if (!isValid) {
    return c.json({ error: "Invalid MFA code" }, 401);
  }

  // Finalize MFA enablement
  await c.env.DB.prepare(
    "UPDATE users SET mfa_enabled = TRUE WHERE id = ?"
  )
    .bind(user.id)
    .run();

  // Generate a new full token
  const fullToken = await authService.generateToken(
    user,
    c.env.JWT_SECRET,
    true
  );

  return c.json({
    token: fullToken,
    user: {
      id: user.id,
      email: user.email,
      full_name: user.full_name,
      role: user.role,
      mfa_enabled: true,
    },
  });
});

/**
 * Disable MFA
 */
auth.post("/mfa/disable", authMiddleware, async (c) => {
  const payload = c.get("jwtPayload") as JWTPayload;

  if (payload.role === "admin" || payload.role === "agent") {
    return c.json({ error: "MFA is mandatory for agents and administrators and cannot be disabled." }, 403);
  }

  const user = await c.env.DB.prepare("SELECT * FROM users WHERE id = ?")
    .bind(payload.sub)
    .first<User>();

  if (!user) {
    return c.json({ error: "User not found" }, 404);
  }

  await c.env.DB.prepare(
    "UPDATE users SET mfa_enabled = FALSE, mfa_secret = NULL WHERE id = ?"
  )
    .bind(user.id)
    .run();

  return c.json({
    user: {
      id: user.id,
      email: user.email,
      full_name: user.full_name,
      role: user.role,
      mfa_enabled: false,
    },
  });
});

/**
 * Get current user (me)
 */
auth.get("/me", authMiddleware, async (c) => {
  const payload = c.get("jwtPayload") as JWTPayload;

  const user = await c.env.DB.prepare("SELECT * FROM users WHERE id = ?")
    .bind(payload.sub)
    .first<User>();

  if (!user) {
    return c.json({ error: "User not found" }, 404);
  }

  return c.json({
    user: {
      id: user.id,
      email: user.email,
      full_name: user.full_name,
      role: user.role,
      mfa_enabled: !!user.mfa_enabled,
    },
  });
});

export default auth;
