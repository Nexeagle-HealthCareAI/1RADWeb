import { useEffect, useState, useCallback } from 'react';
import apiClient from '../api/apiClient';
import SettingsSubPageHeader from '../components/SettingsSubPageHeader';
import { notifyToast } from '../utils/toast';
import '../styles/global.css';

// Settings → Active Sessions. Lists every active session for the signed-in
// user across all three device categories, with a "This device" badge on
// the row matching the JWT we're currently using. Sign-out actions are
// surgical (one row) or bulk ("Sign out everywhere else") — both go to the
// authenticated DELETE endpoints; the server flips the cache + DB.

const CATEGORY_LABELS = {
  DESKTOP: 'Desktop',
  MOBILE:  'Mobile',
  TABLET:  'Tablet',
  UNKNOWN: 'Other device',
};
const CATEGORY_ICONS = {
  DESKTOP: '🖥️',
  MOBILE:  '📱',
  TABLET:  '📲',
  UNKNOWN: '🔓',
};

export default function ActiveSessionsPage() {
  const [sessions, setSessions] = useState([]);
  const [currentSessionId, setCurrentSessionId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.get('/me/sessions');
      setSessions(res?.data?.sessions || []);
      setCurrentSessionId(res?.data?.currentSessionId || null);
    } catch (err) {
      setError(err?.response?.data?.error || 'Could not load your sessions. Please try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const revokeOne = async (sessionId) => {
    if (!sessionId) return;
    setBusyId(sessionId);
    try {
      await apiClient.delete(`/me/sessions/${sessionId}`);
      // Optimistically remove from list; the next load() reconciles.
      setSessions(prev => prev.filter(s => s.sessionId !== sessionId));
    } catch (err) {
      notifyToast(err?.response?.data?.error || 'Could not sign out that session.', 'error');
    } finally {
      setBusyId(null);
    }
  };

  const revokeOthers = async () => {
    if (!currentSessionId) return;
    const others = sessions.filter(s => s.sessionId !== currentSessionId).length;
    if (others === 0) return;
    if (!confirm(`Sign out from ${others} other ${others === 1 ? 'device' : 'devices'}? You'll stay signed in here.`)) return;
    setBulkBusy(true);
    try {
      await apiClient.delete('/me/sessions');
      await load();
    } catch (err) {
      notifyToast(err?.response?.data?.error || 'Could not sign out the other sessions.', 'error');
    } finally {
      setBulkBusy(false);
    }
  };

  const otherCount = sessions.filter(s => s.sessionId !== currentSessionId).length;

  return (
    <div style={{ padding: '24px 20px', maxWidth: '780px', margin: '0 auto' }}>
      <SettingsSubPageHeader
        title="Active sessions"
        description="Each device type (desktop, mobile, tablet) can have one active sign-in. Signing in on a new device of the same type ends the previous one."
      />

      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        marginBottom: '14px', flexWrap: 'wrap', gap: '10px',
      }}>
        <div style={{ fontSize: '11px', fontWeight: 800, color: '#475569', letterSpacing: '1px', textTransform: 'uppercase' }}>
          {loading ? 'Loading…' : `${sessions.length} active session${sessions.length === 1 ? '' : 's'}`}
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={load}
            disabled={loading}
            style={{
              fontSize: '11px', fontWeight: 800, letterSpacing: '0.4px',
              background: 'white', color: '#475569',
              border: '1px solid #cbd5e1', borderRadius: '8px',
              padding: '8px 12px', cursor: loading ? 'wait' : 'pointer',
            }}
          >Refresh</button>
          <button
            onClick={revokeOthers}
            disabled={bulkBusy || otherCount === 0}
            style={{
              fontSize: '11px', fontWeight: 900, letterSpacing: '0.5px',
              background: otherCount === 0 ? '#f1f5f9' : '#dc2626',
              color: otherCount === 0 ? '#94a3b8' : 'white',
              border: 'none', borderRadius: '8px',
              padding: '8px 14px', cursor: bulkBusy || otherCount === 0 ? 'not-allowed' : 'pointer',
              boxShadow: otherCount === 0 ? 'none' : '0 2px 8px rgba(220,38,38,0.25)',
            }}
          >
            {bulkBusy ? 'Signing out…' : `Sign out ${otherCount} other${otherCount === 1 ? '' : 's'}`}
          </button>
        </div>
      </div>

      {error && (
        <div role="alert" style={{
          background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b',
          borderRadius: '10px', padding: '12px 14px', marginBottom: '12px',
          fontSize: '13px', fontWeight: 700,
        }}>⚠️ {error}</div>
      )}

      {!loading && sessions.length === 0 && (
        <div style={{ padding: '32px 20px', textAlign: 'center', background: 'white', border: '1px dashed #cbd5e1', borderRadius: '12px', color: '#64748b', fontSize: '13px' }}>
          No active sessions.
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {sessions.map(s => {
          const isCurrent = s.sessionId === currentSessionId;
          const lastSeen = parseUtc(s.lastSeenAt);
          const created  = parseUtc(s.createdAt);
          return (
            <div key={s.sessionId} style={{
              background: 'white',
              border: isCurrent ? '1px solid #93c5fd' : '1px solid #e2e8f0',
              boxShadow: isCurrent ? '0 0 0 3px rgba(59,130,246,0.12)' : '0 1px 2px rgba(15,23,42,0.04)',
              borderRadius: '14px',
              padding: '14px 16px',
              display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap',
            }}>
              <div style={{
                width: '46px', height: '46px', borderRadius: '12px',
                background: isCurrent ? '#dbeafe' : '#f1f5f9',
                color: isCurrent ? '#1d4ed8' : '#475569',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '20px', flexShrink: 0,
              }}>{CATEGORY_ICONS[s.deviceCategory] || CATEGORY_ICONS.UNKNOWN}</div>

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '14px', fontWeight: 800, color: '#0f172a' }}>
                    {s.deviceName || CATEGORY_LABELS[s.deviceCategory] || 'Unknown device'}
                  </span>
                  <span style={{ fontSize: '9px', fontWeight: 950, letterSpacing: '0.6px', color: '#475569', background: '#f1f5f9', padding: '2px 6px', borderRadius: '999px' }}>
                    {CATEGORY_LABELS[s.deviceCategory] || 'OTHER'}
                  </span>
                  {isCurrent && (
                    <span style={{ fontSize: '9px', fontWeight: 950, letterSpacing: '0.8px', color: 'white', background: '#0f52ba', padding: '3px 8px', borderRadius: '999px' }}>
                      THIS DEVICE
                    </span>
                  )}
                </div>
                <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px', fontWeight: 600, display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                  {s.ipAddress && <span title="IP at sign-in">📍 {s.ipAddress}</span>}
                  {created && <span title={`Signed in at ${fmtIst(created)}`}>🕐 Signed in {fmtIst(created)}</span>}
                  {lastSeen && <span title="Last activity">⏱ Last seen {timeAgo(lastSeen)}</span>}
                </div>
              </div>

              {!isCurrent && (
                <button
                  onClick={() => revokeOne(s.sessionId)}
                  disabled={busyId === s.sessionId}
                  style={{
                    fontSize: '11px', fontWeight: 900, letterSpacing: '0.5px',
                    background: 'white', color: '#dc2626',
                    border: '1px solid #fecaca', borderRadius: '8px',
                    padding: '8px 12px', cursor: busyId === s.sessionId ? 'wait' : 'pointer',
                  }}
                >
                  {busyId === s.sessionId ? 'Ending…' : 'Sign out'}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// EF Core / System.Text.Json returns DateTimes with Kind=Unspecified, which
// strips the trailing 'Z' in the JSON. new Date() then interprets the string
// as LOCAL time and the displayed clock is wrong by the IST offset. Detect
// the missing zone designator and append 'Z' so the browser parses as UTC.
function parseUtc(iso) {
  if (!iso) return null;
  const hasTz = /[zZ]|[+-]\d{2}:?\d{2}$/.test(iso);
  const d = new Date(hasTz ? iso : iso + 'Z');
  return Number.isNaN(d.getTime()) ? null : d;
}

// Always render in Asia/Kolkata so the displayed clock matches the rest of
// the app regardless of the browser's locale (which a patient/staff phone
// may have set to anything).
function fmtIst(date) {
  return date.toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: true,
  }) + ' IST';
}

function timeAgo(date) {
  const sec = Math.max(1, Math.floor((Date.now() - date.getTime()) / 1000));
  if (sec < 60)    return `${sec}s ago`;
  if (sec < 3600)  return `${Math.floor(sec / 60)}m ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
  return `${Math.floor(sec / 86400)}d ago`;
}
