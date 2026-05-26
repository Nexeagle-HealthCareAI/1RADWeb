import React, { useState, useEffect, useCallback } from 'react';
import useAuth from '../auth/useAuth';
import { BASE_URL } from '../api/apiClient';

const BRIDGE_URL = 'http://localhost:3001';
const POLL_MS    = 5000;

const STATUS_STYLE = {
  uploaded: { bg: '#f0fdf4', color: '#16a34a', border: '#bbf7d0', dot: '#22c55e' },
  failed:   { bg: '#fef2f2', color: '#dc2626', border: '#fecaca', dot: '#ef4444' },
  pending:  { bg: '#fffbeb', color: '#d97706', border: '#fde68a', dot: '#f59e0b' },
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
  const { currentUser } = useAuth();
  const [status, setStatus]         = useState(null);
  const [connected, setConnected]   = useState(null); // null=checking, true, false
  const [lastFetch, setLastFetch]   = useState(null);
  const [filterStatus, setFilter]   = useState('ALL');
  const [search, setSearch]         = useState('');
  const [activeTab, setActiveTab]   = useState('monitor'); // 'monitor' | 'setup' | 'settings'
  const [localConfig, setLocalConfig] = useState({ uploadMode: 'auto', autoModalities: [] });

  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);
  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch(`${BRIDGE_URL}/api/status`, { signal: AbortSignal.timeout(3000) });
      if (!res.ok) throw new Error('bad response');
      const data = await res.json();
      setStatus(data);
      if (data.config) {
        // Only override localConfig if it's the first time or if we want to sync
        setLocalConfig(prev => {
          // simple check to avoid unnecessary state updates
          if (JSON.stringify(prev) !== JSON.stringify(data.config)) return data.config;
          return prev;
        });
      }
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

  const updateConfig = async (newConfig) => {
    setLocalConfig(newConfig);
    try {
      await fetch(`${BRIDGE_URL}/api/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newConfig)
      });
      fetchStatus();
    } catch (err) {
      console.error(err);
    }
  };

  const handleManualUpload = async (uid) => {
    try {
      await fetch(`${BRIDGE_URL}/api/upload/${uid}`, { method: 'POST' });
      fetchStatus();
    } catch (err) {
      console.error(err);
      alert('Failed to trigger upload');
    }
  };

  const recent = (status?.recent || []).filter(r => {
    const okStatus   = filterStatus === 'ALL' || r.status === filterStatus;
    const okSearch   = !search || (r.patient_name || '').toLowerCase().includes(search.toLowerCase());
    return okStatus && okSearch;
  });

  return (
    <div style={{ background: '#f0f4f8', minHeight: '100vh' }}>

      {/* ── Hero Header ── */}
      <div style={{ background: 'linear-gradient(135deg, #0a1628 0%, #0f2a5e 60%, #1e3a8a 100%)', padding: isMobile ? '24px 20px 32px' : '36px 50px 46px', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: '-60px', right: '-60px', width: '280px', height: '280px', borderRadius: '50%', background: 'rgba(255,255,255,0.03)', pointerEvents: 'none' }} />

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: '20px' }}>
          <div>
            <div style={{ fontSize: '10px', fontWeight: 950, color: 'rgba(255,255,255,0.4)', letterSpacing: '3px', textTransform: 'uppercase', marginBottom: '8px' }}>
              1RAD / DICOM BRIDGE
            </div>
            <h1 style={{ fontSize: '28px', fontWeight: 950, color: 'white', letterSpacing: '-1px', margin: '0 0 10px' }}>
              DICOM Bridge Monitor
            </h1>
            <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.5)', fontWeight: 600, margin: 0 }}>
              Orthanc → 1Rad automatic upload pipeline
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
              🔄
            </button>
            {connected === false && (
              <div style={{ marginLeft: '16px' }}>
                <div style={{ fontSize: '14px', fontWeight: 950, color: '#f87171', marginBottom: '6px' }}>Bridge service is not reachable</div>
                <div style={{ fontSize: '12px', color: '#cbd5e1', fontWeight: 600, lineHeight: '1.6' }}>
                  Make sure the bridge is running:<br />
                  <code style={{ background: 'rgba(0,0,0,0.2)', padding: '2px 8px', borderRadius: '6px', fontSize: '11px', fontFamily: 'monospace' }}>
                    cd nexegale-dicom-bridge &amp;&amp; node src/index.js
                  </code>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

        {/* TAB BAR */}
        <div style={{ display: 'flex', gap: '8px', padding: isMobile ? '20px 20px 16px' : '20px 50px 16px', overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
          {[
            { id: 'monitor', label: 'Activity Monitor' },
            { id: 'settings', label: 'Bridge Settings' },
            { id: 'setup',   label: 'Setup Guide' },
          ].map(t => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              style={{
                padding: '8px 16px',
                borderRadius: '10px',
                border: '1px solid ' + (activeTab === t.id ? '#0f52ba' : '#e2e8f0'),
                background: activeTab === t.id ? '#0f52ba' : 'white',
                color: activeTab === t.id ? 'white' : '#475569',
                fontSize: '12px',
                fontWeight: 800,
                cursor: 'pointer',
                letterSpacing: '0.5px',
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div style={{ padding: isMobile ? '16px 20px 80px' : '32px 50px 80px' }}>
        {/* TAB: ACTIVITY MONITOR */}
        {activeTab === 'monitor' && (<>
        {/* Stats row */}
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)', gap: '16px', marginBottom: '36px' }}>
          <StatCard label="Uploaded"      value={status?.uploaded     ?? '—'} color="#16a34a" icon="✅" />
          <StatCard label="Pending"       value={status?.pending      ?? '—'} color="#d97706" icon="⏳" />
          <StatCard label="Failed"        value={status?.failed       ?? '—'} color="#dc2626" icon="❌" />
          <StatCard label="Change Cursor" value={status?.lastChangeId ?? '—'} color="#0f52ba" icon="📡" />
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
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center', width: isMobile ? '100%' : 'auto', flexWrap: isMobile ? 'wrap' : 'nowrap' }}>
              <input
                type="text"
                placeholder="Search patient..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                style={{ padding: '8px 14px', borderRadius: '10px', border: '1px solid #e2e8f0', fontSize: '12px', fontWeight: 600, outline: 'none', flex: isMobile ? 1 : 'none', width: isMobile ? 'auto' : '180px' }}
              />
              <select
                value={filterStatus}
                onChange={e => setFilter(e.target.value)}
                style={{ padding: '8px 14px', borderRadius: '10px', border: '1px solid #e2e8f0', fontSize: '12px', fontWeight: 700, outline: 'none', background: 'white' }}
              >
                <option value="ALL">All</option>
                <option value="pending">Pending</option>
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
          ) : isMobile ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', padding: '16px' }}>
                {recent.map((r, i) => {
                  const st = STATUS_STYLE[r.status] || STATUS_STYLE.failed;
                  const conf = r.confidence != null ? `${(r.confidence * 100).toFixed(0)}%` : '—';
                  const dt = r.uploaded_at ? new Date(r.uploaded_at).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';
                  return (
                    <div key={r.study_uid || i} style={{ background: '#f8fafc', borderRadius: '12px', padding: '16px', border: '1px solid #e2e8f0' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                        <div>
                          <div style={{ fontSize: '14px', fontWeight: 800, color: '#0a1628' }}>{r.patient_name || '—'}</div>
                          <div style={{ fontSize: '10px', color: '#94a3b8', fontWeight: 700, marginTop: '2px', fontFamily: 'monospace', wordBreak: 'break-all' }}>{(r.study_uid || '').slice(0, 24)}...</div>
                        </div>
                        <span style={{ background: st.bg, color: st.color, border: `1px solid ${st.border}`, borderRadius: '99px', padding: '4px 10px', fontSize: '10px', fontWeight: 800, letterSpacing: '0.5px', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '5px' }}>
                          <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: st.dot }} />
                          {r.status}
                        </span>
                      </div>
                      
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                        <div>
                          <div style={{ fontSize: '9px', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', marginBottom: '2px' }}>Modality</div>
                          <div style={{ fontSize: '13px', fontWeight: 800, color: '#0f52ba' }}>{r.modality || '—'}</div>
                        </div>
                        <div>
                          <div style={{ fontSize: '9px', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', marginBottom: '2px' }}>Study Date</div>
                          <div style={{ fontSize: '12px', fontWeight: 700, color: '#334155' }}>{r.study_date ? `${r.study_date.slice(0,4)}-${r.study_date.slice(4,6)}-${r.study_date.slice(6,8)}` : '—'}</div>
                        </div>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                        <div>
                          <div style={{ fontSize: '9px', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', marginBottom: '2px' }}>Confidence</div>
                          {r.confidence != null ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <div style={{ flex: 1, height: '4px', background: '#e2e8f0', borderRadius: '10px', overflow: 'hidden' }}>
                                <div style={{ height: '100%', width: conf, background: r.confidence >= 0.8 ? '#22c55e' : r.confidence >= 0.6 ? '#f59e0b' : '#ef4444', borderRadius: '10px' }} />
                              </div>
                              <span style={{ fontSize: '11px', fontWeight: 950, color: '#334155' }}>{conf}</span>
                            </div>
                          ) : <div style={{ fontSize: '12px', color: '#64748b' }}>—</div>}
                        </div>
                        <div>
                          <div style={{ fontSize: '9px', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', marginBottom: '2px' }}>Uploaded</div>
                          <div style={{ fontSize: '11px', fontWeight: 600, color: '#64748b' }}>{dt}</div>
                        </div>
                      </div>

                      {r.status === 'pending' && (
                        <div style={{ marginTop: '16px' }}>
                          <button 
                            onClick={() => handleManualUpload(r.study_uid)}
                            style={{ width: '100%', background: '#0a1628', color: 'white', border: 'none', padding: '10px', borderRadius: '8px', fontSize: '12px', fontWeight: 800, cursor: 'pointer' }}
                          >
                            Upload Now
                          </button>
                        </div>
                      )}

                      {r.error_message && (
                        <div style={{ marginTop: '12px', padding: '8px 12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', fontSize: '10px', color: '#ef4444', fontWeight: 600 }}>
                          {r.error_message}
                        </div>
                      )}
                    </div>
                  );
                })}
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
                        {r.status === 'pending' && (
                          <button 
                            onClick={() => handleManualUpload(r.study_uid)}
                            style={{ marginLeft: '10px', background: '#0a1628', color: 'white', border: 'none', padding: '4px 10px', borderRadius: '6px', fontSize: '10px', fontWeight: 800, cursor: 'pointer' }}
                          >
                            Upload Now
                          </button>
                        )}
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
        </>
        )}

        {/* TAB: SETTINGS */}
        {activeTab === 'settings' && (
          <div style={{ background: 'white', borderRadius: '20px', border: '1px solid #e8edf2', padding: isMobile ? '24px' : '40px', boxShadow: '0 4px 20px rgba(0,0,0,0.04)', maxWidth: '900px', margin: '0 auto' }}>
            <div style={{ marginBottom: '24px' }}>
              <div style={{ fontSize: '14px', fontWeight: 950, color: '#0a1628', textTransform: 'uppercase', letterSpacing: '1px' }}>Bridge Settings</div>
              <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>Configure how the DICOM bridge uploads studies from Orthanc.</div>
            </div>

            {!connected ? (
              <div style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>
                <div style={{ fontSize: '30px', marginBottom: '12px' }}>🔌</div>
                <div style={{ fontSize: '13px', fontWeight: 800 }}>Bridge Offline</div>
                <div style={{ fontSize: '11px', marginTop: '6px' }}>Settings can only be changed when the local bridge is running.</div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                {/* Upload Mode */}
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 800, color: '#0a1628', marginBottom: '10px' }}>Upload Mode</div>
                  <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                      <input type="radio" name="uploadMode" value="auto" checked={localConfig.uploadMode === 'auto'} onChange={() => updateConfig({ ...localConfig, uploadMode: 'auto' })} />
                      <span style={{ fontSize: '13px', fontWeight: 600, color: '#334155' }}>Automatic</span>
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                      <input type="radio" name="uploadMode" value="manual" checked={localConfig.uploadMode === 'manual'} onChange={() => updateConfig({ ...localConfig, uploadMode: 'manual' })} />
                      <span style={{ fontSize: '13px', fontWeight: 600, color: '#334155' }}>Manual</span>
                    </label>
                  </div>
                  <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '8px' }}>
                    {localConfig.uploadMode === 'auto' ? 'Studies are uploaded automatically when detected in Orthanc.' : 'Studies remain pending until you manually trigger the upload in Activity Monitor.'}
                  </div>
                </div>

                {/* Modality Filter */}
                {localConfig.uploadMode === 'auto' && (
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: 800, color: '#0a1628', marginBottom: '10px' }}>Automatic Modalities</div>
                    <div style={{ fontSize: '11px', color: '#64748b', marginBottom: '12px' }}>Select which modalities to auto-upload. If none are selected, ALL modalities will be uploaded automatically.</div>
                    <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                      {[
                        { id: 'CT', label: 'Computed Tomography (CT)' },
                        { id: 'MR', label: 'Magnetic Resonance (MR)' },
                        { id: 'CR', label: 'X-Ray (CR)' },
                        { id: 'DX', label: 'Digital X-Ray (DX)' },
                        { id: 'US', label: 'Ultrasound (US)' },
                        { id: 'PT', label: 'PET (PT)' },
                        { id: 'NM', label: 'Nuclear Medicine (NM)' },
                        { id: 'MG', label: 'Mammography (MG)' },
                        { id: 'XA', label: 'X-Ray Angiography (XA)' }
                      ].map(mod => (
                        <label key={mod.id} style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#f8fafc', padding: '6px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', cursor: 'pointer' }}>
                          <input 
                            type="checkbox" 
                            checked={localConfig.autoModalities?.includes(mod.id)} 
                            onChange={(e) => {
                              let newMods = [...(localConfig.autoModalities || [])];
                              if (e.target.checked) newMods.push(mod.id);
                              else newMods = newMods.filter(m => m !== mod.id);
                              updateConfig({ ...localConfig, autoModalities: newMods });
                            }}
                          />
                          <span style={{ fontSize: '12px', fontWeight: 700, color: '#0f52ba' }}>{mod.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* TAB: SETUP GUIDE */}
        {activeTab === 'setup' && (
          <div style={{ background: 'white', borderRadius: '20px', border: '1px solid #e8edf2', padding: isMobile ? '24px' : '40px', boxShadow: '0 4px 20px rgba(0,0,0,0.04)', maxWidth: '900px', margin: '0 auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: isMobile ? 'flex-start' : 'center', marginBottom: '24px', flexDirection: isMobile ? 'column' : 'row', gap: '16px' }}>
              <div>
                <div style={{ fontSize: '14px', fontWeight: 950, color: '#0a1628', textTransform: 'uppercase', letterSpacing: '1px' }}>Bridge Setup Guide</div>
                <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>Follow these steps to connect your clinic's Orthanc PACS to 1Rad.</div>
              </div>
              <a 
                href="/1rad-dicom-bridge.zip" 
                download="1rad-dicom-bridge.zip"
                style={{ background: '#0a1628', color: 'white', border: 'none', padding: '10px 20px', borderRadius: '10px', fontSize: '12px', fontWeight: 800, cursor: 'pointer', boxShadow: '0 4px 14px rgba(10,22,40,0.15)', textDecoration: 'none', display: 'inline-block' }}
              >
                Download Bridge Software (.zip)
              </a>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
              
              {/* Step 1 */}
              <div style={{ display: 'flex', gap: '20px', alignItems: 'flex-start' }}>
                <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: '#eff6ff', color: '#0f52ba', fontSize: '14px', fontWeight: 950, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>1</div>
                <div>
                  <div style={{ fontSize: '15px', fontWeight: 800, color: '#0a1628', marginBottom: '6px' }}>Install Prerequisites</div>
                  <div style={{ fontSize: '13px', color: '#475569', lineHeight: 1.6 }}>
                    The bridge requires Node.js to run. Download and install the <a href="https://nodejs.org/" target="_blank" rel="noreferrer" style={{ color: '#0f52ba', fontWeight: 700, textDecoration: 'none' }}>Node.js LTS (Long Term Support) version</a> for Windows. 
                    During installation, ensure the option to add Node to PATH is checked.
                  </div>
                </div>
              </div>

              {/* Step 2 */}
              <div style={{ display: 'flex', gap: '20px', alignItems: 'flex-start' }}>
                <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: '#eff6ff', color: '#0f52ba', fontSize: '14px', fontWeight: 950, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>2</div>
                <div>
                  <div style={{ fontSize: '15px', fontWeight: 800, color: '#0a1628', marginBottom: '6px' }}>Download and Extract the Bridge Software</div>
                  <div style={{ fontSize: '13px', color: '#475569', lineHeight: 1.6 }}>
                    Download the `nexegale-dicom-bridge.zip` file using the button above. Extract this ZIP file to a permanent location on your local server, such as <code>C:\1Rad-Bridge\</code>.
                  </div>
                </div>
              </div>

              {/* Step 3 */}
              <div style={{ display: 'flex', gap: '20px', alignItems: 'flex-start' }}>
                <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: '#eff6ff', color: '#0f52ba', fontSize: '14px', fontWeight: 950, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>3</div>
                <div style={{ width: '100%' }}>
                  <div style={{ fontSize: '15px', fontWeight: 800, color: '#0a1628', marginBottom: '6px' }}>Configure the Environment</div>
                  <div style={{ fontSize: '13px', color: '#475569', lineHeight: 1.6, marginBottom: '16px' }}>
                    Create a new file named exactly <code>.env</code> inside your extracted bridge folder. 
                    Download the pre-filled configuration file below, open it with Notepad, and replace <strong>your_password_here</strong> with your 1Rad administrator password.
                  </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 16px', background: '#1e293b', borderBottom: '1px solid #334155' }}>
                  <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 700, fontFamily: 'monospace' }}>.env</span>
                  <button 
                    onClick={() => {
                      const envText = `ORTHANC_URL=http://localhost:8042\nONERAD_API_URL=${BASE_URL}\nONERAD_IDENTIFIER=${currentUser?.email || 'your-email@example.com'}\nONERAD_PASSWORD=your_password_here\nMATCH_CONFIDENCE_THRESHOLD=0.6\nPOLL_INTERVAL_SECONDS=30`;
                      const blob = new Blob([envText], { type: 'text/plain' });
                      const a = document.createElement('a');
                      a.href = URL.createObjectURL(blob);
                      a.download = '.env';
                      a.click();
                    }}
                    style={{ background: 'transparent', border: '1px solid #475569', color: '#e2e8f0', padding: '4px 12px', borderRadius: '6px', fontSize: '10px', fontWeight: 800, cursor: 'pointer' }}>
                    Download .env
                  </button>
                </div>
                <div style={{ padding: '16px', color: '#38bdf8', fontFamily: 'monospace', fontSize: '12px', whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
                  ORTHANC_URL=http://localhost:8042<br />
                  ONERAD_API_URL={BASE_URL}<br />
                  ONERAD_IDENTIFIER={currentUser?.email || 'your-email@example.com'}<br />
                  <span style={{ color: '#f87171' }}>ONERAD_PASSWORD=your_password_here</span><br />
                  <span style={{ color: '#94a3b8' }}>MATCH_CONFIDENCE_THRESHOLD=0.6</span><br />
                  <span style={{ color: '#94a3b8' }}>POLL_INTERVAL_SECONDS=30</span>
                </div>
              </div>
              </div>

              {/* Step 4 */}
              <div style={{ display: 'flex', gap: '20px', alignItems: 'flex-start' }}>
                <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: '#eff6ff', color: '#0f52ba', fontSize: '14px', fontWeight: 950, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>4</div>
                <div>
                  <div style={{ fontSize: '15px', fontWeight: 800, color: '#0a1628', marginBottom: '6px' }}>Install Dependencies</div>
                  <div style={{ fontSize: '13px', color: '#475569', lineHeight: 1.6 }}>
                    Open Command Prompt (cmd.exe) as an Administrator. Navigate to your bridge folder and run the install command to download the required Node.js packages.
                  </div>
                  <div style={{ marginTop: '12px' }}>
                    <code style={{ fontSize: '12px', background: '#f8fafc', border: '1px solid #e2e8f0', padding: '10px 14px', borderRadius: '8px', display: 'block', fontFamily: 'monospace', color: '#0f52ba' }}>
                      cd C:\1Rad-Bridge<br/>
                      npm install
                    </code>
                  </div>
                </div>
              </div>

              {/* Step 5 */}
              <div style={{ display: 'flex', gap: '20px', alignItems: 'flex-start' }}>
                <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: '#eff6ff', color: '#0f52ba', fontSize: '14px', fontWeight: 950, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>5</div>
                <div>
                  <div style={{ fontSize: '15px', fontWeight: 800, color: '#0a1628', marginBottom: '6px' }}>Install Windows Background Service</div>
                  <div style={{ fontSize: '13px', color: '#475569', lineHeight: 1.6 }}>
                    To ensure the bridge runs automatically in the background (even after server reboots), install it as a Windows Service using the provided script.
                  </div>
                  <div style={{ marginTop: '12px' }}>
                    <code style={{ fontSize: '12px', background: '#f8fafc', border: '1px solid #e2e8f0', padding: '10px 14px', borderRadius: '8px', display: 'block', fontFamily: 'monospace', color: '#0f52ba' }}>
                      node scripts/install-service.js
                    </code>
                  </div>
                </div>
              </div>
              
              {/* Step 6 */}
              <div style={{ display: 'flex', gap: '20px', alignItems: 'flex-start' }}>
                <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: '#22c55e', color: 'white', fontSize: '14px', fontWeight: 950, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>✓</div>
                <div>
                  <div style={{ fontSize: '15px', fontWeight: 800, color: '#0a1628', marginBottom: '6px' }}>Verify Connection</div>
                  <div style={{ fontSize: '13px', color: '#475569', lineHeight: 1.6 }}>
                    Once the service starts, open <code>services.msc</code> in Windows to verify that the <strong>Nexegale DICOM Bridge</strong> service is "Running". 
                    After a few seconds, return to the <strong>Activity Monitor</strong> tab on this page; the status indicator at the top will automatically turn green ("BRIDGE ONLINE").
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
