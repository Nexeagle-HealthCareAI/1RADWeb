import axios from 'axios';
import { dispatchApiError } from './apiErrorEvents';

export const BASE_URL = import.meta.env.VITE_API_URL || 'https://1radapi-bch4ere7a6cmgkap.centralindia-01.azurewebsites.net/api/v1';

// One-time diagnostic so we can verify in the browser console which API the
// deployed bundle is actually calling. Remove once Prod is confirmed routing
// to the Prod API correctly.
// eslint-disable-next-line no-console
console.info('[1Rad] API base URL:', BASE_URL);

const apiClient = axios.create({
  baseURL: BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Interceptor to add Authorization header
apiClient.interceptors.request.use((config) => {
  // Do not add auth header for public authentication routes
  const publicRoutes = ['/auth/login', '/auth/otp/send', '/auth/otp/verify', '/auth/forgot-password'];
  const isPublicRoute = publicRoutes.some(route => config.url.includes(route));

  if (!isPublicRoute) {
    // Auth tokens migrated from sessionStorage to localStorage (one session
    // per browser, survives tab restarts). We still read sessionStorage as a
    // one-time fallback so an in-flight tab can finish its request after the
    // deploy without an unsolicited 401.
    const token = localStorage.getItem('1rad_token')
      || localStorage.getItem('1rad_initiation_token')
      || sessionStorage.getItem('1rad_token')
      || sessionStorage.getItem('1rad_initiation_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  }
  return config;
}, (error) => {
  return Promise.reject(error);
});

// Interceptor to handle responses and token expiration
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      const isLogin = error.config.url.includes('/auth/login');
      const code = error.response?.data?.code;
      const isSessionRevoked = code === 'SESSION_REVOKED' || code === 'MISSING_SID';

      if (isSessionRevoked && !isLogin) {
        // Server has invalidated this session — either kicked by a new
        // login on the same device category, or revoked from the Active
        // Sessions UI, or stale-after-migration. Clear local state and
        // ship the user to /login with a reason flag so the login page
        // can surface a friendly banner.
        try {
          localStorage.removeItem('1rad_user');
          localStorage.removeItem('1rad_token');
          localStorage.removeItem('1rad_initiation_token');
        } catch { /* storage may be unavailable in private modes */ }
        // Avoid re-redirecting if we're already on /login (e.g. the user
        // ran into a stale token before they finished re-signing in).
        if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
          const reason = code === 'MISSING_SID' ? 'session-upgraded' : 'signed-out-elsewhere';
          window.location.replace(`/login?reason=${reason}`);
        }
      } else if (!isLogin) {
        console.warn('[API] Unauthorized. Session may have expired.');
      } else {
        console.warn('[API] Login failed: Invalid credentials.');
      }
    } else if (error.response?.status === 402) {
      console.warn('[API] Subscription Expired or Locked.');
      window.dispatchEvent(new Event('1rad_subscription_locked'));
    }

    // Surface a user-friendly toast for non-suppressed errors. The dispatch
    // helper itself decides what to suppress (login 401, validation, 402,
    // cancelled requests, per-request opt-outs). Errors still propagate to
    // the caller — this is purely an additive UX layer.
    try { dispatchApiError(error); } catch (e) { /* never let UX break the flow */ }

    return Promise.reject(error);
  }
);

export default apiClient;
