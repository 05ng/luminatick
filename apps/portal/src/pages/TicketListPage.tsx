import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Turnstile, type TurnstileInstance } from '@marsidev/react-turnstile';
import { portalApi } from '../api/client';
import type { Ticket, PaginatedResponse } from '../types';
import { Loader2, Plus, MessageSquare } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

export function TicketListPage() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [ticketPrefix, setTicketPrefix] = useState<string>('#');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const [turnstileSiteKey, setTurnstileSiteKey] = useState<string | null>(null);
  const turnstileRef = useRef<TurnstileInstance>(null);

  const [isCreating, setIsCreating] = useState(false);
  const [newSubject, setNewSubject] = useState('');
  const [newMessage, setNewMessage] = useState('');
  const [creatingTicket, setCreatingTicket] = useState(false);

  const fetchConfig = async () => {
    try {
      const res = await portalApi.get<{TICKET_PREFIX: string, TURNSTILE_SITE_KEY?: string}>('/config');
      setTicketPrefix(res.TICKET_PREFIX);
      if (res.TURNSTILE_SITE_KEY) {
        setTurnstileSiteKey(res.TURNSTILE_SITE_KEY);
      }
    } catch (err) {
      console.error('Failed to fetch config', err);
    }
  };

  const fetchTickets = async () => {
    try {
      const response = await portalApi.get<PaginatedResponse<Ticket>>('/tickets');
      setTickets(response.data);
    } catch (err: unknown) {
      const error = err as Error;
      setError(error.message || 'Failed to load tickets');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTickets();
    fetchConfig();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSubject || !newMessage) return;
    
    setCreatingTicket(true);
    if (turnstileSiteKey) {
      turnstileRef.current?.execute();
    } else {
      submitTicket();
    }
  };

  const submitTicket = async (token?: string) => {
    try {
      const result = await portalApi.post<{ ticket: Ticket }>('/tickets', {
        subject: newSubject,
        message: newMessage,
        ...(token && { turnstileToken: token })
      });
      setTickets([result.ticket, ...tickets]);
      setIsCreating(false);
      setNewSubject('');
      setNewMessage('');
    } catch (err: unknown) {
      const error = err as Error;
      alert(error.message || 'Failed to create ticket');
    } finally {
      setCreatingTicket(false);
      turnstileRef.current?.reset();
    }
  };

  const statusColors = {
    open: 'bg-green-100 text-green-800',
    pending: 'bg-yellow-100 text-yellow-800',
    resolved: 'bg-gray-100 text-gray-800',
    closed: 'bg-gray-100 text-gray-800',
  };

  if (loading) {
    return <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-brand-600" /></div>;
  }

  if (error) {
    return <div className="bg-red-50 text-red-600 p-4 rounded-lg">{error}</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-900">Your Tickets</h1>
        <button
          onClick={() => setIsCreating(!isCreating)}
          className="flex items-center gap-2 bg-brand-600 text-white px-4 py-2 rounded-lg hover:bg-brand-700 transition-colors"
        >
          <Plus className="w-5 h-5" />
          New Ticket
        </button>
      </div>

      {isCreating && (
        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
          <h2 className="text-lg font-semibold mb-4">Create New Ticket</h2>
          <form onSubmit={handleCreate} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">Subject</label>
              <input
                type="text"
                required
                value={newSubject}
                onChange={(e) => setNewSubject(e.target.value)}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-brand-500 focus:ring-brand-500 sm:text-sm"
                placeholder="What do you need help with?"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Message</label>
              <textarea
                required
                rows={4}
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-brand-500 focus:ring-brand-500 sm:text-sm"
                placeholder="Describe your issue in detail..."
              />
            </div>
            <div className="flex justify-end gap-3">
              {turnstileSiteKey && (
                <Turnstile
                  ref={turnstileRef}
                  siteKey={turnstileSiteKey}
                  options={{ size: 'invisible', execution: 'execute' }}
                  onSuccess={(token) => submitTicket(token)}
                  onError={() => {
                    alert('Security check failed. Please try again.');
                    setCreatingTicket(false);
                    turnstileRef.current?.reset();
                  }}
                />
              )}
              <button
                type="button"
                onClick={() => setIsCreating(false)}
                className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 border border-gray-300 rounded-md"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={creatingTicket}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-brand-600 hover:bg-brand-700 rounded-md disabled:opacity-50"
              >
                {creatingTicket && <Loader2 className="w-4 h-4 animate-spin" />}
                Create Ticket
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        {tickets.length === 0 ? (
          <div className="p-12 text-center text-gray-500">
            <MessageSquare className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p className="text-lg">You haven't created any tickets yet.</p>
          </div>
        ) : (
          <ul className="divide-y divide-gray-200">
            {tickets.map((ticket) => (
              <li key={ticket.id} className="hover:bg-gray-50 transition-colors">
                <Link to={`/tickets/${ticket.id}`} className="block p-6">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <span className="text-sm text-gray-500 font-mono">{ticketPrefix}{ticket.ticket_no}</span>
                      <h3 className="text-lg font-medium text-gray-900">{ticket.subject}</h3>
                    </div>
                    <span className={`px-2.5 py-1 rounded-full text-xs font-medium capitalize ${statusColors[ticket.status]}`}>
                      {ticket.status}
                    </span>
                  </div>
                  <div className="mt-2 text-sm text-gray-500 flex items-center gap-4">
                    <span>Created {formatDistanceToNow(new Date(ticket.created_at), { addSuffix: true })}</span>
                    <span>•</span>
                    <span className="capitalize text-gray-700 font-medium">Priority: {ticket.priority}</span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
