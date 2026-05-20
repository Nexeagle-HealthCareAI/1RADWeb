import React, { useState, useMemo, useEffect, useCallback } from 'react';
import apiClient from '../api/apiClient';
import useAuth from '../auth/useAuth';
import { ROLE_LABELS } from '../data/roles';
import { nativeStorage } from '../hooks/useElectron';
import '../styles/global.css';
import '../styles/AdminBoard.css';

// â”€â”€â”€ Constants â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const TODAY      = new Date();
const TODAY_STR  = TODAY.toISOString().split('T')[0];
const THIS_MONTH = `${TODAY.getFullYear()}-${String(TODAY.getMonth()+1).padStart(2,'0')}`;
const LEAVE_TYPES    = ['Sick', 'Casual', 'Earned'];
const LEAVE_DEFAULTS = { Sick: 6, Casual: 6, Earned: 12 };
const ATT_META = {
  present:  { color: '#16a34a', bg: '#f0fdf4', label: 'Present'  },
  absent:   { color: '#dc2626', bg: '#fef2f2', label: 'Absent'   },
  halfday:  { color: '#d97706', bg: '#fffbeb', label: 'Half Day' },
  late:     { color: '#0891b2', bg: '#f0faff', label: 'Late'     },
  leave:    { color: '#6366f1', bg: '#f0f0ff', label: 'On Leave' },
};

// â”€â”€â”€ Component â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export default function StaffPage() {
  const { currentUser, activeCenter } = useAuth();

  // â”€â”€ Core data â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const [personnel,      setPersonnel]      = useState([]);
  const [loading,        setLoading]        = useState(false);
  const [salaryData,     setSalaryData]     = useState({}); // { staffId: { basicPay, hra, travel, otherAllowances, pfDeduction, tds, otherDeductions, disbursements:[] } }
  const [attendanceData, setAttendanceData] = useState({}); // { staffId: { 'YYYY-MM-DD': status } }
  const [leaveData,      setLeaveData]      = useState([]); // [{ id, staffId, type, from, to, days, reason, status, appliedOn }]

  // â”€â”€ UI state â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const [selectedStaff,   setSelectedStaff]   = useState(null);
  const [detailTab,       setDetailTab]       = useState('profile');
  const [search,          setSearch]          = useState('');
  const [roleFilter,      setRoleFilter]      = useState('ALL');
  const [isMobile,        setIsMobile]        = useState(window.innerWidth < 1024);
  const [attendanceMonth, setAttendanceMonth] = useState(THIS_MONTH);

  // Salary edit drawer
  const EMPTY_SAL = { basicPay:'', hra:'', travel:'', otherAllowances:'', pfDeduction:'', tds:'', otherDeductions:'' };
  const [salaryDrawer, setSalaryDrawer] = useState({ open: false, form: EMPTY_SAL });

  // Attendance picker
  const [attPicker, setAttPicker] = useState({ open: false, date: TODAY_STR, status: 'present' });

  // Leave application form
  const [leaveForm, setLeaveForm] = useState({ open: false, type: 'Sick', from: '', to: '', reason: '' });

  // Notification modal
  const [notifModal, setNotifModal] = useState({ isOpen: false, type: 'info', title: '', message: '' });
  const showNotif = (type, title, message) => setNotifModal({ isOpen: true, type, title, message });

  useEffect(() => {
    const h = () => setIsMobile(window.innerWidth < 1024);
    window.addEventListener('resize', h);
    return () => window.removeEventListener('resize', h);
  }, []);

  // â”€â”€ Data loading â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const fetchPersonnel = useCallback(async () => {
    try {
      setLoading(true);
      const res = await apiClient.get('/personnel');
      const mapped = (res.data || []).map(p => ({
        id:             p.userId,
        name:           p.fullName || 'Unknown',
        email:          p.email,
        mobile:         p.mobile,
        roles:          (p.roles || []).map(r => String(r).toLowerCase()),
        specialization: p.specialization,
        degree:         p.degree,
        licenseNo:      p.licenseNo,
        status:         p.status || 'active',
        createdAt:      p.createdAt,
      }));
      setPersonnel(mapped);
      await nativeStorage.set('1rad_cache_personnel', mapped);
    } catch {
      const cached = await nativeStorage.get('1rad_cache_personnel');
      if (cached) setPersonnel(cached);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadLocalData = useCallback(async () => {
    const [sal, att, lv] = await Promise.all([
      nativeStorage.get('1rad_staff_salary'),
      nativeStorage.get('1rad_staff_attendance'),
      nativeStorage.get('1rad_staff_leave'),
    ]);
    setSalaryData(sal || {});
    setAttendanceData(att || {});
    setLeaveData(lv || []);
  }, []);

  useEffect(() => {
    fetchPersonnel();
    loadLocalData();
  }, [fetchPersonnel, loadLocalData, activeCenter?.id]);

  // â”€â”€ Salary helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const getSalaryInfo = useCallback((staffId) => {
    const d = salaryData[staffId] || {};
    const gross      = ['basicPay','hra','travel','otherAllowances'].reduce((s,k) => s + (Number(d[k])||0), 0);
    const deductions = ['pfDeduction','tds','otherDeductions'].reduce((s,k) => s + (Number(d[k])||0), 0);
    return { ...d, gross, deductions, net: Math.max(0, gross - deductions), disbursements: d.disbursements || [] };
  }, [salaryData]);

  const saveSalaryStructure = async (staffId) => {
    const updated = { ...salaryData, [staffId]: { ...(salaryData[staffId] || {}), ...salaryDrawer.form } };
    setSalaryData(updated);
    await nativeStorage.set('1rad_staff_salary', updated);
    showNotif('success', 'Salary Updated', 'Salary structure saved successfully.');
    setSalaryDrawer(p => ({ ...p, open: false }));
  };

  const disburseSalary = async (staffId, month) => {
    const existing = salaryData[staffId] || {};
    const disb = existing.disbursements || [];
    if (disb.find(d => d.month === month)) {
      showNotif('warning', 'Already Disbursed', `Salary for ${month} is already marked as paid.`);
      return;
    }
    const info  = getSalaryInfo(staffId);
    const entry = { month, grossPay: info.gross, netPay: info.net, paidOn: new Date().toISOString() };
    const updated = { ...salaryData, [staffId]: { ...existing, disbursements: [...disb, entry] } };
    setSalaryData(updated);
    await nativeStorage.set('1rad_staff_salary', updated);
    showNotif('success', 'Salary Disbursed', `â‚¹${info.net.toLocaleString()} net salary marked as paid for ${month}.`);
  };

  // â”€â”€ Attendance helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const getAttSummary = useCallback((staffId, month) => {
    const rec    = attendanceData[staffId] || {};
    const counts = Object.fromEntries(Object.keys(ATT_META).map(k => [k, 0]));
    Object.entries(rec)
      .filter(([d]) => d.startsWith(month))
      .forEach(([, s]) => { if (s in counts) counts[s]++; });
    return counts;
  }, [attendanceData]);

  const markAttendance = async (staffId, date, status) => {
    const updated = { ...attendanceData, [staffId]: { ...(attendanceData[staffId] || {}), [date]: status } };
    setAttendanceData(updated);
    await nativeStorage.set('1rad_staff_attendance', updated);
    showNotif('success', 'Attendance Marked', `${date} marked as ${ATT_META[status]?.label || status}.`);
    setAttPicker(p => ({ ...p, open: false }));
  };

  // â”€â”€ Leave helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const getLeaveBalance = useCallback((staffId) => {
    const year = TODAY.getFullYear();
    const used = Object.fromEntries(LEAVE_TYPES.map(t => [t, 0]));
    leaveData
      .filter(l => l.staffId === staffId && l.status === 'approved' && l.from?.startsWith(String(year)))
      .forEach(l => { if (l.type in used) used[l.type] += l.days; });
    const balance = Object.fromEntries(LEAVE_TYPES.map(t => [t, Math.max(0, LEAVE_DEFAULTS[t] - used[t])]));
    return { used, balance };
  }, [leaveData]);

  const submitLeave = async (staffId) => {
    const { type, from, to, reason } = leaveForm;
    if (!from || !to) { showNotif('warning', 'Missing Dates', 'Please select start and end dates.'); return; }
    if (to < from)    { showNotif('warning', 'Invalid Range', 'End date cannot be before start date.'); return; }
    const days = Math.round((new Date(to) - new Date(from)) / 86400000) + 1;
    const { balance } = getLeaveBalance(staffId);
    if (days > balance[type]) {
      showNotif('warning', 'Insufficient Balance', `Only ${balance[type]} ${type} leave day(s) remaining.`);
      return;
    }
    const entry = {
      id: `lv_${Date.now()}`, staffId, type, from, to, days,
      reason: reason.trim(), status: 'pending', appliedOn: new Date().toISOString(),
    };
    const updated = [...leaveData, entry];
    setLeaveData(updated);
    await nativeStorage.set('1rad_staff_leave', updated);
    showNotif('success', 'Leave Applied', `${days}-day ${type} leave submitted for approval.`);
    setLeaveForm(p => ({ ...p, open: false }));
  };

  const updateLeaveStatus = async (leaveId, status) => {
    const updated = leaveData.map(l => l.id === leaveId ? { ...l, status } : l);
    setLeaveData(updated);
    await nativeStorage.set('1rad_staff_leave', updated);
    showNotif('success', 'Leave Updated', `Leave request ${status}.`);
  };

  // â”€â”€ Computed â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const filteredPersonnel = useMemo(() => {
    const q = search.toLowerCase();
    return personnel.filter(u => {
      const matchQ    = u.name.toLowerCase().includes(q) || (u.email || '').toLowerCase().includes(q);
      let   matchRole = true;
      if      (roleFilter === 'DOCTORS')     matchRole = u.roles.some(r => r.includes('doctor'));
      else if (roleFilter === 'TECHNICIANS') matchRole = u.roles.includes('technician');
      else if (roleFilter === 'ADMINS')      matchRole = u.roles.some(r => ['admin','receptionist','accountant'].includes(r));
      return matchQ && matchRole;
    });
  }, [personnel, search, roleFilter]);

  const metrics = useMemo(() => {
    const totalPayroll = personnel.reduce((s, u) => s + getSalaryInfo(u.id).net, 0);
    const onLeave = new Set(
      leaveData
        .filter(l => l.status === 'approved' && l.from <= TODAY_STR && l.to >= TODAY_STR)
        .map(l => l.staffId)
    ).size;
    return {
      total:        personnel.length,
      doctors:      personnel.filter(u => u.roles.some(r => r.includes('doctor'))).length,
      onLeave,
      totalPayroll,
    };
  }, [personnel, leaveData, getSalaryInfo]);

  // â”€â”€ Role meta â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const getRoleMeta = (role) => ({
    doctor:       { color: '#0891b2', bg: '#f0faff',  label: 'Doctor'        },
    admindoctor:  { color: '#6366f1', bg: '#f0f5ff',  label: 'Admin Doctor'  },
    technician:   { color: '#d97706', bg: '#fffbeb',  label: 'Technician'    },
    receptionist: { color: '#e84393', bg: '#fdf0f6',  label: 'Receptionist'  },
    admin:        { color: '#0f52ba', bg: '#e8f0fe',  label: 'Admin'         },
    accountant:   { color: '#059669', bg: '#ecfdf5',  label: 'Accountant'    },
  }[role] || { color: '#94a3b8', bg: '#f8fafc', label: role || 'Staff' });

  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // TAB RENDERERS
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

  const renderProfileTab = (staff) => {
    const meta = getRoleMeta(staff.roles?.[0]);
    const rows = [
      ['Role',           ROLE_LABELS?.[staff.roles?.[0]] || meta.label],
      ['Specialization', staff.specialization || 'â€”'],
      ['Email',          staff.email || 'â€”'],
      ['Mobile',         staff.mobile || 'â€”'],
      ['Degree',         staff.degree || 'â€”'],
      ['License No.',    staff.licenseNo || 'â€”'],
      ['Status',         (staff.status || 'active').toUpperCase()],
      ['Joined',         staff.createdAt
          ? new Date(staff.createdAt).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' })
          : 'â€”'],
    ];
    return (
      <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
          {rows.map(([label, val]) => (
            <div key={label} style={{ background: '#f8fafc', borderRadius: '12px', padding: '14px 16px', border: '1px solid #f1f5f9' }}>
              <div style={{ fontSize: '9px', fontWeight: 800, color: '#94a3b8', letterSpacing: '0.5px', marginBottom: '4px', textTransform: 'uppercase' }}>{label}</div>
              <div style={{ fontSize: '13px', fontWeight: 700, color: '#1e293b', wordBreak: 'break-all' }}>{val}</div>
            </div>
          ))}
        </div>
        <div style={{ background: meta.bg, border: `1px solid ${meta.color}25`, borderRadius: '12px', padding: '14px 16px', display: 'flex', gap: '10px', alignItems: 'center' }}>
          <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: meta.color, flexShrink: 0, boxShadow: `0 0 8px ${meta.color}60` }}></div>
          <span style={{ fontSize: '11px', fontWeight: 700, color: meta.color }}>Full-Time Employee Â· {meta.label}</span>
        </div>
      </div>
    );
  };

  const renderSalaryTab = (staff) => {
    const info         = getSalaryInfo(staff.id);
    const raw          = salaryData[staff.id] || {};
    const paidThisMonth = info.disbursements.find(x => x.month === THIS_MONTH);
    const earningRows  = [['Basic Pay','basicPay'],['HRA','hra'],['Travel Allowance','travel'],['Other Allowances','otherAllowances']];
    const deductRows   = [['PF Deduction','pfDeduction'],['TDS','tds'],['Other Deductions','otherDeductions']];
    return (
      <div style={{ padding: '24px' }}>
        {/* Structure card */}
        <div style={{ background: '#f8fafc', borderRadius: '16px', padding: '20px', marginBottom: '16px', border: '1px solid #f1f5f9' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
            <span style={{ fontSize: '11px', fontWeight: 800, color: '#64748b', letterSpacing: '0.5px' }}>SALARY STRUCTURE</span>
            <button
              onClick={() => setSalaryDrawer({ open: true, form: { basicPay: raw.basicPay||'', hra: raw.hra||'', travel: raw.travel||'', otherAllowances: raw.otherAllowances||'', pfDeduction: raw.pfDeduction||'', tds: raw.tds||'', otherDeductions: raw.otherDeductions||'' } })}
              style={{ fontSize: '10px', fontWeight: 700, color: '#0f52ba', background: '#eff6ff', border: 'none', borderRadius: '8px', padding: '6px 12px', cursor: 'pointer' }}
            >Edit</button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0' }}>
            {earningRows.map(([label, key]) => (
              <div key={key} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #f1f5f9' }}>
                <span style={{ fontSize: '11px', color: '#64748b' }}>{label}</span>
                <span style={{ fontSize: '12px', fontWeight: 700, color: '#16a34a' }}>{raw[key] ? `+â‚¹${Number(raw[key]).toLocaleString()}` : 'â€”'}</span>
              </div>
            ))}
            {deductRows.map(([label, key]) => (
              <div key={key} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #f1f5f9' }}>
                <span style={{ fontSize: '11px', color: '#64748b' }}>{label}</span>
                <span style={{ fontSize: '12px', fontWeight: 700, color: '#dc2626' }}>{raw[key] ? `âˆ’â‚¹${Number(raw[key]).toLocaleString()}` : 'â€”'}</span>
              </div>
            ))}
          </div>
          {/* Gross / Deductions / Net */}
          <div style={{ display: 'flex', justifyContent: 'space-around', paddingTop: '14px', borderTop: '2px solid #e2e8f0', marginTop: '8px' }}>
            {[['GROSS', `â‚¹${info.gross.toLocaleString()}`, '#1e293b'], ['DEDUCTIONS', `â‚¹${info.deductions.toLocaleString()}`, '#dc2626'], ['NET PAY', `â‚¹${info.net.toLocaleString()}`, '#16a34a']].map(([lbl, val, color]) => (
              <div key={lbl} style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '9px', color: '#94a3b8', fontWeight: 700, marginBottom: '4px' }}>{lbl}</div>
                <div style={{ fontSize: '18px', fontWeight: 900, color }}>{val}</div>
              </div>
            ))}
          </div>
        </div>

        {/* This-month disburse banner */}
        <div style={{ background: paidThisMonth ? '#f0fdf4' : '#fffbeb', border: `1px solid ${paidThisMonth ? '#bbf7d0' : '#fde68a'}`, borderRadius: '14px', padding: '16px 20px', marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: '10px', fontWeight: 800, color: paidThisMonth ? '#16a34a' : '#d97706' }}>
              {paidThisMonth ? 'âœ“ PAID' : 'â³ PENDING'} â€” {THIS_MONTH}
            </div>
            <div style={{ fontSize: '14px', fontWeight: 800, color: '#1e293b', marginTop: '4px' }}>â‚¹{info.net.toLocaleString()} net</div>
          </div>
          {!paidThisMonth
            ? <button onClick={() => disburseSalary(staff.id, THIS_MONTH)} style={{ padding: '9px 16px', borderRadius: '10px', background: '#16a34a', color: 'white', border: 'none', fontWeight: 800, fontSize: '11px', cursor: 'pointer' }}>MARK PAID</button>
            : <div style={{ fontSize: '10px', color: '#16a34a', fontWeight: 700 }}>{new Date(paidThisMonth.paidOn).toLocaleDateString('en-IN', { day:'2-digit', month:'short' })}</div>
          }
        </div>

        {/* Payment history */}
        <div style={{ fontSize: '10px', fontWeight: 800, color: '#94a3b8', letterSpacing: '0.5px', marginBottom: '12px' }}>PAYMENT HISTORY</div>
        {info.disbursements.length === 0
          ? <div style={{ textAlign: 'center', padding: '24px', color: '#94a3b8', fontSize: '12px' }}>No disbursements recorded yet.</div>
          : [...info.disbursements].reverse().map(d => (
            <div key={d.month} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', background: '#f8fafc', borderRadius: '10px', border: '1px solid #f1f5f9', marginBottom: '8px' }}>
              <div>
                <div style={{ fontSize: '12px', fontWeight: 700, color: '#1e293b' }}>{d.month}</div>
                <div style={{ fontSize: '10px', color: '#94a3b8' }}>Gross â‚¹{(d.grossPay||0).toLocaleString()}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '13px', fontWeight: 800, color: '#16a34a' }}>â‚¹{(d.netPay||0).toLocaleString()}</div>
                <span style={{ fontSize: '9px', background: '#dcfce7', color: '#16a34a', padding: '2px 7px', borderRadius: '4px', fontWeight: 700 }}>PAID</span>
              </div>
            </div>
          ))
        }
      </div>
    );
  };

  const renderAttendanceTab = (staff) => {
    const [yr, mn]   = attendanceMonth.split('-').map(Number);
    const daysInMon  = new Date(yr, mn, 0).getDate();
    const firstDow   = new Date(yr, mn - 1, 1).getDay();
    const summary    = getAttSummary(staff.id, attendanceMonth);
    const records    = attendanceData[staff.id] || {};
    const prevMonth  = () => { const d = new Date(yr, mn-2, 1); setAttendanceMonth(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`); };
    const nextMonth  = () => { const d = new Date(yr, mn,   1); setAttendanceMonth(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`); };
    return (
      <div style={{ padding: '24px' }}>
        {/* Month navigator */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <button onClick={prevMonth} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '6px 14px', cursor: 'pointer', fontWeight: 700 }}>â†</button>
          <span style={{ fontWeight: 800, fontSize: '14px', color: '#1e293b' }}>{MONTHS[mn-1]} {yr}</span>
          <button onClick={nextMonth} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '6px 14px', cursor: 'pointer', fontWeight: 700 }}>â†’</button>
        </div>

        {/* Summary chips */}
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '18px' }}>
          {Object.entries(summary).map(([s, count]) => (
            <span key={s} style={{ padding: '4px 10px', borderRadius: '8px', background: ATT_META[s].bg, color: ATT_META[s].color, fontSize: '10px', fontWeight: 800 }}>
              {ATT_META[s].label}: {count}
            </span>
          ))}
        </div>

        {/* Calendar grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px', marginBottom: '16px' }}>
          {['S','M','T','W','T','F','S'].map((d, i) => (
            <div key={i} style={{ textAlign: 'center', fontSize: '9px', fontWeight: 800, color: '#94a3b8', paddingBottom: '6px' }}>{d}</div>
          ))}
          {Array.from({ length: firstDow }).map((_, i) => <div key={`_${i}`} />)}
          {Array.from({ length: daysInMon }).map((_, i) => {
            const day  = i + 1;
            const ds   = `${attendanceMonth}-${String(day).padStart(2,'0')}`;
            const st   = records[ds];
            const meta = st ? ATT_META[st] : null;
            const isToday = ds === TODAY_STR;
            return (
              <div
                key={day}
                onClick={() => setAttPicker({ open: true, date: ds, status: st || 'present' })}
                style={{
                  aspectRatio: '1', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  borderRadius: '8px', cursor: 'pointer', fontSize: '11px',
                  fontWeight: isToday ? 900 : 700,
                  background: meta ? meta.bg : '#f8fafc',
                  border: `1.5px solid ${isToday ? '#0f52ba' : meta ? meta.color + '40' : '#f1f5f9'}`,
                  color: meta ? meta.color : '#64748b',
                  transition: 'all 0.12s',
                }}
              >{day}</div>
            );
          })}
        </div>

        {/* Legend */}
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          {Object.entries(ATT_META).map(([s, m]) => (
            <div key={s} style={{ display: 'flex', gap: '5px', alignItems: 'center' }}>
              <div style={{ width: '8px', height: '8px', borderRadius: '2px', background: m.color }}></div>
              <span style={{ fontSize: '9px', fontWeight: 600, color: '#94a3b8' }}>{m.label}</span>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderLeaveTab = (staff) => {
    const { balance }  = getLeaveBalance(staff.id);
    const staffLeaves  = leaveData
      .filter(l => l.staffId === staff.id)
      .sort((a, b) => new Date(b.appliedOn) - new Date(a.appliedOn));
    const statusMeta = {
      pending:  { color: '#d97706', bg: '#fffbeb' },
      approved: { color: '#16a34a', bg: '#f0fdf4' },
      rejected: { color: '#dc2626', bg: '#fef2f2' },
    };
    return (
      <div style={{ padding: '24px' }}>
        {/* Balance cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '20px' }}>
          {LEAVE_TYPES.map(type => (
            <div key={type} style={{ background: '#f8fafc', borderRadius: '14px', padding: '16px 12px', border: '1px solid #f1f5f9', textAlign: 'center' }}>
              <div style={{ fontSize: '9px', fontWeight: 800, color: '#94a3b8', marginBottom: '8px', letterSpacing: '0.5px' }}>{type.toUpperCase()}</div>
              <div style={{ fontSize: '24px', fontWeight: 900, color: '#1e293b' }}>{balance[type]}</div>
              <div style={{ fontSize: '9px', color: '#94a3b8', marginTop: '2px' }}>/ {LEAVE_DEFAULTS[type]} days</div>
              <div style={{ marginTop: '8px', height: '4px', background: '#e2e8f0', borderRadius: '2px', overflow: 'hidden' }}>
                <div style={{ height: '100%', borderRadius: '2px', background: balance[type] > 2 ? '#0f52ba' : '#dc2626', width: `${LEAVE_DEFAULTS[type] > 0 ? (balance[type]/LEAVE_DEFAULTS[type])*100 : 0}%` }}></div>
              </div>
            </div>
          ))}
        </div>

        <button
          onClick={() => setLeaveForm({ open: true, type: 'Sick', from: '', to: '', reason: '' })}
          style={{ width: '100%', padding: '11px', borderRadius: '12px', background: '#0f52ba', color: 'white', border: 'none', fontWeight: 800, fontSize: '12px', cursor: 'pointer', marginBottom: '20px', letterSpacing: '0.5px' }}
        >+ APPLY FOR LEAVE</button>

        <div style={{ fontSize: '10px', fontWeight: 800, color: '#94a3b8', letterSpacing: '0.5px', marginBottom: '12px' }}>LEAVE HISTORY</div>
        {staffLeaves.length === 0
          ? <div style={{ textAlign: 'center', padding: '24px', color: '#94a3b8', fontSize: '12px' }}>No leave records yet.</div>
          : staffLeaves.map(l => {
            const sm = statusMeta[l.status] || statusMeta.pending;
            return (
              <div key={l.id} style={{ padding: '14px 16px', background: '#f8fafc', borderRadius: '12px', border: '1px solid #f1f5f9', marginBottom: '8px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <div style={{ fontSize: '12px', fontWeight: 800, color: '#1e293b' }}>{l.type} Leave Â· {l.days} day{l.days !== 1 ? 's' : ''}</div>
                    <div style={{ fontSize: '10px', color: '#94a3b8', marginTop: '2px' }}>{l.from} â†’ {l.to}</div>
                    {l.reason && <div style={{ fontSize: '10px', color: '#64748b', marginTop: '4px', fontStyle: 'italic' }}>"{l.reason}"</div>}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '6px' }}>
                    <span style={{ fontSize: '9px', fontWeight: 800, color: sm.color, background: sm.bg, padding: '3px 8px', borderRadius: '6px' }}>{l.status.toUpperCase()}</span>
                    {l.status === 'pending' && (
                      <div style={{ display: 'flex', gap: '4px' }}>
                        <button onClick={() => updateLeaveStatus(l.id, 'approved')} style={{ fontSize: '9px', padding: '3px 8px', borderRadius: '6px', background: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0', cursor: 'pointer', fontWeight: 700 }}>Approve</button>
                        <button onClick={() => updateLeaveStatus(l.id, 'rejected')} style={{ fontSize: '9px', padding: '3px 8px', borderRadius: '6px', background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', cursor: 'pointer', fontWeight: 700 }}>Reject</button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        }
      </div>
    );
  };

  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // MAIN RENDER
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  const DETAIL_TABS = [
    { id: 'profile',    label: 'Profile'    },
    { id: 'salary',     label: 'Salary'     },
    { id: 'attendance', label: 'Attendance' },
    { id: 'leave',      label: 'Leave'      },
  ];

  return (
    <div style={{ padding: '24px', fontFamily: '"Segoe UI", system-ui, sans-serif', minHeight: '100vh', background: '#f8fafc' }}>

      {/* Page header */}
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '22px', fontWeight: 800, color: '#0a1628', margin: 0, letterSpacing: '-0.5px' }}>Staff Management</h1>
        <span style={{ fontSize: '12px', color: '#6b7280' }}>Salary, attendance & leave for {activeCenter?.name || 'your facility'}</span>
      </div>

      {/* KPI bar */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4, 1fr)', gap: '16px', marginBottom: '28px' }}>
        {[
          { label: 'Total Staff',      value: metrics.total,                              icon: 'ðŸ‘¥', color: '#0f52ba', bg: 'linear-gradient(135deg,#eff6ff,#dbeafe)' },
          { label: 'Doctors',          value: metrics.doctors,                            icon: 'ðŸ‘¨â€âš•ï¸', color: '#0891b2', bg: 'linear-gradient(135deg,#ecfeff,#cffafe)' },
          { label: 'On Leave Today',   value: metrics.onLeave,                            icon: 'ðŸ–ï¸', color: '#d97706', bg: 'linear-gradient(135deg,#fffbeb,#fef3c7)' },
          { label: 'Monthly Payroll',  value: `â‚¹${metrics.totalPayroll.toLocaleString()}`, icon: 'ðŸ’°', color: '#16a34a', bg: 'linear-gradient(135deg,#f0fdf4,#dcfce7)' },
        ].map(({ label, value, icon, color, bg }) => (
          <div key={label} style={{ background: 'white', border: '1px solid #f1f5f9', borderRadius: '18px', padding: '20px', display: 'flex', alignItems: 'center', gap: '16px', boxShadow: '0 4px 15px rgba(0,0,0,0.02)' }}>
            <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px', flexShrink: 0 }}>{icon}</div>
            <div>
              <div style={{ fontSize: '20px', fontWeight: 800, color, lineHeight: 1.1 }}>{value}</div>
              <div style={{ fontSize: '11px', fontWeight: 600, color: '#94a3b8', marginTop: '3px' }}>{label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Split layout */}
      <div style={{ display: isMobile ? 'block' : 'flex', gap: '24px', alignItems: 'flex-start' }}>

        {/* â”€â”€ LEFT: Staff roster â”€â”€ */}
        <div style={{
          width: isMobile ? '100%' : '290px', flexShrink: 0,
          background: 'white', borderRadius: '20px', border: '1px solid #f1f5f9',
          boxShadow: '0 4px 20px rgba(0,0,0,0.02)', overflow: 'hidden',
          ...(isMobile && selectedStaff ? { display: 'none' } : {}),
        }}>
          {/* Search + filter */}
          <div style={{ padding: '16px', borderBottom: '1px solid #f1f5f9' }}>
            <input
              type="text" placeholder="Search staff..." value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ width: '100%', padding: '10px 14px', borderRadius: '10px', border: '1px solid #e2e8f0', fontSize: '12px', outline: 'none', boxSizing: 'border-box', marginBottom: '10px' }}
            />
            <select value={roleFilter} onChange={e => setRoleFilter(e.target.value)}
              style={{ width: '100%', padding: '8px 12px', borderRadius: '10px', border: '1px solid #e2e8f0', fontSize: '11px', fontWeight: 700, background: 'white', outline: 'none', cursor: 'pointer' }}>
              <option value="ALL">All Roles</option>
              <option value="DOCTORS">Doctors</option>
              <option value="TECHNICIANS">Technicians</option>
              <option value="ADMINS">Administration</option>
            </select>
          </div>

          {/* Staff list */}
          <div style={{ overflowY: 'auto', maxHeight: isMobile ? '400px' : '65vh' }}>
            {loading
              ? <div style={{ padding: '40px', textAlign: 'center', color: '#94a3b8', fontSize: '12px' }}>Loading roster...</div>
              : filteredPersonnel.length === 0
                ? <div style={{ padding: '40px', textAlign: 'center', color: '#94a3b8', fontSize: '12px' }}>No staff found.</div>
                : filteredPersonnel.map(u => {
                  const meta       = getRoleMeta(u.roles?.[0]);
                  const isSelected = selectedStaff?.id === u.id;
                  const attToday   = (attendanceData[u.id] || {})[TODAY_STR];
                  return (
                    <div
                      key={u.id}
                      onClick={() => { setSelectedStaff(u); setDetailTab('profile'); }}
                      style={{
                        padding: '14px 16px', cursor: 'pointer', borderBottom: '1px solid #f8fafc',
                        background: isSelected ? '#f0f7ff' : 'white',
                        borderLeft: `3px solid ${isSelected ? '#0f52ba' : 'transparent'}`,
                        transition: 'all 0.15s',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{ width: '38px', height: '38px', borderRadius: '10px', background: meta.bg, color: meta.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '15px', fontWeight: 800, flexShrink: 0 }}>
                          {u.name.charAt(0).toUpperCase()}
                        </div>
                        <div style={{ flex: 1, overflow: 'hidden' }}>
                          <div style={{ fontSize: '13px', fontWeight: 700, color: '#1e293b', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>{u.name}</div>
                          <div style={{ fontSize: '10px', fontWeight: 600, color: meta.color, marginTop: '1px' }}>{meta.label}</div>
                        </div>
                        {attToday && (
                          <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: ATT_META[attToday]?.color || '#94a3b8', flexShrink: 0 }} title={attToday}></div>
                        )}
                      </div>
                    </div>
                  );
                })
            }
          </div>
        </div>

        {/* â”€â”€ RIGHT: Detail panel â”€â”€ */}
        {selectedStaff ? (
          <div style={{ flex: 1, background: 'white', borderRadius: '20px', border: '1px solid #f1f5f9', boxShadow: '0 4px 20px rgba(0,0,0,0.02)', overflow: 'hidden', minWidth: 0 }}>

            {/* Staff banner */}
            <div style={{ background: 'linear-gradient(135deg,#0f52ba 0%,#061a40 100%)', padding: '24px 28px', display: 'flex', alignItems: 'center', gap: '16px' }}>
              {isMobile && (
                <button onClick={() => setSelectedStaff(null)} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', color: 'white', borderRadius: '8px', padding: '6px 10px', cursor: 'pointer', fontWeight: 700, marginRight: '4px' }}>â†</button>
              )}
              <div style={{ width: '50px', height: '50px', borderRadius: '14px', background: 'rgba(255,255,255,0.15)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px', fontWeight: 900, flexShrink: 0 }}>
                {selectedStaff.name.charAt(0).toUpperCase()}
              </div>
              <div style={{ flex: 1, overflow: 'hidden' }}>
                <div style={{ fontSize: '18px', fontWeight: 800, color: 'white', letterSpacing: '-0.3px' }}>{selectedStaff.name}</div>
                <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.7)', marginTop: '2px' }}>{getRoleMeta(selectedStaff.roles?.[0]).label} Â· {selectedStaff.email}</div>
              </div>
              <div style={{ padding: '5px 12px', borderRadius: '8px', background: selectedStaff.status === 'inactive' ? 'rgba(239,68,68,0.2)' : 'rgba(34,197,94,0.2)', color: selectedStaff.status === 'inactive' ? '#fca5a5' : '#86efac', fontSize: '10px', fontWeight: 800 }}>
                {(selectedStaff.status || 'active').toUpperCase()}
              </div>
            </div>

            {/* Tab bar */}
            <div style={{ display: 'flex', borderBottom: '1px solid #f1f5f9' }}>
              {DETAIL_TABS.map(tab => (
                <button key={tab.id} onClick={() => setDetailTab(tab.id)} style={{ padding: '14px 20px', border: 'none', background: 'none', cursor: 'pointer', fontSize: '12px', fontWeight: detailTab === tab.id ? 800 : 600, color: detailTab === tab.id ? '#0f52ba' : '#94a3b8', borderBottom: `2px solid ${detailTab === tab.id ? '#0f52ba' : 'transparent'}`, transition: 'all 0.15s' }}>
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Tab content */}
            <div style={{ overflowY: 'auto', maxHeight: '60vh' }}>
              {detailTab === 'profile'    && renderProfileTab(selectedStaff)}
              {detailTab === 'salary'     && renderSalaryTab(selectedStaff)}
              {detailTab === 'attendance' && renderAttendanceTab(selectedStaff)}
              {detailTab === 'leave'      && renderLeaveTab(selectedStaff)}
            </div>
          </div>
        ) : !isMobile && (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'white', borderRadius: '20px', border: '1px dashed #e2e8f0', minHeight: '420px' }}>
            <div style={{ textAlign: 'center', color: '#94a3b8' }}>
              <div style={{ fontSize: '40px', marginBottom: '12px' }}>ðŸ‘¤</div>
              <div style={{ fontSize: '14px', fontWeight: 700, color: '#1e293b' }}>Select a staff member</div>
              <div style={{ fontSize: '12px', marginTop: '4px' }}>Click any name from the roster to view details</div>
            </div>
          </div>
        )}
      </div>

      {/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
          SALARY STRUCTURE DRAWER
      â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */}
      {salaryDrawer.open && selectedStaff && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 10000, backdropFilter: 'blur(8px)', background: 'rgba(10,22,40,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => setSalaryDrawer(p => ({ ...p, open: false }))}
        >
          <div style={{ background: 'white', borderRadius: '24px', padding: '32px', width: '90%', maxWidth: '460px', boxShadow: '0 20px 60px rgba(0,0,0,0.15)' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
              <div>
                <div style={{ fontSize: '16px', fontWeight: 800, color: '#0a1628' }}>Edit Salary Structure</div>
                <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>{selectedStaff.name}</div>
              </div>
              <button onClick={() => setSalaryDrawer(p => ({ ...p, open: false }))} style={{ background: '#f8fafc', border: 'none', borderRadius: '8px', padding: '6px 10px', cursor: 'pointer', fontSize: '16px', color: '#64748b' }}>âœ•</button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '24px' }}>
              {[
                ['Basic Pay',        'basicPay'],
                ['HRA',              'hra'],
                ['Travel Allowance', 'travel'],
                ['Other Allowances', 'otherAllowances'],
                ['PF Deduction',     'pfDeduction'],
                ['TDS',              'tds'],
                ['Other Deductions', 'otherDeductions'],
              ].map(([label, key]) => (
                <div key={key}>
                  <label style={{ fontSize: '9px', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: '6px' }}>{label}</label>
                  <div style={{ display: 'flex', alignItems: 'center', border: '1px solid #e2e8f0', borderRadius: '10px', overflow: 'hidden' }}>
                    <span style={{ padding: '0 8px', fontSize: '12px', fontWeight: 700, color: '#94a3b8', background: '#f8fafc', borderRight: '1px solid #e2e8f0', height: '38px', display: 'flex', alignItems: 'center' }}>â‚¹</span>
                    <input
                      type="number" min="0"
                      value={salaryDrawer.form[key]}
                      onChange={e => setSalaryDrawer(p => ({ ...p, form: { ...p.form, [key]: e.target.value } }))}
                      style={{ flex: 1, padding: '8px 10px', border: 'none', fontSize: '13px', fontWeight: 700, outline: 'none' }}
                    />
                  </div>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: '12px' }}>
              <button onClick={() => setSalaryDrawer(p => ({ ...p, open: false }))} style={{ flex: 1, padding: '12px', borderRadius: '12px', border: '1px solid #e2e8f0', background: 'white', fontWeight: 700, cursor: 'pointer', fontSize: '12px' }}>Cancel</button>
              <button onClick={() => saveSalaryStructure(selectedStaff.id)} style={{ flex: 2, padding: '12px', borderRadius: '12px', background: '#0f52ba', color: 'white', border: 'none', fontWeight: 800, cursor: 'pointer', fontSize: '12px' }}>Save Structure</button>
            </div>
          </div>
        </div>
      )}

      {/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
          ATTENDANCE PICKER
      â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */}
      {attPicker.open && selectedStaff && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 10000, backdropFilter: 'blur(8px)', background: 'rgba(10,22,40,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => setAttPicker(p => ({ ...p, open: false }))}
        >
          <div style={{ background: 'white', borderRadius: '20px', padding: '28px', width: '90%', maxWidth: '340px', boxShadow: '0 20px 60px rgba(0,0,0,0.15)' }} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: '15px', fontWeight: 800, color: '#0a1628', marginBottom: '4px' }}>Mark Attendance</div>
            <div style={{ fontSize: '11px', color: '#94a3b8', marginBottom: '20px' }}>{attPicker.date} Â· {selectedStaff.name}</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '20px' }}>
              {Object.entries(ATT_META).map(([s, m]) => (
                <button
                  key={s}
                  onClick={() => setAttPicker(p => ({ ...p, status: s }))}
                  style={{ padding: '12px', borderRadius: '12px', border: `1.5px solid ${attPicker.status === s ? m.color : '#e2e8f0'}`, background: attPicker.status === s ? m.bg : 'white', color: attPicker.status === s ? m.color : '#64748b', fontWeight: 800, fontSize: '12px', cursor: 'pointer', transition: 'all 0.15s' }}
                >{m.label}</button>
              ))}
            </div>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={() => setAttPicker(p => ({ ...p, open: false }))} style={{ flex: 1, padding: '11px', borderRadius: '10px', border: '1px solid #e2e8f0', background: 'white', fontWeight: 700, cursor: 'pointer' }}>Cancel</button>
              <button onClick={() => markAttendance(selectedStaff.id, attPicker.date, attPicker.status)} style={{ flex: 2, padding: '11px', borderRadius: '10px', background: ATT_META[attPicker.status].color, color: 'white', border: 'none', fontWeight: 800, cursor: 'pointer' }}>Confirm</button>
            </div>
          </div>
        </div>
      )}

      {/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
          LEAVE APPLICATION FORM
      â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */}
      {leaveForm.open && selectedStaff && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 10000, backdropFilter: 'blur(8px)', background: 'rgba(10,22,40,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => setLeaveForm(p => ({ ...p, open: false }))}
        >
          <div style={{ background: 'white', borderRadius: '24px', padding: '32px', width: '90%', maxWidth: '400px', boxShadow: '0 20px 60px rgba(0,0,0,0.15)' }} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: '15px', fontWeight: 800, color: '#0a1628', marginBottom: '4px' }}>Apply for Leave</div>
            <div style={{ fontSize: '11px', color: '#94a3b8', marginBottom: '20px' }}>{selectedStaff.name}</div>

            <div style={{ marginBottom: '16px' }}>
              <label style={{ fontSize: '9px', fontWeight: 800, color: '#94a3b8', letterSpacing: '0.5px', display: 'block', marginBottom: '8px' }}>LEAVE TYPE</label>
              <div style={{ display: 'flex', gap: '8px' }}>
                {LEAVE_TYPES.map(t => (
                  <button key={t} onClick={() => setLeaveForm(p => ({ ...p, type: t }))} style={{ flex: 1, padding: '8px', borderRadius: '10px', border: `1.5px solid ${leaveForm.type === t ? '#0f52ba' : '#e2e8f0'}`, background: leaveForm.type === t ? '#eff6ff' : 'white', color: leaveForm.type === t ? '#0f52ba' : '#64748b', fontWeight: 700, fontSize: '11px', cursor: 'pointer' }}>
                    {t}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
              {[['FROM', 'from'], ['TO', 'to']].map(([lbl, key]) => (
                <div key={key}>
                  <label style={{ fontSize: '9px', fontWeight: 800, color: '#94a3b8', letterSpacing: '0.5px', display: 'block', marginBottom: '6px' }}>{lbl}</label>
                  <input type="date" value={leaveForm[key]} onChange={e => setLeaveForm(p => ({ ...p, [key]: e.target.value }))} style={{ width: '100%', padding: '9px 10px', borderRadius: '10px', border: '1px solid #e2e8f0', fontSize: '12px', outline: 'none', boxSizing: 'border-box' }} />
                </div>
              ))}
            </div>

            <div style={{ marginBottom: '20px' }}>
              <label style={{ fontSize: '9px', fontWeight: 800, color: '#94a3b8', letterSpacing: '0.5px', display: 'block', marginBottom: '6px' }}>REASON (OPTIONAL)</label>
              <textarea value={leaveForm.reason} onChange={e => setLeaveForm(p => ({ ...p, reason: e.target.value }))} rows={2} placeholder="Brief reason..." style={{ width: '100%', padding: '10px', borderRadius: '10px', border: '1px solid #e2e8f0', fontSize: '12px', outline: 'none', resize: 'none', boxSizing: 'border-box' }} />
            </div>

            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={() => setLeaveForm(p => ({ ...p, open: false }))} style={{ flex: 1, padding: '12px', borderRadius: '12px', border: '1px solid #e2e8f0', background: 'white', fontWeight: 700, cursor: 'pointer' }}>Cancel</button>
              <button onClick={() => submitLeave(selectedStaff.id)} style={{ flex: 2, padding: '12px', borderRadius: '12px', background: '#0f52ba', color: 'white', border: 'none', fontWeight: 800, cursor: 'pointer', fontSize: '12px' }}>Submit Leave</button>
            </div>
          </div>
        </div>
      )}

      {/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
          NOTIFICATION MODAL
      â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */}
      {notifModal.isOpen && (() => {
        const COLORS = { success: '#16a34a', error: '#dc2626', warning: '#d97706', info: '#0f52ba' };
        const ICONS  = { success: 'âœ“', error: 'âœ•', warning: 'âš ', info: 'â„¹' };
        const c = COLORS[notifModal.type];
        return (
          <div
            style={{ position: 'fixed', inset: 0, zIndex: 99999, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(12px)', background: 'rgba(10,22,40,0.35)' }}
            onClick={() => setNotifModal(p => ({ ...p, isOpen: false }))}
          >
            <div
              style={{ background: 'rgba(255,255,255,0.96)', borderRadius: '24px', padding: '32px', maxWidth: '400px', width: '90%', boxShadow: `0 20px 60px ${c}25`, border: `1px solid ${c}30`, textAlign: 'center', animation: 'staffNoticePop 0.4s cubic-bezier(0.34,1.56,0.64,1)' }}
              onClick={e => e.stopPropagation()}
            >
              <div style={{ width: '52px', height: '52px', borderRadius: '50%', background: `${c}15`, border: `2px solid ${c}30`, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', fontSize: '22px', color: c, fontWeight: 900 }}>{ICONS[notifModal.type]}</div>
              <div style={{ fontSize: '16px', fontWeight: 800, color: '#0a1628', marginBottom: '8px' }}>{notifModal.title}</div>
              <div style={{ fontSize: '13px', color: '#6b7280', lineHeight: 1.6 }}>{notifModal.message}</div>
              <button onClick={() => setNotifModal(p => ({ ...p, isOpen: false }))} style={{ marginTop: '20px', padding: '10px 28px', borderRadius: '12px', background: c, color: 'white', border: 'none', fontWeight: 800, cursor: 'pointer', fontSize: '12px' }}>OK</button>
            </div>
          </div>
        );
      })()}

      <style>{`
        @keyframes staffNoticePop {
          0%   { opacity: 0; transform: scale(0.8) translateY(20px); }
          100% { opacity: 1; transform: scale(1) translateY(0); }
        }
      `}</style>
    </div>
  );
}
