import { createContext, useContext, useEffect, useState, useCallback, useMemo, useRef } from 'react';
import apiClient from '../../api/apiClient';
import useAuth from '../../auth/useAuth';
import { formatElapsed } from '../../utils/timeTracking';

// Single source of truth for the >3h on-premises alert.
//
// Why a context rather than each board calling /appointments/overdue itself:
//   • One poll loop, four consumers (bell, every board's row-pulse decorator).
//   • The threshold lives server-side; clients pull it back in the response so
//     UI never drifts out of sync with appsettings.json.
//   • Holds the desktop-notification dedupe set so a single newly-overdue
//     patient produces exactly ONE OS notification, not one every 30s.
//
// Polling cadence:
//   30s — matches the existing worklist polls so we don't double the load on
//   the API and the bell stays roughly in sync with what's on screen. The
//   server-side filtered index makes this query cheap.

const OverdueContext = createContext({
  overdue: [],
  unacknowledged: [],
  acknowledged: [],
  thresholdMinutes: 180,
  loading: false,
  isOverdue: () => false,        // true only for UNacknowledged overdue
  isAcknowledged: () => false,
  acknowledge: async () => {},
  refresh: () => {},
  notificationPermission: 'default',
  requestNotificationPermission: async () => 'default',
});

const POLL_INTERVAL_MS = 30_000;

// Browser Notification helpers wrapped so the SSR/non-browser path no-ops.
const hasNotificationAPI = typeof window !== 'undefined'
  && 'Notification' in window;

function fireDesktopNotification(item) {
  if (!hasNotificationAPI || Notification.permission !== 'granted') return;
  try {
    const n = new Notification('Overdue patient on premises', {
      body: `${item.patientName} (${item.displayId}) — ${formatElapsed(item.arrivedAt)}`,
      tag: `overdue-${item.appointmentId}`, // dedupes if browser auto-collapses
      requireInteraction: false,
    });
    n.onclick = () => {
      window.focus();
      // Send the user to the appointment board scoped to this case. The
      // ?focus= query param is consumed by AppointmentBoard's deep-link
      // handler (same param the bell dropdown uses).
      window.location.href = `/appointments?focus=${item.appointmentId}`;
      n.close();
    };
  } catch (err) {
    // Notification constructor can throw in some embedded contexts.
    console.warn('[OverdueProvider] desktop notification failed', err);
  }
}

export function OverdueProvider({ children }) {
  const { currentUser } = useAuth();
  const [overdue, setOverdue] = useState([]);
  const [thresholdMinutes, setThresholdMinutes] = useState(180);
  const [loading, setLoading] = useState(false);
  const [notificationPermission, setNotificationPermission] = useState(
    hasNotificationAPI ? Notification.permission : 'unsupported'
  );

  // Session-scoped dedupe: appointmentIds we've already fired a desktop
  // notification for during this tab's lifetime. Survives across polls so a
  // patient who's been overdue for an hour doesn't fire 120 notifications.
  // Cleared on full page reload (acceptable — user just navigated in).
  const notifiedRef = useRef(new Set());

  const fetchOverdue = useCallback(async () => {
    if (!currentUser) return;
    setLoading(true);
    try {
      const res = await apiClient.get('/appointments/overdue');
      const items = res?.data?.items ?? [];
      const threshold = typeof res?.data?.thresholdMinutes === 'number'
        ? res.data.thresholdMinutes
        : 180;

      // Desktop notification diff — fire once per NEW unacknowledged overdue.
      // We diff against notifiedRef rather than previous-overdue state so even
      // a slow first poll (component just mounted) only fires once per id.
      if (hasNotificationAPI && Notification.permission === 'granted') {
        for (const item of items) {
          if (item.acknowledgedAt) continue;
          if (notifiedRef.current.has(item.appointmentId)) continue;
          fireDesktopNotification(item);
          notifiedRef.current.add(item.appointmentId);
        }
      }

      // Clean up the dedupe set: if a previously-notified patient is no
      // longer overdue (delivered, cancelled, or acked-then-delivered), drop
      // them so the next overdue episode (rare) would re-notify.
      const stillOverdue = new Set(items.map(i => i.appointmentId));
      for (const id of notifiedRef.current) {
        if (!stillOverdue.has(id)) notifiedRef.current.delete(id);
      }

      setOverdue(items);
      setThresholdMinutes(threshold);
    } catch (err) {
      console.warn('[OverdueProvider] poll failed', err?.message || err);
    } finally {
      setLoading(false);
    }
  }, [currentUser]);

  useEffect(() => {
    if (!currentUser) {
      setOverdue([]);
      notifiedRef.current.clear();
      return;
    }
    fetchOverdue();
    const id = setInterval(fetchOverdue, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [currentUser, fetchOverdue]);

  // O(1) lookups so per-row decorators don't scan the whole array on every
  // render. Two separate sets so a row can answer "is this overdue AND
  // unacked" vs "is this just acked" without re-walking the array.
  const unacknowledgedIdSet = useMemo(
    () => new Set(overdue.filter(o => !o.acknowledgedAt).map(o => o.appointmentId)),
    [overdue]
  );
  const acknowledgedIdSet = useMemo(
    () => new Set(overdue.filter(o =>  o.acknowledgedAt).map(o => o.appointmentId)),
    [overdue]
  );
  const isOverdue       = useCallback((id) => unacknowledgedIdSet.has(id), [unacknowledgedIdSet]);
  const isAcknowledged  = useCallback((id) => acknowledgedIdSet.has(id),   [acknowledgedIdSet]);

  const unacknowledged = useMemo(() => overdue.filter(o => !o.acknowledgedAt), [overdue]);
  const acknowledged   = useMemo(() => overdue.filter(o =>  o.acknowledgedAt), [overdue]);

  // Toggle ack state for a specific appointment. Optimistically updates the
  // local state so the bell + row pulse react instantly; the next poll
  // confirms. On failure we still let the next poll correct things, but log.
  const acknowledge = useCallback(async (appointmentId, acknowledged = true) => {
    setOverdue(prev => prev.map(o => o.appointmentId === appointmentId
      ? { ...o, acknowledgedAt: acknowledged ? (o.acknowledgedAt || new Date().toISOString()) : null }
      : o));
    try {
      await apiClient.post(`/appointments/${appointmentId}/overdue-ack`, { acknowledged });
    } catch (err) {
      console.warn('[OverdueProvider] ack failed', err?.message || err);
      // Force a refresh so the UI re-syncs with the server's actual state.
      fetchOverdue();
    }
  }, [fetchOverdue]);

  const requestNotificationPermission = useCallback(async () => {
    if (!hasNotificationAPI) return 'unsupported';
    try {
      const result = await Notification.requestPermission();
      setNotificationPermission(result);
      return result;
    } catch (err) {
      console.warn('[OverdueProvider] permission request failed', err);
      return 'default';
    }
  }, []);

  const value = useMemo(() => ({
    overdue,
    unacknowledged,
    acknowledged,
    thresholdMinutes,
    loading,
    isOverdue,
    isAcknowledged,
    acknowledge,
    refresh: fetchOverdue,
    notificationPermission,
    requestNotificationPermission,
  }), [overdue, unacknowledged, acknowledged, thresholdMinutes, loading,
       isOverdue, isAcknowledged, acknowledge, fetchOverdue,
       notificationPermission, requestNotificationPermission]);

  return <OverdueContext.Provider value={value}>{children}</OverdueContext.Provider>;
}

export function useOverdue() {
  return useContext(OverdueContext);
}
