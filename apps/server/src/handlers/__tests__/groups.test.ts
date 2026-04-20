import { describe, it, expect, vi, beforeEach } from "vitest";
import dashboard from "../dashboard.handler";
import { authService } from "../../services/auth/auth.service";

// Mock DB
const mockDB = {
  prepare: vi.fn().mockReturnThis(),
  bind: vi.fn().mockReturnThis(),
  all: vi.fn(),
  first: vi.fn(),
  run: vi.fn(),
  batch: vi.fn(),
};

const JWT_SECRET = "test-secret-key-at-least-32-chars-long-123456";
let adminToken: string;
let agentToken: string;

describe("Group Management Integration Tests", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    
    const adminUser = {
      id: "admin-1",
      email: "admin@example.com",
      role: "admin" as const,
      mfa_enabled: true,
    };
    adminToken = await authService.generateToken(adminUser as any, JWT_SECRET, true);

    const agentUser = {
      id: "agent-1",
      email: "agent@example.com",
      role: "agent" as const,
      mfa_enabled: true,
    };
    agentToken = await authService.generateToken(agentUser as any, JWT_SECRET, true);
  });

  describe("POST /groups", () => {
    it("should allow an admin to create a group", async () => {
      mockDB.run.mockResolvedValueOnce({ success: true });
      mockDB.first.mockResolvedValueOnce({ id: "g-1", name: "Support", description: "Desc" });

      const res = await dashboard.request(
        "/groups",
        {
          method: "POST",
          headers: { 
            "Authorization": `Bearer ${adminToken}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ name: "Support", description: "Desc" })
        },
        { DB: mockDB as any, JWT_SECRET }
      );

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.name).toBe("Support");
      expect(mockDB.prepare).toHaveBeenCalledWith(expect.stringContaining("INSERT INTO groups"));
    });

    it("should return 403 for non-admins", async () => {
      const res = await dashboard.request(
        "/groups",
        {
          method: "POST",
          headers: { 
            "Authorization": `Bearer ${agentToken}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ name: "Support" })
        },
        { DB: mockDB as any, JWT_SECRET }
      );

      expect(res.status).toBe(403);
      expect(await res.json()).toEqual({ error: "Forbidden", message: "Agent missing permission: groups" });
    });
  });

  describe("DELETE /groups/:id", () => {
    it("should allow an admin to delete a group with no tickets", async () => {
      mockDB.first
        .mockResolvedValueOnce({ id: "g-1" }) // Group exists
        .mockResolvedValueOnce({ count: 0 }); // No tickets

      mockDB.batch.mockResolvedValueOnce([{ success: true }, { success: true }]);

      const res = await dashboard.request(
        "/groups/g-1",
        {
          method: "DELETE",
          headers: { Authorization: `Bearer ${adminToken}` },
        },
        { DB: mockDB as any, JWT_SECRET }
      );

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ success: true });
      expect(mockDB.batch).toHaveBeenCalled();
    });

    it("should return 400 if group has active tickets", async () => {
      mockDB.first
        .mockResolvedValueOnce({ id: "g-1" }) // Group exists
        .mockResolvedValueOnce({ count: 5 }); // Has tickets

      const res = await dashboard.request(
        "/groups/g-1",
        {
          method: "DELETE",
          headers: { Authorization: `Bearer ${adminToken}` },
        },
        { DB: mockDB as any, JWT_SECRET }
      );

      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: "Cannot delete group with associated tickets" });
    });

    it("should return 403 for non-admins", async () => {
      const res = await dashboard.request(
        "/groups/g-1",
        {
          method: "DELETE",
          headers: { Authorization: `Bearer ${agentToken}` },
        },
        { DB: mockDB as any, JWT_SECRET }
      );

      expect(res.status).toBe(403);
    });
  });

  describe("Group Members Management", () => {
    it("should allow viewing group members (Admin/Agent)", async () => {
      const mockMembers = [{ id: "u-1", email: "u1@test.com", full_name: "User 1", role: "agent" }];
      mockDB.first.mockResolvedValueOnce({ id: "g-1" }); // Group exists
      mockDB.all.mockResolvedValueOnce({ results: mockMembers });

      const res = await dashboard.request(
        "/groups/g-1/members",
        {
          headers: { Authorization: `Bearer ${agentToken}` },
        },
        { DB: mockDB as any, JWT_SECRET }
      );

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual(mockMembers);
    });

    it("should allow admin to add a member", async () => {
      mockDB.first
        .mockResolvedValueOnce({ id: "g-1" }) // Group exists
        .mockResolvedValueOnce({ id: "u-2" }); // User exists
      mockDB.run.mockResolvedValueOnce({ success: true });

      const res = await dashboard.request(
        "/groups/g-1/members",
        {
          method: "POST",
          headers: { 
            "Authorization": `Bearer ${adminToken}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ userId: "123e4567-e89b-12d3-a456-426614174000" }) // Valid UUID
        },
        { DB: mockDB as any, JWT_SECRET }
      );

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ success: true });
      expect(mockDB.prepare).toHaveBeenCalledWith(expect.stringContaining("INSERT INTO user_groups"));
    });

    it("should allow admin to remove a member", async () => {
      mockDB.first.mockResolvedValueOnce({ 1: 1 }); // Association exists
      mockDB.run.mockResolvedValueOnce({ success: true });

      const res = await dashboard.request(
        "/groups/g-1/members/u-2",
        {
          method: "DELETE",
          headers: { Authorization: `Bearer ${adminToken}` },
        },
        { DB: mockDB as any, JWT_SECRET }
      );

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ success: true });
      expect(mockDB.prepare).toHaveBeenCalledWith(expect.stringContaining("DELETE FROM user_groups WHERE user_id = ? AND group_id = ?"));
    });

    it("should return 403 for non-admins adding members", async () => {
      const res = await dashboard.request(
        "/groups/g-1/members",
        {
          method: "POST",
          headers: { 
            "Authorization": `Bearer ${agentToken}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ userId: "123e4567-e89b-12d3-a456-426614174000" })
        },
        { DB: mockDB as any, JWT_SECRET }
      );

      expect(res.status).toBe(403);
    });
  });
});
