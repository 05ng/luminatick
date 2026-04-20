import { encryptString } from "../../utils/crypto";
import { describe, it, expect, vi, beforeEach } from "vitest";
import customer from "../customer.handler";
import * as jose from "jose";
import { CustomerAuthService } from "../../services/customer-auth.service";
import { TicketService } from "../../services/ticket.service";

// Define mock functions so they can be overridden in tests
const mockRequestAuth = vi.fn().mockResolvedValue(undefined);
const mockVerifyAuth = vi.fn().mockResolvedValue({
  token: "mock-jwt-token",
  user: { id: "user-1", email: "test@example.com", role: "customer" }
});

const mockFindTickets = vi.fn().mockResolvedValue({ data: [], total: 0 });
const mockCreateTicketWithArticle = vi.fn().mockResolvedValue({ id: "ticket-1" });
const mockFindTicketById = vi.fn().mockResolvedValue({ id: "ticket-1", customer_email: "test@example.com" });
const mockCreateArticle = vi.fn().mockResolvedValue({ id: "article-1" });
const mockAddAttachment = vi.fn().mockResolvedValue({ id: "attachment-1" });

vi.mock("../../services/customer-auth.service", () => {
  return {
    CustomerAuthService: vi.fn().mockImplementation(function() {
      return {
        requestAuth: mockRequestAuth,
        verifyAuth: mockVerifyAuth
      };
    })
  };
});

vi.mock("../../services/ticket.service", () => {
  return {
    TicketService: vi.fn().mockImplementation(function() {
      return {
        findTickets: mockFindTickets,
        createTicketWithArticle: mockCreateTicketWithArticle,
        findTicketById: mockFindTicketById,
        createArticle: mockCreateArticle,
        addAttachment: mockAddAttachment,
        hydrateArticles: vi.fn().mockImplementation(a => Promise.resolve(a)),
        updateTicketTimestamp: vi.fn().mockResolvedValue(true)
      };
    })
  };
});



const JWT_SECRET = "test-secret-key-at-least-32-chars-long-123456";

// Mock DO
const mockDO = {
  idFromName: vi.fn().mockReturnValue("global-id"),
  get: vi.fn().mockReturnValue({
    fetch: vi.fn().mockResolvedValue({ ok: true }),
  }),
};

// Mock DB
const mockDB = {
  prepare: vi.fn().mockReturnThis(),
  bind: vi.fn().mockReturnThis(),
  first: vi.fn(),
  all: vi.fn(),
  run: vi.fn(),
};

async function generateCustomerToken(overrides = {}) {
  const secretKey = new TextEncoder().encode(JWT_SECRET);
  return await new jose.SignJWT({
    sub: "user-1",
    email: "test@example.com",
    role: "customer",
    ...overrides
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(secretKey);
}

describe("Customer Handler Integration Tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDB.all.mockResolvedValue({ results: [] });
    mockRequestAuth.mockResolvedValue(undefined);
    mockVerifyAuth.mockResolvedValue({
      token: "mock-jwt-token",
      user: { id: "user-1", email: "test@example.com", role: "customer" }
    });
    mockFindTickets.mockResolvedValue({ data: [], total: 0 });
    mockCreateTicketWithArticle.mockResolvedValue({ id: "ticket-1", subject: "Test" });
    mockFindTicketById.mockResolvedValue({ id: "ticket-1", customer_email: "test@example.com" });
    mockCreateArticle.mockResolvedValue({ id: "article-1" });
    mockAddAttachment.mockResolvedValue({ id: "attachment-1" });
      });

  describe("POST /auth/request", () => {
    it("should call authService.requestAuth and return success", async () => {
      const res = await customer.request(
        "/auth/request",
        {
          method: "POST",
          body: JSON.stringify({ email: "test@example.com", type: "magic_link", baseUrl: "http://localhost:5173" }),
          headers: { "Content-Type": "application/json" },
        },
        { DB: mockDB as any, JWT_SECRET, NOTIFICATION_DO: mockDO as any }
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(mockRequestAuth).toHaveBeenCalledWith("test@example.com", "magic_link", "http://localhost:5173");
    });
  });

  describe("POST /auth/verify", () => {
    it("should return token on success and set cookie", async () => {
      const res = await customer.request(
        "/auth/verify",
        {
          method: "POST",
          body: JSON.stringify({ token: "plain-token-123" }),
          headers: { "Content-Type": "application/json" },
        },
        { DB: mockDB as any, JWT_SECRET, ENVIRONMENT: "development" }
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.token).toBe("mock-jwt-token");
      expect(body.user.email).toBe("test@example.com");
      
      const setCookieHeader = res.headers.get("Set-Cookie");
      expect(setCookieHeader).toContain("lumina_customer_token=mock-jwt-token");
      expect(setCookieHeader).toContain("HttpOnly");
      expect(mockVerifyAuth).toHaveBeenCalledWith("plain-token-123");
    });

    it("should return 401 if token is invalid", async () => {
      mockVerifyAuth.mockResolvedValueOnce(null);

      const res = await customer.request(
        "/auth/verify",
        {
          method: "POST",
          body: JSON.stringify({ token: "invalid-token" }),
          headers: { "Content-Type": "application/json" },
        },
        { DB: mockDB as any, JWT_SECRET, ENVIRONMENT: "development" }
      );

      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.error).toBe("Invalid token");
    });
  });

  describe("POST /auth/logout", () => {
    it("should clear the cookie on logout", async () => {
      const token = await generateCustomerToken();
      const res = await customer.request(
        "/auth/logout",
        {
          method: "POST",
          headers: { "Authorization": `Bearer ${token}` },
        },
        { DB: mockDB as any, JWT_SECRET, NOTIFICATION_DO: mockDO as any }
      );

      expect(res.status).toBe(200);
      const setCookieHeader = res.headers.get("Set-Cookie");
      expect(setCookieHeader).toContain("lumina_customer_token=;");
      expect(setCookieHeader).toContain("Max-Age=0");
    });
  });

  describe("GET /auth/me", () => {
    it("should return the current user", async () => {
      const token = await generateCustomerToken();
      mockDB.first.mockResolvedValueOnce({ id: "user-1", email: "test@example.com" });

      const res = await customer.request(
        "/auth/me",
        {
          method: "GET",
          headers: { "Authorization": `Bearer ${token}` },
        },
        { DB: mockDB as any, JWT_SECRET, NOTIFICATION_DO: mockDO as any }
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.user.email).toBe("test@example.com");
      expect(mockDB.prepare).toHaveBeenCalledWith("SELECT id, email, full_name, role, created_at, last_login_at FROM users WHERE id = ?");
    });
  });

  describe("GET /tickets", () => {
    it("should return a list of tickets", async () => {
      const token = await generateCustomerToken();
      const mockTickets = { data: [{ id: "ticket-1" }, { id: "ticket-2" }], total: 2 };
      mockFindTickets.mockResolvedValueOnce(mockTickets);

      const res = await customer.request(
        "/tickets?page=1&limit=10",
        {
          method: "GET",
          headers: { "Authorization": `Bearer ${token}` },
        },
        { DB: mockDB as any, JWT_SECRET, NOTIFICATION_DO: mockDO as any }
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data).toHaveLength(2);
      expect(body.total).toBe(2);
      expect(mockFindTickets).toHaveBeenCalledWith({ page: 1, limit: 10, customerEmail: "test@example.com" });
    });
  });

  
  describe("Turnstile Integration on POST /tickets", () => {
    let originalFetch: any;
    let mockFetch: any;

    beforeEach(() => {
      originalFetch = global.fetch;
      mockFetch = vi.fn();
      global.fetch = mockFetch;
    });

    afterEach(() => {
      global.fetch = originalFetch;
    });

    it("1. validation passes for valid tokens", async () => {
      const token = await generateCustomerToken();
      const masterKey = "12345678901234567890123456789012";
      const encryptedSecret = await encryptString("my-turnstile-secret", masterKey);

      // Mock DB to return the secret key
      mockDB.first.mockImplementation(async () => {
        return { value: encryptedSecret };
      });

      mockFetch.mockResolvedValueOnce({
        json: async () => ({ success: true })
      });

      const res = await customer.request(
        "/tickets",
        {
          method: "POST",
          body: JSON.stringify({ subject: "Help", message: "I need help", turnstileToken: "valid-token" }),
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}`, "CF-Connecting-IP": "127.0.0.1" },
        },
        { DB: mockDB as any, JWT_SECRET, APP_MASTER_KEY: masterKey, NOTIFICATION_DO: mockDO as any }
      );

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.id).toBe("ticket-1");
      
      expect(mockFetch).toHaveBeenCalledTimes(1);
      const fetchArgs = mockFetch.mock.calls[0];
      expect(fetchArgs[0]).toBe('https://challenges.cloudflare.com/turnstile/v0/siteverify');
      expect(fetchArgs[1].method).toBe('POST');
    });

    it("2a. validation fails securely for invalid tokens (when configured)", async () => {
      const token = await generateCustomerToken();
      const masterKey = "12345678901234567890123456789012";
      const encryptedSecret = await encryptString("my-turnstile-secret", masterKey);

      mockDB.first.mockImplementation(async () => {
        return { value: encryptedSecret };
      });

      mockFetch.mockResolvedValueOnce({
        json: async () => ({ success: false, 'error-codes': ['invalid-input-response'] })
      });

      const res = await customer.request(
        "/tickets",
        {
          method: "POST",
          body: JSON.stringify({ subject: "Help", message: "I need help", turnstileToken: "invalid-token" }),
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}`, "CF-Connecting-IP": `127.0.0.${Math.floor(Math.random() * 255)}` },
        },
        { DB: mockDB as any, JWT_SECRET, APP_MASTER_KEY: masterKey, NOTIFICATION_DO: mockDO as any }
      );

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe("Turnstile validation failed or token missing");
    });

    it("2b. validation fails securely for missing tokens (when configured)", async () => {
      const token = await generateCustomerToken();
      const masterKey = "12345678901234567890123456789012";
      const encryptedSecret = await encryptString("my-turnstile-secret", masterKey);

      mockDB.first.mockImplementation(async () => {
        return { value: encryptedSecret };
      });

      // Fetch shouldn't even be called if token is missing
      const res = await customer.request(
        "/tickets",
        {
          method: "POST",
          body: JSON.stringify({ subject: "Help", message: "I need help" }), // NO turnstileToken
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}`, "CF-Connecting-IP": `127.0.0.${Math.floor(Math.random() * 255)}` },
        },
        { DB: mockDB as any, JWT_SECRET, APP_MASTER_KEY: masterKey, NOTIFICATION_DO: mockDO as any }
      );

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe("Turnstile validation failed or token missing");
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("3. gracefully handles the case where Turnstile is NOT configured", async () => {
      const token = await generateCustomerToken();
      const masterKey = "12345678901234567890123456789012";

      // DB returns undefined (not configured)
      mockDB.first.mockImplementation(async () => {
        return undefined;
      });

      const res = await customer.request(
        "/tickets",
        {
          method: "POST",
          body: JSON.stringify({ subject: "Help", message: "I need help" }), // NO turnstileToken needed
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}`, "CF-Connecting-IP": `127.0.0.${Math.floor(Math.random() * 255)}` },
        },
        { DB: mockDB as any, JWT_SECRET, APP_MASTER_KEY: masterKey, NOTIFICATION_DO: mockDO as any }
      );

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.id).toBe("ticket-1");
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe("POST /tickets", () => {
    it("should create a new ticket", async () => {
      const token = await generateCustomerToken();

      const res = await customer.request(
        "/tickets",
        {
          method: "POST",
          body: JSON.stringify({ subject: "Help", message: "I need help" }),
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}`, "CF-Connecting-IP": `127.0.0.${Math.floor(Math.random() * 255)}` },
        },
        { DB: mockDB as any, JWT_SECRET, NOTIFICATION_DO: mockDO as any }
      );

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.id).toBe("ticket-1");
      expect(mockCreateTicketWithArticle).toHaveBeenCalledWith({
        subject: "Help",
        customer_email: "test@example.com",
        source: "portal",
        body: "I need help",
        sender_id: "user-1",
        sender_type: "customer"
      });
    });
  });

  describe("GET /tickets/:id", () => {
    it("should return a ticket and its articles", async () => {
      const token = await generateCustomerToken();
      
      mockDB.all.mockResolvedValueOnce({ results: [{ id: "article-1" }] }); // articles
      mockDB.all.mockResolvedValueOnce({ results: [{ id: "att-1", article_id: "article-1" }] }); // attachments

      const res = await customer.request(
        "/tickets/ticket-1",
        {
          method: "GET",
          headers: { "Authorization": `Bearer ${token}` },
        },
        { DB: mockDB as any, JWT_SECRET, NOTIFICATION_DO: mockDO as any }
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.ticket.id).toBe("ticket-1");
      expect(body.articles).toHaveLength(1);
      expect(body.articles[0].attachments).toHaveLength(1);
    });

    it("should return 404 if ticket not found or doesn't belong to customer", async () => {
      const token = await generateCustomerToken();
      mockFindTicketById.mockResolvedValueOnce({ id: "ticket-1", customer_email: "other@example.com" });

      const res = await customer.request(
        "/tickets/ticket-1",
        {
          method: "GET",
          headers: { "Authorization": `Bearer ${token}` },
        },
        { DB: mockDB as any, JWT_SECRET, NOTIFICATION_DO: mockDO as any }
      );

      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error).toBe("Not found");
    });
  });

  describe("POST /tickets/:id/messages", () => {
    it("should add a message to an existing ticket", async () => {
      const token = await generateCustomerToken();

      const res = await customer.request(
        "/tickets/ticket-1/messages",
        {
          method: "POST",
          body: JSON.stringify({ 
            message: "Another reply",
            attachments: [{ filename: "test.png", size: 123, contentType: "image/png", key: "s3-key" }]
          }),
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}`, "CF-Connecting-IP": `127.0.0.${Math.floor(Math.random() * 255)}` },
        },
        { DB: mockDB as any, JWT_SECRET, NOTIFICATION_DO: mockDO as any }
      );

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.id).toBe("article-1");
      expect(body.attachments).toHaveLength(1);
      expect(mockCreateArticle).toHaveBeenCalledWith({
        ticket_id: "ticket-1",
        body: "Another reply",
        sender_type: "customer",
        sender_id: "user-1"
      });
      expect(mockAddAttachment).toHaveBeenCalledWith({
        article_id: "article-1",
        file_name: "test.png",
        file_size: 123,
        content_type: "image/png",
        r2_key: "s3-key"
      });
    });

    it("should return 404 if ticket not found", async () => {
      const token = await generateCustomerToken();
      mockFindTicketById.mockResolvedValueOnce(null);

      const res = await customer.request(
        "/tickets/ticket-1/messages",
        {
          method: "POST",
          body: JSON.stringify({ message: "Hello" }),
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}`, "CF-Connecting-IP": `127.0.0.${Math.floor(Math.random() * 255)}` },
        },
        { DB: mockDB as any, JWT_SECRET, NOTIFICATION_DO: mockDO as any }
      );

      expect(res.status).toBe(404);
    });
  });

  describe("POST /attachments/upload", () => {
    it("should return 400 if file is missing", async () => {
      const token = await generateCustomerToken();
      
      const res = await customer.request(
        "/attachments/upload",
        {
          method: "POST",
          body: new FormData(), // empty form data
          headers: { "Authorization": `Bearer ${token}` },
        },
        { DB: mockDB as any, JWT_SECRET, NOTIFICATION_DO: mockDO as any }
      );

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe("File is required");
    });

    it("should upload file to R2 and return key", async () => {
      const token = await generateCustomerToken();
      
      const formData = new FormData();
      formData.append("file", new File(["test content"], "test.png", { type: "image/png" }));

      let putCalledWithKey = "";
      const mockR2 = {
        put: async (key: string, data: any, options: any) => {
          putCalledWithKey = key;
        }
      };

      const res = await customer.request(
        "/attachments/upload",
        {
          method: "POST",
          body: formData,
          headers: { "Authorization": `Bearer ${token}` },
        },
        { DB: mockDB as any, JWT_SECRET, NOTIFICATION_DO: mockDO as any, ATTACHMENTS_BUCKET: mockR2 as any }
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.key).toBeDefined();
      expect(body.key).toBe(putCalledWithKey);
      expect(body.key).toMatch(/^customer-attachments\/.+\/.+\.png$/);
    });
  });
});
