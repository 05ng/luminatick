import React, { useState, useEffect } from 'react';
import { useSettings, useUpdateSettings } from '../hooks/useSettings';
import { Building2, Settings as SettingsIcon, Mail, Save, Loader2, Cloud, AlertCircle, Shield, Activity } from 'lucide-react';
import { ApiError } from '../api/client';

export const SettingsPage: React.FC = () => {
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
          <h1 className="text-2xl font-bold text-slate-900">General Settings</h1>
          <p className="text-slate-500 mt-0.5">Manage your organization and system defaults.</p>
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
          Save Changes
        </button>
      </div>

      {masterKeyError && (
        <div className="mb-6 bg-red-50 border border-red-200 rounded-xl p-6 flex gap-4">
          <AlertCircle className="w-8 h-8 text-red-600 shrink-0" />
          <div>
            <h3 className="text-lg font-semibold text-red-800">Critical: Missing Encryption Key</h3>
            <p className="text-red-700 mt-1">
              Your server is missing the <code className="bg-red-100 px-1 py-0.5 rounded font-mono text-sm">APP_MASTER_KEY</code> environment variable. 
              This 32-character key is required to securely encrypt and decrypt API tokens and other sensitive settings.
            </p>
            <p className="text-red-700 mt-2 font-medium text-sm">
              Please ask your system administrator to add it to your server's environment configuration, then restart the application.
            </p>
            <p className="text-red-700 mt-2 font-medium text-xs opacity-80">
              Details: {masterKeyError}
            </p>
          </div>
        </div>
      )}

      <div className="space-y-6">
        {/* Organization Profile */}
        <section className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="border-b border-slate-200 bg-slate-50 p-4 flex items-center gap-3">
            <Building2 className="w-5 h-5 text-slate-500" />
            <h2 className="text-lg font-semibold text-slate-900">Organization Profile</h2>
          </div>
          <div className="p-6 space-y-4">
            <div>
              <label htmlFor="COMPANY_NAME" className="block text-sm font-medium text-slate-700 mb-1">
                Company Name
              </label>
              <input
                type="text"
                id="COMPANY_NAME"
                name="COMPANY_NAME"
                value={formData.COMPANY_NAME}
                onChange={handleChange}
                maxLength={100}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
                placeholder="e.g. Acme Corp"
              />
            </div>
            <div>
              <label htmlFor="PORTAL_URL" className="block text-sm font-medium text-slate-700 mb-1">
                Portal URL
              </label>
              <input
                type="url"
                id="PORTAL_URL"
                name="PORTAL_URL"
                value={formData.PORTAL_URL}
                onChange={handleChange}
                maxLength={200}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
                placeholder="e.g. https://support.acme.com"
              />
            </div>
          </div>
        </section>

        {/* System Defaults */}
        <section className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="border-b border-slate-200 bg-slate-50 p-4 flex items-center gap-3">
            <SettingsIcon className="w-5 h-5 text-slate-500" />
            <h2 className="text-lg font-semibold text-slate-900">System Defaults</h2>
          </div>
          <div className="p-6 space-y-4">
            <div>
              <label htmlFor="SYSTEM_TIMEZONE" className="block text-sm font-medium text-slate-700 mb-1">
                System Timezone
              </label>
              <select
                id="SYSTEM_TIMEZONE"
                name="SYSTEM_TIMEZONE"
                value={formData.SYSTEM_TIMEZONE}
                onChange={handleChange}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white"
              >
                <option value="UTC">UTC</option>
                <option value="America/New_York">Eastern Time (ET)</option>
                <option value="America/Chicago">Central Time (CT)</option>
                <option value="America/Denver">Mountain Time (MT)</option>
                <option value="America/Los_Angeles">Pacific Time (PT)</option>
                <option value="Europe/London">London (GMT)</option>
                <option value="Europe/Paris">Central Europe (CET)</option>
                <option value="Asia/Tokyo">Tokyo (JST)</option>
                <option value="Australia/Sydney">Sydney (AEST)</option>
              </select>
            </div>

            <div>
              <label htmlFor="TICKET_PREFIX" className="block text-sm font-medium text-slate-700 mb-1">
                Ticket Prefix
              </label>
              <input
                type="text"
                id="TICKET_PREFIX"
                name="TICKET_PREFIX"
                value={formData.TICKET_PREFIX}
                onChange={handleChange}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 uppercase"
                placeholder="e.g. TKT"
                maxLength={10}
              />
              <p className="mt-1 text-sm text-slate-500">
                Tickets will be numbered as {formData.TICKET_PREFIX || 'TKT'}-1001.
              </p>
            </div>
          </div>
        </section>

        {/* Agent Communication */}
        <section className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="border-b border-slate-200 bg-slate-50 p-4 flex items-center gap-3">
            <Mail className="w-5 h-5 text-slate-500" />
            <h2 className="text-lg font-semibold text-slate-900">Agent Communication</h2>
          </div>
          <div className="p-6">
            <div>
              <label htmlFor="DEFAULT_EMAIL_SIGNATURE" className="block text-sm font-medium text-slate-700 mb-1">
                Default Email Signature
              </label>
              <textarea
                id="DEFAULT_EMAIL_SIGNATURE"
                name="DEFAULT_EMAIL_SIGNATURE"
                value={formData.DEFAULT_EMAIL_SIGNATURE}
                onChange={handleChange}
                rows={4}
                maxLength={5000}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none"
                placeholder="e.g. --&#10;Thank you,&#10;The Support Team"
              />
              <p className="mt-1 text-sm text-slate-500">
                This signature will be appended to agent replies if they haven't set a personal one.
              </p>
            </div>
          </div>
        </section>

        {/* Cloudflare Integration */}
        <section className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="border-b border-slate-200 bg-slate-50 p-4 flex items-center gap-3">
            <Cloud className="w-5 h-5 text-slate-500" />
            <h2 className="text-lg font-semibold text-slate-900">Cloudflare API Credentials</h2>
          </div>
          <div className="p-6 space-y-4">
            <p className="text-sm text-slate-500 mb-4">
              Configure your Cloudflare credentials to monitor usage and costs directly from the dashboard.
            </p>
            <div>
              <label htmlFor="CLOUDFLARE_ACCOUNT_ID" className="block text-sm font-medium text-slate-700 mb-1">
                Cloudflare Account ID
              </label>
              <input
                type="text"
                id="CLOUDFLARE_ACCOUNT_ID"
                name="CLOUDFLARE_ACCOUNT_ID"
                value={formData.CLOUDFLARE_ACCOUNT_ID}
                onChange={handleChange}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 font-mono text-sm"
                placeholder="e.g. 1234567890abcdef1234567890abcdef"
              />
            </div>
            <div>
              <label htmlFor="CLOUDFLARE_API_TOKEN" className="block text-sm font-medium text-slate-700 mb-1">
                Cloudflare API Token
              </label>
              <input
                type="password"
                id="CLOUDFLARE_API_TOKEN"
                name="CLOUDFLARE_API_TOKEN"
                value={formData.CLOUDFLARE_API_TOKEN}
                onChange={handleChange}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 font-mono text-sm"
                placeholder="Enter your API token"
              />
              <p className="mt-1 text-xs text-slate-500">
                Requires <strong>Account Analytics: Read</strong> permissions. For security, this value is masked. Provide a new token only if you wish to overwrite the existing one.
              </p>
            </div>
          </div>
        </section>

        {/* Security & Authentication */}
        <section className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="border-b border-slate-200 bg-slate-50 p-4 flex items-center gap-3">
            <Shield className="w-5 h-5 text-slate-500" />
            <h2 className="text-lg font-semibold text-slate-900">Security & Authentication</h2>
          </div>
          <div className="p-6 space-y-4">
            <p className="text-sm text-slate-500 mb-4">
              Configure Cloudflare Turnstile to protect your Customer Portal from spam and bots.
            </p>
            <div>
              <label htmlFor="TURNSTILE_SITE_KEY" className="block text-sm font-medium text-slate-700 mb-1">
                Turnstile Site Key
              </label>
              <input
                type="text"
                id="TURNSTILE_SITE_KEY"
                name="TURNSTILE_SITE_KEY"
                value={formData.TURNSTILE_SITE_KEY}
                onChange={handleChange}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 font-mono text-sm"
                placeholder="e.g. 1x00000000000000000000AA"
              />
            </div>
            <div>
              <label htmlFor="TURNSTILE_SECRET_KEY" className="block text-sm font-medium text-slate-700 mb-1">
                Turnstile Secret Key
              </label>
              <input
                type="password"
                id="TURNSTILE_SECRET_KEY"
                name="TURNSTILE_SECRET_KEY"
                value={formData.TURNSTILE_SECRET_KEY}
                onChange={handleChange}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 font-mono text-sm"
                placeholder="Enter your Turnstile secret key"
              />
              <p className="mt-1 text-xs text-slate-500">
                For security, this value is masked. Provide a new key only if you wish to overwrite the existing one.
              </p>
            </div>
          </div>
        </section>

      </div>
    </div>
  );
};
