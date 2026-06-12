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

// Public auth routes never carry (or refresh against) a bearer token.
const PUBLIC_AUTH_ROUTES = ['/auth/login', '/auth/otp/send', '/auth/otp/verify', '/auth/forgot-password', '/auth/refresh'];

// Clears all auth material and bounces to /login. Used only when the session
// is genuinely unrecoverable (refresh failed or was deliberately revoked).
function forceLogout(reason) {
  try {
    localStorage.removeItem('1rad_user');
    localStorage.removeItem('1rad_token');
    localStorage.removeItem('1rad_initiation_token');
    localStorage.removeItem('1rad_refresh_token');
    sessionStorage.removeItem('1rad_user');
    sessionStorage.removeItem('1rad_token');
    sessionStorage.removeItem('1rad_initiation_token');
  } catch { /* storage unavailable in private modes */ }

  if (typeof window !== 'undefined') {
    const path = window.location.pathname;
    // TEMPORARY: while debugging custom-role access, do NOT bounce to /login
    // from the access-denied screen — a background 401 (e.g. a sync poll) must
    // not yank the user off the page they're inspecting. Remove this guard to
    // restore the normal "expired session → login" behaviour everywhere.
    if (path.startsWith('/access-denied')) return;
    // Public pages (registration, password reset) never bounce to /login: a
    // stale token from an old session firing a background 401 must not yank a
    // new user off the signup form. Storage is already cleared above.
    if (path.startsWith('/register') || path.startsWith('/forgot-password')) return;
    if (!path.startsWith('/login')) {
      window.location.replace(`/login?reason=${reason}`);
    }
  }
}

// ── Silent refresh-token rotation ──────────────────────────────────────────
// An expired ACCESS token must not kick a working user to /login. On a 401 we
// exchange the long-lived refresh token for a fresh access token and replay the
// original request. Concurrent 401s share a single in-flight refresh (so we
// don't fire N refreshes and rotate the token out from under each other).
let isRefreshing = false;
let refreshWaiters = [];

function queueWaiter() {
  return new Promise((resolve, reject) => refreshWaiters.push({ resolve, reject }));
}
function flushWaiters(err, token) {
  const waiters = refreshWaiters;
  refreshWaiters = [];
  waiters.forEach(w => (err ? w.reject(err) : w.resolve(token)));
}

async function performTokenRefresh() {
  const refreshToken = localStorage.getItem('1rad_refresh_token');
  if (!refreshToken) throw new Error('NO_REFRESH_TOKEN');
  // Raw axios (not apiClient) so this call doesn't recurse through this very
  // interceptor and doesn't attach the already-expired access token.
  const resp = await axios.post(`${BASE_URL}/auth/refresh`, { refreshToken }, {
    headers: { 'Content-Type': 'application/json' },
  });
  const data = resp?.data || {};
  const newAccess  = data.accessToken  || data.AccessToken;
  const newRefresh = data.refreshToken || data.RefreshToken;
  if (!newAccess) throw new Error(data.error || 'REFRESH_FAILED');
  localStorage.setItem('1rad_token', newAccess);
  if (newRefresh) localStorage.setItem('1rad_refresh_token', newRefresh);
  return newAccess;
}

// Registration-stage routes authenticate with the short-lived INITIATION token
// minted by OTP verify — never with a (possibly stale) login session token. A
// leftover expired 1rad_token from an old session must not shadow it, or the
// signup flow 401s and the user gets bounced off the registration form.
const REGISTRATION_ROUTES = ['/auth/identity-setup', '/auth/deploy-infrastructure'];

// Interceptor to add Authorization header
apiClient.interceptors.request.use((config) => {
  // Do not add auth header for public authentication routes
  const isPublicRoute = PUBLIC_AUTH_ROUTES.some(route => config.url.includes(route));

  if (!isPublicRoute) {
    const isRegistrationRoute = REGISTRATION_ROUTES.some(route => config.url.includes(route));
    // Auth tokens migrated from sessionStorage to localStorage (one session
    // per browser, survives tab restarts). We still read sessionStorage as a
    // one-time fallback so an in-flight tab can finish its request after the
    // deploy without an unsolicited 401.
    const token = isRegistrationRoute
      ? (localStorage.getItem('1rad_initiation_token')
        || sessionStorage.getItem('1rad_initiation_token')
        || localStorage.getItem('1rad_token')
        || sessionStorage.getItem('1rad_token'))
      : (localStorage.getItem('1rad_token')
        || localStorage.getItem('1rad_initiation_token')
        || sessionStorage.getItem('1rad_token')
        || sessionStorage.getItem('1rad_initiation_token'));
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
  async (error) => {
    const original = error.config || {};
    const status   = error.response?.status;
    const url      = original.url || '';
    const code     = error.response?.data?.code;
    // Registration-stage routes count as auth routes here: a 401 on them must
    // surface to the signup form (e.g. "verification expired — resend the
    // code"), NEVER trigger a token refresh or forceLogout — that wiped the
    // in-flight initiation token and killed the registration.
    const isAuthRoute = PUBLIC_AUTH_ROUTES.some(route => url.includes(route))
      || REGISTRATION_ROUTES.some(route => url.includes(route));

    if (status === 401 && !isAuthRoute && !original._retry) {
      // A deliberately revoked session can't be refreshed — sign out cleanly.
      if (code === 'SESSION_REVOKED') {
        forceLogout('signed-out-elsewhere');
        try { dispatchApiError(error); } catch { /* never let UX break the flow */ }
        return Promise.reject(error);
      }

      // Otherwise the access token has merely expired. Try a silent refresh and
      // replay the original request. This is what keeps a user working through
      // long sessions and reconnects without being bounced to /login.
      if (localStorage.getItem('1rad_refresh_token')) {
        original._retry = true;
        try {
          let newToken;
          if (isRefreshing) {
            // A refresh is already in flight — wait for its result.
            newToken = await queueWaiter();
          } else {
            isRefreshing = true;
            try {
              newToken = await performTokenRefresh();
              flushWaiters(null, newToken);
            } catch (refreshErr) {
              flushWaiters(refreshErr, null);
              throw refreshErr;
            } finally {
              isRefreshing = false;
            }
          }
          original.headers = original.headers || {};
          original.headers.Authorization = `Bearer ${newToken}`;
          return apiClient(original);
        } catch {
          // Refresh itself failed (refresh token expired/revoked, or offline) —
          // only NOW is the session genuinely unrecoverable.
          forceLogout(code === 'MISSING_SID' ? 'session-upgraded' : 'session-expired');
          try { dispatchApiError(error); } catch { /* swallow */ }
          return Promise.reject(error);
        }
      }

      // No refresh token at all (legacy session) — fall back to logout.
      forceLogout(code === 'MISSING_SID' ? 'session-upgraded' : 'session-expired');
    } else if (status === 401 && url.includes('/auth/login')) {
      console.warn('[API] Login failed: Invalid credentials.');
    } else if (status === 402) {
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
