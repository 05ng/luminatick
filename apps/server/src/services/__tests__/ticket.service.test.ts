import { describe, it, expect, vi, beforeEach } from "vitest";
import { TicketService } from "../ticket.service";

const mockDB = {
  prepare: vi.fn().mockReturnThis(),
  bind: vi.fn().mockReturnThis(),
  first: vi.fn(),
  run: vi.fn(),
  all: vi.fn(),
};

const mockDO = {
  idFromName: vi.fn().mockReturnValue("global-id"),
  get: vi.fn().mockReturnValue({
    fetch: vi.fn().mockResolvedValue({ ok: true }),
  }),
};

const mockBucket = {
  put: vi.fn(),
  get: vi.fn(),
  delete: vi.fn(),
};

const mockEnv = {
  DB: mockDB as any,
  NOTIFICATION_DO: mockDO as any,
  ATTACHMENTS_BUCKET: mockBucket as any,
};

describe("TicketService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default mock for all() to return a promise with results
    mockDB.all.mockResolvedValue({ results: [] });
  });

  describe("ensureCustomerUser", () => {
    it("should return existing customer id if user exists", async () => {
      const service = new TicketService(mockEnv as any);
      mockDB.first.mockResolvedValueOnce({ id: "existing-id" });

      const id = await service.ensureCustomerUser("test@example.com");

      expect(id).toBe("existing-id");
      expect(mockDB.prepare).toHaveBeenCalledWith("SELECT id FROM users WHERE email = ?");
      expect(mockDB.bind).toHaveBeenCalledWith("test@example.com");
    });

    it("should create a new shadow user if user does not exist", async () => {
      const service = new TicketService(mockEnv as any);
      mockDB.first.mockResolvedValueOnce(null); // User does not exist
      mockDB.run.mockResolvedValueOnce({ success: true }); // INSERT INTO users

      const id = await service.ensureCustomerUser("new@example.com");

      expect(id).toBeDefined();
      expect(mockDB.prepare).toHaveBeenCalledWith(
        expect.stringContaining("INSERT INTO users")
      );
      expect(mockDB.bind).toHaveBeenCalledWith(
        id,
        "new@example.com",
        "new", // full_name derived from email
        "customer",
        expect.any(String),
        expect.any(String)
      );
    });

    it("should throw if email is empty", async () => {
      const service = new TicketService(mockEnv as any);
      await expect(service.ensureCustomerUser("  ")).rejects.toThrow('Email is required to ensure customer user');
    });
  });

  describe("Sequential Numbering and Ticket Creation", () => {
    it("should create a ticket with a sequential ticket_no and ensure user", async () => {
      const service = new TicketService(mockEnv as any);

      // Mock sequence:
      // 1. ensureCustomerUser -> SELECT id FROM users WHERE email = ?
      mockDB.first.mockResolvedValueOnce(null);
      // 2. ensureCustomerUser -> INSERT INTO users
      mockDB.run.mockResolvedValueOnce({ success: true });
      // 3. createTicket -> INSERT INTO ticket_sequence DEFAULT VALUES RETURNING id
      mockDB.first.mockResolvedValueOnce({ id: 1 });
      // 4. createTicket -> INSERT INTO tickets
      mockDB.run.mockResolvedValueOnce({ success: true });
      // 5. createTicket -> findTicketById -> SELECT * FROM tickets WHERE id = ?
      const mockTicket = {
        id: "uuid-1",
        ticket_no: 1,
        subject: "Test Ticket",
        customer_email: "customer@example.com",
        customer_id: "new-customer-id",
        status: "open",
        created_at: "now",
        updated_at: "now"
      };
      mockDB.first.mockResolvedValueOnce(mockTicket);

      const ticket = await service.createTicket({
        subject: "Test Ticket",
        customer_email: "customer@example.com",
        source: "email"
      });

      expect(ticket.ticket_no).toBe(1);
      expect(mockDB.prepare).toHaveBeenCalledWith(
        expect.stringContaining("INSERT INTO ticket_sequence DEFAULT VALUES RETURNING id")
      );
      expect(mockDB.prepare).toHaveBeenCalledWith(
        expect.stringContaining("INSERT INTO tickets")
      );

      // Check the ticket INSERT bind specifically
      const ticketInsertBindCall = mockDB.bind.mock.calls.find(call => call.length === 14);
      expect(ticketInsertBindCall).toBeDefined();
      expect(ticketInsertBindCall).toEqual([
        expect.any(String), // id
        1, // ticket_no
        "Test Ticket",
        "open",
        "normal",
        expect.any(String), // customerId
        "customer@example.com",
        null,
        null,
        null, // custom_fields
        "email", // source
        null, // source_email
        expect.any(String),
        expect.any(String)
      ]);
    });
  });

  describe("Find Ticket by Subject", () => {
    it("should find a ticket by subject containing [#000001]", async () => {
      const service = new TicketService(mockEnv as any);

      const mockTicket = { id: "uuid-1", ticket_no: 1, subject: "Test Ticket" };
      mockDB.first.mockResolvedValueOnce(mockTicket);

      const ticket = await service.findTicketBySubject("Re: [#000001] Test Ticket");

      expect(ticket).toEqual(mockTicket);
      expect(mockDB.prepare).toHaveBeenCalledWith(
        expect.stringContaining("SELECT * FROM tickets WHERE ticket_no = ?")
      );
      expect(mockDB.bind).toHaveBeenCalledWith(1);
    });

    it("should find a ticket by subject containing [#123]", async () => {
      const service = new TicketService(mockEnv as any);

      const mockTicket = { id: "uuid-123", ticket_no: 123, subject: "Test Ticket" };
      mockDB.first.mockResolvedValueOnce(mockTicket);

      const ticket = await service.findTicketBySubject("[#123] Support Request");

      expect(ticket).toEqual(mockTicket);
      expect(mockDB.bind).toHaveBeenCalledWith(123);
    });
  });

  describe("Timestamp Formatting Fix", () => {
    it("should create ticket and article with created_at ending in 'Z' (ISO string with timezone)", async () => {
      const service = new TicketService(mockEnv as any);

      const fakeDB = {
        tickets: [] as any[],
        articles: [] as any[],
        ticket_sequence: 1,
      };

      mockDB.prepare.mockImplementation((query: string) => {
        let boundArgs: any[] = [];
        const statement = {
          bind: vi.fn().mockImplementation((...args: any[]) => {
            boundArgs = args;
            return statement;
          }),
          first: vi.fn().mockImplementation(async () => {
            if (query.includes("INSERT INTO ticket_sequence")) {
              return { id: fakeDB.ticket_sequence++ };
            }
            if (query.includes("SELECT id FROM users")) {
              return { id: "user-id" };
            }
            if (query.includes("SELECT * FROM tickets WHERE id = ?")) {
              return fakeDB.tickets.find(t => t.id === boundArgs[0]) || null;
            }
            if (query.includes("SELECT * FROM articles WHERE id = ?")) {
              return fakeDB.articles.find(a => a.id === boundArgs[0]) || null;
            }
            return null;
          }),
          run: vi.fn().mockImplementation(async () => {
            if (query.includes("INSERT INTO users")) {
              return { success: true };
            }
            if (query.includes("INSERT INTO tickets")) {
              fakeDB.tickets.push({
                id: boundArgs[0],
                ticket_no: boundArgs[1],
                subject: boundArgs[2],
                status: boundArgs[3],
                priority: boundArgs[4],
                customer_id: boundArgs[5],
                customer_email: boundArgs[6],
                assigned_to: boundArgs[7],
                group_id: boundArgs[8],
                custom_fields: boundArgs[9],
                source: boundArgs[10],
                source_email: boundArgs[11],
                created_at: boundArgs[12],
                updated_at: boundArgs[13]
              });
            }
            if (query.includes("INSERT INTO articles")) {
              fakeDB.articles.push({
                id: boundArgs[0],
                ticket_id: boundArgs[1],
                sender_id: boundArgs[2],
                sender_type: boundArgs[3],
                body: boundArgs[4],
                body_r2_key: boundArgs[5],
                snippet: boundArgs[6],
                created_at: boundArgs[boundArgs.length - 1]
              });
            }
            return { success: true };
          }),
          all: vi.fn().mockImplementation(async () => {
             return { results: [] };
          })
        };
        return statement;
      });

      // 1. Create a ticket
      const ticket = await service.createTicket({
        subject: "Bug fix test ticket",
        customer_email: "test@example.com",
        source: "email"
      });

      // 2. Add a new article to that ticket
      const article = await service.createArticle({
        ticket_id: ticket.id,
        body: "This is a reply article",
        sender_type: "agent",
        is_internal: false
      });

      // 3. Fetch the ticket and its articles from the database (simulated)
      const fetchedTicket = await service.findTicketById(ticket.id);
      const fetchedArticle = fakeDB.articles.find(a => a.id === article.id);

      // 4. Assert that the created_at string for both ends with 'Z'
      expect(fetchedTicket).toBeDefined();
      expect(fetchedTicket!.created_at).toBeDefined();
      expect(fetchedTicket!.created_at.endsWith("Z")).toBe(true);
      expect(() => new Date(fetchedTicket!.created_at).toISOString()).not.toThrow();

      expect(fetchedArticle).toBeDefined();
      expect(fetchedArticle!.created_at).toBeDefined();
      expect(fetchedArticle!.created_at.endsWith("Z")).toBe(true);
      expect(() => new Date(fetchedArticle!.created_at).toISOString()).not.toThrow();
    });
  });

  describe("Custom Fields JSON Serialization/Deserialization", () => {
    it("should save and retrieve custom_fields properly when creating a ticket", async () => {
      const service = new TicketService(mockEnv as any);

      // Restore default mock behaviors that might have been changed by previous tests
      mockDB.prepare.mockReturnThis();
      mockDB.bind.mockReturnThis();

      // sequence:
      // 1. SELECT id FROM users -> null (user not found)
      // 2. INSERT INTO ticket_sequence -> { id: 1 }
      // 3. SELECT * FROM tickets -> returns ticket with stringified custom_fields
      mockDB.first
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: 1 })
        .mockResolvedValueOnce({
          id: "t-1",
          ticket_no: 1,
          subject: "Custom Fields Test",
          custom_fields: '{"browser":"Chrome","version":120,"is_beta":true}'
        });

      mockDB.run.mockResolvedValue({ success: true });

      const custom_fields = {
        browser: "Chrome",
        version: 120,
        is_beta: true
      };

      const ticket = await service.createTicket({
        subject: "Custom Fields Test",
        customer_email: "test@example.com",
        source: "dashboard",
        custom_fields
      });

      // Assert that JSON stringified object was bound to the INSERT statement (14 args)
      const insertCall = mockDB.bind.mock.calls.find(call => call.length === 14);
      expect(insertCall).toBeDefined();
      expect(insertCall![9]).toBe(JSON.stringify(custom_fields));

      // Assert that findTicketById parses it back to an object
      expect(ticket.custom_fields).toEqual(custom_fields);
    });

    it("should save and retrieve custom_fields properly when updating a ticket", async () => {
      const service = new TicketService(mockEnv as any);

      mockDB.prepare.mockReturnThis();
      mockDB.bind.mockReturnThis();

      mockDB.first.mockResolvedValueOnce({
        id: "t-2",
        ticket_no: 2,
        subject: "Custom Fields Update Test",
        custom_fields: '{"os":"Windows","arch":"x64"}'
      });

      mockDB.run.mockResolvedValue({ success: true });

      const new_custom_fields = {
        os: "Windows",
        arch: "x64"
      };

      const updatedTicket = await service.updateTicket("t-2", {
        custom_fields: new_custom_fields
      });

      // Assert that UPDATE bind array includes the JSON string and length is 3 (custom_fields, updated_at, id)
      const updateCall = mockDB.bind.mock.calls.find(call => call.length === 3);
      expect(updateCall).toBeDefined();
      expect(updateCall![0]).toBe(JSON.stringify(new_custom_fields));

      // Assert that it parses it back to an object
      expect(updatedTicket.custom_fields).toEqual(new_custom_fields);
    });
  });

  describe("findTickets (Pagination and Filtering)", () => {
    it("should return paginated tickets with metadata", async () => {
      const service = new TicketService(mockEnv as any);

      // Setup mocks
      mockDB.prepare.mockReturnThis();
      mockDB.bind.mockReturnThis();

      // First query is countQuery, second is tickets query
      mockDB.first.mockResolvedValueOnce({ total: 105 });
      
      const mockTickets = Array.from({ length: 50 }).map((_, i) => ({
        id: `t-${i}`,
        subject: `Ticket ${i}`,
      }));
      mockDB.all.mockResolvedValueOnce({ results: mockTickets });

      const result = await service.findTickets({ page: 2, limit: 50 });

      expect(mockDB.prepare).toHaveBeenCalledWith(
        expect.stringContaining("SELECT COUNT(*) as total FROM tickets WHERE 1=1")
      );
      expect(mockDB.prepare).toHaveBeenCalledWith(
        expect.stringContaining("SELECT tickets.*, (SELECT snippet FROM articles WHERE ticket_id = tickets.id ORDER BY created_at DESC LIMIT 1) as snippet FROM tickets WHERE 1=1 ORDER BY updated_at DESC LIMIT ? OFFSET ?")
      );

      // Check offset and limit bind
      expect(mockDB.bind).toHaveBeenCalledWith(50, 50); // limit, offset

      expect(result.data).toHaveLength(50);
      expect(result.meta).toEqual({
        total: 105,
        page: 2,
        limit: 50,
        total_pages: 3,
      });
    });

    it("should apply filters correctly when filterId is provided", async () => {
      const service = new TicketService(mockEnv as any);

      mockDB.prepare.mockReturnThis();
      mockDB.bind.mockReturnThis();

      // Mocks:
      // 1. fetch filter
      mockDB.first.mockResolvedValueOnce({
        conditions: JSON.stringify([
          { field: "status", operator: "in", value: ["open", "pending"] },
          { field: "priority", operator: "equals", value: "urgent" }
        ]),
      });
      // 2. count query
      mockDB.first.mockResolvedValueOnce({ total: 2 });
      // 3. fetch tickets
      mockDB.all.mockResolvedValueOnce({
        results: [{ id: "t-1", status: "open" }, { id: "t-2", status: "pending" }],
      });

      const result = await service.findTickets({ filterId: "filter-123" });

      // Verify the filter fetch
      expect(mockDB.prepare).toHaveBeenCalledWith("SELECT conditions FROM ticket_filters WHERE id = ?");
      expect(mockDB.bind).toHaveBeenCalledWith("filter-123");

      // Verify the count query and ticket query contains the IN clauses
      const queries = mockDB.prepare.mock.calls.map(c => c[0]);
      const ticketQuery = queries.find(q => q.includes("SELECT tickets.*") && q.includes("LIMIT ? OFFSET ?"));
      
      expect(ticketQuery).toContain("status IN (?,?)");
      expect(ticketQuery).toContain("priority = ?");

      // Check bind values for the final query
      // The last call to bind should be for the tickets query
      expect(mockDB.bind).toHaveBeenLastCalledWith("open", "pending", "urgent", 50, 0);

      expect(result.data).toHaveLength(2);
      expect(result.meta.total).toBe(2);
    });

    it("should handle not_equals and contains operators correctly", async () => {
      const service = new TicketService(mockEnv as any);

      mockDB.prepare.mockReturnThis();
      mockDB.bind.mockReturnThis();

      mockDB.first.mockResolvedValueOnce({
        conditions: JSON.stringify([
          { field: "status", operator: "not_equals", value: "closed" },
          { field: "subject", operator: "contains", value: "login" }
        ]),
      });
      mockDB.first.mockResolvedValueOnce({ total: 1 });
      mockDB.all.mockResolvedValueOnce({
        results: [{ id: "t-1", status: "open", subject: "login issue" }],
      });

      const result = await service.findTickets({ filterId: "filter-456" });

      const queries = mockDB.prepare.mock.calls.map(c => c[0]);
      const ticketQuery = queries.find(q => q.includes("SELECT tickets.*") && q.includes("LIMIT ? OFFSET ?"));
      
      expect(ticketQuery).toContain("status != ?");
      expect(ticketQuery).toContain("subject LIKE ?");

      expect(mockDB.bind).toHaveBeenLastCalledWith("closed", "%login%", 50, 0);

      expect(result.data).toHaveLength(1);
    });
  });
});