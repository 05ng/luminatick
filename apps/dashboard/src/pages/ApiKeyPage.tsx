import React, { useEffect, useState } from 'react';
import { Key, Plus, Trash2, Copy, Check, ShieldAlert, Clock } from 'lucide-react';
import { dashboardApi } from '../api/client';
import { ApiKey, ApiKeyCreatedResponse } from '@luminatick/shared';

export function ApiKeyPage() {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [createdKey, setCreatedKey] = useState<ApiKeyCreatedResponse | null>(null);
  const [copied, setCopied] = useState(false);

  const fetchKeys = async () => {
    try {
      const data = await dashboardApi.get<ApiKey[]>('/api-keys');
      setKeys(data);
    } catch (error) {
      console.error('Failed to fetch API keys', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchKeys();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newKeyName) return;

    try {
      const result = await dashboardApi.post<ApiKeyCreatedResponse>('/api-keys', { name: newKeyName });
      setCreatedKey(result);
      setNewKeyName('');
      setIsCreating(false);
      fetchKeys();
    } catch (error) {
      console.error('Failed to create API key', error);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to revoke this API key? This action cannot be undone.')) return;

    try {
      await dashboardApi.delete(`/api-keys/${id}`);
      fetchKeys();
    } catch (error) {
      console.error('Failed to delete API key', error);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">API Keys</h1>
          <p className="text-slate-500 text-sm">Manage external access to the Luminatick API.</p>
        </div>
        <button
          onClick={() => {
            setCreatedKey(null);
            setIsCreating(true);
          }}
          className="flex items-center gap-2 bg-brand-600 text-white px-4 py-2 rounded-lg hover:bg-brand-700 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Create New Key
        </button>
      </div>

      {isCreating && (
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm animate-in fade-in slide-in-from-top-4">
          <h2 className="text-lg font-semibold mb-4">Create New API Key</h2>
          <form onSubmit={handleCreate} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Key Name
              </label>
              <input
                type="text"
                placeholder="e.g. CRM Integration"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
                value={newKeyName}
                onChange={(e) => setNewKeyName(e.target.value)}
                autoFocus
              />
            </div>
            <div className="flex gap-3">
              <button
                type="submit"
                className="bg-brand-600 text-white px-4 py-2 rounded-lg hover:bg-brand-700 transition-colors"
              >
                Generate Key
              </button>
              <button
                type="button"
                onClick={() => setIsCreating(false)}
                className="text-slate-600 px-4 py-2 hover:bg-slate-100 rounded-lg transition-colors"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {createdKey && (
        <div className="bg-amber-50 border border-amber-200 p-6 rounded-xl animate-in fade-in zoom-in">
          <div className="flex items-start gap-3 mb-4">
            <ShieldAlert className="w-6 h-6 text-amber-600 shrink-0" />
            <div>
              <h3 className="font-semibold text-amber-900 text-lg">New API Key Generated</h3>
              <p className="text-amber-700 text-sm">
                Copy this key now. For security reasons, it will <strong>never</strong> be shown again.
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-2 bg-white p-3 rounded-lg border border-amber-300 font-mono text-sm break-all">
            <span className="flex-1">{createdKey.apiKey}</span>
            <button
              onClick={() => copyToClipboard(createdKey.apiKey)}
              className="p-2 hover:bg-slate-100 rounded-md transition-colors shrink-0"
              title="Copy to clipboard"
            >
              {copied ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4 text-slate-500" />}
            </button>
          </div>
          
          <button
            onClick={() => setCreatedKey(null)}
            className="mt-4 text-amber-800 text-sm font-medium hover:underline"
          >
            I've saved my key
          </button>
        </div>
      )}

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-50 text-slate-500 text-xs font-semibold uppercase tracking-wider">
                <th className="px-6 py-4">Name</th>
                <th className="px-6 py-4">Prefix</th>
                <th className="px-6 py-4">Created</th>
                <th className="px-6 py-4">Last Used</th>
                <th className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {isLoading ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-slate-500">Loading keys...</td>
                </tr>
              ) : keys.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-slate-500">No API keys found.</td>
                </tr>
              ) : (
                keys.map((key) => (
                  <tr key={key.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4 font-medium text-slate-900">{key.name}</td>
                    <td className="px-6 py-4 font-mono text-sm text-slate-500">{key.prefix}</td>
                    <td className="px-6 py-4 text-sm text-slate-500">
                      {new Date(key.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-500">
                      <div className="flex items-center gap-1.5">
                        <Clock className="w-4 h-4 text-slate-400" />
                        {key.last_used_at ? new Date(key.last_used_at).toLocaleDateString() : 'Never'}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button
                        onClick={() => handleDelete(key.id)}
                        className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                        title="Revoke Key"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
