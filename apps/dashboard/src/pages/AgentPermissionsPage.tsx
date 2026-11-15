import React, { useState, useEffect } from 'react';
import { Shield, Save, Loader2, AlertCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../store/authStore';
import { dashboardApi } from '../api/client';

const SETTING_MODULES = [
  { key: 'general', nameKey: 'settings.agentPermissions.modules.general', descriptionKey: 'settings.agentPermissions.modules.generalDesc' },
  { key: 'users', nameKey: 'settings.agentPermissions.modules.users', descriptionKey: 'settings.agentPermissions.modules.usersDesc' },
  { key: 'groups', nameKey: 'settings.agentPermissions.modules.groups', descriptionKey: 'settings.agentPermissions.modules.groupsDesc' },
  { key: 'ticket_fields', nameKey: 'settings.agentPermissions.modules.ticketFields', descriptionKey: 'settings.agentPermissions.modules.ticketFieldsDesc' },
  { key: 'filters', nameKey: 'settings.agentPermissions.modules.filters', descriptionKey: 'settings.agentPermissions.modules.filtersDesc' },
  { key: 'automations', nameKey: 'settings.agentPermissions.modules.automations', descriptionKey: 'settings.agentPermissions.modules.automationsDesc' },
  { key: 'api_keys', nameKey: 'settings.agentPermissions.modules.apiKeys', descriptionKey: 'settings.agentPermissions.modules.apiKeysDesc' },
  { key: 'usage', nameKey: 'settings.agentPermissions.modules.usage', descriptionKey: 'settings.agentPermissions.modules.usageDesc' },
  { key: 'channels_email', nameKey: 'settings.agentPermissions.modules.emailChannels', descriptionKey: 'settings.agentPermissions.modules.emailChannelsDesc' },
  { key: 'channels_widget', nameKey: 'settings.agentPermissions.modules.widgetChannels', descriptionKey: 'settings.agentPermissions.modules.widgetChannelsDesc' },
];

export function AgentPermissionsPage() {
  const { t } = useTranslation();
  const [permissions, setPermissions] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadPermissions();
  }, []);

  const loadPermissions = async () => {
    try {
      setLoading(true);
      const data = await dashboardApi.get('/permissions');
      setPermissions((data || {}) as Record<string, boolean>);
    } catch (err: any) {
      setError(err.message || t('settings.agentPermissions.loadFailed'));
    } finally {
      setLoading(false);
    }
  };

  const handleToggle = (key: string) => {
    setPermissions((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setError(null);
      await dashboardApi.put('/permissions', permissions);
      // Trigger a reload or notification
    } catch (err: any) {
      setError(err.message || t('settings.agentPermissions.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 text-brand-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Shield className="w-6 h-6 text-brand-600" />
            {t('settings.agentPermissions.title')}
          </h1>
          <p className="text-slate-500 mt-1">
            {t('settings.agentPermissions.subtitle')}
          </p>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-4 py-2 bg-brand-600 text-white rounded-lg hover:bg-brand-700 transition-colors disabled:opacity-50"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {t('settings.agentPermissions.saveChanges')}
        </button>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-50 text-red-700 rounded-lg flex items-center gap-3">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <p className="text-sm font-medium">{error}</p>
        </div>
      )}

      <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-200">
        {SETTING_MODULES.map((module) => (
          <div key={module.key} className="p-6 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-medium text-slate-900">{t(module.nameKey)}</h3>
              <p className="text-sm text-slate-500 mt-1">{t(module.descriptionKey)}</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                className="sr-only peer"
                checked={permissions[module.key] || false}
                onChange={() => handleToggle(module.key)}
              />
              <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-brand-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-brand-600"></div>
            </label>
          </div>
        ))}
      </div>
    </div>
  );
}
