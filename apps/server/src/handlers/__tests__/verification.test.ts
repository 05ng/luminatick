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
};

const mockNotificationsDO = {
  idFromName: vi.fn().mockReturnValue({}),
  get: vi.fn().mockReturnValue({
    fetch: vi.fn().mockResolvedValue(new Response())
  })
};

const JWT_SECRET = "test-secret-key-at-least-32-chars-long-123456";
let validToken: string;

describe("Ticket Detail Fixes Verification", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    mockDB.all.mockResolvedValue({ results: [] });
    mockDB.first.mockResolvedValue({});
    mockDB.run.mockResolvedValue({ success: true });
    
    const mockUser = {
      id: "agent-1",
      email: "agent@example.com",
      role: "agent" as const,
      mfa_enabled: true,
    };
    validToken = await authService.generateToken(mockUser as any, JWT_SECRET, true);
  });

  it("should return articles in ASC order", async () => {
    const mockTicket = { id: "t-1", subject: "Ticket 1" };
    mockDB.first.mockResolvedValueOnce(mockTicket); // Ticket
    mockDB.all.mockResolvedValueOnce({ results: [] }); // Articles
    mockDB.all.mockResolvedValueOnce({ results: [] }); // Attachments

    await dashboard.request(
      "/tickets/t-1",
      {
        headers: { Authorization: `Bearer ${validToken}` },
      },
      { DB: mockDB as any, JWT_SECRET, NOTIFICATION_DO: mockNotificationsDO as any, ATTACHMENTS_BUCKET: { put: vi.fn(), get: vi.fn(), delete: vi.fn() } }
    );

    // Verify the query uses ORDER BY created_at ASC
    expect(mockDB.prepare).toHaveBeenCalledWith(expect.stringContaining("ORDER BY created_at ASC"));
  });

  it("should allow updating priority, assigned_to, and group_id", async () => {
    mockDB.run.mockResolvedValue({ success: true });

    const validAgentUuid = "11111111-1111-1111-1111-111111111111";
    const validGroupUuid = "22222222-2222-2222-2222-222222222222";

    const res = await dashboard.request(
      "/tickets/t-1",
      {
        method: "PATCH",
        headers: {
          "Authorization": `Bearer ${validToken}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          priority: "urgent",
          assigned_to: validAgentUuid,
          group_id: validGroupUuid
        })
      },
      { DB: mockDB as any, JWT_SECRET, NOTIFICATION_DO: mockNotificationsDO as any, ATTACHMENTS_BUCKET: { put: vi.fn(), get: vi.fn(), delete: vi.fn() } }
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });

    // Verify ticket update query includes all fields
    expect(mockDB.prepare).toHaveBeenCalledWith(expect.stringContaining("UPDATE tickets SET priority = ?, assigned_to = ?, group_id = ? WHERE id = ?"));
    expect(mockDB.bind).toHaveBeenCalledWith("urgent", validAgentUuid, validGroupUuid, "t-1");
  });});
