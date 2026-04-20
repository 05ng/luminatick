import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AutomationService } from '../automation.service';
import { Ticket, Article } from '../../types';

describe('AutomationService', () => {
  let automationService: AutomationService;
  let mockEnv: any;

  beforeEach(() => {
    vi.useFakeTimers();
    mockEnv = {
      DB: {
        prepare: vi.fn().mockReturnThis(),
        bind: vi.fn().mockReturnThis(),
        all: vi.fn(),
        first: vi.fn(),
        run: vi.fn(),
      },
      ATTACHMENTS_BUCKET: {
        delete: vi.fn(),
      },
    };
    automationService = new AutomationService(mockEnv);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('evaluateConditions', () => {
    const ticket: Ticket = {
      id: 't1',
      subject: 'Critical issue in production',
      status: 'open',
      priority: 'high',
      customer_email: 'test@example.com',
      source: 'email',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    it('should return true if no conditions are provided', () => {
      expect(automationService.evaluateConditions(undefined, { ticket })).toBe(true);
      expect(automationService.evaluateConditions('[]', { ticket })).toBe(true);
    });

    it('should match regex condition on subject', () => {
      const conditions = JSON.stringify([
        { field: 'ticket.subject', operator: 'regex', value: 'critical.*production' }
      ]);
      expect(automationService.evaluateConditions(conditions, { ticket })).toBe(true);
    });

    it('should handle invalid regex safely', () => {
      const conditions = JSON.stringify([
        { field: 'ticket.subject', operator: 'regex', value: '[' }
      ]);
      expect(automationService.evaluateConditions(conditions, { ticket })).toBe(false);
    });

    it('should protect against long regex (ReDoS)', () => {
      const longRegex = 'a'.repeat(200);
      const conditions = JSON.stringify([
        { field: 'ticket.subject', operator: 'regex', value: longRegex }
      ]);
      expect(automationService.evaluateConditions(conditions, { ticket })).toBe(false);
    });

    it('should match equals condition on priority', () => {
      const conditions = JSON.stringify([
        { field: 'ticket.priority', operator: 'equals', value: 'high' }
      ]);
      expect(automationService.evaluateConditions(conditions, { ticket })).toBe(true);
    });

    it('should fail if one condition does not match', () => {
      const conditions = JSON.stringify([
        { field: 'ticket.subject', operator: 'regex', value: 'critical' },
        { field: 'ticket.priority', operator: 'equals', value: 'low' }
      ]);
      expect(automationService.evaluateConditions(conditions, { ticket })).toBe(false);
    });

    it('should match article body for article events', () => {
      const article: Article = {
        id: 'a1',
        ticket_id: 't1',
        sender_type: 'customer',
        body: 'I need help immediately!',
        is_internal: false,
        created_at: new Date().toISOString(),
      };
      const conditions = JSON.stringify([
        { field: 'article.body', operator: 'contains', value: 'immediately' }
      ]);
      expect(automationService.evaluateConditions(conditions, { ticket, article })).toBe(true);
    });
  });

  describe('executeWebhook', () => {
    it('should call fetch with correct parameters and timeout support', async () => {
      const globalFetch = vi.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        text: () => Promise.resolve('ok'),
      } as Response);

      const config = JSON.stringify({
        url: 'https://hooks.slack.com/test',
        headers: { 'X-Custom': 'Value' }
      });
      
      const payload = { ticket: { id: 't1' } };
      
      await (automationService as any).executeWebhook(config, payload);

      expect(globalFetch).toHaveBeenCalledWith('https://hooks.slack.com/test', expect.objectContaining({
        method: 'POST',
        signal: expect.any(AbortSignal)
      }));
    });

    it('should handle fetch errors gracefully', async () => {
      const globalFetch = vi.spyOn(global, 'fetch').mockRejectedValue(new Error('Network error'));
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const config = JSON.stringify({ url: 'https://hooks.slack.com/test' });
      await (automationService as any).executeWebhook(config, {});

      expect(consoleSpy).toHaveBeenCalledWith('Failed to execute webhook', expect.any(Error));
    });
  });

  describe('runRetention', () => {
    it('should delete old tickets in batches', async () => {
      // 1. Mock getActiveRules
      mockEnv.DB.all.mockResolvedValueOnce({ results: [
        { id: 'rule1', action_config: JSON.stringify({ days_to_keep: 30, delete_attachments: true }) }
      ]});

      // 2. Mock first batch of tickets
      mockEnv.DB.all.mockResolvedValueOnce({ results: [
        { id: 'old-1' }, { id: 'old-2' }
      ]});

      // 3. Mock attachments for these tickets
      mockEnv.DB.all.mockResolvedValueOnce({ results: [
        { r2_key: 'file1.pdf' }
      ]});

      // 4. Mock deletion result for first batch
      mockEnv.DB.run.mockResolvedValue({ meta: { changes: 2 } });

      // 5. Mock second batch (empty) to stop the loop
      mockEnv.DB.all.mockResolvedValueOnce({ results: [] });

      const result = await automationService.runRetention();

      expect(result.deleted_tickets).toBe(2);
      expect(result.deleted_attachments).toBe(1);
      expect(mockEnv.ATTACHMENTS_BUCKET.delete).toHaveBeenCalledWith('file1.pdf');
      
      // Check that it queried for tickets at least twice
      expect(mockEnv.DB.prepare).toHaveBeenCalledWith(expect.stringContaining('SELECT id FROM tickets'));
    });
  });
});
