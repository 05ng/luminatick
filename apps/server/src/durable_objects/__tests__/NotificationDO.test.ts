import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NotificationDO } from '../NotificationDO';

describe('NotificationDO', () => {
  let doInstance: NotificationDO;
  let mockState: any;
  let mockStorage: any;
  let mockEnv: any;
  let mockWS: any;

  beforeEach(() => {
    mockStorage = {
      get: vi.fn(),
      put: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(undefined),
      list: vi.fn().mockResolvedValue(new Map()),
    };
    mockState = {
      storage: mockStorage,
      getWebSockets: vi.fn().mockReturnValue([]),
      acceptWebSocket: vi.fn(),
      getTags: vi.fn().mockReturnValue(['session:test-id', 'user:1']),
    };
    mockEnv = {};
    mockWS = {
      send: vi.fn(),
    };
    doInstance = new NotificationDO(mockState, mockEnv);
  });

  it('should handle broadcast requests', async () => {
    const request = new Request('http://do/broadcast', {
      method: 'POST',
      body: JSON.stringify({ type: 'test', payload: { data: 'hi' } }),
    });

    // Mock active sockets
    const socket1 = { send: vi.fn() };
    const socket2 = { send: vi.fn() };
    mockState.getWebSockets.mockReturnValue([socket1, socket2]);

    const response = await doInstance.fetch(request);
    expect(response.status).toBe(200);
    expect(socket1.send).toHaveBeenCalledWith(JSON.stringify({ type: 'test', payload: { data: 'hi' } }));
    expect(socket2.send).toHaveBeenCalledWith(JSON.stringify({ type: 'test', payload: { data: 'hi' } }));
  });

  it('should handle websocket messages', async () => {
    const session = { id: 'test-id', user: { id: 1, name: 'Agent' }, lastActive: Date.now() };
    mockStorage.get.mockResolvedValue(session);

    const message = JSON.stringify({ type: 'ping', timestamp: 123456 });
    await doInstance.webSocketMessage(mockWS as any, message);

    expect(mockWS.send).toHaveBeenCalledWith(expect.stringContaining('"type":"pong"'));
    expect(mockStorage.put).toHaveBeenCalled();
  });

  it('should handle presence updates from client', async () => {
    const session = { id: 'test-id', user: { id: 1, name: 'Agent' }, lastActive: Date.now() };
    mockStorage.get.mockResolvedValue(session);
    
    // Mock sockets for broadcast
    const otherWS = { send: vi.fn() };
    mockState.getWebSockets.mockReturnValue([mockWS, otherWS]);

    const message = JSON.stringify({ 
      type: 'presence.update', 
      payload: { location: 'ticket:123' } 
    });
    
    await doInstance.webSocketMessage(mockWS as any, message);

    expect(mockStorage.put).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({
      location: 'ticket:123'
    }));
    
    // Broadcast should happen to others
    expect(otherWS.send).toHaveBeenCalledWith(expect.stringContaining('"type":"presence.update"'));
    expect(otherWS.send).toHaveBeenCalledWith(expect.stringContaining('"location":"ticket:123"'));
  });

  it('should cleanup session on close', async () => {
    const session = { id: 'test-id', user: { id: 1, name: 'Agent' } };
    mockStorage.get.mockResolvedValue(session);

    await doInstance.webSocketClose(mockWS as any, 1000, 'Normal', true);

    expect(mockStorage.delete).toHaveBeenCalledWith('session:test-id');
    // Should broadcast offline status
    expect(mockState.getWebSockets).toHaveBeenCalled();
  });
});
