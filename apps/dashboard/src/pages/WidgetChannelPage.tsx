import React, { useState, useEffect } from 'react';
import { dashboardApi } from '../api/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

export function WidgetChannelPage() {
  const queryClient = useQueryClient();

  const { data: config, isLoading } = useQuery({
    queryKey: ['settings'],
    queryFn: () => dashboardApi.get<Record<string, string>>('/settings'),
  });

  const [chatEnabled, setChatEnabled] = useState(true);
  const [formEnabled, setFormEnabled] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (config) {
      setChatEnabled(config['widget.features.aiChat'] !== 'false');
      setFormEnabled(config['widget.features.ticketForm'] !== 'false');
    }
  }, [config]);

  const updateSettings = useMutation({
    mutationFn: (updates: Record<string, string>) =>
      dashboardApi.put('/settings', updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] });
      alert('Settings saved successfully!');
    },
    onError: () => {
      alert('Failed to save settings');
    }
  });

  const handleSave = async () => {
    setIsSaving(true);
    await updateSettings.mutateAsync({
      'widget.features.aiChat': chatEnabled ? 'true' : 'false',
      'widget.features.ticketForm': formEnabled ? 'true' : 'false',
    });
    setIsSaving(false);
  };

  const snippet = `<!-- Luminatick Widget -->
<script>
  window.LUMINA_WIDGET_CONFIG = {
    apiHost: "${window.location.origin}"
  };
</script>
<script src="${window.location.origin}/lumina-widget.js" async></script>
<!-- End Luminatick Widget -->`;

  return (
    <div className="max-w-4xl mx-auto py-8 px-4">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900">Widget Channel</h1>
        <p className="text-slate-500 mt-1">Configure your embeddable customer support widget.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div className="space-y-6 bg-white p-6 rounded-lg shadow-sm border border-slate-200">
          <h2 className="text-lg font-semibold border-b pb-2 text-slate-900">Features</h2>
          
          {isLoading ? (
            <div className="text-slate-500">Loading settings...</div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="relative flex items-center">
                  <input
                    type="checkbox"
                    id="chatEnabled"
                    checked={chatEnabled}
                    onChange={(e) => setChatEnabled(e.target.checked)}
                    className="w-4 h-4 text-brand-600 border-slate-300 rounded focus:ring-brand-500"
                  />
                </div>
                <div className="flex-1">
                  <label htmlFor="chatEnabled" className="text-sm font-medium text-slate-900">
                    Chat Enabled
                  </label>
                  <p className="text-xs text-slate-500">
                    Allow customers to chat with the AI support agent.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="relative flex items-center">
                  <input
                    type="checkbox"
                    id="formEnabled"
                    checked={formEnabled}
                    onChange={(e) => setFormEnabled(e.target.checked)}
                    className="w-4 h-4 text-brand-600 border-slate-300 rounded focus:ring-brand-500"
                  />
                </div>
                <div className="flex-1">
                  <label htmlFor="formEnabled" className="text-sm font-medium text-slate-900">
                    Web Form Enabled
                  </label>
                  <p className="text-xs text-slate-500">
                    Allow customers to submit a ticket via a form.
                  </p>
                </div>
              </div>
            </div>
          )}

          <button
            onClick={handleSave}
            disabled={isSaving || isLoading}
            className="w-full bg-brand-600 text-white py-2 rounded-lg font-medium hover:bg-brand-700 disabled:opacity-50 transition-colors"
          >
            {isSaving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>

        <div className="space-y-6">
          <div className="bg-slate-900 text-white p-6 rounded-xl shadow-sm border border-slate-800">
            <h2 className="text-lg font-semibold mb-4 text-indigo-400">Embed Snippet</h2>
            <p className="text-sm text-slate-400 mb-4">
              Copy and paste this code before the closing <code>&lt;/body&gt;</code> tag of your website.
            </p>
            <pre className="bg-black/50 p-4 rounded-lg text-xs overflow-x-auto text-emerald-400 border border-white/10 whitespace-pre">
              {snippet}
            </pre>
            <button
              onClick={() => {
                navigator.clipboard.writeText(snippet);
                alert('Snippet copied to clipboard!');
              }}
              className="mt-4 w-full bg-white/10 hover:bg-white/20 text-white py-2 rounded-lg text-sm font-medium transition-colors"
            >
              Copy Snippet
            </button>
          </div>

          <div className="bg-indigo-50 border border-indigo-100 p-6 rounded-xl">
            <h2 className="text-lg font-semibold text-indigo-900 mb-2">Shadow DOM</h2>
            <p className="text-sm text-indigo-800">
              The Luminatick widget uses Shadow DOM technology. This means its styles are completely isolated and won't conflict with your website's CSS framework (like Bootstrap, Tailwind, or custom styles).
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}