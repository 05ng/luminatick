import { Env } from '../../bindings';
import { Ticket, Article, Attachment, SendEmailOptions } from '../../types';
import { arrayBufferToBase64 } from '../../utils/encoding';
import { decryptString } from '../../utils/crypto';

export class EmailService {
  constructor(private env: Env) {}

  
  async getResendCredentials(): Promise<{ apiKey: string, defaultFrom: string }> {
    let apiKey = this.env.RESEND_API_KEY;
    let defaultFrom = this.env.RESEND_FROM_EMAIL;

    if (!apiKey || !defaultFrom) {
      const { results } = await this.env.DB.prepare(
        "SELECT key, value FROM config WHERE key IN ('RESEND_API_KEY', 'RESEND_FROM_EMAIL')"
      ).all<{ key: string, value: string }>();

      const dbConfig = results.reduce((acc, row) => {
        acc[row.key] = row.value;
        return acc;
      }, {} as Record<string, string>);

      defaultFrom = defaultFrom || dbConfig['RESEND_FROM_EMAIL'];
      
      if (!apiKey && dbConfig['RESEND_API_KEY']) {
        if (!this.env.APP_MASTER_KEY) {
          throw new Error('APP_MASTER_KEY is missing. Cannot decrypt RESEND_API_KEY.');
        }
        try {
          apiKey = await decryptString(dbConfig['RESEND_API_KEY'], this.env.APP_MASTER_KEY);
        } catch (error) {
          throw new Error('Failed to decrypt RESEND_API_KEY. ' + (error instanceof Error ? error.message : String(error)));
        }
      }
    }

    if (!apiKey) {
      throw new Error('Resend API Key not configured. Please configure it in Email Channel settings.');
    }

    return { apiKey, defaultFrom: defaultFrom || 'support@luminatick.com' };
  }

  async send(options: SendEmailOptions): Promise<{ id: string }> {
    const creds = await this.getResendCredentials();
    const fromAddress = options.from || creds.defaultFrom;
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${creds.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: fromAddress,
        to: options.to,
        subject: options.subject,
        html: options.html,
        text: options.text,
        headers: options.headers,
        attachments: options.attachments?.map((a) => ({
          filename: a.filename,
          content: arrayBufferToBase64(a.content.buffer),
          contentType: a.contentType,
        })),
      }),
    });

    if (!res.ok) {
      const error = await res.text();
      throw new Error(`Failed to send email: ${error}`);
    }

    return (await res.json()) as { id: string };
  }

  async sendTicketReply(
    ticket: Ticket,
    article: Article,
    attachments: Attachment[] = [],
    replyToEmailId?: string
  ): Promise<void> {
    const configResult = await this.env.DB.prepare("SELECT value FROM config WHERE key = 'TICKET_PREFIX' LIMIT 1").first<{value: string}>();
    const prefix = configResult?.value || '#';

    const ticketNoStr = ticket.ticket_no
      ? ticket.ticket_no.toString()
      : ticket.id;

    const subjectPrefix = `[${prefix}${ticketNoStr}]`;
    const subject = ticket.subject.includes(subjectPrefix)
      ? ticket.subject
      : `${subjectPrefix} ${ticket.subject}`;

    const headers: Record<string, string> = {};
    if (replyToEmailId) {
      headers['In-Reply-To'] = replyToEmailId;
      headers['References'] = replyToEmailId; // Ideally append to existing refs
    }

    // Determine the from email address
    let fromEmail: string | undefined;
    
    try {
      if (ticket.group_id) {
        const groupEmail = await this.env.DB.prepare(
          'SELECT email_address FROM support_emails WHERE group_id = ? LIMIT 1'
        ).bind(ticket.group_id).first<{ email_address: string }>();
        
        if (groupEmail) {
          fromEmail = groupEmail.email_address;
        }
      }
      
      if (!fromEmail) {
        const defaultEmail = await this.env.DB.prepare(
          'SELECT email_address FROM support_emails WHERE is_default = 1 LIMIT 1'
        ).first<{ email_address: string }>();
        
        if (defaultEmail) {
          fromEmail = defaultEmail.email_address;
        }
      }
    } catch (e) {
      // Table might not exist yet or other DB error
      console.error("Failed to resolve support email from DB:", e);
    }
    
    if (!fromEmail) {
      const creds = await this.getResendCredentials();
      fromEmail = ticket.source_email || creds.defaultFrom;
    }

    // Fetch attachment contents from R2 if needed
    // For simplicity, we assume this method is called after article is saved.
    // In a real scenario, we'd need to fetch the R2 objects.
    const resendAttachments = await Promise.all(
      attachments.map(async (a) => {
        const obj = await this.env.ATTACHMENTS_BUCKET.get(a.r2_key);
        if (!obj) throw new Error(`Attachment not found: ${a.r2_key}`);
        const content = await obj.arrayBuffer();
        return {
          filename: a.file_name,
          content: new Uint8Array(content),
          contentType: a.content_type,
        };
      })
    );

    await this.send({
      from: fromEmail || undefined,
      to: [ticket.customer_email],
      subject: subject,
      html: article.body || '',
      headers: headers,
      attachments: resendAttachments,
    });
  }
}
