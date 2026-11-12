import axios from 'axios';
import * as SecureStore from 'expo-secure-store';
import { API_BASE_URL } from './config';

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor for secure token injection
apiClient.interceptors.request.use(
  async (config) => {
    try {
      const token = await SecureStore.getItemAsync('1rad_token');
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    } catch (error) {
      console.error('[MOBILE API] SecureStore access failed:', error);
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Access tokens last 24 h. On a 401, swap the stored refresh token for a new pair
// once (single-flight, like the web app) and replay the request; if that fails
// the caller sees the 401 and the user signs in again.
const NO_REFRESH = ['/auth/login', '/auth/refresh', '/auth/otp/send', '/auth/otp/verify',
  '/auth/forgot-password', '/auth/verify-reset-code', '/auth/reset-password'];
let refreshInFlight = null;

async function refreshAccessToken() {
  const refreshToken = await SecureStore.getItemAsync('1rad_refresh_token');
  if (!refreshToken) throw new Error('NO_REFRESH_TOKEN');
  const resp = await axios.post(`${API_BASE_URL}/auth/refresh`, { refreshToken }, {
    headers: { 'Content-Type': 'application/json' },
  });
  const data = resp?.data || {};
  const newAccess = data.accessToken || data.AccessToken;
  const newRefresh = data.refreshToken || data.RefreshToken;
  if (!newAccess) throw new Error(data.error || 'REFRESH_FAILED');
  await SecureStore.setItemAsync('1rad_token', newAccess);
  if (newRefresh) await SecureStore.setItemAsync('1rad_refresh_token', newRefresh);
  return newAccess;
}

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config;
    const url = original?.url || '';
    const revoked = error.response?.data?.errorCode === 'SESSION_REVOKED';
    if (error.response?.status === 401 && original && !original._retried && !revoked &&
        !NO_REFRESH.some(p => url.startsWith(p))) {
      original._retried = true;
      try {
        refreshInFlight = refreshInFlight || refreshAccessToken().finally(() => { refreshInFlight = null; });
        const newAccess = await refreshInFlight;
        original.headers = { ...(original.headers || {}), Authorization: `Bearer ${newAccess}` };
        return apiClient(original);
      } catch (refreshError) {
        console.warn('[MOBILE API] Session expired; please sign in again.');
      }
    }
    return Promise.reject(error);
  }
);

export default apiClient;
