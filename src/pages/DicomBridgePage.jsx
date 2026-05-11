import React, { useState, useEffect, useCallback } from 'react';

const BRIDGE_URL = 'http://localhost:3001';
const POLL_MS    = 5000;

const STATUS_STYLE = {
  uploaded: { bg: '#f0fdf4', color: '#16a34a', border: '#bbf7d0', dot: '#22c55e' },
  failed:   { bg: '#fef2f2', color: '#dc2626', border: '#fecaca', dot: '#ef4444' },
};

function StatCard({ label, value, color = '#0f52ba', icon }) {
  return (
    <div style={{ background: 'white', borderRadius: '18px', padding: '22px 24px', border: '1px solid #e8edf2', boxShadow: '0 2px 12px rgba(0,0,0,0.04)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '14px' }}>
        <span style={{ fontSize: '9px', fontWeight: 950, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '1.5px' }}>{label}</span>
        <span style={{ fontSize: '18px' }}>{icon}</span>
      </div>
      <div style={{ fontSize: '28px', fontWeight: 950, color, letterSpacing: '-1px' }}>{value}</div>
    </div>
  );
}

export default function DicomBridgePage() {
  const [status, setStatus]         = useState(null);
  const [connected, setConnected]   = useState(null); // null=checking, true, false
  const [lastFetch, setLastFetch]   = useState(null);
  const [filterStatus, setFilter]   = useState('ALL');
  const [search, setSearch]         = useState('');

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch(`${BRIDGE_URL}/api/status`, { signal: AbortSignal.timeout(3000) });
      if (!res.ok) throw new Error('bad response');
      const data = await res.json();
      setStatus(data);
      setConnected(true);
      setLastFetch(new Date());
    } catch {
      setConnected(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    const id = setInterval(fetchStatus, POLL_MS);
    return () => clearInterval(id);
  }, [fetchStatus]);

  const recent = (status?.recent || []).filter(r => {
    const okStatus   = filterStatus === 'ALL' || r.status === filterStatus;
    const okSearch   = !search || (r.patient_name || '').toLowerCase().includes(search.toLowerCase());
    return okStatus && okSearch;
  });

  return (
    <div style={{ background: '#f0f4f8', minHeight: '100vh' }}>

      {/* ── Hero Header ── */}
      <div style={{ background: 'linear-gradient(135deg, #0a1628 0%, #0f2a5e 60%, #1e3a8a 100%)', padding: '36px 50px 46px', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: '-60px', right: '-60px', width: '280px', height: '280px', borderRadius: '50%', background: 'rgba(255,255,255,0.03)', pointerEvents: 'none' }} />

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: '20px' }}>
          <div>
            <div style={{ fontSize: '10px', fontWeight: 950, color: 'rgba(255,255,255,0.4)', letterSpacing: '3px', textTransform: 'uppercase', marginBottom: '8px' }}>
              NEXEGALE / DICOM BRIDGE
            </div>
            <h1 style={{ fontSize: '28px', fontWeight: 950, color: 'white', letterSpacing: '-1px', margin: '0 0 10px' }}>
              DICOM Bridge Monitor
            </h1>
            <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.5)', fontWeight: 600, margin: 0 }}>
              Orthanc → NexEgale automatic upload pipeline
            </p>
          </div>

          {/* Connection status */}
          <div style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '16px', padding: '18px 24px', display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                <div style={{
                  width: '10px', height: '10px', borderRadius: '50%',
                  background: connected === null ? '#f59e0b' : connected ? '#22c55e' : '#ef4444',
                  boxShadow: connected ? '0 0 8px #22c55e' : 'none',
                }} />
                <span style={{ fontSize: '12px', fontWeight: 950, color: 'white' }}>
                  {connected === null ? 'CHECKING...' : connected ? 'BRIDGE ONLINE' : 'BRIDGE OFFLINE'}
                </span>
              </div>
              <div style={{ fontSize: '9px', color: 'rgba(255,255,255,0.4)', fontWeight: 700 }}>
                {lastFetch ? `Last sync: ${lastFetch.toLocaleTimeString()}` : 'Connecting...'}
              </div>
            </div>
            <button
              onClick={fetchStatus}
              style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '10px', padding: '8px 14px', color: 'white', cursor: 'pointer', fontSize: '13px' }}
              title="Refresh now"
            >
              ↻
            </button>
          </div>
        </div>
      </div>

      {/* ── Body ── */}
      <div style={{ padding: '36px 50px', maxWidth: '1200px', margin: '0 auto' }}>

        {/* Bridge offline message */}
        {connected === false && (
          <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '16px', padding: '24px 28px', marginBottom: '32px', display: 'flex', gap: '16px', alignItems: 'flex-start' }}>
            <span style={{ fontSize: '24px' }}>⚠️</span>
            <div>
              <div style={{ fontSize: '14px', fontWeight: 950, color: '#dc2626', marginBottom: '6px' }}>Bridge service is not reachable</div>
              <div style={{ fontSize: '12px', color: '#64748b', fontWeight: 600, lineHeight: '1.6' }}>
                Make sure the bridge is running:<br />
                <code style={{ background: '#f1f5f9', padding: '2px 8px', borderRadius: '6px', fontSize: '11px', fontFamily: 'monospace' }}>
                  cd nexegale-dicom-bridge &amp;&amp; node src/index.js
                </code>
                <br />The bridge exposes a status API on <strong>http://localhost:3001</strong>
              </div>
            </div>
          </div>
        )}

        {/* Stats row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '36px' }}>
          <StatCard label="Uploaded"      value={status?.uploaded     ?? '—'} color="#16a34a" icon="✅" />
          <StatCard label="Failed"        value={status?.failed       ?? '—'} color="#dc2626" icon="❌" />
          <StatCard label="Change Cursor" value={status?.lastChangeId ?? '—'} color="#0f52ba" icon="📡" />
          <StatCard label="Refresh Rate"  value="5s"                          color="#7c3aed" icon="⏱️" />
        </div>

        {/* Filters + table */}
        <div style={{ background: 'white', borderRadius: '20px', border: '1px solid #e8edf2', overflow: 'hidden', boxShadow: '0 2px 12px rgba(0,0,0,0.04)' }}>

          {/* Table header */}
          <div style={{ padding: '20px 24px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
            <div>
              <div style={{ fontSize: '14px', fontWeight: 950, color: '#0a1628' }}>Upload History</div>
              <div style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 600, marginTop: '2px' }}>
                {connected ? `${recent.length} records` : 'Offline'}
              </div>
            </div>
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
              <input
                type="text"
                placeholder="Search patient..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                style={{ padding: '8px 14px', borderRadius: '10px', border: '1px solid #e2e8f0', fontSize: '12px', fontWeight: 600, outline: 'none', width: '180px' }}
              />
              <select
                value={filterStatus}
                onChange={e => setFilter(e.target.value)}
                style={{ padding: '8px 14px', borderRadius: '10px', border: '1px solid #e2e8f0', fontSize: '12px', fontWeight: 700, outline: 'none', background: 'white' }}
              >
                <option value="ALL">All</option>
                <option value="uploaded">Uploaded</option>
                <option value="failed">Failed</option>
              </select>
            </div>
          </div>

          {/* Table */}
          {!connected ? (
            <div style={{ padding: '60px', textAlign: 'center', color: '#94a3b8' }}>
              <div style={{ fontSize: '36px', marginBottom: '12px' }}>📡</div>
              <div style={{ fontSize: '13px', fontWeight: 800 }}>Waiting for bridge connection...</div>
            </div>
          ) : recent.length === 0 ? (
            <div style={{ padding: '60px', textAlign: 'center', color: '#94a3b8' }}>
              <div style={{ fontSize: '36px', marginBottom: '12px' }}>🗂️</div>
              <div style={{ fontSize: '13px', fontWeight: 800 }}>No records yet</div>
              <div style={{ fontSize: '11px', marginTop: '6px' }}>Studies will appear here once the bridge processes them.</div>
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead style={{ background: '#f8fafc' }}>
                <tr>
                  {['Patient', 'Modality', 'Study Date', 'Appointment ID', 'Confidence', 'Uploaded At', 'Status'].map(h => (
                    <th key={h} style={{ padding: '12px 18px', textAlign: 'left', fontSize: '9px', fontWeight: 950, color: '#94a3b8', letterSpacing: '1.5px', textTransform: 'uppercase', borderBottom: '1px solid #f1f5f9' }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {recent.map((r, i) => {
                  const st = STATUS_STYLE[r.status] || STATUS_STYLE.failed;
                  const conf = r.confidence != null ? `${(r.confidence * 100).toFixed(0)}%` : '—';
                  const dt = r.uploaded_at ? new Date(r.uploaded_at).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';
                  return (
                    <tr key={r.study_uid || i} style={{ borderBottom: '1px solid #f8fafc' }}>
                      <td style={{ padding: '14px 18px' }}>
                        <div style={{ fontSize: '12px', fontWeight: 800, color: '#0a1628' }}>{r.patient_name || '—'}</div>
                        <div style={{ fontSize: '9px', color: '#94a3b8', fontWeight: 700, marginTop: '2px', fontFamily: 'monospace' }}>{(r.study_uid || '').slice(0, 18)}</div>
                      </td>
                      <td style={{ padding: '14px 18px', fontSize: '12px', fontWeight: 800, color: '#0f52ba' }}>{r.modality || '—'}</td>
                      <td style={{ padding: '14px 18px', fontSize: '12px', fontWeight: 700, color: '#334155' }}>
                        {r.study_date ? `${r.study_date.slice(0,4)}-${r.study_date.slice(4,6)}-${r.study_date.slice(6,8)}` : '—'}
                      </td>
                      <td style={{ padding: '14px 18px', fontSize: '11px', fontWeight: 700, color: '#64748b', fontFamily: 'monospace' }}>
                        {r.appointmentId || '—'}
                      </td>
                      <td style={{ padding: '14px 18px' }}>
                        {r.confidence != null ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <div style={{ flex: 1, height: '4px', background: '#f1f5f9', borderRadius: '10px', overflow: 'hidden', maxWidth: '60px' }}>
                              <div style={{ height: '100%', width: conf, background: r.confidence >= 0.8 ? '#22c55e' : r.confidence >= 0.6 ? '#f59e0b' : '#ef4444', borderRadius: '10px' }} />
                            </div>
                            <span style={{ fontSize: '11px', fontWeight: 950, color: '#334155' }}>{conf}</span>
                          </div>
                        ) : '—'}
                      </td>
                      <td style={{ padding: '14px 18px', fontSize: '11px', color: '#64748b', fontWeight: 600 }}>{dt}</td>
                      <td style={{ padding: '14px 18px' }}>
                        <span style={{ background: st.bg, color: st.color, border: `1px solid ${st.border}`, borderRadius: '99px', padding: '4px 12px', fontSize: '9px', fontWeight: 950, letterSpacing: '0.5px', textTransform: 'uppercase', display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                          <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: st.dot, flexShrink: 0 }} />
                          {r.status}
                        </span>
                        {r.error_message && (
                          <div style={{ fontSize: '9px', color: '#ef4444', marginTop: '4px', maxWidth: '200px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={r.error_message}>
                            {r.error_message}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Setup instructions (shown when offline) */}
        {connected === false && (
          <div style={{ background: 'white', borderRadius: '20px', border: '1px solid #e8edf2', padding: '28px 32px', marginTop: '24px', boxShadow: '0 2px 12px rgba(0,0,0,0.04)' }}>
            <div style={{ fontSize: '12px', fontWeight: 950, color: '#1e293b', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '18px' }}>Quick Setup</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {[
                { step: '1', text: 'Open a terminal and navigate to the bridge folder', code: 'cd C:\\Users\\mtnoo\\OneDrive\\Desktop\\1Rad\\nexegale-dicom-bridge' },
                { step: '2', text: 'Make sure .env is configured with your Orthanc and 1Rad credentials', code: 'notepad .env' },
                { step: '3', text: 'Start the bridge service', code: 'node src/index.js' },
                { step: '4', text: 'This page auto-refreshes every 5 seconds', code: null },
              ].map(({ step, text, code }) => (
                <div key={step} style={{ display: 'flex', gap: '14px', alignItems: 'flex-start' }}>
                  <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: '#eff6ff', color: '#0f52ba', fontSize: '10px', fontWeight: 950, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{step}</div>
                  <div>
                    <div style={{ fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: code ? '4px' : 0 }}>{text}</div>
                    {code && <code style={{ fontSize: '11px', background: '#f8fafc', border: '1px solid #e2e8f0', padding: '4px 10px', borderRadius: '6px', display: 'inline-block', fontFamily: 'monospace', color: '#0f52ba' }}>{code}</code>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
