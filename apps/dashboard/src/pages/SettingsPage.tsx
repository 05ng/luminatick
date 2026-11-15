import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useSettings, useUpdateSettings } from '../hooks/useSettings';
import { Building2, Settings as SettingsIcon, Mail, Save, Loader2, Cloud, AlertCircle, Shield, Activity } from 'lucide-react';
import { ApiError } from '../api/client';

export const SettingsPage: React.FC = () => {
  const { t } = useTranslation();
  const { data: settings, isLoading, error: fetchError } = useSettings();
  const updateSettings = useUpdateSettings();

  const [formData, setFormData] = useState<Record<string, string>>({
    COMPANY_NAME: '',
    PORTAL_URL: '',
    SYSTEM_TIMEZONE: 'UTC',
    TICKET_PREFIX: 'TKT',
    DEFAULT_EMAIL_SIGNATURE: '',
    CLOUDFLARE_ACCOUNT_ID: '',
    CLOUDFLARE_API_TOKEN: '',
    TURNSTILE_SITE_KEY: '',
    TURNSTILE_SECRET_KEY: '',
  });

  const [masterKeyError, setMasterKeyError] = useState<string | null>(null);

  useEffect(() => {
    if (fetchError && fetchError instanceof ApiError) {
      if (fetchError.message.includes('APP_MASTER_KEY')) {
        setMasterKeyError(fetchError.message);
      }
    }
  }, [fetchError]);

  useEffect(() => {
    if (settings) {
      setFormData((prev) => ({
        ...prev,
        COMPANY_NAME: settings.COMPANY_NAME || '',
        PORTAL_URL: settings.PORTAL_URL || '',
        SYSTEM_TIMEZONE: settings.SYSTEM_TIMEZONE || 'UTC',
        TICKET_PREFIX: settings.TICKET_PREFIX || 'TKT',
        DEFAULT_EMAIL_SIGNATURE: settings.DEFAULT_EMAIL_SIGNATURE || '',
        CLOUDFLARE_ACCOUNT_ID: settings.CLOUDFLARE_ACCOUNT_ID || '',
        CLOUDFLARE_API_TOKEN: settings.CLOUDFLARE_API_TOKEN || '',
        TURNSTILE_SITE_KEY: settings.TURNSTILE_SITE_KEY || '',
        TURNSTILE_SECRET_KEY: settings.TURNSTILE_SECRET_KEY || '',
      }));
    }
  }, [settings]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMasterKeyError(null);
    try {
      // Clean and validate data before sending
      const payload: Record<string, string> = {};
      
      for (const [key, rawValue] of Object.entries(formData)) {
        // Enforce key format (uppercase alphanumeric and underscores, 1-100 chars)
        if (!/^[A-Z0-9_]+$/.test(key)) continue;
        if (key.length === 0 || key.length > 100) continue;
        
        // Ensure graceful handling of null/undefined and enforce string type
        let value = rawValue;
        if (value === null || value === undefined) {
          value = '';
        } else if (typeof value !== 'string') {
          value = String(value);
        }
        
        // Omit empty sensitive credentials if they were not modified
        if (value === '••••••••') continue;
        
        // Enforce max length of 5000 characters for values
        if (value.length > 5000) {
          value = value.slice(0, 5000);
        }
        
        payload[key] = value;
      }
      
      // Enforce max 50 keys
      const finalPayload = Object.fromEntries(
        Object.entries(payload).slice(0, 50)
      );

      await updateSettings.mutateAsync(finalPayload);
    } catch (error: any) {
      console.error('Failed to update settings:', error);
      if (error?.message?.includes('APP_MASTER_KEY')) {
        setMasterKeyError(error.message);
      }
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-brand-600" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto py-8 px-4">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{t('settings.general.title')}</h1>
          <p className="text-slate-500 mt-0.5">{t('settings.general.subtitle')}</p>
        </div>
        <button
          onClick={handleSubmit}
          disabled={updateSettings.isPending || !!masterKeyError}
          className="flex items-center gap-2 px-4 py-2 bg-brand-600 text-white rounded-lg hover:bg-brand-700 transition-colors disabled:opacity-50 font-medium cursor-pointer"
        >
          {updateSettings.isPending ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <Save className="w-5 h-5" />
          )}
          {t('settings.general.saveChanges')}
        </button>
      </div>

      {masterKeyError && (
        <div className="mb-6 bg-red-50 border border-red-200 rounded-xl p-6 flex gap-4">
          <AlertCircle className="w-8 h-8 text-red-600 shrink-0" />
          <div>
            <h3 className="text-lg font-semibold text-red-800">{t('settings.general.masterKey.title')}</h3>
            <p className="text-red-700 mt-1">
              {t('settings.general.masterKey.bodyPrefix')}{' '}
              <code className="bg-red-100 px-1 py-0.5 rounded font-mono text-sm">APP_MASTER_KEY</code>{' '}
              {t('settings.general.masterKey.bodySuffix')}
            </p>
            <p className="text-red-700 mt-2 font-medium text-sm">
              {t('settings.general.masterKey.instruction')}
            </p>
            <p className="text-red-700 mt-2 font-medium text-xs opacity-80">
              {t('settings.general.masterKey.details', { message: masterKeyError })}
            </p>
          </div>
        </div>
      )}

      <div className="space-y-6">
        {/* Organization Profile */}
        <section className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="border-b border-slate-200 bg-slate-50 p-4 flex items-center gap-3">
            <Building2 className="w-5 h-5 text-slate-500" />
            <h2 className="text-lg font-semibold text-slate-900">{t('settings.general.organization.title')}</h2>
          </div>
          <div className="p-6 space-y-4">
            <div>
              <label htmlFor="COMPANY_NAME" className="block text-sm font-medium text-slate-700 mb-1">
                {t('settings.general.organization.companyName')}
              </label>
              <input
                type="text"
                id="COMPANY_NAME"
                name="COMPANY_NAME"
                value={formData.COMPANY_NAME}
                onChange={handleChange}
                maxLength={100}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
                placeholder={t('settings.general.organization.companyNamePlaceholder')}
              />
            </div>
            <div>
              <label htmlFor="PORTAL_URL" className="block text-sm font-medium text-slate-700 mb-1">
                {t('settings.general.organization.portalUrl')}
              </label>
              <input
                type="url"
                id="PORTAL_URL"
                name="PORTAL_URL"
                value={formData.PORTAL_URL}
                onChange={handleChange}
                maxLength={200}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
                placeholder={t('settings.general.organization.portalUrlPlaceholder')}
              />
            </div>
          </div>
        </section>

        {/* System Defaults */}
        <section className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="border-b border-slate-200 bg-slate-50 p-4 flex items-center gap-3">
            <SettingsIcon className="w-5 h-5 text-slate-500" />
            <h2 className="text-lg font-semibold text-slate-900">{t('settings.general.defaults.title')}</h2>
          </div>
          <div className="p-6 space-y-4">
            <div>
              <label htmlFor="SYSTEM_TIMEZONE" className="block text-sm font-medium text-slate-700 mb-1">
                {t('settings.general.defaults.timezone')}
              </label>
              <select
                id="SYSTEM_TIMEZONE"
                name="SYSTEM_TIMEZONE"
                value={formData.SYSTEM_TIMEZONE}
                onChange={handleChange}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white"
              >
                <option value="UTC">{t('settings.general.timezone.utc')}</option>
                <option value="America/New_York">{t('settings.general.timezone.eastern')}</option>
                <option value="America/Chicago">{t('settings.general.timezone.central')}</option>
                <option value="America/Denver">{t('settings.general.timezone.mountain')}</option>
                <option value="America/Los_Angeles">{t('settings.general.timezone.pacific')}</option>
                <option value="Europe/London">{t('settings.general.timezone.london')}</option>
                <option value="Europe/Paris">{t('settings.general.timezone.centralEurope')}</option>
                <option value="Asia/Tokyo">{t('settings.general.timezone.tokyo')}</option>
                <option value="Australia/Sydney">{t('settings.general.timezone.sydney')}</option>
              </select>
            </div>

            <div>
              <label htmlFor="TICKET_PREFIX" className="block text-sm font-medium text-slate-700 mb-1">
                {t('settings.general.defaults.ticketPrefix')}
              </label>
              <input
                type="text"
                id="TICKET_PREFIX"
                name="TICKET_PREFIX"
                value={formData.TICKET_PREFIX}
                onChange={handleChange}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 uppercase"
                placeholder={t('settings.general.defaults.ticketPrefixPlaceholder')}
                maxLength={10}
              />
              <p className="mt-1 text-sm text-slate-500">
                {t('settings.general.defaults.ticketPrefixHint', { prefix: formData.TICKET_PREFIX || 'TKT' })}
              </p>
            </div>
          </div>
        </section>

        {/* Agent Communication */}
        <section className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="border-b border-slate-200 bg-slate-50 p-4 flex items-center gap-3">
            <Mail className="w-5 h-5 text-slate-500" />
            <h2 className="text-lg font-semibold text-slate-900">{t('settings.general.communication.title')}</h2>
          </div>
          <div className="p-6">
            <div>
              <label htmlFor="DEFAULT_EMAIL_SIGNATURE" className="block text-sm font-medium text-slate-700 mb-1">
                {t('settings.general.communication.signature')}
              </label>
              <textarea
                id="DEFAULT_EMAIL_SIGNATURE"
                name="DEFAULT_EMAIL_SIGNATURE"
                value={formData.DEFAULT_EMAIL_SIGNATURE}
                onChange={handleChange}
                rows={4}
                maxLength={5000}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none"
                placeholder={t('settings.general.communication.signaturePlaceholder')}
              />
              <p className="mt-1 text-sm text-slate-500">
                {t('settings.general.communication.signatureHint')}
              </p>
            </div>
          </div>
        </section>

        {/* Cloudflare Integration */}
        <section className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="border-b border-slate-200 bg-slate-50 p-4 flex items-center gap-3">
            <Cloud className="w-5 h-5 text-slate-500" />
            <h2 className="text-lg font-semibold text-slate-900">{t('settings.general.cloudflare.title')}</h2>
          </div>
          <div className="p-6 space-y-4">
            <p className="text-sm text-slate-500 mb-4">
              {t('settings.general.cloudflare.description')}
            </p>
            <div>
              <label htmlFor="CLOUDFLARE_ACCOUNT_ID" className="block text-sm font-medium text-slate-700 mb-1">
                {t('settings.general.cloudflare.accountId')}
              </label>
              <input
                type="text"
                id="CLOUDFLARE_ACCOUNT_ID"
                name="CLOUDFLARE_ACCOUNT_ID"
                value={formData.CLOUDFLARE_ACCOUNT_ID}
                onChange={handleChange}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 font-mono text-sm"
                placeholder={t('settings.general.cloudflare.accountIdPlaceholder')}
              />
            </div>
            <div>
              <label htmlFor="CLOUDFLARE_API_TOKEN" className="block text-sm font-medium text-slate-700 mb-1">
                {t('settings.general.cloudflare.apiToken')}
              </label>
              <input
                type="password"
                id="CLOUDFLARE_API_TOKEN"
                name="CLOUDFLARE_API_TOKEN"
                value={formData.CLOUDFLARE_API_TOKEN}
                onChange={handleChange}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 font-mono text-sm"
                placeholder={t('settings.general.cloudflare.apiTokenPlaceholder')}
              />
              <p className="mt-1 text-xs text-slate-500">
                {t('settings.general.cloudflare.apiTokenHintRequires')}{' '}
                <strong>{t('settings.general.cloudflare.apiTokenHintScopes')}</strong>{' '}
                {t('settings.general.cloudflare.apiTokenHintRest')}
              </p>
            </div>
          </div>
        </section>

        {/* Security & Authentication */}
        <section className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="border-b border-slate-200 bg-slate-50 p-4 flex items-center gap-3">
            <Shield className="w-5 h-5 text-slate-500" />
            <h2 className="text-lg font-semibold text-slate-900">{t('settings.general.security.title')}</h2>
          </div>
          <div className="p-6 space-y-4">
            <p className="text-sm text-slate-500 mb-4">
              {t('settings.general.security.description')}
            </p>
            <div>
              <label htmlFor="TURNSTILE_SITE_KEY" className="block text-sm font-medium text-slate-700 mb-1">
                {t('settings.general.security.siteKey')}
              </label>
              <input
                type="text"
                id="TURNSTILE_SITE_KEY"
                name="TURNSTILE_SITE_KEY"
                value={formData.TURNSTILE_SITE_KEY}
                onChange={handleChange}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 font-mono text-sm"
                placeholder={t('settings.general.security.siteKeyPlaceholder')}
              />
            </div>
            <div>
              <label htmlFor="TURNSTILE_SECRET_KEY" className="block text-sm font-medium text-slate-700 mb-1">
                {t('settings.general.security.secretKey')}
              </label>
              <input
                type="password"
                id="TURNSTILE_SECRET_KEY"
                name="TURNSTILE_SECRET_KEY"
                value={formData.TURNSTILE_SECRET_KEY}
                onChange={handleChange}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 font-mono text-sm"
                placeholder={t('settings.general.security.secretKeyPlaceholder')}
              />
              <p className="mt-1 text-xs text-slate-500">
                {t('settings.general.security.secretKeyHint')}
              </p>
            </div>
          </div>
        </section>

      </div>
    </div>
  );
};
