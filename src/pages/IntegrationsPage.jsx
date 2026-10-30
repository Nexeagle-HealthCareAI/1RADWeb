import { useCallback, useEffect, useState } from 'react';
import apiClient from '../api/apiClient';
import useAuth from '../auth/useAuth';
import SettingsSubPageHeader from '../components/SettingsSubPageHeader';

// Settings → Integrations: API keys for outside systems (gap analysis P3-6).
// A key opens only this centre's DICOMweb, modality worklist and FHIR endpoints,
// for the scopes chosen here. The API shows the key once; it keeps only a hash.

const SCOPES = [
  { value: 'dicomweb.read', label: 'View images (DICOMweb search & download)', hint: 'OHIF / Weasis viewers, AI tools, another PACS reading from 1Rad' },
  { value: 'dicomweb.write', label: 'Send images in (DICOMweb STOW)', hint: 'Modalities or a PACS pushing studies to 1Rad' },
  { value: 'worklist.read', label: 'Modality worklist', hint: "The bridge reads today's bookings so the machine shows the patient list" },
  { value: 'fhir.read', label: 'Patients, orders and signed reports (FHIR)', hint: 'Hospital HIS, 1HMS, ABDM exchange' },
  { value: 'fhir.write', label: 'Register patients and book scans (FHIR)', hint: 'Lets a hospital HIS send imaging orders straight into the 1Rad worklist' },
];
const SCOPE_LABEL = Object.fromEntries(SCOPES.map(s => [s.value, s.label.split(' (')[0]]));
const fmt = (s) => (s ? new Date(s).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '—');

function Copy({ text }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try { await navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 1500); } catch { /* clipboard blocked */ }
      }}
      style={{ border: '1px solid #cbd5e1', background: '#fff', borderRadius: 6, padding: '4px 10px', fontSize: 12, cursor: 'pointer' }}
    >
      {done ? 'Copied' : 'Copy'}
    </button>
  );
}

export default function IntegrationsPage() {
  const { currentUser } = useAuth();
  const isAdmin = (currentUser?.roles || []).some(r => r === 'admin' || r === 'admindoctor');

  const [rows, setRows] = useState([]);
  const [endpoints, setEndpoints] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [name, setName] = useState('');
  const [scopes, setScopes] = useState(['dicomweb.read']);
  const [saving, setSaving] = useState(false);
  const [newKey, setNewKey] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.get('/integration-clients', { suppressErrorToast: true });
      setRows(res.data?.data || []);
      setEndpoints(res.data?.endpoints || null);
    } catch (e) {
      setError(e.response?.status === 403 ? 'Only admins can manage integration keys.' : 'Could not load integration keys.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (isAdmin) load(); }, [isAdmin, load]);

  const create = async (e) => {
    e.preventDefault();
    if (!name.trim() || scopes.length === 0) return;
    setSaving(true);
    setError(null);
    try {
      const res = await apiClient.post('/integration-clients', { name: name.trim(), scopes }, { suppressErrorToast: true });
      setNewKey(res.data?.data || null);
      setName('');
      await load();
    } catch (err) {
      setError(err.response?.data?.error || 'Could not create the key.');
    } finally {
      setSaving(false);
    }
  };

  const revoke = async (row) => {
    if (!window.confirm(`Revoke "${row.name}"? Systems using it stop working within a minute.`)) return;
    try {
      await apiClient.delete(`/integration-clients/${row.id}`, { suppressErrorToast: true });
      await load();
    } catch {
      setError('Could not revoke the key.');
    }
  };

  const toggle = (v) => setScopes(s => (s.includes(v) ? s.filter(x => x !== v) : [...s, v]));
  const card = { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 20, marginBottom: 16 };
  const input = { padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: 8, fontSize: 13, fontFamily: 'inherit' };
  const mono = { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 12 };

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto', padding: '32px 24px 48px', fontFamily: '"Segoe UI", -apple-system, system-ui, sans-serif' }}>
      <SettingsSubPageHeader
        title="Integrations"
        description="Connect outside systems to this centre: DICOM viewers and PACS (DICOMweb), the modality worklist, and hospital systems reading patients, orders and signed reports (FHIR)."
      />

      {!isAdmin ? (
        <div style={card}>Only admins can manage integration keys.</div>
      ) : (
        <>
          {endpoints && (
            <div style={card}>
              <div style={{ fontWeight: 700, marginBottom: 10 }}>Addresses</div>
              {[['DICOMweb', endpoints.dicomWeb], ['Modality worklist', endpoints.worklist], ['FHIR R4', endpoints.fhir]].map(([label, url]) => (
                <div key={label} style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 6, flexWrap: 'wrap' }}>
                  <span style={{ width: 140, color: '#475569', fontSize: 13 }}>{label}</span>
                  <code style={{ ...mono, background: '#f8fafc', padding: '4px 8px', borderRadius: 6 }}>{url}</code>
                  <Copy text={url} />
                </div>
              ))}
              <div style={{ fontSize: 12, color: '#64748b', marginTop: 8 }}>
                Send the key as <code style={mono}>Authorization: Bearer &lt;key&gt;</code>, or as the password in Basic authentication
                (any user name) for viewers such as Weasis and Orthanc.
              </div>
            </div>
          )}

          {newKey && (
            <div style={{ ...card, borderColor: '#16a34a', background: '#f0fdf4' }}>
              <div style={{ fontWeight: 700, color: '#166534', marginBottom: 6 }}>Key created for “{newKey.name}”</div>
              <div style={{ fontSize: 13, color: '#166534', marginBottom: 10 }}>Copy it now — it will not be shown again.</div>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                <code style={{ ...mono, background: '#fff', padding: '6px 10px', borderRadius: 6, border: '1px solid #bbf7d0', wordBreak: 'break-all' }}>{newKey.key}</code>
                <Copy text={newKey.key} />
                <button type="button" onClick={() => setNewKey(null)} style={{ ...input, cursor: 'pointer' }}>Done</button>
              </div>
            </div>
          )}

          <form onSubmit={create} style={card}>
            <div style={{ fontWeight: 700, marginBottom: 10 }}>New key</div>
            <input placeholder="Name, e.g. “OHIF viewer” or “Bridge worklist”" value={name} maxLength={100}
              onChange={e => setName(e.target.value)} style={{ ...input, width: '100%', maxWidth: 420, marginBottom: 12 }} />
            <div style={{ display: 'grid', gap: 8, marginBottom: 12 }}>
              {SCOPES.map(s => (
                <label key={s.value} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 13, cursor: 'pointer' }}>
                  <input type="checkbox" checked={scopes.includes(s.value)} onChange={() => toggle(s.value)} style={{ marginTop: 3 }} />
                  <span>
                    <span style={{ fontWeight: 600, color: '#0f172a' }}>{s.label}</span>
                    <span style={{ display: 'block', color: '#64748b', fontSize: 12 }}>{s.hint}</span>
                  </span>
                </label>
              ))}
            </div>
            <button type="submit" disabled={saving || !name.trim() || scopes.length === 0}
              style={{ background: '#2563eb', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 16px', fontWeight: 600, cursor: 'pointer', opacity: saving || !name.trim() || scopes.length === 0 ? 0.6 : 1 }}>
              {saving ? 'Creating…' : 'Create key'}
            </button>
            {error && <span style={{ marginLeft: 12, color: '#dc2626', fontSize: 13 }}>{error}</span>}
          </form>

          <div style={{ ...card, padding: 0, overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#f8fafc', textAlign: 'left', color: '#475569' }}>
                  {['Name', 'Key', 'Can', 'Created', 'Last used', ''].map(h => (
                    <th key={h} style={{ padding: '10px 14px', fontWeight: 700, borderBottom: '1px solid #e2e8f0' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={6} style={{ padding: 28, textAlign: 'center', color: '#64748b' }}>Loading…</td></tr>
                ) : rows.length === 0 ? (
                  <tr><td colSpan={6} style={{ padding: 28, textAlign: 'center', color: '#94a3b8' }}>No keys yet.</td></tr>
                ) : rows.map(r => (
                  <tr key={r.id} style={{ borderBottom: '1px solid #f1f5f9', opacity: r.active ? 1 : 0.55, verticalAlign: 'top' }}>
                    <td style={{ padding: '10px 14px', fontWeight: 600 }}>{r.name}</td>
                    <td style={{ padding: '10px 14px', ...mono }}>{r.keyHint}</td>
                    <td style={{ padding: '10px 14px' }}>{(r.scopes || []).map(s => SCOPE_LABEL[s] || s).join(', ')}</td>
                    <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>{fmt(r.createdAt)}</td>
                    <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>{fmt(r.lastUsedAt)}</td>
                    <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                      {r.active
                        ? <button type="button" onClick={() => revoke(r)} style={{ ...input, cursor: 'pointer', color: '#b91c1c', borderColor: '#fecaca' }}>Revoke</button>
                        : <span style={{ color: '#94a3b8' }}>Revoked {fmt(r.revokedAt)}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
