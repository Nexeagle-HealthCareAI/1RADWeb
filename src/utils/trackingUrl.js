import apiClient from '../api/apiClient';

// Builds the public /track URL with a signed token for an appointment.
//
// The token is minted server-side by the authenticated user generating the
// QR (radiologist printing a prescription, receptionist printing a booking
// slip, etc.). On the patient phone the QR opens /track/{id}?token=... and
// StatusTracking forwards the token to the public endpoint, where it's
// verified before any data is returned.
//
// We cache tokens in-memory per session — the same appointmentId may have
// its QR rendered multiple times in one session (preview modal, save-as-pdf,
// print) and re-issuing each time would round-trip the API for no gain.

const tokenCache = new Map(); // appointmentId → { token, fetchedAt }
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes — well below the 1-year token TTL

export async function getTrackingUrl(appointmentId) {
  if (!appointmentId) return null;
  const base = `${window.location.origin}/track/${appointmentId}`;
  try {
    const cached = tokenCache.get(appointmentId);
    if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
      return `${base}?token=${encodeURIComponent(cached.token)}`;
    }
    const res = await apiClient.get(`/appointments/${appointmentId}/tracking-token`);
    const token = res?.data?.token;
    if (!token) {
      // The endpoint reachable but didn't give us a token — fall back to the
      // tokenless URL so the QR still renders. The public endpoint will
      // reject it, but the UX is "show something" rather than blank QR.
      return base;
    }
    tokenCache.set(appointmentId, { token, fetchedAt: Date.now() });
    return `${base}?token=${encodeURIComponent(token)}`;
  } catch (err) {
    console.warn('[trackingUrl] token issue failed', err?.message || err);
    // Fall back to the tokenless URL — same reasoning as above.
    return base;
  }
}

// Drop a cached token (e.g. after a session change or hospital switch).
export function clearTrackingUrlCache(appointmentId) {
  if (appointmentId) tokenCache.delete(appointmentId);
  else tokenCache.clear();
}
