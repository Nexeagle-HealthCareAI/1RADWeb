// Settings → Sync & Outbox
//
// Surfaces the offline architecture's plumbing so the user (and support
// staff) can see what's happening: queued mutations, poisoned items,
// last successful sync, per-domain freshness, and the last 200 telemetry
// events. Read-only except for "Retry poisoned" / "Discard poisoned"
// actions on the outbox.

import { useEffect, useState, useCallback } from 'react';
import useAuth from '../auth/useAuth';
import useOffline from '../hooks/useOffline';
import { syncNow, syncPushNow, getSyncDebugInfo } from '../sync/SyncEngine';
import { listAll as listOutbox, purgePoisoned, remove as removeOutbox, retryPoisoned, retryOne } from '../db/repos/outboxRepo';
import { tables } from '../db/dexie';
import SettingsSubPageHeader from '../components/SettingsSubPageHeader';
import '../styles/global.css';

function relative(iso) {
  if (!iso) return 'never';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'never';
  const ms = Date.now() - d.getTime();
  if (ms < 60_000) return 'just now';
  const mins = Math.round(ms / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  return `${days}d ago`;
}

function shortType(t) {
  return (t || '').replace(/_/g, ' ').toLowerCase()
    .replace(/\b\w/g, c => c.toUpperCase());
}

export default function SyncStatusPage() {
  const { currentUser } = useAuth();
  const { isOnline, pendingCount, poisonedCount } = useOffline();
  const [debug, setDebug]   = useState(null);
  const [outbox, setOutbox] = useState([]);
  const [telem, setTelem]   = useState([]);
  const [counts, setCounts] = useState({});
  const [busy, setBusy]     = useState(false);
  const [now, setNow]       = useState(Date.now());

  // Tick once a minute so "5m ago" labels roll forward.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);
  // eslint-disable-next-line no-unused-vars
  const _t = now;

  const reload = useCallback(async () => {
    try {
      const [d, o] = await Promise.all([
        getSyncDebugInfo(),
        listOutbox(),
      ]);
      setDebug(d);
      setOutbox(o);
    } catch (err) {
      console.warn('[SyncStatusPage] reload failed', err);
    }
    try {
      const t = await tables.meta().get('telemetry');
      setTelem(Array.isArray(t?.value) ? t.value.slice().reverse() : []);
    } catch (_) { setTelem([]); }
    try {
      const c = {};
      for (const name of [
        'appointments','patients','reports','personnel',
        'invoices','expenses','referrers','referral_commissions',
        'service_charges','outbox',
      ]) {
        c[name] = await tables[name]().count();
      }
      setCounts(c);
    } catch (_) {}
  }, []);

  useEffect(() => { reload(); }, [reload, now]);

  const handleSyncNow = async () => {
    setBusy(true);
    try { await syncNow(); } catch (_) {}
    await reload();
    setBusy(false);
  };

  const handleDiscardPoisoned = async () => {
    if (!confirm('Discard all poisoned (permanently-failed) outbox items? This cannot be undone.')) return;
    setBusy(true);
    await purgePoisoned();
    await reload();
    setBusy(false);
  };

  const handleRemoveOne = async (id) => {
    if (!confirm('Discard this queued item? Any changes it represented will be lost.')) return;
    setBusy(true);
    await removeOutbox(id);
    await reload();
    setBusy(false);
  };

  // Re-arm all permanently-failed items and immediately try to push them.
  const handleRetryPoisoned = async () => {
    setBusy(true);
    await retryPoisoned();
    try { await syncPushNow(); } catch (_) { /* offline — they'll drain on reconnect */ }
    await reload();
    setBusy(false);
  };

  // Re-arm a single failed item and try to push it now.
  const handleRetryOne = async (id) => {
    setBusy(true);
    await retryOne(id);
    try { await syncPushNow(); } catch (_) { /* offline */ }
    await reload();
    setBusy(false);
  };

  const lastPullAt = debug?.lastPullAt;
  const skewSeconds = debug?.skewMs ? Math.round(debug.skewMs / 1000) : 0;
  const tone = !isOnline ? 'crit'
             : pendingCount > 0 ? 'warn'
             : 'ok';
  const toneColor = tone === 'crit' ? '#dc2626' : tone === 'warn' ? '#b45309' : '#16a34a';
  const toneBg    = tone === 'crit' ? '#fef2f2' : tone === 'warn' ? '#fffbeb' : '#f0fdf4';

  if (!currentUser) return null;

  return (
    <div style={{ padding: '24px 28px', maxWidth: '960px', margin: '0 auto', fontFamily: '"Segoe UI", system-ui, sans-serif' }}>
      <SettingsSubPageHeader
        title="Automatic sync"
        description="Your work saves itself. When you are connected, changes upload on their own and the latest information is downloaded for you — there is nothing to manage. This page just shows you what is saved and what is still on its way."
        rightAction={
          <button
            onMouseDown={e => { e.preventDefault(); handleSyncNow(); }}
            disabled={busy || !isOnline}
            style={primaryBtn}
            title={!isOnline ? 'You are offline — changes will save automatically once you reconnect' : 'Check for the latest information and send anything waiting right now'}
          >{busy ? 'Syncing…' : 'Sync now'}</button>
        }
      />

      {/* Headline status card */}
      <div style={{ background: toneBg, border: `1px solid ${toneColor}33`, borderLeft: `4px solid ${toneColor}`, borderRadius: '10px', padding: '14px 18px', marginBottom: '18px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '6px' }}>
          <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: toneColor }} />
          <div style={{ fontSize: '13px', fontWeight: 800, color: toneColor, letterSpacing: '0.3px', textTransform: 'uppercase' }}>
            {!isOnline
              ? 'Offline — your work is saved here'
              : pendingCount > 0
                ? `Saving your changes — ${pendingCount} on the way`
                : 'All saved'}
          </div>
        </div>
        <div style={{ fontSize: '12px', color: '#475569', lineHeight: 1.6 }}>
          Last successful sync: <strong>{relative(lastPullAt)}</strong>
          {lastPullAt && (<span style={{ color: '#94a3b8' }}> · {new Date(lastPullAt).toLocaleString()}</span>)}
          <br />
          Clock skew vs. server: <strong>{skewSeconds > 0 ? `+${skewSeconds}s` : `${skewSeconds}s`}</strong>
          {Math.abs(skewSeconds) > 30 && (
            <span style={{ color: '#b45309', marginLeft: '6px' }}>(may delay delta pulls)</span>
          )}
        </div>
      </div>

      {/* Per-domain row counts */}
      <Section title="What's cached locally">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '8px' }}>
          {Object.entries(counts).filter(([k]) => k !== 'outbox').map(([name, n]) => (
            <div key={name} style={countTile}>
              <div style={{ fontSize: '10px', color: '#64748b', fontWeight: 700, letterSpacing: '0.5px', textTransform: 'uppercase' }}>
                {name.replace(/_/g, ' ')}
              </div>
              <div style={{ fontSize: '18px', fontWeight: 800, color: '#0f172a', marginTop: '2px' }}>
                {n.toLocaleString()}
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* Outbox */}
      <Section
        title={`Changes waiting to save (${outbox.length})`}
        action={poisonedCount > 0 && (
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onMouseDown={e => { e.preventDefault(); handleRetryPoisoned(); }} disabled={busy} style={retryBtn}>
              Try again ({poisonedCount})
            </button>
            <button onMouseDown={e => { e.preventDefault(); handleDiscardPoisoned(); }} disabled={busy} style={dangerBtn}>
              Discard {poisonedCount}
            </button>
          </div>
        )}
      >
        {outbox.length === 0 ? (
          <div style={{ fontSize: '12px', color: '#64748b', padding: '10px 4px' }}>
            Everything is saved. Anything you change while offline waits here and saves itself automatically once you reconnect.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {outbox.map(item => (
              <div key={item.id} style={outboxRow(item.poisoned)}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '12px', fontWeight: 700, color: '#0f172a' }}>
                    {shortType(item.type)}
                    {item.poisoned ? (
                      <span style={{ marginLeft: '8px', fontSize: '10px', fontWeight: 800, color: '#b91c1c', letterSpacing: '0.4px' }}>
                        NEEDS ATTENTION
                      </span>
                    ) : item.attempts > 0 ? (
                      <span style={{ marginLeft: '8px', fontSize: '10px', fontWeight: 600, color: '#b45309' }}>
                        Trying again automatically
                      </span>
                    ) : null}
                  </div>
                  <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>
                    Added {relative(new Date(item.createdAtMs).toISOString())}
                    {item.poisoned && item.lastError && (<span style={{ color: '#b91c1c' }}> · {item.lastError}</span>)}
                  </div>
                </div>
                {item.poisoned && (
                  <button
                    onMouseDown={e => { e.preventDefault(); handleRetryOne(item.id); }}
                    disabled={busy}
                    style={{ ...iconBtn, color: '#0f52ba' }}
                    title="Retry this item"
                  >↻</button>
                )}
                <button
                  onMouseDown={e => { e.preventDefault(); handleRemoveOne(item.id); }}
                  style={iconBtn}
                  title="Discard this item"
                >✕</button>
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* Telemetry tail */}
      <Section title="Recent sync activity">
        {telem.length === 0 ? (
          <div style={{ fontSize: '12px', color: '#64748b', padding: '10px 4px' }}>
            No telemetry yet. The buffer fills as the sync engine runs cycles, pushes, and (occasionally) hits warnings.
          </div>
        ) : (
          <div style={{
            background: '#0f172a',
            color: '#cbd5e1',
            borderRadius: '8px',
            padding: '12px',
            fontFamily: 'ui-monospace, "Cascadia Code", Menlo, monospace',
            fontSize: '11px',
            lineHeight: 1.5,
            maxHeight: '260px',
            overflowY: 'auto',
          }}>
            {telem.slice(0, 40).map((e, i) => (
              <div key={i} style={{ display: 'flex', gap: '10px' }}>
                <span style={{ color: '#64748b', flexShrink: 0 }}>{relative(e.at).padEnd(8)}</span>
                <span style={{ color: e.event.includes('failure') ? '#fca5a5' : '#a5b4fc', flexShrink: 0, minWidth: '120px' }}>{e.event}</span>
                {e.payload && (
                  <span style={{ color: '#94a3b8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {typeof e.payload === 'object' ? JSON.stringify(e.payload) : String(e.payload)}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}

function Section({ title, action, children }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '16px 18px', boxShadow: '0 1px 3px rgba(15,23,42,0.04)', marginBottom: '16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
        <div style={{ fontSize: '12px', fontWeight: 800, color: '#0f172a', letterSpacing: '0.3px' }}>{title}</div>
        {action}
      </div>
      {children}
    </div>
  );
}

const primaryBtn = {
  height: '36px', padding: '0 18px',
  background: '#0f52ba', color: '#fff',
  border: 'none', borderRadius: '8px',
  fontSize: '12px', fontWeight: 700, letterSpacing: '0.3px',
  cursor: 'pointer', fontFamily: 'inherit',
};
const dangerBtn = {
  height: '28px', padding: '0 12px',
  background: '#fff', color: '#b91c1c',
  border: '1px solid #fecaca', borderRadius: '6px',
  fontSize: '11px', fontWeight: 700,
  cursor: 'pointer', fontFamily: 'inherit',
};
const retryBtn = {
  height: '28px', padding: '0 12px',
  background: '#0f52ba', color: '#fff',
  border: 'none', borderRadius: '6px',
  fontSize: '11px', fontWeight: 800,
  cursor: 'pointer', fontFamily: 'inherit',
};
const iconBtn = {
  width: '28px', height: '28px',
  background: 'transparent', color: '#94a3b8',
  border: '1px solid #e2e8f0', borderRadius: '6px',
  fontSize: '12px', cursor: 'pointer', fontFamily: 'inherit',
  flexShrink: 0,
};
const countTile = {
  background: '#f8fafc',
  border: '1px solid #e2e8f0',
  borderRadius: '8px',
  padding: '10px 12px',
};
function outboxRow(poisoned) {
  return {
    display: 'flex', alignItems: 'center', gap: '10px',
    padding: '10px 12px',
    background: poisoned ? '#fef2f2' : '#f8fafc',
    border: `1px solid ${poisoned ? '#fecaca' : '#e2e8f0'}`,
    borderLeft: `3px solid ${poisoned ? '#b91c1c' : '#cbd5e1'}`,
    borderRadius: '8px',
  };
}
