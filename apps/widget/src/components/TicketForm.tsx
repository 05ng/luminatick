import React, { useState } from 'react';

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
        <h3 className="text-lg font-bold text-gray-900 mb-2">Ticket Submitted!</h3>
        <p className="text-gray-600 mb-6">We've received your request and will get back to you soon.</p>
        <button
          onClick={() => setStatus('idle')}
          className="text-blue-600 font-medium hover:underline"
        >
          Submit another ticket
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Your Name</label>
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
        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Email Address</label>
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
        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Subject</label>
        <input
          type="text"
          required
          className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
          placeholder="How can we help?"
          value={formData.subject}
          onChange={e => setFormData({ ...formData, subject: e.target.value })}
        />
      </div>
      <div>
        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Message</label>
        <textarea
          required
          rows={3}
          className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all resize-none"
          placeholder="Tell us more about your issue..."
          value={formData.message}
          onChange={e => setFormData({ ...formData, message: e.target.value })}
        />
      </div>
      {status === 'error' && (
        <p className="text-red-500 text-sm">Something went wrong. Please try again.</p>
      )}
      <button
        type="submit"
        disabled={status === 'submitting'}
        className="w-full py-2 px-4 rounded font-bold text-white transition-opacity disabled:opacity-50"
        style={{ backgroundColor: config.primaryColor }}
      >
        {status === 'submitting' ? 'Submitting...' : 'Send Message'}
      </button>
    </form>
  );
};

export default TicketForm;
