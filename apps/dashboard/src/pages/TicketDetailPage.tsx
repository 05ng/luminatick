import React, { useEffect, useState, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useTicket, useUpdateTicket } from '../hooks/useTickets';
import { useGroups, useAgents } from '../hooks/useGroups';
import { useSettings } from '../hooks/useSettings';
import { useRealtime } from '../hooks/useRealtime';
import { useTicketFields } from '../hooks/useTicketFields';
import { dashboardApi } from '../api/client';
import { useQueryClient } from '@tanstack/react-query';
import { 
  ArrowLeft, 
  Send,
  User,
  ShieldCheck,
  Clock,
  MessageSquare,
  Eye,
  Info,
  Activity,
  X,
  Copy,
  Check
, Paperclip } from 'lucide-react';
import { clsx } from 'clsx';

export function TicketDetailPage() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const { data: ticket, isLoading, error } = useTicket(id!);
  const { data: groups } = useGroups();
  const { data: agents } = useAgents();
  const { data: settings } = useSettings();
  const ticketPrefix = settings?.TICKET_PREFIX || '#';
  const { data: ticketFields } = useTicketFields();
  const updateTicket = useUpdateTicket();
  const { presence, updateLocation, lastMessage } = useRealtime();
  const [reply, setReply] = React.useState('');
  const [isInternal, setIsInternal] = React.useState(false);
  const [suggestion, setSuggestion] = React.useState<string | null>(null);
  const [isGeneratingSuggestion, setIsGeneratingSuggestion] = React.useState(false);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [copied, setCopied] = React.useState(false);
  const [attachments, setAttachments] = React.useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Filter presence to find other agents viewing this ticket and deduplicate by userId
  const rawViewers = presence.filter(p => p.location === `ticket:${id}`);
  const viewers = Array.from(new Map(rawViewers.map(v => [v.userId, v])).values());

  useEffect(() => {
    updateLocation(`ticket:${id}`);
    return () => updateLocation(null);
  }, [id, updateLocation]);

  useEffect(() => {
    if (lastMessage?.type === 'article.created' && String(lastMessage.payload?.ticketId) === String(id)) {
      queryClient.invalidateQueries({ queryKey: ['ticket', id] });
    }
  }, [lastMessage, id, queryClient]);

  const handleStatusChange = (status: any) => {
    updateTicket.mutate({ id: id!, status });
  };

  const handleToggleQa = async (articleId: string, type: 'question' | 'answer' | null) => {
    try {
      await dashboardApi.post(`/knowledge/articles/${articleId}/qa`, { type });
      // Invalidate query to refresh article state
      queryClient.invalidateQueries({ queryKey: ['ticket', id] });
    } catch (err: any) {
      alert('Failed to mark as QA: ' + err.message);
    }
  };

  const handleGetAiSuggestion = async () => {
    setIsGeneratingSuggestion(true);
    setSuggestion(null);
    try {
      const data = await dashboardApi.get<{ suggestion: string }>(`/knowledge/tickets/${id}/ai-suggest`);
      setSuggestion(data.suggestion);
    } catch (err: any) {
      alert('Failed to generate suggestion: ' + err.message);
    } finally {
      setIsGeneratingSuggestion(false);
    }
  };

  const handleSubmitReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if ((!reply.trim() && attachments.length === 0) || isSubmitting) return;

    setIsSubmitting(true);
    try {
      const uploadedAttachments = await Promise.all(
        attachments.map(async (file) => {
          const formData = new FormData();
          formData.append('file', file);
          const res = await dashboardApi.postForm<{ key: string }>('/attachments/upload', formData);
          return {
            filename: file.name,
            contentType: file.type,
            size: file.size,
            storageKey: res.key
          };
        })
      );

      await dashboardApi.post(`/tickets/${id}/articles`, { 
        body: reply, 
        is_internal: isInternal,
        attachments: uploadedAttachments
      });
      setReply('');
      setAttachments([]);
      setSuggestion(null);
      // Refresh ticket details to show new article
      queryClient.invalidateQueries({ queryKey: ['ticket', id] });
    } catch (err: any) {
      alert('Failed to send reply: ' + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) return <div className="p-8 text-center text-slate-500">Loading ticket...</div>;
  if (!ticket) return <div className="p-8 text-center text-slate-500">Ticket not found.</div>;

  return (
    <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-4 xl:grid-cols-5 gap-6">
      <div className="lg:col-span-3 xl:col-span-4 space-y-6">
        <div className="flex items-center justify-between">
          <Link to="/tickets" className="flex items-center gap-2 text-slate-500 hover:text-slate-900 transition-colors">
            <ArrowLeft className="w-4 h-4" />
            Back to Tickets
          </Link>
          <div className="flex items-center gap-2">
            <select 
              value={ticket.status} 
              onChange={(e) => handleStatusChange(e.target.value)}
              className="bg-white border border-slate-200 rounded-md px-3 py-1.5 text-sm font-medium focus:ring-2 focus:ring-brand-500 outline-none shadow-sm"
            >
              <option value="open">Open</option>
              <option value="pending">Pending</option>
              <option value="resolved">Resolved</option>
              <option value="closed">Closed</option>
            </select>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="p-6 border-b border-slate-200 bg-white">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <span 
                    onClick={() => {
                      navigator.clipboard.writeText(`${ticketPrefix}${ticket.ticket_no}`);
                      setCopied(true);
                      setTimeout(() => setCopied(false), 2000);
                    }}
                    className="group/copy flex items-center gap-1.5 px-3 py-1 bg-slate-900 text-white rounded-lg text-sm font-mono font-bold shadow-sm cursor-pointer hover:bg-slate-800 transition-colors"
                    title="Click to copy ticket number"
                  >
                    {ticketPrefix}{ticket.ticket_no || ''}
                    {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5 text-slate-400 group-hover/copy:text-white transition-colors" />}
                  </span>
                  <h1 className="text-2xl font-bold text-slate-900 leading-tight">{ticket.subject}</h1>
                </div>
                <div className="flex items-center gap-4 text-sm text-slate-500">
                  <span className="flex items-center gap-1.5 px-2 py-1 bg-slate-50 rounded-md border border-slate-100">
                    <User className="w-3.5 h-3.5" />
                    {ticket.customer_email}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5" />
                    Opened {new Date(ticket.created_at).toLocaleDateString()}
                  </span>
                </div>
              </div>
              
              {/* Presence Indicator */}
              <div className="flex flex-col items-end gap-2">
                {viewers.length > 0 && (
                  <div className="flex items-center gap-2">
                    <div className="flex items-center -space-x-2">
                      {viewers.slice(0, 3).map((viewer, i) => (
                        <div 
                          key={i}
                          className="w-8 h-8 rounded-full bg-brand-500 border-2 border-white flex items-center justify-center text-white text-[10px] font-bold shadow-sm"
                          title={`${viewer.name} is viewing this ticket`}
                        >
                          {viewer.name[0]}
                        </div>
                      ))}
                      {viewers.length > 3 && (
                        <div className="w-8 h-8 rounded-full bg-slate-200 border-2 border-white flex items-center justify-center text-slate-600 text-[10px] font-bold shadow-sm">
                          +{viewers.length - 3}
                        </div>
                      )}
                    </div>
                    <span className="text-[10px] font-bold text-brand-600 uppercase tracking-tighter flex items-center gap-1">
                      <span className="w-1.5 h-1.5 bg-brand-500 rounded-full animate-pulse" />
                      Live Viewers
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="p-6 space-y-8 bg-slate-50/50 max-h-[600px] min-h-[400px] overflow-y-auto">
            {ticket.articles.map((article) => (
              <div 
                key={article.id} 
                className={clsx(
                  "flex gap-4 group",
                  article.sender_type === 'agent' ? "flex-row-reverse" : "flex-row"
                )}
              >
                <div className={clsx(
                  "w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 font-bold shadow-sm transition-transform group-hover:scale-105",
                  article.sender_type === 'agent' ? "bg-brand-600 text-white" : "bg-white text-slate-600 border border-slate-200",
                  article.is_internal && "bg-amber-100 text-amber-700 ring-2 ring-amber-200"
                )}>
                  {article.sender_type === 'agent' ? 'A' : article.sender_type === 'system' ? 'S' : 'C'}
                </div>
                <div className={clsx(
                  "max-w-[80%] rounded-2xl p-4 shadow-sm border transition-all",
                  article.sender_type === 'agent' 
                    ? "bg-brand-600 text-white border-brand-700" 
                    : "bg-white text-slate-900 border-slate-200",
                  article.is_internal && "!bg-amber-50 !border-amber-200 !text-amber-900 shadow-amber-100/50"
                )}>
                  <div className="flex items-center justify-between gap-4 mb-2">
                    <span className="text-[10px] font-bold uppercase opacity-70 tracking-widest">
                      {article.sender_type} {article.is_internal && '• Internal Note'}
                    </span>
                    <span className="text-[10px] opacity-70">
                      {new Date(article.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <div className="whitespace-pre-wrap break-words text-sm leading-relaxed">
                    {article.body}
                  </div>

                  {/* Attachments */}
                  {article.attachments && article.attachments.length > 0 && (
                    <div className="mt-3 space-y-2">
                      {article.attachments.map((att: any) => (
                        <button 
                          key={att.id} 
                          onClick={(e) => { e.preventDefault(); dashboardApi.download(`/attachments/${att.id}/download`, att.filename || att.file_name); }}
                          className={clsx(
                            "flex w-full cursor-pointer hover:opacity-80 items-center gap-2 p-2 rounded-lg text-sm",
                            article.sender_type === 'agent' 
                              ? "bg-brand-700/50 text-white" 
                              : "bg-gray-50 text-gray-700 border border-gray-100",
                            article.is_internal && "!bg-amber-100/50 !text-amber-900 border border-amber-200/50"
                          )}
                        >
                          <Paperclip className="w-4 h-4 flex-shrink-0" />
                          <span className="truncate flex-1 text-left">{att.filename || att.file_name || 'Attachment'}</span>
                          <span className="text-xs opacity-75">
                            {Math.round(att.size || att.file_size / 1024)} KB
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                  
                  {/* QA Toggle Buttons */}
                  <div className="mt-3 pt-3 border-t border-white/20 flex items-center justify-between gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleToggleQa(article.id, article.qa_type === 'question' ? null : 'question')}
                        className={clsx(
                          "text-[9px] font-bold uppercase px-2 py-0.5 rounded border transition-colors",
                          article.qa_type === 'question' ? "bg-white text-brand-600 border-white" : "text-white/70 border-white/20 hover:border-white/50"
                        )}
                      >
                        {article.qa_type === 'question' ? '✓ Question' : 'Mark as Question'}
                      </button>
                      <button
                        onClick={() => handleToggleQa(article.id, article.qa_type === 'answer' ? null : 'answer')}
                        className={clsx(
                          "text-[9px] font-bold uppercase px-2 py-0.5 rounded border transition-colors",
                          article.qa_type === 'answer' ? "bg-white text-brand-600 border-white" : "text-white/70 border-white/20 hover:border-white/50"
                        )}
                      >
                        {article.qa_type === 'answer' ? '✓ Answer' : 'Mark as Answer'}
                      </button>
                    </div>
                    {article.qa_type && (
                      <span className="flex items-center gap-1 text-[9px] font-bold text-white/90 bg-white/10 px-2 py-0.5 rounded-full border border-white/20">
                        <ShieldCheck className="w-3 h-3" />
                        INDEXED
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="p-6 border-t border-slate-200 bg-white">
            <form onSubmit={handleSubmitReply} className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <button 
                    type="button"
                    onClick={() => setIsInternal(false)}
                    className={clsx(
                      "text-xs font-bold px-4 py-1.5 rounded-full transition-all border",
                      !isInternal ? "bg-brand-600 text-white border-brand-700 shadow-sm" : "text-slate-500 hover:bg-slate-100 border-transparent"
                    )}
                  >
                    Public Reply
                  </button>
                  <button 
                    type="button"
                    onClick={() => setIsInternal(true)}
                    className={clsx(
                      "text-xs font-bold px-4 py-1.5 rounded-full transition-all border",
                      isInternal ? "bg-amber-500 text-white border-amber-600 shadow-sm" : "text-slate-500 hover:bg-slate-100 border-transparent"
                    )}
                  >
                    Internal Note
                  </button>
                </div>
                
                <button
                  type="button"
                  onClick={handleGetAiSuggestion}
                  disabled={isGeneratingSuggestion}
                  className="flex items-center gap-2 text-xs font-bold text-brand-600 hover:text-brand-700 px-3 py-1.5 bg-brand-50 rounded-lg transition-colors border border-brand-100"
                >
                  <Activity className="w-3.5 h-3.5" />
                  {isGeneratingSuggestion ? 'Thinking...' : 'AI Suggestion'}
                </button>
              </div>

              {suggestion && (
                <div className="bg-slate-50 border border-brand-100 rounded-xl p-4 animate-in fade-in slide-in-from-top-2">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] font-bold text-brand-600 uppercase tracking-wider flex items-center gap-1.5">
                      <ShieldCheck className="w-3.5 h-3.5" />
                      AI Auto-Draft
                    </span>
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => setReply(suggestion)}
                        className="text-[10px] font-bold text-brand-600 hover:bg-brand-100 px-2 py-1 rounded transition-colors"
                      >
                        Replace All
                      </button>
                      <button
                        type="button"
                        onClick={() => setReply(prev => prev ? `${prev}\n\n${suggestion}` : suggestion)}
                        className="text-[10px] font-bold text-brand-600 hover:bg-brand-100 px-2 py-1 rounded transition-colors"
                      >
                        Append
                      </button>
                      <button
                        type="button"
                        onClick={() => setSuggestion(null)}
                        className="text-slate-400 hover:text-slate-600"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                  <p className="text-sm text-slate-700 italic leading-relaxed">"{suggestion}"</p>
                </div>
              )}
              
              <div className="relative">
                <textarea
                  className={clsx(
                    "w-full rounded-xl border p-4 text-sm focus:ring-4 outline-none min-h-[140px] transition-all resize-none shadow-inner",
                    isInternal 
                      ? "bg-amber-50/50 border-amber-200 focus:ring-amber-500/10" 
                      : "bg-slate-50/50 border-slate-200 focus:ring-brand-500/10"
                  )}
                  placeholder={isInternal ? "Type an internal note only visible to agents..." : "Type your reply to the customer..."}
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                />
              </div>
              
              {attachments.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {attachments.map((file, index) => (
                    <div key={index} className="flex items-center gap-2 bg-slate-100 px-3 py-1.5 rounded-lg text-xs font-medium border border-slate-200">
                      <Paperclip className="w-3 h-3 text-slate-500" />
                      <span className="truncate max-w-[150px]">{file.name}</span>
                      <button
                        type="button"
                        onClick={() => setAttachments(prev => prev.filter((_, i) => i !== index))}
                        className="text-slate-400 hover:text-red-500"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex items-center justify-between">
                <p className="text-[11px] text-slate-400 flex items-center gap-1.5">
                  <Info className="w-3 h-3" />
                  {isInternal 
                    ? "Private note for team coordination." 
                    : "The customer will receive an email notification."}
                </p>
                <div className="flex items-center gap-2">
                  <input 
                    type="file" 
                    multiple 
                    ref={fileInputRef} 
                    className="hidden" 
                    onChange={(e) => {
                      if (e.target.files) {
                        setAttachments(prev => [...prev, ...Array.from(e.target.files!)]);
                      }
                      if (fileInputRef.current) fileInputRef.current.value = '';
                    }} 
                  />
                  <button 
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="p-2.5 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-700 transition-colors"
                    title="Attach files"
                  >
                    <Paperclip className="w-4 h-4" />
                  </button>
                  <button 
                    type="submit" 
                    disabled={(!reply.trim() && attachments.length === 0) || isSubmitting}
                    className={clsx(
                      "flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-bold transition-all shadow-md active:scale-95 disabled:opacity-50 disabled:pointer-events-none",
                      isInternal ? "bg-amber-600 text-white hover:bg-amber-700" : "bg-brand-600 text-white hover:bg-brand-700"
                    )}
                  >
                    <Send className="w-4 h-4" />
                    {isInternal ? "Add Note" : "Send Reply"}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      </div>

      <div className="space-y-6">
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
          <h3 className="text-sm font-bold text-slate-900 mb-4 flex items-center gap-2">
            <Info className="w-4 h-4 text-slate-400" />
            Ticket Details
          </h3>
          <div className="space-y-4">
            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Priority</label>
              <div className="mt-1">
                <select 
                  value={ticket.priority} 
                  onChange={(e) => updateTicket.mutate({ id: ticket.id, priority: e.target.value as any })}
                  className="w-full bg-white border border-slate-200 rounded-md px-3 py-1.5 text-sm font-medium focus:ring-2 focus:ring-brand-500 outline-none shadow-sm"
                >
                  <option value="low">Low</option>
                  <option value="normal">Normal</option>
                  <option value="high">High</option>
                  <option value="urgent">Urgent</option>
                </select>
              </div>
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Assigned To</label>
              <div className="mt-1">
                <select 
                  value={ticket.assigned_to || ''} 
                  onChange={(e) => updateTicket.mutate({ id: ticket.id, assigned_to: e.target.value || undefined })}
                  className="w-full bg-white border border-slate-200 rounded-md px-3 py-1.5 text-sm font-medium focus:ring-2 focus:ring-brand-500 outline-none shadow-sm"
                >
                  <option value="">Unassigned</option>
                  {agents?.map(agent => (
                    <option key={agent.id} value={agent.id}>{agent.full_name || agent.email}</option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Group</label>
              <div className="mt-1">
                <select 
                  value={ticket.group_id || ''} 
                  onChange={(e) => updateTicket.mutate({ id: ticket.id, group_id: e.target.value || undefined })}
                  className="w-full bg-white border border-slate-200 rounded-md px-3 py-1.5 text-sm font-medium focus:ring-2 focus:ring-brand-500 outline-none shadow-sm"
                >
                  <option value="">No Group</option>
                  {groups?.map(group => (
                    <option key={group.id} value={group.id}>{group.name}</option>
                  ))}
                </select>
              </div>
            </div>
            
            {ticketFields && ticketFields.filter(f => f.is_active).length > 0 && (
              <div className="pt-4 mt-4 border-t border-slate-200">
                <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-3">Custom Attributes</h4>
                <div className="space-y-4">
                  {ticketFields.filter(f => f.is_active).map((field) => {
                    const value = ticket.custom_fields ? ticket.custom_fields[field.name] : '';
                    
                    const handleSave = (newValue: any) => {
                      if (value === newValue) return;
                      
                      updateTicket.mutate({ 
                        id: ticket.id, 
                        custom_fields: {
                          ...(ticket.custom_fields || {}),
                          [field.name]: newValue
                        }
                      });
                    };

                    return (
                      <div key={field.id}>
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                          {field.label}
                        </label>
                        {field.field_type === 'select' && field.options ? (
                          <select
                            value={value || ''}
                            onChange={(e) => handleSave(e.target.value)}
                            className="w-full bg-white border border-slate-200 rounded-md px-3 py-1.5 text-sm font-medium focus:ring-2 focus:ring-brand-500 outline-none shadow-sm"
                          >
                            <option value="">Select...</option>
                            {field.options.split(',').map(s => s.trim()).filter(Boolean).map((opt) => (
                              <option key={opt} value={opt}>{opt}</option>
                            ))}
                          </select>
                        ) : field.field_type === 'checkbox' ? (
                          <div className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={value === true || value === 'true'}
                              onChange={(e) => handleSave(e.target.checked)}
                              className="w-4 h-4 text-brand-600 rounded border-slate-300 focus:ring-brand-500"
                            />
                            <span className="text-sm font-medium text-slate-700">{field.label}</span>
                          </div>
                        ) : (
                          <CustomFieldInput 
                            field={field} 
                            value={value} 
                            onSave={handleSave} 
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>

        {viewers.length > 0 && (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 animate-in slide-in-from-right-4">
            <h3 className="text-sm font-bold text-slate-900 mb-4 flex items-center gap-2">
              <Eye className="w-4 h-4 text-brand-500" />
              Active Now
            </h3>
            <div className="space-y-3">
              {viewers.map((viewer, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-brand-50 flex items-center justify-center text-brand-700 text-xs font-bold border border-brand-100">
                    {viewer.name[0]}
                  </div>
                  <div>
                    <p className="text-xs font-bold text-slate-900">{viewer.name}</p>
                    <p className="text-[10px] text-green-600 font-medium flex items-center gap-1">
                      <span className="w-1.5 h-1.5 bg-green-500 rounded-full" />
                      Viewing
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function CustomFieldInput({ field, value, onSave }: { field: any, value: any, onSave: (v: any) => void }) {
  const [localValue, setLocalValue] = useState(value || '');

  useEffect(() => {
    setLocalValue(value || '');
  }, [value]);

  const handleBlur = () => {
    onSave(localValue);
  };

  if (field.field_type === 'textarea') {
    return (
      <textarea
        value={localValue}
        onChange={(e) => setLocalValue(e.target.value)}
        onBlur={handleBlur}
        className="w-full bg-white border border-slate-200 rounded-md px-3 py-1.5 text-sm font-medium focus:ring-2 focus:ring-brand-500 outline-none shadow-sm resize-y"
        rows={3}
      />
    );
  }

  return (
    <input
      type="text"
      value={localValue}
      onChange={(e) => setLocalValue(e.target.value)}
      onBlur={handleBlur}
      className="w-full bg-white border border-slate-200 rounded-md px-3 py-1.5 text-sm font-medium focus:ring-2 focus:ring-brand-500 outline-none shadow-sm"
    />
  );
}
