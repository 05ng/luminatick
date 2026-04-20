import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { portalApi } from '../api/client';
import type { Ticket, Article } from '../types';
import { Loader2, ArrowLeft, Paperclip, Send, X } from 'lucide-react';
import { formatDistanceToNow, format } from 'date-fns';

export function TicketDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [articles, setArticles] = useState<Article[]>([]);
  const [ticketPrefix, setTicketPrefix] = useState<string>('#');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);
  
  const [attachments, setAttachments] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchConfig = useCallback(async () => {
    try {
      const res = await portalApi.get<{TICKET_PREFIX: string}>('/config');
      setTicketPrefix(res.TICKET_PREFIX);
    } catch (err) {
      console.error('Failed to fetch config', err);
    }
  }, []);

  const fetchTicket = useCallback(async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      const data = await portalApi.get<{ ticket: Ticket; articles: Article[] }>(`/tickets/${id}`);
      setTicket(data.ticket);
      setArticles(data.articles);
    } catch (err: any) {
      if (!silent) setError(err.message || 'Failed to load ticket details');
    } finally {
      if (!silent) setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchConfig();
    fetchTicket();

    let pollInterval: ReturnType<typeof setInterval>;

    const startPolling = () => {
      pollInterval = setInterval(() => {
        fetchTicket(true);
      }, 60000);
    };

    const stopPolling = () => {
      clearInterval(pollInterval);
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        fetchTicket(true);
        startPolling();
      } else {
        stopPolling();
      }
    };

    if (document.visibilityState === 'visible') {
      startPolling();
    }

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      stopPolling();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [fetchConfig, fetchTicket]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const newFiles = Array.from(e.target.files);
      setAttachments(prev => [...prev, ...newFiles]);
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const removeAttachment = (index: number) => {
    setAttachments(prev => prev.filter((_, i) => i !== index));
  };

  const handleReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() && attachments.length === 0) return;

    setSending(true);
    try {
      // 1. Upload attachments concurrently via the worker endpoint
      const uploadedAttachments = await Promise.all(
        attachments.map(async (file) => {
          const formData = new FormData();
          formData.append('file', file);

          const uploadResponse = await portalApi.postForm<{ key: string }>('/attachments/upload', formData);

          return {
            filename: file.name,
            size: file.size,
            contentType: file.type || 'application/octet-stream',
            storageKey: uploadResponse.key
          };
        })
      );

      // 2. Send message with attachment metadata
      await portalApi.post(`/tickets/${id}/messages`, {
        message: newMessage,
        attachments: uploadedAttachments
      });

      // 3. Reset form and refresh ticket
      setNewMessage('');
      setAttachments([]);
      await fetchTicket();
    } catch (err: any) {
      alert(err.message || 'Failed to send reply');
    } finally {
      setSending(false);
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

  if (error || !ticket) {
    return (
      <div className="bg-red-50 text-red-600 p-4 rounded-lg">
        {error || 'Ticket not found'}
        <Link to="/tickets" className="block mt-4 text-brand-600 hover:underline">Back to Tickets</Link>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <Link to="/tickets" className="p-2 hover:bg-gray-100 rounded-full transition-colors">
          <ArrowLeft className="w-5 h-5 text-gray-600" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
            {ticket.subject}
            <span className={`px-2.5 py-1 rounded-full text-xs font-medium capitalize ${statusColors[ticket.status]}`}>
              {ticket.status}
            </span>
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Ticket {ticketPrefix}{ticket.ticket_no} • Created {format(new Date(ticket.created_at), 'MMM d, yyyy h:mm a')}
          </p>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden flex flex-col">
        {/* Messages List */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 max-h-[600px] bg-gray-50">
          {articles.map((article) => {
            const isCustomer = article.sender_type === 'customer';
            return (
              <div key={article.id} className={`flex flex-col ${isCustomer ? 'items-end' : 'items-start'}`}>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-medium text-gray-600">
                    {isCustomer ? 'You' : 'Support Team'}
                  </span>
                  <span className="text-xs text-gray-400">
                    {formatDistanceToNow(new Date(article.created_at), { addSuffix: true })}
                  </span>
                </div>
                <div 
                  className={`max-w-[85%] rounded-2xl px-5 py-3 ${
                    isCustomer 
                      ? 'bg-brand-600 text-white rounded-tr-sm' 
                      : 'bg-white border border-gray-200 text-gray-800 rounded-tl-sm shadow-sm'
                  }`}
                >
                  <div className="whitespace-pre-wrap break-words text-sm">{article.body}</div>
                  
                  {article.attachments && article.attachments.length > 0 && (
                    <div className="mt-3 space-y-2">
                      {article.attachments.map((att) => (
                        <button 
                          key={att.id} 
                          onClick={(e) => { e.preventDefault(); portalApi.download(`/attachments/${att.id}/download`, att.filename); }}
                          className={`flex w-full cursor-pointer hover:opacity-80 items-center gap-2 p-2 rounded-lg text-sm ${
                            isCustomer ? 'bg-brand-700/50 text-white' : 'bg-gray-50 text-gray-700 border border-gray-100'
                          }`}
                        >
                          <Paperclip className="w-4 h-4" />
                          <span className="truncate flex-1">{att.filename || 'Attachment'}</span>
                          <span className="text-xs opacity-75">
                            {Math.round(att.size / 1024)} KB
                          </span>
                        </button>
                      ))}  </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Reply Area */}
        {(ticket.status === 'open' || ticket.status === 'pending') && (
          <div className="p-4 bg-white border-t border-gray-200">
            <form onSubmit={handleReply} className="flex flex-col gap-3">
              <textarea
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                placeholder="Type your reply here..."
                className="w-full rounded-lg border-gray-300 shadow-sm focus:border-brand-500 focus:ring-brand-500 resize-none"
                rows={3}
              />
              
              {/* Attachment Preview */}
              {attachments.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {attachments.map((file, idx) => (
                    <div key={idx} className="flex items-center gap-2 bg-gray-100 px-3 py-1.5 rounded-full text-sm border border-gray-200">
                      <Paperclip className="w-3 h-3 text-gray-500" />
                      <span className="max-w-[150px] truncate">{file.name}</span>
                      <button
                        type="button"
                        onClick={() => removeAttachment(idx)}
                        className="text-gray-400 hover:text-red-500 focus:outline-none"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex items-center justify-between">
                <div>
                  <input
                    type="file"
                    multiple
                    className="hidden"
                    ref={fileInputRef}
                    onChange={handleFileSelect}
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="flex items-center gap-2 text-gray-500 hover:text-brand-600 transition-colors px-2 py-1"
                    disabled={sending}
                  >
                    <Paperclip className="w-5 h-5" />
                    <span className="text-sm font-medium">Attach Files</span>
                  </button>
                </div>
                
                <button
                  type="submit"
                  disabled={sending || (!newMessage.trim() && attachments.length === 0)}
                  className="flex items-center gap-2 bg-brand-600 text-white px-6 py-2 rounded-lg hover:bg-brand-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                >
                  {sending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
                  Send Reply
                </button>
              </div>
            </form>
          </div>
        )}
        
        {ticket.status === 'resolved' || ticket.status === 'closed' ? (
           <div className="p-4 bg-gray-50 border-t border-gray-200 text-center text-sm text-gray-500">
             This ticket is {ticket.status}. You cannot reply to it.
           </div>
        ) : null}
      </div>
    </div>
  );
}
