import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './styles/global.css';

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
