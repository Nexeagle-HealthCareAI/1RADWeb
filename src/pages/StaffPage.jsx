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

  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // TAB RENDERERS
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

  const renderProfileTab = (staff) => {
    const meta = getRoleMeta(staff.roles?.[0]);
    const sections = [
      {
        title: 'Contact',
        rows: [
          ['Email',  staff.email  || 'â€”'],
          ['Mobile', staff.mobile || 'â€”'],
        ],
      },
      {
        title: 'Professional',
        rows: [
          ['Role',           ROLE_LABELS?.[staff.roles?.[0]] || meta.label],
          ['Specialization', staff.specialization || 'â€”'],
          ['Degree',         staff.degree    || 'â€”'],
          ['License No.',    staff.licenseNo || 'â€”'],
        ],
      },
      {
        title: 'Employment',
        rows: [
          ['Status', (staff.status || 'active').toUpperCase()],
          ['Joined', staff.createdAt
            ? new Date(staff.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
            : 'â€”'],
        ],
      },
    ];
    return (
      <div style={{ padding: '0 24px 24px' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', background: meta.bg, border: `1px solid ${meta.color}35`, borderRadius: '8px', padding: '5px 12px', marginBottom: '20px', marginTop: '20px' }}>
          <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: meta.color }} />
          <span style={{ fontSize: '11px', fontWeight: 800, color: meta.color }}>{meta.label}</span>
          <span style={{ color: '#cbd5e1', fontWeight: 300 }}>|</span>
          <span style={{ fontSize: '11px', fontWeight: 700, color: staff.status === 'inactive' ? '#dc2626' : '#16a34a' }}>
            {(staff.status || 'ACTIVE').toUpperCase()}
          </span>
        </div>

        {sections.map(sec => (
          <div key={sec.title} style={{ marginBottom: '14px' }}>
            <div style={{ fontSize: '9px', fontWeight: 900, color: '#94a3b8', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '6px', paddingLeft: '2px' }}>
              {sec.title}
            </div>
            <div style={{ background: '#f8fafc', borderRadius: '12px', border: '1px solid #f1f5f9', overflow: 'hidden' }}>
              {sec.rows.map(([label, val], idx, arr) => (
                <div key={label} style={{ display: 'flex', alignItems: 'center', padding: '11px 16px', borderBottom: idx < arr.length - 1 ? '1px solid #f1f5f9' : 'none' }}>
                  <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 600, width: '120px', flexShrink: 0 }}>{label}</span>
                  <span style={{ fontSize: '12px', fontWeight: 700, color: '#0f172a', flex: 1, wordBreak: 'break-all' }}>{val}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  };

  const renderSalaryTab = (staff) => {
    const info          = getSalaryInfo(staff.id);
    const raw           = salaryData[staff.id] || {};
    const paidThisMonth = info.disbursements.find(x => x.month === THIS_MONTH);
    const earningRows   = [['Basic Pay', 'basicPay'], ['HRA', 'hra'], ['Travel', 'travel'], ['Other Allow.', 'otherAllowances']];
    const deductRows    = [['PF', 'pfDeduction'], ['TDS', 'tds'], ['Others', 'otherDeductions']];
    return (
      <div style={{ padding: '20px 24px 24px' }}>
        {/* Earnings / Deductions side-by-side */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
          {/* Earnings */}
          <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '14px', padding: '16px' }}>
            <div style={{ fontSize: '9px', fontWeight: 900, color: '#16a34a', letterSpacing: '1px', marginBottom: '12px' }}>EARNINGS</div>
            {earningRows.map(([label, key]) => (
              <div key={key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '7px' }}>
                <span style={{ fontSize: '10px', color: '#64748b', fontWeight: 600 }}>{label}</span>
                <span style={{ fontSize: '11px', fontWeight: 800, color: raw[key] ? '#15803d' : '#cbd5e1' }}>
                  {raw[key] ? `â‚¹${Number(raw[key]).toLocaleString()}` : 'â€”'}
                </span>
              </div>
            ))}
            <div style={{ borderTop: '1px dashed #86efac', marginTop: '10px', paddingTop: '10px', display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '10px', fontWeight: 700, color: '#15803d' }}>Gross</span>
              <span style={{ fontSize: '14px', fontWeight: 900, color: '#15803d' }}>â‚¹{info.gross.toLocaleString()}</span>
            </div>
          </div>

          {/* Deductions */}
          <div style={{ background: '#fff7f7', border: '1px solid #fecaca', borderRadius: '14px', padding: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
              <div style={{ fontSize: '9px', fontWeight: 900, color: '#dc2626', letterSpacing: '1px' }}>DEDUCTIONS</div>
              <button
                onClick={() => setSalaryDrawer({ open: true, form: { basicPay: raw.basicPay || '', hra: raw.hra || '', travel: raw.travel || '', otherAllowances: raw.otherAllowances || '', pfDeduction: raw.pfDeduction || '', tds: raw.tds || '', otherDeductions: raw.otherDeductions || '' } })}
                style={{ fontSize: '9px', fontWeight: 700, color: '#0f52ba', background: 'white', border: '1px solid #dbeafe', borderRadius: '6px', padding: '3px 9px', cursor: 'pointer', whiteSpace: 'nowrap' }}
              >Edit</button>
            </div>
            {deductRows.map(([label, key]) => (
              <div key={key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '7px' }}>
                <span style={{ fontSize: '10px', color: '#64748b', fontWeight: 600 }}>{label}</span>
                <span style={{ fontSize: '11px', fontWeight: 800, color: raw[key] ? '#dc2626' : '#cbd5e1' }}>
                  {raw[key] ? `â‚¹${Number(raw[key]).toLocaleString()}` : 'â€”'}
                </span>
              </div>
            ))}
            <div style={{ borderTop: '1px dashed #fca5a5', marginTop: '10px', paddingTop: '10px', display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '10px', fontWeight: 700, color: '#b91c1c' }}>Deductions</span>
              <span style={{ fontSize: '14px', fontWeight: 900, color: '#b91c1c' }}>â‚¹{info.deductions.toLocaleString()}</span>
            </div>
          </div>
        </div>

        {/* Net Pay banner */}
        <div style={{ background: 'linear-gradient(135deg,#0f52ba,#083889)', borderRadius: '14px', padding: '18px 22px', marginBottom: '14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: '9px', fontWeight: 800, color: 'rgba(255,255,255,0.55)', letterSpacing: '1px', marginBottom: '4px' }}>NET PAY / MONTH</div>
            <div style={{ fontSize: '26px', fontWeight: 900, color: 'white', letterSpacing: '-0.5px' }}>â‚¹{info.net.toLocaleString()}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '9px', color: 'rgba(255,255,255,0.45)', marginBottom: '3px' }}>Gross âˆ’ Deductions</div>
            <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.65)', fontWeight: 600 }}>
              â‚¹{info.gross.toLocaleString()} âˆ’ â‚¹{info.deductions.toLocaleString()}
            </div>
          </div>
        </div>

        {/* This month disbursal */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', borderRadius: '12px', border: `1px solid ${paidThisMonth ? '#bbf7d0' : '#fde68a'}`, background: paidThisMonth ? '#f0fdf4' : '#fffbeb', marginBottom: '22px' }}>
          <div>
            <div style={{ fontSize: '10px', fontWeight: 600, color: '#64748b' }}>{MONTHS[TODAY.getMonth()]} {TODAY.getFullYear()}</div>
            <div style={{ fontSize: '13px', fontWeight: 800, color: '#0f172a', marginTop: '2px' }}>
              {paidThisMonth
                ? <span style={{ color: '#16a34a' }}>âœ“ Disbursed Â· â‚¹{info.net.toLocaleString()}</span>
                : <span style={{ color: '#92400e' }}>Pending disbursement</span>}
            </div>
          </div>
          {!paidThisMonth
            ? <button onClick={() => disburseSalary(staff.id, THIS_MONTH)} style={{ padding: '8px 18px', borderRadius: '9px', background: '#16a34a', color: 'white', border: 'none', fontWeight: 800, fontSize: '11px', cursor: 'pointer', letterSpacing: '0.5px' }}>MARK PAID</button>
            : <span style={{ fontSize: '10px', color: '#16a34a', fontWeight: 700 }}>
                Paid {new Date(paidThisMonth.paidOn).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
              </span>
          }
        </div>

        {/* Payment history */}
        <div style={{ fontSize: '9px', fontWeight: 900, color: '#94a3b8', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '10px' }}>Payment History</div>
        {info.disbursements.length === 0
          ? <div style={{ textAlign: 'center', padding: '20px', color: '#cbd5e1', fontSize: '12px', background: '#f8fafc', borderRadius: '10px' }}>No disbursements recorded.</div>
          : [...info.disbursements].reverse().map(d => (
            <div key={d.month} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '11px 14px', background: '#f8fafc', borderRadius: '10px', border: '1px solid #f1f5f9', marginBottom: '6px' }}>
              <div>
                <div style={{ fontSize: '12px', fontWeight: 700, color: '#0f172a' }}>{d.month}</div>
                <div style={{ fontSize: '10px', color: '#94a3b8', marginTop: '1px' }}>Gross â‚¹{(d.grossPay || 0).toLocaleString()}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '13px', fontWeight: 800, color: '#16a34a' }}>â‚¹{(d.netPay || 0).toLocaleString()}</div>
                <span style={{ fontSize: '9px', background: '#dcfce7', color: '#16a34a', padding: '2px 7px', borderRadius: '4px', fontWeight: 700, letterSpacing: '0.5px' }}>PAID</span>
              </div>
            </div>
          ))
        }
      </div>
    );
  };

  const renderAttendanceTab = (staff) => {
    const [yr, mn]  = attendanceMonth.split('-').map(Number);
    const daysInMon = new Date(yr, mn, 0).getDate();
    const firstDow  = new Date(yr, mn - 1, 1).getDay();
    const summary   = getAttSummary(staff.id, attendanceMonth);
    const records   = attendanceData[staff.id] || {};
    const prevMonth = () => { const d = new Date(yr, mn - 2, 1); setAttendanceMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`); };
    const nextMonth = () => { const d = new Date(yr, mn, 1);     setAttendanceMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`); };
    return (
      <div style={{ padding: '20px 24px 24px' }}>
        {/* Month navigator */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <button onClick={prevMonth} style={{ width: '32px', height: '32px', background: '#f1f5f9', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 800, color: '#475569', fontSize: '18px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>â€¹</button>
          <span style={{ fontWeight: 800, fontSize: '14px', color: '#0f172a' }}>{MONTHS[mn - 1]} {yr}</span>
          <button onClick={nextMonth} style={{ width: '32px', height: '32px', background: '#f1f5f9', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 800, color: '#475569', fontSize: '18px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>â€º</button>
        </div>

        {/* Summary row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '6px', marginBottom: '18px' }}>
          {Object.entries(summary).map(([s, count]) => (
            <div key={s} style={{ background: ATT_META[s].bg, borderRadius: '10px', padding: '8px 4px', textAlign: 'center', border: `1px solid ${ATT_META[s].color}25` }}>
              <div style={{ fontSize: '18px', fontWeight: 900, color: ATT_META[s].color, lineHeight: 1 }}>{count}</div>
              <div style={{ fontSize: '8px', fontWeight: 700, color: ATT_META[s].color, opacity: 0.8, marginTop: '3px', letterSpacing: '0.3px' }}>
                {ATT_META[s].label.split(' ')[0].toUpperCase()}
              </div>
            </div>
          ))}
        </div>

        {/* Calendar grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '3px' }}>
          {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((d, i) => (
            <div key={i} style={{ textAlign: 'center', fontSize: '8px', fontWeight: 800, color: '#94a3b8', paddingBottom: '8px', letterSpacing: '0.5px' }}>{d}</div>
          ))}
          {Array.from({ length: firstDow }).map((_, i) => <div key={`_${i}`} />)}
          {Array.from({ length: daysInMon }).map((_, i) => {
            const day    = i + 1;
            const ds     = `${attendanceMonth}-${String(day).padStart(2, '0')}`;
            const st     = records[ds];
            const meta   = st ? ATT_META[st] : null;
            const isToday = ds === TODAY_STR;
            return (
              <div
                key={day}
                onClick={() => setAttPicker({ open: true, date: ds, status: st || 'present' })}
                title={st ? ATT_META[st].label : 'Click to mark'}
                style={{
                  aspectRatio: '1', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  borderRadius: '6px', cursor: 'pointer', fontSize: '11px',
                  fontWeight: isToday ? 900 : 600,
                  background: meta ? meta.bg : isToday ? '#eff6ff' : '#f8fafc',
                  border: `1.5px solid ${isToday ? '#0f52ba' : meta ? meta.color + '50' : '#f1f5f9'}`,
                  color: meta ? meta.color : isToday ? '#0f52ba' : '#64748b',
                  boxShadow: isToday ? '0 0 0 2px #bfdbfe' : 'none',
                  transition: 'all 0.1s',
                }}
              >{day}</div>
            );
          })}
        </div>

        {/* Legend */}
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginTop: '16px', paddingTop: '14px', borderTop: '1px solid #f1f5f9' }}>
          {Object.entries(ATT_META).map(([s, m]) => (
            <div key={s} style={{ display: 'flex', gap: '5px', alignItems: 'center' }}>
              <div style={{ width: '8px', height: '8px', borderRadius: '2px', background: m.color }} />
              <span style={{ fontSize: '9px', fontWeight: 600, color: '#94a3b8' }}>{m.label}</span>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderLeaveTab = (staff) => {
    const { balance } = getLeaveBalance(staff.id);
    const staffLeaves = leaveData
      .filter(l => l.staffId === staff.id)
      .sort((a, b) => new Date(b.appliedOn) - new Date(a.appliedOn));
    const statusMeta = {
      pending:  { color: '#d97706', bg: '#fffbeb', label: 'Pending'  },
      approved: { color: '#16a34a', bg: '#f0fdf4', label: 'Approved' },
      rejected: { color: '#dc2626', bg: '#fef2f2', label: 'Rejected' },
    };
    return (
      <div style={{ padding: '20px 24px 24px' }}>
        {/* Balance cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', marginBottom: '16px' }}>
          {LEAVE_TYPES.map(type => {
            const pct = LEAVE_DEFAULTS[type] > 0 ? (balance[type] / LEAVE_DEFAULTS[type]) * 100 : 0;
            return (
              <div key={type} style={{ background: 'white', borderRadius: '14px', padding: '14px', border: '1px solid #f1f5f9', boxShadow: '0 2px 8px rgba(0,0,0,0.03)' }}>
                <div style={{ fontSize: '9px', fontWeight: 900, color: '#94a3b8', letterSpacing: '0.8px', textTransform: 'uppercase', marginBottom: '8px' }}>{type}</div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '3px', marginBottom: '8px' }}>
                  <span style={{ fontSize: '22px', fontWeight: 900, color: balance[type] > 1 ? '#0f52ba' : '#dc2626', lineHeight: 1 }}>{balance[type]}</span>
                  <span style={{ fontSize: '10px', color: '#94a3b8', fontWeight: 600 }}>/ {LEAVE_DEFAULTS[type]}</span>
                </div>
                <div style={{ height: '3px', background: '#f1f5f9', borderRadius: '2px', overflow: 'hidden' }}>
                  <div style={{ height: '100%', borderRadius: '2px', transition: 'width 0.4s', background: balance[type] > 1 ? '#0f52ba' : '#dc2626', width: `${pct}%` }} />
                </div>
                <div style={{ fontSize: '8px', color: '#94a3b8', marginTop: '5px', fontWeight: 600 }}>{balance[type]} days left</div>
              </div>
            );
          })}
        </div>

        <button
          onClick={() => setLeaveForm({ open: true, type: 'Sick', from: '', to: '', reason: '' })}
          style={{ width: '100%', padding: '11px', borderRadius: '12px', background: 'linear-gradient(135deg,#0f52ba,#083889)', color: 'white', border: 'none', fontWeight: 800, fontSize: '12px', cursor: 'pointer', marginBottom: '20px', letterSpacing: '0.5px' }}
        >+ Apply Leave</button>

        <div style={{ fontSize: '9px', fontWeight: 900, color: '#94a3b8', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '10px' }}>Leave History</div>
        {staffLeaves.length === 0
          ? <div style={{ textAlign: 'center', padding: '24px', color: '#cbd5e1', fontSize: '12px', background: '#f8fafc', borderRadius: '10px' }}>No leave records.</div>
          : staffLeaves.map(l => {
            const sm = statusMeta[l.status] || statusMeta.pending;
            return (
              <div key={l.id} style={{ padding: '12px 14px', background: 'white', borderRadius: '12px', border: '1px solid #f1f5f9', marginBottom: '8px', boxShadow: '0 1px 4px rgba(0,0,0,0.03)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                      <span style={{ fontSize: '12px', fontWeight: 800, color: '#0f172a' }}>{l.type} Leave</span>
                      <span style={{ fontSize: '10px', background: '#f1f5f9', color: '#64748b', padding: '1px 7px', borderRadius: '5px', fontWeight: 700 }}>{l.days}d</span>
                    </div>
                    <div style={{ fontSize: '10px', color: '#94a3b8', fontWeight: 600 }}>{l.from} â†’ {l.to}</div>
                    {l.reason && <div style={{ fontSize: '10px', color: '#64748b', marginTop: '4px', fontStyle: 'italic' }}>"{l.reason}"</div>}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '6px' }}>
                    <span style={{ fontSize: '9px', fontWeight: 800, color: sm.color, background: sm.bg, padding: '3px 9px', borderRadius: '6px', letterSpacing: '0.5px' }}>{sm.label.toUpperCase()}</span>
                    {l.status === 'pending' && (
                      <div style={{ display: 'flex', gap: '4px' }}>
                        <button onClick={() => updateLeaveStatus(l.id, 'approved')} style={{ fontSize: '10px', padding: '3px 10px', borderRadius: '5px', background: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0', cursor: 'pointer', fontWeight: 800 }}>âœ“</button>
                        <button onClick={() => updateLeaveStatus(l.id, 'rejected')} style={{ fontSize: '10px', padding: '3px 10px', borderRadius: '5px', background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', cursor: 'pointer', fontWeight: 800 }}>âœ•</button>
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

  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // MAIN RENDER
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  const DETAIL_TABS = [
    { id: 'profile',    label: 'Profile'    },
    { id: 'salary',     label: 'Salary'     },
    { id: 'attendance', label: 'Attendance' },
    { id: 'leave',      label: 'Leave'      },
  ];

  // SVG icons for KPI bar (no emoji)
  const IconUsers   = () => <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg>;
  const IconDoctor  = () => <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><path d="M12 2a5 5 0 100 10A5 5 0 0012 2z"/><path d="M12 12v4M10 14h4"/><path d="M5 22a7 7 0 0114 0"/></svg>;
  const IconCal     = () => <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>;
  const IconRupee   = () => <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><path d="M6 3h12M6 8h12M6 21l7-13M13 8c3 0 5 1.5 5 4s-2 4-5 4"/></svg>;
  const IconRefresh = () => <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/></svg>;
  const IconSearch  = () => <svg width="13" height="13" fill="none" stroke="#94a3b8" strokeWidth="2" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>;
  const IconPerson  = () => <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>;

  return (
    <div style={{ padding: '28px 28px 48px', fontFamily: '"Inter", "Segoe UI", system-ui, sans-serif', minHeight: '100vh', background: '#f1f5f9' }}>

      {/* â”€â”€ Page header â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '20px', fontWeight: 800, color: '#0a1628', margin: 0, letterSpacing: '-0.3px' }}>Staff Management</h1>
          <span style={{ fontSize: '12px', color: '#94a3b8', fontWeight: 500 }}>{activeCenter?.name || 'Your facility'} Â· HR & Payroll</span>
        </div>
        <button
          onClick={() => { fetchPersonnel(); loadLocalData(); }}
          style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px', borderRadius: '10px', background: 'white', border: '1px solid #e2e8f0', fontSize: '12px', fontWeight: 700, color: '#475569', cursor: 'pointer', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}
        >
          <IconRefresh /> Refresh
        </button>
      </div>

      {/* â”€â”€ KPI bar â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4, 1fr)', gap: '14px', marginBottom: '24px' }}>
        {[
          { label: 'Total Staff',     value: metrics.total,                               Icon: IconUsers,  accent: '#0f52ba', bg: '#eff6ff', border: '#dbeafe' },
          { label: 'Doctors',         value: metrics.doctors,                             Icon: IconDoctor, accent: '#0891b2', bg: '#ecfeff', border: '#a5f3fc' },
          { label: 'On Leave Today',  value: metrics.onLeave,                             Icon: IconCal,    accent: '#d97706', bg: '#fffbeb', border: '#fde68a' },
          { label: 'Monthly Payroll', value: `â‚¹${metrics.totalPayroll.toLocaleString()}`, Icon: IconRupee,  accent: '#16a34a', bg: '#f0fdf4', border: '#bbf7d0' },
        ].map(({ label, value, Icon, accent, bg, border }) => (
          <div key={label} style={{ background: 'white', border: `1px solid ${border}`, borderRadius: '16px', padding: '18px 20px', display: 'flex', alignItems: 'center', gap: '14px', boxShadow: '0 2px 8px rgba(0,0,0,0.03)' }}>
            <div style={{ width: '42px', height: '42px', borderRadius: '11px', background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', color: accent, flexShrink: 0 }}>
              <Icon />
            </div>
            <div>
              <div style={{ fontSize: '22px', fontWeight: 900, color: '#0a1628', lineHeight: 1.1, letterSpacing: '-0.5px' }}>{value}</div>
              <div style={{ fontSize: '11px', fontWeight: 500, color: '#94a3b8', marginTop: '3px' }}>{label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* â”€â”€ Split layout â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <div style={{ display: isMobile ? 'block' : 'flex', gap: '20px', alignItems: 'flex-start' }}>

        {/* LEFT: Staff roster */}
        <div style={{
          width: isMobile ? '100%' : '300px', flexShrink: 0,
          background: 'white', borderRadius: '18px', border: '1px solid #e8edf2',
          boxShadow: '0 2px 12px rgba(0,0,0,0.04)', overflow: 'hidden',
          ...(isMobile && selectedStaff ? { display: 'none' } : {}),
        }}>
          {/* Roster header */}
          <div style={{ padding: '16px 16px 12px', borderBottom: '1px solid #f1f5f9', background: '#fafbfc' }}>
            <div style={{ fontSize: '10px', fontWeight: 700, color: '#94a3b8', letterSpacing: '0.5px', marginBottom: '10px', textTransform: 'uppercase' }}>
              {filteredPersonnel.length} {filteredPersonnel.length === 1 ? 'Member' : 'Members'}
            </div>
            <div style={{ position: 'relative', marginBottom: '10px' }}>
              <div style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', display: 'flex' }}>
                <IconSearch />
              </div>
              <input
                type="text" placeholder="Search name or emailâ€¦" value={search}
                onChange={e => setSearch(e.target.value)}
                style={{ width: '100%', padding: '9px 10px 9px 32px', borderRadius: '9px', border: '1px solid #e2e8f0', fontSize: '12px', outline: 'none', boxSizing: 'border-box', color: '#0f172a', background: 'white' }}
              />
            </div>
            <div style={{ display: 'flex', gap: '4px' }}>
              {[['ALL', 'All'], ['DOCTORS', 'Doctors'], ['TECHNICIANS', 'Techs'], ['ADMINS', 'Admin']].map(([val, lbl]) => (
                <button key={val} onClick={() => setRoleFilter(val)} style={{ flex: 1, padding: '5px 2px', borderRadius: '7px', border: `1px solid ${roleFilter === val ? '#0f52ba' : '#e2e8f0'}`, background: roleFilter === val ? '#eff6ff' : 'white', color: roleFilter === val ? '#0f52ba' : '#64748b', fontSize: '9px', fontWeight: 700, cursor: 'pointer', transition: 'all 0.12s', letterSpacing: '0.2px' }}>
                  {lbl}
                </button>
              ))}
            </div>
          </div>

          {/* Staff list */}
          <div style={{ overflowY: 'auto', maxHeight: isMobile ? '400px' : '62vh' }}>
            {loading
              ? (
                <div style={{ padding: '40px', textAlign: 'center', color: '#94a3b8', fontSize: '12px' }}>
                  <div style={{ width: '20px', height: '20px', border: '2px solid #e2e8f0', borderTopColor: '#0f52ba', borderRadius: '50%', animation: 'staffSpin 0.8s linear infinite', margin: '0 auto 10px' }} />
                  Loading rosterâ€¦
                </div>
              )
              : filteredPersonnel.length === 0
                ? <div style={{ padding: '40px', textAlign: 'center', color: '#94a3b8', fontSize: '12px' }}>No staff found.</div>
                : filteredPersonnel.map(u => {
                  const meta       = getRoleMeta(u.roles?.[0]);
                  const isSelected = selectedStaff?.id === u.id;
                  const attToday   = (attendanceData[u.id] || {})[TODAY_STR];
                  const salNet     = getSalaryInfo(u.id).net;
                  return (
                    <div
                      key={u.id}
                      onClick={() => { setSelectedStaff(u); setDetailTab('profile'); }}
                      style={{
                        padding: '12px 16px', cursor: 'pointer', borderBottom: '1px solid #f8fafc',
                        background: isSelected ? '#f0f7ff' : 'white',
                        borderLeft: `3px solid ${isSelected ? '#0f52ba' : 'transparent'}`,
                        transition: 'background 0.12s',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '11px' }}>
                        <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: isSelected ? '#0f52ba' : meta.bg, color: isSelected ? 'white' : meta.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', fontWeight: 800, flexShrink: 0, transition: 'all 0.15s' }}>
                          {u.name.charAt(0).toUpperCase()}
                        </div>
                        <div style={{ flex: 1, overflow: 'hidden' }}>
                          <div style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>{u.name}</div>
                          <div style={{ fontSize: '10px', color: meta.color, fontWeight: 600, marginTop: '1px' }}>{meta.label}</div>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '3px', flexShrink: 0 }}>
                          {attToday && (
                            <div style={{ width: '7px', height: '7px', borderRadius: '50%', background: ATT_META[attToday]?.color }} title={ATT_META[attToday]?.label} />
                          )}
                          {salNet > 0 && (
                            <div style={{ fontSize: '9px', color: '#94a3b8', fontWeight: 600 }}>â‚¹{(salNet / 1000).toFixed(0)}k</div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
            }
          </div>
        </div>

        {/* RIGHT: Detail panel */}
        {selectedStaff ? (
          <div style={{ flex: 1, background: 'white', borderRadius: '18px', border: '1px solid #e8edf2', boxShadow: '0 2px 12px rgba(0,0,0,0.04)', overflow: 'hidden', minWidth: 0 }}>

            {/* Staff banner */}
            <div style={{ background: 'linear-gradient(135deg,#0f52ba 0%,#083889 100%)', padding: '22px 26px', display: 'flex', alignItems: 'center', gap: '16px' }}>
              {isMobile && (
                <button onClick={() => setSelectedStaff(null)} style={{ background: 'rgba(255,255,255,0.12)', border: 'none', color: 'white', borderRadius: '8px', padding: '6px 11px', cursor: 'pointer', fontWeight: 700, fontSize: '18px', lineHeight: 1 }}>â€¹</button>
              )}
              <div style={{ width: '48px', height: '48px', borderRadius: '13px', background: 'rgba(255,255,255,0.14)', backdropFilter: 'blur(8px)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px', fontWeight: 900, flexShrink: 0, border: '1.5px solid rgba(255,255,255,0.18)' }}>
                {selectedStaff.name.charAt(0).toUpperCase()}
              </div>
              <div style={{ flex: 1, overflow: 'hidden' }}>
                <div style={{ fontSize: '16px', fontWeight: 800, color: 'white', letterSpacing: '-0.2px', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>{selectedStaff.name}</div>
                <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.55)', marginTop: '2px', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>{getRoleMeta(selectedStaff.roles?.[0]).label} Â· {selectedStaff.email || 'No email'}</div>
              </div>
              <span style={{ padding: '4px 11px', borderRadius: '7px', background: selectedStaff.status === 'inactive' ? 'rgba(239,68,68,0.18)' : 'rgba(34,197,94,0.18)', color: selectedStaff.status === 'inactive' ? '#fca5a5' : '#86efac', fontSize: '9px', fontWeight: 900, letterSpacing: '1px', flexShrink: 0 }}>
                {(selectedStaff.status || 'ACTIVE').toUpperCase()}
              </span>
            </div>

            {/* Tab bar */}
            <div style={{ display: 'flex', borderBottom: '1px solid #f1f5f9', background: '#fafbfc' }}>
              {DETAIL_TABS.map(tab => (
                <button key={tab.id} onClick={() => setDetailTab(tab.id)} style={{ padding: '13px 22px', border: 'none', background: 'none', cursor: 'pointer', fontSize: '12px', fontWeight: detailTab === tab.id ? 800 : 600, color: detailTab === tab.id ? '#0f52ba' : '#94a3b8', borderBottom: `2px solid ${detailTab === tab.id ? '#0f52ba' : 'transparent'}`, transition: 'all 0.12s', letterSpacing: '0.2px' }}>
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
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'white', borderRadius: '18px', border: '1.5px dashed #e2e8f0', minHeight: '440px', boxShadow: '0 2px 12px rgba(0,0,0,0.03)' }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ width: '60px', height: '60px', borderRadius: '16px', background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', color: '#94a3b8' }}>
                <IconPerson />
              </div>
              <div style={{ fontSize: '14px', fontWeight: 700, color: '#0f172a' }}>Select a Staff Member</div>
              <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '6px', maxWidth: '200px', lineHeight: 1.5 }}>Click any name from the roster to view their profile, salary, attendance and leave</div>
            </div>
          </div>
        )}
      </div>

      {/* â”€â”€ SALARY STRUCTURE DRAWER â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      {salaryDrawer.open && selectedStaff && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 10000, backdropFilter: 'blur(10px)', background: 'rgba(10,22,40,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => setSalaryDrawer(p => ({ ...p, open: false }))}
        >
          <div style={{ background: 'white', borderRadius: '22px', padding: '30px', width: '90%', maxWidth: '460px', boxShadow: '0 24px 80px rgba(0,0,0,0.18)' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '22px' }}>
              <div>
                <div style={{ fontSize: '16px', fontWeight: 800, color: '#0a1628' }}>Edit Salary Structure</div>
                <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>{selectedStaff.name}</div>
              </div>
              <button onClick={() => setSalaryDrawer(p => ({ ...p, open: false }))} style={{ width: '32px', height: '32px', background: '#f1f5f9', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '14px', color: '#64748b', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800 }}>âœ•</button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '22px' }}>
              {[
                ['Basic Pay',        'basicPay',        false],
                ['HRA',              'hra',             false],
                ['Travel Allowance', 'travel',          false],
                ['Other Allowances', 'otherAllowances', false],
                ['PF Deduction',     'pfDeduction',     true],
                ['TDS',              'tds',             true],
                ['Other Deductions', 'otherDeductions', true],
              ].map(([label, key, isDeduct]) => (
                <div key={key}>
                  <label style={{ fontSize: '9px', fontWeight: 800, color: isDeduct ? '#dc2626' : '#16a34a', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: '6px' }}>{label}</label>
                  <div style={{ display: 'flex', alignItems: 'center', border: `1px solid ${isDeduct ? '#fecaca' : '#bbf7d0'}`, borderRadius: '9px', overflow: 'hidden', background: isDeduct ? '#fff7f7' : '#f0fdf4' }}>
                    <span style={{ padding: '0 9px', fontSize: '12px', fontWeight: 700, color: isDeduct ? '#dc2626' : '#16a34a', borderRight: `1px solid ${isDeduct ? '#fecaca' : '#bbf7d0'}`, height: '38px', display: 'flex', alignItems: 'center' }}>â‚¹</span>
                    <input
                      type="number" min="0"
                      value={salaryDrawer.form[key]}
                      onChange={e => setSalaryDrawer(p => ({ ...p, form: { ...p.form, [key]: e.target.value } }))}
                      style={{ flex: 1, padding: '8px 10px', border: 'none', fontSize: '13px', fontWeight: 700, outline: 'none', background: 'transparent', color: '#0f172a' }}
                    />
                  </div>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={() => setSalaryDrawer(p => ({ ...p, open: false }))} style={{ flex: 1, padding: '12px', borderRadius: '11px', border: '1px solid #e2e8f0', background: 'white', fontWeight: 700, cursor: 'pointer', fontSize: '12px', color: '#64748b' }}>Cancel</button>
              <button onClick={() => saveSalaryStructure(selectedStaff.id)} style={{ flex: 2, padding: '12px', borderRadius: '11px', background: 'linear-gradient(135deg,#0f52ba,#083889)', color: 'white', border: 'none', fontWeight: 800, cursor: 'pointer', fontSize: '12px' }}>Save Structure</button>
            </div>
          </div>
        </div>
      )}

      {/* â”€â”€ ATTENDANCE PICKER â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      {attPicker.open && selectedStaff && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 10000, backdropFilter: 'blur(10px)', background: 'rgba(10,22,40,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => setAttPicker(p => ({ ...p, open: false }))}
        >
          <div style={{ background: 'white', borderRadius: '20px', padding: '26px', width: '90%', maxWidth: '320px', boxShadow: '0 24px 80px rgba(0,0,0,0.18)' }} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: '15px', fontWeight: 800, color: '#0a1628', marginBottom: '3px' }}>Mark Attendance</div>
            <div style={{ fontSize: '11px', color: '#94a3b8', marginBottom: '18px', fontWeight: 500 }}>{attPicker.date} Â· {selectedStaff.name}</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '18px' }}>
              {Object.entries(ATT_META).map(([s, m]) => (
                <button
                  key={s}
                  onClick={() => setAttPicker(p => ({ ...p, status: s }))}
                  style={{ padding: '11px', borderRadius: '10px', border: `1.5px solid ${attPicker.status === s ? m.color : '#e2e8f0'}`, background: attPicker.status === s ? m.bg : 'white', color: attPicker.status === s ? m.color : '#64748b', fontWeight: 800, fontSize: '11px', cursor: 'pointer', transition: 'all 0.12s' }}
                >{m.label}</button>
              ))}
            </div>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={() => setAttPicker(p => ({ ...p, open: false }))} style={{ flex: 1, padding: '11px', borderRadius: '10px', border: '1px solid #e2e8f0', background: 'white', fontWeight: 700, cursor: 'pointer', fontSize: '12px', color: '#64748b' }}>Cancel</button>
              <button onClick={() => markAttendance(selectedStaff.id, attPicker.date, attPicker.status)} style={{ flex: 2, padding: '11px', borderRadius: '10px', background: ATT_META[attPicker.status].color, color: 'white', border: 'none', fontWeight: 800, cursor: 'pointer', fontSize: '12px' }}>Confirm</button>
            </div>
          </div>
        </div>
      )}

      {/* â”€â”€ LEAVE APPLICATION FORM â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      {leaveForm.open && selectedStaff && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 10000, backdropFilter: 'blur(10px)', background: 'rgba(10,22,40,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => setLeaveForm(p => ({ ...p, open: false }))}
        >
          <div style={{ background: 'white', borderRadius: '22px', padding: '30px', width: '90%', maxWidth: '380px', boxShadow: '0 24px 80px rgba(0,0,0,0.18)' }} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: '15px', fontWeight: 800, color: '#0a1628', marginBottom: '3px' }}>Apply for Leave</div>
            <div style={{ fontSize: '11px', color: '#94a3b8', marginBottom: '20px', fontWeight: 500 }}>{selectedStaff.name}</div>

            <div style={{ marginBottom: '16px' }}>
              <label style={{ fontSize: '9px', fontWeight: 900, color: '#94a3b8', letterSpacing: '0.8px', textTransform: 'uppercase', display: 'block', marginBottom: '8px' }}>Leave Type</label>
              <div style={{ display: 'flex', gap: '6px' }}>
                {LEAVE_TYPES.map(t => (
                  <button key={t} onClick={() => setLeaveForm(p => ({ ...p, type: t }))} style={{ flex: 1, padding: '8px', borderRadius: '9px', border: `1.5px solid ${leaveForm.type === t ? '#0f52ba' : '#e2e8f0'}`, background: leaveForm.type === t ? '#eff6ff' : 'white', color: leaveForm.type === t ? '#0f52ba' : '#64748b', fontWeight: 700, fontSize: '11px', cursor: 'pointer', transition: 'all 0.12s' }}>
                    {t}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '14px' }}>
              {[['FROM', 'from'], ['TO', 'to']].map(([lbl, key]) => (
                <div key={key}>
                  <label style={{ fontSize: '9px', fontWeight: 900, color: '#94a3b8', letterSpacing: '0.8px', textTransform: 'uppercase', display: 'block', marginBottom: '6px' }}>{lbl}</label>
                  <input type="date" value={leaveForm[key]} onChange={e => setLeaveForm(p => ({ ...p, [key]: e.target.value }))} style={{ width: '100%', padding: '9px 10px', borderRadius: '9px', border: '1px solid #e2e8f0', fontSize: '12px', outline: 'none', boxSizing: 'border-box', color: '#0f172a' }} />
                </div>
              ))}
            </div>

            <div style={{ marginBottom: '20px' }}>
              <label style={{ fontSize: '9px', fontWeight: 900, color: '#94a3b8', letterSpacing: '0.8px', textTransform: 'uppercase', display: 'block', marginBottom: '6px' }}>
                Reason <span style={{ fontWeight: 500, textTransform: 'none', letterSpacing: 0 }}>(optional)</span>
              </label>
              <textarea value={leaveForm.reason} onChange={e => setLeaveForm(p => ({ ...p, reason: e.target.value }))} rows={2} placeholder="Brief reasonâ€¦" style={{ width: '100%', padding: '10px', borderRadius: '9px', border: '1px solid #e2e8f0', fontSize: '12px', outline: 'none', resize: 'none', boxSizing: 'border-box', color: '#0f172a', fontFamily: 'inherit' }} />
            </div>

            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={() => setLeaveForm(p => ({ ...p, open: false }))} style={{ flex: 1, padding: '12px', borderRadius: '11px', border: '1px solid #e2e8f0', background: 'white', fontWeight: 700, cursor: 'pointer', fontSize: '12px', color: '#64748b' }}>Cancel</button>
              <button onClick={() => submitLeave(selectedStaff.id)} style={{ flex: 2, padding: '12px', borderRadius: '11px', background: 'linear-gradient(135deg,#0f52ba,#083889)', color: 'white', border: 'none', fontWeight: 800, cursor: 'pointer', fontSize: '12px' }}>Submit Leave</button>
            </div>
          </div>
        </div>
      )}

      {/* â”€â”€ NOTIFICATION MODAL â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
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
              style={{ background: 'rgba(255,255,255,0.97)', borderRadius: '22px', padding: '32px', maxWidth: '380px', width: '90%', boxShadow: `0 24px 60px ${c}20`, border: `1px solid ${c}25`, textAlign: 'center', animation: 'staffNoticePop 0.4s cubic-bezier(0.34,1.56,0.64,1)' }}
              onClick={e => e.stopPropagation()}
            >
              <div style={{ width: '50px', height: '50px', borderRadius: '50%', background: `${c}12`, border: `2px solid ${c}25`, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', fontSize: '20px', color: c, fontWeight: 900 }}>{ICONS[notifModal.type]}</div>
              <div style={{ fontSize: '16px', fontWeight: 800, color: '#0a1628', marginBottom: '8px' }}>{notifModal.title}</div>
              <div style={{ fontSize: '13px', color: '#6b7280', lineHeight: 1.6 }}>{notifModal.message}</div>
              <button onClick={() => setNotifModal(p => ({ ...p, isOpen: false }))} style={{ marginTop: '20px', padding: '10px 30px', borderRadius: '11px', background: c, color: 'white', border: 'none', fontWeight: 800, cursor: 'pointer', fontSize: '12px', letterSpacing: '0.5px' }}>OK</button>
            </div>
          </div>
        );
      })()}

      <style>{`
        @keyframes staffNoticePop {
          0%   { opacity: 0; transform: scale(0.8) translateY(20px); }
          100% { opacity: 1; transform: scale(1) translateY(0); }
        }
        @keyframes staffSpin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

