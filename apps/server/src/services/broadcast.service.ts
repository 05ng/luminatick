import { Env } from '../bindings';

export class BroadcastService {
  constructor(private env: Env) {}

  async broadcast(type: string, payload: any, retries = 2) {
    if (!this.env.NOTIFICATION_DO) {
      return;
    }

    try {
      const id = this.env.NOTIFICATION_DO.idFromName('global');
      const obj = this.env.NOTIFICATION_DO.get(id);

      await obj.fetch('http://do/broadcast', {
        method: 'POST',
        body: JSON.stringify({ type, payload }),
        headers: { 'Content-Type': 'application/json' },
      });
    } catch (err) {
      console.error('Broadcast failed:', err);
      if (retries > 0) {
        await new Promise(res => setTimeout(res, 10));
        return this.broadcast(type, payload, retries - 1);
      }
    }
  }

  async notifyTicketCreated(ticket: any) {
    await this.broadcast('ticket.created', {
      id: ticket.id,
      ticket_no: ticket.ticket_no,
      subject: ticket.subject,
      status: ticket.status,
      priority: ticket.priority,
    });
  }

  async notifyTicketUpdated(ticket: any) {
    await this.broadcast('ticket.updated', {
      id: ticket.id,
      ticket_no: ticket.ticket_no,
      subject: ticket.subject,
      status: ticket.status,
      priority: ticket.priority,
    });
  }

  async notifyPresenceUpdate(userId: string, name: string, location: string | null, status: 'online' | 'offline') {
    await this.broadcast('presence.update', {
      userId,
      name,
      location,
      status,
    });
  }
}
