import { describe, it, expect, vi, beforeEach } from "vitest";
import settings from "../settings.handler";
import * as jose from "jose";
import { encryptString } from "../../utils/crypto";

// Mock DB
const mockDB = {
  prepare: vi.fn().mockReturnThis(),
  bind: vi.fn().mockReturnThis(),
  all: vi.fn(),
  batch: vi.fn(),
};

const JWT_SECRET = "test-secret-key-at-least-32-chars-long-123456";
const APP_MASTER_KEY = "test-master-key-that-is-long-enough-for-aes";

async function generateAdminToken() {
  const secretKey = new TextEncoder().encode(JWT_SECRET);
  return await new jose.SignJWT({
    id: "admin-1",
    email: "admin@example.com",
    role: "admin",
    mfa_enabled: false,
    mfa_verified: true,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(secretKey);
}

describe("Settings Handler Integration Tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("GET /api/settings", () => {
    it("should return settings and mask sensitive values", async () => {
      const mockSettings = [
        { key: "APP_NAME", value: "Luminatick" },
        { key: "RESEND_API_KEY", value: "super-secret-key" },
        { key: "OPENAI_SECRET", value: "another-secret" },
        { key: "PUBLIC_URL", value: "https://example.com" },
      ];

      mockDB.all.mockResolvedValueOnce({ results: mockSettings });
      const token = await generateAdminToken();

      const res = await settings.request(
        "/",
        {
          method: "GET",
          headers: { 
            "Authorization": `Bearer ${token}`
          },
        },
        { DB: mockDB as any, JWT_SECRET, APP_MASTER_KEY }
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.APP_NAME).toBe("Luminatick");
      expect(body.PUBLIC_URL).toBe("https://example.com");
      expect(body.RESEND_API_KEY).toBe("••••••••");
      expect(body.OPENAI_SECRET).toBe("••••••••");
    });

    it("should return 500 if APP_MASTER_KEY is missing but sensitive values exist", async () => {
      const mockSettings = [
        { key: "RESEND_API_KEY", value: "super-secret-key" },
      ];

      mockDB.all.mockResolvedValueOnce({ results: mockSettings });
      const token = await generateAdminToken();

      const res = await settings.request(
        "/",
        {
          method: "GET",
          headers: { 
            "Authorization": `Bearer ${token}`
          },
        },
        { DB: mockDB as any, JWT_SECRET } // Missing APP_MASTER_KEY
      );

      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.error).toBe("APP_MASTER_KEY is missing. Cannot verify settings.");
    });
  });

  describe("PUT /api/settings", () => {
    it("should update settings and encrypt sensitive values", async () => {
      mockDB.batch.mockResolvedValueOnce([{ success: true }]);
      const token = await generateAdminToken();

      const payload = {
        APP_NAME: "New Luminatick",
        RESEND_API_KEY: "new-super-secret-key",
      };

      const res = await settings.request(
        "/",
        {
          method: "PUT",
          body: JSON.stringify(payload),
          headers: { 
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}`
          },
        },
        { DB: mockDB as any, JWT_SECRET, APP_MASTER_KEY }
      );

      expect(res.status).toBe(200);
      
      // Check that DB.prepare was called twice (once for each key)
      expect(mockDB.prepare).toHaveBeenCalledTimes(2);
      
      // Check that DB.bind was called with the unencrypted and encrypted values respectively
      // Because we don't know the exact encrypted value, we check it's not the plaintext
      expect(mockDB.bind).toHaveBeenNthCalledWith(1, "APP_NAME", "New Luminatick");
      
      const resendBindCall = vi.mocked(mockDB.bind).mock.calls[1];
      expect(resendBindCall[0]).toBe("RESEND_API_KEY");
      expect(resendBindCall[1]).not.toBe("new-super-secret-key"); // Should be encrypted
      expect(typeof resendBindCall[1]).toBe("string");
      expect(resendBindCall[1].length).toBeGreaterThan("new-super-secret-key".length);

      expect(mockDB.batch).toHaveBeenCalledTimes(1);
    });

    it("should skip updating sensitive settings if value is ••••••••", async () => {
      mockDB.batch.mockResolvedValueOnce([{ success: true }]);
      const token = await generateAdminToken();

      const payload = {
        APP_NAME: "Updated Name",
        RESEND_API_KEY: "••••••••", // Masked placeholder
      };

      const res = await settings.request(
        "/",
        {
          method: "PUT",
          body: JSON.stringify(payload),
          headers: { 
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}`
          },
        },
        { DB: mockDB as any, JWT_SECRET, APP_MASTER_KEY }
      );

      expect(res.status).toBe(200);
      
      // Check that DB.prepare was called only once (for APP_NAME)
      expect(mockDB.prepare).toHaveBeenCalledTimes(1);
      expect(mockDB.bind).toHaveBeenCalledWith("APP_NAME", "Updated Name");
      expect(mockDB.batch).toHaveBeenCalledTimes(1);
    });

    it("should return 500 if trying to update sensitive settings without APP_MASTER_KEY", async () => {
      const token = await generateAdminToken();

      const payload = {
        RESEND_API_KEY: "new-super-secret-key",
      };

      const res = await settings.request(
        "/",
        {
          method: "PUT",
          body: JSON.stringify(payload),
          headers: { 
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}`
          },
        },
        { DB: mockDB as any, JWT_SECRET } // Missing APP_MASTER_KEY
      );

      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.error).toBe("APP_MASTER_KEY is missing. Cannot encrypt sensitive settings.");
    });
  });
});
