// Global imperative toast — drop-in replacement for window.alert().
//
// Usage:
//   import { notifyToast } from '@/utils/toast';
//   notifyToast('Saved');                      // success (default tone)
//   notifyToast('Could not save', 'error');
//   notifyToast('Heads up', 'warning');
//   notifyToast('FYI', 'info');
//
// Why imperative (DOM-direct) instead of a React Provider:
//   • Works from non-React modules (utils, axios interceptors, sync engine).
//   • No need to thread a notify prop through every component.
//   • The previous code used window.alert() from anywhere, so we want the
//     same calling ergonomics without the modal blocking and ugly chrome.
//
// Container is created lazily on the first call so the bundle has no
// side-effects at import time. All styling lives in inline `style.cssText`
// so the utility doesn't depend on a global stylesheet shipping first.

const CONTAINER_ID = '__app_toasts__';
const TONE = {
  success: { bg: '#ecfdf5', border: '#a7f3d0', color: '#047857', icon: '✓' },
  error:   { bg: '#fef2f2', border: '#fecaca', color: '#b91c1c', icon: '✕' },
  warning: { bg: '#fffbeb', border: '#fde68a', color: '#b45309', icon: '⚠' },
  info:    { bg: '#eff6ff', border: '#bfdbfe', color: '#1e40af', icon: 'ℹ' },
};

function ensureContainer() {
  if (typeof document === 'undefined') return null;
  let container = document.getElementById(CONTAINER_ID);
  if (container) return container;
  container = document.createElement('div');
  container.id = CONTAINER_ID;
  container.setAttribute('role', 'status');
  container.setAttribute('aria-live', 'polite');
  container.style.cssText = [
    'position:fixed',
    'top:24px',
    'right:24px',
    'z-index:99999',
    'display:flex',
    'flex-direction:column',
    'gap:10px',
    'pointer-events:none',
    "font-family:Inter,'Segoe UI',system-ui,sans-serif",
    'max-width:420px',
  ].join(';');
  document.body.appendChild(container);

  // One-time keyframes injection so the slide-in animation works without
  // requiring the global stylesheet to have been parsed.
  if (!document.getElementById('__app_toasts_keyframes__')) {
    const style = document.createElement('style');
    style.id = '__app_toasts_keyframes__';
    style.textContent = `
      @keyframes appToastIn  { from { transform: translateX(24px); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
      @keyframes appToastOut { from { transform: translateX(0); opacity: 1; } to { transform: translateX(24px); opacity: 0; } }
    `;
    document.head.appendChild(style);
  }
  return container;
}

function escapeHtml(value) {
  if (value == null) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Show a toast.
 * @param {string|object} message - String or { title, message } shape.
 * @param {'success'|'error'|'warning'|'info'} [type='info']
 * @param {{ duration?: number }} [options]
 */
export function notifyToast(message, type = 'info', options = {}) {
  const container = ensureContainer();
  if (!container) {
    // SSR or non-browser env — fall back to console so callers don't lose
    // the message entirely.
    console.log(`[TOAST ${type}]`, message);
    return;
  }
  const tone = TONE[type] || TONE.info;
  const duration = Math.max(1500, Number(options.duration) || 4000);

  // Accept either a string or { title, message } so callers that have a
  // structured payload don't need to flatten it first.
  let titleText = '';
  let bodyText  = '';
  if (message && typeof message === 'object' && !Array.isArray(message)) {
    titleText = message.title ? String(message.title) : '';
    bodyText  = message.message ? String(message.message) : (message.body ? String(message.body) : '');
  } else {
    bodyText = String(message ?? '');
  }

  const toast = document.createElement('div');
  toast.style.cssText = [
    `background:${tone.bg}`,
    `border:1px solid ${tone.border}`,
    `color:${tone.color}`,
    'padding:12px 16px',
    'border-radius:12px',
    'box-shadow:0 10px 25px -8px rgba(15,23,42,0.18)',
    'pointer-events:auto',
    'display:flex',
    'align-items:flex-start',
    'gap:10px',
    'min-width:280px',
    'font-size:13px',
    'font-weight:700',
    'line-height:1.4',
    'animation:appToastIn 0.22s ease-out',
  ].join(';');

  toast.innerHTML = `
    <span style="flex-shrink:0;font-size:15px;font-weight:900;line-height:1.3">${tone.icon}</span>
    <div style="flex:1;min-width:0">
      ${titleText ? `<div style="font-weight:900;letter-spacing:0.2px;margin-bottom:2px">${escapeHtml(titleText)}</div>` : ''}
      <div style="font-weight:${titleText ? 600 : 700};word-break:break-word">${escapeHtml(bodyText)}</div>
    </div>
    <button type="button" aria-label="Dismiss" style="flex-shrink:0;background:transparent;border:none;color:inherit;opacity:0.6;cursor:pointer;font-size:14px;font-weight:900;padding:0 2px;line-height:1">×</button>
  `;

  const remove = () => {
    if (!toast.isConnected) return;
    toast.style.animation = 'appToastOut 0.18s ease-in forwards';
    setTimeout(() => toast.remove(), 200);
  };

  toast.querySelector('button').addEventListener('click', remove);
  container.appendChild(toast);
  setTimeout(remove, duration);
}

// Convenience helpers — keep call sites short and intent-clear.
export const toastSuccess = (msg, opts) => notifyToast(msg, 'success', opts);
export const toastError   = (msg, opts) => notifyToast(msg, 'error',   opts);
export const toastWarning = (msg, opts) => notifyToast(msg, 'warning', opts);
export const toastInfo    = (msg, opts) => notifyToast(msg, 'info',    opts);
