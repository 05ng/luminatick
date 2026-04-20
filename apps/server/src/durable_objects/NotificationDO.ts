import { Env } from '../bindings';

interface Session {
  id: string;
  user: {
    id: string;
    email: string;
    name: string;
    role: string;
  };
  location?: string;
  lastActive: number;
}

export class NotificationDO {
  state: DurableObjectState;
  // We use this.state.getWebSockets() but keep metadata in a Map or Storage
  // Since Durable Objects now support Hibernation, we should use state.acceptWebSocket(ws, tags)
  // and handle events. However, for now, let's stick to the simpler model but improve it.

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    // Recover sessions from storage if necessary
    // this.state.blockConcurrencyWhile(async () => { ... });
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
    const userEmail = request.headers.get('X-User-Email') || '';
    const userName = request.headers.get('X-User-Name') || '';
    const userRole = request.headers.get('X-User-Role') || '';

    if (!userId) {
      console.warn('[NotificationDO] Missing X-User-ID header');
      return new Response('Unauthorized', { status: 401 });
    }

    const { 0: client, 1: server } = new WebSocketPair();

    await this.handleSession(server, {
      id: userId,
      email: userEmail,
      name: userName,
      role: userRole,
    });

    return new Response(null, { status: 101, webSocket: client });
  }

  async handleSession(ws: WebSocket, user: any) {
    // Tag the websocket with user info for easier recovery/management
    const tags = [
      `user:${user.id}`,
      `role:${user.role}`,
      `session:${crypto.randomUUID()}`
    ];
    
    this.state.acceptWebSocket(ws, tags);

    const session: Session = {
      id: tags.find(t => t.startsWith('session:'))!.split(':')[1],
      user,
      lastActive: Date.now(),
    };

    // Store session metadata in DO storage
    await this.state.storage.put(`session:${session.id}`, session);

    // Send initial presence state
    const allSessions = await this.getAllSessions();
    this.send(ws, {
      type: 'presence.sync',
      payload: allSessions.map(s => ({
        userId: s.user.id,
        name: s.user.name,
        location: s.location,
      })),
    });

    // Notify others of new connection
    this.broadcast({
      type: 'presence.update',
      payload: {
        userId: user.id,
        name: user.name,
        location: null,
        status: 'online',
      },
    }, ws);
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
    const tags = this.state.getTags(ws);
    const sessionId = tags.find(t => t.startsWith('session:'))?.split(':')[1];
    if (!sessionId) return;

    const session = await this.state.storage.get<Session>(`session:${sessionId}`);
    if (!session) return;

    try {
      const data = JSON.parse(message as string);

      if (data.type === 'ping') {
        ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
        session.lastActive = Date.now();
        await this.state.storage.put(`session:${sessionId}`, session);
        return;
      }

      if (data.type === 'presence.update') {
        session.location = data.payload.location;
        session.lastActive = Date.now();
        await this.state.storage.put(`session:${sessionId}`, session);
        
        this.broadcast({
          type: 'presence.update',
          payload: {
            userId: session.user.id,
            name: session.user.name,
            location: session.location,
            status: 'online',
          },
        });
      }
    } catch (err) {
      console.error('WebSocket message error:', err);
    }
  }

  async webSocketClose(ws: WebSocket, code: number, reason: string, wasClean: boolean) {
    const tags = this.state.getTags(ws);
    const sessionId = tags.find(t => t.startsWith('session:'))?.split(':')[1];
    
    if (sessionId) {
      const session = await this.state.storage.get<Session>(`session:${sessionId}`);
      await this.state.storage.delete(`session:${sessionId}`);
      
      if (session) {
        this.broadcast({
          type: 'presence.update',
          payload: {
            userId: session.user.id,
            name: session.user.name,
            status: 'offline',
          },
        });
      }
    }
  }

  async webSocketError(ws: WebSocket, error: any) {
    this.webSocketClose(ws, 1006, 'Error', false);
  }

  async broadcast(message: any, excludeWs?: WebSocket) {
    const msg = JSON.stringify(message);
    const sockets = this.state.getWebSockets();
    
    for (const ws of sockets) {
      if (ws === excludeWs) continue;
      try {
        ws.send(msg);
      } catch (err) {
        // WebSocket might be closed already
        const tags = this.state.getTags(ws);
        const sessionId = tags.find(t => t.startsWith('session:'))?.split(':')[1];
        if (sessionId) await this.state.storage.delete(`session:${sessionId}`);
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

  private async getAllSessions(): Promise<Session[]> {
    const sessionsMap = await this.state.storage.list<Session>({ prefix: 'session:' });
    return Array.from(sessionsMap.values());
  }
}
