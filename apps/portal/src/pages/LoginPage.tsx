import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { portalApi } from '../api/client';
import { Ticket, Mail, Loader2, ArrowRight } from 'lucide-react';
import { Turnstile } from '@marsidev/react-turnstile';

export function LoginPage() {
  const [email, setEmail] = useState('');
  const [type, setType] = useState<'magic_link' | 'otp'>('magic_link');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [siteKey, setSiteKey] = useState<string | null>(null);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const config = await portalApi.get<{TURNSTILE_SITE_KEY?: string}>('/config');
        if (config.TURNSTILE_SITE_KEY) {
          setSiteKey(config.TURNSTILE_SITE_KEY);
        }
      } catch (err) {
        console.error('Failed to fetch config:', err);
      }
    };
    fetchConfig();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;

    setLoading(true);
    setError(null);

    try {
      await portalApi.post('/auth/request', {
        email,
        type,
        turnstileToken,
        baseUrl: window.location.origin
      });
      setSuccess(true);
      
      if (type === 'otp') {
        setTimeout(() => {
          navigate('/verify', { state: { email } });
        }, 1500);
      }
    } catch (err: unknown) {
      const error = err as Error;
      setError(error.message || 'Failed to request login link');
    } finally {
      setLoading(false);
    }
  };

  if (success && type === 'magic_link') {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
        <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
          <div className="mx-auto w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4">
            <Mail className="w-8 h-8 text-green-600" />
          </div>
          <h2 className="text-3xl font-extrabold text-gray-900">Check your email</h2>
          <p className="mt-4 text-gray-600">
            We sent a magic link to <strong>{email}</strong>.<br/>
            Click the link in the email to log in.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="flex justify-center">
          <div className="w-12 h-12 bg-brand-600 rounded-xl flex items-center justify-center">
            <Ticket className="w-8 h-8 text-white" />
          </div>
        </div>
        <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
          Sign in to Support
        </h2>
        <p className="mt-2 text-center text-sm text-gray-600">
          Enter your email to receive a secure login link or code.
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10 border border-gray-100">
          {error && (
            <div className="mb-4 bg-red-50 border border-red-200 text-red-600 text-sm p-3 rounded-md">
              {error}
            </div>
          )}
          {success && type === 'otp' && (
            <div className="mb-4 bg-green-50 border border-green-200 text-green-600 text-sm p-3 rounded-md">
              OTP sent! Redirecting to verification...
            </div>
          )}

          <form className="space-y-6" onSubmit={handleSubmit}>
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700">
                Email address
              </label>
              <div className="mt-1">
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-brand-500 focus:border-brand-500 sm:text-sm"
                  placeholder="you@example.com"
                  disabled={loading || success}
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Login Method</label>
              <div className="grid grid-cols-2 gap-4">
                <button
                  type="button"
                  onClick={() => setType('magic_link')}
                  className={`px-4 py-2 text-sm font-medium rounded-md border ${
                    type === 'magic_link' 
                      ? 'border-brand-500 bg-brand-50 text-brand-700' 
                      : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                  }`}
                  disabled={loading || success}
                >
                  Magic Link
                </button>
                <button
                  type="button"
                  onClick={() => setType('otp')}
                  className={`px-4 py-2 text-sm font-medium rounded-md border ${
                    type === 'otp' 
                      ? 'border-brand-500 bg-brand-50 text-brand-700' 
                      : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                  }`}
                  disabled={loading || success}
                >
                  Code (OTP)
                </button>
              </div>
            </div>

            {siteKey && (
              <div className="flex justify-center">
                <Turnstile
                  siteKey={siteKey}
                  onSuccess={(token) => setTurnstileToken(token)}
                  options={{
                    theme: 'light',
                  }}
                />
              </div>
            )}

            <div>
              <button
                type="submit"
                disabled={loading || success || !email || (!!siteKey && !turnstileToken)}
                className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-brand-600 hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand-500 disabled:opacity-50 disabled:cursor-not-allowed items-center gap-2"
              >
                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <ArrowRight className="w-5 h-5" />}
                {loading ? 'Sending...' : `Send ${type === 'magic_link' ? 'Magic Link' : 'Code'}`}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
