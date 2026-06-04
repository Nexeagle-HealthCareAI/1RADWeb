// ════════════════════════════════════════════════════════════════════════════
//  ApprovalsPage.jsx — Finance → Approvals (admin / admin-doctor only)
//
//  The sign-off queue for sensitive post-payment changes: editing a recorded
//  payment, cancelling a PAID appointment, and re-pointing the referrer on a
//  PAID invoice. Billers submit requests (with a reason); an admin reviews them
//  here and Approves (the change is applied) or Rejects. Route-gated to
//  admin / admin-doctor.
// ════════════════════════════════════════════════════════════════════════════

import { useEffect, useState, useCallback } from 'react';
import apiClient from '../api/apiClient';
import { notifyToast } from '../utils/toast';

const TYPE_META = {
  EDIT_PAYMENT:       { label: 'Edit payment',        icon: '✏️', color: '#0f52ba', bg: '#eff6ff' },
  CANCEL_APPOINTMENT: { label: 'Cancel appointment',  icon: '🚫', color: '#dc2626', bg: '#fef2f2' },
  CHANGE_REFERRER:    { label: 'Change referrer',     icon: '🔁', color: '#9333ea', bg: '#faf5ff' },
  MARK_FREE:          { label: 'Free test',           icon: '🎁', color: '#0d9488', bg: '#f0fdfa' },
};

const STATUS_META = {
  PENDING:  { label: 'Pending',  color: '#b45309', bg: '#fffbeb' },
  APPROVED: { label: 'Approved', color: '#166534', bg: '#ecfdf5' },
  REJECTED: { label: 'Rejected', color: '#991b1b', bg: '#fef2f2' },
};

const timeAgo = (iso) => {
  if (!iso) return '';
  try { return new Date(iso).toLocaleString(); } catch { return iso; }
};

export default function ApprovalsPage() {
  const [tab, setTab] = useState('PENDING'); // 'PENDING' | 'ALL'
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiClient.get(`/approvals?status=${tab}`);
      setRows(Array.isArray(res.data) ? res.data : []);
    } catch (e) {
      console.error('[Approvals] load failed', e);
      notifyToast('Could not load approvals.', 'error');
    } finally {
      setLoading(false);
    }
  }, [tab]);

  useEffect(() => { load(); }, [load]);

  const review = async (row, approve) => {
    let note = '';
    if (!approve) {
      note = window.prompt('Reason for rejecting this request? (optional)') || '';
    }
    setBusyId(row.id);
    try {
      await apiClient.post(`/approvals/${row.id}/review`, { approve, note });
      notifyToast(approve ? 'Request approved — change applied.' : 'Request rejected.', approve ? 'success' : 'info');
      await load();
    } catch (e) {
      const msg = e?.response?.data?.error || e?.response?.data?.message || e?.message;
      notifyToast(`Could not ${approve ? 'approve' : 'reject'} the request${msg ? `: ${msg}` : ''}.`, 'error');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div style={{ padding: '25px', minHeight: 'calc(100vh - 64px)', background: '#f8fafc' }}>
      <div style={{ marginBottom: '18px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: 700, color: '#0a1628', margin: 0 }}>Approvals</h1>
        <p style={{ fontSize: '13px', color: '#6b7280', marginTop: '4px' }}>
          Sign off on sensitive post-payment changes — payment edits, paid-appointment cancellations and referrer changes.
        </p>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '6px', marginBottom: '18px', padding: '5px', background: '#eef2f7', borderRadius: '12px', width: 'fit-content' }}>
        {[['PENDING', 'Pending'], ['ALL', 'History']].map(([k, lbl]) => (
          <button key={k} onClick={() => setTab(k)}
            style={{ padding: '9px 18px', borderRadius: '8px', border: 'none', fontSize: '13px', fontWeight: 700, cursor: 'pointer',
              background: tab === k ? 'white' : 'transparent', color: tab === k ? '#1d4ed8' : '#6b7280',
              boxShadow: tab === k ? '0 2px 8px rgba(0,0,0,0.08)' : 'none' }}>{lbl}</button>
        ))}
        <button onClick={load} title="Refresh" style={{ padding: '9px 14px', borderRadius: '8px', border: 'none', background: 'transparent', color: '#6b7280', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}>↻</button>
      </div>

      {loading ? (
        <div style={{ padding: '40px', textAlign: 'center', color: '#94a3b8', fontSize: '13px' }}>Loading…</div>
      ) : rows.length === 0 ? (
        <div style={{ padding: '48px', textAlign: 'center', color: '#94a3b8', fontSize: '14px', background: 'white', borderRadius: '16px', border: '1px solid #e2e8f0' }}>
          {tab === 'PENDING' ? 'No pending approvals. 🎉' : 'No approval history yet.'}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {rows.map(row => {
            const t = TYPE_META[row.type] || { label: row.type, icon: '•', color: '#475569', bg: '#f1f5f9' };
            const s = STATUS_META[row.status] || STATUS_META.PENDING;
            return (
              <div key={row.id} style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '16px', padding: '18px 20px', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '14px', flexWrap: 'wrap' }}>
                  <div style={{ flex: 1, minWidth: '220px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                      <span style={{ fontSize: '10px', fontWeight: 900, letterSpacing: '0.5px', color: t.color, background: t.bg, padding: '3px 9px', borderRadius: '6px' }}>{t.icon} {t.label.toUpperCase()}</span>
                      <span style={{ fontSize: '10px', fontWeight: 900, letterSpacing: '0.5px', color: s.color, background: s.bg, padding: '3px 9px', borderRadius: '6px' }}>{s.label.toUpperCase()}</span>
                    </div>
                    <div style={{ fontSize: '15px', fontWeight: 800, color: '#1e293b' }}>{row.title || '—'}</div>
                    {row.reason && (
                      <div style={{ fontSize: '12.5px', color: '#475569', marginTop: '6px', lineHeight: 1.5 }}>
                        <span style={{ fontWeight: 800, color: '#64748b' }}>Reason: </span>{row.reason}
                      </div>
                    )}
                    <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '8px' }}>
                      Requested {timeAgo(row.createdAt)}
                      {row.reviewedAt && ` · reviewed ${timeAgo(row.reviewedAt)}`}
                      {row.reviewNote && ` · note: ${row.reviewNote}`}
                    </div>
                  </div>

                  {row.status === 'PENDING' && (
                    <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
                      <button onClick={() => review(row, true)} disabled={busyId === row.id}
                        style={{ padding: '10px 18px', borderRadius: '10px', border: 'none', background: '#16a34a', color: 'white', fontSize: '12px', fontWeight: 900, cursor: busyId === row.id ? 'not-allowed' : 'pointer', opacity: busyId === row.id ? 0.6 : 1 }}>✓ Approve</button>
                      <button onClick={() => review(row, false)} disabled={busyId === row.id}
                        style={{ padding: '10px 18px', borderRadius: '10px', border: '1px solid #fecaca', background: 'white', color: '#dc2626', fontSize: '12px', fontWeight: 900, cursor: busyId === row.id ? 'not-allowed' : 'pointer', opacity: busyId === row.id ? 0.6 : 1 }}>✕ Reject</button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
