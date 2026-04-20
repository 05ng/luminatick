let BASE_URL = '/api/v1/widget';
if (import.meta.env.VITE_API_URL) {
  const url = import.meta.env.VITE_API_URL.replace(/\/+$/, '');
  BASE_URL = url.includes('/api/v1/widget') ? url : `${url}/api/v1/widget`;
}
export { BASE_URL };
