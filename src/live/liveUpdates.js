// Live updates (Oct 2026): the API pushes "something changed" instead of every screen
// polling. One SignalR connection per tab to /api/v1/live; the server sends
// changed(["appointments", "approvals", "finance", "reports", "patients", "studies"])
// for this centre and we turn each topic into the window event the screens already
// listen to (or a new 1rad:live:* event). Only topic names travel on this channel.
//
// While connected, the screens' polling stretches to a 5-minute safety net
// (liveAwareInterval). If WebSockets are blocked or the connection drops, everything
// polls exactly as before.
import * as signalR from '@microsoft/signalr';
import { BASE_URL } from '../api/apiClient';
import { notifyFinanceChanged } from '../hooks/useFinanceRevision';

export const LIVE_STATUS_EVENT = '1rad:live:status';
export const LIVE_EVENTS = {
  appointments: '1rad:live:appointments',
  approvals: '1rad_approvals_changed',   // the Sidebar badge's existing event
  reports: '1rad:live:reports',
  patients: '1rad:live:patients',
  studies: '1rad:live:studies',
};
const SAFETY_NET_MS = 5 * 60_000;

let connection = null;
let connected = false;
let stopped = true;
let retryTimer = null;

export const isLiveConnected = () => connected;

function setConnected(value) {
  if (connected === value) return;
  connected = value;
  try { window.dispatchEvent(new CustomEvent(LIVE_STATUS_EVENT, { detail: { connected: value } })); } catch { /* noop */ }
}

function emit(topic) {
  if (topic === 'finance') { notifyFinanceChanged(); return; }
  const name = LIVE_EVENTS[topic];
  if (name) { try { window.dispatchEvent(new Event(name)); } catch { /* noop */ } }
}

const readToken = () => {
  try { return localStorage.getItem('1rad_token') || ''; } catch { return ''; }
};

async function connect() {
  if (stopped || !connection) return;
  try {
    await connection.start();
    setConnected(true);
  } catch (err) {
    setConnected(false);
    console.info('[live] not connected (screens keep polling):', err?.message || err);
    clearTimeout(retryTimer);
    retryTimer = setTimeout(connect, 60_000);
  }
}

export function startLiveUpdates() {
  if (connection || !BASE_URL || !readToken()) return;
  stopped = false;
  connection = new signalR.HubConnectionBuilder()
    .withUrl(`${BASE_URL.replace(/\/+$/, '')}/live`, {
      accessTokenFactory: readToken,
      // WebSockets only, no negotiate round-trip: works behind several API instances
      // without sticky sessions. Where WebSockets are blocked we simply keep polling.
      skipNegotiation: true,
      transport: signalR.HttpTransportType.WebSockets,
    })
    .withAutomaticReconnect({
      nextRetryDelayInMilliseconds: (ctx) => Math.min(30_000, 1000 * 2 ** Math.min(ctx.previousRetryCount, 5)),
    })
    .configureLogging(signalR.LogLevel.Warning)
    .build();

  connection.on('changed', (topics) => { (Array.isArray(topics) ? topics : []).forEach(emit); });
  connection.onreconnecting(() => setConnected(false));
  connection.onreconnected(() => {
    setConnected(true);
    // Anything may have changed while we were away.
    ['appointments', 'approvals', 'finance', 'reports', 'patients', 'studies'].forEach(emit);
  });
  connection.onclose(() => {
    setConnected(false);
    if (!stopped) { clearTimeout(retryTimer); retryTimer = setTimeout(connect, 60_000); }
  });
  connect();
}

export async function stopLiveUpdates() {
  stopped = true;
  clearTimeout(retryTimer);
  const c = connection;
  connection = null;
  setConnected(false);
  if (c) { try { await c.stop(); } catch { /* noop */ } }
}

/**
 * setInterval that backs off while the live channel is up: runs `fn` every
 * `fallbackMs` when not connected, but at most every 5 minutes while connected
 * (live events trigger the real refreshes). Returns a cleanup function.
 */
export function liveAwareInterval(fn, fallbackMs, safetyNetMs = SAFETY_NET_MS) {
  let last = Date.now();
  const id = setInterval(() => {
    if (connected && Date.now() - last < safetyNetMs) return;
    last = Date.now();
    fn();
  }, fallbackMs);
  return () => clearInterval(id);
}

/** Subscribe to one or more live/window events; returns a cleanup function. */
export function onLive(eventNames, handler) {
  const names = Array.isArray(eventNames) ? eventNames : [eventNames];
  names.forEach(n => window.addEventListener(n, handler));
  return () => names.forEach(n => window.removeEventListener(n, handler));
}
