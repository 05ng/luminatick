import { describe, it, expect } from "vitest";
import { Hono } from "hono";
import { mfaGuard } from "../mfa.guard";

describe("mfaGuard", () => {
  it("should call next() if mfa_verified is true", async () => {
    const app = new Hono();
    app.use("*", async (c, next) => {
      c.set("jwtPayload", {
        sub: "user-1",
        email: "test@example.com",
        role: "admin",
        mfa_verified: true,
      });
      await next();
    });
    app.use("*", mfaGuard);
    app.get("/protected", (c) => c.text("OK"));

    const res = await app.request("/protected");
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("OK");
  });

  it("should return 403 if mfa_verified is false", async () => {
    const app = new Hono();
    app.use("*", async (c, next) => {
      c.set("jwtPayload", {
        sub: "user-1",
        email: "test@example.com",
        role: "admin",
        mfa_verified: false,
      });
      await next();
    });
    app.use("*", mfaGuard);
    app.get("/protected", (c) => c.text("OK"));

    const res = await app.request("/protected");
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("Forbidden");
    expect(body.message).toBe("MFA verification required");
  });

  it("should return 401 if no jwtPayload is found", async () => {
    const app = new Hono();
    // No middleware to set jwtPayload
    app.use("*", mfaGuard);
    app.get("/protected", (c) => c.text("OK"));

    const res = await app.request("/protected");
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Unauthorized");
    expect(body.message).toBe("No session found");
  });
});
