import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import apiClient from '../api/apiClient';
import useAuth from '../auth/useAuth';
import { nativeStorage } from '../hooks/useElectron';
import { ROLE_LABELS } from '../data/roles';

const MONTHS    = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const TODAY     = new Date();
const TODAY_STR = TODAY.toISOString().split('T')[0];
const THIS_MONTH = `${TODAY.getFullYear()}-${String(TODAY.getMonth()+1).padStart(2,'0')}`;

// Leave types come from /leave-policy. Until that returns a populated array,
// the dashboard treats the policy as empty (no quota).

// ── Pure payroll math (kept local — small surface, no need to share yet) ────
const SAL_FIELDS = ['basicPay','hra','travel','otherAllowances','pfDeduction','tds','otherDeductions'];

function normalizeStaffSalary(raw) {
  if (!raw) return { revisions: [], disbursements: [] };
  if (Array.isArray(raw.revisions)) return { revisions: raw.revisions, disbursements: raw.disbursements || [] };
  const hasFlat = SAL_FIELDS.some(k => raw[k] !== undefined && raw[k] !== '' && raw[k] !== null);
  if (!hasFlat) return { revisions: [], disbursements: raw.disbursements || [] };
  const legacy = { id: 'rev_legacy', effectiveFrom: '2020-01-01', note: 'Initial', createdAt: new Date().toISOString() };
  SAL_FIELDS.forEach(k => { legacy[k] = raw[k] || ''; });
  return { revisions: [legacy], disbursements: raw.disbursements || [] };
}

function pickRevision(record, asOfDate = TODAY_STR) {
  const revs = (record?.revisions || []).filter(r => (r.effectiveFrom || '0000-00-00') <= asOfDate);
  if (revs.length === 0) return null;
  return revs.sort((a, b) => (b.effectiveFrom || '').localeCompare(a.effectiveFrom || ''))[0];
}

function computeFromRevision(rev) {
  if (!rev) return { gross: 0, deductions: 0, net: 0 };
  const gross = ['basicPay','hra','travel','otherAllowances'].reduce((s,k) => s + (Number(rev[k])||0), 0);
  const deductions = ['pfDeduction','tds','otherDeductions'].reduce((s,k) => s + (Number(rev[k])||0), 0);
  return { gross, deductions, net: Math.max(0, gross - deductions) };
}

function safeParse(s) { try { return JSON.parse(s); } catch { return null; } }

// Map API salary DTO → local shape (matches StaffPage's mapApiSalary)
function mapApiSalary(dto) {
  if (!dto) return null;
  return {
    revisions: (dto.revisions || []).map(r => ({
      id: r.revisionId, effectiveFrom: r.effectiveFrom,
      basicPay: r.basicPay, hra: r.hra, travel: r.travel, otherAllowances: r.otherAllowances,
      pfDeduction: r.pfDeduction, tds: r.tds, otherDeductions: r.otherDeductions,
      note: r.note, createdAt: r.createdAt,
    })),
    disbursements: (dto.disbursements || []).map(d => ({
      id: d.disbursementId, revisionId: d.revisionId, month: d.month,
      grossPay: d.grossPay, netPay: d.netPay,
      lwpDays: d.lwpDays, lwpDeduction: d.lwpDeduction,
      mode: d.paymentMode, reference: d.reference,
    })),
  };
}

// ── Role colour palette (mirrors StaffPage) ─────────────────────────────────
const ROLE_META = {
  doctor:       { color: '#0891b2', bg: '#f0faff', label: 'Doctor' },
  admindoctor:  { color: '#6366f1', bg: '#f0f5ff', label: 'Admin Doctor' },
  technician:   { color: '#d97706', bg: '#fffbeb', label: 'Technician' },
  receptionist: { color: '#e84393', bg: '#fdf0f6', label: 'Receptionist' },
  admin:        { color: '#0f52ba', bg: '#e8f0fe', label: 'Admin' },
  accountant:   { color: '#059669', bg: '#ecfdf5', label: 'Accountant' },
};
const roleMeta = (r) => ROLE_META[r] || { color: '#94a3b8', bg: '#f8fafc', label: r || 'Staff' };

// ════════════════════════════════════════════════════════════════════════════
export default function StaffDashboardPage({ onSelectStaff, embedded = false }) {
  const navigate = useNavigate();
  const { activeCenter } = useAuth();
  const handleOpenStaff = (staff) => {
    if (typeof onSelectStaff === 'function') onSelectStaff(staff);
    else navigate('/staff');
  };

  const [personnel,     setPersonnel]    = useState([]);
  const [salaryByStaff, setSalaryByStaff] = useState({}); // { staffId: normalized salary record }
  const [attendance,    setAttendance]   = useState({});
  const [leaves,        setLeaves]       = useState([]);
  const [leavePolicy,   setLeavePolicy]  = useState([]);
  const [loading,       setLoading]      = useState(false);
  const [search,        setSearch]       = useState('');
  const [selectedMonth, setSelectedMonth] = useState(THIS_MONTH);

  // Last 24 months for the dropdown (most recent first).
  const monthOptions = useMemo(() => {
    const opts = [];
    const today = new Date();
    for (let i = 0; i < 24; i++) {
      const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
      const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const label = `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
      opts.push({ value, label });
    }
    return opts;
  }, []);

  const selectedMonthLabel = useMemo(() => {
    const [yr, mn] = selectedMonth.split('-').map(Number);
    return `${MONTHS[mn - 1]} ${yr}`;
  }, [selectedMonth]);

  const stepMonth = (delta) => {
    const [yr, mn] = selectedMonth.split('-').map(Number);
    const d = new Date(yr, mn - 1 + delta, 1);
    setSelectedMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  };
  const isCurrentMonth = selectedMonth === THIS_MONTH;

  // ── Load everything in parallel ────────────────────────────────────────
  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [staffRes, polRes, att, lv] = await Promise.all([
        apiClient.get('/staff'),
        apiClient.get('/leave-policy').catch(() => ({ data: null })),
        nativeStorage.get('1rad_staff_attendance'),
        nativeStorage.get('1rad_staff_leave'),
      ]);

      const mapped = (staffRes.data || []).map(p => ({
        id:             p.staffId,
        employeeCode:   p.employeeCode || '',
        name:           p.fullName || 'Unknown',
        email:          p.email,
        mobile:         p.mobile,
        roles:          (p.roleNames || []).map(r => String(r).toLowerCase()),
        designation:    p.designation,
        department:     p.department,
        employmentType: p.employmentType,
        specialization: p.specialization,
        degree:         p.degree,
        licenseNo:      p.licenseNo,
        joiningDate:    p.joiningDate,
        status:         p.status || 'Active',
        photoUrl:       p.photoUrl || null,
        createdAt:      p.createdAt,
        updatedAt:      p.updatedAt,
      }));
      setPersonnel(mapped);
      setAttendance(att || {});
      setLeaves(lv || []);

      const parsedPolicy = safeParse(polRes.data?.leaveTypesJson);
      if (Array.isArray(parsedPolicy) && parsedPolicy.length > 0) setLeavePolicy(parsedPolicy);

      // Fan-out salary fetches in parallel.
      const salaries = await Promise.all(
        mapped.map(s => apiClient
          .get(`/staff/${s.id}/salary`)
          .then(r => [s.id, normalizeStaffSalary(mapApiSalary(r.data))])
          .catch(() => [s.id, null])
        )
      );
      const sMap = {};
      salaries.forEach(([id, rec]) => { if (rec) sMap[id] = rec; });
      setSalaryByStaff(sMap);
    } catch (err) {
      console.error('[DASHBOARD] Load failed', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll, activeCenter?.id]);

  // ── Per-staff payroll computation for current month ────────────────────
  const computeMonthlyForStaff = useCallback((staffId, month = THIS_MONTH) => {
    const [yr, mn] = month.split('-').map(Number);
    const daysInMonth = new Date(yr, mn, 0).getDate();
    const lastDay = `${month}-${String(daysInMonth).padStart(2, '0')}`;
    const record = salaryByStaff[staffId];
    const active = pickRevision(record, lastDay);
    const { gross, net } = computeFromRevision(active);

    // Attendance counts
    const attRec = attendance[staffId] || {};
    const counts = { present: 0, absent: 0, halfday: 0, late: 0, leave: 0 };
    Object.entries(attRec).forEach(([d, s]) => {
      if (d.startsWith(month) && counts[s] !== undefined) counts[s]++;
    });

    // Approved leaves chronologically — paid-up-to-quota then LWP
    const yearLeaves = leaves
      .filter(l => l.staffId === staffId && l.status === 'approved' && l.from?.startsWith(String(yr)))
      .sort((a, b) => (a.from || '').localeCompare(b.from || ''));
    const quotas = Object.fromEntries(leavePolicy.map(t => [t.name, t.annualQuota]));
    const remaining = { ...quotas };
    let lwpLeaveInMonth = 0;
    let lwpLeaveYTD     = 0; // across whole year
    let totalLeaveYTD   = 0; // approved leave days year-to-date
    for (const lv of yearLeaves) {
      const start = new Date(lv.from);
      const end = new Date(lv.to);
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const ds = d.toISOString().slice(0, 10);
        const inMonth = ds.startsWith(month);
        totalLeaveYTD += 1;
        if ((remaining[lv.type] || 0) > 0) {
          remaining[lv.type] -= 1;
        } else {
          lwpLeaveYTD += 1;
          if (inMonth) lwpLeaveInMonth += 1;
        }
      }
    }

    const attendanceDays = counts.present + counts.late + 0.5 * counts.halfday;
    const lwpDays = counts.absent + 0.5 * counts.halfday + lwpLeaveInMonth;
    const perDay = daysInMonth > 0 ? gross / daysInMonth : 0;
    const lwpDeduction = Math.round(perDay * lwpDays);
    const proRatedNet = Math.max(0, net - lwpDeduction);

    const disbThisMonth = (record?.disbursements || []).find(d => d.month === month);
    return {
      hasStructure: !!active,
      structureNet: net,
      structureGross: gross,
      counts,
      attendanceDays,
      totalLeaveYTD,
      lwpLeaveYTD,
      lwpLeaveInMonth,
      lwpDays,
      lwpDeduction,
      proRatedNet,
      disbursed: !!disbThisMonth,
      disbursedNet: disbThisMonth?.netPay || 0,
    };
  }, [salaryByStaff, attendance, leaves, leavePolicy]);

  // ── Per-staff leave balance summary ────────────────────────────────────
  const leaveBalanceForStaff = useCallback((staffId) => {
    const year = TODAY.getFullYear();
    const used = Object.fromEntries(leavePolicy.map(t => [t.name, 0]));
    leaves
      .filter(l => l.staffId === staffId && l.status === 'approved' && l.from?.startsWith(String(year)))
      .forEach(l => { if (used[l.type] !== undefined) used[l.type] += l.days; });
    const totalQuota = leavePolicy.reduce((s, t) => s + t.annualQuota, 0);
    const totalUsed  = Object.values(used).reduce((s, v) => s + v, 0);
    return {
      totalUsed,
      totalQuota,
      remaining: Math.max(0, totalQuota - totalUsed),
      byType: leavePolicy.map(t => ({
        name: t.name, color: t.color, quota: t.annualQuota, used: used[t.name] || 0,
        remaining: Math.max(0, t.annualQuota - (used[t.name] || 0)),
      })),
    };
  }, [leaves, leavePolicy]);

  // ── Build row data ────────────────────────────────────────────────────
  const rows = useMemo(() => {
    const q = search.toLowerCase();
    return personnel
      .filter(u =>
        u.name.toLowerCase().includes(q) || (u.email || '').toLowerCase().includes(q)
      )
      .map(u => {
        const payroll = computeMonthlyForStaff(u.id, selectedMonth);
        const leave   = leaveBalanceForStaff(u.id);
        return { staff: u, payroll, leave };
      });
  }, [personnel, search, selectedMonth, computeMonthlyForStaff, leaveBalanceForStaff]);

  // ── KPI summary ────────────────────────────────────────────────────────
  const kpis = useMemo(() => {
    const totalPayrollDue = rows.reduce((s, r) => s + (r.payroll.disbursed ? 0 : r.payroll.proRatedNet), 0);
    const totalDisbursed  = rows.reduce((s, r) => s + (r.payroll.disbursed ? r.payroll.disbursedNet : 0), 0);
    const pending = rows.filter(r => !r.payroll.disbursed && r.payroll.hasStructure).length;
    const paid    = rows.filter(r => r.payroll.disbursed).length;
    return { total: rows.length, pending, paid, totalPayrollDue, totalDisbursed };
  }, [rows]);

  // ════════════════════════════════════════════════════════════════════
  return (
    <div style={{
      padding: embedded ? '0' : '16px 20px',
      fontFamily: '"Inter", "Segoe UI", system-ui, sans-serif',
      minHeight: embedded ? 'auto' : '100vh',
      background: embedded ? 'transparent' : '#f1f5f9',
      boxSizing: 'border-box',
    }}>
      {/* Hero — hidden when embedded inside StaffPage (StaffPage shows its own hero) */}
      {!embedded && <div style={{
        position: 'relative',
        background: 'linear-gradient(135deg, #0a1628 0%, #1e3a5f 100%)',
        borderRadius: '14px', padding: '14px 22px',
        boxShadow: '0 6px 20px rgba(10, 22, 40, 0.15)',
        overflow: 'hidden', marginBottom: '14px',
      }}>
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '3px', background: 'linear-gradient(90deg, transparent, #d4a017 30%, #f5d76e 50%, #d4a017 70%, transparent)' }} />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <div style={{ fontSize: '10px', fontWeight: 700, color: '#d4a017', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: '6px' }}>
              Workforce Overview
            </div>
            <h1 style={{ fontSize: '18px', fontWeight: 800, color: 'white', margin: 0, letterSpacing: '-0.3px' }}>Staff Dashboard</h1>
            <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.55)', fontWeight: 500, marginTop: '2px', display: 'block' }}>
              {activeCenter?.name || 'Your facility'} · {selectedMonthLabel} payroll snapshot
            </span>
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <button
              onClick={loadAll}
              style={{ padding: '9px 16px', borderRadius: '10px', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.18)', fontSize: '12px', fontWeight: 700, color: 'rgba(255,255,255,0.85)', cursor: 'pointer' }}
            >↻ Refresh</button>
            {!embedded && (
              <button
                onClick={() => navigate('/staff')}
                style={{
                  padding: '10px 20px', borderRadius: '10px',
                  background: 'linear-gradient(135deg, #d4a017 0%, #b8860b 100%)',
                  color: '#0a1628', border: 'none',
                  fontSize: '12px', fontWeight: 800, cursor: 'pointer',
                  boxShadow: '0 6px 18px rgba(212, 160, 23, 0.35)',
                }}
              >Manage Staff →</button>
            )}
          </div>
        </div>
      </div>}

      {/* KPI strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '14px' }}>
        <KpiCard label="Total staff" value={kpis.total} tone="blue" />
        <KpiCard label={`Paid in ${selectedMonthLabel}`} value={kpis.paid} sub={`₹${kpis.totalDisbursed.toLocaleString()}`} tone="green" />
        <KpiCard label="Pending disbursement" value={kpis.pending} sub={`₹${kpis.totalPayrollDue.toLocaleString()} due`} tone="amber" />
        <KpiCard label="Active leave policy" value={`${leavePolicy.length} types`} sub={`${leavePolicy.reduce((s,t)=>s+t.annualQuota,0)} days/yr`} tone="purple" />
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
        <input
          type="text" placeholder="🔍 Search name or email…"
          value={search} onChange={e => setSearch(e.target.value)}
          style={{ flex: 1, minWidth: '220px', padding: '9px 14px', borderRadius: '10px', border: '1px solid #e2e8f0', fontSize: '13px', outline: 'none', background: 'white' }}
        />

        {/* Month picker — stepper + dropdown */}
        <div style={{ display: 'flex', alignItems: 'center', background: 'white', border: '1px solid #e2e8f0', borderRadius: '10px', overflow: 'hidden' }}>
          <button
            type="button"
            onClick={() => stepMonth(-1)}
            title="Previous month"
            style={{ width: '34px', height: '38px', border: 'none', background: 'transparent', color: '#475569', fontSize: '14px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >‹</button>
          <select
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            style={{
              height: '38px', padding: '0 6px',
              border: 'none', borderLeft: '1px solid #e2e8f0', borderRight: '1px solid #e2e8f0',
              background: 'white', color: '#0a1628',
              fontSize: '12px', fontWeight: 700, cursor: 'pointer', outline: 'none',
              minWidth: '140px', textAlign: 'center', textAlignLast: 'center',
            }}
          >
            {monthOptions.map(o => (
              <option key={o.value} value={o.value}>{o.label}{o.value === THIS_MONTH ? '  · This month' : ''}</option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => stepMonth(1)}
            disabled={isCurrentMonth}
            title={isCurrentMonth ? 'Already at current month' : 'Next month'}
            style={{ width: '34px', height: '38px', border: 'none', background: 'transparent', color: isCurrentMonth ? '#cbd5e1' : '#475569', fontSize: '14px', fontWeight: 700, cursor: isCurrentMonth ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >›</button>
        </div>

        {!isCurrentMonth && (
          <button
            type="button"
            onClick={() => setSelectedMonth(THIS_MONTH)}
            style={{ height: '38px', padding: '0 14px', borderRadius: '10px', border: '1px solid #fde68a', background: '#fff8e6', color: '#92400e', fontSize: '11px', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}
          >↺ Reset to current</button>
        )}
      </div>

      {/* Table */}
      <div style={{ background: 'white', borderRadius: '14px', border: '1px solid #e8edf2', boxShadow: '0 2px 8px rgba(0,0,0,0.04)', overflow: 'auto' }}>
        {(() => {
          const gridCols = '1.7fr 110px 90px 100px 120px 1.1fr 1.2fr 110px 70px';
          return (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: gridCols, padding: '12px 18px', background: '#fafbfc', borderBottom: '1px solid #f1f5f9', fontSize: '9px', fontWeight: 900, color: '#94a3b8', letterSpacing: '1px', textTransform: 'uppercase', minWidth: '1240px', gap: '10px' }}>
                <span>Employee</span>
                <span>Employee ID</span>
                <span style={{ textAlign: 'center' }}>Attendance</span>
                <span style={{ textAlign: 'center' }}>Leave applied</span>
                <span style={{ textAlign: 'center' }}>Extra Loss of Pay</span>
                <span style={{ textAlign: 'right' }}>Net pay / month</span>
                <span style={{ textAlign: 'right' }}>Payroll this month</span>
                <span style={{ textAlign: 'center' }}>Status</span>
                <span></span>
              </div>

              {loading ? (
                <div style={{ padding: '60px', textAlign: 'center', color: '#94a3b8', fontSize: '13px' }}>Loading dashboard…</div>
              ) : rows.length === 0 ? (
                <div style={{ padding: '60px', textAlign: 'center', color: '#94a3b8', fontSize: '13px' }}>No staff match your filters.</div>
              ) : rows.map(({ staff, payroll, leave }) => {
                const meta = roleMeta(staff.roles?.[0]);
                const attDays      = +(payroll.attendanceDays || 0).toFixed(1);
                const totalLeaveYTD = payroll.totalLeaveYTD || 0;
                const extraLwpYTD   = payroll.lwpLeaveYTD || 0;
                return (
                  <div
                    key={staff.id}
                    onClick={() => handleOpenStaff(staff)}
                    style={{ display: 'grid', gridTemplateColumns: gridCols, padding: '12px 18px', alignItems: 'center', borderBottom: '1px solid #f8fafc', cursor: 'pointer', transition: 'background 0.12s', minWidth: '1240px', gap: '10px' }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = '#fafbfc'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                  >
                    {/* Employee */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
                      <div style={{ width: '34px', height: '34px', borderRadius: '10px', background: staff.photoUrl ? '#f1f5f9' : meta.bg, color: meta.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px', fontWeight: 800, flexShrink: 0, overflow: 'hidden' }}>
                        {staff.photoUrl
                          ? <img src={staff.photoUrl} alt="" referrerPolicy="no-referrer" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                          : (staff.name || '?').charAt(0).toUpperCase()}
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{staff.name}</div>
                        <div style={{ fontSize: '10px', color: meta.color, fontWeight: 700, marginTop: '1px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {ROLE_LABELS?.[staff.roles?.[0]] || meta.label}
                        </div>
                      </div>
                    </div>

                    {/* Employee ID */}
                    <div>
                      {staff.employeeCode ? (
                        <span style={{ display: 'inline-block', fontSize: '11px', fontWeight: 800, color: '#0a1628', background: '#fff8e6', border: '1px solid #fde68a', padding: '4px 10px', borderRadius: '6px', letterSpacing: '0.3px', fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace' }}>
                          {staff.employeeCode}
                        </span>
                      ) : (
                        <span style={{ fontSize: '10px', color: '#cbd5e1', fontWeight: 600 }}>—</span>
                      )}
                    </div>

                    {/* Attendance (days worked this month) */}
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: '14px', fontWeight: 800, color: attDays > 0 ? '#15803d' : '#cbd5e1' }}>{attDays}</div>
                      <div style={{ fontSize: '8px', color: '#94a3b8', fontWeight: 700, marginTop: '1px', letterSpacing: '0.5px' }}>DAYS · {selectedMonthLabel.split(' ')[0].toUpperCase()}</div>
                    </div>

                    {/* Leave applied (year-to-date) */}
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: '14px', fontWeight: 800, color: totalLeaveYTD > 0 ? '#6366f1' : '#cbd5e1' }}>{totalLeaveYTD}</div>
                      <div style={{ fontSize: '8px', color: '#94a3b8', fontWeight: 700, marginTop: '1px', letterSpacing: '0.5px' }}>DAYS · YTD</div>
                    </div>

                    {/* Extra LWP (year-to-date) */}
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: '14px', fontWeight: 800, color: extraLwpYTD > 0 ? '#dc2626' : '#cbd5e1' }}>{extraLwpYTD}</div>
                      <div style={{ fontSize: '8px', color: '#94a3b8', fontWeight: 700, marginTop: '1px', letterSpacing: '0.5px' }}>DAYS · YTD</div>
                    </div>

                    {/* Structure net pay */}
                    <div style={{ textAlign: 'right' }}>
                      {payroll.hasStructure ? (
                        <>
                          <div style={{ fontSize: '13px', fontWeight: 800, color: '#0f172a' }}>₹{payroll.structureNet.toLocaleString()}</div>
                          <div style={{ fontSize: '8px', color: '#94a3b8', fontWeight: 700, marginTop: '1px', letterSpacing: '0.5px' }}>STRUCTURE</div>
                        </>
                      ) : (
                        <span style={{ fontSize: '10px', color: '#94a3b8', fontWeight: 600 }}>Not set</span>
                      )}
                    </div>

                    {/* Payroll this month (pro-rated) */}
                    <div style={{ textAlign: 'right' }}>
                      {!payroll.hasStructure ? (
                        <span style={{ fontSize: '10px', color: '#94a3b8', fontWeight: 600 }}>—</span>
                      ) : payroll.disbursed ? (
                        <>
                          <div style={{ fontSize: '13px', fontWeight: 800, color: '#16a34a' }}>₹{payroll.disbursedNet.toLocaleString()}</div>
                          <div style={{ fontSize: '8px', color: '#15803d', fontWeight: 700, marginTop: '1px', letterSpacing: '0.5px' }}>DISBURSED</div>
                        </>
                      ) : (
                        <>
                          <div style={{ fontSize: '13px', fontWeight: 800, color: '#9a3412' }}>₹{payroll.proRatedNet.toLocaleString()}</div>
                          {payroll.lwpDays > 0
                            ? <div style={{ fontSize: '8px', color: '#9a3412', fontWeight: 700, marginTop: '1px', letterSpacing: '0.5px' }}>AFTER {payroll.lwpDays}D LWP</div>
                            : <div style={{ fontSize: '8px', color: '#94a3b8', fontWeight: 700, marginTop: '1px', letterSpacing: '0.5px' }}>PAYABLE</div>
                          }
                        </>
                      )}
                    </div>

                    {/* Status */}
                    <div style={{ textAlign: 'center' }}>
                      {!payroll.hasStructure ? (
                        <span style={{ fontSize: '9px', background: '#f1f5f9', color: '#64748b', padding: '4px 10px', borderRadius: '999px', fontWeight: 800, letterSpacing: '0.5px' }}>NO STRUCTURE</span>
                      ) : payroll.disbursed ? (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '9px', background: '#dcfce7', color: '#15803d', padding: '4px 10px', borderRadius: '999px', fontWeight: 800, letterSpacing: '0.5px', border: '1px solid #bbf7d0' }}>
                          <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#16a34a' }} /> PAID
                        </span>
                      ) : (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '9px', background: '#fef3c7', color: '#92400e', padding: '4px 10px', borderRadius: '999px', fontWeight: 800, letterSpacing: '0.5px', border: '1px solid #fde68a' }}>
                          <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#d97706' }} /> PENDING
                        </span>
                      )}
                    </div>

                    {/* Action */}
                    <div style={{ textAlign: 'right' }}>
                      <span style={{ fontSize: '10px', color: '#0f52ba', fontWeight: 700 }}>Open →</span>
                    </div>
                  </div>
                );
              })}
            </>
          );
        })()}
      </div>
    </div>
  );
}

// ── KPI Card ─────────────────────────────────────────────────────────────
function KpiCard({ label, value, sub, tone }) {
  const TONES = {
    blue:   { bg: 'linear-gradient(135deg, #eff6ff, #dbeafe)', accent: '#0f52ba' },
    green:  { bg: 'linear-gradient(135deg, #f0fdf4, #dcfce7)', accent: '#16a34a' },
    amber:  { bg: 'linear-gradient(135deg, #fffbeb, #fef3c7)', accent: '#d97706' },
    purple: { bg: 'linear-gradient(135deg, #f5f3ff, #ede9fe)', accent: '#7c3aed' },
  };
  const t = TONES[tone] || TONES.blue;
  return (
    <div style={{ background: t.bg, border: `1px solid ${t.accent}25`, borderRadius: '14px', padding: '14px 16px', position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', top: 0, left: 0, width: '4px', height: '100%', background: t.accent }} />
      <div style={{ fontSize: '9px', fontWeight: 800, color: t.accent, letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '6px' }}>{label}</div>
      <div style={{ fontSize: '22px', fontWeight: 900, color: '#0a1628', letterSpacing: '-0.3px', lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: '10px', fontWeight: 600, color: '#64748b', marginTop: '4px' }}>{sub}</div>}
    </div>
  );
}
