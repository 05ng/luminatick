import { describe, it, expect, vi, beforeEach } from "vitest";
import { EmailService } from "../outbound.service";
import { Ticket, Article } from "../../types";

const mockEnv = {
  RESEND_API_KEY: "test-key",
  RESEND_FROM_EMAIL: "support@test.com",
  DB: {
    prepare: vi.fn().mockReturnValue({
      first: vi.fn().mockResolvedValue({ value: '#' })
    })
  }
};

describe("EmailService Outbound Subject Padding", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ id: "email-id" }),
    });
  });

  it("should format subject with ticket_no without padding (1 -> 1)", async () => {
    const service = new EmailService(mockEnv as any);
    const ticket: Partial<Ticket> = {
      id: "uuid-1",
      ticket_no: 1,
      subject: "Help Me",
      customer_email: "customer@example.com",
    };
    const article: Partial<Article> = {
      body: "How can we help?",
    };

    await service.sendTicketReply(ticket as Ticket, article as Article);

    expect(global.fetch).toHaveBeenCalledWith(
      "https://api.resend.com/emails",
      expect.objectContaining({
        body: expect.stringContaining("[#1] Help Me")
      })
    );
  });

  it("should format subject with ticket_no without padding (123 -> 123)", async () => {
    const service = new EmailService(mockEnv as any);
    const ticket: Partial<Ticket> = {
      id: "uuid-123",
      ticket_no: 123,
      subject: "Bug Report",
      customer_email: "customer@example.com",
    };
    const article: Partial<Article> = {
      body: "Fix this please.",
    };

    await service.sendTicketReply(ticket as Ticket, article as Article);

    expect(global.fetch).toHaveBeenCalledWith(
      "https://api.resend.com/emails",
      expect.objectContaining({
        body: expect.stringContaining("[#123] Bug Report")
      })
    );
  });

  it("should fallback to ticket.id if ticket_no is missing", async () => {
    const service = new EmailService(mockEnv as any);
    const ticket: Partial<Ticket> = {
      id: "uuid-123",
      subject: "Help Me",
      customer_email: "customer@example.com",
    };
    const article: Partial<Article> = {
      body: "How can we help?",
    };

    await service.sendTicketReply(ticket as Ticket, article as Article);

    expect(global.fetch).toHaveBeenCalledWith(
      "https://api.resend.com/emails",
      expect.objectContaining({
        body: expect.stringContaining("[#uuid-123] Help Me")
      })
    );
  });
});

describe("EmailService Outbound Group Email Resolution", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ id: "email-id" }),
    });
  });

  const createMockDB = (mockGroupEmail: string | null, mockDefaultEmail: string | null) => {
    return {
      prepare: vi.fn().mockImplementation((query: string) => {
        return {
          bind: vi.fn().mockImplementation(() => ({
            first: vi.fn().mockResolvedValue(
              query.includes('group_id = ?') && mockGroupEmail
                ? { email_address: mockGroupEmail }
                : null
            )
          })),
          first: vi.fn().mockResolvedValue(
            query.includes('is_default = 1') && mockDefaultEmail
              ? { email_address: mockDefaultEmail }
              : query.includes('TICKET_PREFIX')
              ? { value: '#' }
              : null
          )
        };
      })
    };
  };

  it("should use group email when ticket has group_id and group email exists", async () => {
    const mockDB = createMockDB("sales@test.com", "default@test.com");
    const envWithDb = { ...mockEnv, DB: mockDB };
    const service = new EmailService(envWithDb as any);
    
    const ticket: Partial<Ticket> = {
      id: "uuid-1",
      subject: "Buy",
      customer_email: "customer@example.com",
      group_id: "group-1",
      source_email: "source@test.com"
    };
    const article: Partial<Article> = { body: "Yes." };

    await service.sendTicketReply(ticket as Ticket, article as Article);

    expect(global.fetch).toHaveBeenCalledWith(
      "https://api.resend.com/emails",
      expect.objectContaining({
        body: expect.stringContaining('"from":"sales@test.com"')
      })
    );
  });
  
  it("should fallback to default email when group_id present but no group email exists", async () => {
    const mockDB = createMockDB(null, "default@test.com");
    const envWithDb = { ...mockEnv, DB: mockDB };
    const service = new EmailService(envWithDb as any);
    
    const ticket: Partial<Ticket> = {
      id: "uuid-1",
      subject: "Buy",
      customer_email: "customer@example.com",
      group_id: "group-1",
      source_email: "source@test.com"
    };
    const article: Partial<Article> = { body: "Yes." };

    await service.sendTicketReply(ticket as Ticket, article as Article);

    expect(global.fetch).toHaveBeenCalledWith(
      "https://api.resend.com/emails",
      expect.objectContaining({
        body: expect.stringContaining('"from":"default@test.com"')
      })
    );
  });
  
  it("should fallback to source_email if no default email exists either", async () => {
    const mockDB = createMockDB(null, null);
    const envWithDb = { ...mockEnv, DB: mockDB };
    const service = new EmailService(envWithDb as any);
    
    const ticket: Partial<Ticket> = {
      id: "uuid-1",
      subject: "Buy",
      customer_email: "customer@example.com",
      group_id: "group-1",
      source_email: "source@test.com"
    };
    const article: Partial<Article> = { body: "Yes." };

    await service.sendTicketReply(ticket as Ticket, article as Article);

    expect(global.fetch).toHaveBeenCalledWith(
      "https://api.resend.com/emails",
      expect.objectContaining({
        body: expect.stringContaining('"from":"source@test.com"')
      })
    );
  });
  
  it("should fallback to RESEND_FROM_EMAIL if source_email is missing and no DB emails", async () => {
    const mockDB = createMockDB(null, null);
    const envWithDb = { ...mockEnv, DB: mockDB };
    const service = new EmailService(envWithDb as any);
    
    const ticket: Partial<Ticket> = {
      id: "uuid-1",
      subject: "Buy",
      customer_email: "customer@example.com",
      group_id: "group-1"
    };
    const article: Partial<Article> = { body: "Yes." };

    await service.sendTicketReply(ticket as Ticket, article as Article);

    expect(global.fetch).toHaveBeenCalledWith(
      "https://api.resend.com/emails",
      expect.objectContaining({
        body: expect.stringContaining('"from":"support@test.com"')
      })
    );
  });
});
