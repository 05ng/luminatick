import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NotificationDO } from '../NotificationDO';

describe('NotificationDO', () => {
  let doInstance: NotificationDO;
  let mockState: any;
  let mockEnv: any;
  let mockWS: any;

  beforeEach(() => {
    mockState = {
      getWebSockets: vi.fn().mockReturnValue([]),
      acceptWebSocket: vi.fn(),
    };
    mockEnv = {};
    mockWS = {
      send: vi.fn(),
      serializeAttachment: vi.fn(),
      deserializeAttachment: vi.fn().mockReturnValue({ connectionId: 'test-conn-1', userId: '1', name: 'Agent', location: null }),
    };
    doInstance = new NotificationDO(mockState, mockEnv);
  });

  it('should handle broadcast requests', async () => {
    const request = new Request('http://do/broadcast', {
      method: 'POST',
      body: JSON.stringify({ type: 'test', payload: { data: 'hi' } }),
    });

    const socket1 = { send: vi.fn(), deserializeAttachment: vi.fn() };
    const socket2 = { send: vi.fn(), deserializeAttachment: vi.fn() };
    mockState.getWebSockets.mockReturnValue([socket1, socket2]);

    const response = await doInstance.fetch(request);
    expect(response.status).toBe(200);
    expect(socket1.send).toHaveBeenCalledWith(JSON.stringify({ type: 'test', payload: { data: 'hi' } }));
    expect(socket2.send).toHaveBeenCalledWith(JSON.stringify({ type: 'test', payload: { data: 'hi' } }));
  });

  it('should initialize session attachment and broadcast presence on connection', async () => {
    const otherWS = { 
      send: vi.fn(), 
      deserializeAttachment: vi.fn().mockReturnValue({ connectionId: 'test-conn-2', userId: '2', name: 'Other', location: 'ticket:1' }) 
    };
    mockState.getWebSockets.mockReturnValue([mockWS, otherWS]);

    const request = new Request('http://do/api/realtime', {
      headers: new Headers({
        'Upgrade': 'websocket',
        'X-User-ID': '1',
        'X-User-Name': 'Agent'
      })
    });

    // Mock WebSocketPair
    const serverWS = { ...mockWS };
    const clientWS = {};
    global.WebSocketPair = vi.fn().mockImplementation(function() {
      return { 0: clientWS, 1: serverWS };
    }) as any;

    const originalResponse = global.Response;
    global.Response = class {
      status: number;
      body: any;
      init: any;
      constructor(body: any, init: any) {
        this.status = init?.status || 200;
        this.body = body;
        this.init = init;
      }
    } as any;

    const response = await doInstance.fetch(request);
    
    // Restore original response
    global.Response = originalResponse;

    expect((response as any).status).toBe(101);

    // Verify serializeAttachment was called with initial state
    expect(serverWS.serializeAttachment).toHaveBeenCalledWith({
      connectionId: expect.any(String),
      userId: '1',
      name: 'Agent',
      location: null,
    });

    // Verify initial state was sent to the connecting user
    expect(serverWS.send).toHaveBeenCalledWith(expect.stringContaining('"type":"presence.sync"'));
    expect(serverWS.send).toHaveBeenCalledWith(expect.stringContaining('"userId":"2"'));

    // Verify other users were notified of the new connection
    expect(otherWS.send).toHaveBeenCalledWith(expect.stringContaining('"type":"presence.update"'));
    expect(otherWS.send).toHaveBeenCalledWith(expect.stringContaining('"userId":"1"'));
  });

  it('should handle presence updates and truncate long locations to prevent memory bloat', async () => {
    const otherWS = { 
      send: vi.fn(), 
      deserializeAttachment: vi.fn().mockReturnValue({ connectionId: 'test-conn-2', userId: '2', name: 'Other', location: null }) 
    };
    mockState.getWebSockets.mockReturnValue([mockWS, otherWS]);

    const longLocation = 'a'.repeat(200);
    const message = JSON.stringify({ 
      type: 'presence.update', 
      payload: { location: longLocation } 
    });
    
    await doInstance.webSocketMessage(mockWS as any, message);

    // Should truncate to 100 chars
    expect(mockWS.serializeAttachment).toHaveBeenCalledWith({
      connectionId: 'test-conn-1',
      userId: '1',
      name: 'Agent',
      location: 'a'.repeat(100)
    });
    
    expect(otherWS.send).toHaveBeenCalledWith(expect.stringContaining('"type":"presence.update"'));
    expect(otherWS.send).toHaveBeenCalledWith(expect.stringContaining('"location":"' + 'a'.repeat(100) + '"'));
  });

  it('should cleanup session on close by reading attachment and broadcasting offline', async () => {
    const otherWS = { send: vi.fn(), deserializeAttachment: vi.fn() };
    mockState.getWebSockets.mockReturnValue([otherWS]);

    await doInstance.webSocketClose(mockWS as any, 1000, 'Normal', true);

    expect(mockWS.deserializeAttachment).toHaveBeenCalled();
    expect(otherWS.send).toHaveBeenCalledWith(JSON.stringify({
      type: 'presence.update',
      payload: {
        connectionId: 'test-conn-1',
        userId: '1',
        name: 'Agent',
        status: 'offline',
      }
    }));
  });
});
