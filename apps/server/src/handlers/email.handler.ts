import { Env } from '../bindings';
import { InboundEmailService } from '../services/email/inbound.service';

// Per-isolate memory cache to catch rapid bursts of emails
const isolateRateLimit = new Map<string, { count: number; reset: number }>();

export class EmailHandler {
  constructor(private env: Env) {}

  async handleEmail(message: ForwardableEmailMessage, ctx: ExecutionContext): Promise<void> {
    try {
      const senderEmail = message.from.toLowerCase().trim();
      const headers = (message as any).headers;

      // 1. Spoofing Protection (SPF/DKIM/DMARC)
      const authResults = headers?.get('Authentication-Results') || '';
      if (
        authResults.includes('spf=fail') || 
        authResults.includes('dkim=fail') || 
        authResults.includes('dmarc=fail')
      ) {
        console.warn(`[Security] Rejected spoofed email from ${message.from}. Auth-Results: ${authResults}`);
        message.setReject('Spam/Spoofed email rejected due to authentication failure');
        return;
      }

      // 2. Isolate-level memory rate limiting (catch rapid bursts)
      const now = Date.now();
      const record = isolateRateLimit.get(senderEmail);
      if (!record || now > record.reset) {
        isolateRateLimit.set(senderEmail, { count: 1, reset: now + 60000 }); // 1 min window
      } else {
        record.count++;
        if (record.count > 5) {
          console.warn(`[Security] Isolate rate limited email burst from ${senderEmail}. Count: ${record.count}`);
          message.setReject('Rate limited: Too many messages sent in a short burst');
          return;
        }
      }

      // 3. Database-level rate limiting (catch sustained spam over an hour)
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const { results } = await this.env.DB.prepare(`
        SELECT count(*) as count 
        FROM articles 
        WHERE sender_type = 'customer' 
          AND sender_id = (SELECT id FROM users WHERE email = ? LIMIT 1)
          AND created_at > ?
      `).bind(senderEmail, oneHourAgo).all<{ count: number }>();

      const recentArticles = results[0]?.count as number || 0;
      if (recentArticles > 20) {
        console.warn(`[Security] Database rate limited email from ${senderEmail}. Recent articles: ${recentArticles}`);
        message.setReject('Rate limited: Too many messages sent recently');
        return;
      }

      const inboundService = new InboundEmailService(this.env, ctx);
      
      // Convert Cloudflare ForwardableEmailMessage to my service's interface
      // Note: Cloudflare message.raw is a stream.
      await inboundService.handle({
        from: message.from,
        to: message.to,
        subject: headers?.get('subject') || 'No Subject',
        raw: message.raw,
      });
    } catch (error) {
      console.error('Error handling inbound email:', error);
      // We don't want to rethrow to avoid infinite retries if the email is "bad"
      // In a real system, we'd log this to a dead-letter queue or database.
    }
  }
}
