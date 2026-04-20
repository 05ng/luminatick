import React, { useState, useEffect } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { dashboardApi } from '../api/client';
import { useAuthStore } from '../store/authStore';
import { Shield, ShieldOff, KeyRound, AlertTriangle } from 'lucide-react';

interface SetupResponse {
  provisioning_uri: string;
}

export function SecurityProfilePage() {
  const { user, updateUser } = useAuthStore();
  const [setupData, setSetupData] = useState<SetupResponse | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const startSetup = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await dashboardApi.post<SetupResponse>('/auth/mfa/setup');
      setSetupData(data);
    } catch (err: any) {
      setError(err.message || 'Failed to start MFA setup');
    } finally {
      setIsLoading(false);
    }
  };

  const confirmSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code || code.length !== 6) {
      setError('Please enter a valid 6-digit code');
      return;
    }

    try {
      setIsLoading(true);
      setError(null);
      await dashboardApi.post('/auth/mfa/confirm', { code });
      updateUser({ mfa_enabled: true });
      setSetupData(null);
      setCode('');
      setSuccessMessage('Two-Factor Authentication has been successfully enabled.');
      setTimeout(() => setSuccessMessage(null), 5000);
    } catch (err: any) {
      setError(err.message || 'Failed to verify code. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const disableMfa = async () => {
    if (!window.confirm('Are you sure you want to disable Two-Factor Authentication? This will make your account less secure.')) {
      return;
    }

    try {
      setIsLoading(true);
      setError(null);
      await dashboardApi.post('/auth/mfa/disable');
      updateUser({ mfa_enabled: false });
      setSuccessMessage('Two-Factor Authentication has been disabled.');
      setTimeout(() => setSuccessMessage(null), 5000);
    } catch (err: any) {
      setError(err.message || 'Failed to disable MFA');
    } finally {
      setIsLoading(false);
    }
  };

  const getSecretFromUri = (uri: string) => {
    try {
      return new URL(uri).searchParams.get('secret') || '';
    } catch {
      return '';
    }
  };

  if (!user) return null;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Security Profile</h1>
        <p className="mt-1 text-sm text-gray-500">
          Manage your account security and two-factor authentication settings.
        </p>
      </div>

      {successMessage && (
        <div className="bg-green-50 border-l-4 border-green-400 p-4">
          <div className="flex">
            <div className="flex-shrink-0">
              <Shield className="h-5 w-5 text-green-400" />
            </div>
            <div className="ml-3">
              <p className="text-sm text-green-700">{successMessage}</p>
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border-l-4 border-red-400 p-4">
          <div className="flex">
            <div className="flex-shrink-0">
              <AlertTriangle className="h-5 w-5 text-red-400" />
            </div>
            <div className="ml-3">
              <p className="text-sm text-red-700">{error}</p>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white shadow sm:rounded-lg">
        <div className="px-4 py-5 sm:p-6">
          <h3 className="text-lg font-medium leading-6 text-gray-900 flex items-center gap-2">
            <Shield className="h-5 w-5 text-indigo-500" />
            Two-Factor Authentication (2FA)
          </h3>
          <div className="mt-2 max-w-xl text-sm text-gray-500">
            <p>
              Add an additional layer of security to your account by requiring more than just a password to sign in.
            </p>
          </div>
          
          <div className="mt-5">
            {user.mfa_enabled ? (
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-green-600 font-medium">
                  <Shield className="h-5 w-5" />
                  2FA is currently enabled
                </div>
                {(user.role === 'admin' || user.role === 'agent') ? (
                  <p className="text-sm text-gray-500">
                    Two-Factor Authentication is mandatory for your role and cannot be disabled.
                  </p>
                ) : (
                  <button
                    type="button"
                    onClick={disableMfa}
                    disabled={isLoading}
                    className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 disabled:opacity-50"
                  >
                    <ShieldOff className="h-4 w-4 mr-2" />
                    Disable 2FA
                  </button>
                )}
              </div>
            ) : (
              <div>
                {!setupData ? (
                  <button
                    type="button"
                    onClick={startSetup}
                    disabled={isLoading}
                    className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
                  >
                    <KeyRound className="h-4 w-4 mr-2" />
                    Set up 2FA
                  </button>
                ) : (
                  <div className="bg-gray-50 rounded-lg p-6 space-y-6 border border-gray-200">
                    <div className="space-y-4">
                      <h4 className="font-medium text-gray-900">Step 1: Scan QR Code</h4>
                      <p className="text-sm text-gray-600">
                        Scan the QR code below with your authenticator app (like Google Authenticator, Authy, or Microsoft Authenticator).
                      </p>
                      <div className="bg-white p-4 rounded-lg inline-block shadow-sm">
                        <QRCodeSVG value={setupData.provisioning_uri} size={200} />
                      </div>
                      <p className="text-xs text-gray-500">
                        If you can't scan the QR code, you can manually enter this secret key:<br/>
                        <code className="bg-gray-100 px-2 py-1 rounded mt-1 inline-block font-mono text-sm">{getSecretFromUri(setupData.provisioning_uri)}</code>
                      </p>
                    </div>

                    <div className="border-t border-gray-200 pt-6">
                      <h4 className="font-medium text-gray-900 mb-4">Step 2: Verify Code</h4>
                      <form onSubmit={confirmSetup} className="flex gap-4 items-end">
                        <div className="flex-1 max-w-xs">
                          <label htmlFor="code" className="block text-sm font-medium text-gray-700">
                            Authentication Code
                          </label>
                          <input
                            type="text"
                            id="code"
                            value={code}
                            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                            placeholder="000000"
                            maxLength={6}
                            required
                          />
                        </div>
                        <button
                          type="submit"
                          disabled={isLoading || code.length !== 6}
                          className="inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
                        >
                          Verify & Enable
                        </button>
                        <button
                          type="button"
                          onClick={() => setSetupData(null)}
                          disabled={isLoading}
                          className="inline-flex justify-center py-2 px-4 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                        >
                          Cancel
                        </button>
                      </form>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}