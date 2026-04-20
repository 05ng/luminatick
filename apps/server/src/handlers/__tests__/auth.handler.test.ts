import { describe, it, expect, vi, beforeEach } from "vitest";
import auth from "../auth.handler";
import { authService } from "../../services/auth/auth.service";
import { mfaService } from "../../services/auth/mfa.service";
import * as jose from "jose";
import * as OTPAuth from "otpauth";

// Mock DB
const mockDB = {
  prepare: vi.fn().mockReturnThis(),
  bind: vi.fn().mockReturnThis(),
  first: vi.fn(),
  run: vi.fn(),
};

const JWT_SECRET = "test-secret-key-at-least-32-chars-long-123456";
const MFA_ENCRYPTION_KEY = "test-mfa-encryption-key";

describe("Auth Handler Integration Tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("POST /login", () => {
    it("should login successfully when MFA is disabled", async () => {
      const password = "password123";
      const passwordHash = await authService.hashPassword(password);
      const mockUser = {
        id: "user-1",
        email: "test@example.com",
        password_hash: passwordHash,
        mfa_enabled: 0,
        role: "customer",
        full_name: "Test User",
      };

      mockDB.first.mockResolvedValueOnce(mockUser);

      const res = await auth.request(
        "/login",
        {
          method: "POST",
          body: JSON.stringify({ email: "test@example.com", password }),
          headers: { "Content-Type": "application/json" },
        },
        { DB: mockDB as any, JWT_SECRET, MFA_ENCRYPTION_KEY }
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.mfa_required).toBe(false);
      expect(body.token).toBeDefined();
      expect(body.user.email).toBe(mockUser.email);
      expect(body.user.mfa_enabled).toBe(false);
    });

    it("should return mfa_required when MFA is enabled", async () => {
      const password = "password123";
      const passwordHash = await authService.hashPassword(password);
      const mockUser = {
        id: "user-1",
        email: "mfa@example.com",
        password_hash: passwordHash,
        mfa_enabled: 1,
        role: "admin",
        full_name: "MFA User",
      };

      mockDB.first.mockResolvedValueOnce(mockUser);

      const res = await auth.request(
        "/login",
        {
          method: "POST",
          body: JSON.stringify({ email: "mfa@example.com", password }),
          headers: { "Content-Type": "application/json" },
        },
        { DB: mockDB as any, JWT_SECRET, MFA_ENCRYPTION_KEY }
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.mfa_required).toBe(true);
      expect(body.token).toBeDefined();
      expect(body.user.mfa_enabled).toBe(true);

      // Verify token has mfa_verified = false
      const secretKey = new TextEncoder().encode(JWT_SECRET);
      const { payload } = await jose.jwtVerify(body.token, secretKey);
      expect(payload.mfa_verified).toBe(false);
    });

    it("should return 401 for invalid password", async () => {
      const passwordHash = await authService.hashPassword("correctPassword");
      const mockUser = {
        id: "user-1",
        email: "test@example.com",
        password_hash: passwordHash,
        mfa_enabled: 0,
      };

      mockDB.first.mockResolvedValueOnce(mockUser);

      const res = await auth.request(
        "/login",
        {
          method: "POST",
          body: JSON.stringify({ email: "test@example.com", password: "wrongPassword" }),
          headers: { "Content-Type": "application/json" },
        },
        { DB: mockDB as any, JWT_SECRET, MFA_ENCRYPTION_KEY }
      );

      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.error).toBe("Invalid credentials");
    });

    it("should return 401 for non-existent user", async () => {
      mockDB.first.mockResolvedValueOnce(null);

      const res = await auth.request(
        "/login",
        {
          method: "POST",
          body: JSON.stringify({ email: "nonexistent@example.com", password: "password" }),
          headers: { "Content-Type": "application/json" },
        },
        { DB: mockDB as any, JWT_SECRET, MFA_ENCRYPTION_KEY }
      );

      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.error).toBe("Invalid credentials");
    });
  });

  describe("POST /mfa/verify", () => {
    it("should verify a valid MFA code", async () => {
      const secret = "JBSWY3DPEHPK3PXP";
      const encryptedSecret = await mfaService.encryptSecret(secret, MFA_ENCRYPTION_KEY);
      const mockUser = {
        id: "user-1",
        email: "mfa@example.com",
        mfa_secret: encryptedSecret,
        mfa_enabled: 1,
        role: "admin",
      };

      // Generate a valid code for this secret
      const totp = new OTPAuth.TOTP({
        secret: OTPAuth.Secret.fromBase32(secret),
      });
      const code = totp.generate();

      mockDB.first.mockResolvedValueOnce(mockUser);

      // We need a pre-mfa token to access this route
      const preMfaToken = await authService.generateToken(mockUser as any, JWT_SECRET, false);

      const res = await auth.request(
        "/mfa/verify",
        {
          method: "POST",
          body: JSON.stringify({ code }),
          headers: { 
            "Content-Type": "application/json",
            "Authorization": `Bearer ${preMfaToken}`
          },
        },
        { DB: mockDB as any, JWT_SECRET, MFA_ENCRYPTION_KEY }
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.token).toBeDefined();
      
      // Verify token has mfa_verified = true
      const secretKey = new TextEncoder().encode(JWT_SECRET);
      const { payload } = await jose.jwtVerify(body.token, secretKey);
      expect(payload.mfa_verified).toBe(true);
    });

    it("should return 401 for invalid MFA code", async () => {
      const secret = "JBSWY3DPEHPK3PXP";
      const encryptedSecret = await mfaService.encryptSecret(secret, MFA_ENCRYPTION_KEY);
      const mockUser = {
        id: "user-1",
        email: "mfa@example.com",
        mfa_secret: encryptedSecret,
        mfa_enabled: 1,
      };

      mockDB.first.mockResolvedValueOnce(mockUser);
      const preMfaToken = await authService.generateToken(mockUser as any, JWT_SECRET, false);

      const res = await auth.request(
        "/mfa/verify",
        {
          method: "POST",
          body: JSON.stringify({ code: "000000" }),
          headers: { 
            "Content-Type": "application/json",
            "Authorization": `Bearer ${preMfaToken}`
          },
        },
        { DB: mockDB as any, JWT_SECRET, MFA_ENCRYPTION_KEY }
      );

      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.error).toBe("Invalid MFA code");
    });
  });

  describe("POST /mfa/setup", () => {
    it("should generate MFA secret and URI", async () => {
      const mockUser = {
        id: "user-1",
        email: "setup@example.com",
        mfa_enabled: 0,
      };

      mockDB.first.mockResolvedValueOnce(mockUser);
      mockDB.run.mockResolvedValueOnce({ success: true });

      const token = await authService.generateToken(mockUser as any, JWT_SECRET, true);

      const res = await auth.request(
        "/mfa/setup",
        {
          method: "POST",
          headers: { 
            "Authorization": `Bearer ${token}`
          },
        },
        { DB: mockDB as any, JWT_SECRET, MFA_ENCRYPTION_KEY }
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.provisioning_uri).toContain("otpauth://totp/Luminatick:setup%40example.com");
      
      // Check if DB was updated with the secret
      expect(mockDB.prepare).toHaveBeenCalledWith(expect.stringContaining("UPDATE users SET mfa_secret = ?"));
    });
  });

  describe("POST /mfa/confirm", () => {
    it("should finalize MFA setup with valid code", async () => {
      const secret = "JBSWY3DPEHPK3PXP";
      const encryptedSecret = await mfaService.encryptSecret(secret, MFA_ENCRYPTION_KEY);
      const mockUser = {
        id: "user-1",
        email: "confirm@example.com",
        mfa_secret: encryptedSecret,
        mfa_enabled: 0,
        role: "agent",
      };

      const totp = new OTPAuth.TOTP({
        secret: OTPAuth.Secret.fromBase32(secret),
      });
      const code = totp.generate();

      mockDB.first.mockResolvedValueOnce(mockUser);
      mockDB.run.mockResolvedValueOnce({ success: true });

      const token = await authService.generateToken(mockUser as any, JWT_SECRET, true);

      const res = await auth.request(
        "/mfa/confirm",
        {
          method: "POST",
          body: JSON.stringify({ code }),
          headers: { 
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}`
          },
        },
        { DB: mockDB as any, JWT_SECRET, MFA_ENCRYPTION_KEY }
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.token).toBeDefined();

      // Check if DB was updated to enable MFA
      expect(mockDB.prepare).toHaveBeenCalledWith(expect.stringContaining("UPDATE users SET mfa_enabled = TRUE"));
      });
      });

      describe("POST /mfa/disable", () => {    it("should disable MFA for a user and clear the secret", async () => {
      const mockUser = {
        id: "user-1",
        email: "disable@example.com",
        mfa_enabled: 1,
        mfa_secret: "some-encrypted-secret",
        role: "customer",
      };

      mockDB.first.mockResolvedValueOnce(mockUser);
      mockDB.run.mockResolvedValueOnce({ success: true });

      const token = await authService.generateToken(mockUser as any, JWT_SECRET, true);

      const res = await auth.request(
        "/mfa/disable",
        {
          method: "POST",
          headers: { 
            "Authorization": `Bearer ${token}`
          },
        },
        { DB: mockDB as any, JWT_SECRET, MFA_ENCRYPTION_KEY }
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.user.mfa_enabled).toBe(false);

      // Check if DB was updated to disable MFA and clear secret
      expect(mockDB.prepare).toHaveBeenCalledWith(expect.stringContaining("UPDATE users SET mfa_enabled = FALSE, mfa_secret = NULL"));
    });

    it("should return 404 if user not found", async () => {
      mockDB.first.mockResolvedValueOnce(null);
      const token = await authService.generateToken({ id: "user-1", email: "test@example.com" } as any, JWT_SECRET, true);

      const res = await auth.request(
        "/mfa/disable",
        {
          method: "POST",
          headers: { 
            "Authorization": `Bearer ${token}`
          },
        },
        { DB: mockDB as any, JWT_SECRET, MFA_ENCRYPTION_KEY }
      );

      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error).toBe("User not found");
    });
  });

  describe("GET /me", () => {
    it("should return the current user profile with mfa_enabled status true", async () => {
      const mockUser = {
        id: "user-1",
        email: "me@example.com",
        mfa_enabled: 1,
        role: "agent",
      };

      mockDB.first.mockResolvedValueOnce(mockUser);
      const token = await authService.generateToken(mockUser as any, JWT_SECRET, true);

      const res = await auth.request(
        "/me",
        {
          method: "GET",
          headers: { 
            "Authorization": `Bearer ${token}`
          },
        },
        { DB: mockDB as any, JWT_SECRET, MFA_ENCRYPTION_KEY }
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.user.email).toBe(mockUser.email);
      expect(body.user.mfa_enabled).toBe(true);
    });

    it("should return the current user profile with mfa_enabled status false", async () => {
      const mockUser = {
        id: "user-1",
        email: "me2@example.com",
        mfa_enabled: 0,
        role: "agent",
      };

      mockDB.first.mockResolvedValueOnce(mockUser);
      const token = await authService.generateToken(mockUser as any, JWT_SECRET, true);

      const res = await auth.request(
        "/me",
        {
          method: "GET",
          headers: { 
            "Authorization": `Bearer ${token}`
          },
        },
        { DB: mockDB as any, JWT_SECRET, MFA_ENCRYPTION_KEY }
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.user.email).toBe(mockUser.email);
      expect(body.user.mfa_enabled).toBe(false);
    });
  });
});
