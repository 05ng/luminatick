import { Env } from '../bindings';
import { AutomationRule, AutomationCondition, WebhookConfig, RetentionConfig, Ticket, Article } from '../types';

export class AutomationService {
  constructor(private env: Env) {}

  async getActiveRules(eventType: string): Promise<AutomationRule[]> {
    return await this.env.DB.prepare('SELECT * FROM automation_rules WHERE event_type = ? AND is_active = 1')
      .bind(eventType)
      .all<AutomationRule>()
      .then(res => res.results);
  }

  async dispatch(eventType: string, payload: { ticket: Ticket; article?: Article }): Promise<void> {
    const rules = await this.getActiveRules(eventType);
    
    for (const rule of rules) {
      if (this.evaluateConditions(rule.conditions, payload)) {
        await this.executeAction(rule, payload);
      }
    }
  }

  evaluateConditions(conditionsJson: string | undefined, payload: { ticket: Ticket; article?: Article }): boolean {
    if (!conditionsJson) return true;
    
    try {
      const conditions: AutomationCondition[] = JSON.parse(conditionsJson);
      if (conditions.length === 0) return true;

      return conditions.every(condition => {
        const valueToTest = this.getPropertyValue(payload, condition.field);
        if (valueToTest === undefined) return false;

        switch (condition.operator) {
          case 'equals':
            return String(valueToTest) === condition.value;
          case 'not_equals':
            return String(valueToTest) !== condition.value;
          case 'contains':
            return String(valueToTest).includes(condition.value);
          case 'regex':
            try {
              // Basic ReDoS protection: limit regex length
              if (condition.value.length > 100) {
                console.error('Regex too long, skipping for safety');
                return false;
              }
              const regex = new RegExp(condition.value, 'i');
              const stringToTest = String(valueToTest);
              // Limit string length to test
              if (stringToTest.length > 1000) return false;
              
              return regex.test(stringToTest);
            } catch (e) {
              console.error(`Invalid regex in automation rule: ${condition.value}`, e);
              return false;
            }
          default:
            return false;
        }
      });
    } catch (e) {
      console.error('Failed to parse automation conditions', e);
      return false;
    }
  }

  private getPropertyValue(payload: { ticket: Ticket; article?: Article }, field: string): any {
    if (field.startsWith('ticket.')) {
      const ticketField = field.replace('ticket.', '') as keyof Ticket;
      return payload.ticket[ticketField];
    }
    if (field.startsWith('article.') && payload.article) {
      const articleField = field.replace('article.', '') as keyof Article;
      return payload.article[articleField];
    }
    // Backward compatibility or direct fields
    if (payload.article && field in payload.article) return (payload.article as any)[field];
    if (field in payload.ticket) return (payload.ticket as any)[field];
    
    return undefined;
  }

  async executeAction(rule: AutomationRule, payload: any): Promise<void> {
    switch (rule.action_type) {
      case 'webhook':
        await this.executeWebhook(rule.action_config, payload);
        break;
      case 'retention':
        // Retention is usually triggered by scheduled events, not per-ticket events
        break;
      default:
        console.warn(`Unknown action type: ${rule.action_type}`);
    }
  }

  private async executeWebhook(configJson: string, payload: any): Promise<void> {
    try {
      const config: WebhookConfig = JSON.parse(configJson);
      
      if (!config.url.startsWith('http')) {
        console.error('Invalid webhook URL protocol');
        return;
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout

      const response = await fetch(config.url, {
        method: config.method || 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...config.headers
        },
        body: JSON.stringify({
          event: 'automation_trigger',
          timestamp: new Date().toISOString(),
          data: payload
        }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        console.error(`Webhook failed with status ${response.status}: ${await response.text()}`);
      }
    } catch (e: any) {
      if (e.name === 'AbortError') {
        console.error('Webhook request timed out');
      } else {
        console.error('Failed to execute webhook', e);
      }
    }
  }

  async runRetention(): Promise<{ deleted_tickets: number; deleted_attachments: number }> {
    const rules = await this.getActiveRules('scheduled.retention');
    let totalDeletedTickets = 0;
    let totalDeletedAttachments = 0;

    for (const rule of rules) {
      try {
        const config: RetentionConfig = JSON.parse(rule.action_config);
        const days = config.days_to_keep || 365;
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - days);
        const cutoffStr = cutoffDate.toISOString();

        // 1. Process in batches to avoid D1 limits and timeout issues
        const batchSize = 100;
        let hasMore = true;

        while (hasMore) {
          const ticketsToDelete = await this.env.DB.prepare(
            'SELECT id FROM tickets WHERE updated_at < ? LIMIT ?'
          ).bind(cutoffStr, batchSize).all<{id: string}>().then(res => res.results);

          if (ticketsToDelete.length === 0) {
            hasMore = false;
            break;
          }

          const ticketIds = ticketsToDelete.map(t => t.id);
          const placeholders = ticketIds.map(() => '?').join(',');

          // 2. Cleanup attachments from R2 if needed
          if (config.delete_attachments) {
            // Find all R2 keys for these tickets
            const attachments = await this.env.DB.prepare(`
              SELECT r2_key FROM attachments 
              WHERE article_id IN (
                SELECT id FROM articles WHERE ticket_id IN (${placeholders})
              )
            `).bind(...ticketIds).all<{r2_key: string}>().then(res => res.results);

            for (const attachment of attachments) {
              try {
                await this.env.ATTACHMENTS_BUCKET.delete(attachment.r2_key);
                totalDeletedAttachments++;
              } catch (e) {
                console.error(`Failed to delete R2 object: ${attachment.r2_key}`, e);
              }
            }
          }

          // 2.5 Delete QA vectors from Vectorize
          const qaArticles = await this.env.DB.prepare(`
            SELECT id, chunk_count FROM articles 
            WHERE ticket_id IN (${placeholders}) AND qa_type IS NOT NULL
          `).bind(...ticketIds).all<{id: string, chunk_count: number}>().then(res => res.results);

          if (qaArticles.length > 0) {
            const vectorIdsToDelete: string[] = [];
            for (const qa of qaArticles) {
              const count = qa.chunk_count || 10; // Fallback to 10 for old articles
              for (let i = 0; i < count; i++) {
                vectorIdsToDelete.push(`qa_${qa.id}_${i}`);
              }
            }
            // Delete in chunks of 5000 (Vectorize limit)
            for (let i = 0; i < vectorIdsToDelete.length; i += 5000) {
              const chunk = vectorIdsToDelete.slice(i, i + 5000);
              try {
                await this.env.VECTOR_INDEX.deleteByIds(chunk);
              } catch (e) {
                console.error('Failed to delete vectors during retention:', e);
              }
            }
          }

          // 3. Delete from DB with explicit cascades for safety
          // D1 transactions are currently experimental and might have limitations, 
          // but we can use multiple statements in one call for some level of atomicity.

          await this.env.DB.prepare(`DELETE FROM attachments WHERE article_id IN (SELECT id FROM articles WHERE ticket_id IN (${placeholders}))`).bind(...ticketIds).run();          await this.env.DB.prepare(`DELETE FROM articles WHERE ticket_id IN (${placeholders})`).bind(...ticketIds).run();
          const deleteRes = await this.env.DB.prepare(`DELETE FROM tickets WHERE id IN (${placeholders})`).bind(...ticketIds).run();
          
          totalDeletedTickets += deleteRes.meta.changes || 0;
          
          // If we deleted less than the batch size, we're likely done with this rule
          if (ticketsToDelete.length < batchSize) {
            hasMore = false;
          }
        }

      } catch (e) {
        console.error('Error running retention rule:', e);
      }
    }

    return { deleted_tickets: totalDeletedTickets, deleted_attachments: totalDeletedAttachments };
  }
}
