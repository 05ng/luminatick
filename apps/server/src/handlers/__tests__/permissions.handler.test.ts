import { describe, it, expect, vi, beforeEach } from "vitest";
import permissions from "../permissions.handler";
import * as jose from "jose";

// Mock DB
const mockDB = {
  prepare: vi.fn().mockReturnThis(),
  bind: vi.fn().mockReturnThis(),
  first: vi.fn(),
  run: vi.fn(),
};

const JWT_SECRET = "test-secret-key-at-least-32-chars-long-123456";

async function generateToken(role: "admin" | "agent" | "customer") {
  const secretKey = new TextEncoder().encode(JWT_SECRET);
  return await new jose.SignJWT({
    id: `user-${role}`,
    email: `${role}@example.com`,
    role: role,
    mfa_enabled: false,
    mfa_verified: true, // Bypass MFA guard for these tests
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(secretKey);
}

describe("Permissions Handler Integration Tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("GET /", () => {
    it("should return the current permissions mapping for an admin", async () => {
      const mockPermissions = { can_edit_settings: true, can_delete_tickets: false };
      mockDB.first.mockResolvedValueOnce({ value: JSON.stringify(mockPermissions) });

      const token = await generateToken("admin");

      const res = await permissions.request(
        "/",
        {
          method: "GET",
          headers: { 
            "Authorization": `Bearer ${token}`
          },
        },
        { DB: mockDB as any, JWT_SECRET }
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual(mockPermissions);
      expect(mockDB.prepare).toHaveBeenCalledWith("SELECT value FROM config WHERE key = 'agent_settings_permissions'");
    });

    it("should return the current permissions mapping for an agent", async () => {
      const mockPermissions = { can_edit_settings: false };
      mockDB.first.mockResolvedValueOnce({ value: JSON.stringify(mockPermissions) });

      const token = await generateToken("agent");

      const res = await permissions.request(
        "/",
        {
          method: "GET",
          headers: { 
            "Authorization": `Bearer ${token}`
          },
        },
        { DB: mockDB as any, JWT_SECRET }
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual(mockPermissions);
    });

    it("should return an empty object if no permissions are found", async () => {
      mockDB.first.mockResolvedValueOnce(null);

      const token = await generateToken("admin");

      const res = await permissions.request(
        "/",
        {
          method: "GET",
          headers: { 
            "Authorization": `Bearer ${token}`
          },
        },
        { DB: mockDB as any, JWT_SECRET }
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual({});
    });

    it("should return 401 if no valid token is provided", async () => {
      const res = await permissions.request(
        "/",
        {
          method: "GET",
        },
        { DB: mockDB as any, JWT_SECRET }
      );

      expect(res.status).toBe(401);
    });
  });

  describe("PUT /", () => {
    it("should allow an admin to update permissions", async () => {
      const token = await generateToken("admin");
      const payload = {
        can_edit_settings: true,
        can_manage_users: false
      };

      mockDB.run.mockResolvedValueOnce({ success: true });

      const res = await permissions.request(
        "/",
        {
          method: "PUT",
          body: JSON.stringify(payload),
          headers: { 
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}`
          },
        },
        { DB: mockDB as any, JWT_SECRET }
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);

      expect(mockDB.prepare).toHaveBeenCalledWith(
        "INSERT INTO config (key, value, updated_at) VALUES ('agent_settings_permissions', ?, CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP"
      );
      expect(mockDB.bind).toHaveBeenCalledWith(JSON.stringify(payload));
      expect(mockDB.run).toHaveBeenCalled();
    });

    it("should return 403 if an agent attempts to update permissions", async () => {
      const token = await generateToken("agent");
      const payload = {
        can_edit_settings: true,
      };

      const res = await permissions.request(
        "/",
        {
          method: "PUT",
          body: JSON.stringify(payload),
          headers: { 
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}`
          },
        },
        { DB: mockDB as any, JWT_SECRET }
      );

      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.error).toBe("Forbidden");
    });

    it("should return 403 if a customer attempts to update permissions", async () => {
      const token = await generateToken("customer");
      const payload = { can_edit_settings: true };

      const res = await permissions.request(
        "/",
        {
          method: "PUT",
          body: JSON.stringify(payload),
          headers: { 
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}`
          },
        },
        { DB: mockDB as any, JWT_SECRET }
      );

      expect(res.status).toBe(403);
    });

    it("should return 400 if the payload is invalid", async () => {
      const token = await generateToken("admin");
      const invalidPayload = {
        can_edit_settings: "yes", // should be boolean
      };

      const res = await permissions.request(
        "/",
        {
          method: "PUT",
          body: JSON.stringify(invalidPayload),
          headers: { 
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}`
          },
        },
        { DB: mockDB as any, JWT_SECRET }
      );

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe("Invalid permissions format");
      expect(mockDB.run).not.toHaveBeenCalled();
    });
  });
});
