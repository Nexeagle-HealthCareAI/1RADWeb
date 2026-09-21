import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import apiClient, { BASE_URL } from '../api/apiClient';
import useAuth from '../auth/useAuth';
import { ROLE_LABELS, getCustomRoles, getRoleLabel } from '../data/roles';
import useOffline from '../hooks/useOffline';
import { nativeStorage } from '../hooks/useElectron';
import { snapshotPersonnel, watchPersonnel } from '../db/repos/personnelRepo';
import useFinanceRevision from '../hooks/useFinanceRevision';
import { buildPatientAge } from '../utils/patientAge';
import '../styles/global.css';
import '../styles/AdminBoard.css';
import PrescriptionPreview from '../components/PrescriptionPreview';
import FinanceManager from '../components/FinanceManager';
import RolesAndPermissions from '../components/RolesAndPermissions';
import { notifyToast } from '../utils/toast';
import { celebrate } from '../utils/celebrate';
import * as XLSX from 'xlsx-js-style';
import DoctorLinkSendSheet from './referrals/DoctorLinkSendSheet';
import DoctorLinksView from './referrals/DoctorLinksView';
import { getReferrerProfileCompletion, completionColor } from './referrals/referrerProfile';
import { sortArrow } from './referrals/sortArrow';
import { getISODate, getOverviewDates } from './referrals/dateRanges';
import ReferrerEditDrawer from './referrals/ReferrerEditDrawer';
import { UnmergeReferrerModal, DeleteReferrerModal, MergeReferrerModal } from './referrals/ReferrerLifecycleModals';
import PatientEditDrawer from './referrals/PatientEditDrawer';
import ReferralIntelligencePanel from './referrals/ReferralIntelligencePanel';


// --- HELPERS ---
const TODAY = getISODate(0);
const YESTERDAY = getISODate(1);

// --- MOCK DATA ---
const INITIAL_LAYOUTS = [];
const REFERRAL_LOG = [];
const DAILY_VOLUME_MOCK = [];
const MODALITY_STATS_MOCK = [];
const MODALITY_DAILY_TREND_MOCK = [];
const STAFF_PERFORMANCE_MOCK = [];

const SECTIONS_POOL = [
  { id: 'history', name: 'Clinical History' },
  { id: 'technique', name: 'Technique' },
  { id: 'findings', name: 'Findings' },
  { id: 'impression', name: 'Impression' },
  { id: 'advice', name: 'Advice' },
  { id: 'recommendation', name: 'Recommendation' },
  { id: 'comparison', name: 'Comparison' },
  { id: 'notes', name: 'Notes' }
];

export default function ReferralsPage() {
  const { currentUser, logout, activeCenter, centers, switchCenter, refreshCenters, createCenter, subscription, refreshSubscription } = useAuth();
  const { isOnline, addToOutbox } = useOffline();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('Referrals');
  const [layouts, setLayouts] = useState(INITIAL_LAYOUTS);
  const [patients, setPatients] = useState([]);
  const [patientSearch, setPatientSearch] = useState('');
  const [personnelSearch, setPersonnelSearch] = useState('');
  const [referralMatrixSearch, setReferralMatrixSearch] = useState('');
  const [referralLogSearch, setReferralLogSearch] = useState('');
  const [referralRosterSearch, setReferralRosterSearch] = useState('');
  const [referralPatientsSearch, setReferralPatientsSearch] = useState('');
  // Column sorting for the Partner Network (ROSTER) and Patient Section (PATIENTS)
  // index tables. { key, dir }. Click a header to sort; click again to flip.
  const [rosterSort, setRosterSort] = useState({ key: 'patientCount', dir: 'desc' });
  const [masterSort, setMasterSort] = useState({ key: 'registeredAt', dir: 'desc' });
  const [linksSort, setLinksSort] = useState({ key: 'name', dir: 'asc' });
  const toggleRosterSort = (key) => setRosterSort(s => (s.key === key ? { key, dir: s.dir === 'desc' ? 'asc' : 'desc' } : { key, dir: 'desc' }));
  const toggleMasterSort = (key) => setMasterSort(s => (s.key === key ? { key, dir: s.dir === 'desc' ? 'asc' : 'desc' } : { key, dir: 'desc' }));
  const toggleLinksSort = (key) => setLinksSort(s => (s.key === key ? { key, dir: s.dir === 'desc' ? 'asc' : 'desc' } : { key, dir: 'asc' }));
  const [referralViewMode, setReferralViewMode] = useState('MATRIX'); // 'MATRIX' or 'LOG'
  const [matrixPeriod, setMatrixPeriod] = useState('WEEK'); // 'DAY', 'WEEK', 'MONTH', 'YEAR'
  // Lazy-init both so a tab kept open overnight still picks up today's
  // actual date on mount (vs. the frozen module-load TODAY constant).
  const [matrixDateStr, setMatrixDateStr] = useState(() => getISODate(0));
  // Default to the week-of-month that contains today, not always Week 1.
  // ceil(day/7) maps days 1-7 → 1, 8-14 → 2, 15-21 → 3, 22+ → 4. Clamp to
  // 4 since the matrix only defines four week columns.
  const [matrixWeekIndex, setMatrixWeekIndex] = useState(() => {
    const day = new Date().getDate();
    return Math.min(4, Math.ceil(day / 7));
  });
  
  // Dashboard Filters
  const [selectedDateFilter, setSelectedDateFilter] = useState(TODAY);
  const [referrerFilter, setReferrerFilter] = useState('ALL');
  const [personTypeFilter, setPersonTypeFilter] = useState('ALL'); // ALL | DOCTOR | OTHER | SELF (#2)
  const [overviewTimeframe, setOverviewTimeframe] = useState('ALL'); // 'DAY', 'WEEK', 'MONTH', 'YEAR', 'ALL'
  
  // Layout Builder State
  const [isLayoutDrawerOpen, setIsLayoutDrawerOpen] = useState(false);
  const [editLayout, setEditLayout] = useState({ name: '', modality: 'X-RAY', type: '', active: true, selectedSections: ['findings', 'impression'] });

  // User Management State
  const [isUserDrawerOpen, setIsUserDrawerOpen] = useState(false);
  const [isHospitalDrawerOpen, setIsHospitalDrawerOpen] = useState(false);
  const [isChainDrawerOpen, setIsChainDrawerOpen] = useState(false);
  const [isDeployingChain, setIsDeployingChain] = useState(false);
  const [newChainData, setNewChainData] = useState({ chainName: '', hospitalName: '', hospitalAddress: '' });
  const [showChainSelector, setShowChainSelector] = useState(false);
  const [isSwitcherOpen, setIsSwitcherOpen] = useState(false);
  const [isSwitchingNode, setIsSwitchingNode] = useState(false);
  const [userRegStep, setUserRegStep] = useState(1);
  const [editUser, setEditUser] = useState(null);
  const [selectedDocId, setSelectedDocId] = useState('');
  const [settings, setSettings] = useState({ allowCustom: true, lockApproved: false, reqFindings: true, reqImpression: true });
  const [showPasswords, setShowPasswords] = useState(false);
  const [sharingUser, setSharingUser] = useState(null);
  const [copyFeedback, setCopyFeedback] = useState('');

  // Custom Sections Registry
  const [customSections, setCustomSections] = useState([]);
  const [newSectionName, setNewSectionName] = useState('');

  // Referral Intel State
  // Lazy init with the CURRENT calendar week (Mon → Sun) so the date inputs
  // reflect the active week the moment the page mounts. We reuse the same
  // helper the Strategic Outlook timeframe selector uses so D / R / Week
  // semantics never drift apart.
  const [referralRange, setReferralRange] = useState(() => {
    const { start, end } = getOverviewDates('WEEK');
    return { start, end };
  });
  const [isImporting, setIsImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const [patientMasterList, setPatientMasterList] = useState([]);
  const [loadingMaster, setLoadingMaster] = useState(false);
  // Default to RANGE — current week. The Case Ledger lands pre-filtered to
  // this week's cases instead of forcing the user to pick a range manually.
  const [referralFilterMode, setReferralFilterMode] = useState('RANGE'); // 'SINGLE', 'RANGE' or 'ALL'
  const [expandedReferrer, setExpandedReferrer] = useState(null);
  const [personnel, setPersonnel] = useState([]);
  const [referralIntelligence, setReferralIntelligence] = useState([]);
  const [allReferrers, setAllReferrers] = useState([]);
  const [referralLoading, setReferralLoading] = useState(false);
  // Live-data health for the intelligence/roster fetch: last error (null when the
  // latest load succeeded) and when the figures on screen were last confirmed.
  const [referralError, setReferralError] = useState(null);
  const [referralUpdatedAt, setReferralUpdatedAt] = useState(null);
  const intelSeq = useRef(0);
  const [personnelLoading, setPersonnelLoading] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [referralSort, setReferralSort] = useState({ key: 'missions', direction: 'desc' });
  
  // Referral Payout State
  const [showExportOverlay, setShowExportOverlay] = useState(false);
  const [exportParams, setExportParams] = useState({ start: TODAY, end: TODAY, allTime: false });
  const [loading, setLoading] = useState(false);

  // Responsive layout detection
  const [isMobile, setIsMobile] = useState(window.innerWidth < 1024);
  const [windowWidth, setWindowWidth] = useState(window.innerWidth);

  // Bumps when cached finance data changes; added to the analytics fetch
  // effects below so the referral/finance dashboards refresh themselves.
  const financeRev = useFinanceRevision();
  const [billingSettings, setBillingSettings] = useState({ autoBill: false, currency: '₹' });

  // Prescription Architect State
  const [selectedPrescriptionDoctorId, setSelectedPrescriptionDoctorId] = useState('');
  const [doctorPrescriptionMap, setDoctorPrescriptionMap] = useState({}); // { docId: settings }
  
  const [prescriptionSettings, setPrescriptionSettings] = useState({
    headerMargin: 50,
    leftMargin: 20,
    rightMargin: 20,
    bottomMargin: 30,
    fontSize: 14,
    fontColor: '#1e293b',
    fontFamily: 'Inter',
    letterhead: null,
    overflowBackgroundMode: 'REUSE' // 'REUSE' or 'BLANK'
  });
  const [isPrescriptionSaving, setIsPrescriptionSaving] = useState(false);
  const [isProtocolLoading, setIsProtocolLoading] = useState(false);
  const [activeProtocolData, setActiveProtocolData] = useState(null);
  const [previewScale, setPreviewScale] = useState(0.8); // 80% default scale to fit screen
  const [numPdfPages, setNumPdfPages] = useState(null);
  const [pdfError, setPdfError] = useState(null);
  const [isReferrerEditDrawerOpen, setIsReferrerEditDrawerOpen] = useState(false);
  const [editingReferrer, setEditingReferrer] = useState(null);
  // ── Bulk-add partners (#21): Excel upload only ───────────────────────────
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkRows, setBulkRows] = useState([]);   // populated by the Excel upload
  const [bulkSubmitting, setBulkSubmitting] = useState(false);
  const [bulkResult, setBulkResult] = useState(null);

  // ── Doctor portal share-links (#3) ───────────────────────────────────────
  // Now a dedicated "Doctor Links" tab (was a modal). The send flow captures a
  // missing email / mobile inline and lets the user pick the channel.
  const [linksBusy, setLinksBusy] = useState(false);
  const [referralLinksSearch, setReferralLinksSearch] = useState('');
  const [linkSend, setLinkSend] = useState(null); // { doctor, channel, email, contact, saving, err }
  const [selectedLinks, setSelectedLinks] = useState(() => new Set()); // referrerIds checked in Doctor Links
  const [bulkSend, setBulkSend] = useState(null); // null | { status:'sending'|'done', channel, sent, skipped, failed }
  const doctorList = useMemo(
    () => (allReferrers || []).filter(r => r.isDoctor !== false && (r.name || '').trim().toLowerCase() !== 'self'),
    [allReferrers]
  );
  const linkBtn = (fg, bg, bd, disabled) => ({ padding: '7px 11px', borderRadius: '9px', border: `1px solid ${bd}`, background: disabled ? '#f1f5f9' : bg, color: disabled ? '#cbd5e1' : fg, fontSize: '11px', fontWeight: 800, cursor: disabled ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap' });
  const buildDoctorLink = async (referrerId) => {
    const { data } = await apiClient.get(`/referrers/${referrerId}/share-link`);
    return `${window.location.origin}/r/${referrerId}?t=${data.token}`;
  };
  const copyDoctorLink = async (referrerId) => {
    try { 
      const link = await buildDoctorLink(referrerId);
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(link);
      } else {
        const textArea = document.createElement('textarea');
        textArea.value = link;
        // Move outside of viewport
        textArea.style.position = 'fixed';
        textArea.style.left = '-999999px';
        textArea.style.top = '-999999px';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        try {
          document.execCommand('copy');
        } finally {
          textArea.remove();
        }
      }
      notifyToast('Link copied ✓', 'success'); 
    }
    catch (err) { 
      console.error('Link generation/copy error:', err);
      notifyToast('Could not generate or copy the link.', 'error'); 
    }
  };
  // One-click WhatsApp send via NexEagle's WhatsApp Business API: the link is
  // delivered server-side straight to the doctor's number (no app hand-off).
  // Needs an approved "referral_portal" template in Meta — friendlyWaError turns
  // the raw gateway response into one actionable line if it isn't live yet.
  const friendlyWaError = (raw) => {
    const s = String(raw || '');
    if (/WHATSAPP_DISABLED/i.test(s)) return 'WhatsApp messaging is turned off in settings.';
    if (/template/i.test(s) || /13200[01]|131009|13101\d/i.test(s)) return 'The “referral_portal” WhatsApp template isn’t approved yet in Meta. Approve it, then try again.';
    return 'WhatsApp gateway rejected the message — please check the WhatsApp setup.';
  };
  const whatsappDoctors = async (ids) => {
    if (!ids.length) { notifyToast('No doctor with a mobile number to message.', 'error'); return null; }
    setLinksBusy(true);
    try {
      const { data } = await apiClient.post('/referrers/send-links-whatsapp', { referrerIds: ids, baseUrl: window.location.origin });
      const noC = data.noContact?.length || 0;
      const fail = data.failed?.length || 0;
      if (data.sent > 0) {
        notifyToast(`WhatsApp sent to ${data.sent}${noC ? ` · ${noC} skipped (no mobile)` : ''}${fail ? ` · ${fail} failed` : ''}.`, 'success');
      } else if (fail > 0) {
        notifyToast(friendlyWaError(data.error), 'error');
      } else if (noC > 0) {
        notifyToast('No mobile number on file for the selected doctor(s).', 'info');
      } else {
        notifyToast('Nothing to send.', 'info');
      }
      return data;
    } catch (e) {
      notifyToast(e?.response?.data?.error || 'Could not send on WhatsApp.', 'error');
      return null;
    } finally { setLinksBusy(false); }
  };
  const emailDoctors = async (ids) => {
    if (!ids.length) { notifyToast('No doctors to email.', 'error'); return null; }
    setLinksBusy(true);
    try {
      const { data } = await apiClient.post('/referrers/send-links', { referrerIds: ids, baseUrl: window.location.origin });
      notifyToast(`Emailed ${data.sent}${data.skipped ? ` · ${data.skipped} skipped (no email)` : ''}.`, data.sent > 0 ? 'success' : 'info');
      return data;
    } catch (e) {
      notifyToast(e?.response?.data?.error || 'Could not send emails.', 'error');
      return null;
    } finally { setLinksBusy(false); }
  };

  // ── Doctor-link multi-select + bulk send ──────────────────────────────────
  // Select many / all / a few doctors, then send their portal links in one go.
  // bulkSend drives the loading→success modal (with a celebration on success).
  const toggleLinkSel = (id) => setSelectedLinks(prev => {
    const n = new Set(prev);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });
  const sendSelectedLinks = async (channel) => {
    const ids = [...selectedLinks];
    if (!ids.length) { notifyToast('Select at least one doctor first.', 'info'); return; }
    setBulkSend({ status: 'sending', channel });
    const data = channel === 'email' ? await emailDoctors(ids) : await whatsappDoctors(ids);
    if (!data) { setBulkSend(null); return; } // error already surfaced by the sender
    const sent = Number(data.sent) || 0;
    const skipped = channel === 'email' ? (Number(data.skipped) || 0) : (data.noContact?.length || 0);
    const failed = channel === 'email' ? 0 : (data.failed?.length || 0);
    setBulkSend({ status: 'done', channel, sent, skipped, failed });
    if (sent > 0) celebrate();
    setSelectedLinks(new Set());
  };

  // Persist a newly-entered email / mobile onto the doctor's profile. Sends the
  // full name+profile (PUT replaces) so existing fields are preserved.
  const saveDoctorContact = async (d, { email, contact }) => {
    await apiClient.put(`/referrers/${d.referrerId}`, {
      referrerId: d.referrerId,
      name: d.name,
      contact: (contact ?? d.contact ?? '').replace(/\D/g, ''),
      address: d.address || '',
      email: (email ?? d.email ?? '').trim(),
      specialty: d.specialty || '',
      degree: d.degree || '',
      isDoctor: d.isDoctor !== false,
      supportedByDoctor: d.isDoctor === false ? (d.supportedByDoctor || '') : '',
    });
  };

  // Open the send sheet. `prefer` forces a channel (used by the per-doctor
  // "+ Add mobile / + Add email" affordances); otherwise default to whichever
  // channel we can already reach.
  const openLinkSend = (d, prefer) => {
    const channel = prefer || (d.email ? 'email' : (d.contact ? 'whatsapp' : 'email'));
    setLinkSend({ doctor: d, channel, email: d.email || '', contact: d.contact || '', saving: false, err: '' });
  };

  // Save any newly-filled contact, then deliver the link via the chosen channel.
  const submitLinkSend = async () => {
    if (!linkSend) return;
    const { doctor, channel, email, contact } = linkSend;
    if (channel === 'email' && !(email || '').trim()) { setLinkSend(s => ({ ...s, err: 'Enter an email address to send.' })); return; }
    if (channel === 'whatsapp' && (contact || '').replace(/\D/g, '').length < 10) { setLinkSend(s => ({ ...s, err: 'Enter a valid 10-digit mobile number.' })); return; }
    setLinkSend(s => ({ ...s, saving: true, err: '' }));
    try {
      const emailChanged = (email || '').trim() !== (doctor.email || '').trim();
      const contactChanged = (contact || '').replace(/\D/g, '') !== (doctor.contact || '').replace(/\D/g, '');
      if (emailChanged || contactChanged) {
        await saveDoctorContact(doctor, { email, contact });
        fetchReferralIntelligence(); // refresh the roster so the new contact sticks
      }
      if (channel === 'email') await emailDoctors([doctor.referrerId]);
      else await whatsappDoctors([doctor.referrerId]);
      setLinkSend(null);
    } catch (e) {
      setLinkSend(s => ({ ...s, saving: false, err: e?.response?.data?.error || 'Could not send. Please try again.' }));
    }
  };

  const openBulkAdd = () => { setBulkRows([]); setBulkResult(null); setBulkOpen(true); };

  const downloadBulkTemplate = () => {
    const ws = XLSX.utils.aoa_to_sheet([
      ['Name', 'Contact', 'IsDoctor (Yes/No)', 'Specialty', 'Degree', 'Email', 'Address', 'SupportedByDoctor'],
      ['Dr A Sharma', '9876543210', 'Yes', 'Radiology', 'MD', '', '', ''],
      ['Rahul Kumar', '9000000000', 'No', '', '', '', '', 'Dr A Sharma'],
    ]);
    ws['!cols'] = [{ wch: 22 }, { wch: 14 }, { wch: 18 }, { wch: 16 }, { wch: 10 }, { wch: 18 }, { wch: 20 }, { wch: 20 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Partners');
    const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([wbout], { type: 'application/octet-stream' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'partner_upload_template.xlsx';
    a.click();
    window.URL.revokeObjectURL(url);
    notifyToast('Template download started — check your downloads, fill it in, then choose the file.', 'success');
  };

  const parseBulkExcel = async (file) => {
    if (!file) return;
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      const json = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' });
      const get = (row, keys) => {
        for (const k of Object.keys(row)) {
          if (keys.includes(k.toLowerCase().replace(/[^a-z]/g, ''))) return String(row[k] ?? '').trim();
        }
        return '';
      };
      const rows = json.map(r => {
        const doc = get(r, ['isdoctor', 'isdoctoryesno', 'doctor']).toLowerCase();
        return {
          name: get(r, ['name', 'partnername', 'fullname']),
          contact: get(r, ['contact', 'mobile', 'phone']),
          specialty: get(r, ['specialty', 'speciality']),
          degree: get(r, ['degree']),
          email: get(r, ['email']),
          address: get(r, ['address']),
          supportedByDoctor: get(r, ['supportedbydoctor', 'forwhichdoctor']),
          isDoctor: !(['no', 'n', 'false', '0'].includes(doc)),
        };
      }).filter(r => r.name);
      if (rows.length === 0) { notifyToast('No partner rows found — use the template headers.', 'error'); return; }
      setBulkRows(rows);
      setBulkResult(null);
      notifyToast(`${rows.length} partner${rows.length === 1 ? '' : 's'} loaded — review, then Add.`, 'success');
    } catch {
      notifyToast('Could not read that Excel file. Please use the template.', 'error');
    }
  };

  const submitBulkAdd = async () => {
    const payload = bulkRows
      .filter(r => (r.name || '').trim())
      .map(r => ({
        name: r.name.trim(), contact: (r.contact || '').trim() || null, address: (r.address || '').trim() || null,
        email: (r.email || '').trim() || null, specialty: (r.specialty || '').trim() || null, degree: (r.degree || '').trim() || null,
        isDoctor: r.isDoctor !== false, supportedByDoctor: (r.supportedByDoctor || '').trim() || null,
      }));
    if (payload.length === 0) { notifyToast('Add at least one partner name first.', 'error'); return; }
    setBulkSubmitting(true);
    try {
      const res = await apiClient.post('/referrers/bulk', { referrers: payload });
      const r = res.data || { created: payload.length, merged: 0, skipped: 0 };
      setBulkResult(r);
      fetchReferralIntelligence();

      // Smooth journey: close the modal and surface a clear summary so the user
      // knows exactly what happened (how many new, merged into existing, skipped).
      const created = Number(r.created) || 0;
      const merged  = Number(r.merged)  || 0;
      const skipped = Number(r.skipped) || 0;
      const total   = created + merged + skipped;
      const parts = [];
      if (created) parts.push(`${created} added`);
      if (merged)  parts.push(`${merged} merged into existing`);
      if (skipped) parts.push(`${skipped} skipped`);
      const summary = parts.length ? parts.join(' · ') : 'no changes';
      // success when everything landed; info when some rows were skipped but
      // others applied; error when nothing could be added.
      const tone = skipped === 0 ? 'success' : (created + merged > 0 ? 'info' : 'error');
      notifyToast(`Partners imported — ${summary} (of ${total} row${total === 1 ? '' : 's'}).`, tone);

      setBulkOpen(false);
      setBulkRows([]);
    } catch (e) {
      notifyToast(e?.response?.data?.error || e?.response?.data?.message || 'Could not add partners.', 'error');
    } finally {
      setBulkSubmitting(false);
    }
  };
  const [isSavingReferrer, setIsSavingReferrer] = useState(false);

  const [isPatientEditDrawerOpen, setIsPatientEditDrawerOpen] = useState(false);
  const [editingPatient, setEditingPatient] = useState(null);
  const [isSavingPatient, setIsSavingPatient] = useState(false);
  const [isTestMode, setIsTestMode] = useState(false);

  // Partner merge state
  const [isMergeModalOpen, setIsMergeModalOpen] = useState(false);
  const [targetReferrerId, setTargetReferrerId] = useState('');
  const [isMerging, setIsMerging] = useState(false);
  const [deleteAfterMerge, setDeleteAfterMerge] = useState(false);
  const [unmergeModalData, setUnmergeModalData] = useState(null);
  const [isUnmerging, setIsUnmerging] = useState(false);
  const [deleteModalData, setDeleteModalData] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [selectedLedgerRows, setSelectedLedgerRows] = useState([]);
  const toggleLedgerSelection = (id) => {
    setSelectedLedgerRows(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const handleExportLedger = (type) => {
    const selectedData = referralIntelligence.flatMap(r => r.patients).filter(p => selectedLedgerRows.includes(p.appointmentId || p.patientId));
    if (selectedData.length === 0) return;

    if (type === 'EXCEL') {
        let csv = "REFERRAL_ID,PATIENT,CONTACT,MODALITY,SERVICE,COMMISSION,STATUS,DATE,ADDRESS,SOURCE_OF_INFO\n";
        selectedData.forEach(p => {
            const addressStr = [p.address, p.village, p.district].filter(Boolean).join(', ');
            const escapedAddress = `"${addressStr.replace(/"/g, '""')}"`;
            const escapedSource = `"${(p.sourceOfInfo || '').replace(/"/g, '""')}"`;
            csv += `${p.patientIdentifier || 'N/A'},"${p.name}",${p.mobile},${p.modality},"${p.service}",${p.commissionAmount},${p.status},${p.registrationDate},${escapedAddress},${escapedSource}\n`;
        });
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Referral_Ledger_${new Date().toISOString().slice(0,10)}.csv`;
        a.click();
    } else if (type === 'WHATSAPP') {
        let msg = `*REFERRAL CASE LEDGER REPORT*\n\n`;
        selectedData.forEach((p, i) => {
            msg += `${i+1}. *${p.name.toUpperCase()}* (${p.modality})\n   ID: ${p.patientIdentifier || 'N/A'}\n   Service: ${p.service}\n   Payout: ₹${p.commissionAmount}\n   Status: ${p.status}\n\n`;
        });
        window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank', 'noopener,noreferrer');
    }
  };

  const isAllLedgerSelected = (patients) => {
    return patients.length > 0 && patients.every(p => selectedLedgerRows.includes(p.appointmentId || p.patientId));
  };
  const toggleAllLedger = (patients) => {
    if (isAllLedgerSelected(patients)) {
      const ids = patients.map(p => p.appointmentId || p.patientId);
      setSelectedLedgerRows(prev => prev.filter(id => !ids.includes(id)));
    } else {
      const ids = patients.map(p => p.appointmentId || p.patientId);
      setSelectedLedgerRows(prev => [...new Set([...prev, ...ids])]);
    }
  };

  const handleExportMatrix = () => {
    if (!temporalMatrixData) return;
    
    // Headers with quotes to prevent breakage
    const headers = ["REFERRING SOURCE", ...temporalMatrixData.cols, "TOTAL PULL"];
    let csv = headers.map(h => `"${h}"`).join(",") + "\n";

    // Row data
    temporalMatrixData.rows.forEach(row => {
      const rowData = [
        `"${row.name || 'ANONYMOUS'}"`,
        ...temporalMatrixData.cols.map(c => row.counts[c] || 0),
        row.total
      ];
      csv += rowData.join(",") + "\n";
    });

    // Grand Totals Row
    if (temporalMatrixData.rows.length > 0) {
      const colTotals = temporalMatrixData.cols.map(c => 
        temporalMatrixData.rows.reduce((sum, r) => sum + (r.counts[c] || 0), 0)
      );
      const grandTotal = temporalMatrixData.rows.reduce((sum, r) => sum + r.total, 0);
      
      const footerData = [
        `"GRAND TOTAL"`,
        ...colTotals,
        grandTotal
      ];
      csv += footerData.join(",") + "\n";
    }
    
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Referral_Matrix_${matrixPeriod}_${matrixDateStr}_${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
  };

  const handleExportRoster = () => {
    if (!caseLedgerList || caseLedgerList.length === 0) {
      notifyToast('No partners to export yet.', 'info');
      return;
    }
    // Plain, complete headers — every detail a partner row carries.
    const headers = [
      'Rank', 'Partner Name', 'Type', 'Speciality', 'Degree', 'Supporting Doctor',
      'Email', 'Contact Number', 'Address', 'Total Studies', 'Total Revenue',
      'Total Commission', 'Total Paid Incentive', 'Unpaid Commission',
    ];
    const cell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    let csv = headers.join(',') + '\n';
    caseLedgerList.forEach((s, i) => {
      const type = s.isDoctor ? 'Doctor' : 'Other person';
      const spec = s.isDoctor ? (s.specialty || '') : '';
      const deg = s.isDoctor ? (s.degree || '') : '';
      const supp = !s.isDoctor ? (s.supportedByDoctor || '') : '';
      csv += [
        i + 1, cell(s.name), cell(type), cell(spec), cell(deg), cell(supp),
        cell(s.email), cell(s.contact), cell(s.address),
        s.patientCount || 0, s.totalRevenue || 0, s.totalCommission || 0,
        s.paidCommission || 0, s.unpaidCommission || 0,
      ].join(',') + '\n';
    });
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Partner_Network_${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    // Release the object URL once the download has spooled (avoids a leak).
    setTimeout(() => window.URL.revokeObjectURL(url), 1000);
    notifyToast(`Download started — ${caseLedgerList.length} partner${caseLedgerList.length === 1 ? '' : 's'} exported to Excel (CSV).`, 'success');
  };

  const handleExportPatientMasterList = () => {
    if (!patientMasterList || patientMasterList.length === 0) {
      notifyToast('No patients to export yet.', 'info');
      return;
    }
    const headers = ['ID', 'PTID', 'Full Name', 'Mobile', 'Age', 'Gender', 'Address', 'Source Of Info', 'Registered Date'];
    const cell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    let csv = headers.join(',') + '\n';
    patientMasterList.forEach((p, i) => {
      const addressStr = [p.address, p.village, p.district].filter(Boolean).join(', ');
      csv += [
        i + 1, cell(p.patientIdentifier), cell(p.fullName), cell(p.mobile),
        p.age || '', cell(p.gender), cell(addressStr), cell(p.sourceOfInfo),
        cell(new Date(p.registeredAt).toLocaleDateString())
      ].join(',') + '\n';
    });
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Patient_Master_${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    setTimeout(() => window.URL.revokeObjectURL(url), 1000);
    notifyToast(`Download started — ${patientMasterList.length} patient${patientMasterList.length === 1 ? '' : 's'} exported to Excel (CSV).`, 'success');
  };

  // Sync settings when doctor selection changes
  const fetchDoctorProtocol = useCallback(async (docId) => {
    if (!docId) {
      setPrescriptionSettings({
        headerMargin: 50, leftMargin: 20, rightMargin: 20, bottomMargin: 30,
        fontSize: 14, fontColor: '#1e293b', fontFamily: 'Inter', letterhead: null,
        letterheadFile: null, overflowBackgroundMode: 'REUSE'
      });
      setActiveProtocolData(null);
      return;
    }

    setIsProtocolLoading(true);
    try {
      const res = await apiClient.get(`/Prescription/${docId}`);
      if (res.data?.success && res.data?.data) {
        const data = res.data.data;
        setActiveProtocolData(data);
        const settings = {
          headerMargin: Number(data.headerMargin) || 50,
          leftMargin: Number(data.leftMargin) || 20,
          rightMargin: Number(data.rightMargin) || 20,
          bottomMargin: Number(data.bottomMargin) || 30,
          fontSize: Number(data.fontSize) || 14,
          fontColor: data.fontColor || '#1e293b',
          fontFamily: data.fontFamily || 'Inter',
          letterhead: data.letterheadBlobUrl || null,
          overflowBackgroundMode: data.overflowBackgroundMode || 'REUSE',
          letterheadFile: null
        };
        setPrescriptionSettings(settings);
        await nativeStorage.set(`1rad_cache_prescription_${docId}`, { data, settings });
      } else {
        setActiveProtocolData(null);
        setPrescriptionSettings({
          headerMargin: 50, leftMargin: 20, rightMargin: 20, bottomMargin: 30,
          fontSize: 14, fontColor: '#1e293b', fontFamily: 'Inter', letterhead: null,
          letterheadFile: null, overflowBackgroundMode: 'REUSE'
        });
      }
    } catch (err) {
      console.error("[PRESCRIPTION] Fetch failed, trying cache", err);
      const cached = await nativeStorage.get(`1rad_cache_prescription_${docId}`);
      if (cached) {
        setActiveProtocolData(cached.data);
        setPrescriptionSettings(cached.settings);
      } else {
        setActiveProtocolData(null);
      }
    } finally {
      setIsProtocolLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDoctorProtocol(selectedPrescriptionDoctorId);
  }, [selectedPrescriptionDoctorId, fetchDoctorProtocol]);


  const [hospitalData, setHospitalData] = useState({
    hospitalName: '',
    hospitalAddress: '',
    gstin: '',
    registrationNumber: '',
    pan: '',
    nabhNumber: '',
    isAutoBillingEnabled: false,
    latitude: null,
    longitude: null
  });
  const [mappedHospitals, setMappedHospitals] = useState([]);
  const [viewingHubId, setViewingHubId] = useState(null); // null = show list

  // UX Refinement: Auto-populate brand identity
  useEffect(() => {
    if (isChainDrawerOpen) {
      setNewChainData(prev => ({ 
        ...prev, 
        chainName: activeCenter?.groupName || activeCenter?.name || '',
        hospitalName: '' 
      }));
    }
  }, [isChainDrawerOpen, activeCenter?.id]);
  const [hospitalLoading, setHospitalLoading] = useState(false);
  const [savingHospital, setSavingHospital] = useState(false);
  const [hospitalMessage, setHospitalMessage] = useState({ type: '', text: '' });

  // --- API FETCHING ---
  // Warm the personnel snapshot; the staff list renders from watchPersonnel
  // below, so a staff change appears here on its own. Offline keeps the snapshot.
  const fetchPersonnel = useCallback(async () => {
    try {
      setPersonnelLoading(true);
      const res = await apiClient.get('/personnel');
      await snapshotPersonnel(res.data);
    } catch (err) {
      console.error('Personnel refresh failed — keeping offline snapshot.', err);
    } finally {
      setPersonnelLoading(false);
    }
  }, []);

  // Staff list renders from the local personnel cache (refreshed every sync
  // cycle). (The price-registry subscription that used to sit beside it fed a
  // state setter that was never declared — every emit threw a ReferenceError —
  // and nothing on this page reads prices, so it is gone.)
  useEffect(() => {
    const subPersonnel = watchPersonnel().subscribe({
      next: (rows) => setPersonnel((rows || []).map(p => ({
        id: p.userId,
        name: p.fullName || 'UNKNOWN_STAFF',
        email: p.email,
        mobile: p.mobile,
        roles: (p.roles || []).map(r => String(r).toLowerCase()),
        password: p.password,
        specialization: p.specialization,
        degree: p.degree,
        licenseNo: p.licenseNo,
        status: p.status,
        createdAt: p.createdAt
      }))),
      error: (err) => console.warn('[ReferralsPage] personnel liveQuery error', err),
    });
    return () => { subPersonnel.unsubscribe(); };
  }, []);

  const fetchPatientMasterList = useCallback(async () => {
    try {
      setLoadingMaster(true);
      const params = referralFilterMode === 'ALL'
        ? { allTime: true, search: referralPatientsSearch }
        : {
            startDate: referralRange.start,
            endDate: referralFilterMode === 'SINGLE' ? referralRange.start : referralRange.end,
            search: referralPatientsSearch
          };
      const res = await apiClient.get('/patients', { params });
      setPatientMasterList(res.data);
      await nativeStorage.set(`1rad_cache_patient_master_${referralFilterMode}`, res.data);
    } catch (err) {
      console.error('[PATIENT MASTER] Fetch failed, trying cache', err);
      const cached = await nativeStorage.get(`1rad_cache_patient_master_${referralFilterMode}`);
      if (cached) setPatientMasterList(cached);
    } finally {
      setLoadingMaster(false);
    }
  }, [referralRange, referralFilterMode, referralPatientsSearch]);

  const handleImport = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setIsImporting(true);
    setImportResult(null);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await apiClient.post('/appointments/import', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      setImportResult(response.data);
      fetchReferralIntelligence();
      if (referralViewMode === 'PATIENTS') fetchPatientMasterList();
    } catch (error) {
      console.error('Import failed:', error);
      setImportResult({ successCount: 0, failureCount: 1, errors: ['Error: Could not connect to data source.'] });
    } finally {
      setIsImporting(false);
      e.target.value = ''; // Reset input
    }
  };

  const fetchHospitalData = useCallback(async (hubId) => {
    try {
      setHospitalLoading(true);
      const res = await apiClient.get(`/hospitals/${hubId}`);
      const data = {
        hospitalName: res.data.hospitalName || res.data.HospitalName || '',
        hospitalAddress: res.data.hospitalAddress || res.data.HospitalAddress || '',
        gstin: res.data.gstin || res.data.GSTIN || '',
        registrationNumber: res.data.registrationNumber || res.data.RegistrationNumber || '',
        pan: res.data.pan || res.data.PAN || '',
        nabhNumber: res.data.nabhNumber || res.data.NABHNumber || '',
        isAutoBillingEnabled: res.data.isAutoBillingEnabled || res.data.IsAutoBillingEnabled || false,
        // Nullable: a centre with no pin set yet has neither field, and 0 is
        // a valid coordinate (equator/prime meridian) so this can't use `||`.
        latitude: res.data.latitude ?? res.data.Latitude ?? null,
        longitude: res.data.longitude ?? res.data.Longitude ?? null
      };
      setHospitalData(data);
      setViewingHubId(hubId);
      await nativeStorage.set(`1rad_cache_hospital_${hubId}`, data);
    } catch (err) {
      console.error('[HOSPITAL] Fetch failed, trying cache', err);
      const cached = await nativeStorage.get(`1rad_cache_hospital_${hubId}`);
      if (cached) {
        setHospitalData(cached);
        setViewingHubId(hubId);
      }
    } finally {
      setHospitalLoading(false);
    }
  }, []);

  const fetchMappedHospitals = useCallback(async () => {
    try {
      setHospitalLoading(true);
      // Fetch metadata for the hubs in the current context's group
      const res = await apiClient.get('/hospitals/group');
      const groupMetas = Array.isArray(res.data) ? res.data : [];

      // Merge with the total authorized centers list to ensure universal visibility
      const mapped = centers.map(c => {
        const meta = groupMetas.find(m => (m.hospitalId || m.HospitalId) === c.id);
        return {
          hospitalId: c.id,
          hospitalName: meta?.hospitalName || meta?.HospitalName || c.name,
          hospitalAddress: meta?.hospitalAddress || meta?.HospitalAddress || 'Institutional routing active; address metadata pending sync.',
          gstin: meta?.gstin || meta?.GSTIN || '',
          registrationNumber: meta?.registrationNumber || meta?.RegistrationNumber || '',
          pan: meta?.pan || meta?.PAN || '',
          nabhNumber: meta?.nabhNumber || meta?.NABHNumber || '',
          status: meta?.status || meta?.Status || 'active',
          groupId: c.groupId || '',
          groupName: c.groupName || ''
        };
      });
      setMappedHospitals(mapped);
      await nativeStorage.set('1rad_cache_hospitals_group', mapped);
    } catch (err) {
      console.error('[HUB REGISTRY] Sync failed, trying cache', err);
      const cached = await nativeStorage.get('1rad_cache_hospitals_group');
      if (cached) {
        setMappedHospitals(cached);
      } else {
        // Ultimate fallback: use basic center info if API and cache fail
        setMappedHospitals(centers.map(c => ({
          hospitalId: c.id,
          hospitalName: c.name,
          hospitalAddress: 'Offline routing active.',
          status: 'active'
        })));
      }
    } finally {
      setHospitalLoading(false);
    }
  }, [centers]);

  // Live only: the money on this page must reflect the server right now. There is
  // deliberately NO cached fallback — the old one keyed the cache by the (usually
  // null) arguments rather than the range on screen, so a failed request quietly
  // showed some earlier range's numbers as if they were current. On failure the
  // last successfully loaded data (this session, this range) stays visible with an
  // error banner instead. `silent` = background refresh (no loader flash).
  const fetchReferralIntelligence = useCallback(async (startDate = null, endDate = null, allTime = false, { silent = false } = {}) => {
    // Responses can arrive out of order when the range is changed quickly — only
    // the newest request is allowed to write state.
    const seq = ++intelSeq.current;
    try {
      if (!silent) setReferralLoading(true);
      const params = (allTime || referralFilterMode === 'ALL')
        ? { allTime: true }
        : {
            startDate: startDate || referralRange.start,
            endDate: endDate || (referralFilterMode === 'SINGLE' ? referralRange.start : referralRange.end)
          };
      const [res, allRes] = await Promise.all([
        apiClient.get('/referrers/intelligence', { params }),
        apiClient.get('/referrers'),
      ]);
      if (seq !== intelSeq.current) return;
      setReferralIntelligence(res.data);
      setAllReferrers(allRes.data || []);
      setReferralError(null);
      setReferralUpdatedAt(Date.now());
    } catch (err) {
      if (seq !== intelSeq.current) return;
      console.error('[REFERRAL INTEL] Live fetch failed', err);
      setReferralError(!err?.response
        ? 'Cannot reach the server — the figures below may be out of date.'
        : 'Could not load live referral data — the figures below may be out of date.');
    } finally {
      if (seq === intelSeq.current) setReferralLoading(false);
    }
  }, [referralRange, referralFilterMode]);

  const handleUpdateReferrer = async (e) => {
    e.preventDefault();
    if (!editingReferrer) return;

    // Validate and sanitize Indian Mobile number (10 digits starting with 6-9)
    let rawContact = (editingReferrer.contact || '').trim();
    let digits = rawContact.replace(/\D/g, '');
    if (digits.startsWith('91') && digits.length === 12) {
      digits = digits.substring(2);
    } else if (digits.startsWith('0') && digits.length === 11) {
      digits = digits.substring(1);
    }

    // Mobile is optional now — only validate the format if a number was typed.
    if (digits.length > 0 && (digits.length !== 10 || !/^[6-9]\d{9}$/.test(digits))) {
      notifyToast('Please enter a valid 10-digit Indian mobile number (e.g., 9876543210).', 'error');
      return;
    }

    const isDoctor = editingReferrer.isDoctor !== false;
    // When the referral is NOT a doctor, the supporting doctor name is required.
    if (!isDoctor && !String(editingReferrer.supportedByDoctor || '').trim()) {
      notifyToast('Please enter the supporting doctor name for this referral.', 'error');
      return;
    }
    const profile = {
      contact: digits,
      address: editingReferrer.address || '',
      email: editingReferrer.email || '',
      specialty: isDoctor ? (editingReferrer.specialty || '') : '',
      degree: isDoctor ? (editingReferrer.degree || '') : '',
      isDoctor,
      supportedByDoctor: isDoctor ? '' : (editingReferrer.supportedByDoctor || ''),
    };

    try {
      setIsSavingReferrer(true);
      if (editingReferrer.referrerId) {
        await apiClient.put(`/referrers/${editingReferrer.referrerId}`, {
          referrerId: editingReferrer.referrerId,
          name: editingReferrer.name,
          ...profile
        });
      } else {
        await apiClient.post('/referrers', {
          name: editingReferrer.name,
          ...profile
        });
      }
      
      // Refresh data
      fetchReferralIntelligence();
      setIsReferrerEditDrawerOpen(false);
      setEditingReferrer(null);
    } catch (err) {
      console.error('[REFERRER] Save failed', err);
      const backendError = err.response?.data?.error || err.response?.data?.message;
      notifyToast(backendError || 'Could not save partner details.', 'error');
    } finally {
      setIsSavingReferrer(false);
    }
  };

  const handleDeleteReferrer = (referrer) => {
    if (!referrer?.referrerId) return;
    const name = (referrer.name || 'this partner').toUpperCase();
    setDeleteModalData({ referrerId: referrer.referrerId, name });
  };

  const confirmDelete = async () => {
    if (!deleteModalData) return;
    setIsDeleting(true);
    try {
      await apiClient.delete(`/referrers/${deleteModalData.referrerId}`);
      notifyToast(`${deleteModalData.name} deleted from partner network.`, 'success');
      // Close the edit drawer if we were editing the same partner
      if (editingReferrer?.referrerId === deleteModalData.referrerId) {
        setIsReferrerEditDrawerOpen(false);
        setEditingReferrer(null);
      }
      fetchReferralIntelligence();
      setDeleteModalData(null);
    } catch (err) {
      console.error('[REFERRER] Delete failed', err);
      const backendError = err.response?.data?.error || err.response?.data?.message;
      notifyToast(backendError || 'Could not delete partner.', 'error');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleMergeReferrer = async (e) => {
    e.preventDefault();
    if (!editingReferrer || !targetReferrerId) return;
    
    if (editingReferrer.referrerId === targetReferrerId) {
      notifyToast('Cannot merge a partner into themselves.', 'error');
      return;
    }

    try {
      setIsMerging(true);
      await apiClient.post('/referrers/merge', {
        sourceReferrerId: targetReferrerId,
        targetReferrerId: editingReferrer.referrerId
      });
      if (deleteAfterMerge) {
        await apiClient.delete(`/referrers/${targetReferrerId}`);
      }
      notifyToast(deleteAfterMerge ? 'Partner merged and removed successfully.' : 'Partner successfully merged.', 'success');
      setIsMergeModalOpen(false);
      setIsReferrerEditDrawerOpen(false);
      setEditingReferrer(null);
      setTargetReferrerId('');
      setDeleteAfterMerge(false);
      fetchReferralIntelligence();
    } catch (err) {
      console.error('[REFERRER] Merge failed', err);
      const backendError = err.response?.data?.error || err.response?.data?.message;
      notifyToast(backendError || 'Could not merge partner.', 'error');
    } finally {
      setIsMerging(false);
    }
  };

  const handleUnmergeReferrer = (sourceId, sourceName = 'this partner') => {
    setUnmergeModalData({ sourceId, sourceName });
  };

  const confirmUnmerge = async () => {
    if (!unmergeModalData) return;
    setIsUnmerging(true);
    try {
      await apiClient.post(`/referrers/${unmergeModalData.sourceId}/unmerge`);
      notifyToast('Partner unmerged successfully.', 'success');
      fetchReferralIntelligence();
      setUnmergeModalData(null);
    } catch (err) {
      console.error('[REFERRER] Unmerge failed', err);
      const backendError = err.response?.data?.error || err.response?.data?.message;
      notifyToast(backendError || 'Could not unmerge partner.', 'error');
    } finally {
      setIsUnmerging(false);
    }
  };

  const handleUpdatePatient = async (e) => {
    e.preventDefault();
    if (!editingPatient) return;

    if (!String(editingPatient.ageValue || '').trim()) {
      notifyToast('Please enter the patient\'s age.', 'warning');
      return;
    }

    try {
      setIsSavingPatient(true);
      await apiClient.put(`/patients/${editingPatient.patientId}`, {
        patientId: editingPatient.patientId,
        fullName: editingPatient.fullName,
        mobile: editingPatient.mobile,
        age: buildPatientAge(editingPatient.ageValue, editingPatient.ageUnit),
        gender: editingPatient.gender,
        village: editingPatient.village,
        block: editingPatient.block,
        district: editingPatient.district,
        address: editingPatient.address,
        sourceOfInfo: editingPatient.sourceOfInfo
      });
      
      // Refresh data
      fetchReferralIntelligence();
      setIsPatientEditDrawerOpen(false);
      setEditingPatient(null);
    } catch (err) {
      console.error('[PATIENT] Update failed', err);
      notifyToast('Could not save patient details.', 'error');
    } finally {
      setIsSavingPatient(false);
    }
  };

  // --- DOMAIN SYNCHRONIZATION ---
  
  // Referral Intelligence
  useEffect(() => {
    if (activeTab === 'Referrals') {
      fetchReferralIntelligence();
    }
    // financeRev: refresh when a commission/invoice change syncs in.
  }, [activeTab, financeRev, fetchReferralIntelligence]);

  // Keep the Referrals figures live: refresh quietly every 90s while this tab is
  // showing, and immediately when the browser tab comes back to the foreground
  // (a payout / patient payment recorded on another screen or device shows up
  // without a manual reload).
  useEffect(() => {
    if (activeTab !== 'Referrals') return undefined;
    const tick = () => { if (!document.hidden) fetchReferralIntelligence(null, null, false, { silent: true }); };
    const id = setInterval(tick, 90_000);
    document.addEventListener('visibilitychange', tick);
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', tick); };
  }, [activeTab, fetchReferralIntelligence]);

  // Patient Master List
  useEffect(() => {
    if (activeTab === 'Referrals' && referralViewMode === 'PATIENTS') {
      fetchPatientMasterList();
    }
  }, [activeTab, referralViewMode, fetchPatientMasterList]);

  const handleExportIntelligence = async () => {
    try {
      setIsExporting(true);
      const params = exportParams.allTime ? { allTime: true } : { startDate: exportParams.start, endDate: exportParams.end };
      const response = await apiClient.get('/intelligence/export', {
        params,
        responseType: 'blob'
      });
      
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `1RadFlow_Intelligence_${exportParams.start}_to_${exportParams.end}.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.parentNode.removeChild(link);
      setShowExportOverlay(false);
    } catch (err) {
      console.error('Export Failed:', err);
      notifyToast('Could not export data.', 'error');
    } finally {
      setIsExporting(false);
    }
  };

  const handleSwitchNode = async (id) => {
    if (id === activeCenter?.id) return;
    try {
      setIsSwitchingNode(true);
      setShowChainSelector(false);
      const result = await switchCenter(id);
      if (result?.success) {
        // Clear local data to force re-sync (and drop any response still in flight
        // for the previous centre so it cannot repopulate the page).
        intelSeq.current += 1;
        setReferralIntelligence([]);
        setPersonnel([]);
        
        // Success feedback handled by effect dependency on activeCenter
      }
    } catch (err) {
      console.error('Node Transition Failed:', err);
    } finally {
      // Small artificial delay for smooth transition feel
      setTimeout(() => setIsSwitchingNode(false), 800);
    }
  };

  const handleDeployChain = async (e) => {
    e.preventDefault();
    const payload = newChainData;

    if (!isOnline) {
      await addToOutbox('CHAIN_DEPLOY', payload);
      notifyToast({ title: 'Queued for sync', message: 'Centre expansion will sync when connection is restored.' }, 'info');
      setIsChainDrawerOpen(false);
      return;
    }

    try {
      setIsDeployingChain(true);
      const res = await apiClient.post('/hospitals/chain', payload);
      
      if (res.data.success) {
        setIsChainDrawerOpen(false);
        setNewChainData({ chainName: '', hospitalName: '', hospitalAddress: '' });
        
        // Use standard transition logic
        await handleSwitchNode(res.data.hospitalId);
      }
    } catch (err) {
      console.error('Chain Deployment Failure:', err);
      if (!err.response) {
        await addToOutbox('CHAIN_DEPLOY', payload);
        notifyToast({ title: 'Network error', message: 'Centre deployment queued in offline outbox.' }, 'warning');
        setIsChainDrawerOpen(false);
      } else {
        notifyToast(err.response?.data?.message || 'Centre expansion failed.', 'error');
      }
    } finally {
      setIsDeployingChain(false);
    }
  };

  const getStatusConfig = (status) => {
    const s = status?.toUpperCase() || 'UNKNOWN';
    if (s.includes('COMPLETED')) return { bg: '#ecfdf5', color: '#059669', label: 'COMPLETED' };
    if (s.includes('CANCEL')) return { bg: '#fef2f2', color: '#dc2626', label: 'CANCELLED' };
    if (s.includes('PROGRESS')) return { bg: '#eff6ff', color: '#2563eb', label: 'IN PROGRESS' };
    if (s.includes('ARRIVE')) return { bg: '#fff7ed', color: '#ea580c', label: 'ARRIVED' };
    return { bg: '#f8fafc', color: '#64748b', label: s };
  };


  const handleSaveHospital = async (e) => {
    e.preventDefault();
    const targetHubId = viewingHubId || activeCenter?.id;
    if (!targetHubId) return;

    const payload = {
      hospitalName: hospitalData.hospitalName,
      hospitalAddress: hospitalData.hospitalAddress,
      gstin: hospitalData.gstin,
      registrationNumber: hospitalData.registrationNumber,
      pan: hospitalData.pan,
      nabhNumber: hospitalData.nabhNumber,
      latitude: hospitalData.latitude,
      longitude: hospitalData.longitude
    };

    if (!isOnline) {
      await addToOutbox('HOSPITAL_UPDATE', { id: targetHubId, ...payload });
      notifyToast({ title: 'Queued for sync', message: 'Centre metadata will sync when connection is restored.' }, 'info');
      setIsHospitalDrawerOpen(false);
      return;
    }

    try {
      setSavingHospital(true);
      setHospitalMessage({ type: '', text: '' });
      
      await apiClient.put(`/hospitals/${targetHubId}`, payload);
      setHospitalMessage({ type: 'success', text: 'METADATA RE-SYNCED: Hub configuration updated successfully.' });
      
      // Refresh the registry and current view
      fetchMappedHospitals();
      fetchHospitalData(targetHubId);

      setTimeout(() => {
        setIsHospitalDrawerOpen(false);
        setHospitalMessage({ type: '', text: '' });
      }, 2000);
    } catch (err) {
      console.error('[HOSPITAL] Save failed', err);
      if (!err.response) {
        await addToOutbox('HOSPITAL_UPDATE', { id: targetHubId, ...payload });
        notifyToast({ title: 'Network error', message: 'Centre configuration queued in offline outbox.' }, 'warning');
        setIsHospitalDrawerOpen(false);
      } else {
        setHospitalMessage({ type: 'error', text: err.response?.data?.message || 'DEPLOYMENT FAILURE: Failed to update institutional node metadata.' });
      }
    } finally {
      setSavingHospital(false);
    }
  };

  const handleToggleAutoBill = async () => {
    const newAutoBill = !billingSettings.autoBill;
    const targetHubId = activeCenter?.id;
    if (!targetHubId) return;

    const payload = {
      hospitalName: hospitalData.hospitalName || activeCenter.name,
      hospitalAddress: hospitalData.hospitalAddress || 'Metadata synchronization active.',
      gstin: hospitalData.gstin || '',
      registrationNumber: hospitalData.registrationNumber || '',
      pan: hospitalData.pan || '',
      nabhNumber: hospitalData.nabhNumber || '',
      isAutoBillingEnabled: newAutoBill
    };

    if (!isOnline) {
      await addToOutbox('HOSPITAL_UPDATE', { id: targetHubId, ...payload });
      notifyToast({ title: 'Queued for sync', message: `Auto-billing ${newAutoBill ? 'enabled' : 'disabled'} — will sync when connection is restored.` }, 'info');
      setBillingSettings(prev => ({ ...prev, autoBill: newAutoBill }));
      return;
    }

    try {
      await apiClient.put(`/hospitals/${targetHubId}`, payload);
      setBillingSettings(prev => ({ ...prev, autoBill: newAutoBill }));
      setHospitalData(prev => ({ ...prev, isAutoBillingEnabled: newAutoBill }));
      await refreshCenters();
    } catch (err) {
      console.error('[FINANCE] Protocol update failed', err);
      if (!err.response) {
        await addToOutbox('HOSPITAL_UPDATE', { id: targetHubId, ...payload });
        notifyToast({ title: 'Network error', message: 'Billing setting queued in offline outbox.' }, 'warning');
        setBillingSettings(prev => ({ ...prev, autoBill: newAutoBill }));
      } else {
        notifyToast('Failed to save billing settings. Please check your connection.', 'error');
      }
    }
  };

  useEffect(() => {
    if (activeCenter?.id) {
      const loadActiveCenterDetails = async () => {
        try {
          const res = await apiClient.get(`/hospitals/${activeCenter.id}`);
          const data = {
            hospitalName: res.data.hospitalName || res.data.HospitalName || '',
            hospitalAddress: res.data.hospitalAddress || res.data.HospitalAddress || '',
            gstin: res.data.gstin || res.data.GSTIN || '',
            registrationNumber: res.data.registrationNumber || res.data.RegistrationNumber || '',
            pan: res.data.pan || res.data.PAN || '',
            nabhNumber: res.data.nabhNumber || res.data.NABHNumber || '',
            isAutoBillingEnabled: res.data.isAutoBillingEnabled || res.data.IsAutoBillingEnabled || false
          };
          setHospitalData(data);
          setBillingSettings(prev => ({
            ...prev,
            autoBill: data.isAutoBillingEnabled
          }));
        } catch (err) {
          console.error('[HOSPITAL] Failed to fetch active center details', err);
          setBillingSettings(prev => ({
            ...prev,
            autoBill: activeCenter.isAutoBillingEnabled || false
          }));
        }
      };
      loadActiveCenterDetails();
    }
  }, [activeCenter?.id]);

  // Handle window resize for responsive layout
  useEffect(() => {
    const handleResize = () => {
      const newWidth = window.innerWidth;
      setWindowWidth(newWidth);
      setIsMobile(newWidth < 1024);
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);


  const [systemProtocols, setSystemProtocols] = useState({ 
    aiAssisted: true, 
    cloudArchival: true, 
    multiCenterSync: false,
    auditLogging: true
  });

  const filteredPersonnel = useMemo(() => {
    if (!personnelSearch.trim()) return personnel;
    const query = personnelSearch.toLowerCase();
    return personnel.filter(u => 
      u.name.toLowerCase().includes(query) || 
      u.email.toLowerCase().includes(query) || 
      (u.roles && u.roles.some(r => r.toLowerCase().includes(query)))
    );
  }, [personnel, personnelSearch]);

  // --- DERIVED DATA ---
  const dynamicReferralStats = useMemo(() => {
    let dailyEvents = REFERRAL_LOG.filter(log => log.date === selectedDateFilter);
    if (referrerFilter !== 'ALL') {
      dailyEvents = dailyEvents.filter(log => log.referredBy === referrerFilter);
    }
    const total = dailyEvents.length;
    const aggregated = dailyEvents.reduce((acc, current) => {
      acc[current.referredBy] = (acc[current.referredBy] || 0) + 1;
      return acc;
    }, {});
    return Object.entries(aggregated)
      .map(([name, count]) => ({
        name,
        count,
        percentage: total > 0 ? (count / total) * 100 : 0
      }))
      .sort((a, b) => b.count - a.count);
  }, [selectedDateFilter, referrerFilter]);

  const topReferrerName = dynamicReferralStats.length > 0 ? dynamicReferralStats[0].name : 'N/A';

  // Referral Intelligence Logic (Moved to top-level to satisfy Rules of Hooks)
  const temporalPatients = useMemo(() => {
    // Flatten all patients from grouped intelligence data
    const allPatients = referralIntelligence.flatMap(ref => 
      ref.patients.map(p => ({
        ...p,
        referredBy: p.referrerName || ref.name,
        sourceContact: ref.contact,
        sourceAddress: ref.address,
        registered: p.registrationDate // Alias for consistency
      }))
    );

    if (referralViewMode === 'LOG' && referralLogSearch) {
      const searchLow = referralLogSearch.toLowerCase();
      return allPatients.filter(p => {
        const sourceMatch = (p.referredBy || '').toLowerCase().includes(searchLow);
        const patientMatch = (p.name || '').toLowerCase().includes(searchLow);
        return sourceMatch || patientMatch;
      });
    }

    return allPatients;
  }, [referralIntelligence, referralLogSearch, referralViewMode]);

  const caseLedgerList = useMemo(() => {
    const safeAll = allReferrers || [];
    const safeIntel = referralIntelligence || [];

    return safeAll
      .filter(ref => (ref.name || '').trim().toLowerCase() !== 'self') // Self is its own section, never a partner (#20)
      .filter(ref => personTypeFilter === 'ALL' ? true
        : personTypeFilter === 'DOCTOR' ? (ref.isDoctor !== false)
        : personTypeFilter === 'OTHER' ? (ref.isDoctor === false)
        : false) // SELF → no partner rows (#2)
      .map(ref => {
      const intel = safeIntel.find(i => i.referrerId === ref.referrerId);
      return {
        referrerId: ref.referrerId,
        name: ref.name,
        contact: ref.contact,
        address: ref.address,
        // Referral-source profile (payee-first model).
        isDoctor: ref.isDoctor !== false,
        email: ref.email || '',
        specialty: ref.specialty || '',
        degree: ref.degree || '',
        supportedByDoctor: ref.supportedByDoctor || '',
        mergedIntoId: ref.mergedIntoId,
        hasSentPatients: !!intel && intel.totalPatients > 0,
        patientCount: intel ? intel.totalPatients : 0,
        totalRevenue: intel ? intel.totalRevenue : 0,
        totalDiscount: intel ? intel.totalDiscount : 0,
        totalCommission: intel ? intel.totalCommission : 0,
        paidCommission: intel ? intel.paidCommission : 0,
        unpaidCommission: intel ? intel.unpaidCommission : 0,
        netProfit: intel ? intel.netProfit : 0,
        patients: intel ? intel.patients : []
      };
    }).sort((a, b) => {
      if (a.hasSentPatients && !b.hasSentPatients) return -1;
      if (!a.hasSentPatients && b.hasSentPatients) return 1;
      return b.patientCount - a.patientCount;
    });
  }, [allReferrers, referralIntelligence, personTypeFilter]);

  const sortedRoster = useMemo(() => {
    const arr = [...(caseLedgerList || [])];
    const { key, dir } = rosterSort;
    const numKeys = new Set(['patientCount', 'totalCommission', 'paidCommission', 'unpaidCommission']);
    arr.sort((a, b) => {
      // 1. If one is an alias of the other, alias goes right below primary
      if (a.mergedIntoId === b.referrerId) return 1;
      if (b.mergedIntoId === a.referrerId) return -1;
      // 2. If both are aliases of the SAME primary, sort alphabetically
      if (a.mergedIntoId && a.mergedIntoId === b.mergedIntoId) return a.name.localeCompare(b.name);
      
      // 3. Otherwise, use primary stats for sorting so alias blocks move with their primary
      const aPrimaryId = a.mergedIntoId || a.referrerId;
      const bPrimaryId = b.mergedIntoId || b.referrerId;
      
      if (aPrimaryId !== bPrimaryId) {
        const aPrimary = arr.find(x => x.referrerId === aPrimaryId) || a;
        const bPrimary = arr.find(x => x.referrerId === bPrimaryId) || b;
        let r;
        if (numKeys.has(key)) r = (Number(aPrimary[key]) || 0) - (Number(bPrimary[key]) || 0);
        else if (key === 'isDoctor') r = (aPrimary.isDoctor ? 1 : 0) - (bPrimary.isDoctor ? 1 : 0);
        else r = String(aPrimary[key] || '').toLowerCase().localeCompare(String(bPrimary[key] || '').toLowerCase());
        return dir === 'asc' ? r : -r;
      }
      return 0;
    });
    return arr;
  }, [caseLedgerList, rosterSort]);

  // Patient Section (PATIENTS / Master Index) — apply the chosen column sort.
  const sortedMaster = useMemo(() => {
    const arr = [...(patientMasterList || [])];
    const { key, dir } = masterSort;
    arr.sort((a, b) => {
      let r;
      if (key === 'age') r = (Number(a.age) || 0) - (Number(b.age) || 0);
      else if (key === 'registeredAt') r = String(a.registeredAt || '').localeCompare(String(b.registeredAt || ''));
      else r = String(a[key] || '').toLowerCase().localeCompare(String(b[key] || '').toLowerCase());
      return dir === 'asc' ? r : -r;
    });
    return arr;
  }, [patientMasterList, masterSort]);

  // Tiny header arrow for the sortable index tables.

  // Self / walk-in summary — the backend collapses every self visit into a
  // single "Self / Walk-in" intelligence node (referrerId = empty guid). Kept
  // out of the partner list and surfaced as its own section. (#20)
  const selfSummary = useMemo(() => {
    const EMPTY = '00000000-0000-0000-0000-000000000000';
    const node = (referralIntelligence || []).find(
      i => i.referrerId === EMPTY || i.name === 'Self / Walk-in'
    );
    if (!node) return null;
    return {
      patientCount: node.totalPatients || 0,
      totalRevenue: node.totalRevenue || 0,
      totalDiscount: node.totalDiscount || 0,
      patients: node.patients || [],
    };
  }, [referralIntelligence]);

  const filteredCaseLedger = useMemo(() => {
    if (!referralLogSearch) return caseLedgerList;
    const searchLow = referralLogSearch.toLowerCase();
    return caseLedgerList.filter(item => 
      (item.name || '').toLowerCase().includes(searchLow) ||
      (item.contact || '').toLowerCase().includes(searchLow) ||
      (item.address || '').toLowerCase().includes(searchLow)
    );
  }, [caseLedgerList, referralLogSearch]);

  const referralAggregated = useMemo(() => {
    // Map the backend intelligence DTOs to the frontend's expected Matrix
    // structure. The "Self / Walk-in" node (referrerId = empty guid) is NOT a
    // partner — it's shown in its own section, so drop it here. (#20)
    const EMPTY = '00000000-0000-0000-0000-000000000000';
    const mapped = referralIntelligence
      .filter(ref => ref.referrerId !== EMPTY && (ref.name || '').trim().toLowerCase() !== 'self' && ref.name !== 'Self / Walk-in')
      .map(ref => {
      // Multi-service rollout (batch-5 fix). Per-modality counts now
      // walk the ServiceLines array when the server provided it — so a
      // single patient referred for X-Ray + CT + USG contributes 3
      // counts (one per modality) rather than 1 attributed to the
      // primary scalar. Falls back to the scalar modality when the
      // server is older or the entry has no service lines.
      const modalities = ref.patients.reduce((acc, p) => {
        const lines = Array.isArray(p.serviceLines) ? p.serviceLines : null;
        if (lines && lines.length > 0) {
          for (const line of lines) {
            const mod = (line.modality || 'OTHER').toUpperCase();
            acc[mod] = (acc[mod] || 0) + 1;
          }
        } else {
          const mod = p.modality || 'OTHER';
          acc[mod] = (acc[mod] || 0) + 1;
        }
        return acc;
      }, {});

      return {
        referrerId: ref.referrerId,
        name: ref.name,
        contact: ref.contact,
        address: ref.address,
        patients: ref.patients,
        modalities,
        totalCommission: ref.totalCommission,
        paidCommission: ref.paidCommission,
        unpaidCommission: ref.unpaidCommission,
        totalRevenue: ref.totalRevenue,
        netProfit: ref.netProfit
      };
    });

    // When showing ALL records, include registered referrers with zero activity
    if (referralFilterMode === 'ALL') {
      const mappedIds = new Set(mapped.map(r => r.referrerId));
      allReferrers.forEach(ref => {
        if ((ref.name || '').trim().toLowerCase() === 'self') return; // Self excluded from partners (#20)
        if (!mappedIds.has(ref.referrerId)) {
          mapped.push({
            referrerId: ref.referrerId,
            name: ref.name,
            contact: ref.contact,
            address: ref.address,
            patients: [],
            modalities: {},
            totalCommission: 0,
            paidCommission: 0,
            unpaidCommission: 0,
            totalRevenue: 0,
            netProfit: 0
          });
        }
      });
    }

    let final = [...mapped];

    // Person-type filter (#2): Doctor / Other / Self. isDoctor comes from the
    // referrer roster (intelligence rows don't carry it). SELF hides partners —
    // the Self / Walk-in card renders separately.
    if (personTypeFilter === 'SELF') {
      final = [];
    } else if (personTypeFilter === 'DOCTOR' || personTypeFilter === 'OTHER') {
      const wantDoctor = personTypeFilter === 'DOCTOR';
      const docById = new Map((allReferrers || []).map(r => [r.referrerId, r.isDoctor !== false]));
      final = final.filter(r => {
        const isDoc = docById.has(r.referrerId) ? docById.get(r.referrerId) : true;
        return wantDoctor ? isDoc : !isDoc;
      });
    }

    // Sort logic
    final.sort((a, b) => {
      let valA, valB;
      if (referralSort.key === 'missions') { valA = a.patients.length; valB = b.patients.length; }
      else if (referralSort.key === 'yield') { valA = a.totalCommission; valB = b.totalCommission; }
      else if (referralSort.key === 'pending') { valA = a.unpaidCommission; valB = b.unpaidCommission; }
      else { valA = a.name; valB = b.name; }

      if (referralSort.direction === 'asc') return valA > valB ? 1 : -1;
      return valA < valB ? 1 : -1;
    });

    if (!referralMatrixSearch) return final;

    const searchLow = referralMatrixSearch.toLowerCase();
    return final.filter(ref => ref.name.toLowerCase().includes(searchLow));
  }, [referralIntelligence, referralViewMode, referralMatrixSearch, referralSort, allReferrers, referralFilterMode, personTypeFilter]);

  // Auto-select first referrer in Matrix mode
  useEffect(() => {
    if (referralViewMode === 'MATRIX' && referralAggregated.length > 0 && !expandedReferrer) {
      setExpandedReferrer(referralAggregated[0].name);
    }
  }, [referralViewMode, referralAggregated, expandedReferrer]);

  const temporalMatrixData = useMemo(() => {
    if (referralViewMode !== 'LOG') return null;
    
    let cols = [];
    let getColKey = () => "";
    
    const dStr = matrixDateStr || TODAY;
    const year = parseInt(dStr.substring(0, 4), 10);
    const month = parseInt(dStr.substring(5, 7), 10) - 1; // 0-11
    
    if (matrixPeriod === 'DAY') {
      cols = ['Morning (12am-12pm)', 'Afternoon (12pm-5pm)', 'Evening (5pm-12am)'];
      getColKey = (pStr) => {
        if (!pStr.startsWith(dStr.substring(0,10))) return null;
        const d = new Date(pStr);
        const h = d.getHours();
        if (h < 12) return cols[0];
        if (h < 17) return cols[1];
        return cols[2];
      };
    } else if (matrixPeriod === 'WEEK') {
      const startDay = (matrixWeekIndex - 1) * 7 + 1;
      const endDay = matrixWeekIndex === 4 ? new Date(year, month + 1, 0).getDate() : startDay + 6;
      
      for (let i = startDay; i <= endDay; i++) {
        const d = new Date(year, month, i);
        cols.push(d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }));
      }
      
      getColKey = (pStr) => {
        const d = new Date(pStr);
        if (d.getFullYear() === year && d.getMonth() === month && d.getDate() >= startDay && d.getDate() <= endDay) {
           return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
        }
        return null;
      };
    } else if (matrixPeriod === 'MONTH') {
      cols = ['Week 1 (1st-7th)', 'Week 2 (8th-14th)', 'Week 3 (15th-21st)', 'Week 4 (22nd-End)'];
      getColKey = (pStr) => {
        const d = new Date(pStr);
        if (d.getFullYear() === year && d.getMonth() === month) {
           const dt = d.getDate();
           if (dt <= 7) return cols[0];
           if (dt <= 14) return cols[1];
           if (dt <= 21) return cols[2];
           return cols[3];
        }
        return null;
      };
    } else if (matrixPeriod === 'YEAR') {
      cols = Array.from({length: 12}).map((_, i) => {
        const d = new Date(year, i, 1);
        return d.toLocaleDateString('en-US', { month: 'short' });
      });
      getColKey = (pStr) => {
        const d = new Date(pStr);
        if (d.getFullYear() === year) {
           return d.toLocaleDateString('en-US', { month: 'short' });
        }
        return null;
      };
    }

    const searchLow = (referralLogSearch || '').toLowerCase();
    const rows = allReferrers
      .filter(ref => !searchLow || (ref.name || '').toLowerCase().includes(searchLow))
      .map(ref => {
        const counts = {};
        cols.forEach(c => counts[c] = 0);
        let totalMatched = 0;
        const intel = referralIntelligence.find(i => i.referrerId === ref.referrerId || i.name === ref.name);
        const patientsList = intel ? (intel.patients || []) : [];

        patientsList.forEach(p => {
           const pStr = p.registrationDate || p.date || TODAY;
           const key = getColKey(pStr);
           if (key && counts[key] !== undefined) {
              counts[key]++;
              totalMatched++;
           }
        });
        return {
          name: ref.name,
          contact: ref.contact,
          total: totalMatched,
          counts
        };
      });

    // Self / Walk-in folded in as ONE accumulated row (direct patients, no
    // referral commission) — replaces the old standalone dark self card.
    if (selfSummary && selfSummary.patientCount > 0 && personTypeFilter !== 'DOCTOR' && personTypeFilter !== 'OTHER'
        && (!searchLow || 'self / walk-in'.includes(searchLow))) {
      const selfCounts = {};
      cols.forEach(c => { selfCounts[c] = 0; });
      let selfTotal = 0;
      (selfSummary.patients || []).forEach(p => {
        const key = getColKey(p.registrationDate || p.date || TODAY);
        if (key && selfCounts[key] !== undefined) { selfCounts[key]++; selfTotal++; }
      });
      if (selfTotal > 0) rows.push({ name: 'Self / Walk-in', contact: '', total: selfTotal, counts: selfCounts, isSelf: true });
    }
    rows.sort((a, b) => b.total - a.total);
    // Self / Walk-in pinned to the TOP of the Case Ledger matrix by default.
    const selfIdx = rows.findIndex(r => r.isSelf);
    if (selfIdx > 0) { const [selfRow] = rows.splice(selfIdx, 1); rows.unshift(selfRow); }

    return { cols, rows };
  }, [allReferrers, referralIntelligence, referralViewMode, matrixPeriod, matrixDateStr, matrixWeekIndex, referralLogSearch, selfSummary, personTypeFilter]);

  const handleDeleteUser = async (id) => {
    if (id === currentUser.id) {
      notifyToast({ title: 'Action blocked', message: "You cannot remove your own account from this centre — it would lock you out." }, 'warning');
      return;
    }
    if (window.confirm('Are you sure you want to remove this staff member from the current hub?')) {
      if (!isOnline) {
        await addToOutbox('PERSONNEL_DELETE', { id });
        notifyToast({ title: 'Queued for sync', message: 'Personnel removal will sync when connection is restored.' }, 'info');
        setPersonnel(prev => prev.filter(u => u.id !== id)); // Optimistic UI
        return;
      }

      try {
        await apiClient.delete(`/personnel/${id}`);
        fetchPersonnel();
      } catch (err) {
        console.error('[PERSONNEL] Delete failed', err);
        if (!err.response) {
          await addToOutbox('PERSONNEL_DELETE', { id });
          notifyToast({ title: 'Network error', message: 'Personnel removal queued in offline outbox.' }, 'warning');
          setPersonnel(prev => prev.filter(u => u.id !== id)); // Optimistic UI
        } else {
          notifyToast(err.response?.data?.message || 'Failed to remove personnel.', 'error');
        }
      }
    }
  };

  const handleCopyCredentials = (user) => {
    const text = `1Rad Flow Clinical Hub Access\nLogin ID: ${user.email}\nSecurity Key: ${user.password || '[Hidden]'}\nHub URL: ${window.location.origin}`;
    navigator.clipboard.writeText(text);
    setCopyFeedback(user.id);
    setTimeout(() => setCopyFeedback(''), 3000);
  };

  const handleWhatsAppShare = (user) => {
    const message = `Hello ${user.name},\n\nYour 1Rad Flow Clinical Hub credentials have been initialized.\n\n🌐 Hub URL: ${window.location.origin}\n🔑 Login ID: ${user.email}\n🛡️ Security Key: ${user.password || '[Please use the reset link if unknown]'}\n\nPlease maintain strict confidentiality of these credentials.`;
    const encoded = encodeURIComponent(message);
    const mobile = user.mobile?.replace(/\D/g, ''); // Ensure only numbers
    const finalMobile = mobile?.length === 10 ? `91${mobile}` : mobile; // Default to India if 10 digits
    window.open(`https://wa.me/${finalMobile}?text=${encoded}`, '_blank', 'noopener,noreferrer');
  };

  const handleOpenUserDrawer = (user = null) => {
    setEditUser(user ? { ...user, roles: user.roles || [] } : { 
      name: '', 
      email: '', 
      password: '', 
      confirmPassword: '',
      roles: [], 
      status: 'active',
      specialization: '',
      degree: '',
      licenseNo: '',
      mobile: ''
    });
    setUserRegStep(1);
    setIsUserDrawerOpen(true);
  };

  const handleSaveUser = async (e) => {
    e.preventDefault();
    
    const isDoctorRole = editUser.roles.some(r => r.toLowerCase().includes('doctor'));
    
    // Surcharge check for NEW doctors
    if (!editUser.id && isDoctorRole) {
      const confirmSurcharge = window.confirm(
        "PROTOCOL ALERT: Adding a new doctor seat will increase your monthly subscription overhead by ₹1,000.\n\nDo you want to authorize this expansion?"
      );
      if (!confirmSurcharge) return;
    }

    if (!editUser.roles || editUser.roles.length === 0) {
      notifyToast('At least one clinical or administrative role must be assigned.', 'error');
      return;
    }

    const payload = {
      fullName: editUser.name,
      email: editUser.email,
      mobile: editUser.mobile,
      password: editUser.password,
      roleNames: editUser.roles, // Backend expects roleNames
      specialization: editUser.specialization,
      degree: editUser.degree,
      licenseNo: editUser.licenseNo
    };

    if (!isOnline) {
      const type = editUser.id ? 'PERSONNEL_UPDATE' : 'PERSONNEL_CREATE';
      await addToOutbox(type, { id: editUser.id, ...payload });
      notifyToast({ title: 'Queued for sync', message: `Personnel ${editUser.id ? 'update' : 'registration'} will sync when connection is restored.` }, 'info');
      setIsUserDrawerOpen(false);
      return;
    }

    try {
      if (editUser.id) {
        await apiClient.put(`/personnel/${editUser.id}`, payload);
      } else {
        await apiClient.post('/personnel', payload);
      }

      setIsUserDrawerOpen(false);
      fetchPersonnel();
    } catch (err) {
      console.error('[PERSONNEL] Save failed', err);
      if (!err.response) {
        const type = editUser.id ? 'PERSONNEL_UPDATE' : 'PERSONNEL_CREATE';
        await addToOutbox(type, { id: editUser.id, ...payload });
        notifyToast({ title: 'Network error', message: 'Staff record queued in offline outbox.' }, 'warning');
        setIsUserDrawerOpen(false);
      } else {
        notifyToast(err.response?.data?.message || 'Failed to save staff record.', 'error');
      }
    }
  };

  const handleOpenLayoutDrawer = (layout = null) => {
    if (!layout) {
      setEditLayout({ name: '', modality: 'X-RAY', type: '', active: true, selectedSections: ['findings', 'impression'] });
    } else {
      const allAvailable = [...SECTIONS_POOL, ...customSections];
      const sectionIds = (layout.sections || []).map(name => allAvailable.find(p => p.name === name)?.id).filter(Boolean);
      setEditLayout({ ...layout, selectedSections: sectionIds });
    }
    setIsLayoutDrawerOpen(true);
  };

  const handleSaveLayout = () => {
    const allAvailable = [...SECTIONS_POOL, ...customSections];
    const sectionNames = editLayout.selectedSections.map(sid => allAvailable.find(p => p.id === sid)?.name).filter(Boolean);
    if (editLayout.id) {
       setLayouts(layouts.map(l => l.id === editLayout.id ? { ...editLayout, sections: sectionNames } : l));
    } else {
       setLayouts([...layouts, { ...editLayout, id: `L${Date.now()}`, sections: sectionNames }]);
    }
    setIsLayoutDrawerOpen(false);
  };

  const handleAddCustomSection = () => {
    if (!newSectionName.trim()) return;
    const newId = `custom_${Date.now()}`;
    const newSec = { id: newId, name: newSectionName.trim() };
    setCustomSections([...customSections, newSec]);
    setEditLayout(prev => ({ ...prev, selectedSections: [...prev.selectedSections, newId] }));
    setNewSectionName('');
  };

  const handleDeleteLayout = (id) => {
    if (window.confirm('Are you sure you want to permanently delete this reporting protocol? This action cannot be undone.')) {
       setLayouts(layouts.filter(l => l.id !== id));
    }
  };

  const toggleSection = (id) => {
    setEditLayout(prev => {
      const selected = prev.selectedSections.includes(id)
        ? prev.selectedSections.filter(sid => sid !== id)
        : [...prev.selectedSections, id];
      return { ...prev, selectedSections: selected };
    });
  };

  return (
    <div className="page-wrapper board-padding" style={{ paddingTop: '30px' }}>
      <div className="board-hero-header" style={{ 
        marginBottom: '30px', 
        display: 'flex', 
        flexDirection: isMobile ? 'column' : 'row',
        justifyContent: 'space-between', 
        alignItems: isMobile ? 'stretch' : 'flex-end', 
        gap: '20px' 
      }}>
        <div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <h1 style={{ fontSize: isMobile ? '20px' : '24px', fontWeight: 700, color: '#0a1628', letterSpacing: '-0.5px', margin: 0 }}>Referral Intelligence</h1>
            <span style={{ fontSize: '12px', color: '#6b7280', fontWeight: 400, letterSpacing: '0' }}>Strategic networks & payouts</span>
          </div>
        </div>
      </div>

      <ReferralIntelligencePanel
        bulkSend={bulkSend}
        caseLedgerList={caseLedgerList}
        copyDoctorLink={copyDoctorLink}
        doctorList={doctorList}
        emailDoctors={emailDoctors}
        expandedReferrer={expandedReferrer}
        exportParams={exportParams}
        fetchPatientMasterList={fetchPatientMasterList}
        getStatusConfig={getStatusConfig}
        handleDeleteReferrer={handleDeleteReferrer}
        handleExportIntelligence={handleExportIntelligence}
        handleExportLedger={handleExportLedger}
        handleExportMatrix={handleExportMatrix}
        handleExportPatientMasterList={handleExportPatientMasterList}
        handleExportRoster={handleExportRoster}
        handleUnmergeReferrer={handleUnmergeReferrer}
        isAllLedgerSelected={isAllLedgerSelected}
        isExporting={isExporting}
        isMobile={isMobile}
        isTestMode={isTestMode}
        linkSend={linkSend}
        linksBusy={linksBusy}
        linksSort={linksSort}
        loadingMaster={loadingMaster}
        masterSort={masterSort}
        matrixDateStr={matrixDateStr}
        matrixPeriod={matrixPeriod}
        matrixWeekIndex={matrixWeekIndex}
        openBulkAdd={openBulkAdd}
        openLinkSend={openLinkSend}
        patientMasterList={patientMasterList}
        personTypeFilter={personTypeFilter}
        referralAggregated={referralAggregated}
        referralFilterMode={referralFilterMode}
        referralLinksSearch={referralLinksSearch}
        referralLoading={referralLoading}
        referralError={referralError}
        referralUpdatedAt={referralUpdatedAt}
        onRetryReferrals={() => fetchReferralIntelligence()}
        referralLogSearch={referralLogSearch}
        referralMatrixSearch={referralMatrixSearch}
        referralPatientsSearch={referralPatientsSearch}
        referralRange={referralRange}
        referralRosterSearch={referralRosterSearch}
        referralViewMode={referralViewMode}
        rosterSort={rosterSort}
        selectedLedgerRows={selectedLedgerRows}
        selectedLinks={selectedLinks}
        selfSummary={selfSummary}
        sendSelectedLinks={sendSelectedLinks}
        setBulkSend={setBulkSend}
        setDeleteAfterMerge={setDeleteAfterMerge}
        setEditingPatient={setEditingPatient}
        setEditingReferrer={setEditingReferrer}
        setExpandedReferrer={setExpandedReferrer}
        setExportParams={setExportParams}
        setIsMergeModalOpen={setIsMergeModalOpen}
        setIsPatientEditDrawerOpen={setIsPatientEditDrawerOpen}
        setIsReferrerEditDrawerOpen={setIsReferrerEditDrawerOpen}
        setLinkSend={setLinkSend}
        setMatrixDateStr={setMatrixDateStr}
        setMatrixPeriod={setMatrixPeriod}
        setMatrixWeekIndex={setMatrixWeekIndex}
        setPersonTypeFilter={setPersonTypeFilter}
        setReferralFilterMode={setReferralFilterMode}
        setReferralLinksSearch={setReferralLinksSearch}
        setReferralLogSearch={setReferralLogSearch}
        setReferralMatrixSearch={setReferralMatrixSearch}
        setReferralPatientsSearch={setReferralPatientsSearch}
        setReferralRange={setReferralRange}
        setReferralRosterSearch={setReferralRosterSearch}
        setReferralViewMode={setReferralViewMode}
        setSelectedLedgerRows={setSelectedLedgerRows}
        setSelectedLinks={setSelectedLinks}
        setShowExportOverlay={setShowExportOverlay}
        showExportOverlay={showExportOverlay}
        sortedMaster={sortedMaster}
        sortedRoster={sortedRoster}
        submitLinkSend={submitLinkSend}
        temporalMatrixData={temporalMatrixData}
        temporalPatients={temporalPatients}
        toggleAllLedger={toggleAllLedger}
        toggleLedgerSelection={toggleLedgerSelection}
        toggleLinkSel={toggleLinkSel}
        toggleLinksSort={toggleLinksSort}
        toggleMasterSort={toggleMasterSort}
        toggleRosterSort={toggleRosterSort}
        whatsappDoctors={whatsappDoctors}
      />

      {isReferrerEditDrawerOpen && (
        <ReferrerEditDrawer
          isMobile={isMobile}
          editingReferrer={editingReferrer}
          setEditingReferrer={setEditingReferrer}
          handleUpdateReferrer={handleUpdateReferrer}
          isSavingReferrer={isSavingReferrer}
          allReferrers={allReferrers}
          handleUnmergeReferrer={handleUnmergeReferrer}
          setIsMergeModalOpen={setIsMergeModalOpen}
          setIsReferrerEditDrawerOpen={setIsReferrerEditDrawerOpen}
        />
      )}
      <MergeReferrerModal
        isMergeModalOpen={isMergeModalOpen}
        editingReferrer={editingReferrer}
        allReferrers={allReferrers}
        targetReferrerId={targetReferrerId}
        setTargetReferrerId={setTargetReferrerId}
        deleteAfterMerge={deleteAfterMerge}
        setDeleteAfterMerge={setDeleteAfterMerge}
        setIsMergeModalOpen={setIsMergeModalOpen}
        handleMergeReferrer={handleMergeReferrer}
        isMerging={isMerging}
      />
      <UnmergeReferrerModal
        unmergeModalData={unmergeModalData}
        setUnmergeModalData={setUnmergeModalData}
        confirmUnmerge={confirmUnmerge}
        isUnmerging={isUnmerging}
      />
      <DeleteReferrerModal
        deleteModalData={deleteModalData}
        setDeleteModalData={setDeleteModalData}
        confirmDelete={confirmDelete}
        isDeleting={isDeleting}
      />

      {/* Bulk-add partners modal (#21) — Excel upload only */}
      {bulkOpen && (
        <div onClick={() => !bulkSubmitting && setBulkOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100000, padding: '20px' }}>
          <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: '760px', maxHeight: '88vh', display: 'flex', flexDirection: 'column', background: 'white', borderRadius: '20px', boxShadow: '0 30px 70px -15px rgba(0,0,0,0.4)', overflow: 'hidden' }}>
            <div style={{ padding: '20px 24px', borderBottom: '1px solid #eef2f7', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: '17px', fontWeight: 950, color: '#0f172a' }}>Upload partners (Excel)</div>
                <div style={{ fontSize: '11.5px', fontWeight: 600, color: '#94a3b8', marginTop: '2px' }}>Add many at once from an Excel file. Duplicates merge automatically.</div>
              </div>
              <button onClick={() => setBulkOpen(false)} style={{ border: 'none', background: '#f1f5f9', width: '32px', height: '32px', borderRadius: '50%', cursor: 'pointer', fontSize: '15px', fontWeight: 900, color: '#64748b' }}>✕</button>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '18px 24px' }}>
              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '14px' }}>
                <button onClick={downloadBulkTemplate} style={{ padding: '11px 16px', borderRadius: '11px', border: '1px solid #bfdbfe', background: '#eff6ff', color: '#0f52ba', fontSize: '12px', fontWeight: 900, cursor: 'pointer' }}>⬇ Download template</button>
                <label style={{ padding: '11px 16px', borderRadius: '11px', border: '1px dashed #cbd5e1', background: '#f8fafc', color: '#334155', fontSize: '12px', fontWeight: 900, cursor: 'pointer' }}>
                  📤 Choose Excel file
                  <input type="file" accept=".xlsx,.xls,.csv" style={{ display: 'none' }} onChange={e => parseBulkExcel(e.target.files?.[0])} />
                </label>
              </div>
              {bulkRows.length === 0 ? (
                <div style={{ fontSize: '11.5px', color: '#64748b', lineHeight: 1.6, background: '#f8fafc', border: '1px solid #eef2f7', borderRadius: '12px', padding: '14px 16px' }}>
                  <b>Columns:</b> Name (required), Contact, IsDoctor (Yes/No), Specialty, Degree, Email, Address, SupportedByDoctor.<br />
                  Download the template, fill it in, then choose the file. The partners load below for review before you add them.
                </div>
              ) : (
                <div>
                  <div style={{ fontSize: '10px', fontWeight: 950, color: '#94a3b8', letterSpacing: '0.5px', marginBottom: '8px' }}>{bulkRows.length} PARTNER{bulkRows.length === 1 ? '' : 'S'} READY — REVIEW</div>
                  {bulkRows.map((r, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '9px 12px', marginBottom: '6px', borderRadius: '10px', border: '1px solid #eef2f7', background: '#f8fafc' }}>
                      <span style={{ flexShrink: 0, padding: '3px 8px', borderRadius: '999px', fontSize: '9px', fontWeight: 900, color: r.isDoctor ? '#0f52ba' : '#b45309', background: r.isDoctor ? '#eff6ff' : '#fff7ed' }}>{r.isDoctor ? 'Doctor' : 'Agent'}</span>
                      <span style={{ flex: 1, minWidth: 0, fontSize: '12.5px', fontWeight: 800, color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.name}{r.specialty ? <span style={{ color: '#94a3b8', fontWeight: 600 }}> · {r.specialty}</span> : null}</span>
                      <span style={{ flexShrink: 0, fontSize: '11.5px', fontWeight: 700, color: '#64748b' }}>{r.contact || '—'}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div style={{ padding: '16px 24px', borderTop: '1px solid #eef2f7', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
              <div style={{ fontSize: '12px', fontWeight: 700, color: bulkResult ? '#15803d' : '#94a3b8' }}>
                {bulkResult ? `✓ ${bulkResult.created} added · ${bulkResult.merged} merged · ${bulkResult.skipped} skipped` : `${bulkRows.filter(r => (r.name || '').trim()).length} ready to add`}
              </div>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button onClick={() => setBulkOpen(false)} style={{ padding: '11px 18px', borderRadius: '11px', border: 'none', background: '#f1f5f9', color: '#475569', fontSize: '12px', fontWeight: 900, cursor: 'pointer' }}>{bulkResult ? 'Close' : 'Cancel'}</button>
                <button onClick={submitBulkAdd} disabled={bulkSubmitting || bulkRows.length === 0} style={{ padding: '11px 20px', borderRadius: '11px', border: 'none', background: (bulkSubmitting || bulkRows.length === 0) ? '#cbd5e1' : 'linear-gradient(135deg,#0f52ba,#1d4ed8)', color: 'white', fontSize: '12px', fontWeight: 900, cursor: (bulkSubmitting || bulkRows.length === 0) ? 'not-allowed' : 'pointer' }}>{bulkSubmitting ? 'Adding…' : `Add ${bulkRows.filter(r => (r.name || '').trim()).length} partner${bulkRows.filter(r => (r.name || '').trim()).length === 1 ? '' : 's'}`}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Doctor portal links (#3) are now the dedicated "Doctor Links" tab
          (renderLinksView) — the old modal was replaced by it. */}

      {isPatientEditDrawerOpen && (
        <PatientEditDrawer
          isMobile={isMobile}
          editingPatient={editingPatient}
          setEditingPatient={setEditingPatient}
          handleUpdatePatient={handleUpdatePatient}
          isSavingPatient={isSavingPatient}
          setIsPatientEditDrawerOpen={setIsPatientEditDrawerOpen}
        />
      )}
      {isUserDrawerOpen && (
        <div className="drawer-overlay" onClick={() => { setIsUserDrawerOpen(false); setUserRegStep(1); }} style={{ backdropFilter: 'blur(8px)', background: 'rgba(10, 22, 40, 0.4)' }}>
           <div className="drawer-content" style={{ 
             padding: 0, 
             width: isMobile ? '100%' : '500px',
             borderRadius: isMobile ? 0 : '24px 0 0 24px', 
             background: '#fff',
             boxShadow: '-20px 0 60px rgba(0,0,0,0.1)',
             display: 'flex',
             flexDirection: 'column'
           }} onClick={e => e.stopPropagation()}>
              
              {/* Tactical Header */}
              <div className="drawer-header" style={{ 
                background: 'linear-gradient(135deg, #0f52ba 0%, #061a40 100%)', 
                color: 'white', 
                padding: '40px 30px',
                position: 'relative',
                overflow: 'hidden'
              }}>
                 {/* Decorative HUD Lines */}
                 <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '1px', background: 'rgba(255,255,255,0.1)' }}></div>
                 <div style={{ position: 'absolute', top: '10px', left: '30px', width: '20px', height: '2px', background: 'var(--tactical-cyan)' }}></div>
                 
                 <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <span style={{ fontSize: '10px', fontWeight: 950, letterSpacing: '3px', color: 'var(--tactical-cyan)', textTransform: 'uppercase' }}>Personnel Deployment</span>
                        <h2 style={{ fontWeight: 950, fontSize: '24px', letterSpacing: '-0.5px' }}>{editUser?.id ? 'CONFIG_IDENTITY' : 'INIT_REGISTRATION'}</h2>
                    </div>
                    <button className="btn-close" style={{ color: 'white', opacity: 0.6, fontSize: '28px' }} onClick={() => { setIsUserDrawerOpen(false); setUserRegStep(1); }}>&times;</button>
                 </div>

                 {/* Pulse Badge */}
                 <div style={{ 
                   marginTop: '20px',
                   display: 'inline-flex',
                   alignItems: 'center',
                   gap: '8px',
                   padding: '6px 14px',
                   background: 'rgba(255,255,255,0.1)',
                   borderRadius: '20px',
                   border: '1px solid rgba(255,255,255,0.1)'
                 }}>
                    <div className="tactical-node-active" style={{ width: '6px', height: '6px' }}></div>
                    <span style={{ fontSize: '11px', fontWeight: 500, letterSpacing: '0' }}>Step {userRegStep}: {(userRegStep === 1 ? 'Basic Info' : 'Credentials')}</span>
                 </div>
              </div>

              <div style={{ flex: 1, overflowY: 'auto', padding: '40px 30px' }}>
                 <form onSubmit={handleSaveUser}>
                    {userRegStep === 1 && (
                      <div className="wizard-step" style={{ animation: 'slideRight 0.4s ease' }}>
                        
                        {/* Validation HUD Summary */}
                        {(!editUser.name || !editUser.email || editUser.roles.length === 0) && (
                          <div style={{ 
                            background: '#fff9f0', 
                            border: '1px solid #ffe8cc', 
                            padding: '16px', 
                            borderRadius: '16px', 
                            marginBottom: '30px',
                            display: 'flex',
                            gap: '12px',
                            alignItems: 'center'
                          }}>
                            <span style={{ fontSize: '20px' }}>⚠️</span>
                            <div>
                              <div style={{ fontSize: '11px', fontWeight: 950, color: '#f39c12' }}>ACTION REQUIRED</div>
                              <div style={{ fontSize: '10px', color: '#888' }}>Personnel profile core parameters missing or invalid.</div>
                            </div>
                          </div>
                        )}

                        <div className="form-group" style={{ marginBottom: '30px' }}>
                           <label style={{ fontSize: '10px', fontWeight: 950, color: '#aaa', textTransform: 'uppercase', letterSpacing: '1px', display: 'block', marginBottom: '12px' }}>Operational Alias (Full Name)</label>
                           <input 
                             type="text" 
                             required 
                             placeholder="Ex: John Doe"
                             value={editUser?.name} 
                             onChange={e => setEditUser({...editUser, name: e.target.value})} 
                             style={{ 
                               width: '100%', 
                               border: 'none', 
                               borderBottom: '2px solid #f0f0f0', 
                               fontSize: '18px', 
                               fontWeight: 800, 
                               padding: '12px 0', 
                               outline: 'none',
                               color: '#1a1a2e',
                               transition: 'border-color 0.3s ease'
                             }} 
                             onFocus={(e) => e.target.style.borderBottomColor = 'var(--tactical-cyan)'}
                             onBlur={(e) => e.target.style.borderBottomColor = '#f0f0f0'}
                           />
                        </div>
                        
                        <div style={{ display: 'flex', gap: '30px', marginBottom: '35px' }}>
                           <div className="form-group" style={{ flex: 1 }}>
                               <label style={{ fontSize: '10px', fontWeight: 950, color: '#aaa', textTransform: 'uppercase', letterSpacing: '1px', display: 'block', marginBottom: '10px' }}>System UID (Email)</label>
                               <input type="email" required value={editUser?.email} onChange={e => setEditUser({...editUser, email: e.target.value})} style={{ width: '100%', border: 'none', borderBottom: '1px solid #f0f0f0', fontSize: '14px', fontWeight: 700, padding: '10px 0', outline: 'none' }} />
                           </div>
                           <div className="form-group" style={{ flex: 1 }}>
                               <label style={{ fontSize: '10px', fontWeight: 950, color: '#aaa', textTransform: 'uppercase', letterSpacing: '1px', display: 'block', marginBottom: '10px' }}>Mobile Contact</label>
                               <input type="tel" required placeholder="+91 000-000-0000" value={editUser?.mobile} onChange={e => setEditUser({...editUser, mobile: e.target.value})} style={{ width: '100%', border: 'none', borderBottom: '1px solid #f0f0f0', fontSize: '14px', fontWeight: 700, padding: '10px 0', outline: 'none' }} />
                           </div>
                        </div>

                        <div style={{ display: 'flex', gap: '30px', marginBottom: '35px' }}>
                           <div className="form-group" style={{ flex: 1, position: 'relative' }}>
                               <label style={{ fontSize: '10px', fontWeight: 950, color: '#aaa', textTransform: 'uppercase', letterSpacing: '1px', display: 'block', marginBottom: '10px' }}>Access Crypt (Password)</label>
                               <input type={showPasswords ? "text" : "password"} required autoComplete="new-password" value={editUser?.password} onChange={e => setEditUser({...editUser, password: e.target.value})} style={{ width: '100%', border: 'none', borderBottom: '1px solid #f0f0f0', fontSize: '14px', fontWeight: 700, padding: '10px 0', outline: 'none' }} />
                               <button 
                                 type="button" 
                                 onClick={() => setShowPasswords(!showPasswords)}
                                 style={{ position: 'absolute', right: 0, bottom: '10px', background: 'none', border: 'none', cursor: 'pointer', fontSize: '12px', opacity: 0.5 }}
                               >
                                 {showPasswords ? 'HIDE' : 'SHOW'}
                               </button>
                           </div>
                           <div className="form-group" style={{ flex: 1 }}>
                               <label style={{ fontSize: '10px', fontWeight: 950, color: '#aaa', textTransform: 'uppercase', letterSpacing: '1px', display: 'block', marginBottom: '10px' }}>Confirm Crypt</label>
                               <input type={showPasswords ? "text" : "password"} required autoComplete="new-password" value={editUser?.confirmPassword} onChange={e => setEditUser({...editUser, confirmPassword: e.target.value})} style={{ width: '100%', border: 'none', borderBottom: '1px solid #f0f0f0', fontSize: '14px', fontWeight: 700, padding: '10px 0', outline: 'none' }} />
                               {editUser.password && editUser.confirmPassword && editUser.password !== editUser.confirmPassword && (
                                 <div style={{ fontSize: '8px', color: '#e74c3c', fontWeight: 900, marginTop: '4px' }}>MISMATCH DETECTED</div>
                               )}
                           </div>
                        </div>

                        <div className="form-group" style={{ marginBottom: '30px' }}>
                           <label style={{ fontSize: '10px', fontWeight: 950, color: '#aaa', textTransform: 'uppercase', letterSpacing: '1px', display: 'block', marginBottom: '15px' }}>Assigned Directives (Multi-Role Select)</label>
                           
                           <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                              {[
                                { id: 'doctor',       label: 'Doctor',       desc: 'Precision Reporting',  color: '#0891b2', icon: '👨‍⚕️' },
                                { id: 'technician',   label: 'Technician',   desc: 'Ops & Acquisition',    color: '#f39c12', icon: '🩻'  },
                                { id: 'receptionist', label: 'Receptionist', desc: 'Patient Dispatch',      color: '#e84393', icon: '📋'  },
                                { id: 'admin',        label: 'Admin',        desc: 'Governance Control',    color: '#0f52ba', icon: '🏢'  },
                                { id: 'accountant',   label: 'Accountant',   desc: 'Financial Comptroller', color: '#059669', icon: '📊'  },
                                ...(currentUser.roles?.[0] === 'admindoctor' ? [{ id: 'admindoctor', label: 'AdminDoctor', desc: 'Master Authority', color: '#6366f1', icon: '⭐' }] : []),
                                ...getCustomRoles(activeCenter?.id).map(cr => ({
                                  id: cr.roleName,
                                  label: cr.roleName,
                                  desc: 'Custom Permission Set',
                                  color: '#319795',
                                  icon: '👤'
                                }))
                              ].map(role => {
                                const isSelected = editUser.roles.includes(role.id);
                                return (
                                  <div 
                                    key={role.id}
                                    onClick={() => {
                                      const newRoles = isSelected 
                                        ? editUser.roles.filter(r => r !== role.id)
                                        : [...editUser.roles, role.id];
                                      setEditUser({ ...editUser, roles: newRoles });
                                    }}
                                    style={{ 
                                      padding: '12px 16px',
                                      borderRadius: '16px',
                                      border: `1px solid ${isSelected ? role.color : '#eee'}`,
                                      background: isSelected ? `${role.color}05` : 'white',
                                      cursor: 'pointer',
                                      transition: 'all 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: '12px',
                                      boxShadow: isSelected ? `0 4px 12px ${role.color}15` : 'none'
                                    }}
                                  >
                                    <div style={{ 
                                      width: '32px', height: '32px', borderRadius: '10px', 
                                      background: isSelected ? role.color : '#f8f9fa',
                                      color: isSelected ? 'white' : '#888',
                                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                                      fontSize: '16px'
                                    }}>
                                      {role.icon}
                                    </div>
                                    <div style={{ flex: 1 }}>
                                      <div style={{ fontSize: '12px', fontWeight: 950, color: isSelected ? role.color : '#1a1a2e' }}>{role.label.toUpperCase()}</div>
                                      <div style={{ fontSize: '8px', color: '#aaa', fontWeight: 700 }}>{role.desc.toUpperCase()}</div>
                                    </div>
                                    {isSelected && <div style={{ color: role.color, fontSize: '10px' }}>[x]</div>}
                                  </div>
                                );
                              })}
                           </div>
                        </div>

                        {(editUser.roles.includes('doctor') || editUser.roles.includes('admindoctor')) && (
                          <div style={{ 
                            background: 'rgba(15, 82, 186, 0.05)', 
                            padding: '16px', 
                            borderRadius: '16px', 
                            border: '1px dashed #0f52ba', 
                            marginTop: '20px',
                            display: 'flex',
                            gap: '12px'
                          }}>
                             <div style={{ fontSize: '10px', color: '#0f52ba', fontWeight: 800, lineHeight: 1.4 }}>
                                CLINICAL ACTIVATION DETECTED: <br/>
                                <span style={{ opacity: 0.7 }}>Phase 2 will initiate clinical credential syncing for reporting authorization.</span>
                             </div>
                          </div>
                        )}
                      </div>
                    )}

                    {userRegStep === 2 && (
                      <div className="wizard-step" style={{ animation: 'slideLeft 0.4s ease' }}>
                        <div style={{ 
                          background: '#f0faff', 
                          padding: '24px', 
                          borderRadius: '20px', 
                          marginBottom: '35px', 
                          border: '1px solid #e0f2fe',
                          position: 'relative',
                          overflow: 'hidden'
                        }}>
                          <p style={{ fontSize: '10px', fontWeight: 950, color: '#0f52ba', letterSpacing: '2px', marginBottom: '8px' }}>CLINICAL REGISTRY</p>
                          <p style={{ fontSize: '12px', color: '#64748b', fontWeight: 600, lineHeight: 1.5 }}>Authorized clinical reporting requires verified professional credentials and licensing data.</p>
                        </div>

                        <div className="form-group" style={{ marginBottom: '30px' }}>
                           <label style={{ fontSize: '10px', fontWeight: 950, color: '#aaa', textTransform: 'uppercase', letterSpacing: '1px', display: 'block', marginBottom: '10px' }}>Core Specialization / Wing</label>
                           <input type="text" placeholder="e.g. Neuroradiologist" value={editUser?.specialization} onChange={e => setEditUser({...editUser, specialization: e.target.value})} style={{ width: '100%', border: 'none', borderBottom: '1px solid #f0f0f0', fontSize: '15px', fontWeight: 700, padding: '10px 0', outline: 'none' }} />
                        </div>

                        <div style={{ display: 'flex', gap: '30px', marginBottom: '30px' }}>
                           <div className="form-group" style={{ flex: 1 }}>
                               <label style={{ fontSize: '10px', fontWeight: 950, color: '#aaa', textTransform: 'uppercase', letterSpacing: '1px', display: 'block', marginBottom: '10px' }}>Registration License #</label>
                               <input type="text" placeholder="Ex: PMC-894-0" value={editUser?.licenseNo} onChange={e => setEditUser({...editUser, licenseNo: e.target.value})} style={{ width: '100%', border: 'none', borderBottom: '1px solid #f0f0f0', fontSize: '14px', fontWeight: 700, padding: '10px 0', outline: 'none' }} />
                           </div>
                           <div className="form-group" style={{ flex: 1 }}>
                               <label style={{ fontSize: '10px', fontWeight: 950, color: '#aaa', textTransform: 'uppercase', letterSpacing: '1px', display: 'block', marginBottom: '10px' }}>Primary Professional Degree</label>
                               <input type="text" placeholder="MBBS, MD" value={editUser?.degree} onChange={e => setEditUser({...editUser, degree: e.target.value})} style={{ width: '100%', border: 'none', borderBottom: '1px solid #f0f0f0', fontSize: '14px', fontWeight: 700, padding: '10px 0', outline: 'none' }} />
                           </div>
                        </div>
                      </div>
                    )}

                    <div className="drawer-footer" style={{ marginTop: '40px', display: 'flex', gap: '15px' }}>
                      {userRegStep === 1 ? (
                        <>
                          <button type="button" className="btn-logout" style={{ flex: 1, padding: '18px', borderRadius: '16px', border: '1px solid #eee' }} onClick={() => { setIsUserDrawerOpen(false); setUserRegStep(1); }}>ABORT</button>
                          <button 
                            type="submit" 
                            className="btn-primary" 
                            style={{ flex: 2, padding: '18px', borderRadius: '16px', background: '#0f52ba', color: 'white', fontWeight: 950, fontSize: '11px', letterSpacing: '1px' }}
                          >
                            {(editUser.roles.includes('doctor') || editUser.roles.includes('admindoctor')) ? 'NEXT: CREDENTIALS' : 'FINALIZE DEPLOYMENT'}
                          </button>
                        </>
                      ) : (
                        <>
                          <button type="button" className="btn-logout" style={{ flex: 1, padding: '18px', borderRadius: '16px', border: '1px solid #eee' }} onClick={() => setUserRegStep(1)}>REVERT</button>
                          <button 
                            type="submit" 
                            className="btn-primary" 
                            style={{ flex: 2, padding: '18px', borderRadius: '16px', background: 'var(--tactical-indigo)', color: 'white', fontWeight: 950, fontSize: '11px', letterSpacing: '1px' }}
                          >
                            COMPLETE DOCTOR SYNC
                          </button>
                        </>
                      )}
                    </div>
                 </form>
              </div>
           </div>
        </div>
      )}

      {/* Layout Builder Drawer (Original) */}
      {isLayoutDrawerOpen && (
        <div className="drawer-overlay" onClick={() => setIsLayoutDrawerOpen(false)}>
           <div className="drawer-content" style={{ width: isMobile ? '100%' : '500px', borderRadius: isMobile ? 0 : '24px 0 0 24px' }} onClick={e => e.stopPropagation()}>
              <div className="drawer-header">
                 <h2>{editLayout.id ? 'Edit Layout' : 'New Reporting Layout'}</h2>
                 <button className="btn-close" onClick={() => setIsLayoutDrawerOpen(false)}>&times;</button>
              </div>
              <div className="drawer-body">
                 <div className="form-group">
                    <label>Layout Name</label>
                    <input type="text" value={editLayout.name} onChange={e => setEditLayout({...editLayout, name: e.target.value})} />
                 </div>
                 <div style={{ display: 'flex', gap: '10px' }}>
                    <div className="form-group" style={{ flex: 1 }}>
                       <label>Modality</label>
                       <select value={editLayout.modality} onChange={e => setEditLayout({...editLayout, modality: e.target.value})}>
                          <option>X-RAY</option><option>MRI</option><option>CT</option><option>US</option>
                       </select>
                    </div>
                    <div className="form-group" style={{ flex: 1 }}>
                       <label>Study Type</label>
                       <input type="text" placeholder="e.g. Chest" value={editLayout.type} onChange={e => setEditLayout({...editLayout, type: e.target.value})} />
                    </div>
                 </div>
                 <div style={{ marginTop: '20px' }}>
                    <label style={{ fontSize: '12px', fontWeight: 700, display: 'block', marginBottom: '10px' }}>LAYOUT SECTIONS</label>
                    
                    {/* Custom Section Provider */}
                    <div style={{ display: 'flex', gap: '8px', marginBottom: '15px' }}>
                       <input 
                          type="text" 
                          placeholder="Ex: Technical Details" 
                          value={newSectionName} 
                          onChange={e => setNewSectionName(e.target.value)} 
                          style={{ flex: 1, padding: '10px', fontSize: '13px', borderRadius: '8px', border: '1px solid #ddd' }}
                       />
                       <button 
                          onClick={handleAddCustomSection}
                          style={{ background: '#0f52ba', color: 'white', border: 'none', padding: '0 15px', borderRadius: '8px', fontSize: '11px', fontWeight: 900, cursor: 'pointer' }}
                       >
                          + ADD CUSTOM
                       </button>
                    </div>

                    <div className="builder-list">
                       {[...SECTIONS_POOL, ...customSections].map((s) => {
                          const isActive = editLayout.selectedSections.includes(s.id);
                          const isCustom = s.id.startsWith('custom_');
                          return (
                            <div key={s.id} className="builder-item" style={{ opacity: isActive ? 1 : 0.5, borderLeft: isCustom ? '2px solid #0f52ba' : 'none' }}>
                               <div className="builder-item-info">
                                  <span>{s.name}</span>
                                  {isCustom && <span style={{ fontSize: '7px', color: '#0f52ba', display: 'block', fontWeight: 900 }}>CUSTOM</span>}
                               </div>
                               <button className={`builder-btn ${isActive ? 'active' : ''}`} onClick={() => toggleSection(s.id)}>{isActive ? 'ON' : 'OFF'}</button>
                            </div>
                          );
                       })}
                    </div>
                 </div>
              </div>
              <div className="drawer-footer">
                 <button className="btn-logout" onClick={() => setIsLayoutDrawerOpen(false)}>Cancel</button>
                 <button className="btn-primary" onClick={handleSaveLayout}>Save Configuration</button>
              </div>
           </div>
        </div>
      )}

      {/* Import Status HUD Overlay */}
      {importResult && (
        <div className="modal-overlay" onClick={() => setImportResult(null)} style={{ zIndex: 10000 }}>
          <div style={{ width: '450px', background: 'white', borderRadius: '24px', padding: '35px', boxShadow: '0 25px 70px rgba(0,0,0,0.3)', position: 'relative' }}>
            <button onClick={() => setImportResult(null)} style={{ position: 'absolute', top: '20px', right: '20px', background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', opacity: 0.5 }}>✕</button>
            
            <div style={{ textAlign: 'center', marginBottom: '25px' }}>
              <div style={{ width: '60px', height: '60px', borderRadius: '50%', background: '#e9f7ef', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: 950, color: '#2ecc71', margin: '0 auto 15px', border: '1px solid #2ecc7130' }}>OK</div>
              <h3 style={{ fontSize: '16px', fontWeight: 950, color: '#1e293b' }}>IMPORT RECONNAISSANCE REPORT</h3>
              <p style={{ fontSize: '11px', color: '#888', fontWeight: 700, marginTop: '4px' }}>Data synchronization cycle completed.</p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginBottom: '25px' }}>
              <div style={{ background: '#f0fdf4', padding: '15px', borderRadius: '16px', border: '1px solid #bcf0da', textAlign: 'center' }}>
                <div style={{ fontSize: '24px', fontWeight: 950, color: '#166534' }}>{importResult.successCount}</div>
                <div style={{ fontSize: '9px', fontWeight: 800, color: '#166534', letterSpacing: '1px' }}>SUCCESSFUL DEPLOYMENTS</div>
              </div>
              <div style={{ background: '#fef2f2', padding: '15px', borderRadius: '16px', border: '1px solid #fecaca', textAlign: 'center' }}>
                <div style={{ fontSize: '24px', fontWeight: 950, color: '#991b1b' }}>{importResult.failureCount}</div>
                <div style={{ fontSize: '11px', fontWeight: 600, color: '#991b1b', letterSpacing: '0' }}>Errors</div>
              </div>
            </div>

            {importResult.errors?.length > 0 && (
              <div style={{ maxHeight: '150px', overflowY: 'auto', background: '#f8fafc', padding: '15px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                <p style={{ fontSize: '9px', fontWeight: 950, color: '#64748b', marginBottom: '8px', letterSpacing: '1px' }}>FAILURE LOGS:</p>
                {importResult.errors.map((err, i) => (
                  <div key={i} style={{ fontSize: '10px', color: '#ef4444', fontWeight: 700, padding: '4px 0', borderBottom: '1px solid #f1f5f9' }}>
                    • {err}
                  </div>
                ))}
              </div>
            )}

            <button 
              onClick={() => setImportResult(null)}
              style={{ width: '100%', marginTop: '25px', padding: '16px', background: '#0f52ba', color: 'white', border: 'none', borderRadius: '14px', fontWeight: 950, fontSize: '11px', letterSpacing: '1px', cursor: 'pointer' }}
            >
              CLOSE REPORT
            </button>
          </div>
        </div>
      )}


    </div>
  );

  function renderChainDrawer() {
    return (
      <div className="drawer-overlay" onClick={() => setIsChainDrawerOpen(false)} style={{ backdropFilter: 'blur(8px)', background: 'rgba(10, 22, 40, 0.4)', zIndex: 10000 }}>
        <div className="drawer-content" style={{ padding: 0, width: isMobile ? '100%' : '450px', borderRadius: isMobile ? 0 : '24px 0 0 24px', background: 'white', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>
          <div style={{ padding: '35px', background: 'linear-gradient(135deg, #0f52ba 0%, #061a40 100%)', color: 'white' }}>
             <h2 style={{ fontSize: '11px', fontWeight: 950, color: 'var(--tactical-cyan)', letterSpacing: '3px', textTransform: 'uppercase', marginBottom: '8px' }}>Infrastructure Deployment</h2>
             <div style={{ fontSize: '20px', fontWeight: 950, letterSpacing: '-1px' }}>REGISTER NEW CHAIN</div>
             <p style={{ fontSize: '10px', color: 'rgba(255,255,255,0.6)', marginTop: '10px', fontWeight: 600 }}>Spawning new institutional node and re-mapping administrative authority.</p>
          </div>

          <div style={{ padding: '35px' }}>
            <form onSubmit={handleDeployChain} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
               <div className="input-group">
                  <label style={{ display: 'block', fontSize: '9px', fontWeight: 950, color: '#94a3b8', letterSpacing: '2px', marginBottom: '10px' }}>CHAIN BRAND NAME</label>
                  <input 
                    type="text" 
                    required 
                    value={newChainData.chainName} 
                    onChange={e => setNewChainData({...newChainData, chainName: e.target.value})} 
                    placeholder="e.g. GLOBAL RADIOLOGY NETWORKS"
                    style={{ width: '100%', padding: '14px', borderRadius: '12px', border: '1px solid #eee', fontSize: '12px', fontWeight: 700 }}
                  />
               </div>
               <div className="input-group">
                  <label style={{ display: 'block', fontSize: '9px', fontWeight: 950, color: '#94a3b8', letterSpacing: '2px', marginBottom: '10px' }}>CENTRE NAME</label>
                  <input 
                    type="text" 
                    required 
                    value={newChainData.hospitalName} 
                    onChange={e => setNewChainData({...newChainData, hospitalName: e.target.value})} 
                    placeholder="e.g. CITY DIAGNOSTIC HUB"
                    style={{ width: '100%', padding: '14px', borderRadius: '12px', border: '1px solid #eee', fontSize: '12px', fontWeight: 700 }}
                  />
               </div>
               <div className="input-group">
                  <label style={{ display: 'block', fontSize: '9px', fontWeight: 950, color: '#94a3b8', letterSpacing: '2px', marginBottom: '10px' }}>NODE LOCATION (ADDRESS)</label>
                  <textarea 
                    required 
                    rows="3"
                    value={newChainData.hospitalAddress} 
                    onChange={e => setNewChainData({...newChainData, hospitalAddress: e.target.value})} 
                    placeholder="FULL INSTITUTIONAL ADDRESS"
                    style={{ width: '100%', padding: '14px', borderRadius: '12px', border: '1px solid #eee', fontSize: '12px', fontWeight: 700, resize: 'none' }}
                  />
               </div>

               <div style={{ marginTop: '30px', display: 'flex', gap: '15px' }}>
                  <button type="button" onClick={() => setIsChainDrawerOpen(false)} style={{ flex: 1, padding: '16px', borderRadius: '16px', border: '1px solid #eee', fontWeight: 800 }}>ABORT</button>
                  <button 
                    type="submit" 
                    disabled={isDeployingChain}
                    style={{ flex: 2, padding: '16px', borderRadius: '16px', background: '#0f52ba', color: 'white', fontWeight: 950, border: 'none', cursor: 'pointer' }}
                  >
                    {isDeployingChain ? 'DEPLOYING...' : 'INITIATE DEPLOYMENT →'}
                  </button>
               </div>
            </form>
          </div>
        </div>
      </div>
    );
  }


}
