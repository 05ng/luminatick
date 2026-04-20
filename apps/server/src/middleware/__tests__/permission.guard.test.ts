import { describe, it, expect, vi } from "vitest";
import { Hono } from "hono";
import { permissionGuard } from "../permission.guard";

describe("permissionGuard", () => {
  it("should return 401 if no jwtPayload is found", async () => {
    const app = new Hono();
    // No middleware to set jwtPayload
    app.use("*", permissionGuard("can_edit_settings"));
    app.get("/protected", (c) => c.text("OK"));

    const res = await app.request("/protected");
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Unauthorized");
    expect(body.message).toBe("No session found");
  });

  it("should call next() if user is admin", async () => {
    const app = new Hono();
    app.use("*", async (c, next) => {
      c.set("jwtPayload", {
        sub: "user-1",
        role: "admin",
      });
      await next();
    });
    app.use("*", permissionGuard("can_edit_settings"));
    app.get("/protected", (c) => c.text("OK"));

    const res = await app.request("/protected");
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("OK");
  });

  it("should return 403 if user is neither admin nor agent", async () => {
    const app = new Hono();
    app.use("*", async (c, next) => {
      c.set("jwtPayload", {
        sub: "user-1",
        role: "customer",
      });
      await next();
    });
    app.use("*", permissionGuard("can_edit_settings"));
    app.get("/protected", (c) => c.text("OK"));

    const res = await app.request("/protected");
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("Forbidden");
    expect(body.message).toBe("Insufficient permissions");
  });

  it("should call next() if agent has the required permission", async () => {
    const mockDB = {
      prepare: vi.fn().mockReturnThis(),
      first: vi.fn().mockResolvedValue({ value: JSON.stringify({ can_edit_settings: true }) }),
    };

    const app = new Hono();
    app.use("*", async (c, next) => {
      c.set("jwtPayload", {
        sub: "user-1",
        role: "agent",
      });
      // Mock environment
      c.env = { DB: mockDB };
      await next();
    });
    app.use("*", permissionGuard("can_edit_settings"));
    app.get("/protected", (c) => c.text("OK"));

    const res = await app.request("/protected");
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("OK");
    expect(mockDB.prepare).toHaveBeenCalledWith("SELECT value FROM config WHERE key = 'agent_settings_permissions'");
  });

  it("should return 403 if agent does not have the required permission", async () => {
    const mockDB = {
      prepare: vi.fn().mockReturnThis(),
      first: vi.fn().mockResolvedValue({ value: JSON.stringify({ can_edit_settings: false, other_perm: true }) }),
    };

    const app = new Hono();
    app.use("*", async (c, next) => {
      c.set("jwtPayload", {
        sub: "user-1",
        role: "agent",
      });
      c.env = { DB: mockDB };
      await next();
    });
    app.use("*", permissionGuard("can_edit_settings"));
    app.get("/protected", (c) => c.text("OK"));

    const res = await app.request("/protected");
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("Forbidden");
    expect(body.message).toBe("Agent missing permission: can_edit_settings");
  });

  it("should return 403 if there is a DB error or config is missing", async () => {
    const mockDB = {
      prepare: vi.fn().mockReturnThis(),
      first: vi.fn().mockResolvedValue(null), // no config found
    };

    const app = new Hono();
    app.use("*", async (c, next) => {
      c.set("jwtPayload", {
        sub: "user-1",
        role: "agent",
      });
      c.env = { DB: mockDB };
      await next();
    });
    app.use("*", permissionGuard("can_edit_settings"));
    app.get("/protected", (c) => c.text("OK"));

    const res = await app.request("/protected");
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("Forbidden");
    expect(body.message).toBe("Agent missing permission: can_edit_settings");
  });
  
  it("should return 403 gracefully if DB lookup throws an exception", async () => {
    const mockDB = {
      prepare: vi.fn().mockReturnThis(),
      first: vi.fn().mockRejectedValue(new Error("DB Connection Error")), 
    };

    const app = new Hono();
    app.use("*", async (c, next) => {
      c.set("jwtPayload", {
        sub: "user-1",
        role: "agent",
      });
      c.env = { DB: mockDB };
      await next();
    });
    app.use("*", permissionGuard("can_edit_settings"));
    app.get("/protected", (c) => c.text("OK"));

    const res = await app.request("/protected");
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("Forbidden");
    expect(body.message).toBe("Agent missing permission: can_edit_settings");
  });
});
