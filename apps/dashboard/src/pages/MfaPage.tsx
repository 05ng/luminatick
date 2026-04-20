import React, { useEffect, useState } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { useAuthStore } from '../store/authStore';
import { dashboardApi } from '../api/client';
import { AuthResponse } from '../types';
import { Shield, KeyRound, AlertTriangle } from 'lucide-react';

interface SetupResponse {
  provisioning_uri: string;
}

export function MfaPage() {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [setupData, setSetupData] = useState<SetupResponse | null>(null);
  
  const navigate = useNavigate();
  const setAuth = useAuthStore((state) => state.setAuth);
  const user = useAuthStore((state) => state.user);

  useEffect(() => {
    if (user && !user.mfa_enabled) {
      // Initiate MFA setup for users who are required to have it but don't yet
      const startSetup = async () => {
        try {
          setLoading(true);
          const data = await dashboardApi.post<SetupResponse>('/auth/mfa/setup');
          setSetupData(data);
        } catch (err: any) {
          setError(err.message || 'Failed to start MFA setup');
        } finally {
          setLoading(false);
        }
      };
      startSetup();
    }
  }, [user]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      let data: AuthResponse;
      if (!user?.mfa_enabled) {
        // Confirm setup
        data = await dashboardApi.post<AuthResponse>('/auth/mfa/confirm', { code });
      } else {
        // Normal verify
        data = await dashboardApi.post<AuthResponse>('/auth/mfa/verify', { code });
      }
      
      setAuth(data.token, data.user);
      navigate('/');
    } catch (err: any) {
      setError(err.message || 'Invalid MFA code');
    } finally {
      setLoading(false);
    }
  };

  const getSecretFromUri = (uri: string) => {
    try {
      return new URL(uri).searchParams.get('secret') || '';
    } catch {
      return '';
    }
  };

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  const isSetupMode = !user.mfa_enabled;

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4 py-8">
      <div className="max-w-md w-full bg-white rounded-xl shadow-sm border border-slate-200 p-8">
        <div className="text-center mb-8">
          <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-indigo-100 mb-4">
            {isSetupMode ? (
              <KeyRound className="h-6 w-6 text-indigo-600" />
            ) : (
              <Shield className="h-6 w-6 text-indigo-600" />
            )}
          </div>
          <h1 className="text-2xl font-bold text-slate-900">
            {isSetupMode ? 'Set up Two-Factor Authentication' : 'Two-Factor Authentication'}
          </h1>
          <p className="text-slate-500 mt-2">
            {isSetupMode 
              ? 'Your account requires an additional layer of security. Please scan the QR code with your authenticator app.'
              : 'Enter the 6-digit code from your authenticator app'}
          </p>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 border-l-4 border-red-400 text-red-700 text-sm rounded-r-md flex items-start">
            <AlertTriangle className="h-5 w-5 mr-2 flex-shrink-0" />
            <p>{error}</p>
          </div>
        )}

        {isSetupMode && setupData && (
          <div className="mb-6 text-center">
            <div className="bg-white p-4 rounded-lg inline-block shadow-sm border border-gray-100 mb-4">
              <QRCodeSVG value={setupData.provisioning_uri} size={180} />
            </div>
            <p className="text-xs text-gray-500 max-w-[250px] mx-auto">
              If you can't scan the QR code, manually enter this secret key:<br/>
              <code className="bg-gray-100 px-2 py-1 rounded mt-2 inline-block font-mono text-sm break-all">
                {getSecretFromUri(setupData.provisioning_uri)}
              </code>
            </p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2 text-center">
              Authentication Code
            </label>
            <input
              type="text"
              required
              maxLength={6}
              className="input text-center text-3xl tracking-[0.5em] font-mono h-14"
              placeholder="000000"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              autoFocus
            />
          </div>
          <button
            type="submit"
            disabled={loading || code.length !== 6 || (isSetupMode && !setupData)}
            className="btn btn-primary w-full h-11 text-base font-medium"
          >
            {loading ? 'Verifying...' : isSetupMode ? 'Verify & Enable' : 'Verify Code'}
          </button>
        </form>
      </div>
    </div>
  );
}
