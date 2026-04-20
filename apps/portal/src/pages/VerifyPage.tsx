import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import { portalApi } from '../api/client';
import { useAuthStore } from '../store/authStore';
import { Loader2, Ticket, CheckCircle } from 'lucide-react';

export function VerifyPage() {
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { login } = useAuthStore();
  
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const tokenParam = searchParams.get('token');
  const initialEmail = location.state?.email || '';

  useEffect(() => {
    // If we have a magic link token in the URL, verify it immediately
    if (tokenParam) {
      verifyToken(tokenParam);
    }
  }, [tokenParam]);

  const verifyToken = async (tokenToVerify: string) => {
    setLoading(true);
    setError(null);

    try {
      const response = await portalApi.post<{ user: any, token: string }>('/auth/verify', { token: tokenToVerify });
      if (response.token) {
        localStorage.setItem('lumina_customer_token', response.token);
      }
      login(response.user);
      navigate('/tickets', { replace: true });
    } catch (err: any) {
      setError(err.message || 'Invalid or expired login code.');
      setLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!code) return;
    verifyToken(code);
  };

  // If we're verifying a magic link from URL, show a loading state
  if (tokenParam) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
        <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
          <Loader2 className="mx-auto w-12 h-12 text-brand-600 animate-spin mb-4" />
          <h2 className="text-2xl font-extrabold text-gray-900">Verifying your login...</h2>
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
          Enter Verification Code
        </h2>
        <p className="mt-2 text-center text-sm text-gray-600">
          {initialEmail ? (
            <>We sent a 6-digit code to <strong>{initialEmail}</strong></>
          ) : (
            'Enter the 6-digit code sent to your email'
          )}
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10 border border-gray-100">
          {error && (
            <div className="mb-4 bg-red-50 border border-red-200 text-red-600 text-sm p-3 rounded-md">
              {error}
            </div>
          )}

          <form className="space-y-6" onSubmit={handleSubmit}>
            <div>
              <label htmlFor="code" className="block text-sm font-medium text-gray-700">
                Authentication Code
              </label>
              <div className="mt-1">
                <input
                  id="code"
                  name="code"
                  type="text"
                  required
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  className="appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-brand-500 focus:border-brand-500 text-center text-2xl tracking-widest uppercase font-mono"
                  placeholder="123456"
                  maxLength={6}
                  disabled={loading}
                  autoComplete="one-time-code"
                />
              </div>
            </div>

            <div>
              <button
                type="submit"
                disabled={loading || code.length !== 6}
                className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-brand-600 hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand-500 disabled:opacity-50 disabled:cursor-not-allowed items-center gap-2"
              >
                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle className="w-5 h-5" />}
                {loading ? 'Verifying...' : 'Verify Code'}
              </button>
            </div>
          </form>

          <div className="mt-6 text-center">
            <button
              onClick={() => navigate('/login')}
              className="text-sm text-brand-600 hover:text-brand-500 font-medium"
            >
              Request a new code
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
