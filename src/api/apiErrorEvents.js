/**
 * apiErrorEvents — central place that turns an Axios error into a user-friendly
 * notification payload and dispatches a window event for the ApiErrorToast
 * component to render. Decoupling apiClient.js from the toast UI keeps the
 * interceptor lean and lets any caller suppress toasts on a per-request basis
 * (`config.suppressErrorToast = true`).
 *
 * Toast payload shape:
 *   { id, title, message, severity, errorCode, correlationId, errors?, action? }
 *      severity:    'error' | 'warning' | 'info'
 *      errorCode:   the API errorCode if present (e.g. 'DB_CONSTRAINT_ERROR')
 *      correlationId: short server reference for support
 *      errors:      validation per-field errors if errorCode === 'VALIDATION_ERROR'
 *      action:      optional { label, onClick } for a single CTA in the toast
 */

const EVENT_NAME = '1rad:api-error';

/** Map known API errorCodes / status codes → display copy. */
function buildDisplay(errorCode, status, rawMessage) {
  // Specific errorCodes from the new structured API error pipeline
  switch (errorCode) {
    case 'VALIDATION_ERROR':
      return {
        title: 'Please check the highlighted fields',
        message: rawMessage || 'One or more values are missing or invalid.',
        severity: 'warning',
      };
    case 'MALFORMED_REQUEST':
      return {
        title: 'Request could not be processed',
        message: 'The request was rejected by the server. Please refresh the page and try again.',
        severity: 'error',
      };
    case 'ARGUMENT_NULL':
    case 'ARGUMENT_INVALID':
      return {
        title: 'Invalid input',
        message: rawMessage || 'One or more required values are missing or invalid.',
        severity: 'warning',
      };
    case 'DB_CONSTRAINT_ERROR':
      return {
        title: 'Couldn’t save changes',
        message: rawMessage || 'The change conflicts with existing data.',
        severity: 'warning',
      };
    case 'DB_CONCURRENCY_CONFLICT':
      return {
        title: 'Someone else changed this record',
        message: 'Please reload and apply your changes again so we don’t overwrite their work.',
        severity: 'warning',
      };
    case 'FORBIDDEN':
      return {
        title: 'Access denied',
        message: rawMessage || 'You don’t have permission for this action.',
        severity: 'warning',
      };
    case 'CONFIG_MISSING':
      return {
        title: 'Service is being configured',
        message: 'The system isn’t ready yet. Please try again in a moment, or contact support if this persists.',
        severity: 'error',
      };
    case 'UPSTREAM_FAILURE':
      return {
        title: 'External service unavailable',
        message: 'A dependent service can’t be reached right now. Please retry shortly.',
        severity: 'warning',
      };
    case 'UPSTREAM_TIMEOUT':
      return {
        title: 'Service is taking too long',
        message: 'The request timed out. Please retry shortly.',
        severity: 'warning',
      };
    case 'PASSWORD_NOT_SET':
      return {
        title: 'Account setup incomplete',
        message: 'Please finish identity setup before signing in.',
        severity: 'warning',
      };
    case 'INVALID_CREDENTIALS':
      return {
        title: 'Sign-in failed',
        message: 'The email/mobile or password is incorrect.',
        severity: 'warning',
      };
    case 'ACCOUNT_INACTIVE':
      return {
        title: 'Account inactive',
        message: rawMessage || 'Your account isn’t active. Please contact your administrator.',
        severity: 'warning',
      };
  }

  // Status-code fallbacks (no errorCode or unknown)
  if (status === 0 || status === undefined) {
    return {
      title: 'Connection issue',
      message: 'Could not reach the server. Check your network and try again.',
      severity: 'error',
    };
  }
  if (status === 401) {
    return {
      title: 'Session expired',
      message: 'Please sign in again.',
      severity: 'warning',
    };
  }
  if (status === 403) {
    return {
      title: 'Access denied',
      message: rawMessage || 'You don’t have permission for this action.',
      severity: 'warning',
    };
  }
  if (status === 404) {
    return {
      title: 'Not found',
      message: rawMessage || 'The requested record was not found.',
      severity: 'warning',
    };
  }
  if (status === 408 || status === 504) {
    return {
      title: 'Service is taking too long',
      message: 'The request timed out. Please retry shortly.',
      severity: 'warning',
    };
  }
  if (status === 429) {
    return {
      title: 'Too many requests',
      message: 'Please wait a moment before trying again.',
      severity: 'warning',
    };
  }
  if (status >= 500) {
    return {
      title: 'Something went wrong',
      message: 'An unexpected error occurred. Our team has been notified.',
      severity: 'error',
    };
  }
  if (status >= 400) {
    return {
      title: 'Request failed',
      message: rawMessage || 'The request could not be completed.',
      severity: 'warning',
    };
  }

  return {
    title: 'Unexpected error',
    message: rawMessage || 'Something didn’t work as expected.',
    severity: 'error',
  };
}

/** Decide whether this error should be shown as a toast at all. */
function shouldSuppressToast(axiosError, errorCode, status) {
  // Per-request opt-out
  if (axiosError.config?.suppressErrorToast) return true;

  const url = axiosError.config?.url || '';

  // Login form has its own inline error display — don't double-show
  if (status === 401 && url.includes('/auth/login')) return true;
  if (status === 401 && url.includes('/auth/refresh')) return true; // silent rotation

  // OTP / forgot-password screens show inline errors
  if (status === 401 && (url.includes('/auth/otp') || url.includes('/auth/forgot') ||
                         url.includes('/auth/verify-reset'))) return true;

  // Validation errors usually have per-field UI — caller should opt-in if no inline handler
  if (errorCode === 'VALIDATION_ERROR') return true;

  // 402 subscription is handled by a dedicated locking modal elsewhere
  if (status === 402) return true;

  // Cancelled / aborted requests aren't real errors to the user
  if (axiosError.code === 'ERR_CANCELED' || axiosError.name === 'CanceledError') return true;

  return false;
}

/**
 * Normalize an Axios error into the toast payload and dispatch it.
 * Returns the dispatched payload (or null if suppressed) so callers can
 * inspect what happened.
 */
export function dispatchApiError(axiosError) {
  const status = axiosError.response?.status;
  const data = axiosError.response?.data || {};
  const errorCode = data.errorCode || null;
  const correlationId = data.correlationId || axiosError.response?.headers?.['x-correlation-id'] || null;
  const rawMessage = data.message || data.error || axiosError.message;

  if (shouldSuppressToast(axiosError, errorCode, status)) {
    return null;
  }

  const display = buildDisplay(errorCode, status, rawMessage);
  const payload = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title: display.title,
    message: display.message,
    severity: display.severity,
    errorCode,
    correlationId,
    errors: data.errors || null,
    status,
  };

  window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: payload }));
  return payload;
}

/** Manual dispatch helper for non-Axios errors (e.g. WebSocket failures). */
export function emitApiError({ title, message, severity = 'error', correlationId = null, errorCode = null }) {
  const payload = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title, message, severity, correlationId, errorCode, errors: null, status: null,
  };
  window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: payload }));
  return payload;
}

/** Subscribe to error events. Returns an unsubscribe function. */
export function onApiError(handler) {
  const wrapped = (e) => handler(e.detail);
  window.addEventListener(EVENT_NAME, wrapped);
  return () => window.removeEventListener(EVENT_NAME, wrapped);
}

export const API_ERROR_EVENT = EVENT_NAME;
