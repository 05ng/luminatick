import React, { useState } from 'react';
import { t } from '../i18n';

interface Props {
  config: any;
}

const TicketForm: React.FC<Props> = ({ config }) => {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    subject: '',
    message: ''
  });
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus('submitting');

    try {
      const response = await fetch('/api/v1/widget/tickets', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Lumina-Source': 'widget'
        },
        body: JSON.stringify({
          ...formData,
          // Extra metadata could be added here (e.g., current URL)
          metadata: {
            url: window.location.href,
            userAgent: navigator.userAgent
          }
        }),
      });

      if (!response.ok) throw new Error('Failed to submit');
      
      setStatus('success');
      setFormData({ name: '', email: '', subject: '', message: '' });
    } catch (err) {
      console.error(err);
      setStatus('error');
    }
  };

  if (status === 'success') {
    return (
      <div className="text-center py-8">
        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h3 className="text-lg font-bold text-gray-900 mb-2">{t('successTitle')}</h3>
        <p className="text-gray-600 mb-6">{t('successMessage')}</p>
        <button
          onClick={() => setStatus('idle')}
          className="text-blue-600 font-medium hover:underline"
        >
          {t('submitAnother')}
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">{t('yourName')}</label>
        <input
          type="text"
          required
          className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
          placeholder="John Doe"
          value={formData.name}
          onChange={e => setFormData({ ...formData, name: e.target.value })}
        />
      </div>
      <div>
        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">{t('emailAddress')}</label>
        <input
          type="email"
          required
          className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
          placeholder="john@example.com"
          value={formData.email}
          onChange={e => setFormData({ ...formData, email: e.target.value })}
        />
      </div>
      <div>
        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">{t('subject')}</label>
        <input
          type="text"
          required
          className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
          placeholder={t('subjectPlaceholder')}
          value={formData.subject}
          onChange={e => setFormData({ ...formData, subject: e.target.value })}
        />
      </div>
      <div>
        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">{t('message')}</label>
        <textarea
          required
          rows={3}
          className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all resize-none"
          placeholder={t('messagePlaceholder')}
          value={formData.message}
          onChange={e => setFormData({ ...formData, message: e.target.value })}
        />
      </div>
      {status === 'error' && (
        <p className="text-red-500 text-sm">{t('somethingWrong')}</p>
      )}
      <button
        type="submit"
        disabled={status === 'submitting'}
        className="w-full py-2 px-4 rounded font-bold text-white transition-opacity disabled:opacity-50"
        style={{ backgroundColor: config.primaryColor }}
      >
        {status === 'submitting' ? t('submitting') : t('send')}
      </button>
    </form>
  );
};

export default TicketForm;
