import PostalMime from 'postal-mime';
import { Env } from '../../bindings';
import { TicketService } from '../ticket.service';
import { StorageService } from '../storage.service';
import { ReplyParser } from './reply-parser';

export interface InboundEmailMessage {
  from: string;
  to: string;
  subject: string;
  raw: ReadableStream;
}

export class InboundEmailService {
  private ticketService: TicketService;
  private storageService: StorageService;

  constructor(private env: Env, private ctx?: ExecutionContext) {
    this.ticketService = new TicketService(env, ctx);
    this.storageService = new StorageService(env);
  }

  async handle(message: InboundEmailMessage): Promise<void> {
    const parser = new PostalMime();
    const email = await parser.parse(message.raw);

    // Identify ticket
    let ticket = await this.ticketService.findTicketBySubject(email.subject || '');

    // If not found by subject, try finding by thread headers
    if (!ticket && email.inReplyTo) {
      ticket = await this.ticketService.findTicketByRawEmailId(email.inReplyTo);
    }
    
    if (!ticket && email.references) {
      // References can be an array or space-separated string depending on version
      const refs = Array.isArray(email.references) ? email.references : email.references.split(/\s+/);
      for (const ref of refs.reverse()) { // Check newest first
        if (!ref) continue;
        ticket = await this.ticketService.findTicketByRawEmailId(ref);
        if (ticket) break;
      }
    }
    
    const customerEmail = email.from?.address || message.from;
    const body = ReplyParser.stripHistory(email.text, email.html);

    if (!ticket) {
      // Create new ticket
      ticket = await this.ticketService.createTicket({
        subject: email.subject || 'No Subject',
        customer_email: customerEmail,
        source: 'email',
        source_email: message.to,
      });
    }

    // Create article
    const article = await this.ticketService.createArticle({
      ticket_id: ticket.id,
      sender_type: 'customer',
      body: body,
      raw_email_id: email.messageId,
      qa_type: 'question',
    });

    // Update ticket timestamp
    await this.ticketService.updateTicketTimestamp(ticket.id);

    // Handle attachments
    if (email.attachments && email.attachments.length > 0) {
      for (const attachment of email.attachments) {
        const contentArray = typeof attachment.content === 'string'
          ? new TextEncoder().encode(attachment.content)
          : new Uint8Array(attachment.content);

        const r2Key = await this.storageService.uploadAttachment(
          ticket.id,
          article.id,
          attachment.filename || 'unnamed',
          contentArray,
          attachment.mimeType
        );

        await this.ticketService.addAttachment({
          article_id: article.id,
          file_name: attachment.filename || 'unnamed',
          file_size: contentArray.byteLength,
          content_type: attachment.mimeType,
          r2_key: r2Key,
        });
      }
    }
  }
}
