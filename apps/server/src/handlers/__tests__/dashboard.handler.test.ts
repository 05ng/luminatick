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

const mockBucket = {
  put: vi.fn().mockResolvedValue({}),
  get: vi.fn().mockResolvedValue(null),
  delete: vi.fn().mockResolvedValue({}),
};

const JWT_SECRET = "test-secret-key-at-least-32-chars-long-123456";
let validToken: string;

const request = (path: string, init?: RequestInit, env?: any) => {
  return dashboard.request(path, init, { DB: mockDB as any, JWT_SECRET, NOTIFICATION_DO: mockNotificationsDO as any, ATTACHMENTS_BUCKET: mockBucket, ...env });
};

describe("Dashboard Handler Integration Tests", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    mockDB.all.mockResolvedValue({ results: [] });
    mockDB.first.mockResolvedValue({ value: JSON.stringify({ api_keys: true }) });
    mockDB.run.mockResolvedValue({ success: true });
    
    const mockUser = {
      id: "agent-1",
      email: "agent@example.com",
      role: "agent" as const,
      mfa_enabled: true,
    };
    validToken = await authService.generateToken(mockUser as any, JWT_SECRET, true);
  });

  describe("GET /tickets", () => {
    it("should list tickets with default pagination", async () => {
      const mockTickets = [
        { id: "t-1", subject: "Ticket 1", status: "open", priority: "normal", updated_at: "2023-01-01T00:00:00Z" },
        { id: "t-2", subject: "Ticket 2", status: "pending", priority: "high", updated_at: "2023-01-01T01:00:00Z" },
      ];

      mockDB.all.mockResolvedValueOnce({ results: mockTickets });

      const res = await dashboard.request(
        "/tickets",
        {
          headers: { Authorization: `Bearer ${validToken}` },
        },
        { DB: mockDB as any, JWT_SECRET, NOTIFICATION_DO: mockNotificationsDO as any, ATTACHMENTS_BUCKET: mockBucket }
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data).toHaveLength(2);
      expect(body.meta.page).toBe(1);
      expect(body.meta.limit).toBe(50);

      expect(mockDB.prepare).toHaveBeenCalledWith(expect.stringContaining("SELECT tickets.*, (SELECT snippet FROM articles"));
      expect(mockDB.bind).toHaveBeenCalledWith(50, 0);
    });

    it("should apply status filter", async () => {
      mockDB.all.mockResolvedValueOnce({ results: [] });

      await dashboard.request(
        "/tickets?status=open,pending",
        {
          headers: { Authorization: `Bearer ${validToken}` },
        },
        { DB: mockDB as any, JWT_SECRET, NOTIFICATION_DO: mockNotificationsDO as any, ATTACHMENTS_BUCKET: mockBucket }
      );

      expect(mockDB.prepare).toHaveBeenCalledWith(expect.stringContaining("AND status IN (?,?)"));
      expect(mockDB.bind).toHaveBeenCalledWith("open", "pending", 50, 0);
    });

    it("should apply assigned_to filter", async () => {
      mockDB.all.mockResolvedValueOnce({ results: [] });

      await dashboard.request(
        "/tickets?assigned_to=agent-1",
        {
          headers: { Authorization: `Bearer ${validToken}` },
        },
        { DB: mockDB as any, JWT_SECRET, NOTIFICATION_DO: mockNotificationsDO as any, ATTACHMENTS_BUCKET: mockBucket }
      );

      expect(mockDB.prepare).toHaveBeenCalledWith(expect.stringContaining("AND assigned_to = ?"));
      expect(mockDB.bind).toHaveBeenCalledWith("agent-1", 50, 0);
    });

    it("should apply pagination params", async () => {
      mockDB.all.mockResolvedValueOnce({ results: [] });

      const res = await dashboard.request(
        "/tickets?page=2&limit=10",
        {
          headers: { Authorization: `Bearer ${validToken}` },
        },
        { DB: mockDB as any, JWT_SECRET, NOTIFICATION_DO: mockNotificationsDO as any, ATTACHMENTS_BUCKET: mockBucket }
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.meta.page).toBe(2);
      expect(body.meta.limit).toBe(10);
      expect(mockDB.bind).toHaveBeenCalledWith(10, 10);
    });
  });

  describe("GET /tickets/:id", () => {
    it("should return detailed ticket info", async () => {
      const mockTicket = { 
        id: "t-1", 
        subject: "Ticket 1", 
        customer_id: "c-1", 
        assigned_to: "agent-1" 
      };
      const mockArticles = [
        { id: "art-1", ticket_id: "t-1", body: "Hello", sender_type: "customer" }
      ];
      const mockAttachments = [
        { id: "att-1", article_id: "art-1", file_name: "test.txt" }
      ];
      const mockCustomer = { id: "c-1", email: "customer@example.com", role: "customer" };
      const mockAssignee = { id: "agent-1", email: "agent@example.com", role: "agent" };

      mockDB.first
        .mockResolvedValueOnce(mockTicket)      // Ticket
        .mockResolvedValueOnce(mockCustomer)    // Customer
        .mockResolvedValueOnce(mockAssignee);   // Assignee

      mockDB.all
        .mockResolvedValueOnce({ results: mockArticles })    // Articles
        .mockResolvedValueOnce({ results: mockAttachments }); // Attachments

      const res = await dashboard.request(
        "/tickets/t-1",
        {
          headers: { Authorization: `Bearer ${validToken}` },
        },
        { DB: mockDB as any, JWT_SECRET, NOTIFICATION_DO: mockNotificationsDO as any, ATTACHMENTS_BUCKET: mockBucket }
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.id).toBe("t-1");
      expect(body.articles).toHaveLength(1);
      expect(body.articles[0].attachments).toHaveLength(1);
      expect(body.customer.email).toBe("customer@example.com");
      expect(body.assignee.email).toBe("agent@example.com");
    });

    it("should return 404 for non-existent ticket", async () => {
      mockDB.first.mockResolvedValueOnce(null);

      const res = await dashboard.request(
        "/tickets/non-existent",
        {
          headers: { Authorization: `Bearer ${validToken}` },
        },
        { DB: mockDB as any, JWT_SECRET, NOTIFICATION_DO: mockNotificationsDO as any, ATTACHMENTS_BUCKET: mockBucket }
      );

      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: "Ticket not found" });
    });
  });

  describe("PATCH /tickets/:id", () => {
    it("should update ticket and create a system note", async () => {
      mockDB.run.mockResolvedValue({ success: true });

      const validUuid = "123e4567-e89b-12d3-a456-426614174000";

      const res = await dashboard.request(
        "/tickets/t-1",
        {
          method: "PATCH",
          headers: {
            "Authorization": `Bearer ${validToken}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            status: "resolved",
            assigned_to: validUuid
          })
        },
        { DB: mockDB as any, JWT_SECRET, NOTIFICATION_DO: mockNotificationsDO as any, ATTACHMENTS_BUCKET: mockBucket }
      );

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ success: true });

      // Verify ticket update query
      expect(mockDB.prepare).toHaveBeenCalledWith(expect.stringContaining("UPDATE tickets SET status = ?, assigned_to = ? WHERE id = ?"));
      expect(mockDB.bind).toHaveBeenCalledWith("resolved", validUuid, "t-1");
      // Verify system note insertion
      expect(mockDB.prepare).toHaveBeenCalledWith(expect.stringContaining("INSERT INTO articles"));
      expect(mockDB.bind).toHaveBeenCalledWith(
        expect.any(String), // id
        "t-1",              // ticket_id
        "agent-1",          // sender_id
        "system",           // sender_type
        null,               // body
        expect.stringContaining("tickets/t-1/articles/"), // r2_key
        expect.stringContaining("Ticket updated by agent@example.com"), // snippet
        null,               // raw_email_id
        null,               // qa_type
        1,                  // is_internal
        expect.any(String)  // created_at
      );
    });

    it("should return 400 for no valid fields", async () => {
      const res = await dashboard.request(
        "/tickets/t-1",
        {
          method: "PATCH",
          headers: { 
            "Authorization": `Bearer ${validToken}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ invalid_field: "value" })
        },
        { DB: mockDB as any, JWT_SECRET, NOTIFICATION_DO: mockNotificationsDO as any, ATTACHMENTS_BUCKET: mockBucket }
      );

      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: "No valid fields to update" });
    });
  });

  describe("Lookups", () => {
    it("should return agents list", async () => {
      const mockAgents = [
        { id: "a-1", email: "a1@test.com", role: "admin" },
        { id: "a-2", email: "a2@test.com", role: "agent" },
      ];
      mockDB.all.mockResolvedValueOnce({ results: mockAgents });

      const res = await dashboard.request(
        "/users/agents",
        {
          headers: { Authorization: `Bearer ${validToken}` },
        },
        { DB: mockDB as any, JWT_SECRET, NOTIFICATION_DO: mockNotificationsDO as any, ATTACHMENTS_BUCKET: mockBucket }
      );

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual(mockAgents);
      expect(mockDB.prepare).toHaveBeenCalledWith(expect.stringContaining("role IN ('admin', 'agent')"));
    });

    it("should return groups list", async () => {
      const mockGroups = [
        { id: "g-1", name: "Support" },
        { id: "g-2", name: "Engineering" },
      ];
      mockDB.all.mockResolvedValueOnce({ results: mockGroups });

      const res = await dashboard.request(
        "/groups",
        {
          headers: { Authorization: `Bearer ${validToken}` },
        },
        { DB: mockDB as any, JWT_SECRET, NOTIFICATION_DO: mockNotificationsDO as any, ATTACHMENTS_BUCKET: mockBucket }
      );

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual(mockGroups);
      expect(mockDB.prepare).toHaveBeenCalledWith("SELECT * FROM groups");
    });
  });

  describe("API Key Management", () => {
    it("should list API keys", async () => {
      const mockKeys = [{ id: "key-1", name: "Production" }];
      mockDB.all.mockResolvedValueOnce({ results: mockKeys });

      const res = await dashboard.request(
        "/api-keys",
        {
          headers: { Authorization: `Bearer ${validToken}` },
        },
        { DB: mockDB as any, JWT_SECRET, NOTIFICATION_DO: mockNotificationsDO as any, ATTACHMENTS_BUCKET: mockBucket }
      );

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual(mockKeys);
      expect(mockDB.prepare).toHaveBeenCalledWith(expect.stringContaining("SELECT id, name, prefix, is_active"));
    });

    it("should create a new API key", async () => {
      mockDB.run.mockResolvedValueOnce({ success: true });

      const res = await dashboard.request(
        "/api-keys",
        {
          method: "POST",
          headers: { 
            "Authorization": `Bearer ${validToken}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ name: "New Key" })
        },
        { DB: mockDB as any, JWT_SECRET, NOTIFICATION_DO: mockNotificationsDO as any, ATTACHMENTS_BUCKET: mockBucket }
      );

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.apiKey).toBeDefined();
      expect(body.name).toBe("New Key");
    });

    it("should delete an API key", async () => {
      mockDB.run.mockResolvedValueOnce({ success: true });

      const res = await dashboard.request(
        "/api-keys/key-1",
        {
          method: "DELETE",
          headers: { Authorization: `Bearer ${validToken}` },
        },
        { DB: mockDB as any, JWT_SECRET, NOTIFICATION_DO: mockNotificationsDO as any, ATTACHMENTS_BUCKET: mockBucket }
      );

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ success: true });
      expect(mockDB.prepare).toHaveBeenCalledWith(expect.stringContaining("DELETE FROM api_keys WHERE id = ?"));
    });
  });

  describe("POST /attachments/upload", () => {
    it("should successfully upload a valid file and return a storage key", async () => {
      const formData = new FormData();
      formData.append("file", new File(["test content"], "test.txt", { type: "text/plain" }));
      
      const res = await dashboard.request(
        "/attachments/upload",
        {
          method: "POST",
          headers: { 
            "Authorization": `Bearer ${validToken}`,
          },
          body: formData
        },
        { DB: mockDB as any, JWT_SECRET, NOTIFICATION_DO: mockNotificationsDO as any, ATTACHMENTS_BUCKET: mockBucket }
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.key).toBeDefined();
      expect(body.key).toContain("agent-attachments/agent-1/");
      expect(body.key).toContain(".txt");
      expect(mockBucket.put).toHaveBeenCalledWith(
        expect.stringContaining("agent-attachments/agent-1/"),
        expect.any(Object),
        expect.objectContaining({ httpMetadata: { contentType: "text/plain" } })
      );
    });

    it("should reject large files based on content-length header", async () => {
      const res = await dashboard.request(
        "/attachments/upload",
        {
          method: "POST",
          headers: { 
            "Authorization": `Bearer ${validToken}`,
            "Content-Length": "10485761"
          },
        },
        { DB: mockDB as any, JWT_SECRET, NOTIFICATION_DO: mockNotificationsDO as any, ATTACHMENTS_BUCKET: mockBucket }
      );

      expect(res.status).toBe(413);
      const body = await res.json();
      expect(body.error).toContain("Payload too large");
    });

    it("should reject unsupported file types", async () => {
      const formData = new FormData();
      formData.append("file", new File(["test content"], "test.exe", { type: "application/x-msdownload" }));
      
      const res = await dashboard.request(
        "/attachments/upload",
        {
          method: "POST",
          headers: { "Authorization": `Bearer ${validToken}` },
          body: formData
        },
        { DB: mockDB as any, JWT_SECRET, NOTIFICATION_DO: mockNotificationsDO as any, ATTACHMENTS_BUCKET: mockBucket }
      );

      expect(res.status).toBe(415);
      const body = await res.json();
      expect(body.error).toContain("Unsupported file type");
    });
  });

  describe("POST /tickets/:id/articles", () => {
    it("should create an article with attachments", async () => {
      const mockTicket = { id: "t-1", group_id: "g-1", customer_id: "c-1" };
      const mockArticle = { id: "art-1", ticket_id: "t-1", body: "Here is the requested file." };
      const mockAttachment = { id: "att-1", file_name: "invoice.pdf", file_size: 1024, content_type: "application/pdf", r2_key: "agent-attachments/agent-1/uuid.pdf" };
      mockDB.first
        .mockReset()
        .mockResolvedValueOnce(mockTicket) // Handler: Verify ticket exists
        .mockResolvedValueOnce({ 1: 1 })   // Handler: Group check
        .mockResolvedValueOnce(mockTicket) // ticketService: findTicketById
        .mockResolvedValueOnce(mockArticle) // ticketService: createArticle
        .mockResolvedValueOnce(mockAttachment); // ticketService: addAttachment

      const res = await dashboard.request(
        "/tickets/t-1/articles",
        {
          method: "POST",
          headers: { 
            "Authorization": `Bearer ${validToken}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            body: "Here is the requested file.",
            is_internal: true,
            attachments: [
              {
                filename: "invoice.pdf",
                size: 1024,
                contentType: "application/pdf",
                storageKey: "agent-attachments/agent-1/uuid.pdf"
              }
            ]
          })
        },
        { DB: mockDB as any, JWT_SECRET, NOTIFICATION_DO: mockNotificationsDO as any, ATTACHMENTS_BUCKET: mockBucket }
      );

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.attachments).toHaveLength(1);
      expect(body.attachments[0].filename).toBe("invoice.pdf");
    });
  });
});
