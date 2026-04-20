import { describe, it, expect, vi, beforeEach } from 'vitest';
import { InboundEmailService } from '../inbound.service';
import { TicketService } from '../../ticket.service';
import { StorageService } from '../../storage.service';
import PostalMime from 'postal-mime';

vi.mock('../../ticket.service');
vi.mock('../../storage.service');
vi.mock('postal-mime');

describe('InboundEmailService', () => {
  let env: any;
  let service: InboundEmailService;
  let mockTicketService: any;
  let mockStorageService: any;

  beforeEach(() => {
    vi.clearAllMocks();
    env = {
      DB: {},
      ATTACHMENTS_BUCKET: {},
      RESEND_API_KEY: 'test-key',
      RESEND_FROM_EMAIL: 'support@example.com',
    };
    
    // Resetting mocks for each test
    // We instantiate the service which then instantiates the mocked services
    service = new InboundEmailService(env);
    
    // Capture the mock instances
    mockTicketService = (TicketService as any).mock.instances[0];
    mockStorageService = (StorageService as any).mock.instances[0];
  });

  it('should create a new ticket for a new email', async () => {
    const mockEmail = {
      subject: 'New issue',
      from: { address: 'customer@example.com' },
      text: 'Help me!',
      messageId: 'msg-123',
    };

    (PostalMime.prototype.parse as any).mockResolvedValue(mockEmail);
    mockTicketService.findTicketBySubject.mockResolvedValue(null);
    mockTicketService.createTicket.mockResolvedValue({ id: 'ticket-1', subject: 'New issue', customer_email: 'customer@example.com' });
    mockTicketService.createArticle.mockResolvedValue({ id: 'article-1' });

    await service.handle({
      from: 'customer@example.com',
      to: 'support@luminatick.com',
      subject: 'New issue',
      raw: new ReadableStream(),
    } as any);

    expect(mockTicketService.createTicket).toHaveBeenCalledWith(expect.objectContaining({
      subject: 'New issue',
      customer_email: 'customer@example.com',
    }));
    expect(mockTicketService.createArticle).toHaveBeenCalledWith(expect.objectContaining({
      ticket_id: 'ticket-1',
      body: 'Help me!',
    }));
  });

  it('should add a reply to an existing ticket found by subject', async () => {
    const mockEmail = {
      subject: 'Re: [#123] New issue',
      from: { address: 'customer@example.com' },
      text: 'Following up.',
      messageId: 'msg-456',
    };

    (PostalMime.prototype.parse as any).mockResolvedValue(mockEmail);
    mockTicketService.findTicketBySubject.mockResolvedValue({ id: '123', subject: '[#123] New issue', customer_email: 'customer@example.com' });
    mockTicketService.createArticle.mockResolvedValue({ id: 'article-2' });

    await service.handle({
      from: 'customer@example.com',
      to: 'support@luminatick.com',
      subject: 'Re: [#123] New issue',
      raw: new ReadableStream(),
    } as any);

    expect(mockTicketService.createTicket).not.toHaveBeenCalled();
    expect(mockTicketService.createArticle).toHaveBeenCalledWith(expect.objectContaining({
      ticket_id: '123',
      body: 'Following up.',
    }));
  });

  it('should add a reply to an existing ticket found by thread headers', async () => {
    const mockEmail = {
      subject: 'Help',
      from: { address: 'customer@example.com' },
      text: 'Replied by thread.',
      inReplyTo: 'msg-123',
      messageId: 'msg-789',
    };

    (PostalMime.prototype.parse as any).mockResolvedValue(mockEmail);
    mockTicketService.findTicketBySubject.mockResolvedValue(null);
    mockTicketService.findTicketByRawEmailId.mockResolvedValue({ id: '123', customer_email: 'customer@example.com' });
    mockTicketService.createArticle.mockResolvedValue({ id: 'article-3' });

    await service.handle({
      from: 'customer@example.com',
      to: 'support@luminatick.com',
      subject: 'Help',
      raw: new ReadableStream(),
    } as any);

    expect(mockTicketService.findTicketByRawEmailId).toHaveBeenCalledWith('msg-123');
    expect(mockTicketService.createArticle).toHaveBeenCalledWith(expect.objectContaining({
      ticket_id: '123',
      body: 'Replied by thread.',
    }));
  });
});
