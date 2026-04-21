import React, { useState, useEffect } from 'react';
import { dashboardApi, ApiError } from '../api/client';
import { CreditCard, Database, HardDrive, Cpu, Activity, AlertCircle, ExternalLink, RefreshCw, Zap } from 'lucide-react';
import { UsageStats } from '@luminatick/shared';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: any[]) {
  return twMerge(clsx(inputs));
}



const LIMITS = {
  d1_reads_writes: 5_000_000, // 5M per day
  r2_class_a: 1_000_000, // 1M per month
  r2_class_b: 10_000_000, // 10M per month
  worker_requests: 100_000, // 100k per day
  ai_neurons: 10_000, // 10k per day
  do_requests: 100_000, // 100k per day
  vectorize_queries: 30_000_000, // 30M per month
  vectorize_writes: 5_000_000, // 5M per month
};

function formatNumber(num: number) {
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}k`;
  return num.toString();
}

export function UsagePage() {
  const [data, setData] = useState<UsageStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isAuthError, setIsAuthError] = useState(false);
  const [isMasterKeyMissing, setIsMasterKeyMissing] = useState(false);
  const [accountId, setAccountId] = useState('');
  const [apiToken, setApiToken] = useState('');
  const [savingCredentials, setSavingCredentials] = useState(false);

  const [showCredentialsForm, setShowCredentialsForm] = useState(false);

  const fetchUsage = async () => {
    try {
      setLoading(true);
      setError(null);
      setIsAuthError(false);
      setIsMasterKeyMissing(false);
      
      const response = await dashboardApi.get<UsageStats>('/settings/usage');
      setData(response);
      setShowCredentialsForm(false);
    } catch (err: any) {
      const errorMessage = err.message || 'Failed to fetch usage data';
      if (errorMessage.includes('APP_MASTER_KEY is missing')) {
        setIsMasterKeyMissing(true);
      } else if (err instanceof ApiError && err.status === 400) {
        setIsAuthError(true);
        setShowCredentialsForm(true);
      } else {
        setError(errorMessage);
      }
    } finally {
      setLoading(false);
    }
  };

  const saveCredentials = async () => {
    if (!accountId.trim() || (!apiToken.trim() && !isAuthError)) {
      setError('Account ID is required');
      return;
    }
    
    // Only require API Token if it's not currently set (auth error) or they are explicitly changing it
    const payload: Record<string, string> = {
      CLOUDFLARE_ACCOUNT_ID: accountId.trim()
    };
    
    if (apiToken.trim()) {
      payload.CLOUDFLARE_API_TOKEN = apiToken.trim();
    }

    try {
      setSavingCredentials(true);
      setError(null);
      setIsMasterKeyMissing(false);
      await dashboardApi.put('/settings', payload);
      await fetchUsage();
      setApiToken(''); // Clear sensitive token from state
    } catch (err: any) {
      const errorMessage = err.message || 'Failed to save credentials';
      if (errorMessage.includes('APP_MASTER_KEY is missing')) {
        setIsMasterKeyMissing(true);
      } else {
        setError(errorMessage);
      }
    } finally {
      setSavingCredentials(false);
    }
  };

  useEffect(() => {
    fetchUsage();
  }, []);

  const renderCredentialsForm = () => (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden mt-6">
      <div className="p-6 bg-slate-50 border-b border-slate-100 flex gap-4">
        <AlertCircle className={cn("w-8 h-8 shrink-0", isAuthError ? "text-orange-500" : "text-brand-500")} />
        <div>
          <h3 className={cn("text-lg font-semibold", isAuthError ? "text-orange-800" : "text-brand-800")}>
            {isAuthError ? 'Cloudflare Credentials Required' : 'Update Cloudflare Credentials'}
          </h3>
          <p className={cn("mt-1", isAuthError ? "text-orange-700" : "text-brand-700")}>
            {isAuthError 
              ? 'To view your usage and costs, you need to provide your Cloudflare Account ID and an API Token with Account Analytics permissions.'
              : 'Update your Cloudflare Account ID or Analytics API Token. Leave the token field blank to keep your existing encrypted token.'}
          </p>
          <p className={cn("mt-2 text-sm font-medium", isAuthError ? "text-orange-700" : "text-brand-700")}>
            Note: Storing these credentials in the database allows anyone with Admin access to view them, but it makes setup easier.
          </p>
        </div>
      </div>
      
      <div className="p-6 space-y-6 text-slate-600">
        <div>
          <h4 className="font-medium text-slate-900 mb-2">1. How to get your API Token:</h4>
          <ol className="list-decimal list-inside space-y-3">
            <li>
              Go to your <a href="https://dash.cloudflare.com/profile/api-tokens" target="_blank" rel="noopener noreferrer" className="text-brand-600 hover:text-brand-700 hover:underline inline-flex items-center gap-1">Cloudflare API Tokens <ExternalLink className="w-3 h-3" /></a> dashboard.
            </li>
            <li>Click <strong>Create Token</strong> and choose <strong>Create Custom Token</strong>.</li>
            <li>
              Under Permissions, select:
              <ul className="list-disc list-inside ml-6 mt-1 text-sm bg-slate-50 p-2 rounded border border-slate-100">
                <li>Account <span className="mx-2 text-slate-400">→</span> Account Analytics <span className="mx-2 text-slate-400">→</span> Read</li>
              </ul>
            </li>
            <li>Under Account Resources, select your account.</li>
            <li>Complete the creation and copy your new token.</li>
          </ol>
        </div>

        <div>
          <h4 className="font-medium text-slate-900 mb-4">2. Enter your credentials:</h4>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Cloudflare Account ID
              </label>
              <input
                type="text"
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
                placeholder="e.g., 1234567890abcdef1234567890abcdef"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500 font-mono text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Cloudflare API Token
              </label>
              <input
                type="password"
                value={apiToken}
                onChange={(e) => setApiToken(e.target.value)}
                placeholder={isAuthError ? "Enter your API token" : "•••••••• (Leave blank to keep existing)"}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500 font-mono text-sm"
              />
            </div>
            <div className="pt-2 flex gap-3">
              <button 
                onClick={saveCredentials}
                disabled={savingCredentials}
                className="px-4 py-2 bg-brand-600 text-white rounded-lg text-sm font-medium hover:bg-brand-700 transition-colors disabled:opacity-50"
              >
                {savingCredentials ? 'Saving...' : 'Save & View Usage'}
              </button>
              {!isAuthError && (
                <button 
                  onClick={() => setShowCredentialsForm(false)}
                  disabled={savingCredentials}
                  className="px-4 py-2 bg-white text-slate-700 border border-slate-300 rounded-lg text-sm font-medium hover:bg-slate-50 transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex flex-col items-center gap-4 text-slate-500">
          <RefreshCw className="w-8 h-8 animate-spin" />
          <p>Loading usage data...</p>
        </div>
      </div>
    );
  }

  if (isMasterKeyMissing) {
    return (
      <div className="max-w-3xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <CreditCard className="w-6 h-6 text-brand-600" />
            Usage & Costs
          </h1>
        </div>
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 flex gap-4">
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
            <button 
              onClick={fetchUsage}
              className="mt-4 px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 transition-colors"
            >
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (error && !isAuthError) {
    return (
      <div className="max-w-3xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <CreditCard className="w-6 h-6 text-brand-600" />
            Usage & Costs
          </h1>
        </div>
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-red-700">
          <p className="font-medium">Error loading usage data</p>
          <p className="text-sm mt-1">{error}</p>
          <button 
            onClick={fetchUsage}
            className="mt-4 px-4 py-2 bg-red-100 text-red-800 rounded-lg text-sm font-medium hover:bg-red-200 transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <CreditCard className="w-6 h-6 text-brand-600" />
            Usage & Costs
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Monitor your Cloudflare resource usage against Free Tier limits. Updates may be delayed by a few hours.
          </p>
        </div>
        {!isAuthError && !showCredentialsForm && (
          <button
            onClick={() => setShowCredentialsForm(true)}
            className="px-4 py-2 bg-white border border-slate-300 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors shadow-sm"
          >
            Update Credentials
          </button>
        )}
      </div>

      {(isAuthError || showCredentialsForm) && renderCredentialsForm()}

      {!isAuthError && !showCredentialsForm && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <StatCard 
            title="D1 Reads and Writes"
            description="Database row operations"
            icon={Database}
            current={(data?.d1?.rowsRead || 0) + (data?.d1?.rowsWritten || 0)}
            limit={LIMITS.d1_reads_writes}
            unit="/ day"
            format={formatNumber}
            colorClass="text-blue-600"
            bgClass="bg-blue-50"
            fillClass="bg-blue-500"
          />

          <StatCard 
            title="R2 Operations (Class A)"
            description="Writes to storage"
            icon={HardDrive}
            current={data?.r2?.classAOperations || 0}
            limit={LIMITS.r2_class_a}
            unit="/ month"
            format={formatNumber}
            colorClass="text-indigo-600"
            bgClass="bg-indigo-50"
            fillClass="bg-indigo-500"
          />

          <StatCard 
            title="R2 Operations (Class B)"
            description="Reads from storage"
            icon={HardDrive}
            current={data?.r2?.classBOperations || 0}
            limit={LIMITS.r2_class_b}
            unit="/ month"
            format={formatNumber}
            colorClass="text-purple-600"
            bgClass="bg-purple-50"
            fillClass="bg-purple-500"
          />

          <StatCard 
            title="Workers Requests"
            description="API calls, widget loads, pages"
            icon={Activity}
            current={data?.workers?.requests || 0}
            limit={LIMITS.worker_requests}
            unit="/ day"
            format={formatNumber}
            colorClass="text-emerald-600"
            bgClass="bg-emerald-50"
            fillClass="bg-emerald-500"
          />

          <StatCard 
            title="Workers AI Neurons"
            description="RAG, embedding, auto-responses"
            icon={Cpu}
            current={data?.workersAi?.neurons || 0}
            limit={LIMITS.ai_neurons}
            unit="/ day"
            format={formatNumber}
            colorClass="text-brand-600"
            bgClass="bg-brand-50"
            fillClass="bg-brand-500"
          />

          <StatCard 
            title="Durable Objects Requests"
            description="Real-time presence connections"
            icon={Zap}
            current={data?.durableObjects?.requests || 0}
            limit={LIMITS.do_requests}
            unit="/ day"
            format={formatNumber}
            colorClass="text-amber-600"
            bgClass="bg-amber-50"
            fillClass="bg-amber-500"
          />

          <StatCard 
            title="Vectorize Queries"
            description="Vector search queries"
            icon={Database}
            current={data?.vectorize?.queried || 0}
            limit={LIMITS.vectorize_queries}
            unit="/ month"
            format={formatNumber}
            colorClass="text-pink-600"
            bgClass="bg-pink-50"
            fillClass="bg-pink-500"
          />

          <StatCard 
            title="Vectorize Writes"
            description="Vector index updates"
            icon={Database}
            current={data?.vectorize?.written || 0}
            limit={LIMITS.vectorize_writes}
            unit="/ month"
            format={formatNumber}
            colorClass="text-rose-600"
            bgClass="bg-rose-50"
            fillClass="bg-rose-500"
          />
        </div>
      )}
    </div>
  );
}

interface StatCardProps {
  title: string;
  description: string;
  icon: React.ElementType;
  current: number;
  limit: number;
  unit: string;
  format?: (n: number) => string;
  colorClass: string;
  bgClass: string;
  fillClass: string;
}

function StatCard({ title, description, icon: Icon, current, limit, unit, format, colorClass, bgClass, fillClass }: StatCardProps) {
  const percentage = Math.min((current / limit) * 100, 100);
  const isNearLimit = percentage >= 80;
  const isOverLimit = percentage >= 100;
  
  const displayCurrent = format ? format(current) : current;
  const displayLimit = format ? format(limit) : limit;

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 flex flex-col">
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className={cn("p-2 rounded-lg", bgClass, colorClass)}>
            <Icon className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-semibold text-slate-900">{title}</h3>
            <p className="text-xs text-slate-500">{description}</p>
          </div>
        </div>
        <div className="text-right">
          <div className="text-2xl font-bold text-slate-900">
            {displayCurrent}
          </div>
          <div className="text-xs text-slate-500 font-medium">
            of {displayLimit} {unit}
          </div>
        </div>
      </div>

      <div className="mt-auto pt-4">
        <div className="flex justify-between text-xs font-medium mb-2">
          <span className={cn(
            isOverLimit ? "text-red-600" : isNearLimit ? "text-orange-600" : "text-slate-600"
          )}>
            {percentage.toFixed(1)}% Used
          </span>
          <span className="text-slate-500">Free Tier Limit</span>
        </div>
        <div className="h-2.5 w-full bg-slate-100 rounded-full overflow-hidden">
          <div 
            className={cn("h-full transition-all duration-500 rounded-full", 
              isOverLimit ? "bg-red-500" : isNearLimit ? "bg-orange-500" : fillClass
            )}
            style={{ width: `${percentage}%` }}
          />
        </div>
      </div>
    </div>
  );
}
