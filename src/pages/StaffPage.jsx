import React, { useState, useMemo, useEffect, useCallback } from 'react';
import apiClient from '../api/apiClient';
import useAuth from '../auth/useAuth';
import { ROLE_LABELS } from '../data/roles';
import { nativeStorage } from '../hooks/useElectron';
import StaffDashboardPage from './StaffDashboardPage';
import LeavePolicyEditor from '../components/LeavePolicyEditor';
import '../styles/global.css';
import '../styles/AdminBoard.css';

// â”€â”€â”€ Constants â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const TODAY      = new Date();
const TODAY_STR  = TODAY.toISOString().split('T')[0];
const THIS_MONTH = `${TODAY.getFullYear()}-${String(TODAY.getMonth()+1).padStart(2,'0')}`;
// Default leave policy — used when nothing has been configured at /configuration yet.
const DEFAULT_LEAVE_TYPES = [
  { id: 'sick',    name: 'Sick',    annualQuota: 6,  isPaid: true, color: '#dc2626' },
  { id: 'casual',  name: 'Casual',  annualQuota: 6,  isPaid: true, color: '#0891b2' },
  { id: 'earned',  name: 'Earned',  annualQuota: 12, isPaid: true, color: '#16a34a' },
];
const ATT_META = {
  present:  { color: '#16a34a', bg: '#f0fdf4', label: 'Present'  },
  absent:   { color: '#dc2626', bg: '#fef2f2', label: 'Absent'   },
  halfday:  { color: '#d97706', bg: '#fffbeb', label: 'Half Day' },
  late:     { color: '#0891b2', bg: '#f0faff', label: 'Late'     },
  leave:    { color: '#6366f1', bg: '#f0f0ff', label: 'On Leave' },
};

// Leave policy helpers (parsing payload from /configuration's Leave Policy editor)
const safeParseJson = (s) => { try { return JSON.parse(s); } catch { return null; } };
const normalizeLeaveTypes = (arr) => (arr || []).map(t => ({
  id:          t.id || (t.name || '').toLowerCase().replace(/[^a-z0-9]+/g, '_'),
  name:        t.name || '',
  annualQuota: Number(t.annualQuota) || 0,
  isPaid:      t.isPaid !== false,
  color:       t.color || '#64748b',
})).filter(t => t.name);

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
  const [leavePolicy,    setLeavePolicy]    = useState(DEFAULT_LEAVE_TYPES);
  // Derived: { typeName: annualQuota } map for fast lookups, and a flat name list.
  const LEAVE_TYPES = useMemo(() => leavePolicy.map(t => t.name), [leavePolicy]);
  const LEAVE_DEFAULTS = useMemo(
    () => Object.fromEntries(leavePolicy.map(t => [t.name, t.annualQuota])),
    [leavePolicy]
  );
  const [documentsData,  setDocumentsData]  = useState({}); // { staffId: [{ id, name, category, size, uploadedAt, blobUrl }] }
  const [docsLoadingMap, setDocsLoadingMap] = useState({}); // { staffId: bool }
  const [uploadCategory, setUploadCategory] = useState('Other');

  // â”€â”€ UI state â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const [mainTab,         setMainTab]         = useState('dashboard'); // dashboard | roster | leave
  const [selectedStaff,   setSelectedStaff]   = useState(null);
  const [detailTab,       setDetailTab]       = useState('profile');
  const [search,          setSearch]          = useState('');
  const [isMobile,        setIsMobile]        = useState(window.innerWidth < 1024);
  const [attendanceMonth, setAttendanceMonth] = useState(THIS_MONTH);

  // Salary edit drawer — captures one new revision per save
  const EMPTY_SAL = {
    basicPay:'', hra:'', travel:'', otherAllowances:'',
    pfDeduction:'', tds:'', otherDeductions:'',
    effectiveFrom: TODAY_STR, note: '',
  };
  const [salaryDrawer, setSalaryDrawer] = useState({ open: false, form: EMPTY_SAL, mode: 'create' });

  // Disbursement drawer
  const PAYMENT_MODES = [
    { id: 'bank',   label: 'Bank Transfer', icon: '🏦' },
    { id: 'cash',   label: 'Cash',          icon: '💵' },
    { id: 'upi',    label: 'UPI',           icon: '📱' },
    { id: 'cheque', label: 'Cheque',        icon: '📃' },
  ];
  const EMPTY_DISB = { mode: 'bank', reference: '', paidOnDate: TODAY_STR, notes: '' };
  const [disbDrawer, setDisbDrawer] = useState({ open: false, month: THIS_MONTH, form: EMPTY_DISB });

  // Attendance picker
  const [attPicker, setAttPicker] = useState({ open: false, date: TODAY_STR, status: 'present' });

  // Leave application form
  const [leaveForm, setLeaveForm] = useState({ open: false, type: 'Sick', from: '', to: '', reason: '' });

  // Notification + confirm modal (unified)
  const [notifModal, setNotifModal] = useState({ isOpen: false, type: 'info', title: '', message: '' });
  const showNotif = (type, title, message) => setNotifModal({ isOpen: true, type, title, message });

  const toTitleCase = (str) =>
    (str || '').trim().replace(/\w\S*/g, w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
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
        employeeCode:   p.employeeCode || '',
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
    const [sal, att, lv] = await Promise.all([
      nativeStorage.get('1rad_staff_salary'),
      nativeStorage.get('1rad_staff_attendance'),
      nativeStorage.get('1rad_staff_leave'),
    ]);
    setSalaryData(sal || {});
    setAttendanceData(att || {});
    setLeaveData(lv || []);
  }, []);

  // Load the centre's leave policy (from /configuration). Falls back to cache then defaults.
  const loadLeavePolicy = useCallback(async () => {
    const cacheKey = activeCenter?.id ? `1rad_leave_policy_${activeCenter.id}` : null;
    try {
      const res = await apiClient.get('/leave-policy');
      const parsed = safeParseJson(res.data?.leaveTypesJson);
      const list = Array.isArray(parsed) && parsed.length > 0 ? normalizeLeaveTypes(parsed) : DEFAULT_LEAVE_TYPES;
      setLeavePolicy(list);
      if (cacheKey) await nativeStorage.set(cacheKey, list);
    } catch {
      if (cacheKey) {
        const cached = await nativeStorage.get(cacheKey);
        if (Array.isArray(cached) && cached.length > 0) {
          setLeavePolicy(normalizeLeaveTypes(cached));
          return;
        }
      }
      setLeavePolicy(DEFAULT_LEAVE_TYPES);
    }
  }, [activeCenter?.id]);

  const mapDocs = (raw) => (raw || []).map(d => ({
    id: d.documentId, name: d.fileName, category: d.category,
    size: d.fileSizeBytes, uploadedAt: d.uploadedAt, blobUrl: d.blobUrl,
  }));

  // Map API → local salary shape.
  const mapApiSalary = (dto) => {
    if (!dto) return null;
    return {
      revisions: (dto.revisions || []).map(r => ({
        id: r.revisionId,
        effectiveFrom: r.effectiveFrom,
        basicPay: r.basicPay, hra: r.hra, travel: r.travel, otherAllowances: r.otherAllowances,
        pfDeduction: r.pfDeduction, tds: r.tds, otherDeductions: r.otherDeductions,
        note: r.note, createdAt: r.createdAt,
      })),
      disbursements: (dto.disbursements || []).map(d => ({
        id: d.disbursementId,
        revisionId: d.revisionId,
        month: d.month,
        grossPay: d.grossPay, netPay: d.netPay,
        structureGross: d.structureGross, structureNet: d.structureNet,
        lwpDays: d.lwpDays, lwpDeduction: d.lwpDeduction, perDayRate: d.perDayRate,
        paidLeaveInMonth: d.paidLeaveInMonth, lwpLeaveInMonth: d.lwpLeaveInMonth,
        attendanceBreakdown: d.attendanceJson ? safeJson(d.attendanceJson) : undefined,
        mode: d.paymentMode, reference: d.reference,
        paidOnDate: d.paidOnDate,
        paidOn: d.createdAt,
        notes: d.notes,
      })),
    };
  };
  const safeJson = (s) => { try { return JSON.parse(s); } catch { return undefined; } };

  // Load a staff's salary from the API; falls back silently if offline.
  const loadStaffSalary = useCallback(async (staffId) => {
    if (!staffId) return;
    try {
      const res = await apiClient.get(`/staff/${staffId}/salary`);
      const mapped = mapApiSalary(res.data);
      if (mapped) {
        setSalaryData(prev => {
          const next = { ...prev, [staffId]: mapped };
          nativeStorage.set('1rad_staff_salary', next).catch(() => {});
          return next;
        });
      }
    } catch (err) {
      // Network/404 — keep using local cache.
      if (err?.response?.status && err.response.status !== 404) {
        console.warn('[STAFF] Failed to load salary from API', err);
      }
    }
  }, []);

  const loadStaffDocs = useCallback(async (staffId) => {
    if (!staffId || docsLoadingMap[staffId]) return;
    setDocsLoadingMap(p => ({ ...p, [staffId]: true }));
    try {
      const res = await apiClient.get(`/staff/${staffId}/documents`);
      setDocumentsData(p => ({ ...p, [staffId]: mapDocs(res.data) }));
    } catch { /* silent */ }
    finally { setDocsLoadingMap(p => ({ ...p, [staffId]: false })); }
  }, [docsLoadingMap]);

  useEffect(() => {
    fetchPersonnel();
    loadLocalData();
    loadLeavePolicy();
  }, [fetchPersonnel, loadLocalData, loadLeavePolicy, activeCenter?.id]);

  useEffect(() => {
    if (detailTab === 'documents' && selectedStaff?.id)
      loadStaffDocs(selectedStaff.id);
  }, [detailTab, selectedStaff?.id]);  // eslint-disable-line

  // Fetch salary from API whenever a staff is selected (or on tab change to salary).
  useEffect(() => {
    if (selectedStaff?.id) loadStaffSalary(selectedStaff.id);
  }, [selectedStaff?.id, loadStaffSalary]);

  // ── Salary helpers (revision-aware) ─────────────────────────────────
  const SAL_FIELDS = ['basicPay','hra','travel','otherAllowances','pfDeduction','tds','otherDeductions'];

  // Legacy flat record → revisions[] form. Idempotent.
  const normalizeStaffSalary = (raw) => {
    if (!raw) return { revisions: [], disbursements: [] };
    if (Array.isArray(raw.revisions)) {
      return { revisions: raw.revisions, disbursements: raw.disbursements || [] };
    }
    const hasFlat = SAL_FIELDS.some(k => raw[k] !== undefined && raw[k] !== '' && raw[k] !== null);
    if (!hasFlat) return { revisions: [], disbursements: raw.disbursements || [] };
    const legacy = {
      id: `rev_legacy_${Date.now()}`,
      effectiveFrom: '2020-01-01',
      note: 'Initial (migrated)',
      createdAt: new Date().toISOString(),
    };
    SAL_FIELDS.forEach(k => { legacy[k] = raw[k] || ''; });
    return { revisions: [legacy], disbursements: raw.disbursements || [] };
  };

  // Pick the revision active at a given date (defaults to today). Returns null if none.
  const pickRevision = (record, asOfDate = TODAY_STR) => {
    const revs = (record?.revisions || []).filter(r => (r.effectiveFrom || '0000-00-00') <= asOfDate);
    if (revs.length === 0) return null;
    return revs.sort((a, b) => (b.effectiveFrom || '').localeCompare(a.effectiveFrom || ''))[0];
  };

  const computeFromRevision = (rev) => {
    if (!rev) return { gross: 0, deductions: 0, net: 0 };
    const gross      = ['basicPay','hra','travel','otherAllowances'].reduce((s,k) => s + (Number(rev[k])||0), 0);
    const deductions = ['pfDeduction','tds','otherDeductions'].reduce((s,k) => s + (Number(rev[k])||0), 0);
    return { gross, deductions, net: Math.max(0, gross - deductions) };
  };

  const getSalaryInfo = useCallback((staffId, asOfDate = TODAY_STR) => {
    const record = normalizeStaffSalary(salaryData[staffId]);
    const active = pickRevision(record, asOfDate);
    const computed = computeFromRevision(active);
    return {
      ...(active || {}),
      ...computed,
      hasStructure: !!active,
      activeRevision: active,
      revisions: record.revisions,
      disbursements: record.disbursements,
    };
  }, [salaryData]);

  // Save a new revision via API (with local fallback if offline).
  const saveSalaryStructure = async (staffId) => {
    const { effectiveFrom, note, ...amounts } = salaryDrawer.form;
    if (!effectiveFrom) {
      showNotif('warning', 'Effective date required', 'Please pick when this salary should apply from.');
      return;
    }
    const payload = {
      effectiveFrom,
      basicPay:        Number(amounts.basicPay) || 0,
      hra:             Number(amounts.hra) || 0,
      travel:          Number(amounts.travel) || 0,
      otherAllowances: Number(amounts.otherAllowances) || 0,
      pfDeduction:     Number(amounts.pfDeduction) || 0,
      tds:             Number(amounts.tds) || 0,
      otherDeductions: Number(amounts.otherDeductions) || 0,
      note:            (note || '').trim() || null,
    };
    try {
      await apiClient.post(`/staff/${staffId}/salary/revisions`, payload);
      await loadStaffSalary(staffId);
      const computed = computeFromRevision({ ...payload });
      showNotif('success', 'Salary saved', `Net pay ₹${computed.net.toLocaleString()} effective ${effectiveFrom}.`);
      setSalaryDrawer({ open: false, form: EMPTY_SAL, mode: 'create' });
    } catch (err) {
      console.error('[STAFF] Save salary failed', err);
      showNotif('error', 'Save failed', err.response?.data?.message || 'Could not save salary revision.');
    }
  };

  const deleteRevision = (staffId, revId) => {
    askConfirm({
      title: 'Delete this revision?',
      message: 'This revision will be removed. Existing disbursements that referenced it will still show their original pay.',
      confirmText: 'Delete',
      danger: true,
      onConfirm: async () => {
        try {
          await apiClient.delete(`/staff/${staffId}/salary/revisions/${revId}`);
          await loadStaffSalary(staffId);
          showNotif('success', 'Deleted', 'Revision removed.');
        } catch (err) {
          console.error('[STAFF] Delete revision failed', err);
          showNotif('error', 'Delete failed', err.response?.data?.message || 'Could not delete revision.');
        }
      },
    });
  };

  // ── Monthly payroll calculator (attendance-aware) ──────────────────
  // Policy: Per-day = Gross / Calendar Days. Half-day = 0.5 LWP.
  // Approved leave: paid up to annual balance (chronologically), then LWP.
  const computeMonthlyPayroll = useCallback((staffId, month) => {
    const [yr, mn] = month.split('-').map(Number);
    const daysInMonth = new Date(yr, mn, 0).getDate();
    const lastDay = `${month}-${String(daysInMonth).padStart(2, '0')}`;

    const record = normalizeStaffSalary(salaryData[staffId]);
    const active = pickRevision(record, lastDay);
    const { gross, deductions, net } = computeFromRevision(active);

    // Attendance counts for this month
    const attRec = attendanceData[staffId] || {};
    const counts = { present: 0, absent: 0, halfday: 0, late: 0, leave: 0 };
    Object.entries(attRec).forEach(([d, s]) => {
      if (d.startsWith(month) && counts[s] !== undefined) counts[s]++;
    });

    // Approved leaves in the year (chronological) — allocate quota to find LWP days in target month.
    const yearLeaves = leaveData
      .filter(l => l.staffId === staffId && l.status === 'approved' && l.from?.startsWith(String(yr)))
      .sort((a, b) => (a.from || '').localeCompare(b.from || ''));

    const remaining = { ...LEAVE_DEFAULTS };
    let paidLeaveInMonth = 0;
    let lwpLeaveInMonth = 0;

    for (const lv of yearLeaves) {
      const start = new Date(lv.from);
      const end = new Date(lv.to);
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const ds = d.toISOString().slice(0, 10);
        const inMonth = ds.startsWith(month);
        if ((remaining[lv.type] || 0) > 0) {
          remaining[lv.type] -= 1;
          if (inMonth) paidLeaveInMonth += 1;
        } else if (inMonth) {
          lwpLeaveInMonth += 1;
        }
      }
    }

    const lwpDays = counts.absent + 0.5 * counts.halfday + lwpLeaveInMonth;
    const perDay = daysInMonth > 0 ? gross / daysInMonth : 0;
    const lwpDeduction = Math.round(perDay * lwpDays);
    const proRatedGross = Math.max(0, gross - lwpDeduction);
    const proRatedNet = Math.max(0, net - lwpDeduction);

    return {
      hasStructure: !!active,
      activeRevision: active,
      daysInMonth,
      counts,
      paidLeaveInMonth,
      lwpLeaveInMonth,
      lwpDays,
      perDayRate: Math.round(perDay),
      lwpDeduction,
      gross, deductions, net,
      proRatedGross, proRatedNet,
    };
  }, [salaryData, attendanceData, leaveData]);

  const disburseSalary = async (staffId, month, paymentDetails = {}) => {
    const existing = normalizeStaffSalary(salaryData[staffId]);
    if (existing.disbursements.find(d => d.month === month)) {
      showNotif('warning', 'Already disbursed', `Salary for ${month} is already marked as paid.`);
      return;
    }
    const payroll = computeMonthlyPayroll(staffId, month);
    if (!payroll.hasStructure) {
      showNotif('warning', 'No structure', 'Set up a salary structure before disbursing.');
      return;
    }
    const payload = {
      revisionId:       payroll.activeRevision.id,
      month,
      grossPay:         payroll.proRatedGross,
      netPay:           payroll.proRatedNet,
      structureGross:   payroll.gross,
      structureNet:     payroll.net,
      lwpDays:          payroll.lwpDays,
      lwpDeduction:     payroll.lwpDeduction,
      perDayRate:       payroll.perDayRate,
      paidLeaveInMonth: payroll.paidLeaveInMonth,
      lwpLeaveInMonth:  payroll.lwpLeaveInMonth,
      attendanceJson:   JSON.stringify(payroll.counts),
      paymentMode:      paymentDetails.mode || 'bank',
      reference:        paymentDetails.reference || null,
      paidOnDate:       paymentDetails.paidOnDate || TODAY_STR,
      notes:            paymentDetails.notes || null,
    };
    try {
      await apiClient.post(`/staff/${staffId}/salary/disbursements`, payload);
      await loadStaffSalary(staffId);
      showNotif('success', 'Salary disbursed', `₹${payroll.proRatedNet.toLocaleString()} marked as paid for ${month}.`);
    } catch (err) {
      console.error('[STAFF] Disburse failed', err);
      showNotif('error', 'Disbursement failed', err.response?.data?.message || 'Could not record disbursement.');
    }
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
      id: staff.id, employeeCode: staff.employeeCode || '',
      name: staff.name || '', email: staff.email || '', mobile: staff.mobile || '',
      specialization: staff.specialization || '', degree: staff.degree || '', licenseNo: staff.licenseNo || '',
      department: staff.department || '', designation: staff.designation || '',
      joiningDate: staff.joiningDate || '', employmentType: staff.employmentType || 'Full-Time',
    }
  });

  const handleSaveStaff = async (e) => {
    e?.preventDefault?.();
    const form = staffDrawer.form;
    if (!form.name?.trim()) return showNotif('warning', 'Name Required', 'Please enter the staff member’s full name.');

    const payload = {
      fullName: toTitleCase(form.name),
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
        showNotif('success', 'Record Updated', `${toTitleCase(form.name)}'s details have been saved.`);
      } else {
        await apiClient.post('/staff', payload);
        showNotif('success', 'Staff Added', `HR record created for ${toTitleCase(form.name)}.`);
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
          showNotif('success', 'Staff Removed', `${toTitleCase(staff.name)}'s record has been deactivated.`);
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
    return personnel.filter(u =>
      u.name.toLowerCase().includes(q) || (u.email || '').toLowerCase().includes(q)
    );
  }, [personnel, search]);

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

    // Fields grouped into 3 logical sections.
    const sections = [
      {
        title: 'Personal',
        sub: 'Contact details for the person',
        sectionColor: '#0f52ba',
        fields: [
          { label: 'Email',     value: staff.email,  accent: '#0f52ba', icon: '✉' },
          { label: 'Mobile',    value: staff.mobile, accent: '#0d9488', icon: '📱' },
        ],
      },
      {
        title: 'Professional',
        sub: 'Qualifications and clinical role',
        sectionColor: '#7c3aed',
        fields: [
          { label: 'Role',           value: ROLE_LABELS?.[staff.roles?.[0]] || meta.label, accent: meta.color,  icon: '🎓' },
          { label: 'Specialization', value: staff.specialization,                          accent: '#e84393',   icon: '🩺' },
          { label: 'Degree',         value: staff.degree,                                  accent: '#d97706',   icon: '🎓' },
          { label: 'License No.',    value: staff.licenseNo,                               accent: '#dc2626',   icon: '📋', mono: true },
        ],
      },
      {
        title: 'Employment',
        sub: 'Their job at this centre',
        sectionColor: '#16a34a',
        fields: [
          { label: 'Employee ID',  value: staff.employeeCode,
            accent: '#d4a017', icon: '🪪', mono: true },
          { label: 'Joining date', value: staff.createdAt
              ? new Date(staff.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
              : null,
            accent: '#6366f1', icon: '📅' },
          { label: 'Status',       value: (staff.status || 'Active'),
            accent: (staff.status || 'active').toLowerCase() === 'inactive' ? '#dc2626' : '#16a34a', icon: '●' },
          { label: 'Department',   value: staff.department,                              accent: '#7c3aed', icon: '🏢' },
          { label: 'Designation',  value: staff.designation,                             accent: '#0891b2', icon: '💼' },
          { label: 'Employment',   value: staff.employmentType,                          accent: '#16a34a', icon: '🕒' },
        ],
      },
    ];

    const allFields = sections.flatMap(s => s.fields);
    const missingCount = allFields.filter(f => !f.value || String(f.value).trim() === '').length;
    const pct = Math.round(((allFields.length - missingCount) / allFields.length) * 100);

    // One row inside a section card.
    const renderFieldRow = ({ label, value, accent, icon, mono }, isLast) => {
      const hasValue = value && String(value).trim() !== '';
      return (
        <div
          key={label}
          onClick={hasValue ? undefined : () => openEditStaff(staff)}
          style={{
            display: 'flex', alignItems: 'center', gap: '14px',
            padding: '12px 16px',
            borderBottom: isLast ? 'none' : '1px solid #f1f5f9',
            cursor: hasValue ? 'default' : 'pointer',
            transition: 'background 0.12s',
          }}
          onMouseEnter={(e) => { if (!hasValue) e.currentTarget.style.background = `${accent}08`; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
        >
          <div style={{
            width: '32px', height: '32px', borderRadius: '9px',
            background: hasValue ? `${accent}15` : '#f8fafc',
            color: accent, opacity: hasValue ? 1 : 0.45,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '14px', flexShrink: 0,
            border: `1px solid ${accent}${hasValue ? '25' : '15'}`,
          }}>{icon}</div>
          <div style={{ fontSize: '10px', fontWeight: 800, color: '#94a3b8', letterSpacing: '0.8px', textTransform: 'uppercase', width: '110px', flexShrink: 0 }}>{label}</div>
          {hasValue ? (
            <div style={{
              flex: 1, fontSize: '13px', fontWeight: 700, color: '#0a1628',
              letterSpacing: mono ? '0.3px' : '-0.1px',
              fontFamily: mono ? 'ui-monospace, "SF Mono", Menlo, monospace' : 'inherit',
              wordBreak: 'break-word',
            }}>{value}</div>
          ) : (
            <div style={{ flex: 1, fontSize: '12px', fontWeight: 600, color: '#cbd5e1', fontStyle: 'italic', display: 'flex', alignItems: 'center', gap: '4px' }}>
              Not set
              <span style={{ fontSize: '10px', color: accent, fontWeight: 700, fontStyle: 'normal', marginLeft: '2px' }}>· Add →</span>
            </div>
          )}
        </div>
      );
    };

    return (
      <div style={{ padding: '24px 28px 28px' }}>
        {/* 3 section cards side-by-side on wide screens, stacked when narrow */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '14px' }}>
          {sections.map((sec) => {
            const secMissing = sec.fields.filter(f => !f.value || String(f.value).trim() === '').length;
            return (
              <div key={sec.title} style={{
                background: 'white',
                border: '1px solid #e8edf2',
                borderRadius: '14px',
                overflow: 'hidden',
                position: 'relative',
                boxShadow: '0 1px 3px rgba(15, 23, 42, 0.03)',
              }}>
                {/* Section accent strip */}
                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '3px', background: sec.sectionColor }} />

                {/* Section header */}
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '16px 18px 12px',
                  borderBottom: '1px solid #f1f5f9',
                  gap: '12px',
                }}>
                  <div>
                    <div style={{ fontSize: '14px', fontWeight: 800, color: '#0a1628', letterSpacing: '-0.2px' }}>{sec.title}</div>
                    <div style={{ fontSize: '10px', color: '#94a3b8', fontWeight: 500, marginTop: '2px' }}>{sec.sub}</div>
                  </div>
                  <div style={{ fontSize: '10px', fontWeight: 700, color: secMissing > 0 ? '#92400e' : '#15803d', background: secMissing > 0 ? '#fff8e6' : '#f0fdf4', border: `1px solid ${secMissing > 0 ? '#fde68a' : '#bbf7d0'}`, padding: '3px 9px', borderRadius: '999px', whiteSpace: 'nowrap', flexShrink: 0 }}>
                    {sec.fields.length - secMissing} / {sec.fields.length}
                  </div>
                </div>

                {/* Section field rows */}
                <div>
                  {sec.fields.map((f, idx) => renderFieldRow(f, idx === sec.fields.length - 1))}
                </div>
              </div>
            );
          })}
        </div>

        {/* Completion banner */}
        {missingCount > 0 && (
          <div style={{
            marginTop: '20px',
            padding: '14px 16px',
            background: 'linear-gradient(135deg, #fff8e6 0%, #fefce8 100%)',
            border: '1px solid #fde68a',
            borderRadius: '12px',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            gap: '12px', flexWrap: 'wrap',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{ position: 'relative', width: '44px', height: '44px', flexShrink: 0 }}>
                <svg width="44" height="44" viewBox="0 0 44 44">
                  <circle cx="22" cy="22" r="18" fill="none" stroke="#fde68a" strokeWidth="4" />
                  <circle cx="22" cy="22" r="18" fill="none" stroke="#d4a017" strokeWidth="4" strokeLinecap="round"
                    strokeDasharray={`${(pct / 100) * 113.1} 113.1`}
                    transform="rotate(-90 22 22)" />
                </svg>
                <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 900, color: '#0a1628' }}>{pct}%</div>
              </div>
              <div>
                <div style={{ fontSize: '13px', fontWeight: 800, color: '#0a1628' }}>Profile {pct}% complete</div>
                <div style={{ fontSize: '11px', color: '#92400e', marginTop: '2px' }}>
                  {missingCount} {missingCount === 1 ? 'field needs' : 'fields need'} attention.
                </div>
              </div>
            </div>
            <button
              onClick={() => openEditStaff(staff)}
              style={{ padding: '9px 18px', borderRadius: '9px', background: 'linear-gradient(135deg, #d4a017 0%, #b8860b 100%)', color: '#0a1628', border: 'none', fontSize: '11px', fontWeight: 800, cursor: 'pointer', letterSpacing: '0.3px', boxShadow: '0 4px 12px rgba(212,160,23,0.3)', flexShrink: 0 }}
            >Complete profile</button>
          </div>
        )}
      </div>
    );
  };

  // ── Disbursement drawer + payslip ───────────────────────────────
  const openDisbursalDrawer = (staff, month = THIS_MONTH) => {
    setDisbDrawer({ open: true, month, form: { ...EMPTY_DISB, paidOnDate: TODAY_STR } });
  };

  const printPayslip = (staff, disbursal) => {
    const monthLabel = (() => {
      const [yr, mn] = disbursal.month.split('-').map(Number);
      return `${MONTHS[mn - 1]} ${yr}`;
    })();
    const rev = (normalizeStaffSalary(salaryData[staff.id]).revisions || []).find(r => r.id === disbursal.revisionId);
    const earnings = [
      ['Basic Pay', Number(rev?.basicPay) || 0],
      ['HRA',       Number(rev?.hra) || 0],
      ['Travel',    Number(rev?.travel) || 0],
      ['Other',     Number(rev?.otherAllowances) || 0],
    ].filter(([, v]) => v > 0);
    const deductions = [
      ['PF',  Number(rev?.pfDeduction) || 0],
      ['TDS', Number(rev?.tds) || 0],
      ['Other Deductions', Number(rev?.otherDeductions) || 0],
    ].filter(([, v]) => v > 0);
    if ((disbursal.lwpDeduction || 0) > 0) {
      deductions.push([`LWP (${disbursal.lwpDays}d × ₹${(disbursal.perDayRate || 0).toLocaleString()})`, disbursal.lwpDeduction]);
    }

    const modeMeta = PAYMENT_MODES.find(m => m.id === disbursal.mode) || { label: '—' };
    const paidOn = disbursal.paidOnDate || disbursal.paidOn?.slice(0, 10) || TODAY_STR;
    const centreName = activeCenter?.name || activeCenter?.hospitalName || '1Rad Diagnostics';
    const issuedBy = currentUser?.fullName || currentUser?.email || 'Authorised Signatory';

    const rowsHtml = (rows) => rows.map(([k, v]) =>
      `<tr><td>${k}</td><td style="text-align:right;font-weight:600">₹${Number(v).toLocaleString('en-IN')}</td></tr>`
    ).join('');

    const totalEarn = earnings.reduce((s, [, v]) => s + v, 0);
    const totalDed  = deductions.reduce((s, [, v]) => s + v, 0);

    const html = `<!doctype html>
<html><head><meta charset="utf-8" /><title>Payslip · ${staff.name} · ${monthLabel}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: 'Inter', -apple-system, 'Segoe UI', Roboto, sans-serif; margin: 0; background: #f1f5f9; color: #0a1628; padding: 24px; }
  .sheet { background: white; max-width: 760px; margin: 0 auto; border-radius: 14px; box-shadow: 0 6px 24px rgba(0,0,0,0.08); overflow: hidden; }
  .hero { background: linear-gradient(135deg, #0a1628 0%, #1e3a5f 100%); color: white; padding: 24px 32px; position: relative; overflow: hidden; }
  .hero::after { content:''; position: absolute; top:0; left:0; right:0; height:3px; background: linear-gradient(90deg, transparent, #d4a017 30%, #f5d76e 50%, #d4a017 70%, transparent); }
  .hero .centre { font-size: 11px; font-weight: 700; color: #d4a017; letter-spacing: 1.5px; text-transform: uppercase; }
  .hero h1 { margin: 6px 0 4px; font-size: 24px; font-weight: 800; letter-spacing: -0.3px; }
  .hero .month { font-size: 13px; color: rgba(255,255,255,0.65); font-weight: 500; }
  .meta { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; padding: 18px 32px; border-bottom: 1px solid #e8edf2; background: #fafbfc; }
  .meta .cell { font-size: 12px; }
  .meta .lbl { color: #94a3b8; font-weight: 700; font-size: 9px; letter-spacing: 1px; text-transform: uppercase; margin-bottom: 3px; }
  .meta .val { color: #0a1628; font-weight: 700; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; padding: 22px 32px; }
  .col h3 { font-size: 11px; font-weight: 900; letter-spacing: 1.2px; text-transform: uppercase; margin: 0 0 10px; }
  .col.earn h3 { color: #16a34a; }
  .col.ded h3 { color: #dc2626; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  table td { padding: 8px 0; border-bottom: 1px dashed #e8edf2; }
  table tr:last-child td { border-bottom: none; }
  .subtotal { display: flex; justify-content: space-between; padding-top: 10px; margin-top: 6px; border-top: 2px solid; font-weight: 800; font-size: 13px; }
  .col.earn .subtotal { color: #15803d; border-color: #bbf7d0; }
  .col.ded .subtotal { color: #b91c1c; border-color: #fecaca; }
  .net { margin: 0 32px 22px; background: linear-gradient(135deg, #0a1628 0%, #1e3a5f 100%); color: white; border-radius: 12px; padding: 18px 24px; display: flex; justify-content: space-between; align-items: center; position: relative; overflow: hidden; }
  .net::after { content:''; position: absolute; top:0; left:0; right:0; height:2px; background: linear-gradient(90deg, transparent, #d4a017 40%, transparent); }
  .net .lbl { font-size: 10px; font-weight: 800; color: #d4a017; letter-spacing: 1.5px; text-transform: uppercase; }
  .net .amt { font-size: 30px; font-weight: 900; letter-spacing: -0.5px; margin-top: 4px; }
  .footer { padding: 18px 32px 28px; border-top: 1px solid #e8edf2; display: flex; justify-content: space-between; align-items: flex-end; font-size: 11px; color: #64748b; }
  .footer .sig { text-align: right; }
  .footer .sig .line { width: 180px; border-bottom: 1px solid #cbd5e1; margin-bottom: 6px; }
  .actions { max-width: 760px; margin: 18px auto 0; display: flex; gap: 10px; justify-content: flex-end; }
  .actions button { padding: 10px 20px; border-radius: 10px; border: none; font-weight: 800; font-size: 12px; cursor: pointer; letter-spacing: 0.3px; }
  .actions .primary { background: linear-gradient(135deg, #d4a017, #b8860b); color: #0a1628; }
  .actions .secondary { background: white; color: #0a1628; border: 1px solid #e2e8f0; }
  @media print {
    body { background: white; padding: 0; }
    .sheet { box-shadow: none; border-radius: 0; }
    .actions { display: none; }
  }
</style></head>
<body>
  <div class="sheet">
    <div class="hero">
      <div class="centre">${centreName}</div>
      <h1>Salary Slip</h1>
      <div class="month">For the month of ${monthLabel}</div>
    </div>
    <div class="meta">
      <div class="cell"><div class="lbl">Employee</div><div class="val">${staff.name || '—'}</div></div>
      <div class="cell"><div class="lbl">Designation</div><div class="val">${staff.designation || (ROLE_LABELS[staff.roles?.[0]] || '—')}</div></div>
      <div class="cell"><div class="lbl">Employee ID</div><div class="val">${staff.employeeCode || staff.id || '—'}</div></div>
      <div class="cell"><div class="lbl">Paid On</div><div class="val">${paidOn}</div></div>
      <div class="cell"><div class="lbl">Payment Mode</div><div class="val">${modeMeta.label}${disbursal.reference ? ` · ${disbursal.reference}` : ''}</div></div>
      <div class="cell"><div class="lbl">Days in Month</div><div class="val">${(disbursal.attendanceBreakdown ? Object.values(disbursal.attendanceBreakdown).reduce((a,b)=>a+b,0) : '—')} marked${disbursal.lwpDays ? ` · ${disbursal.lwpDays} LWP` : ''}</div></div>
    </div>
    <div class="grid">
      <div class="col earn">
        <h3>Earnings</h3>
        <table>${rowsHtml(earnings)}</table>
        <div class="subtotal"><span>Gross</span><span>₹${totalEarn.toLocaleString('en-IN')}</span></div>
      </div>
      <div class="col ded">
        <h3>Deductions</h3>
        <table>${rowsHtml(deductions)}</table>
        <div class="subtotal"><span>Total</span><span>₹${totalDed.toLocaleString('en-IN')}</span></div>
      </div>
    </div>
    <div class="net">
      <div>
        <div class="lbl">Net Pay</div>
        <div class="amt">₹${(disbursal.netPay || 0).toLocaleString('en-IN')}</div>
      </div>
      <div style="text-align:right;font-size:11px;color:rgba(255,255,255,0.6);">
        ${totalEarn.toLocaleString('en-IN')} − ${totalDed.toLocaleString('en-IN')}
      </div>
    </div>
    <div class="footer">
      <div>
        ${disbursal.notes ? `<div style="margin-bottom:4px"><strong>Note:</strong> ${disbursal.notes}</div>` : ''}
        <div>This is a computer-generated payslip and does not require a signature.</div>
      </div>
      <div class="sig">
        <div class="line"></div>
        <div style="font-weight:700;color:#0a1628">${issuedBy}</div>
        <div>Authorised Signatory</div>
      </div>
    </div>
  </div>
  <div class="actions">
    <button class="secondary" onclick="window.close()">Close</button>
    <button class="primary" onclick="window.print()">🖨 Print / Save as PDF</button>
  </div>
  <script>
    window.addEventListener('load', function(){ setTimeout(window.print, 250); });
  </script>
</body></html>`;

    const printWindow = window.open('', '_blank', 'width=900,height=900');
    if (!printWindow) {
      showNotif('warning', 'Pop-up blocked', 'Please allow pop-ups to view the payslip.');
      return;
    }
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.focus();
  };

  const submitDisbursement = async (printAfter) => {
    if (!selectedStaff) return;
    const { mode, reference, paidOnDate, notes } = disbDrawer.form;
    if ((mode === 'bank' || mode === 'cheque' || mode === 'upi') && !reference.trim()) {
      showNotif('warning', 'Reference required', `Please enter a ${mode === 'cheque' ? 'cheque' : (mode === 'upi' ? 'UPI transaction' : 'bank reference')} number.`);
      return;
    }
    await disburseSalary(selectedStaff.id, disbDrawer.month, {
      mode, reference: reference.trim(), paidOnDate, notes: notes.trim(),
      paidOn: new Date(paidOnDate + 'T00:00:00').toISOString(),
    });
    // Compose the disbursal we just inserted for the payslip
    if (printAfter) {
      const fresh = normalizeStaffSalary(salaryData[selectedStaff.id]).disbursements
        .concat([]) // safety; the state may not have flushed in this tick
        .find(d => d.month === disbDrawer.month);
      const payroll = computeMonthlyPayroll(selectedStaff.id, disbDrawer.month);
      const synth = fresh || {
        month: disbDrawer.month,
        netPay: payroll.proRatedNet,
        grossPay: payroll.proRatedGross,
        lwpDays: payroll.lwpDays,
        lwpDeduction: payroll.lwpDeduction,
        perDayRate: payroll.perDayRate,
        attendanceBreakdown: payroll.counts,
        revisionId: payroll.activeRevision?.id,
        mode, reference: reference.trim(), paidOnDate, notes: notes.trim(),
        paidOn: new Date().toISOString(),
      };
      printPayslip(selectedStaff, synth);
    }
    setDisbDrawer({ open: false, month: THIS_MONTH, form: EMPTY_DISB });
  };

  const openSalaryDrawer = (staff, mode = 'create', preset = null) => {
    const info = getSalaryInfo(staff.id);
    const seed = preset || info.activeRevision || {};
    setSalaryDrawer({
      open: true,
      mode,
      form: {
        basicPay:        seed.basicPay || '',
        hra:             seed.hra || '',
        travel:          seed.travel || '',
        otherAllowances: seed.otherAllowances || '',
        pfDeduction:     seed.pfDeduction || '',
        tds:             seed.tds || '',
        otherDeductions: seed.otherDeductions || '',
        effectiveFrom:   mode === 'create' ? TODAY_STR : (seed.effectiveFrom || TODAY_STR),
        note:            mode === 'create' ? '' : (seed.note || ''),
      },
    });
  };

  const renderSalaryTab = (staff) => {
    const info          = getSalaryInfo(staff.id);
    const paidThisMonth = info.disbursements.find(x => x.month === THIS_MONTH);
    const earningRows   = [['Basic Pay', 'basicPay'], ['HRA', 'hra'], ['Travel', 'travel'], ['Other Allow.', 'otherAllowances']];
    const deductRows    = [['PF', 'pfDeduction'], ['TDS', 'tds'], ['Others', 'otherDeductions']];
    const active        = info.activeRevision;

    // ── Empty state: no salary structure yet ───────────────────────────
    if (!info.hasStructure) {
      return (
        <div style={{ padding: '40px 24px 24px' }}>
          <div style={{
            background: 'linear-gradient(135deg, #fff8e6 0%, #fefce8 100%)',
            border: '1.5px dashed #d4a017',
            borderRadius: '18px',
            padding: '40px 28px',
            textAlign: 'center',
            position: 'relative',
            overflow: 'hidden',
          }}>
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '3px', background: 'linear-gradient(90deg, transparent, #d4a017 40%, transparent)' }} />
            <div style={{
              width: '64px', height: '64px', borderRadius: '50%',
              background: 'linear-gradient(135deg, #d4a017 0%, #b8860b 100%)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 18px', boxShadow: '0 8px 20px rgba(212,160,23,0.35)',
            }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2"><path d="M6 3h12M6 8h12M6 21l7-13M13 8c3 0 5 1.5 5 4s-2 4-5 4"/></svg>
            </div>
            <div style={{ fontSize: '17px', fontWeight: 800, color: '#0a1628', marginBottom: '6px' }}>No salary structure yet</div>
            <div style={{ fontSize: '12px', color: '#64748b', maxWidth: '320px', margin: '0 auto 22px', lineHeight: 1.55 }}>
              Set up {staff.name.split(' ')[0]}'s monthly salary structure. You can add revisions later for appraisals — the history is preserved.
            </div>
            <button
              onClick={() => openSalaryDrawer(staff, 'create')}
              style={{
                padding: '12px 28px', borderRadius: '12px',
                background: 'linear-gradient(135deg, #d4a017 0%, #b8860b 100%)',
                color: '#0a1628', border: 'none',
                fontSize: '13px', fontWeight: 800, cursor: 'pointer',
                letterSpacing: '0.3px',
                boxShadow: '0 8px 22px rgba(212,160,23,0.4)',
              }}
            >+ Set up salary</button>
          </div>
        </div>
      );
    }

    return (
      <div style={{ padding: '20px 24px 24px' }}>
        {/* ── Header bar: active revision + visible Edit button ───────── */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '9px', fontWeight: 800, color: '#d4a017', background: '#fff8e6', border: '1px solid #fde68a', padding: '4px 10px', borderRadius: '6px', letterSpacing: '0.8px' }}>
              ACTIVE FROM {active.effectiveFrom}
            </span>
            {info.revisions.length > 1 && (
              <span style={{ fontSize: '10px', fontWeight: 700, color: '#64748b' }}>
                · {info.revisions.length} revisions on file
              </span>
            )}
          </div>
          <button
            onClick={() => openSalaryDrawer(staff, 'create')}
            style={{
              display: 'flex', alignItems: 'center', gap: '5px',
              padding: '7px 14px', borderRadius: '9px',
              background: 'linear-gradient(135deg, #d4a017 0%, #b8860b 100%)',
              color: '#0a1628', border: 'none',
              fontSize: '11px', fontWeight: 800, cursor: 'pointer',
              letterSpacing: '0.3px',
              boxShadow: '0 4px 12px rgba(212,160,23,0.3)',
            }}
          >+ New revision</button>
        </div>

        {/* Earnings / Deductions side-by-side */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
          {/* Earnings */}
          <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '14px', padding: '16px' }}>
            <div style={{ fontSize: '9px', fontWeight: 900, color: '#16a34a', letterSpacing: '1px', marginBottom: '12px' }}>EARNINGS</div>
            {earningRows.map(([label, key]) => (
              <div key={key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '7px' }}>
                <span style={{ fontSize: '10px', color: '#64748b', fontWeight: 600 }}>{label}</span>
                <span style={{ fontSize: '11px', fontWeight: 800, color: active[key] ? '#15803d' : '#cbd5e1' }}>
                  {active[key] ? `₹${Number(active[key]).toLocaleString()}` : '—'}
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
            <div style={{ fontSize: '9px', fontWeight: 900, color: '#dc2626', letterSpacing: '1px', marginBottom: '12px' }}>DEDUCTIONS</div>
            {deductRows.map(([label, key]) => (
              <div key={key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '7px' }}>
                <span style={{ fontSize: '10px', color: '#64748b', fontWeight: 600 }}>{label}</span>
                <span style={{ fontSize: '11px', fontWeight: 800, color: active[key] ? '#dc2626' : '#cbd5e1' }}>
                  {active[key] ? `₹${Number(active[key]).toLocaleString()}` : '—'}
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
            <div style={{ fontSize: '9px', color: 'rgba(255,255,255,0.45)', marginBottom: '3px' }}>Gross − Deductions</div>
            <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.65)', fontWeight: 600 }}>
              ₹{info.gross.toLocaleString()} − ₹{info.deductions.toLocaleString()}
            </div>
          </div>
        </div>

        {/* This month disbursal with attendance breakdown */}
        {(() => {
          const monthlyPayroll = computeMonthlyPayroll(staff.id, THIS_MONTH);
          const hasLwp = monthlyPayroll.lwpDays > 0;
          return (
            <div style={{ borderRadius: '12px', border: `1px solid ${paidThisMonth ? '#bbf7d0' : (hasLwp ? '#fed7aa' : '#fde68a')}`, background: paidThisMonth ? '#f0fdf4' : (hasLwp ? '#fff7ed' : '#fffbeb'), marginBottom: '22px', overflow: 'hidden' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px' }}>
                <div>
                  <div style={{ fontSize: '10px', fontWeight: 600, color: '#64748b' }}>{MONTHS[TODAY.getMonth()]} {TODAY.getFullYear()} · {monthlyPayroll.daysInMonth} days</div>
                  <div style={{ fontSize: '13px', fontWeight: 800, color: '#0f172a', marginTop: '2px' }}>
                    {paidThisMonth
                      ? <span style={{ color: '#16a34a' }}>✓ Disbursed · ₹{(paidThisMonth.netPay || 0).toLocaleString()}</span>
                      : <span style={{ color: hasLwp ? '#9a3412' : '#92400e' }}>
                          Pending · ₹{monthlyPayroll.proRatedNet.toLocaleString()}
                          {hasLwp && <span style={{ fontSize: '10px', fontWeight: 600, color: '#9a3412', marginLeft: '6px' }}>(after LWP)</span>}
                        </span>}
                  </div>
                </div>
                {!paidThisMonth
                  ? <button onClick={() => openDisbursalDrawer(staff, THIS_MONTH)} style={{ padding: '8px 18px', borderRadius: '9px', background: '#16a34a', color: 'white', border: 'none', fontWeight: 800, fontSize: '11px', cursor: 'pointer', letterSpacing: '0.5px' }}>MARK PAID</button>
                  : <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '10px', color: '#16a34a', fontWeight: 700 }}>
                        Paid {new Date(paidThisMonth.paidOn).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                      </span>
                      <button onClick={() => printPayslip(staff, paidThisMonth)} title="Print payslip" style={{ padding: '5px 10px', borderRadius: '7px', background: 'white', border: '1px solid #bbf7d0', color: '#15803d', cursor: 'pointer', fontSize: '10px', fontWeight: 700 }}>🖨 Slip</button>
                    </div>
                }
              </div>

              {/* Attendance / LWP breakdown */}
              {!paidThisMonth && (
                <div style={{ borderTop: `1px dashed ${hasLwp ? '#fed7aa' : '#fde68a'}`, padding: '10px 18px 12px', background: 'rgba(255,255,255,0.5)' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '6px', marginBottom: hasLwp ? '10px' : 0 }}>
                    {[
                      ['P',  monthlyPayroll.counts.present,                                      '#16a34a', 'Present'],
                      ['L',  monthlyPayroll.counts.late,                                          '#0891b2', 'Late'],
                      ['½',  monthlyPayroll.counts.halfday,                                      '#d97706', 'Half-day'],
                      ['A',  monthlyPayroll.counts.absent,                                       '#dc2626', 'Absent'],
                      ['Lv', monthlyPayroll.paidLeaveInMonth + monthlyPayroll.lwpLeaveInMonth,  '#6366f1', 'Leave'],
                    ].map(([letter, count, color, label]) => (
                      <div key={label} title={label} style={{ textAlign: 'center', padding: '5px 0', borderRadius: '6px', background: 'white', border: `1px solid ${color}25` }}>
                        <div style={{ fontSize: '14px', fontWeight: 900, color, lineHeight: 1 }}>{count}</div>
                        <div style={{ fontSize: '8px', fontWeight: 700, color, marginTop: '2px', letterSpacing: '0.3px' }}>{letter}</div>
                      </div>
                    ))}
                  </div>

                  {hasLwp && (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '11px', color: '#9a3412', fontWeight: 600 }}>
                      <span>
                        LWP {monthlyPayroll.lwpDays}d × ₹{monthlyPayroll.perDayRate.toLocaleString()}/day
                        {monthlyPayroll.lwpLeaveInMonth > 0 && <span style={{ marginLeft: '4px', opacity: 0.7 }}>(incl. {monthlyPayroll.lwpLeaveInMonth}d leave over quota)</span>}
                      </span>
                      <span style={{ fontWeight: 800 }}>− ₹{monthlyPayroll.lwpDeduction.toLocaleString()}</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })()}

        {/* ── Revision history (Phase 1: foundation of #3) ───────────── */}
        {info.revisions.length > 1 && (
          <>
            <div style={{ fontSize: '9px', fontWeight: 900, color: '#94a3b8', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '10px' }}>Revision History</div>
            {[...info.revisions].sort((a, b) => (b.effectiveFrom || '').localeCompare(a.effectiveFrom || '')).map((r) => {
              const c = computeFromRevision(r);
              const isActive = r.id === active.id;
              return (
                <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '11px 14px', background: isActive ? '#fff8e6' : '#f8fafc', borderRadius: '10px', border: `1px solid ${isActive ? '#fde68a' : '#f1f5f9'}`, marginBottom: '6px' }}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '12px', fontWeight: 800, color: '#0f172a' }}>From {r.effectiveFrom}</span>
                      {isActive && <span style={{ fontSize: '8px', background: '#d4a017', color: '#0a1628', padding: '2px 6px', borderRadius: '4px', fontWeight: 900, letterSpacing: '0.5px' }}>ACTIVE</span>}
                    </div>
                    <div style={{ fontSize: '10px', color: '#64748b', marginTop: '2px' }}>{r.note || 'Revision'}</div>
                  </div>
                  <div style={{ textAlign: 'right', marginRight: '8px' }}>
                    <div style={{ fontSize: '12px', fontWeight: 800, color: '#0f52ba' }}>₹{c.net.toLocaleString()}</div>
                    <div style={{ fontSize: '9px', color: '#94a3b8' }}>net / month</div>
                  </div>
                  <button
                    onClick={() => deleteRevision(staff.id, r.id)}
                    title="Delete revision"
                    style={{ width: '26px', height: '26px', borderRadius: '7px', background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626', cursor: 'pointer', fontSize: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  >✕</button>
                </div>
              );
            })}
          </>
        )}

        {/* Payment history */}
        <div style={{ fontSize: '9px', fontWeight: 900, color: '#94a3b8', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '10px', marginTop: info.revisions.length > 1 ? '20px' : 0 }}>Payment History</div>
        {info.disbursements.length === 0
          ? <div style={{ textAlign: 'center', padding: '20px', color: '#cbd5e1', fontSize: '12px', background: '#f8fafc', borderRadius: '10px' }}>No disbursements recorded.</div>
          : [...info.disbursements].reverse().map(d => {
            const modeMeta = PAYMENT_MODES.find(m => m.id === d.mode);
            return (
              <div key={d.id || d.month} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '11px 14px', background: '#f8fafc', borderRadius: '10px', border: '1px solid #f1f5f9', marginBottom: '6px' }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontSize: '12px', fontWeight: 700, color: '#0f172a' }}>{d.month}</span>
                    {modeMeta && <span style={{ fontSize: '9px', background: '#eff6ff', color: '#0f52ba', padding: '2px 6px', borderRadius: '4px', fontWeight: 700 }}>{modeMeta.icon} {modeMeta.label}</span>}
                    {d.lwpDays > 0 && <span style={{ fontSize: '9px', background: '#fff7ed', color: '#9a3412', padding: '2px 6px', borderRadius: '4px', fontWeight: 700 }}>{d.lwpDays}d LWP</span>}
                  </div>
                  <div style={{ fontSize: '10px', color: '#94a3b8', marginTop: '2px' }}>
                    Gross ₹{(d.grossPay || 0).toLocaleString()}{d.reference ? ` · Ref ${d.reference}` : ''}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '13px', fontWeight: 800, color: '#16a34a' }}>₹{(d.netPay || 0).toLocaleString()}</div>
                    <span style={{ fontSize: '9px', background: '#dcfce7', color: '#16a34a', padding: '2px 7px', borderRadius: '4px', fontWeight: 700, letterSpacing: '0.5px' }}>PAID</span>
                  </div>
                  <button
                    onClick={() => printPayslip(staff, d)}
                    title="Print payslip"
                    style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'white', border: '1px solid #e2e8f0', color: '#0f52ba', cursor: 'pointer', fontSize: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  >🖨</button>
                </div>
              </div>
            );
          })
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
    const isCurrentMonth = attendanceMonth === THIS_MONTH;
    const monthLabel = `${MONTHS[mn - 1]} ${yr}`;

    const totalMarked = Object.values(summary).reduce((s, v) => s + v, 0);
    const workingDays = totalMarked; // for now equal to total marked
    const presentCount = (summary.present || 0) + (summary.late || 0);
    const coveragePct  = workingDays > 0 ? Math.round((presentCount / workingDays) * 100) : 0;

    // Working days expected (Mon-Sat for the past portion of the month)
    const todayDay = isCurrentMonth ? TODAY.getDate() : daysInMon;
    let expectedWorking = 0;
    for (let d = 1; d <= todayDay; d++) {
      const dow = new Date(yr, mn - 1, d).getDay();
      if (dow !== 0) expectedWorking++; // skip Sundays
    }
    const unmarkedSoFar = Math.max(0, expectedWorking - totalMarked);

    return (
      <div style={{ padding: '20px 24px 24px' }}>
        {/* Header row: month nav + quick actions */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px', gap: '12px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', background: 'white', border: '1px solid #e2e8f0', borderRadius: '10px', overflow: 'hidden' }}>
            <button onClick={prevMonth} title="Previous month" style={{ width: '34px', height: '38px', background: 'transparent', border: 'none', cursor: 'pointer', fontWeight: 700, color: '#475569', fontSize: '16px' }}>‹</button>
            <div style={{ padding: '0 16px', height: '38px', display: 'flex', alignItems: 'center', borderLeft: '1px solid #e2e8f0', borderRight: '1px solid #e2e8f0', fontSize: '13px', fontWeight: 800, color: '#0a1628', letterSpacing: '-0.2px', minWidth: '130px', justifyContent: 'center' }}>
              {monthLabel}
            </div>
            <button onClick={nextMonth} title="Next month" style={{ width: '34px', height: '38px', background: 'transparent', border: 'none', cursor: 'pointer', fontWeight: 700, color: '#475569', fontSize: '16px' }}>›</button>
          </div>

          <div style={{ display: 'flex', gap: '8px' }}>
            {!isCurrentMonth && (
              <button onClick={() => setAttendanceMonth(THIS_MONTH)} style={{ padding: '0 14px', height: '38px', borderRadius: '10px', border: '1px solid #fde68a', background: '#fff8e6', color: '#92400e', fontSize: '11px', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>↺ Today</button>
            )}
            <button
              onClick={() => setAttPicker({ open: true, date: TODAY_STR, status: records[TODAY_STR] || 'present' })}
              style={{ padding: '0 18px', height: '38px', borderRadius: '10px', border: 'none', background: 'linear-gradient(135deg, #d4a017 0%, #b8860b 100%)', color: '#0a1628', fontSize: '12px', fontWeight: 800, cursor: 'pointer', boxShadow: '0 4px 12px rgba(212,160,23,0.3)', whiteSpace: 'nowrap', letterSpacing: '0.2px' }}
            >+ Mark today</button>
          </div>
        </div>

        {/* Side-by-side: Calendar (left) + Summary (right) on wide; stacked on narrow */}
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 280px', gap: '20px', alignItems: 'start' }}>

          {/* Calendar */}
          <div style={{ background: 'white', border: '1px solid #e8edf2', borderRadius: '14px', padding: '16px', boxShadow: '0 1px 3px rgba(15,23,42,0.03)' }}>
            {/* Day headers */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px', marginBottom: '8px' }}>
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d, i) => (
                <div key={i} style={{
                  textAlign: 'center', fontSize: '9px', fontWeight: 800,
                  color: (i === 0) ? '#cbd5e1' : '#94a3b8',
                  padding: '6px 0', letterSpacing: '0.8px', textTransform: 'uppercase',
                }}>{d}</div>
              ))}
            </div>

            {/* Date cells */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px' }}>
              {Array.from({ length: firstDow }).map((_, i) => <div key={`_${i}`} />)}
              {Array.from({ length: daysInMon }).map((_, i) => {
                const day    = i + 1;
                const ds     = `${attendanceMonth}-${String(day).padStart(2, '0')}`;
                const st     = records[ds];
                const meta   = st ? ATT_META[st] : null;
                const isToday = ds === TODAY_STR;
                const dow    = new Date(yr, mn - 1, day).getDay();
                const isSunday = dow === 0;
                const isFuture = ds > TODAY_STR;

                return (
                  <div
                    key={day}
                    onClick={() => !isFuture && setAttPicker({ open: true, date: ds, status: st || 'present' })}
                    title={st ? `${ATT_META[st].label} · ${ds}` : (isFuture ? 'Future date' : 'Click to mark')}
                    style={{
                      aspectRatio: '1',
                      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                      borderRadius: '9px',
                      cursor: isFuture ? 'not-allowed' : 'pointer',
                      fontSize: '13px',
                      fontWeight: isToday ? 900 : 700,
                      position: 'relative',
                      background: meta ? meta.bg : isToday ? '#fff8e6' : isSunday ? '#fafbfc' : 'white',
                      border: `1.5px solid ${isToday ? '#d4a017' : meta ? meta.color + '40' : '#f1f5f9'}`,
                      color: isFuture ? '#cbd5e1' : meta ? meta.color : isToday ? '#0a1628' : isSunday ? '#cbd5e1' : '#475569',
                      boxShadow: isToday ? '0 0 0 3px rgba(212,160,23,0.18)' : 'none',
                      opacity: isFuture ? 0.5 : 1,
                      transition: 'transform 0.12s, box-shadow 0.12s, border-color 0.12s',
                    }}
                    onMouseEnter={(e) => { if (!isFuture && !isToday) { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = `0 4px 10px ${meta ? meta.color + '25' : 'rgba(15,23,42,0.08)'}`; } }}
                    onMouseLeave={(e) => { if (!isToday) { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = 'none'; } }}
                  >
                    <span>{day}</span>
                    {meta && (
                      <span style={{ position: 'absolute', bottom: '4px', width: '4px', height: '4px', borderRadius: '50%', background: meta.color }} />
                    )}
                  </div>
                );
              })}
            </div>

            {/* Legend strip */}
            <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap', marginTop: '14px', paddingTop: '12px', borderTop: '1px solid #f1f5f9' }}>
              {Object.entries(ATT_META).map(([s, m]) => (
                <div key={s} style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                  <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: m.color }} />
                  <span style={{ fontSize: '10px', fontWeight: 700, color: '#64748b' }}>{m.label}</span>
                </div>
              ))}
              <div style={{ display: 'flex', gap: '6px', alignItems: 'center', marginLeft: 'auto' }}>
                <div style={{ width: '10px', height: '10px', borderRadius: '4px', border: '1.5px solid #d4a017', background: '#fff8e6' }} />
                <span style={{ fontSize: '10px', fontWeight: 700, color: '#64748b' }}>Today</span>
              </div>
            </div>
          </div>

          {/* Summary side panel */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {/* Coverage banner */}
            <div style={{
              background: 'linear-gradient(135deg, #0a1628 0%, #1e3a5f 100%)',
              borderRadius: '14px', padding: '14px 16px',
              position: 'relative', overflow: 'hidden',
            }}>
              <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '2px', background: 'linear-gradient(90deg, transparent, #d4a017 40%, transparent)' }} />
              <div style={{ fontSize: '9px', fontWeight: 800, color: '#d4a017', letterSpacing: '1.2px', textTransform: 'uppercase', marginBottom: '6px' }}>
                Attendance · {monthLabel}
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
                <span style={{ fontSize: '28px', fontWeight: 900, color: 'white', letterSpacing: '-1px', lineHeight: 1 }}>{coveragePct}%</span>
                <span style={{ fontSize: '11px', fontWeight: 600, color: 'rgba(255,255,255,0.55)' }}>present rate</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '10px', paddingTop: '10px', borderTop: '1px solid rgba(255,255,255,0.12)' }}>
                <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.55)', fontWeight: 600 }}>
                  {totalMarked} of {expectedWorking} working days marked
                </span>
                {unmarkedSoFar > 0 && (
                  <span style={{ fontSize: '9px', fontWeight: 800, color: '#fcd34d', background: 'rgba(212,160,23,0.18)', border: '1px solid rgba(212,160,23,0.3)', padding: '2px 7px', borderRadius: '999px' }}>
                    {unmarkedSoFar} pending
                  </span>
                )}
              </div>
            </div>

            {/* Status breakdown */}
            {Object.entries(ATT_META).map(([s, m]) => {
              const count = summary[s] || 0;
              const pct = workingDays > 0 ? Math.round((count / workingDays) * 100) : 0;
              return (
                <div key={s} style={{ background: 'white', border: '1px solid #e8edf2', borderRadius: '12px', padding: '11px 14px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: m.color }} />
                      <span style={{ fontSize: '11px', fontWeight: 700, color: '#0a1628' }}>{m.label}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
                      <span style={{ fontSize: '16px', fontWeight: 900, color: count > 0 ? m.color : '#cbd5e1', lineHeight: 1 }}>{count}</span>
                      <span style={{ fontSize: '9px', fontWeight: 600, color: '#94a3b8' }}>{pct}%</span>
                    </div>
                  </div>
                  <div style={{ height: '4px', background: '#f1f5f9', borderRadius: '2px', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${pct}%`, background: m.color, borderRadius: '2px', transition: 'width 0.3s' }} />
                  </div>
                </div>
              );
            })}
          </div>
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
          onClick={() => setLeaveForm({ open: true, type: LEAVE_TYPES[0] || 'Sick', from: '', to: '', reason: '' })}
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
    const isDocsLoading = docsLoadingMap[staff.id];

    const handleFileSelect = async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      e.target.value = '';
      if (file.size > 10 * 1024 * 1024) {
        showNotif('warning', 'File too large', 'Maximum file size is 10 MB.');
        return;
      }
      const formData = new FormData();
      formData.append('file', file);
      formData.append('category', uploadCategory);
      try {
        await apiClient.post(`/staff/${staff.id}/documents`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        showNotif('success', 'Uploaded', `${file.name} saved to records.`);
        const res = await apiClient.get(`/staff/${staff.id}/documents`);
        setDocumentsData(p => ({ ...p, [staff.id]: mapDocs(res.data) }));
      } catch (err) {
        showNotif('error', 'Upload failed', err.response?.data?.message || 'Could not upload document.');
      }
    };

    const deleteDoc = async (docId, docName) => {
      try {
        await apiClient.delete(`/staff/${staff.id}/documents/${docId}`);
        setDocumentsData(p => ({ ...p, [staff.id]: (p[staff.id] || []).filter(d => d.id !== docId) }));
        showNotif('success', 'Deleted', `${docName} removed.`);
      } catch (err) {
        showNotif('error', 'Delete failed', err.response?.data?.message || 'Could not delete document.');
      }
    };

    const EXT_ICON = (name) => {
      const ext = (name || '').split('.').pop().toLowerCase();
      if (['jpg','jpeg','png','gif','webp'].includes(ext)) return { icon: '🖼', color: '#0891b2', bg: '#ecfeff' };
      if (ext === 'pdf') return { icon: '📄', color: '#dc2626', bg: '#fef2f2' };
      if (['doc','docx'].includes(ext)) return { icon: '📝', color: '#0f52ba', bg: '#eff6ff' };
      return { icon: '📎', color: '#64748b', bg: '#f8fafc' };
    };

    return (
      <div style={{ padding: '24px 24px 28px' }}>
        {/* Premium upload zone — drag-and-drop with category selector */}
        <label
          htmlFor={`doc-upload-${staff.id}`}
          onDragOver={(e) => { e.preventDefault(); e.currentTarget.style.borderColor = '#d4a017'; e.currentTarget.style.background = '#fff8e6'; }}
          onDragLeave={(e) => { e.currentTarget.style.borderColor = '#cbd5e1'; e.currentTarget.style.background = '#fafbfc'; }}
          onDrop={(e) => {
            e.preventDefault();
            e.currentTarget.style.borderColor = '#cbd5e1';
            e.currentTarget.style.background = '#fafbfc';
            const file = e.dataTransfer.files?.[0];
            if (file) handleFileSelect({ target: { files: [file], value: '' } });
          }}
          style={{
            display: 'block', cursor: 'pointer',
            border: '1.5px dashed #cbd5e1', borderRadius: '14px',
            background: '#fafbfc', padding: '22px 20px', marginBottom: '20px',
            transition: 'border-color 0.15s, background 0.15s',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div style={{
              width: '54px', height: '54px', borderRadius: '14px',
              background: 'linear-gradient(135deg, #d4a017 0%, #b8860b 100%)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
              boxShadow: '0 6px 16px rgba(212,160,23,0.3)',
            }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#0a1628" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: '14px', fontWeight: 800, color: '#0a1628', marginBottom: '2px' }}>Upload document</div>
              <div style={{ fontSize: '11px', color: '#64748b', lineHeight: 1.5 }}>
                Drag a file here or click to browse · PDF, Word or image · max 10&nbsp;MB
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flexShrink: 0 }} onClick={(e) => e.preventDefault()}>
              <label style={{ fontSize: '9px', fontWeight: 800, color: '#94a3b8', letterSpacing: '0.5px', textTransform: 'uppercase' }}>Category</label>
              <select
                value={uploadCategory}
                onChange={(e) => { e.stopPropagation(); setUploadCategory(e.target.value); }}
                onClick={(e) => e.stopPropagation()}
                style={{ fontSize: '12px', fontWeight: 700, border: '1px solid #e2e8f0', borderRadius: '8px', padding: '7px 10px', background: 'white', color: '#0a1628', outline: 'none', cursor: 'pointer', minWidth: '170px' }}
              >
                {DOC_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>
          <input
            id={`doc-upload-${staff.id}`}
            type="file"
            accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.webp"
            onChange={handleFileSelect}
            style={{ display: 'none' }}
          />
        </label>

        {/* Section label */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '12px' }}>
          <div style={{ fontSize: '10px', fontWeight: 800, color: '#0a1628', letterSpacing: '1px', textTransform: 'uppercase' }}>
            {isDocsLoading ? 'Loading…' : (docs.length === 0 ? 'Documents' : `${docs.length} Document${docs.length !== 1 ? 's' : ''}`)}
          </div>
        </div>

        {/* Document list */}
        {isDocsLoading ? (
          <div style={{ textAlign: 'center', padding: '30px', color: '#94a3b8', fontSize: '12px' }}>Loading documents…</div>
        ) : docs.length === 0 ? (
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
                      <span style={{ fontSize: '10px', fontWeight: 700, color, background: bg, border: `1px solid ${color}30`, borderRadius: '6px', padding: '2px 6px' }}>{doc.category}</span>
                      <span style={{ fontSize: '9px', color: '#94a3b8', fontWeight: 600 }}>
                        {new Date(doc.uploadedAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                        {doc.size ? ` · ${(doc.size / 1024).toFixed(0)} KB` : ''}
                      </span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                    {doc.blobUrl && (
                      <a
                        href={doc.blobUrl}
                        target="_blank"
                        rel="noreferrer"
                        style={{ width: '30px', height: '30px', borderRadius: '7px', background: '#eff6ff', border: '1px solid #dbeafe', display: 'flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none', fontSize: '13px' }}
                        title="Open / Download"
                      >⬇</a>
                    )}
                    <button
                      onClick={() => askConfirm({ title: 'Delete document?', message: `Remove "${doc.name}" from records?`, confirmText: 'Delete', danger: true, onConfirm: () => deleteDoc(doc.id, doc.name) })}
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
    <div style={{ padding: isMobile ? '16px' : '32px 40px', fontFamily: '"Inter", "Segoe UI", system-ui, sans-serif', height: '100vh', display: 'flex', flexDirection: 'column', background: '#f8fafc', overflow: 'hidden', boxSizing: 'border-box', gap: '20px' }}>

      {/* ── Page header (Billing-style: clean title + pill tabs) ─────── */}
      <div style={{
        display: 'flex',
        flexDirection: isMobile ? 'column' : 'row',
        justifyContent: 'space-between',
        alignItems: isMobile ? 'stretch' : 'flex-start',
        gap: isMobile ? '16px' : '0',
        flexShrink: 0,
      }}>
        <div>
          <h1 style={{
            fontSize: isMobile ? '20px' : '24px',
            fontWeight: 700,
            color: '#0a1628',
            letterSpacing: '-0.5px',
            margin: 0,
          }}>Staff &amp; Payroll</h1>

          {/* Pill tabs */}
          <div style={{ display: 'flex', gap: '6px', marginTop: '14px', flexWrap: 'wrap' }}>
            {[
              { id: 'dashboard', label: 'Dashboard' },
              { id: 'roster',    label: 'Roster' },
              { id: 'leave',     label: 'Leave Policy' },
            ].map(t => (
              <button
                key={t.id}
                type="button"
                onClick={() => setMainTab(t.id)}
                style={{
                  padding: '7px 16px',
                  borderRadius: '8px',
                  border: '1px solid #e2e8f0',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  background: mainTab === t.id ? '#0a1628' : 'white',
                  color: mainTab === t.id ? 'white' : '#6b7280',
                  transition: 'all 0.2s',
                }}
              >
                {t.label}
              </button>
            ))}
          </div>

          {!isMobile && (
            <div style={{ marginTop: '8px', fontSize: '12px', color: '#6b7280' }}>
              {activeCenter?.name || 'Current facility'} · Roster, payroll &amp; HR
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
          <button
            onClick={() => { fetchPersonnel(); loadLocalData(); loadLeavePolicy(); }}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: '6px',
              padding: '10px 18px', borderRadius: '8px',
              border: '1px solid #e2e8f0', background: 'white',
              color: '#475569', fontSize: '13px', fontWeight: 600,
              cursor: 'pointer',
              width: isMobile ? '100%' : 'auto', justifyContent: 'center',
            }}
          >
            <IconRefresh /> Refresh
          </button>
          {mainTab !== 'leave' && (
            <button
              onClick={openAddStaff}
              style={{
                padding: '10px 22px', borderRadius: '8px', border: 'none',
                background: '#1d4ed8', color: 'white',
                fontWeight: 600, fontSize: '13px', cursor: 'pointer',
                boxShadow: '0 4px 12px rgba(29,78,216,0.2)',
                width: isMobile ? '100%' : 'auto',
              }}
            >
              + Add staff
            </button>
          )}
        </div>
      </div>

      {/* ── Dashboard tab ────────────────────────────────────────────── */}
      {mainTab === 'dashboard' && (
        <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
          <StaffDashboardPage
            embedded
            onSelectStaff={(staff) => {
              setSelectedStaff(staff);
              setDetailTab('profile');
              setMainTab('roster');
            }}
          />
        </div>
      )}

      {/* ── Leave Policy tab ─────────────────────────────────────────── */}
      {mainTab === 'leave' && (
        <div style={{ flex: 1, overflowY: 'auto', minHeight: 0, background: 'white', borderRadius: '14px', border: '1px solid #e8edf2', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
          <LeavePolicyEditor
            embedded
            hospitalId={activeCenter?.id}
            currentUserName={currentUser?.fullName || currentUser?.email}
          />
        </div>
      )}

      {/* â”€â”€ Split layout (Roster tab) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      {mainTab === 'roster' && (
      <div style={{ display: isMobile ? 'block' : 'flex', gap: '14px', flex: 1, overflow: 'hidden', alignItems: 'stretch', minHeight: 0 }}>

        {/* LEFT: Staff roster — premium card */}
        <div style={{
          width: isMobile ? '100%' : '320px', flexShrink: 0,
          background: 'white', borderRadius: '16px', border: '1px solid #e8edf2',
          boxShadow: '0 4px 20px rgba(15, 23, 42, 0.04)', overflow: 'hidden',
          display: 'flex', flexDirection: 'column',
          ...(isMobile && selectedStaff ? { display: 'none' } : {}),
        }}>
          {/* Roster header */}
          <div style={{ padding: '18px 18px 14px', borderBottom: '1px solid #f1f5f9', background: 'linear-gradient(180deg, #ffffff 0%, #fafbfc 100%)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
              <div>
                <div style={{ fontSize: '11px', fontWeight: 800, color: '#0a1628', letterSpacing: '0.3px', textTransform: 'uppercase' }}>
                  Roster
                </div>
                <div style={{ fontSize: '10px', color: '#94a3b8', fontWeight: 500, marginTop: '2px' }}>
                  {filteredPersonnel.length} {filteredPersonnel.length === 1 ? 'team member' : 'team members'}
                </div>
              </div>
              {(() => {
                const presentToday = Object.entries(attendanceData)
                  .filter(([, recs]) => recs?.[TODAY_STR] === 'present' || recs?.[TODAY_STR] === 'late').length;
                if (presentToday === 0) return null;
                return (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '5px', background: '#f0fdf4', border: '1px solid #bbf7d0', padding: '4px 9px', borderRadius: '999px' }}>
                    <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#16a34a' }} />
                    <span style={{ fontSize: '10px', fontWeight: 700, color: '#15803d' }}>{presentToday} in today</span>
                  </div>
                );
              })()}
            </div>
            <div style={{ position: 'relative' }}>
              <div style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', display: 'flex', pointerEvents: 'none' }}>
                <IconSearch />
              </div>
              <input
                type="text" placeholder="Search name, email or ID…" value={search}
                onChange={e => setSearch(e.target.value)}
                onFocus={(e) => { e.target.style.borderColor = '#0a1628'; e.target.style.boxShadow = '0 0 0 3px rgba(10, 22, 40, 0.08)'; }}
                onBlur={(e) => { e.target.style.borderColor = '#e2e8f0'; e.target.style.boxShadow = 'none'; }}
                style={{ width: '100%', padding: '10px 12px 10px 34px', borderRadius: '10px', border: '1px solid #e2e8f0', fontSize: '12px', outline: 'none', boxSizing: 'border-box', color: '#0f172a', background: 'white', transition: 'border-color 0.15s, box-shadow 0.15s' }}
              />
            </div>
          </div>

          {/* Staff list */}
          <div style={{ overflowY: 'auto', flex: 1, padding: '8px' }}>
            {loading ? (
              <div style={{ padding: '48px 20px', textAlign: 'center', color: '#94a3b8', fontSize: '12px' }}>
                <div style={{ width: '22px', height: '22px', border: '2.5px solid #e2e8f0', borderTopColor: '#0a1628', borderRadius: '50%', animation: 'staffSpin 0.8s linear infinite', margin: '0 auto 12px' }} />
                Loading roster…
              </div>
            ) : filteredPersonnel.length === 0 ? (
              <div style={{ padding: '48px 20px', textAlign: 'center', color: '#94a3b8', fontSize: '12px' }}>
                <div style={{ width: '40px', height: '40px', borderRadius: '12px', background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 10px', color: '#cbd5e1' }}>
                  <IconSearch />
                </div>
                <div style={{ fontWeight: 600, color: '#64748b' }}>No staff found</div>
                {search && <div style={{ marginTop: '4px', fontSize: '11px' }}>Try a different search term</div>}
              </div>
            ) : filteredPersonnel.map(u => {
              const meta       = getRoleMeta(u.roles?.[0]);
              const isSelected = selectedStaff?.id === u.id;
              const attToday   = (attendanceData[u.id] || {})[TODAY_STR];
              const salNet     = getSalaryInfo(u.id).net;
              const initials   = (u.name || '').trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase() || '?';
              return (
                <div
                  key={u.id}
                  onClick={() => { setSelectedStaff(u); setDetailTab('profile'); }}
                  onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.background = '#fafbfc'; }}
                  onMouseLeave={(e) => { if (!isSelected) e.currentTarget.style.background = 'transparent'; }}
                  style={{
                    padding: '11px 12px', cursor: 'pointer', borderRadius: '12px',
                    marginBottom: '4px',
                    background: isSelected ? 'white' : 'transparent',
                    border: `1px solid ${isSelected ? '#0a1628' : 'transparent'}`,
                    boxShadow: isSelected ? '0 4px 14px rgba(10, 22, 40, 0.10)' : 'none',
                    transition: 'background 0.15s, border-color 0.15s, box-shadow 0.15s',
                    position: 'relative',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    {/* Avatar with status ring */}
                    <div style={{ position: 'relative', flexShrink: 0 }}>
                      <div style={{
                        width: '40px', height: '40px', borderRadius: '12px',
                        background: isSelected ? 'linear-gradient(135deg, #0a1628 0%, #1e3a5f 100%)' : meta.bg,
                        color: isSelected ? '#d4a017' : meta.color,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: '13px', fontWeight: 800, letterSpacing: '0.5px',
                        transition: 'all 0.15s',
                        boxShadow: isSelected ? '0 4px 10px rgba(10,22,40,0.18)' : 'none',
                      }}>
                        {initials}
                      </div>
                      {attToday && (
                        <div
                          title={ATT_META[attToday]?.label}
                          style={{
                            position: 'absolute', bottom: '-2px', right: '-2px',
                            width: '12px', height: '12px', borderRadius: '50%',
                            background: ATT_META[attToday]?.color,
                            border: '2px solid white',
                            boxShadow: '0 1px 3px rgba(0,0,0,0.15)',
                          }}
                        />
                      )}
                    </div>

                    {/* Name + meta */}
                    <div style={{ flex: 1, overflow: 'hidden' }}>
                      <div style={{ fontSize: '13px', fontWeight: 700, color: '#0a1628', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden', letterSpacing: '-0.1px' }}>{u.name}</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '3px', whiteSpace: 'nowrap' }}>
                        {u.employeeCode && (
                          <span style={{ fontSize: '9px', color: '#64748b', fontWeight: 700, fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace', background: '#f1f5f9', padding: '1px 5px', borderRadius: '4px' }}>{u.employeeCode}</span>
                        )}
                        <span style={{ fontSize: '10px', color: meta.color, fontWeight: 600 }}>{meta.label}</span>
                      </div>
                    </div>

                    {/* Right rail: salary */}
                    {salNet > 0 && (
                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        <div style={{ fontSize: '11px', fontWeight: 800, color: isSelected ? '#0a1628' : '#475569' }}>
                          ₹{(salNet / 1000).toFixed(salNet >= 100000 ? 0 : 1)}k
                        </div>
                        <div style={{ fontSize: '8px', color: '#94a3b8', fontWeight: 600, marginTop: '1px', letterSpacing: '0.3px' }}>NET/MO</div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* RIGHT: Detail panel — premium */}
        {selectedStaff ? (() => {
          const meta = getRoleMeta(selectedStaff.roles?.[0]);
          const initials = (selectedStaff.name || '').trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase() || '?';
          const isActive = (selectedStaff.status || 'active').toLowerCase() !== 'inactive';
          return (
          <div style={{ flex: 1, background: 'white', borderRadius: '16px', border: '1px solid #e8edf2', boxShadow: '0 4px 20px rgba(15, 23, 42, 0.04)', overflow: 'hidden', minWidth: 0, display: 'flex', flexDirection: 'column' }}>

            {/* Staff header — refined navy with subtle gold accent */}
            <div style={{
              position: 'relative',
              background: 'linear-gradient(135deg, #0a1628 0%, #1e3a5f 60%, #0a1628 100%)',
              padding: '24px 28px',
              display: 'flex', alignItems: 'center', gap: '18px',
              overflow: 'hidden',
            }}>
              <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '2px', background: 'linear-gradient(90deg, transparent, #d4a017 30%, #f5d76e 50%, #d4a017 70%, transparent)' }} />
              {/* Decorative blur orb */}
              <div style={{ position: 'absolute', top: '-40px', right: '-40px', width: '160px', height: '160px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(212,160,23,0.12) 0%, transparent 70%)', pointerEvents: 'none' }} />

              {isMobile && (
                <button
                  onClick={() => setSelectedStaff(null)}
                  style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', color: 'white', borderRadius: '10px', padding: '8px 12px', cursor: 'pointer', fontWeight: 700, fontSize: '14px', lineHeight: 1, flexShrink: 0 }}
                >← Back</button>
              )}

              {/* Avatar with gold ring */}
              <div style={{ position: 'relative', flexShrink: 0 }}>
                <div style={{
                  width: '56px', height: '56px', borderRadius: '14px',
                  background: 'linear-gradient(135deg, rgba(212,160,23,0.22) 0%, rgba(212,160,23,0.08) 100%)',
                  color: '#f5d76e',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '20px', fontWeight: 800, letterSpacing: '0.5px',
                  border: '1.5px solid rgba(212,160,23,0.35)',
                  boxShadow: '0 6px 18px rgba(0,0,0,0.25)',
                }}>{initials}</div>
              </div>

              {/* Name + meta */}
              <div style={{ flex: 1, overflow: 'hidden', position: 'relative', zIndex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                  <div style={{ fontSize: '18px', fontWeight: 800, color: 'white', letterSpacing: '-0.3px' }}>{selectedStaff.name}</div>
                  {selectedStaff.employeeCode && (
                    <span style={{ fontSize: '10px', fontWeight: 800, color: '#d4a017', background: 'rgba(212,160,23,0.12)', border: '1px solid rgba(212,160,23,0.3)', padding: '3px 9px', borderRadius: '6px', letterSpacing: '0.5px', fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace' }}>
                      {selectedStaff.employeeCode}
                    </span>
                  )}
                </div>
                <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.6)', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  <span style={{ fontWeight: 600, color: '#f5d76e' }}>{ROLE_LABELS?.[selectedStaff.roles?.[0]] || meta.label}</span>
                  {selectedStaff.email && (<>
                    <span style={{ color: 'rgba(255,255,255,0.25)' }}>·</span>
                    <span>{selectedStaff.email}</span>
                  </>)}
                  {selectedStaff.mobile && (<>
                    <span style={{ color: 'rgba(255,255,255,0.25)' }}>·</span>
                    <span>{selectedStaff.mobile}</span>
                  </>)}
                </div>
              </div>

              {/* Status + Edit */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0, position: 'relative', zIndex: 1 }}>
                <span style={{
                  display: 'inline-flex', alignItems: 'center', gap: '5px',
                  padding: '5px 11px', borderRadius: '999px',
                  background: isActive ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)',
                  border: `1px solid ${isActive ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}`,
                  color: isActive ? '#86efac' : '#fca5a5',
                  fontSize: '10px', fontWeight: 800, letterSpacing: '0.5px',
                }}>
                  <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: isActive ? '#22c55e' : '#ef4444' }} />
                  {(selectedStaff.status || 'ACTIVE').toUpperCase()}
                </span>
                <button
                  onClick={() => openEditStaff(selectedStaff)}
                  title="Edit staff record"
                  style={{
                    background: 'rgba(255,255,255,0.08)',
                    border: '1px solid rgba(255,255,255,0.15)',
                    borderRadius: '8px',
                    padding: '7px 16px', color: 'white',
                    fontSize: '11px', fontWeight: 700, cursor: 'pointer',
                    letterSpacing: '0.3px',
                    transition: 'all 0.15s',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(212,160,23,0.18)'; e.currentTarget.style.borderColor = 'rgba(212,160,23,0.4)'; e.currentTarget.style.color = '#f5d76e'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.15)'; e.currentTarget.style.color = 'white'; }}
                >Edit</button>
              </div>
            </div>

            {/* Tab bar */}
            <div style={{ display: 'flex', borderBottom: '1px solid #e8edf2', background: 'white', padding: '0 12px', overflowX: 'auto' }}>
              {DETAIL_TABS.map(tab => {
                const active = detailTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setDetailTab(tab.id)}
                    style={{
                      padding: '14px 18px', border: 'none', background: 'none', cursor: 'pointer',
                      fontSize: '12px', fontWeight: active ? 800 : 600,
                      color: active ? '#0a1628' : '#94a3b8',
                      borderBottom: `2px solid ${active ? '#d4a017' : 'transparent'}`,
                      transition: 'color 0.12s, border-color 0.12s',
                      letterSpacing: '0.2px',
                      whiteSpace: 'nowrap',
                      marginBottom: '-1px',
                    }}
                    onMouseEnter={(e) => { if (!active) e.currentTarget.style.color = '#475569'; }}
                    onMouseLeave={(e) => { if (!active) e.currentTarget.style.color = '#94a3b8'; }}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>

            {/* Tab content */}
            <div style={{ overflowY: 'auto', flex: 1 }}>
              {detailTab === 'profile'    && renderProfileTab(selectedStaff)}
              {detailTab === 'documents'  && renderDocumentsTab(selectedStaff)}
              {detailTab === 'salary'     && renderSalaryTab(selectedStaff)}
              {detailTab === 'attendance' && renderAttendanceTab(selectedStaff)}
              {detailTab === 'leave'      && renderLeaveTab(selectedStaff)}
              {detailTab === 'access'     && renderAccessTab(selectedStaff)}
            </div>
          </div>
          );
        })() : !isMobile && (
          <div style={{
            flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'white', borderRadius: '16px',
            border: '1px solid #e8edf2',
            boxShadow: '0 4px 20px rgba(15, 23, 42, 0.04)',
            position: 'relative', overflow: 'hidden',
          }}>
            {/* Subtle background pattern */}
            <div style={{
              position: 'absolute', inset: 0,
              backgroundImage: 'radial-gradient(circle at 30% 20%, rgba(10, 22, 40, 0.025) 0%, transparent 50%), radial-gradient(circle at 70% 80%, rgba(212, 160, 23, 0.04) 0%, transparent 50%)',
              pointerEvents: 'none',
            }} />
            <div style={{ textAlign: 'center', position: 'relative', maxWidth: '320px', padding: '0 20px' }}>
              <div style={{
                width: '72px', height: '72px', borderRadius: '20px',
                background: 'linear-gradient(135deg, #0a1628 0%, #1e3a5f 100%)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                margin: '0 auto 20px', color: '#f5d76e',
                boxShadow: '0 12px 30px rgba(10, 22, 40, 0.25)',
                position: 'relative', overflow: 'hidden',
              }}>
                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '1.5px', background: 'linear-gradient(90deg, transparent, #d4a017 50%, transparent)' }} />
                <IconPerson />
              </div>
              <div style={{ fontSize: '16px', fontWeight: 800, color: '#0a1628', letterSpacing: '-0.2px' }}>Select a team member</div>
              <div style={{ fontSize: '12px', color: '#64748b', marginTop: '8px', lineHeight: 1.55 }}>
                Choose someone from the roster on the left to view their profile, salary structure, attendance, leave balance and document records.
              </div>
              {filteredPersonnel.length > 0 && (
                <div style={{ marginTop: '18px', display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '10px', fontWeight: 700, color: '#94a3b8', background: '#f8fafc', border: '1px solid #e8edf2', padding: '6px 12px', borderRadius: '999px', letterSpacing: '0.5px', textTransform: 'uppercase' }}>
                  <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: '#d4a017' }} />
                  {filteredPersonnel.length} {filteredPersonnel.length === 1 ? 'member' : 'members'} available
                </div>
              )}
            </div>
          </div>
        )}
      </div>
      )}

      {/* ── SALARY STRUCTURE DRAWER (side slide-in) ──────────────────────── */}
      {salaryDrawer.open && selectedStaff && (() => {
        const EARNING_FIELDS = [
          ['Basic Pay',        'basicPay'],
          ['HRA',              'hra'],
          ['Travel Allowance', 'travel'],
          ['Other Allowances', 'otherAllowances'],
        ];
        const DEDUCT_FIELDS = [
          ['PF Deduction',     'pfDeduction'],
          ['TDS',              'tds'],
          ['Other Deductions', 'otherDeductions'],
        ];
        const f = salaryDrawer.form;
        const grossPreview  = EARNING_FIELDS.reduce((s, [, k]) => s + (Number(f[k]) || 0), 0);
        const deductPreview = DEDUCT_FIELDS.reduce((s, [, k]) => s + (Number(f[k]) || 0), 0);
        const netPreview    = Math.max(0, grossPreview - deductPreview);
        const existingRevCount = (normalizeStaffSalary(salaryData[selectedStaff.id]).revisions || []).length;

        const NumberInput = ({ value, onChange, accent }) => (
          <div style={{
            display: 'flex', alignItems: 'center',
            border: `1px solid ${accent === 'red' ? '#fecaca' : '#bbf7d0'}`,
            borderRadius: '10px', overflow: 'hidden',
            background: accent === 'red' ? '#fff7f7' : '#f0fdf4',
            transition: 'border-color 0.15s, box-shadow 0.15s',
          }}>
            <span style={{
              padding: '0 11px', fontSize: '13px', fontWeight: 800,
              color: accent === 'red' ? '#dc2626' : '#16a34a',
              borderRight: `1px solid ${accent === 'red' ? '#fecaca' : '#bbf7d0'}`,
              height: '40px', display: 'flex', alignItems: 'center',
            }}>₹</span>
            <input
              type="number" min="0" placeholder="0"
              value={value}
              onChange={(e) => onChange(e.target.value)}
              style={{ flex: 1, padding: '10px 12px', border: 'none', fontSize: '14px', fontWeight: 700, outline: 'none', background: 'transparent', color: '#0f172a', minWidth: 0, width: '100%' }}
            />
          </div>
        );

        return (
          <div
            onClick={() => setSalaryDrawer(p => ({ ...p, open: false }))}
            style={{
              position: 'fixed', inset: 0, zIndex: 10001,
              background: 'rgba(10, 22, 40, 0.55)', backdropFilter: 'blur(6px)',
              display: 'flex', justifyContent: 'flex-end',
              animation: 'staffFadeIn 0.18s ease-out',
            }}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                width: '560px', maxWidth: '100vw', height: '100%',
                background: 'white', display: 'flex', flexDirection: 'column',
                boxShadow: '-12px 0 32px rgba(15,23,42,0.22)',
                animation: 'staffSlideIn 0.28s cubic-bezier(0.16, 1, 0.3, 1)',
              }}
            >
              {/* Drawer header — navy hero with gold accent */}
              <div style={{ padding: '22px 28px', background: 'linear-gradient(135deg, #0a1628 0%, #1e3a5f 100%)', color: 'white', position: 'relative', overflow: 'hidden' }}>
                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '3px', background: 'linear-gradient(90deg, transparent, #d4a017 30%, #f5d76e 50%, #d4a017 70%, transparent)' }} />
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
                  <div>
                    <div style={{ fontSize: '10px', fontWeight: 700, color: '#d4a017', letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: '4px' }}>
                      Payroll Structure
                    </div>
                    <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 800, letterSpacing: '-0.3px' }}>{existingRevCount > 0 ? 'New revision' : 'Set up salary'}</h2>
                    <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.6)', fontWeight: 500, marginTop: '4px' }}>{selectedStaff.name}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSalaryDrawer(p => ({ ...p, open: false }))}
                    aria-label="Close"
                    style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', color: 'white', cursor: 'pointer', fontSize: '16px', lineHeight: 1 }}
                  >×</button>
                </div>
              </div>

              {/* Form body */}
              <div style={{ flex: 1, overflowY: 'auto', padding: '22px 28px', display: 'flex', flexDirection: 'column', gap: '22px' }}>

                {/* Revision metadata */}
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
                    <span style={{ width: '6px', height: '20px', borderRadius: '3px', background: '#d4a017' }} />
                    <SectionLabel>Revision</SectionLabel>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '180px 1fr', gap: '14px' }}>
                    <FieldGroup>
                      <FieldLabel required>Effective from</FieldLabel>
                      <input
                        type="date"
                        value={f.effectiveFrom || ''}
                        onChange={(e) => setSalaryDrawer(p => ({ ...p, form: { ...p.form, effectiveFrom: e.target.value } }))}
                        style={{ width: '100%', padding: '10px 12px', borderRadius: '10px', border: '1px solid #e2e8f0', fontSize: '13px', outline: 'none', boxSizing: 'border-box', color: '#0a1628', background: 'white' }}
                      />
                    </FieldGroup>
                    <FieldGroup>
                      <FieldLabel>Note <span style={{ fontWeight: 500, color: '#94a3b8' }}>(optional)</span></FieldLabel>
                      <TextInput
                        value={f.note}
                        onChange={(v) => setSalaryDrawer(p => ({ ...p, form: { ...p.form, note: v } }))}
                        placeholder="e.g. Appraisal Apr 2026"
                      />
                    </FieldGroup>
                  </div>
                  <div style={{ fontSize: '10px', color: '#94a3b8', marginTop: '8px', lineHeight: 1.5 }}>
                    Saving creates a new revision active from this date. Existing disbursements are not affected.
                  </div>
                </div>

                {/* Earnings */}
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
                    <span style={{ width: '6px', height: '20px', borderRadius: '3px', background: '#16a34a' }} />
                    <SectionLabel>Earnings</SectionLabel>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                    {EARNING_FIELDS.map(([label, key]) => (
                      <FieldGroup key={key}>
                        <FieldLabel>{label}</FieldLabel>
                        <NumberInput
                          value={f[key]}
                          onChange={(v) => setSalaryDrawer(p => ({ ...p, form: { ...p.form, [key]: v } }))}
                          accent="green"
                        />
                      </FieldGroup>
                    ))}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '11px', marginTop: '14px' }}>
                    <span style={{ fontSize: '10px', fontWeight: 800, color: '#15803d', letterSpacing: '1px', textTransform: 'uppercase' }}>Gross</span>
                    <span style={{ fontSize: '16px', fontWeight: 900, color: '#15803d' }}>₹{grossPreview.toLocaleString()}</span>
                  </div>
                </div>

                {/* Deductions */}
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
                    <span style={{ width: '6px', height: '20px', borderRadius: '3px', background: '#dc2626' }} />
                    <SectionLabel>Deductions</SectionLabel>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                    {DEDUCT_FIELDS.map(([label, key]) => (
                      <FieldGroup key={key}>
                        <FieldLabel>{label}</FieldLabel>
                        <NumberInput
                          value={f[key]}
                          onChange={(v) => setSalaryDrawer(p => ({ ...p, form: { ...p.form, [key]: v } }))}
                          accent="red"
                        />
                      </FieldGroup>
                    ))}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', background: '#fff7f7', border: '1px solid #fecaca', borderRadius: '11px', marginTop: '14px' }}>
                    <span style={{ fontSize: '10px', fontWeight: 800, color: '#b91c1c', letterSpacing: '1px', textTransform: 'uppercase' }}>Deductions</span>
                    <span style={{ fontSize: '16px', fontWeight: 900, color: '#b91c1c' }}>₹{deductPreview.toLocaleString()}</span>
                  </div>
                </div>

                {/* Net Pay preview */}
                <div style={{ background: 'linear-gradient(135deg, #0a1628 0%, #1e3a5f 100%)', borderRadius: '14px', padding: '18px 22px', position: 'relative', overflow: 'hidden' }}>
                  <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '2px', background: 'linear-gradient(90deg, transparent, #d4a017 40%, transparent)' }} />
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontSize: '9px', fontWeight: 800, color: '#d4a017', letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: '4px' }}>Net Pay / Month</div>
                      <div style={{ fontSize: '28px', fontWeight: 900, color: 'white', letterSpacing: '-0.5px' }}>₹{netPreview.toLocaleString()}</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.5)', marginBottom: '3px' }}>Gross − Deductions</div>
                      <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.7)', fontWeight: 600 }}>
                        ₹{grossPreview.toLocaleString()} − ₹{deductPreview.toLocaleString()}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Local-storage notice */}
                <div style={{ background: '#fff8e6', border: '1px solid #fde68a', borderRadius: '12px', padding: '12px 14px', display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                  <span style={{ fontSize: '16px', lineHeight: 1 }}>ℹ️</span>
                  <div style={{ fontSize: '11px', color: '#92400e', lineHeight: 1.5 }}>
                    Salary structure is stored on this device only. It will not sync to other admins until backend payroll endpoints are wired up.
                  </div>
                </div>
              </div>

              {/* Sticky footer */}
              <div style={{
                padding: '14px 28px', borderTop: '1px solid #e2e8f0',
                display: 'flex', gap: '10px', alignItems: 'center', background: 'white',
              }}>
                <div style={{ flex: 1 }} />
                <button
                  type="button"
                  onClick={() => setSalaryDrawer(p => ({ ...p, open: false }))}
                  style={{
                    padding: '10px 16px', borderRadius: '10px',
                    border: '1px solid #e2e8f0', background: 'white',
                    color: '#0a1628', fontSize: '12px', fontWeight: 700, cursor: 'pointer',
                  }}
                >Cancel</button>
                <button
                  type="button"
                  onClick={() => saveSalaryStructure(selectedStaff.id)}
                  style={{
                    padding: '10px 22px', borderRadius: '10px', border: 'none',
                    background: 'linear-gradient(135deg, #d4a017 0%, #b8860b 100%)',
                    color: '#0a1628',
                    fontSize: '12px', fontWeight: 800, cursor: 'pointer',
                    letterSpacing: '0.3px',
                    boxShadow: '0 6px 18px rgba(212, 160, 23, 0.35)',
                  }}
                >{existingRevCount > 0 ? 'Save revision' : 'Save structure'}</button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── DISBURSEMENT DRAWER ────────────────────────────────────────── */}
      {disbDrawer.open && selectedStaff && (() => {
        const payroll = computeMonthlyPayroll(selectedStaff.id, disbDrawer.month);
        const [yr, mn] = disbDrawer.month.split('-').map(Number);
        const monthLabel = `${MONTHS[mn - 1]} ${yr}`;
        const f = disbDrawer.form;
        const needsRef = ['bank', 'cheque', 'upi'].includes(f.mode);
        return (
          <div
            onClick={() => setDisbDrawer(p => ({ ...p, open: false }))}
            style={{
              position: 'fixed', inset: 0, zIndex: 10001,
              background: 'rgba(10, 22, 40, 0.55)', backdropFilter: 'blur(6px)',
              display: 'flex', justifyContent: 'flex-end',
              animation: 'staffFadeIn 0.18s ease-out',
            }}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                width: '560px', maxWidth: '100vw', height: '100%',
                background: 'white', display: 'flex', flexDirection: 'column',
                boxShadow: '-12px 0 32px rgba(15,23,42,0.22)',
                animation: 'staffSlideIn 0.28s cubic-bezier(0.16, 1, 0.3, 1)',
              }}
            >
              {/* Drawer header */}
              <div style={{ padding: '22px 28px', background: 'linear-gradient(135deg, #0a1628 0%, #1e3a5f 100%)', color: 'white', position: 'relative', overflow: 'hidden' }}>
                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '3px', background: 'linear-gradient(90deg, transparent, #d4a017 30%, #f5d76e 50%, #d4a017 70%, transparent)' }} />
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
                  <div>
                    <div style={{ fontSize: '10px', fontWeight: 700, color: '#d4a017', letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: '4px' }}>
                      Disburse Salary
                    </div>
                    <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 800, letterSpacing: '-0.3px' }}>{monthLabel}</h2>
                    <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.6)', fontWeight: 500, marginTop: '4px' }}>{selectedStaff.name}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setDisbDrawer(p => ({ ...p, open: false }))}
                    aria-label="Close"
                    style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', color: 'white', cursor: 'pointer', fontSize: '16px', lineHeight: 1 }}
                  >×</button>
                </div>
              </div>

              {/* Form body */}
              <div style={{ flex: 1, overflowY: 'auto', padding: '22px 28px', display: 'flex', flexDirection: 'column', gap: '22px' }}>

                {/* Pay summary card */}
                <div style={{ background: '#f8fafc', border: '1px solid #e8edf2', borderRadius: '14px', padding: '16px 18px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#64748b', marginBottom: '8px' }}>
                    <span>Structure net</span>
                    <span style={{ fontWeight: 700, color: '#0a1628' }}>₹{payroll.net.toLocaleString()}</span>
                  </div>
                  {payroll.lwpDays > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#9a3412', marginBottom: '8px' }}>
                      <span>
                        LWP {payroll.lwpDays}d × ₹{payroll.perDayRate.toLocaleString()}
                        {payroll.lwpLeaveInMonth > 0 && <span style={{ marginLeft: '4px', opacity: 0.7 }}>(incl. {payroll.lwpLeaveInMonth}d leave over quota)</span>}
                      </span>
                      <span style={{ fontWeight: 700 }}>− ₹{payroll.lwpDeduction.toLocaleString()}</span>
                    </div>
                  )}
                  <div style={{ borderTop: '1px dashed #e2e8f0', marginTop: '8px', paddingTop: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '10px', fontWeight: 800, color: '#15803d', letterSpacing: '1px', textTransform: 'uppercase' }}>Payable now</span>
                    <span style={{ fontSize: '20px', fontWeight: 900, color: '#15803d' }}>₹{payroll.proRatedNet.toLocaleString()}</span>
                  </div>
                </div>

                {/* Payment mode */}
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                    <span style={{ width: '6px', height: '20px', borderRadius: '3px', background: '#0f52ba' }} />
                    <SectionLabel>Payment mode</SectionLabel>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px' }}>
                    {PAYMENT_MODES.map(m => {
                      const active = f.mode === m.id;
                      return (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => setDisbDrawer(p => ({ ...p, form: { ...p.form, mode: m.id } }))}
                          style={{
                            padding: '12px 6px', borderRadius: '11px',
                            border: `1.5px solid ${active ? '#d4a017' : '#e2e8f0'}`,
                            background: active ? '#fff8e6' : 'white',
                            cursor: 'pointer', textAlign: 'center',
                            transition: 'all 0.12s',
                            boxShadow: active ? '0 4px 12px rgba(212,160,23,0.18)' : 'none',
                          }}
                        >
                          <div style={{ fontSize: '20px', marginBottom: '4px' }}>{m.icon}</div>
                          <div style={{ fontSize: '10px', fontWeight: 800, color: active ? '#0a1628' : '#64748b' }}>{m.label}</div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Reference + Paid On */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 180px', gap: '14px' }}>
                  <FieldGroup>
                    <FieldLabel required={needsRef}>
                      {f.mode === 'bank' ? 'Bank reference / UTR' : f.mode === 'cheque' ? 'Cheque number' : f.mode === 'upi' ? 'UPI transaction ID' : 'Reference (optional)'}
                    </FieldLabel>
                    <TextInput
                      value={f.reference}
                      onChange={(v) => setDisbDrawer(p => ({ ...p, form: { ...p.form, reference: v } }))}
                      placeholder={f.mode === 'cash' ? 'e.g. Voucher #234' : 'e.g. UTR / Txn ID'}
                    />
                  </FieldGroup>
                  <FieldGroup>
                    <FieldLabel required>Paid on</FieldLabel>
                    <input
                      type="date"
                      value={f.paidOnDate}
                      onChange={(e) => setDisbDrawer(p => ({ ...p, form: { ...p.form, paidOnDate: e.target.value } }))}
                      style={{ width: '100%', padding: '10px 12px', borderRadius: '10px', border: '1px solid #e2e8f0', fontSize: '13px', outline: 'none', boxSizing: 'border-box', color: '#0a1628', background: 'white' }}
                    />
                  </FieldGroup>
                </div>

                {/* Notes */}
                <FieldGroup>
                  <FieldLabel>Notes <span style={{ fontWeight: 500, color: '#94a3b8' }}>(optional)</span></FieldLabel>
                  <textarea
                    value={f.notes}
                    onChange={(e) => setDisbDrawer(p => ({ ...p, form: { ...p.form, notes: e.target.value } }))}
                    rows={3}
                    placeholder="Internal note that appears on the payslip…"
                    style={{ width: '100%', padding: '10px 12px', borderRadius: '10px', border: '1px solid #e2e8f0', fontSize: '13px', outline: 'none', boxSizing: 'border-box', color: '#0a1628', resize: 'vertical', fontFamily: 'inherit' }}
                  />
                </FieldGroup>
              </div>

              {/* Sticky footer */}
              <div style={{ padding: '14px 28px', borderTop: '1px solid #e2e8f0', display: 'flex', gap: '10px', alignItems: 'center', background: 'white' }}>
                <div style={{ flex: 1 }} />
                <button
                  type="button"
                  onClick={() => setDisbDrawer(p => ({ ...p, open: false }))}
                  style={{ padding: '10px 16px', borderRadius: '10px', border: '1px solid #e2e8f0', background: 'white', color: '#0a1628', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}
                >Cancel</button>
                <button
                  type="button"
                  onClick={() => submitDisbursement(false)}
                  style={{ padding: '10px 16px', borderRadius: '10px', border: '1px solid #d4a017', background: 'white', color: '#0a1628', fontSize: '12px', fontWeight: 800, cursor: 'pointer', letterSpacing: '0.3px' }}
                >Mark paid</button>
                <button
                  type="button"
                  onClick={() => submitDisbursement(true)}
                  style={{
                    padding: '10px 18px', borderRadius: '10px', border: 'none',
                    background: 'linear-gradient(135deg, #d4a017 0%, #b8860b 100%)',
                    color: '#0a1628', fontSize: '12px', fontWeight: 800, cursor: 'pointer',
                    letterSpacing: '0.3px',
                    boxShadow: '0 6px 18px rgba(212, 160, 23, 0.35)',
                  }}
                >🖨 Pay & print slip</button>
              </div>
            </div>
          </div>
        );
      })()}

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
                  {staffDrawer.form.id && staffDrawer.form.employeeCode && (
                    <span style={{ display: 'inline-block', marginTop: '8px', fontSize: '10px', fontWeight: 800, color: '#d4a017', background: 'rgba(212,160,23,0.12)', border: '1px solid rgba(212,160,23,0.3)', padding: '3px 8px', borderRadius: '6px', letterSpacing: '0.5px', fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace' }}>
                      {staffDrawer.form.employeeCode}
                    </span>
                  )}
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

