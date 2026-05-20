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

// ─── Drawer field primitives (used by Add/Edit Staff drawer) ──────────────
const SectionLabel = ({ children }) => (
  <div style={{
    fontSize: '10px', fontWeight: 800, color: '#0a1628',
    letterSpacing: '1.5px', textTransform: 'uppercase',
    paddingBottom: '6px', borderBottom: '1px solid #f1f5f9', marginBottom: '4px',
  }}>{children}</div>
);

const FieldGroup = ({ children }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>{children}</div>
);

const FieldLabel = ({ children, required }) => (
  <label style={{ fontSize: '11px', fontWeight: 700, color: '#475569' }}>
    {children}
    {required && <span style={{ color: '#dc2626', marginLeft: '4px' }}>*</span>}
  </label>
);

const TextInput = ({ value, onChange, type = 'text', placeholder, autoFocus }) => (
  <input
    type={type}
    autoFocus={autoFocus}
    value={value || ''}
    onChange={(e) => onChange(e.target.value)}
    placeholder={placeholder}
    style={{
      width: '100%', padding: '10px 12px', borderRadius: '10px',
      border: '1px solid #e2e8f0', background: 'white',
      fontSize: '13px', color: '#0a1628', fontWeight: 500,
      outline: 'none', boxSizing: 'border-box',
      transition: 'border-color 0.15s, box-shadow 0.15s',
    }}
    onFocus={(e) => { e.target.style.borderColor = '#d4a017'; e.target.style.boxShadow = '0 0 0 3px rgba(212, 160, 23, 0.15)'; }}
    onBlur={(e) => { e.target.style.borderColor = '#e2e8f0'; e.target.style.boxShadow = 'none'; }}
  />
);

// â”€â”€â”€ Component â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export default function StaffPage() {
  const { currentUser, activeCenter } = useAuth();

  // â”€â”€ Core data â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const [personnel,      setPersonnel]      = useState([]);
  const [loading,        setLoading]        = useState(false);
  const [salaryData,     setSalaryData]     = useState({}); // { staffId: { basicPay, hra, travel, otherAllowances, pfDeduction, tds, otherDeductions, disbursements:[] } }
  const [attendanceData, setAttendanceData] = useState({}); // { staffId: { 'YYYY-MM-DD': status } }
  const [leaveData,      setLeaveData]      = useState([]); // [{ id, staffId, type, from, to, days, reason, status, appliedOn }]
  const [documentsData,  setDocumentsData]  = useState({}); // { staffId: [{ id, name, category, uploadedAt, fileData }] }

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

  // Notification + confirm modal (unified)
  const [notifModal, setNotifModal] = useState({ isOpen: false, type: 'info', title: '', message: '' });
  const showNotif = (type, title, message) => setNotifModal({ isOpen: true, type, title, message });
  const askConfirm = ({ title, message, confirmText = 'Confirm', danger = false, onConfirm }) =>
    setNotifModal({ isOpen: true, type: danger ? 'error' : 'info', title, message, isConfirm: true, confirmText, danger, onConfirm });

  // Staff Add / Edit drawer
  const EMPTY_STAFF = {
    id: null, name: '', email: '', mobile: '',
    specialization: '', degree: '', licenseNo: '',
    department: '', designation: '', joiningDate: '', employmentType: 'Full-Time',
  };
  const [staffDrawer, setStaffDrawer] = useState({ open: false, form: EMPTY_STAFF });
  const [savingStaff, setSavingStaff] = useState(false);

  useEffect(() => {
    const h = () => setIsMobile(window.innerWidth < 1024);
    window.addEventListener('resize', h);
    return () => window.removeEventListener('resize', h);
  }, []);

  // â”€â”€ Data loading â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const fetchPersonnel = useCallback(async () => {
    try {
      setLoading(true);
      const res = await apiClient.get('/staff');
      const mapped = (res.data || []).map(p => ({
        id:             p.staffId,
        name:           p.fullName || 'Unknown',
        email:          p.email,
        mobile:         p.mobile,
        roles:          (p.roleNames || []).map(r => String(r).toLowerCase()),
        specialization: p.specialization,
        degree:         p.degree,
        licenseNo:      p.licenseNo,
        designation:    p.designation,
        department:     p.department,
        employmentType: p.employmentType,
        joiningDate:    p.joiningDate,
        status:         p.status || 'Active',
        boardAccessUserId: p.boardAccessUserId,
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
    const [sal, att, lv, docs] = await Promise.all([
      nativeStorage.get('1rad_staff_salary'),
      nativeStorage.get('1rad_staff_attendance'),
      nativeStorage.get('1rad_staff_leave'),
      nativeStorage.get('1rad_staff_documents'),
    ]);
    setSalaryData(sal || {});
    setAttendanceData(att || {});
    setLeaveData(lv || []);
    setDocumentsData(docs || {});
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
    showNotif('success', 'Salary Disbursed', `₹${info.net.toLocaleString()} net salary marked as paid for ${month}.`);
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

  // ── Staff Add / Edit / Delete + Role Assignment ────────────────────────
  const openAddStaff = () => setStaffDrawer({ open: true, form: { ...EMPTY_STAFF } });
  const openEditStaff = (staff) => setStaffDrawer({
    open: true,
    form: {
      id: staff.id, name: staff.name || '', email: staff.email || '', mobile: staff.mobile || '',
      specialization: staff.specialization || '', degree: staff.degree || '', licenseNo: staff.licenseNo || '',
      department: staff.department || '', designation: staff.designation || '',
      joiningDate: staff.joiningDate || '', employmentType: staff.employmentType || 'Full-Time',
    }
  });

  const handleSaveStaff = async (e) => {
    e?.preventDefault?.();
    const form = staffDrawer.form;
    if (!form.name?.trim()) return showNotif('warning', 'Missing name', 'Please enter the staff member’s full name.');

    const payload = {
      fullName: form.name.trim(),
      email: form.email?.trim() || null,
      mobile: form.mobile?.trim() || null,
      designation: form.designation?.trim() || null,
      department: form.department?.trim() || null,
      employmentType: form.employmentType || 'Full-Time',
      joiningDate: form.joiningDate || null,
      roleNames: [],
      specialization: form.specialization || null,
      degree: form.degree || null,
      licenseNo: form.licenseNo || null,
    };

    try {
      setSavingStaff(true);
      if (form.id) {
        await apiClient.put(`/staff/${form.id}`, payload);
        showNotif('success', 'Saved', 'Staff record updated.');
      } else {
        await apiClient.post('/staff', payload);
        showNotif('success', 'Added', `${form.name} added to the team.`);
      }
      setStaffDrawer({ open: false, form: EMPTY_STAFF });
      fetchPersonnel();
    } catch (err) {
      console.error('[STAFF] Save failed', err);
      const msg = err.response?.data?.message || err.response?.data?.error || 'Failed to save staff record.';
      showNotif('error', 'Save failed', msg);
    } finally {
      setSavingStaff(false);
    }
  };

  const handleDeleteStaff = (staff) => {
    askConfirm({
      title: `Remove ${staff.name}?`,
      message: 'This will deactivate their account. Their historical records (payouts, attendance) are preserved.',
      confirmText: 'Remove',
      danger: true,
      onConfirm: async () => {
        try {
          await apiClient.delete(`/staff/${staff.id}`);
          showNotif('success', 'Removed', `${staff.name} has been removed from the team.`);
          if (selectedStaff?.id === staff.id) setSelectedStaff(null);
          fetchPersonnel();
        } catch (err) {
          console.error('[STAFF] Delete failed', err);
          const msg = err.response?.data?.message || 'Failed to remove staff.';
          showNotif('error', 'Could not remove', msg);
        }
      }
    });
  };

  // Toggle a role on an existing staff member (Access tab).
  // Persists immediately via PUT /personnel/{id}.
  const toggleStaffRole = async (staff, roleKey) => {
    const current = new Set((staff.roles || []).map(r => String(r).toLowerCase()));
    if (current.has(roleKey)) current.delete(roleKey);
    else current.add(roleKey);
    const nextRoles = Array.from(current);
    if (nextRoles.length === 0) {
      showNotif('warning', 'At least one role', 'A staff member must keep at least one role.');
      return;
    }
    const roleNameMap = { admindoctor: 'AdminDoctor', admin: 'Admin', doctor: 'Doctor', technician: 'Technician', receptionist: 'Receptionist', accountant: 'Accountant' };
    const payload = {
      fullName: staff.name,
      email: staff.email || null,
      mobile: staff.mobile || null,
      roleNames: nextRoles.map(r => roleNameMap[r] || (r.charAt(0).toUpperCase() + r.slice(1))),
      specialization: staff.specialization || null,
      degree: staff.degree || null,
      licenseNo: staff.licenseNo || null,
    };
    try {
      await apiClient.put(`/staff/${staff.id}`, payload);
      // Optimistic local update so the UI reflects immediately even before refetch.
      const updatedPersonnel = personnel.map(p => p.id === staff.id ? { ...p, roles: nextRoles } : p);
      setPersonnel(updatedPersonnel);
      if (selectedStaff?.id === staff.id) setSelectedStaff({ ...selectedStaff, roles: nextRoles });
      fetchPersonnel();
    } catch (err) {
      console.error('[STAFF] Role toggle failed', err);
      showNotif('error', 'Update failed', err.response?.data?.message || 'Could not update roles.');
    }
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
                  {raw[key] ? `₹${Number(raw[key]).toLocaleString()}` : 'â€”'}
                </span>
              </div>
            ))}
            <div style={{ borderTop: '1px dashed #86efac', marginTop: '10px', paddingTop: '10px', display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '10px', fontWeight: 700, color: '#15803d' }}>Gross</span>
              <span style={{ fontSize: '14px', fontWeight: 900, color: '#15803d' }}>₹{info.gross.toLocaleString()}</span>
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
                  {raw[key] ? `₹${Number(raw[key]).toLocaleString()}` : 'â€”'}
                </span>
              </div>
            ))}
            <div style={{ borderTop: '1px dashed #fca5a5', marginTop: '10px', paddingTop: '10px', display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '10px', fontWeight: 700, color: '#b91c1c' }}>Deductions</span>
              <span style={{ fontSize: '14px', fontWeight: 900, color: '#b91c1c' }}>₹{info.deductions.toLocaleString()}</span>
            </div>
          </div>
        </div>

        {/* Net Pay banner */}
        <div style={{ background: 'linear-gradient(135deg,#0f52ba,#083889)', borderRadius: '14px', padding: '18px 22px', marginBottom: '14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: '9px', fontWeight: 800, color: 'rgba(255,255,255,0.55)', letterSpacing: '1px', marginBottom: '4px' }}>NET PAY / MONTH</div>
            <div style={{ fontSize: '26px', fontWeight: 900, color: 'white', letterSpacing: '-0.5px' }}>₹{info.net.toLocaleString()}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '9px', color: 'rgba(255,255,255,0.45)', marginBottom: '3px' }}>Gross âˆ’ Deductions</div>
            <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.65)', fontWeight: 600 }}>
              ₹{info.gross.toLocaleString()} âˆ’ ₹{info.deductions.toLocaleString()}
            </div>
          </div>
        </div>

        {/* This month disbursal */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', borderRadius: '12px', border: `1px solid ${paidThisMonth ? '#bbf7d0' : '#fde68a'}`, background: paidThisMonth ? '#f0fdf4' : '#fffbeb', marginBottom: '22px' }}>
          <div>
            <div style={{ fontSize: '10px', fontWeight: 600, color: '#64748b' }}>{MONTHS[TODAY.getMonth()]} {TODAY.getFullYear()}</div>
            <div style={{ fontSize: '13px', fontWeight: 800, color: '#0f172a', marginTop: '2px' }}>
              {paidThisMonth
                ? <span style={{ color: '#16a34a' }}>âœ“ Disbursed · ₹{info.net.toLocaleString()}</span>
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
                <div style={{ fontSize: '10px', color: '#94a3b8', marginTop: '1px' }}>Gross ₹{(d.grossPay || 0).toLocaleString()}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '13px', fontWeight: 800, color: '#16a34a' }}>₹{(d.netPay || 0).toLocaleString()}</div>
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
    { id: 'documents',  label: 'Documents'  },
    { id: 'salary',     label: 'Salary'     },
    { id: 'attendance', label: 'Attendance' },
    { id: 'leave',      label: 'Leave'      },
    { id: 'access',     label: 'Access'     },
  ];

  const DOC_CATEGORIES = ['ID Proof', 'Medical License', 'Degree / Certificate', 'Employment Contract', 'Background Check', 'Other'];

  const renderDocumentsTab = (staff) => {
    const docs = documentsData[staff.id] || [];

    const handleFileSelect = async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      if (file.size > 5 * 1024 * 1024) {
        showNotif('warning', 'File too large', 'Maximum file size is 5 MB.');
        return;
      }
      const reader = new FileReader();
      reader.onload = async (ev) => {
        const entry = {
          id: `doc_${Date.now()}`,
          name: file.name,
          category: 'Other',
          size: file.size,
          uploadedAt: new Date().toISOString(),
          fileData: ev.target.result,
        };
        const staffDocs = [...(documentsData[staff.id] || []), entry];
        const updated = { ...documentsData, [staff.id]: staffDocs };
        setDocumentsData(updated);
        await nativeStorage.set('1rad_staff_documents', updated);
        showNotif('success', 'Document saved', `${file.name} uploaded successfully.`);
      };
      reader.readAsDataURL(file);
      e.target.value = '';
    };

    const deleteDoc = async (docId) => {
      const staffDocs = (documentsData[staff.id] || []).filter(d => d.id !== docId);
      const updated = { ...documentsData, [staff.id]: staffDocs };
      setDocumentsData(updated);
      await nativeStorage.set('1rad_staff_documents', updated);
    };

    const changeCategory = async (docId, cat) => {
      const staffDocs = (documentsData[staff.id] || []).map(d => d.id === docId ? { ...d, category: cat } : d);
      const updated = { ...documentsData, [staff.id]: staffDocs };
      setDocumentsData(updated);
      await nativeStorage.set('1rad_staff_documents', updated);
    };

    const EXT_ICON = (name) => {
      const ext = (name || '').split('.').pop().toLowerCase();
      if (['jpg','jpeg','png','gif','webp'].includes(ext)) return { icon: '🖼', color: '#0891b2', bg: '#ecfeff' };
      if (ext === 'pdf') return { icon: '📄', color: '#dc2626', bg: '#fef2f2' };
      if (['doc','docx'].includes(ext)) return { icon: '📝', color: '#0f52ba', bg: '#eff6ff' };
      return { icon: '📎', color: '#64748b', bg: '#f8fafc' };
    };

    return (
      <div style={{ padding: '20px 24px 28px' }}>
        {/* Verification summary */}
        <div style={{ background: 'linear-gradient(135deg, #0a1628 0%, #1e3a5f 100%)', borderRadius: '14px', padding: '18px 20px', marginBottom: '22px', position: 'relative', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '2px', background: 'linear-gradient(90deg, transparent, #d4a017 40%, transparent)' }} />
          <div style={{ fontSize: '9px', fontWeight: 800, color: '#d4a017', letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: '10px' }}>Verification Status</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
            {[
              { label: 'ID Proof',    key: 'ID Proof',              icon: '🪪' },
              { label: 'License',     key: 'Medical License',        icon: '🏥' },
              { label: 'Contract',    key: 'Employment Contract',    icon: '📋' },
            ].map(({ label, key, icon }) => {
              const has = docs.some(d => d.category === key);
              return (
                <div key={key} style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '20px', marginBottom: '4px' }}>{icon}</div>
                  <div style={{ fontSize: '10px', fontWeight: 700, color: has ? '#86efac' : 'rgba(255,255,255,0.4)', marginBottom: '2px' }}>{label}</div>
                  <div style={{ fontSize: '9px', fontWeight: 600, color: has ? '#4ade80' : '#ef4444' }}>{has ? '✓ On file' : 'Missing'}</div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Upload button */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
          <div style={{ fontSize: '10px', fontWeight: 800, color: '#0a1628', letterSpacing: '1px', textTransform: 'uppercase' }}>
            {docs.length} Document{docs.length !== 1 ? 's' : ''}
          </div>
          <label style={{
            display: 'inline-flex', alignItems: 'center', gap: '6px',
            padding: '8px 16px', borderRadius: '9px',
            background: 'linear-gradient(135deg, #d4a017 0%, #b8860b 100%)',
            color: '#0a1628', fontSize: '11px', fontWeight: 800,
            cursor: 'pointer', letterSpacing: '0.3px',
            boxShadow: '0 4px 12px rgba(212,160,23,0.3)',
          }}>
            + Upload
            <input type="file" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.webp" onChange={handleFileSelect} style={{ display: 'none' }} />
          </label>
        </div>

        {/* Document list */}
        {docs.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 20px', background: '#f8fafc', borderRadius: '14px', border: '1.5px dashed #e2e8f0' }}>
            <div style={{ fontSize: '28px', marginBottom: '10px' }}>📂</div>
            <div style={{ fontSize: '13px', fontWeight: 700, color: '#64748b', marginBottom: '4px' }}>No documents yet</div>
            <div style={{ fontSize: '11px', color: '#94a3b8' }}>Upload ID proofs, licenses, and contracts to keep everything in one place.</div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {docs.map(doc => {
              const { icon, color, bg } = EXT_ICON(doc.name);
              return (
                <div key={doc.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 14px', background: 'white', border: '1px solid #e8edf2', borderRadius: '12px', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
                  <div style={{ width: '38px', height: '38px', borderRadius: '9px', background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px', flexShrink: 0, border: `1px solid ${color}20` }}>
                    {icon}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '12px', fontWeight: 700, color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginBottom: '4px' }}>{doc.name}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      <select
                        value={doc.category}
                        onChange={e => changeCategory(doc.id, e.target.value)}
                        style={{ fontSize: '10px', fontWeight: 700, color, background: bg, border: `1px solid ${color}30`, borderRadius: '6px', padding: '2px 6px', outline: 'none', cursor: 'pointer' }}
                      >
                        {DOC_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                      <span style={{ fontSize: '9px', color: '#94a3b8', fontWeight: 600 }}>
                        {new Date(doc.uploadedAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                        {doc.size ? ` · ${(doc.size / 1024).toFixed(0)} KB` : ''}
                      </span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                    {doc.fileData && (
                      <a
                        href={doc.fileData}
                        download={doc.name}
                        style={{ width: '30px', height: '30px', borderRadius: '7px', background: '#eff6ff', border: '1px solid #dbeafe', display: 'flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none', fontSize: '13px' }}
                        title="Download"
                      >⬇</a>
                    )}
                    <button
                      onClick={() => askConfirm({ title: 'Delete document?', message: `Remove "${doc.name}" from records?`, confirmText: 'Delete', danger: true, onConfirm: () => deleteDoc(doc.id) })}
                      style={{ width: '30px', height: '30px', borderRadius: '7px', background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626', cursor: 'pointer', fontSize: '13px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                      title="Remove"
                    >✕</button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  // Role definitions surfaced in the Access tab.
  const ROLE_ACCESS = [
    { key: 'admindoctor',  label: 'Admin Doctor',       desc: 'Full clinical + operations control' },
    { key: 'admin',        label: 'Operations Admin',   desc: 'Operations, billing, configuration' },
    { key: 'doctor',       label: 'Reporting Doctor',   desc: 'Reads and reports on studies' },
    { key: 'technician',   label: 'Imaging Technician', desc: 'Acquires images, manages modality' },
    { key: 'receptionist', label: 'Receptionist',       desc: 'Appointments and patient intake' },
    { key: 'accountant',   label: 'Accountant',         desc: 'Billing and financial ledger' },
  ];

  const renderAccessTab = (staff) => {
    const currentRoles = new Set((staff.roles || []).map(r => String(r).toLowerCase()));
    const hasBoardAccess = !!staff.boardAccessUserId;

    const grantBoardAccess = async () => {
      const pw = window.prompt(`Set a login password for ${staff.name}.\n\nThis will create a board account and allow them to sign in.`);
      if (!pw || pw.trim().length < 8) { showNotif('warning', 'Invalid password', 'Password must be at least 8 characters.'); return; }
      try {
        const roleNameMap = { admindoctor: 'AdminDoctor', admin: 'Admin', doctor: 'Doctor', technician: 'Technician', receptionist: 'Receptionist', accountant: 'Accountant' };
        await apiClient.post(`/staff/${staff.id}/grant-access`, {
          password: pw.trim(),
          roleNames: (staff.roles || ['receptionist']).map(r => roleNameMap[r] || (r.charAt(0).toUpperCase() + r.slice(1))),
        });
        showNotif('success', 'Board access granted', `${staff.name} can now log in to the board.`);
        fetchPersonnel();
      } catch (err) {
        showNotif('error', 'Failed', err.response?.data?.message || 'Could not grant board access.');
      }
    };

    return (
      <div style={{ padding: '20px 24px 24px' }}>
        {!hasBoardAccess ? (
          <div style={{ background: '#f8fafc', border: '1.5px dashed #e2e8f0', borderRadius: '14px', padding: '28px', textAlign: 'center' }}>
            <div style={{ fontSize: '28px', marginBottom: '10px' }}>🔒</div>
            <div style={{ fontSize: '14px', fontWeight: 700, color: '#0a1628', marginBottom: '6px' }}>No board access</div>
            <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '20px', maxWidth: '280px', margin: '0 auto 20px', lineHeight: 1.55 }}>
              {staff.name} is an HR record only. Grant board access to allow them to sign in and use the system boards.
            </div>
            <button
              onClick={grantBoardAccess}
              style={{ padding: '11px 28px', borderRadius: '11px', background: 'linear-gradient(135deg, #0a1628 0%, #1e3a5f 100%)', color: 'white', border: 'none', fontWeight: 800, fontSize: '13px', cursor: 'pointer', boxShadow: '0 6px 18px rgba(10,22,40,0.2)', letterSpacing: '0.3px' }}
            >Grant Board Access</button>
          </div>
        ) : (
          <>
            <div style={{
              background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '12px',
              padding: '12px 14px', marginBottom: '18px', display: 'flex', alignItems: 'flex-start', gap: '10px',
            }}>
              <span style={{ fontSize: '16px', lineHeight: 1, marginTop: '1px' }}>✓</span>
              <div>
                <div style={{ fontSize: '12px', fontWeight: 700, color: '#15803d' }}>Board access active</div>
                <div style={{ fontSize: '11px', color: '#15803d', opacity: 0.85, marginTop: '3px', lineHeight: 1.45 }}>
                  Toggle roles to grant or revoke access to specific boards and modules. At least one role is required.
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {ROLE_ACCESS.map(role => {
                const active = currentRoles.has(role.key);
                const meta = getRoleMeta(role.key);
                return (
                <button
                key={role.key}
                type="button"
                onClick={() => toggleStaffRole(staff, role.key)}
                style={{
                  textAlign: 'left',
                  display: 'flex', alignItems: 'center', gap: '14px',
                  padding: '14px 16px',
                  background: active ? '#fffbeb' : 'white',
                  border: `1px solid ${active ? '#d4a017' : '#e2e8f0'}`,
                  borderRadius: '12px',
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                  boxShadow: active ? '0 4px 12px rgba(212, 160, 23, 0.15)' : '0 1px 2px rgba(0,0,0,0.03)',
                }}
                onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = '#fafbfc'; }}
                onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = 'white'; }}
              >
                <div style={{
                  width: '40px', height: '40px', borderRadius: '10px',
                  background: meta.bg, color: meta.color,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '14px', fontWeight: 900, flexShrink: 0,
                  border: `1px solid ${meta.color}25`,
                }}>{(meta.label || role.label).slice(0, 1).toUpperCase()}</div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '13px', fontWeight: 700, color: '#0a1628', marginBottom: '2px' }}>
                    {role.label}
                  </div>
                  <div style={{ fontSize: '11px', color: '#64748b', lineHeight: 1.4 }}>
                    {role.desc}
                  </div>
                </div>

                <div style={{
                  width: '38px', height: '22px', borderRadius: '99px',
                  background: active ? '#d4a017' : '#e2e8f0',
                  position: 'relative', transition: 'background 0.2s', flexShrink: 0,
                }}>
                  <div style={{
                    position: 'absolute', top: '2px',
                    left: active ? '18px' : '2px',
                    width: '18px', height: '18px', borderRadius: '50%', background: 'white',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.2)', transition: 'left 0.2s',
                  }} />
                </div>
              </button>
            );
          })}
        </div>
          </>
        )}
      </div>
    );
  };

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
      {/* Premium HR hero — deep navy with gold accent line */}
      <div style={{
        position: 'relative',
        background: 'linear-gradient(135deg, #0a1628 0%, #1e3a5f 100%)',
        borderRadius: '18px',
        padding: '24px 28px',
        marginBottom: '24px',
        boxShadow: '0 10px 30px rgba(10, 22, 40, 0.18)',
        overflow: 'hidden',
      }}>
        {/* Decorative gold strip */}
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: '3px',
          background: 'linear-gradient(90deg, transparent, #d4a017 30%, #f5d76e 50%, #d4a017 70%, transparent)',
        }} />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <div style={{ fontSize: '10px', fontWeight: 700, color: '#d4a017', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: '6px' }}>
              Human Resources
            </div>
            <h1 style={{ fontSize: '24px', fontWeight: 800, color: 'white', margin: 0, letterSpacing: '-0.4px' }}>Staff &amp; Payroll</h1>
            <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.65)', fontWeight: 500, marginTop: '4px', display: 'block' }}>
              {activeCenter?.name || 'Your facility'} · Roster, roles, attendance, and disbursements
            </span>
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <button
              onClick={() => { fetchPersonnel(); loadLocalData(); }}
              style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '9px 16px', borderRadius: '10px', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.18)', fontSize: '12px', fontWeight: 700, color: 'rgba(255,255,255,0.85)', cursor: 'pointer', backdropFilter: 'blur(8px)' }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.14)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; }}
            >
              <IconRefresh /> Refresh
            </button>
            <button
              onClick={openAddStaff}
              style={{
                display: 'flex', alignItems: 'center', gap: '6px',
                padding: '10px 20px', borderRadius: '10px',
                background: 'linear-gradient(135deg, #d4a017 0%, #b8860b 100%)',
                color: '#0a1628', border: 'none',
                fontSize: '12px', fontWeight: 800, cursor: 'pointer',
                boxShadow: '0 6px 18px rgba(212, 160, 23, 0.35)',
                letterSpacing: '0.3px',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 8px 22px rgba(212, 160, 23, 0.5)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = '0 6px 18px rgba(212, 160, 23, 0.35)'; }}
            >
              + Add staff
            </button>
          </div>
        </div>
      </div>

      {/* â”€â”€ KPI bar â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4, 1fr)', gap: '14px', marginBottom: '24px' }}>
        {[
          { label: 'Total Staff',     value: metrics.total,                               Icon: IconUsers,  accent: '#0f52ba', bg: '#eff6ff', border: '#dbeafe' },
          { label: 'Doctors',         value: metrics.doctors,                             Icon: IconDoctor, accent: '#0891b2', bg: '#ecfeff', border: '#a5f3fc' },
          { label: 'On Leave Today',  value: metrics.onLeave,                             Icon: IconCal,    accent: '#d97706', bg: '#fffbeb', border: '#fde68a' },
          { label: 'Monthly Payroll', value: `₹${metrics.totalPayroll.toLocaleString()}`, Icon: IconRupee,  accent: '#16a34a', bg: '#f0fdf4', border: '#bbf7d0' },
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
                            <div style={{ fontSize: '9px', color: '#94a3b8', fontWeight: 600 }}>₹{(salNet / 1000).toFixed(0)}k</div>
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
                <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.55)', marginTop: '2px', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>{getRoleMeta(selectedStaff.roles?.[0]).label} · {selectedStaff.email || 'No email'}</div>
              </div>
              <span style={{ padding: '4px 11px', borderRadius: '7px', background: selectedStaff.status === 'inactive' ? 'rgba(239,68,68,0.18)' : 'rgba(34,197,94,0.18)', color: selectedStaff.status === 'inactive' ? '#fca5a5' : '#86efac', fontSize: '9px', fontWeight: 900, letterSpacing: '1px', flexShrink: 0 }}>
                {(selectedStaff.status || 'ACTIVE').toUpperCase()}
              </span>
              <button
                onClick={() => openEditStaff(selectedStaff)}
                title="Edit staff record"
                style={{
                  background: 'linear-gradient(135deg, #d4a017 0%, #b8860b 100%)',
                  border: 'none', borderRadius: '8px',
                  padding: '6px 14px', color: '#0a1628',
                  fontSize: '11px', fontWeight: 800, cursor: 'pointer',
                  letterSpacing: '0.3px', flexShrink: 0,
                  boxShadow: '0 4px 12px rgba(212, 160, 23, 0.3)',
                }}
              >Edit</button>
            </div>

            {/* Tab bar */}
            <div style={{ display: 'flex', borderBottom: '1px solid #f1f5f9', background: '#fafbfc' }}>
              {DETAIL_TABS.map(tab => (
                <button key={tab.id} onClick={() => setDetailTab(tab.id)} style={{ padding: '13px 22px', border: 'none', background: 'none', cursor: 'pointer', fontSize: '12px', fontWeight: detailTab === tab.id ? 800 : 600, color: detailTab === tab.id ? '#0a1628' : '#94a3b8', borderBottom: `2px solid ${detailTab === tab.id ? '#d4a017' : 'transparent'}`, transition: 'all 0.12s', letterSpacing: '0.2px' }}>
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Tab content */}
            <div style={{ overflowY: 'auto', maxHeight: '60vh' }}>
              {detailTab === 'profile'    && renderProfileTab(selectedStaff)}
              {detailTab === 'documents'  && renderDocumentsTab(selectedStaff)}
              {detailTab === 'salary'     && renderSalaryTab(selectedStaff)}
              {detailTab === 'attendance' && renderAttendanceTab(selectedStaff)}
              {detailTab === 'leave'      && renderLeaveTab(selectedStaff)}
              {detailTab === 'access'     && renderAccessTab(selectedStaff)}
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
                    <span style={{ padding: '0 9px', fontSize: '12px', fontWeight: 700, color: isDeduct ? '#dc2626' : '#16a34a', borderRight: `1px solid ${isDeduct ? '#fecaca' : '#bbf7d0'}`, height: '38px', display: 'flex', alignItems: 'center' }}>₹</span>
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
            <div style={{ fontSize: '11px', color: '#94a3b8', marginBottom: '18px', fontWeight: 500 }}>{attPicker.date} · {selectedStaff.name}</div>
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

      {/* ── ADD / EDIT STAFF DRAWER ─────────────────────────────────────── */}
      {staffDrawer.open && (
        <div
          onClick={() => setStaffDrawer(p => ({ ...p, open: false }))}
          style={{
            position: 'fixed', inset: 0, zIndex: 10001,
            background: 'rgba(10, 22, 40, 0.55)', backdropFilter: 'blur(6px)',
            display: 'flex', justifyContent: 'flex-end',
            animation: 'staffFadeIn 0.18s ease-out',
          }}
        >
          <form
            onSubmit={handleSaveStaff}
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '560px', maxWidth: '100vw', height: '100%',
              background: 'white', display: 'flex', flexDirection: 'column',
              boxShadow: '-12px 0 32px rgba(15,23,42,0.22)',
              animation: 'staffSlideIn 0.28s cubic-bezier(0.16, 1, 0.3, 1)',
            }}
          >
            {/* Drawer header — navy hero */}
            <div style={{ padding: '22px 28px', background: 'linear-gradient(135deg, #0a1628 0%, #1e3a5f 100%)', color: 'white', position: 'relative', overflow: 'hidden' }}>
              <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '3px', background: 'linear-gradient(90deg, transparent, #d4a017 30%, #f5d76e 50%, #d4a017 70%, transparent)' }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
                <div>
                  <div style={{ fontSize: '10px', fontWeight: 700, color: '#d4a017', letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: '4px' }}>
                    {staffDrawer.form.id ? 'Edit Staff' : 'Add Staff'}
                  </div>
                  <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 800, letterSpacing: '-0.3px' }}>
                    {staffDrawer.form.id ? 'Update record' : 'Add staff member'}
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={() => setStaffDrawer(p => ({ ...p, open: false }))}
                  aria-label="Close"
                  style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', color: 'white', cursor: 'pointer', fontSize: '16px' }}
                >×</button>
              </div>
            </div>

            {/* Form body */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '22px 28px', display: 'flex', flexDirection: 'column', gap: '18px' }}>

              {/* Identity */}
              <SectionLabel>Identity</SectionLabel>
              <FieldGroup>
                <FieldLabel required>Full name</FieldLabel>
                <TextInput
                  autoFocus
                  value={staffDrawer.form.name}
                  onChange={(v) => setStaffDrawer(p => ({ ...p, form: { ...p.form, name: v } }))}
                  placeholder="e.g. Dr. Aditi Sharma"
                />
              </FieldGroup>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                <FieldGroup>
                  <FieldLabel>Email</FieldLabel>
                  <TextInput
                    type="email"
                    value={staffDrawer.form.email}
                    onChange={(v) => setStaffDrawer(p => ({ ...p, form: { ...p.form, email: v } }))}
                    placeholder="name@centre.in"
                  />
                </FieldGroup>
                <FieldGroup>
                  <FieldLabel>Mobile</FieldLabel>
                  <TextInput
                    value={staffDrawer.form.mobile}
                    onChange={(v) => setStaffDrawer(p => ({ ...p, form: { ...p.form, mobile: v } }))}
                    placeholder="+91 XXXXXXXXXX"
                  />
                </FieldGroup>
              </div>
              {/* Professional (collapsible? keep visible — short) */}
              <SectionLabel>Professional details <span style={{ color: '#94a3b8', fontWeight: 500, marginLeft: '6px', textTransform: 'none', letterSpacing: 0 }}>(optional)</span></SectionLabel>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                <FieldGroup>
                  <FieldLabel>Specialization</FieldLabel>
                  <TextInput
                    value={staffDrawer.form.specialization}
                    onChange={(v) => setStaffDrawer(p => ({ ...p, form: { ...p.form, specialization: v } }))}
                    placeholder="e.g. Radiology"
                  />
                </FieldGroup>
                <FieldGroup>
                  <FieldLabel>Degree</FieldLabel>
                  <TextInput
                    value={staffDrawer.form.degree}
                    onChange={(v) => setStaffDrawer(p => ({ ...p, form: { ...p.form, degree: v } }))}
                    placeholder="e.g. MD, MBBS"
                  />
                </FieldGroup>
              </div>
              <FieldGroup>
                <FieldLabel>License number</FieldLabel>
                <TextInput
                  value={staffDrawer.form.licenseNo}
                  onChange={(v) => setStaffDrawer(p => ({ ...p, form: { ...p.form, licenseNo: v } }))}
                  placeholder="Medical council registration"
                />
              </FieldGroup>

              {/* Employment */}
              <SectionLabel>Employment <span style={{ color: '#94a3b8', fontWeight: 500, marginLeft: '6px', textTransform: 'none', letterSpacing: 0 }}>(optional)</span></SectionLabel>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                <FieldGroup>
                  <FieldLabel>Department</FieldLabel>
                  <TextInput
                    value={staffDrawer.form.department}
                    onChange={(v) => setStaffDrawer(p => ({ ...p, form: { ...p.form, department: v } }))}
                    placeholder="e.g. Radiology, Admin"
                  />
                </FieldGroup>
                <FieldGroup>
                  <FieldLabel>Designation</FieldLabel>
                  <TextInput
                    value={staffDrawer.form.designation}
                    onChange={(v) => setStaffDrawer(p => ({ ...p, form: { ...p.form, designation: v } }))}
                    placeholder="e.g. Senior Radiologist"
                  />
                </FieldGroup>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                <FieldGroup>
                  <FieldLabel>Joining Date</FieldLabel>
                  <input
                    type="date"
                    value={staffDrawer.form.joiningDate || ''}
                    onChange={(e) => setStaffDrawer(p => ({ ...p, form: { ...p.form, joiningDate: e.target.value } }))}
                    style={{ width: '100%', padding: '10px 12px', borderRadius: '10px', border: '1px solid #e2e8f0', fontSize: '13px', outline: 'none', boxSizing: 'border-box', color: '#0a1628' }}
                  />
                </FieldGroup>
                <FieldGroup>
                  <FieldLabel>Employment Type</FieldLabel>
                  <select
                    value={staffDrawer.form.employmentType || 'Full-Time'}
                    onChange={(e) => setStaffDrawer(p => ({ ...p, form: { ...p.form, employmentType: e.target.value } }))}
                    style={{ width: '100%', padding: '10px 12px', borderRadius: '10px', border: '1px solid #e2e8f0', fontSize: '13px', outline: 'none', boxSizing: 'border-box', color: '#0a1628', background: 'white' }}
                  >
                    {['Full-Time', 'Part-Time', 'Consultant', 'Contract'].map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </FieldGroup>
              </div>

              {/* Board access note */}
              <div style={{ background: '#fff8e6', border: '1px solid #fde68a', borderRadius: '12px', padding: '12px 14px', display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                <span style={{ fontSize: '16px', lineHeight: 1 }}>ℹ️</span>
                <div style={{ fontSize: '11px', color: '#92400e', lineHeight: 1.5 }}>
                  <strong>No board access is granted here.</strong> This only creates an HR record. To give this staff member login access to the board, use the <strong>Access</strong> tab after adding them.
                </div>
              </div>
            </div>

            {/* Sticky footer */}
            <div style={{
              padding: '14px 28px', borderTop: '1px solid #e2e8f0',
              display: 'flex', gap: '10px', alignItems: 'center', background: 'white',
            }}>
              {staffDrawer.form.id && (
                <button
                  type="button"
                  onClick={() => handleDeleteStaff({ id: staffDrawer.form.id, name: staffDrawer.form.name })}
                  style={{
                    padding: '10px 14px', borderRadius: '10px',
                    border: '1px solid #fecaca', background: 'white',
                    color: '#dc2626', fontSize: '12px', fontWeight: 700, cursor: 'pointer',
                  }}
                >Remove</button>
              )}
              <div style={{ flex: 1 }} />
              <button
                type="button"
                onClick={() => setStaffDrawer(p => ({ ...p, open: false }))}
                style={{
                  padding: '10px 16px', borderRadius: '10px',
                  border: '1px solid #e2e8f0', background: 'white',
                  color: '#0a1628', fontSize: '12px', fontWeight: 700, cursor: 'pointer',
                }}
              >Cancel</button>
              <button
                type="submit"
                disabled={savingStaff}
                style={{
                  padding: '10px 22px', borderRadius: '10px', border: 'none',
                  background: savingStaff ? '#cbd5e1' : 'linear-gradient(135deg, #d4a017 0%, #b8860b 100%)',
                  color: savingStaff ? '#94a3b8' : '#0a1628',
                  fontSize: '12px', fontWeight: 800, cursor: savingStaff ? 'not-allowed' : 'pointer',
                  letterSpacing: '0.3px',
                  boxShadow: savingStaff ? 'none' : '0 6px 18px rgba(212, 160, 23, 0.35)',
                }}
              >
                {savingStaff ? 'Saving…' : (staffDrawer.form.id ? 'Save changes' : 'Add staff')}
              </button>
            </div>
          </form>

          <style>{`
            @keyframes staffFadeIn { from { opacity: 0; } to { opacity: 1; } }
            @keyframes staffSlideIn { from { transform: translateX(24px); opacity: 0; } to { transform: none; opacity: 1; } }
          `}</style>
        </div>
      )}

      {/* ── NOTIFICATION / CONFIRM MODAL ─────────────────────────────────── */}
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
              style={{ background: 'rgba(255,255,255,0.98)', borderRadius: '22px', padding: '32px', maxWidth: '420px', width: '90%', boxShadow: `0 24px 60px ${c}20`, border: `1px solid ${c}25`, textAlign: 'center', animation: 'staffNoticePop 0.4s cubic-bezier(0.34,1.56,0.64,1)' }}
              onClick={e => e.stopPropagation()}
            >
              <div style={{ width: '50px', height: '50px', borderRadius: '50%', background: `${c}12`, border: `2px solid ${c}25`, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', fontSize: '20px', color: c, fontWeight: 900 }}>{ICONS[notifModal.type]}</div>
              <div style={{ fontSize: '16px', fontWeight: 800, color: '#0a1628', marginBottom: '8px' }}>{notifModal.title}</div>
              <div style={{ fontSize: '13px', color: '#6b7280', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{notifModal.message}</div>

              {notifModal.isConfirm ? (
                <div style={{ display: 'flex', gap: '10px', marginTop: '22px' }}>
                  <button
                    onClick={() => setNotifModal(p => ({ ...p, isOpen: false }))}
                    style={{ flex: 1, padding: '11px 18px', borderRadius: '11px', background: 'white', border: '1px solid #e2e8f0', color: '#0a1628', fontWeight: 700, cursor: 'pointer', fontSize: '12px' }}
                  >Cancel</button>
                  <button
                    onClick={() => { const fn = notifModal.onConfirm; setNotifModal(p => ({ ...p, isOpen: false })); if (fn) fn(); }}
                    style={{
                      flex: 1, padding: '11px 18px', borderRadius: '11px',
                      background: notifModal.danger ? '#dc2626' : '#0a1628',
                      color: 'white', border: 'none', fontWeight: 800, cursor: 'pointer', fontSize: '12px',
                      letterSpacing: '0.3px',
                      boxShadow: notifModal.danger ? '0 6px 18px rgba(220,38,38,0.35)' : '0 6px 18px rgba(10,22,40,0.2)',
                    }}
                  >{notifModal.confirmText || 'Confirm'}</button>
                </div>
              ) : (
                <button onClick={() => setNotifModal(p => ({ ...p, isOpen: false }))} style={{ marginTop: '20px', padding: '10px 30px', borderRadius: '11px', background: c, color: 'white', border: 'none', fontWeight: 800, cursor: 'pointer', fontSize: '12px', letterSpacing: '0.5px' }}>OK</button>
              )}
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

