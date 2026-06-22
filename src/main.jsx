import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './styles/global.css';

// Secure-context shim: crypto.randomUUID (and SubtleCrypto, SharedArrayBuffer)
// are only available in a "secure context" — HTTPS or localhost. Served over plain
// HTTP on a bare IP, crypto.randomUUID is undefined and the app throws. Provide a
// getRandomValues-based UUIDv4 fallback (getRandomValues IS available on HTTP) so
// the app works until TLS is in place. HTTPS restores the native implementation.
if (typeof crypto !== 'undefined' && typeof crypto.randomUUID !== 'function' && typeof crypto.getRandomValues === 'function') {
  crypto.randomUUID = function randomUUID() {
    const b = crypto.getRandomValues(new Uint8Array(16));
    b[6] = (b[6] & 0x0f) | 0x40; // version 4
    b[8] = (b[8] & 0x3f) | 0x80; // variant
    const h = Array.from(b, (x) => x.toString(16).padStart(2, '0'));
    return `${h[0]}${h[1]}${h[2]}${h[3]}-${h[4]}${h[5]}-${h[6]}${h[7]}-${h[8]}${h[9]}-${h[10]}${h[11]}${h[12]}${h[13]}${h[14]}${h[15]}`;
  };
}

// Register the PWA service worker for offline app-shell + worklist cache.
// autoUpdate is configured in vite.config.js, so this call is fire-and-forget;
// no user prompt mid-report. Service worker is only generated on build, so the
// virtual import is a no-op in dev.
if (import.meta.env.PROD) {
  import('virtual:pwa-register').then(({ registerSW }) => {
    registerSW({ immediate: true });
  }).catch(() => { /* SW unavailable; non-fatal */ });
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>
);
