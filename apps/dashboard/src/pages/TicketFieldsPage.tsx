import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { dashboardApi } from '../api/client';
import { Plus, X, List, CheckSquare, AlignLeft, Type, ToggleLeft } from 'lucide-react';
import { clsx } from 'clsx';
import { useTicketFields } from '../hooks/useTicketFields';

export function TicketFieldsPage() {
  const queryClient = useQueryClient();
  const [isModalOpen, setIsModalOpen] = useState(false);

  const { data: fields, isLoading } = useTicketFields();

  const getIconForType = (type: string) => {
    switch (type) {
      case 'text': return <Type className="w-4 h-4" />;
      case 'textarea': return <AlignLeft className="w-4 h-4" />;
      case 'select': return <List className="w-4 h-4" />;
      case 'checkbox': return <CheckSquare className="w-4 h-4" />;
      default: return <Type className="w-4 h-4" />;
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Custom Ticket Fields</h1>
          <p className="text-slate-500 mt-1">Manage extra attributes for your tickets.</p>
        </div>
        <button
          onClick={() => setIsModalOpen(true)}
          className="flex items-center gap-2 bg-brand-600 text-white px-4 py-2 rounded-lg text-sm font-bold shadow-sm shadow-brand-500/20 hover:bg-brand-700 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Create Field
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-slate-500">Loading fields...</div>
        ) : fields?.length === 0 ? (
          <div className="p-12 text-center">
            <div className="w-16 h-16 bg-slate-50 text-slate-400 rounded-full flex items-center justify-center mx-auto mb-4 border border-slate-100">
              <List className="w-8 h-8" />
            </div>
            <h3 className="text-lg font-bold text-slate-900 mb-2">No custom fields</h3>
            <p className="text-slate-500 mb-6">Create fields to collect specific information on tickets.</p>
            <button
              onClick={() => setIsModalOpen(true)}
              className="bg-white border border-slate-200 text-slate-700 px-4 py-2 rounded-lg text-sm font-bold shadow-sm hover:bg-slate-50 transition-colors"
            >
              Create your first field
            </button>
          </div>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-medium">
              <tr>
                <th className="px-6 py-4">Label</th>
                <th className="px-6 py-4">Key Name</th>
                <th className="px-6 py-4">Type</th>
                <th className="px-6 py-4">Options</th>
                <th className="px-6 py-4">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {fields?.map((field) => (
                <tr key={field.id} className="hover:bg-slate-50/50 transition-colors">
                  <td className="px-6 py-4 font-bold text-slate-900">{field.label}</td>
                  <td className="px-6 py-4 font-mono text-xs text-slate-500">{field.name}</td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2 text-slate-600">
                      {getIconForType(field.field_type)}
                      <span className="capitalize">{field.field_type}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-slate-500 max-w-xs truncate">
                    {field.options || '-'}
                  </td>
                  <td className="px-6 py-4">
                    <span className={clsx(
                      "inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider",
                      field.is_active 
                        ? "bg-green-50 text-green-700 border border-green-200" 
                        : "bg-slate-100 text-slate-500 border border-slate-200"
                    )}>
                      {field.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {isModalOpen && (
        <CreateFieldModal 
          onClose={() => setIsModalOpen(false)} 
          onSuccess={() => {
            setIsModalOpen(false);
            queryClient.invalidateQueries({ queryKey: ['ticket-fields'] });
          }}
        />
      )}
    </div>
  );
}

function CreateFieldModal({ onClose, onSuccess }: { onClose: () => void, onSuccess: () => void }) {
  const [formData, setFormData] = useState({
    name: '',
    label: '',
    field_type: 'text',
    options: '',
    is_active: true
  });

  const mutation = useMutation({
    mutationFn: (data: any) => dashboardApi.post('/ticket-fields', data),
    onSuccess,
    onError: (err: any) => alert(err.message),
  });

  const generateKeyName = (label: string) => {
    return label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  };

  const handleLabelChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newLabel = e.target.value;
    setFormData(prev => ({
      ...prev,
      label: newLabel,
      name: !prev.name || prev.name === generateKeyName(prev.label) ? generateKeyName(newLabel) : prev.name
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    mutation.mutate(formData);
  };

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h2 className="text-lg font-bold text-slate-900">Create Ticket Field</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-1">Display Label</label>
            <input
              required
              type="text"
              value={formData.label}
              onChange={handleLabelChange}
              placeholder="e.g., Device Model"
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand-500 outline-none"
            />
          </div>

          <div>
            <label className="block text-sm font-bold text-slate-700 mb-1">Key Name</label>
            <input
              required
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="e.g., device_model"
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand-500 outline-none font-mono"
            />
            <p className="text-[10px] text-slate-500 mt-1">The JSON key used internally and via API.</p>
          </div>

          <div>
            <label className="block text-sm font-bold text-slate-700 mb-1">Field Type</label>
            <select
              value={formData.field_type}
              onChange={(e) => setFormData({ ...formData, field_type: e.target.value })}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand-500 outline-none bg-white"
            >
              <option value="text">Text (Single line)</option>
              <option value="textarea">Textarea (Multi-line)</option>
              <option value="select">Dropdown (Select)</option>
              <option value="checkbox">Checkbox</option>
            </select>
          </div>

          {formData.field_type === 'select' && (
            <div className="animate-in slide-in-from-top-2">
              <label className="block text-sm font-bold text-slate-700 mb-1">Options</label>
              <input
                required
                type="text"
                value={formData.options}
                onChange={(e) => setFormData({ ...formData, options: e.target.value })}
                placeholder="Comma-separated (e.g. Option 1, Option 2)"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand-500 outline-none"
              />
            </div>
          )}

          <div className="flex items-center gap-3 pt-2">
            <button
              type="button"
              onClick={() => setFormData({ ...formData, is_active: !formData.is_active })}
              className={clsx(
                "w-10 h-6 rounded-full transition-colors relative",
                formData.is_active ? "bg-brand-500" : "bg-slate-200"
              )}
            >
              <div className={clsx(
                "w-4 h-4 bg-white rounded-full absolute top-1 transition-transform shadow-sm",
                formData.is_active ? "translate-x-5" : "translate-x-1"
              )} />
            </button>
            <span className="text-sm font-medium text-slate-700">Active</span>
          </div>

          <div className="pt-4 border-t border-slate-100 flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-50 border border-transparent rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={mutation.isPending}
              className="px-6 py-2 bg-brand-600 text-white rounded-lg text-sm font-bold shadow-sm hover:bg-brand-700 transition-colors disabled:opacity-50"
            >
              {mutation.isPending ? 'Creating...' : 'Create Field'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
