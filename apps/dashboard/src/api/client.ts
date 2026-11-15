import { useAuthStore } from '../store/authStore';
import i18n from '../i18n';

let BASE_URL = '/api';
if (import.meta.env.VITE_API_URL) {
  const url = import.meta.env.VITE_API_URL.replace(/\/+$/, '');
  BASE_URL = url.endsWith('/api') ? url : `${url}/api`;
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

export async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const { token } = useAuthStore.getState();

  const headers = new Headers(options.headers);
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  if (!(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  let response: Response;
  try {
    response = await fetch(`${BASE_URL}${path}`, {
      ...options,
      headers,
    });
  } catch {
    throw new ApiError(i18n.t('errors.network'), 0);
  }

  if (response.status === 401) {
    useAuthStore.getState().logout();
    window.location.href = '/login';
    throw new ApiError(i18n.t('errors.http.401'), 401);
  }

  if (!response.ok) {
    const statusKey = `errors.http.${response.status}`;
    const fallback = i18n.exists(statusKey) ? i18n.t(statusKey) : i18n.t('errors.http.default');
    let errorMessage: string | undefined;
    try {
      const error = await response.json();
      errorMessage = error.error || error.message;
    } catch {
      // Non-JSON error body (e.g. proxy-generated 502 page) — keep the localized fallback.
    }
    throw new ApiError(errorMessage || fallback, response.status);
  }

  return response.json();
}

export const dashboardApi = {
  get: <T>(path: string, options?: RequestInit) => request<T>(path, { ...options, method: 'GET' }),
  post: <T>(path: string, body?: any, options?: RequestInit) => 
    request<T>(path, { ...options, method: 'POST', body: JSON.stringify(body) }),
  postForm: <T>(path: string, body: FormData, options?: RequestInit) =>
    request<T>(path, { ...options, method: 'POST', body }),
  patch: <T>(path: string, body?: any, options?: RequestInit) => 
    request<T>(path, { ...options, method: 'PATCH', body: JSON.stringify(body) }),
  put: <T>(path: string, body?: any, options?: RequestInit) => 
    request<T>(path, { ...options, method: 'PUT', body: JSON.stringify(body) }),
  delete: <T>(path: string, options?: RequestInit) => request<T>(path, { ...options, method: 'DELETE' }),
  download: async (path: string, filename: string) => {
    const headers = new Headers();
    // Dashboard uses zustand persist 'lumina-auth'
    const storedAuth = localStorage.getItem('lumina-auth');
    if (storedAuth) {
      try {
        const parsed = JSON.parse(storedAuth);
        const token = parsed?.state?.token;
        if (token) headers.set('Authorization', `Bearer ${token}`);
      } catch (e) {}
    }
    const res = await fetch(`${BASE_URL}${path}`, { headers });
    if (!res.ok) throw new Error(i18n.t('errors.download'));
    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  },

};
