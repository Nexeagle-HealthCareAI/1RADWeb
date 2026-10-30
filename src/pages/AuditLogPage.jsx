import { useCallback, useEffect, useState } from 'react';
import apiClient from '../api/apiClient';
import useAuth from '../auth/useAuth';
import SettingsSubPageHeader from '../components/SettingsSubPageHeader';

// Settings → Activity log: who changed what at this centre (gap analysis P3-8).
// Reads GET /audit-logs (Admin / AdminDoctor only — the API enforces it).

const ENTITY_TYPES = [
  'Appointment', 'AppointmentService', 'Patient', 'Invoice', 'InvoiceItem', 'Payment',
  'CreditTransaction', 'Expense', 'ServiceCharge', 'Referrer', 'ReferralCommission',
  'ApprovalRequest', 'Hospital', 'User', 'UserHospitalMapping', 'UserHospitalRoles',
  'UserHospitalCustomRoles', 'CustomRole', 'CustomRolePermission', 'StaffMember',
  'SalaryRevision', 'SalaryDisbursement', 'StaffLeaveRequest', 'HospitalLeavePolicy',
  'HospitalSubscription', 'SubscriptionPaymentRequest', 'ImagingStudy', 'PrescriptionProtocol',
];
const ACTION_COLOURS = {
  Added: { bg: '#dcfce7', fg: '#166534' },
  Modified: { bg: '#dbeafe', fg: '#1e40af' },
  SoftDeleted: { bg: '#fef3c7', fg: '#92400e' },
  Deleted: { bg: '#fee2e2', fg: '#991b1b' },
};
const fmt = (s) => new Date(s).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });

function Changes({ json }) {
  if (!json) return <span style={{ color: '#94a3b8' }}>—</span>;
  let data;
  try { data = JSON.parse(json); } catch { return <code style={{ fontSize: 11 }}>{json}</code>; }
  return (
    <div style={{ display: 'grid', gap: 2 }}>
      {Object.entries(data).map(([k, v]) => (
        <div key={k} style={{ fontSize: 12, color: '#334155' }}>
          <strong>{k}</strong>:{' '}
          {v && typeof v === 'object' && 'from' in v
            ? <><span style={{ color: '#b91c1c', textDecoration: 'line-through' }}>{String(v.from ?? '∅')}</span> → <span style={{ color: '#15803d' }}>{String(v.to ?? '∅')}</span></>
            : String(v)}
        </div>
      ))}
    </div>
  );
}

export default function AuditLogPage() {
  const { currentUser } = useAuth();
  const isAdmin = (currentUser?.roles || []).some(r => r === 'admin' || r === 'admindoctor');

  const [entityType, setEntityType] = useState('');
  const [entityId, setEntityId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState({ items: [], totalCount: 0, pageSize: 50 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [open, setOpen] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = { page, pageSize: 50 };
      if (entityType) params.entityType = entityType;
      if (entityId.trim()) params.entityId = entityId.trim();
      // Date inputs are IST calendar days; send the day's start/end as UTC instants.
      if (from) params.from = new Date(`${from}T00:00:00+05:30`).toISOString();
      if (to) params.to = new Date(`${to}T23:59:59.999+05:30`).toISOString();
      const res = await apiClient.get('/audit-logs', { params, suppressErrorToast: true });
      setData(res.data?.data || { items: [], totalCount: 0, pageSize: 50 });
    } catch (e) {
      setError(e.response?.status === 403 ? 'Only admins can view the activity log.' : 'Could not load the activity log.');
    } finally {
      setLoading(false);
    }
  }, [page, entityType, entityId, from, to]);

  useEffect(() => { if (isAdmin) load(); }, [isAdmin, load]);

  const pages = Math.max(1, Math.ceil((data.totalCount || 0) / (data.pageSize || 50)));
  const input = { padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: 8, fontSize: 13, fontFamily: 'inherit' };

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: '32px 24px 48px', fontFamily: '"Segoe UI", -apple-system, system-ui, sans-serif' }}>
      <SettingsSubPageHeader
        title="Activity log"
        description="Every change to patients, visits, bills, payments, prices, staff, roles and subscriptions at this centre — who made it and what changed. Passwords are never recorded."
      />

      {!isAdmin ? (
        <div style={{ padding: 24, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, color: '#64748b' }}>Only admins can view the activity log.</div>
      ) : (
        <>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16, alignItems: 'center' }}>
            <select value={entityType} onChange={e => { setEntityType(e.target.value); setPage(1); }} style={input}>
              <option value="">All record types</option>
              {ENTITY_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            <input placeholder="Record ID" value={entityId} onChange={e => { setEntityId(e.target.value); setPage(1); }} style={{ ...input, width: 260 }} />
            <label style={{ fontSize: 13, color: '#475569' }}>From <input type="date" value={from} onChange={e => { setFrom(e.target.value); setPage(1); }} style={input} /></label>
            <label style={{ fontSize: 13, color: '#475569' }}>To <input type="date" value={to} onChange={e => { setTo(e.target.value); setPage(1); }} style={input} /></label>
            <span style={{ marginLeft: 'auto', fontSize: 13, color: '#64748b' }}>{data.totalCount?.toLocaleString('en-IN') || 0} changes</span>
          </div>

          <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#f8fafc', textAlign: 'left', color: '#475569' }}>
                  {['When', 'Who', 'Record', 'Action', 'What changed'].map(h => <th key={h} style={{ padding: '10px 14px', fontWeight: 700, borderBottom: '1px solid #e2e8f0' }}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={5} style={{ padding: 32, textAlign: 'center', color: '#64748b' }}>Loading…</td></tr>
                ) : error ? (
                  <tr><td colSpan={5} style={{ padding: 32, textAlign: 'center', color: '#dc2626' }}>{error}</td></tr>
                ) : data.items.length === 0 ? (
                  <tr><td colSpan={5} style={{ padding: 32, textAlign: 'center', color: '#94a3b8' }}>No changes match these filters.</td></tr>
                ) : data.items.map(row => {
                  const c = ACTION_COLOURS[row.action] || ACTION_COLOURS.Modified;
                  return (
                    <tr key={row.id} style={{ borderBottom: '1px solid #f1f5f9', verticalAlign: 'top' }}>
                      <td style={{ padding: '10px 14px', whiteSpace: 'nowrap', color: '#334155' }}>{fmt(row.createdAt)}</td>
                      <td style={{ padding: '10px 14px' }}>{row.userName || (row.userId ? row.userId.slice(0, 8) : 'System')}</td>
                      <td style={{ padding: '10px 14px' }}>
                        <div style={{ fontWeight: 600 }}>{row.entityType}</div>
                        <button type="button" onClick={() => { setEntityType(row.entityType); setEntityId(row.entityId); setPage(1); }}
                          title="Show this record's history"
                          style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'monospace', fontSize: 11, color: '#3b82f6' }}>
                          {row.entityId.length > 18 ? row.entityId.slice(0, 18) + '…' : row.entityId}
                        </button>
                      </td>
                      <td style={{ padding: '10px 14px' }}>
                        <span style={{ background: c.bg, color: c.fg, borderRadius: 99, padding: '2px 10px', fontSize: 11, fontWeight: 700 }}>{row.action}</span>
                      </td>
                      <td style={{ padding: '10px 14px', maxWidth: 520 }}>
                        {open === row.id || row.action === 'Modified' || row.action === 'SoftDeleted'
                          ? <Changes json={row.changesJson} />
                          : <button type="button" onClick={() => setOpen(row.id)} style={{ background: 'none', border: 'none', color: '#3b82f6', cursor: 'pointer', padding: 0, fontSize: 12 }}>Show values</button>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12, alignItems: 'center', fontSize: 13 }}>
            <button type="button" disabled={page <= 1 || loading} onClick={() => setPage(p => p - 1)} style={input}>Previous</button>
            <span style={{ color: '#64748b' }}>Page {page} of {pages}</span>
            <button type="button" disabled={page >= pages || loading} onClick={() => setPage(p => p + 1)} style={input}>Next</button>
          </div>
        </>
      )}
    </div>
  );
}
