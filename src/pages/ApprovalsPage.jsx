// ════════════════════════════════════════════════════════════════════════════
//  ApprovalsPage.jsx — Finance → Approvals (admin / admin-doctor only)
//
//  The sign-off queue for sensitive post-payment changes: editing a recorded
//  payment, cancelling a PAID appointment, re-pointing the referrer on a PAID
//  invoice, marking a test free, and reverting an already-PAID referral
//  commission back to UNPAID. Billers submit requests (with a reason); an admin
//  reviews them here and Approves (the change is applied) or Rejects (with a
//  reason). Route-gated to admin / admin-doctor.
//
//  Two tabs, both as clean tables:
//   • Pending  — what needs a decision right now.
//   • History  — every reviewed request, newest first, with who/when/why.
// ════════════════════════════════════════════════════════════════════════════

import { useEffect, useMemo, useState, useCallback } from 'react';
import apiClient from '../api/apiClient';
import { notifyToast } from '../utils/toast';
import { celebrate } from '../utils/celebrate';

const TYPE_META = {
  EDIT_PAYMENT:       { label: 'Edit payment',            icon: '✏️', color: '#0f52ba', bg: '#eff6ff' },
  CANCEL_APPOINTMENT: { label: 'Cancel appointment',      icon: '🚫', color: '#dc2626', bg: '#fef2f2' },
  CHANGE_REFERRER:    { label: 'Change referrer',         icon: '🔁', color: '#9333ea', bg: '#faf5ff' },
  MARK_FREE:          { label: 'Free test',               icon: '🎁', color: '#0d9488', bg: '#f0fdfa' },
  UNPAY_COMMISSION:   { label: 'Revert paid commission',  icon: '↩️', color: '#7c3aed', bg: '#f5f3ff' },
};

const STATUS_META = {
  PENDING:  { label: 'Pending',  color: '#b45309', bg: '#fffbeb', dot: '#f59e0b' },
  APPROVED: { label: 'Approved', color: '#166534', bg: '#ecfdf5', dot: '#16a34a' },
  REJECTED: { label: 'Rejected', color: '#991b1b', bg: '#fef2f2', dot: '#ef4444' },
};

// "5 Jun 2026" + "3:42 PM" as a two-line stack.
// Backend timestamps are UTC but serialise without a 'Z', so a bare new Date()
// parses them as LOCAL time and skews every value by the IST offset (~5.5h) —
// which is why a just-raised request showed "awaiting 5h 32m". Append 'Z' when
// there's no timezone designator so they parse as UTC; the toLocale*(...,
// timeZone: 'Asia/Kolkata') calls below then render correct IST.
const toUtc = (iso) => {
  const s = String(iso);
  const hasTz = /[zZ]$|[+-]\d{2}:?\d{2}$/.test(s);
  return new Date(hasTz ? s : s + 'Z');
};
const fmtDate = (iso) => {
  if (!iso) return '—';
  try {
    return toUtc(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });
  } catch { return iso; }
};
const fmtTime = (iso) => {
  if (!iso) return '';
  try {
    return toUtc(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' }) + ' IST';
  } catch { return ''; }
};
// How long a request has been waiting (since it was raised), e.g. "2d 4h" / "15m".
const awaitedFor = (iso) => {
  if (!iso) return '';
  const ms = Date.now() - toUtc(iso).getTime();
  if (ms < 0) return 'just now';
  const m = Math.floor(ms / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${m % 60}m`;
  const d = Math.floor(h / 24);
  return `${d}d ${h % 24}h`;
};
const initials = (name) => {
  const n = (name || '').trim();
  if (!n) return '—';
  const parts = n.split(/\s+/);
  return ((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).toUpperCase() || n[0].toUpperCase();
};

// "YYYY-MM" bucket key + "Jun 2026" label, used by the History date filter.
const monthKey = (iso) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};
const monthLabel = (key) => {
  const [y, m] = key.split('-');
  return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
};
const sameDay = (a, b) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

function TypeChip({ type }) {
  const t = TYPE_META[type] || { label: type, icon: '•', color: '#475569', bg: '#f1f5f9' };
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '10px', fontWeight: 900, letterSpacing: '0.4px', color: t.color, background: t.bg, padding: '4px 9px', borderRadius: '7px', whiteSpace: 'nowrap' }}>
      <span style={{ fontSize: '11px' }}>{t.icon}</span>{t.label.toUpperCase()}
    </span>
  );
}

function StatusChip({ status }) {
  const s = STATUS_META[status] || STATUS_META.PENDING;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '10px', fontWeight: 900, letterSpacing: '0.4px', color: s.color, background: s.bg, padding: '4px 10px', borderRadius: '999px', whiteSpace: 'nowrap' }}>
      <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: s.dot }} />{s.label.toUpperCase()}
    </span>
  );
}

// Small round avatar with initials — gives the "who" a face without photos.
function Person({ name, sub }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '9px' }}>
      <div style={{ flexShrink: 0, width: '30px', height: '30px', borderRadius: '50%', background: 'linear-gradient(135deg, #1d4ed8, #3b82f6)', color: 'white', fontSize: '11px', fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center', letterSpacing: '0.3px' }}>
        {initials(name)}
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: '12.5px', fontWeight: 800, color: '#1e293b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '150px' }}>{name || 'Unknown'}</div>
        {sub && <div style={{ fontSize: '10px', fontWeight: 700, color: '#94a3b8' }}>{sub}</div>}
      </div>
    </div>
  );
}

function DateCell({ iso }) {
  return (
    <div style={{ whiteSpace: 'nowrap' }}>
      <div style={{ fontSize: '12px', fontWeight: 800, color: '#334155' }}>{fmtDate(iso)}</div>
      <div style={{ fontSize: '10.5px', fontWeight: 700, color: '#94a3b8' }}>{fmtTime(iso)}</div>
    </div>
  );
}

const TH = ({ children, align = 'left', width }) => (
  <th style={{ padding: '12px 14px', textAlign: align, fontSize: '9.5px', fontWeight: 950, color: '#64748b', letterSpacing: '0.8px', borderBottom: '1px solid #e7ecf3', width, whiteSpace: 'nowrap' }}>{children}</th>
);
const TD = ({ children, align = 'left', style }) => (
  <td style={{ padding: '13px 14px', textAlign: align, verticalAlign: 'top', ...style }}>{children}</td>
);

export default function ApprovalsPage() {
  const [tab, setTab] = useState('PENDING'); // 'PENDING' | 'ALL'
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [reject, setReject] = useState({ open: false, row: null, reason: '' });
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState({ key: 'requested', dir: 'desc' }); // newest-first default
  const [dateFilter, setDateFilter] = useState('ALL'); // ALL | TODAY | YESTERDAY | THIS_MONTH | 'YYYY-MM'
  const [page, setPage] = useState(1);
  const [approveModal, setApproveModal] = useState({ open: false, row: null, note: '' });
  const PAGE_SIZE = 6;

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

  // Reset to the first page whenever the visible set changes.
  useEffect(() => { setPage(1); }, [tab, search, sort, dateFilter]);

  const pendingCount = useMemo(
    () => rows.filter(r => r.status === 'PENDING').length,
    [rows]
  );

  const isHistory = tab === 'ALL';
  const currentMonthKey = monthKey(new Date());

  // Distinct months present in the data (newest first), minus the current one
  // which the "This month" quick pill already covers.
  const monthOptions = useMemo(() => {
    const set = new Set();
    rows.forEach(r => { if (r.createdAt) set.add(monthKey(r.createdAt)); });
    set.delete(currentMonthKey);
    return Array.from(set).sort().reverse();
  }, [rows, currentMonthKey]);

  const inDateFilter = useCallback((iso) => {
    if (dateFilter === 'ALL') return true;
    if (!iso) return false;
    const d = new Date(iso);
    const now = new Date();
    if (dateFilter === 'TODAY') return sameDay(d, now);
    if (dateFilter === 'YESTERDAY') { const y = new Date(now); y.setDate(now.getDate() - 1); return sameDay(d, y); }
    if (dateFilter === 'THIS_MONTH') return monthKey(iso) === currentMonthKey;
    return monthKey(iso) === dateFilter; // a specific "YYYY-MM"
  }, [dateFilter, currentMonthKey]);

  const sortVal = (row, key) => {
    switch (key) {
      case 'request':   return (row.title || '').toLowerCase();
      case 'requester': return (row.requestedByName || '').toLowerCase();
      case 'reason':    return (row.reason || '').toLowerCase();
      case 'decision':  return row.reviewedAt ? new Date(row.reviewedAt).getTime() : 0;
      case 'note':      return (row.reviewNote || '').toLowerCase();
      case 'requested':
      default:          return row.createdAt ? new Date(row.createdAt).getTime() : 0;
    }
  };

  const viewRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    let out = rows.filter(r => (isHistory ? inDateFilter(r.createdAt) : true));
    if (q) {
      out = out.filter(r => {
        const typeLabel = TYPE_META[r.type]?.label || r.type || '';
        return [r.title, r.reason, r.requestedByName, r.reviewedByName, r.reviewNote, typeLabel]
          .some(v => (v || '').toLowerCase().includes(q));
      });
    }
    const dir = sort.dir === 'asc' ? 1 : -1;
    return [...out].sort((a, b) => {
      const va = sortVal(a, sort.key), vb = sortVal(b, sort.key);
      if (va < vb) return -1 * dir;
      if (va > vb) return 1 * dir;
      return 0;
    });
  }, [rows, search, sort, isHistory, inDateFilter]);

  const totalPages = Math.max(1, Math.ceil(viewRows.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pagedRows = viewRows.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const toggleSort = (key) => setSort(s =>
    s.key === key
      ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' }
      : { key, dir: (key === 'requested' || key === 'decision') ? 'desc' : 'asc' }
  );

  const submitApprove = async () => {
    const row = approveModal.row;
    if (!row) return;
    const note = (approveModal.note || '').trim();
    setBusyId(row.id);
    try {
      await apiClient.post(`/approvals/${row.id}/review`, { approve: true, note });
      notifyToast('Approved ✓  The change has been applied.', 'success');
      celebrate();
      setApproveModal({ open: false, row: null, note: '' });
      await load();
    } catch (e) {
      const msg = e?.response?.data?.error || e?.response?.data?.message || e?.message;
      notifyToast(`Could not approve the request${msg ? `: ${msg}` : ''}.`, 'error');
    } finally {
      setBusyId(null);
    }
  };

  const submitReject = async () => {
    const row = reject.row;
    const note = (reject.reason || '').trim();
    if (!row) return;
    if (note.length < 4) { notifyToast('Please add a short reason for rejecting.', 'error'); return; }
    setBusyId(row.id);
    try {
      await apiClient.post(`/approvals/${row.id}/review`, { approve: false, note });
      notifyToast('Request rejected — the requester will see your reason.', 'info');
      celebrate('calm');
      setReject({ open: false, row: null, reason: '' });
      await load();
    } catch (e) {
      const msg = e?.response?.data?.error || e?.response?.data?.message || e?.message;
      notifyToast(`Could not reject the request${msg ? `: ${msg}` : ''}.`, 'error');
    } finally {
      setBusyId(null);
    }
  };

  // Sortable header cell — click to sort, shows the active direction.
  const SortTH = ({ label, k, align = 'left', width }) => {
    const active = sort.key === k;
    return (
      <th onClick={() => toggleSort(k)} title="Click to sort"
        style={{ padding: '12px 14px', textAlign: align, fontSize: '9.5px', fontWeight: 950, color: active ? '#1d4ed8' : '#64748b', letterSpacing: '0.8px', borderBottom: '1px solid #e7ecf3', width, whiteSpace: 'nowrap', cursor: 'pointer', userSelect: 'none' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', justifyContent: align === 'right' ? 'flex-end' : 'flex-start' }}>
          {label}
          <span style={{ fontSize: '9px', color: active ? '#1d4ed8' : '#cbd5e1' }}>{active ? (sort.dir === 'asc' ? '▲' : '▼') : '↕'}</span>
        </span>
      </th>
    );
  };

  // Date filter pill (History only).
  const FilterPill = ({ k, label }) => {
    const active = dateFilter === k;
    return (
      <button onClick={() => setDateFilter(k)}
        style={{ padding: '8px 13px', borderRadius: '999px', border: '1px solid', borderColor: active ? '#1d4ed8' : '#e2e8f0', background: active ? '#1d4ed8' : 'white', color: active ? 'white' : '#64748b', fontSize: '12px', fontWeight: 800, cursor: 'pointer', whiteSpace: 'nowrap' }}>
        {label}
      </button>
    );
  };

  return (
    <div style={{ padding: '25px', minHeight: 'calc(100vh - 64px)', background: '#f8fafc' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: '14px', marginBottom: '18px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 800, color: '#0a1628', margin: 0, display: 'flex', alignItems: 'center', gap: '10px' }}>
            🛡️ Admin Approval
            {pendingCount > 0 && (
              <span style={{ fontSize: '12px', fontWeight: 900, color: '#b45309', background: '#fffbeb', border: '1px solid #fde68a', padding: '3px 10px', borderRadius: '999px' }}>
                {pendingCount} waiting
              </span>
            )}
          </h1>
          <p style={{ fontSize: '13px', color: '#6b7280', marginTop: '4px', maxWidth: '620px' }}>
            Sign off on sensitive money changes — payment edits, paid-appointment cancellations,
            referrer changes, free tests and reverting paid commissions.
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '6px', marginBottom: '16px', padding: '5px', background: '#eef2f7', borderRadius: '12px', width: 'fit-content' }}>
        {[['PENDING', 'Pending'], ['ALL', 'History']].map(([k, lbl]) => (
          <button key={k} onClick={() => setTab(k)}
            style={{ padding: '9px 20px', borderRadius: '8px', border: 'none', fontSize: '13px', fontWeight: 800, cursor: 'pointer',
              background: tab === k ? 'white' : 'transparent', color: tab === k ? '#1d4ed8' : '#6b7280',
              boxShadow: tab === k ? '0 2px 8px rgba(0,0,0,0.08)' : 'none' }}>
            {lbl}{k === 'PENDING' && pendingCount > 0 ? ` · ${pendingCount}` : ''}
          </button>
        ))}
        <button onClick={load} title="Refresh" style={{ padding: '9px 14px', borderRadius: '8px', border: 'none', background: 'transparent', color: '#6b7280', fontSize: '15px', fontWeight: 700, cursor: 'pointer' }}>↻</button>
      </div>

      {/* Toolbar — search (both tabs) + date filter (History) */}
      {rows.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'center', marginBottom: '14px' }}>
          <div style={{ position: 'relative', flex: '1 1 240px', maxWidth: '380px' }}>
            <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', fontSize: '13px', color: '#94a3b8', pointerEvents: 'none' }}>🔍</span>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search request, person or reason…"
              style={{ width: '100%', boxSizing: 'border-box', padding: '10px 32px 10px 34px', borderRadius: '11px', border: '1px solid #e2e8f0', fontSize: '13px', fontWeight: 600, color: '#1e293b', outline: 'none', background: 'white' }}
              onFocus={(e) => { e.currentTarget.style.borderColor = '#1d4ed8'; }}
              onBlur={(e) => { e.currentTarget.style.borderColor = '#e2e8f0'; }}
            />
            {search && (
              <button onClick={() => setSearch('')} title="Clear"
                style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', border: 'none', background: '#f1f5f9', color: '#64748b', width: '20px', height: '20px', borderRadius: '50%', fontSize: '11px', fontWeight: 900, cursor: 'pointer', lineHeight: 1 }}>✕</button>
            )}
          </div>

          {isHistory && (
            <div style={{ display: 'flex', gap: '6px', overflowX: 'auto', paddingBottom: '2px', flex: '1 1 auto' }}>
              <FilterPill k="ALL" label="All" />
              <FilterPill k="TODAY" label="Today" />
              <FilterPill k="YESTERDAY" label="Yesterday" />
              <FilterPill k="THIS_MONTH" label="This month" />
              {monthOptions.map(k => <FilterPill key={k} k={k} label={monthLabel(k)} />)}
            </div>
          )}

          <span style={{ fontSize: '11.5px', fontWeight: 700, color: '#94a3b8', whiteSpace: 'nowrap', marginLeft: 'auto' }}>
            {viewRows.length} {viewRows.length === 1 ? 'result' : 'results'}
          </span>
        </div>
      )}

      {/* Body */}
      {loading ? (
        <div style={{ padding: '60px', textAlign: 'center', color: '#94a3b8', fontSize: '13px' }}>Loading…</div>
      ) : rows.length === 0 ? (
        <div style={{ padding: '60px 40px', textAlign: 'center', background: 'white', borderRadius: '18px', border: '1px solid #e2e8f0', boxShadow: '0 2px 10px rgba(0,0,0,0.03)' }}>
          <div style={{ fontSize: '44px', marginBottom: '10px' }}>{isHistory ? '🗂️' : '🎉'}</div>
          <div style={{ fontSize: '16px', fontWeight: 800, color: '#1e293b' }}>
            {isHistory ? 'No approval history yet' : 'All caught up!'}
          </div>
          <div style={{ fontSize: '13px', color: '#94a3b8', marginTop: '4px' }}>
            {isHistory ? 'Reviewed requests will be listed here.' : 'There are no requests waiting for your sign-off. Nice work.'}
          </div>
        </div>
      ) : (
        <div style={{ background: 'white', borderRadius: '18px', border: '1px solid #e7ecf3', boxShadow: '0 4px 18px rgba(15,23,42,0.05)', overflow: 'hidden' }}>
          {viewRows.length === 0 ? (
            <div style={{ padding: '56px 40px', textAlign: 'center' }}>
              <div style={{ fontSize: '38px', marginBottom: '8px' }}>🔍</div>
              <div style={{ fontSize: '15px', fontWeight: 800, color: '#1e293b' }}>No matching requests</div>
              <div style={{ fontSize: '12.5px', color: '#94a3b8', marginTop: '4px' }}>Try a different search or date filter.</div>
            </div>
          ) : (
          <>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: isHistory ? '920px' : '760px' }}>
              <thead style={{ background: 'linear-gradient(180deg, #f8fafc, #f1f5f9)' }}>
                <tr>
                  <SortTH label="Request" k="request" width="20%" />
                  <SortTH label="Requested by" k="requester" width="16%" />
                  <SortTH label="Reason" k="reason" />
                  <SortTH label="Requested" k="requested" width="13%" />
                  {isHistory ? (
                    <>
                      <SortTH label="Decision" k="decision" width="17%" />
                      <SortTH label="Admin's note" k="note" width="20%" />
                    </>
                  ) : (
                    <TH align="right" width="180px">Action</TH>
                  )}
                </tr>
              </thead>
              <tbody>
                {pagedRows.map((row, i) => {
                  const s = STATUS_META[row.status] || STATUS_META.PENDING;
                  return (
                    <tr key={row.id}
                      style={{ borderTop: i === 0 ? 'none' : '1px solid #f1f5f9', transition: 'background 0.12s' }}
                      onMouseOver={(e) => { e.currentTarget.style.background = '#f8fafc'; }}
                      onMouseOut={(e) => { e.currentTarget.style.background = 'transparent'; }}
                    >
                      {/* Request: type chip + title */}
                      <TD>
                        <TypeChip type={row.type} />
                        <div style={{ fontSize: '12.5px', fontWeight: 800, color: '#1e293b', marginTop: '7px', lineHeight: 1.35 }}>{row.title || '—'}</div>
                      </TD>

                      {/* Requested by */}
                      <TD>
                        <Person name={row.requestedByName} sub="Requester" />
                      </TD>

                      {/* Reason of request */}
                      <TD>
                        <div style={{ fontSize: '12px', color: '#475569', lineHeight: 1.5, maxWidth: '280px' }}>
                          {row.reason || <span style={{ color: '#cbd5e1' }}>—</span>}
                        </div>
                      </TD>

                      {/* Requested date/time (IST) + how long it's been waiting */}
                      <TD>
                        <DateCell iso={row.createdAt} />
                        {row.status === 'PENDING' && (
                          <div style={{ marginTop: '6px', display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '9.5px', fontWeight: 900, color: '#b45309', background: '#fffbeb', border: '1px solid #fde68a', padding: '3px 8px', borderRadius: '999px', whiteSpace: 'nowrap' }}>
                            ⏳ awaiting {awaitedFor(row.createdAt)}
                          </div>
                        )}
                      </TD>

                      {isHistory ? (
                        <>
                          {/* Decision: status + who + when */}
                          <TD>
                            <StatusChip status={row.status} />
                            {(row.reviewedByName || row.reviewedAt) && (
                              <div style={{ marginTop: '7px', fontSize: '10.5px', color: '#94a3b8', fontWeight: 700, lineHeight: 1.5 }}>
                                {row.reviewedByName && <div style={{ color: '#64748b', fontWeight: 800 }}>by {row.reviewedByName}</div>}
                                {row.reviewedAt && <div>{fmtDate(row.reviewedAt)} · {fmtTime(row.reviewedAt)}</div>}
                              </div>
                            )}
                          </TD>
                          {/* Admin's note / reason for rejection */}
                          <TD>
                            {row.reviewNote ? (
                              <div style={{ fontSize: '11.5px', color: row.status === 'REJECTED' ? '#991b1b' : '#475569', background: row.status === 'REJECTED' ? '#fef2f2' : '#f8fafc', border: `1px solid ${row.status === 'REJECTED' ? '#fecaca' : '#eef2f7'}`, padding: '8px 10px', borderRadius: '9px', lineHeight: 1.5, maxWidth: '260px' }}>
                                {row.reviewNote}
                              </div>
                            ) : (
                              <span style={{ fontSize: '11px', color: '#cbd5e1', fontWeight: 700 }}>—</span>
                            )}
                          </TD>
                        </>
                      ) : (
                        /* Action buttons */
                        <TD align="right">
                          <div style={{ display: 'inline-flex', gap: '8px' }}>
                            <button onClick={() => setApproveModal({ open: true, row, note: '' })} disabled={busyId === row.id}
                              style={{ padding: '9px 16px', borderRadius: '10px', border: 'none', background: 'linear-gradient(135deg, #16a34a, #15803d)', color: 'white', fontSize: '12px', fontWeight: 900, cursor: busyId === row.id ? 'not-allowed' : 'pointer', opacity: busyId === row.id ? 0.55 : 1, boxShadow: '0 4px 12px -3px rgba(22,163,74,0.4)' }}>
                              ✓ Approve
                            </button>
                            <button onClick={() => setReject({ open: true, row, reason: '' })} disabled={busyId === row.id}
                              style={{ padding: '9px 16px', borderRadius: '10px', border: '1px solid #fecaca', background: 'white', color: '#dc2626', fontSize: '12px', fontWeight: 900, cursor: busyId === row.id ? 'not-allowed' : 'pointer', opacity: busyId === row.id ? 0.55 : 1 }}>
                              ✕ Reject
                            </button>
                          </div>
                        </TD>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {totalPages > 1 && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', padding: '14px 18px', borderTop: '1px solid #eef2f7', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '11.5px', fontWeight: 700, color: '#94a3b8' }}>
                Page {safePage} of {totalPages} · {viewRows.length} total
              </span>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={safePage <= 1}
                  style={{ padding: '7px 12px', borderRadius: '9px', border: '1px solid #e2e8f0', background: 'white', color: safePage <= 1 ? '#cbd5e1' : '#475569', fontSize: '12px', fontWeight: 800, cursor: safePage <= 1 ? 'not-allowed' : 'pointer' }}>
                  ‹ Prev
                </button>
                {(() => {
                  const span = 2;
                  const start = Math.max(1, safePage - span);
                  const end = Math.min(totalPages, safePage + span);
                  const nums = [];
                  for (let i = start; i <= end; i++) nums.push(i);
                  return nums.map(n => (
                    <button key={n} onClick={() => setPage(n)}
                      style={{ minWidth: '32px', padding: '7px 10px', borderRadius: '9px', border: '1px solid', borderColor: n === safePage ? '#1d4ed8' : '#e2e8f0', background: n === safePage ? '#1d4ed8' : 'white', color: n === safePage ? 'white' : '#475569', fontSize: '12px', fontWeight: 800, cursor: 'pointer' }}>
                      {n}
                    </button>
                  ));
                })()}
                <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={safePage >= totalPages}
                  style={{ padding: '7px 12px', borderRadius: '9px', border: '1px solid #e2e8f0', background: 'white', color: safePage >= totalPages ? '#cbd5e1' : '#475569', fontSize: '12px', fontWeight: 800, cursor: safePage >= totalPages ? 'not-allowed' : 'pointer' }}>
                  Next ›
                </button>
              </div>
            </div>
          )}
          </>
          )}
        </div>
      )}

      {/* Reject modal — captures the admin's reason (shown to the requester + in History) */}
      {reject.open && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', backdropFilter: 'blur(2px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}
          onClick={() => !busyId && setReject({ open: false, row: null, reason: '' })}>
          <div onClick={(e) => e.stopPropagation()}
            style={{ width: '100%', maxWidth: '440px', background: 'white', borderRadius: '18px', padding: '24px', boxShadow: '0 24px 60px -12px rgba(0,0,0,0.35)' }}>
            <div style={{ width: '52px', height: '52px', borderRadius: '50%', background: 'linear-gradient(135deg, #fee2e2, #fecaca)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '22px', margin: '0 auto 14px' }}>✕</div>
            <h3 style={{ margin: 0, textAlign: 'center', fontSize: '16px', fontWeight: 900, color: '#1e293b' }}>Reject this request?</h3>
            <p style={{ textAlign: 'center', fontSize: '12.5px', color: '#64748b', margin: '8px 0 18px', lineHeight: 1.5 }}>
              {reject.row?.title}. The requester will see your reason, so be clear.
            </p>
            <label style={{ display: 'block', fontSize: '10px', fontWeight: 950, color: '#64748b', letterSpacing: '0.6px', marginBottom: '6px' }}>
              REASON FOR REJECTION <span style={{ color: '#e11d48' }}>*</span>
            </label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '10px' }}>
              {['Payment was actually collected', 'Not enough justification', 'Duplicate request', 'Check with admin first'].map(s => (
                <button key={s} type="button" onClick={() => setReject(r => ({ ...r, reason: r.reason === s ? '' : s }))}
                  style={{ padding: '6px 11px', borderRadius: '999px', border: '1px solid', borderColor: reject.reason === s ? '#e11d48' : '#e2e8f0', background: reject.reason === s ? '#e11d48' : '#f8fafc', color: reject.reason === s ? 'white' : '#475569', fontSize: '11px', fontWeight: 800, cursor: 'pointer' }}>
                  {s}
                </button>
              ))}
            </div>
            <textarea
              value={reject.reason}
              onChange={(e) => setReject({ ...reject, reason: e.target.value })}
              autoFocus rows={3}
              placeholder="e.g. Patient was actually charged — keep the payment as recorded."
              style={{ width: '100%', boxSizing: 'border-box', resize: 'vertical', padding: '11px 12px', borderRadius: '10px', border: '1.5px solid #e2e8f0', fontSize: '12.5px', fontWeight: 600, color: '#1e293b', outline: 'none', lineHeight: 1.5, fontFamily: 'system-ui, -apple-system, sans-serif' }}
              onFocus={(e) => { e.currentTarget.style.borderColor = '#e11d48'; }}
              onBlur={(e) => { e.currentTarget.style.borderColor = '#e2e8f0'; }}
            />
            <div style={{ display: 'flex', gap: '10px', marginTop: '18px' }}>
              <button onClick={() => setReject({ open: false, row: null, reason: '' })} disabled={!!busyId}
                style={{ flex: 1, padding: '12px', borderRadius: '11px', border: 'none', background: '#f1f5f9', color: '#475569', fontSize: '12px', fontWeight: 900, cursor: 'pointer' }}>
                Cancel
              </button>
              <button onClick={submitReject} disabled={!!busyId || reject.reason.trim().length < 4}
                style={{ flex: 1.3, padding: '12px', borderRadius: '11px', border: 'none', color: 'white', fontSize: '12px', fontWeight: 900,
                  background: (busyId || reject.reason.trim().length < 4) ? '#cbd5e1' : 'linear-gradient(135deg, #e11d48, #be123c)',
                  cursor: (busyId || reject.reason.trim().length < 4) ? 'not-allowed' : 'pointer',
                  boxShadow: (busyId || reject.reason.trim().length < 4) ? 'none' : '0 8px 18px -4px rgba(225,29,72,0.4)' }}>
                {busyId ? 'Rejecting…' : 'Confirm reject'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Approve modal — optional note + one-tap suggestions (approval is the happy path) */}
      {approveModal.open && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', backdropFilter: 'blur(2px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}
          onClick={() => !busyId && setApproveModal({ open: false, row: null, note: '' })}>
          <div onClick={(e) => e.stopPropagation()}
            style={{ width: '100%', maxWidth: '440px', background: 'white', borderRadius: '18px', padding: '24px', boxShadow: '0 24px 60px -12px rgba(0,0,0,0.35)' }}>
            <div style={{ width: '52px', height: '52px', borderRadius: '50%', background: 'linear-gradient(135deg, #dcfce7, #bbf7d0)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '22px', margin: '0 auto 14px' }}>✓</div>
            <h3 style={{ margin: 0, textAlign: 'center', fontSize: '16px', fontWeight: 900, color: '#1e293b' }}>Approve this request?</h3>
            <p style={{ textAlign: 'center', fontSize: '12.5px', color: '#64748b', margin: '8px 0 16px', lineHeight: 1.5 }}>
              {approveModal.row?.title}. The change is applied right away — add a note if useful.
            </p>
            <label style={{ display: 'block', fontSize: '10px', fontWeight: 950, color: '#64748b', letterSpacing: '0.6px', marginBottom: '8px' }}>
              NOTE <span style={{ color: '#94a3b8', fontWeight: 800 }}>· optional</span>
            </label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '10px' }}>
              {['Verified with biller', 'Genuine correction', 'Approved per policy', 'Checked & valid'].map(s => (
                <button key={s} type="button" onClick={() => setApproveModal(m => ({ ...m, note: m.note === s ? '' : s }))}
                  style={{ padding: '6px 11px', borderRadius: '999px', border: '1px solid', borderColor: approveModal.note === s ? '#16a34a' : '#e2e8f0', background: approveModal.note === s ? '#16a34a' : '#f8fafc', color: approveModal.note === s ? 'white' : '#475569', fontSize: '11px', fontWeight: 800, cursor: 'pointer' }}>
                  {s}
                </button>
              ))}
            </div>
            <textarea
              value={approveModal.note}
              onChange={(e) => setApproveModal({ ...approveModal, note: e.target.value })}
              rows={2}
              placeholder="e.g. Verified with the biller — genuine correction."
              style={{ width: '100%', boxSizing: 'border-box', resize: 'vertical', padding: '11px 12px', borderRadius: '10px', border: '1.5px solid #e2e8f0', fontSize: '12.5px', fontWeight: 600, color: '#1e293b', outline: 'none', lineHeight: 1.5, fontFamily: 'system-ui, -apple-system, sans-serif' }}
              onFocus={(e) => { e.currentTarget.style.borderColor = '#16a34a'; }}
              onBlur={(e) => { e.currentTarget.style.borderColor = '#e2e8f0'; }}
            />
            <div style={{ display: 'flex', gap: '10px', marginTop: '18px' }}>
              <button onClick={() => setApproveModal({ open: false, row: null, note: '' })} disabled={!!busyId}
                style={{ flex: 1, padding: '12px', borderRadius: '11px', border: 'none', background: '#f1f5f9', color: '#475569', fontSize: '12px', fontWeight: 900, cursor: 'pointer' }}>
                Cancel
              </button>
              <button onClick={submitApprove} disabled={!!busyId}
                style={{ flex: 1.3, padding: '12px', borderRadius: '11px', border: 'none', color: 'white', fontSize: '12px', fontWeight: 900,
                  background: busyId ? '#cbd5e1' : 'linear-gradient(135deg, #16a34a, #15803d)',
                  cursor: busyId ? 'not-allowed' : 'pointer',
                  boxShadow: busyId ? 'none' : '0 8px 18px -4px rgba(22,163,74,0.4)' }}>
                {busyId ? 'Approving…' : '✓ Confirm approve'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
