import { Env } from '../bindings';

interface SessionAttachment {
  connectionId: string;
  userId: string;
  name: string;
  location: string | null;
}

export class NotificationDO {
  state: DurableObjectState;

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // Internal broadcast from the Worker
    if (url.pathname === '/broadcast') {
      const data = await request.json();
      this.broadcast(data);
      return new Response('OK');
    }

    // WebSocket upgrade
    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('Expected Upgrade: websocket', { status: 426 });
    }

    const userId = request.headers.get('X-User-ID');
    const userName = request.headers.get('X-User-Name') || '';

    if (!userId) {
      console.warn('[NotificationDO] Missing X-User-ID header');
      return new Response('Unauthorized', { status: 401 });
    }

    const { 0: client, 1: server } = new WebSocketPair();

    this.handleSession(server, {
      id: userId,
      name: userName,
    });

    return new Response(null, { status: 101, webSocket: client });
  }

  handleSession(ws: WebSocket, user: { id: string; name: string }) {
    this.state.acceptWebSocket(ws);

    const attachment: SessionAttachment = {
      connectionId: crypto.randomUUID(),
      userId: user.id,
      name: user.name,
      location: null,
    };
    ws.serializeAttachment(attachment);

    // Send initial presence state
    const allSessions = this.getAllSessions();
    this.send(ws, {
      type: 'presence.sync',
      payload: allSessions,
    });

    // Notify others of new connection
    this.broadcast({
      type: 'presence.update',
      payload: {
        connectionId: attachment.connectionId,
        userId: user.id,
        name: user.name,
        location: null,
        status: 'online',
      },
    }, ws);
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
    try {
      const data = JSON.parse(message as string);

      if (data.type === 'presence.update') {
        const attachment = ws.deserializeAttachment() as SessionAttachment | null;
        if (attachment) {
          // Prevent memory bloat from malicious long strings
          const rawLocation = data.payload?.location;
          attachment.location = typeof rawLocation === 'string' 
            ? rawLocation.substring(0, 100) 
            : null;
            
          ws.serializeAttachment(attachment);

          this.broadcast({
            type: 'presence.update',
            payload: {
              connectionId: attachment.connectionId,
              userId: attachment.userId,
              name: attachment.name,
              location: attachment.location,
              status: 'online',
            },
          });
        }
      }
    } catch (err) {
      console.error('WebSocket message error:', err);
    }
  }

  async webSocketClose(ws: WebSocket, code: number, reason: string, wasClean: boolean) {
    const attachment = ws.deserializeAttachment() as SessionAttachment | null;
    
    if (attachment) {
      this.broadcast({
        type: 'presence.update',
        payload: {
          connectionId: attachment.connectionId,
          userId: attachment.userId,
          name: attachment.name,
          status: 'offline',
        },
      });
    }
  }

  async webSocketError(ws: WebSocket, error: any) {
    this.webSocketClose(ws, 1006, 'Error', false);
  }

  broadcast(message: any, excludeWs?: WebSocket) {
    const msg = JSON.stringify(message);
    const sockets = this.state.getWebSockets();
    
    for (const ws of sockets) {
      if (ws === excludeWs) continue;
      try {
        ws.send(msg);
      } catch (err) {
        // Just ignore, the websocket will be closed
      }
    }
  }

  send(ws: WebSocket, message: any) {
    try {
      ws.send(JSON.stringify(message));
    } catch (err) {
      console.error('Failed to send message:', err);
    }
  }

  private getAllSessions(): SessionAttachment[] {
    const sockets = this.state.getWebSockets();
    const sessions: SessionAttachment[] = [];
    
    for (const ws of sockets) {
      const attachment = ws.deserializeAttachment() as SessionAttachment | null;
      if (attachment) {
        sessions.push(attachment);
      }
    }
    
    return sessions;
  }
}
