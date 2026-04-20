import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BroadcastService } from '../broadcast.service';
import { Env } from '../../bindings';

describe('BroadcastService', () => {
  let service: BroadcastService;
  let mockEnv: Env;
  let mockDO: any;

  beforeEach(() => {
    mockDO = {
      fetch: vi.fn().mockResolvedValue(new Response('OK')),
    };
    mockEnv = {
      NOTIFICATION_DO: {
        idFromName: vi.fn().mockReturnValue({ toString: () => 'mock-id' }),
        get: vi.fn().mockReturnValue(mockDO),
      },
    } as any;
    service = new BroadcastService(mockEnv);
  });

  it('should broadcast message to Durable Object', async () => {
    await service.broadcast('test.event', { foo: 'bar' });

    expect(mockEnv.NOTIFICATION_DO.idFromName).toHaveBeenCalledWith('global');
    expect(mockEnv.NOTIFICATION_DO.get).toHaveBeenCalled();
    expect(mockDO.fetch).toHaveBeenCalledWith('http://do/broadcast', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ type: 'test.event', payload: { foo: 'bar' } }),
    }));
  });

  it('should retry on failure', async () => {
    // Fail twice, then succeed
    mockDO.fetch
      .mockRejectedValueOnce(new Error('Network error'))
      .mockResolvedValueOnce(new Response('Error', { status: 500 }))
      .mockResolvedValueOnce(new Response('OK'));

    await service.broadcast('test.event', { foo: 'bar' }, 3);

    expect(mockDO.fetch).toHaveBeenCalledTimes(2);
  });

  it('should notify when ticket is created', async () => {
    const ticket = { id: '123', subject: 'Test Ticket', status: 'open', priority: 'normal' };
    await service.notifyTicketCreated(ticket);

    expect(mockDO.fetch).toHaveBeenCalledWith('http://do/broadcast', expect.objectContaining({
      body: JSON.stringify({ 
        type: 'ticket.created', 
        payload: { id: '123', subject: 'Test Ticket', status: 'open', priority: 'normal' } 
      }),
    }));
  });

  it('should notify when ticket is updated', async () => {
    const ticket = { id: '123', subject: 'Test Ticket', status: 'pending', priority: 'high' };
    await service.notifyTicketUpdated(ticket);

    expect(mockDO.fetch).toHaveBeenCalledWith('http://do/broadcast', expect.objectContaining({
      body: JSON.stringify({ 
        type: 'ticket.updated', 
        payload: { id: '123', subject: 'Test Ticket', status: 'pending', priority: 'high' } 
      }),
    }));
  });
});
