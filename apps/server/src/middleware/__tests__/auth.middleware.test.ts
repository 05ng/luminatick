import { describe, it, expect } from "vitest";
import { Hono } from "hono";
import { authMiddleware } from "../auth.middleware";
import * as jose from "jose";

const JWT_SECRET = "test-secret-key-at-least-32-chars-long-123456";

describe("authMiddleware", () => {
  const app = new Hono<{ Bindings: { JWT_SECRET: string } }>();
  app.use("*", authMiddleware);
  app.get("/protected", (c) => c.text("OK"));

  it("should return 200 for a valid JWT", async () => {
    const secret = new TextEncoder().encode(JWT_SECRET);
    const token = await new jose.SignJWT({
      sub: "user-1",
      email: "test@example.com",
      role: "admin",
      mfa_verified: true,
    })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("2h")
      .sign(secret);

    const res = await app.request(
      "/protected",
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
      {
        JWT_SECRET,
      }
    );

    expect(res.status).toBe(200);
    expect(await res.text()).toBe("OK");
  });

  it("should return 401 for an expired token", async () => {
    const secret = new TextEncoder().encode(JWT_SECRET);
    const token = await new jose.SignJWT({
      sub: "user-1",
      email: "test@example.com",
      role: "admin",
      mfa_verified: true,
    })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt(Math.floor(Date.now() / 1000) - 3600) // 1 hour ago
      .setExpirationTime(Math.floor(Date.now() / 1000) - 1800) // 30 mins ago
      .sign(secret);

    const res = await app.request(
      "/protected",
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
      {
        JWT_SECRET,
      }
    );

    expect(res.status).toBe(401);
  });

  it("should return 401 for a tampered token", async () => {
    const secret = new TextEncoder().encode(JWT_SECRET);
    const token = await new jose.SignJWT({
      sub: "user-1",
      email: "test@example.com",
      role: "admin",
      mfa_verified: true,
    })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("2h")
      .sign(secret);

    const tamperedToken = token.replace('.', '.invalid.');

    const res = await app.request(
      "/protected",
      {
        headers: {
          Authorization: `Bearer ${tamperedToken}`,
        },
      },
      {
        JWT_SECRET,
      }
    );

    expect(res.status).toBe(401);
  });

  it("should return 401 for no token", async () => {
    const res = await app.request(
      "/protected",
      {},
      {
        JWT_SECRET,
      }
    );

    expect(res.status).toBe(401);
  });
});
