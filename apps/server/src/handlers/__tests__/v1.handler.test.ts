import { describe, it, expect, vi, beforeEach } from "vitest";
import v1 from "../v1.handler";

const mockDB: any = {
  prepare: vi.fn(),
  bind: vi.fn(),
  all: vi.fn(),
  first: vi.fn(),
  run: vi.fn(),
  lastQuery: "",
};

const mockDO = {
  idFromName: vi.fn(),
  get: vi.fn(),
};

const mockBucket = {
  put: vi.fn(),
  get: vi.fn(),
  delete: vi.fn(),
};

const VALID_API_KEY = "lt_abcdefgh.12345678901234567890123456789012";

const request = (path: string, init?: RequestInit, env?: any) => {
  const mergedEnv = { ...env, NOTIFICATION_DO: mockDO, ATTACHMENTS_BUCKET: mockBucket };
  return v1.request(path, init, mergedEnv, { waitUntil: vi.fn() } as any);
};

describe("v1 Handler Integration Tests", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockDB.lastQuery = "";
    
    mockDO.idFromName.mockReturnValue("global-id");
    mockDO.get.mockReturnValue({
      fetch: vi.fn().mockResolvedValue({ ok: true }),
    });

    mockBucket.put.mockResolvedValue({});
    mockBucket.get.mockResolvedValue(null);
    mockBucket.delete.mockResolvedValue({});

    mockDB.prepare.mockImplementation((query: string) => {
      mockDB.lastQuery = query;
      return mockDB;
    });
    mockDB.bind.mockReturnValue(mockDB);

    // Polyfill for crypto in Node environment for Vitest
    if (typeof global.crypto === 'undefined') {
        const { webcrypto } = require('crypto');
        (global as any).crypto = webcrypto;
    }

    // Mock successful API key validation by default
    mockDB.first.mockImplementation(async () => {
        if (mockDB.lastQuery.includes("SELECT id FROM api_keys")) {
            return { id: "key-123" };
        }
        if (mockDB.lastQuery.includes("TICKET_PREFIX")) {
            return { value: "SUP-" };
        }
        if (mockDB.lastQuery.includes("SELECT * FROM tickets WHERE id = ?")) {
            return { id: "t-123", subject: "Test Ticket" };
        }
        if (mockDB.lastQuery.includes("SELECT * FROM articles WHERE id = ?")) {
            return { id: "a-123", body: "" };
        }
        return null;
    });
    mockDB.run.mockResolvedValue({ success: true });
    mockDB.all.mockResolvedValue({ results: [] });
  });

  describe("Authentication", () => {
    it("should return 401 if API key is missing", async () => {
      const res = await request("/tickets", { method: "POST" }, { DB: mockDB as any });
      expect(res.status).toBe(401);
      expect(await res.json()).toEqual({ error: "Missing API Key" });
    });

    it("should return 401 if API key is invalid", async () => {
      // Force failure for the next call
      mockDB.first.mockResolvedValueOnce(null); 
      
      const res = await request("/tickets", {
        method: "POST",
        headers: { "X-API-Key": "invalid-key" }
      }, { DB: mockDB as any });
      
      expect(res.status).toBe(401);
    });
  });

  describe("POST /tickets", () => {
    it("should create a ticket and initial article", async () => {
      const res = await request("/tickets", {
        method: "POST",
        headers: { 
            "X-API-Key": VALID_API_KEY,
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            subject: "Help Me",
            customer_email: "user@example.com",
            body: "The system is down"
        })
      }, { DB: mockDB as any });

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.id).toBeDefined();

      // Verify ticket creation
      expect(mockDB.prepare).toHaveBeenCalledWith(expect.stringContaining("INSERT INTO tickets"));
      // Verify article creation
      expect(mockDB.prepare).toHaveBeenCalledWith(expect.stringContaining("INSERT INTO articles"));
    });

    it("should return 400 if required fields are missing", async () => {
      const res = await request("/tickets", {
        method: "POST",
        headers: { 
            "X-API-Key": VALID_API_KEY,
            "Content-Type": "application/json"
        },
        body: JSON.stringify({ subject: "Only Subject" })
      }, { DB: mockDB as any });

      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({
        error: "Validation failed",
        details: {
          customer_email: ["Required"]
        }
      });
    });
  });

  describe("GET /tickets/:id", () => {
    it("should return ticket and non-internal articles", async () => {
      const res = await request("/tickets/t-123", {
        headers: { "X-API-Key": VALID_API_KEY }
      }, { DB: mockDB as any });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.id).toBe("t-123");
      expect(mockDB.prepare).toHaveBeenCalledWith(expect.stringContaining("SELECT * FROM articles WHERE ticket_id = ? AND is_internal = 0"));
    });
  });

  describe("POST /tickets/:id/articles", () => {
    it("should add a new article to a ticket", async () => {
      const res = await request("/tickets/t-123/articles", {
        method: "POST",
        headers: { 
            "X-API-Key": VALID_API_KEY,
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            body: "A new update",
            sender_type: "customer"
        })
      }, { DB: mockDB as any });

      expect(res.status).toBe(201);
      expect(mockDB.prepare).toHaveBeenCalledWith(expect.stringContaining("INSERT INTO articles"));
      expect(mockDB.bind).toHaveBeenCalledWith(
        expect.any(String), // id
        "t-123",            // ticket_id
        null,               // sender_id
        "customer",         // sender_type
        null,               // body
        expect.any(String), // body_r2_key
        "A new update",     // snippet
        null,               // raw_email_id
        null,               // qa_type
        0,                  // is_internal
        expect.any(String)  // created_at
      );
    });

    it("should return 404 for non-existent ticket", async () => {
      // Force failure for the ticket lookup by making it return null when query contains "tickets"
      mockDB.first.mockImplementation(async () => {
        if (mockDB.lastQuery.includes("SELECT id FROM api_keys")) {
            return { id: "key-123" };
        }
        if (mockDB.lastQuery.includes("SELECT * FROM tickets WHERE id = ?")) {
            return null; // Force not found
        }
        return null;
      });

      const res = await request("/tickets/non-existent/articles", {
        method: "POST",
        headers: { 
            "X-API-Key": VALID_API_KEY,
            "Content-Type": "application/json"
        },
        body: JSON.stringify({ body: "Lost article" })
      }, { DB: mockDB as any });

      expect(res.status).toBe(404);
    });
  });

  describe("PATCH /tickets/:id", () => {
    it("should update ticket properties", async () => {
      const res = await request("/tickets/t-123", {
        method: "PATCH",
        headers: { 
            "X-API-Key": VALID_API_KEY,
            "Content-Type": "application/json"
        },
        body: JSON.stringify({ status: "closed" })
      }, { DB: mockDB as any });

      expect(res.status).toBe(200);
      expect(mockDB.prepare).toHaveBeenCalledWith(expect.stringContaining("UPDATE tickets SET status = ?"));
      expect(mockDB.bind).toHaveBeenCalledWith("closed", expect.any(String), "t-123");
    });
  });

  describe("Rate Limiting", () => {
    it("should enforce rate limits", async () => {
      const req = () => request("/tickets", {
        method: "POST",
        headers: { "X-API-Key": VALID_API_KEY }
      }, { DB: mockDB as any });

      // The previous tests already consumed some quota if the Map is shared.
      // But in Vitest, they might be isolated or we can just keep calling until it hits.
      let lastStatus = 0;
      for (let i = 0; i < 15; i++) {
        const res = await req();
        lastStatus = res.status;
        if (lastStatus === 429) break;
      }

      expect(lastStatus).toBe(429);
    });
  });
});
