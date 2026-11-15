import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { dashboardApi } from '../api/client';
import { useGroups } from '../hooks/useGroups';
import { Mail, Plus, Trash2, Check, AlertCircle } from 'lucide-react';
import { clsx } from 'clsx';

import { Settings, Save } from 'lucide-react';


interface SupportEmail {
  id: string;
  email_address: string;
  name: string | null;
  group_id: string | null;
  is_default: boolean;
  created_at: string;
}

export function EmailChannelPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [isAdding, setIsAdding] = useState(false);
  const [formData, setFormData] = useState({
    email_address: '',
    name: '',
    group_id: '',
    is_default: false,
  });
  const [error, setError] = useState<string | null>(null);

  const { data: groups } = useGroups();
  
  
  const [resendApiKey, setResendApiKey] = useState('');
  const [resendFromEmail, setResendFromEmail] = useState('');
  const [savingResend, setSavingResend] = useState(false);
  const [resendSuccess, setResendSuccess] = useState(false);
  
  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: () => dashboardApi.get<Record<string, string>>('/settings'),
  });

  React.useEffect(() => {
    if (settings) {
      if (settings.RESEND_API_KEY) setResendApiKey(settings.RESEND_API_KEY);
      if (settings.RESEND_FROM_EMAIL) setResendFromEmail(settings.RESEND_FROM_EMAIL);
    }
  }, [settings]);

  const saveResendSettings = async () => {
    setSavingResend(true);
    setResendSuccess(false);
    setError(null);
    try {
      const payload: Record<string, string> = { RESEND_FROM_EMAIL: resendFromEmail };
      if (resendApiKey && resendApiKey !== '••••••••') {
        payload.RESEND_API_KEY = resendApiKey;
      }
      await dashboardApi.put('/settings', payload);
      setResendSuccess(true);
      setTimeout(() => setResendSuccess(false), 3000);
      queryClient.invalidateQueries({ queryKey: ['settings'] });
    } catch (err: any) {
      setError(err.message || t('email.errors.saveResend'));
    } finally {
      setSavingResend(false);
    }
  };

  const { data: emails, isLoading } = useQuery({
    queryKey: ['support_emails'],
    queryFn: () => dashboardApi.get<SupportEmail[]>('/channels/emails'),
  });

  const createEmail = useMutation({
    mutationFn: (data: typeof formData) => 
      dashboardApi.post<SupportEmail>('/channels/emails', {
        ...data,
        group_id: data.group_id || null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['support_emails'] });
      setIsAdding(false);
      setFormData({ email_address: '', name: '', group_id: '', is_default: false });
      setError(null);
    },
    onError: (err: any) => {
      setError(err.message || t('email.errors.addEmail'));
    }
  });

  const deleteEmail = useMutation({
    mutationFn: (id: string) => dashboardApi.delete(`/channels/emails/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['support_emails'] });
    }
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    createEmail.mutate(formData);
  };

  return (
    <div className="max-w-5xl">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{t('email.title')}</h1>
          <p className="text-slate-500 mt-1">{t('email.subtitle')}</p>
        </div>
        {!isAdding && (
          <button
            onClick={() => setIsAdding(true)}
            className="flex items-center gap-2 bg-brand-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-brand-700 transition-colors"
          >
            <Plus className="w-4 h-4" />
            {t('email.addEmail')}
          </button>
        )}
      </div>

      
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 mb-8">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 bg-brand-50 text-brand-600 rounded-lg">
            <Settings className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-slate-900">{t('email.resendTitle')}</h2>
            <p className="text-sm text-slate-500">{t('email.resendDesc')}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              {t('email.resendApiKey')}
            </label>
            <input
              type="password"
              placeholder="re_xxxxxxxxxxxxxxxxx"
              value={resendApiKey}
              onChange={e => setResendApiKey(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500 font-mono text-sm"
            />
            <p className="text-xs text-slate-500 mt-1">{t('email.resendApiKeyHint')}</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              {t('email.defaultFromEmail')}
            </label>
            <input
              type="email"
              placeholder="support@yourdomain.com"
              value={resendFromEmail}
              onChange={e => setResendFromEmail(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500 font-mono text-sm"
            />
            <p className="text-xs text-slate-500 mt-1">{t('email.defaultFromEmailHint')}</p>
          </div>
        </div>
        <div className="mt-4 flex items-center justify-end gap-3">
          {resendSuccess && <span className="text-sm text-green-600 flex items-center gap-1"><Check className="w-4 h-4"/> {t('email.savedSuccessfully')}</span>}
          <button
            onClick={saveResendSettings}
            disabled={savingResend || !resendApiKey || !resendFromEmail}
            className="flex items-center gap-2 bg-slate-900 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-slate-800 transition-colors disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            {savingResend ? t('email.saving') : t('email.saveConfiguration')}
          </button>
        </div>
      </div>

      {isAdding && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 mb-8">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-semibold text-slate-900">{t('email.addSupportEmail')}</h2>
            <button 
              onClick={() => { setIsAdding(false); setError(null); }}
              className="text-slate-400 hover:text-slate-600"
            >
              {t('email.cancel')}
            </button>
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-lg flex items-center gap-2 text-sm">
              <AlertCircle className="w-4 h-4" />
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  {t('email.emailAddress')}
                </label>
                <input
                  type="email"
                  required
                  placeholder="support@yourdomain.com"
                  value={formData.email_address}
                  onChange={e => setFormData({ ...formData, email_address: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  {t('email.displayName')}
                </label>
                <input
                  type="text"
                  placeholder={t('email.displayNamePlaceholder')}
                  value={formData.name}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  {t('email.assignToGroup')}
                </label>
                <select
                  value={formData.group_id}
                  onChange={e => setFormData({ ...formData, group_id: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
                >
                  <option value="">{t('email.noSpecificGroup')}</option>
                  {groups?.map(g => (
                    <option key={g.id} value={g.id}>{g.name}</option>
                  ))}
                </select>
                <p className="text-xs text-slate-500 mt-1">
                  {t('email.assignToGroupHint')}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 mt-2">
              <input
                type="checkbox"
                id="is_default"
                checked={formData.is_default}
                onChange={e => setFormData({ ...formData, is_default: e.target.checked })}
                className="rounded border-slate-300 text-brand-600 focus:ring-brand-500"
              />
              <label htmlFor="is_default" className="text-sm text-slate-700">
                {t('email.setAsDefault')}
              </label>
            </div>

            <div className="flex justify-end pt-4 border-t border-slate-100">
              <button
                type="submit"
                disabled={createEmail.isPending}
                className="bg-brand-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-brand-700 transition-colors disabled:opacity-50"
              >
                {createEmail.isPending ? t('email.saving') : t('email.saveEmail')}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-slate-500">{t('email.loading')}</div>
        ) : emails?.length === 0 ? (
          <div className="p-12 text-center">
            <Mail className="w-12 h-12 text-slate-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-slate-900 mb-1">{t('email.noChannels')}</h3>
            <p className="text-slate-500">{t('email.noChannelsDesc')}</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {emails?.map((email) => (
              <div key={email.id} className="p-4 flex items-center justify-between hover:bg-slate-50 transition-colors">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-lg bg-indigo-50 flex items-center justify-center text-indigo-600">
                    <Mail className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-slate-900">{email.email_address}</p>
                      {email.is_default && (
                        <span className="px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-700 flex items-center gap-1">
                          <Check className="w-3 h-3" /> {t('email.defaultBadge')}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-sm text-slate-500 mt-1">
                      {email.name && <span>{email.name}</span>}
                      {email.name && <span className="text-slate-300">•</span>}
                      {email.group_id && groups ? (
                        <span>{t('email.groupLabel', { name: groups.find(g => g.id === email.group_id)?.name || t('email.unknownGroup') })}</span>
                      ) : (
                        <span>{t('email.unassigned')}</span>
                      )}
                    </div>
                  </div>
                </div>
                
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      if (confirm(t('email.confirmRemove'))) {
                        deleteEmail.mutate(email.id);
                      }
                    }}
                    disabled={deleteEmail.isPending}
                    className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                    title={t('email.removeEmail')}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}