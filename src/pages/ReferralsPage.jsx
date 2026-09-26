import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import apiClient, { BASE_URL } from '../api/apiClient';
import useSourceVisits from '../hooks/useSourceVisits';
import useFinanceRevision from '../hooks/useFinanceRevision';
import { buildPatientAge, formatPatientAge } from '../utils/patientAge';
import '../styles/global.css';
import '../styles/AdminBoard.css';
import { notifyToast } from '../utils/toast';
import { celebrate } from '../utils/celebrate';
import * as XLSX from 'xlsx-js-style';
import DoctorLinkSendSheet from './referrals/DoctorLinkSendSheet';
import DoctorLinksView from './referrals/DoctorLinksView';
import { getISODate, getOverviewDates, fmtLocalISO } from './referrals/dateRanges';
import { downloadCsv, csvCell, csvPhone, csvNumber } from '../utils/csv';
import ReferrerEditDrawer from './referrals/ReferrerEditDrawer';
import { UnmergeReferrerModal, DeleteReferrerModal, MergeReferrerModal } from './referrals/ReferrerLifecycleModals';
import PatientEditDrawer from './referrals/PatientEditDrawer';
import ReferralIntelligencePanel from './referrals/ReferralIntelligencePanel';


// --- HELPERS ---
const TODAY = getISODate(0);

export default function ReferralsPage() {
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
  
  const [personTypeFilter, setPersonTypeFilter] = useState('ALL'); // ALL | DOCTOR | OTHER | SELF (#2)
  // Source Analytics + Case Ledger: hide a registered partner that has zero visits in the selected
  // range/filter (they still get a row otherwise, so every roster partner is visible even before
  // their first referral - useful on Partner Network, just noise once there are dozens of them).
  const [hideZeroSources, setHideZeroSources] = useState(false);
  
  // Referral Intel State
  // Lazy init with the CURRENT calendar week (Mon → Sun) so the date inputs
  // reflect the active week the moment the page mounts. We reuse the same
  // helper the Strategic Outlook timeframe selector uses so D / R / Week
  // semantics never drift apart.
  const [referralRange, setReferralRange] = useState(() => {
    const { start, end } = getOverviewDates('WEEK');
    return { start, end };
  });
  const [patientMasterList, setPatientMasterList] = useState([]);
  const [loadingMaster, setLoadingMaster] = useState(false);
  const [patientMasterError, setPatientMasterError] = useState(null);
  // Default to RANGE — current week. The Case Ledger lands pre-filtered to
  // this week's cases instead of forcing the user to pick a range manually.
  const [referralFilterMode, setReferralFilterMode] = useState('RANGE'); // 'SINGLE', 'RANGE' or 'ALL'
  const [expandedReferrer, setExpandedReferrer] = useState(null);
  const [referralIntelligence, setReferralIntelligence] = useState([]);

  // Source Analytics loads a SUMMARY (one row per source, every total, no visit rows) and fetches a
  // source's visits only when it is opened, a page at a time (useSourceVisits). The old single call
  // returned every visit of every source for the whole range, which got slower with every month of
  // history. Rows are cached per source AND date range.
  const rangeParams = useMemo(() => (referralFilterMode === 'ALL'
    ? {}
    : { startDate: referralRange.start, endDate: referralFilterMode === 'SINGLE' ? referralRange.start : referralRange.end }),
  [referralRange, referralFilterMode]);
  const { sourceVisits, loadSourceVisits, peek: peekVisits, rangeKey } = useSourceVisits(rangeParams);
  const [allReferrers, setAllReferrers] = useState([]);
  const [referralLoading, setReferralLoading] = useState(false);
  // Live-data health for the intelligence/roster fetch: last error (null when the
  // latest load succeeded) and when the figures on screen were last confirmed.
  const [referralError, setReferralError] = useState(null);
  const [referralUpdatedAt, setReferralUpdatedAt] = useState(null);
  const intelSeq = useRef(0);
  const [isExporting, setIsExporting] = useState(false);
  const [referralSort] = useState({ key: 'missions', direction: 'desc' });
  
  // Referral Payout State
  const [showExportOverlay, setShowExportOverlay] = useState(false);
  const [exportParams, setExportParams] = useState({ start: TODAY, end: TODAY, allTime: false });

  // Responsive layout detection
  const [isMobile, setIsMobile] = useState(window.innerWidth < 1024);

  // Bumps when cached finance data changes; added to the analytics fetch
  // effects below so the referral/finance dashboards refresh themselves.
  const financeRev = useFinanceRevision();

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
  // referrerId -> { lastSentAt, lastSentChannel, lastSentExpiresAt, autoRenew, revokedAt } for the Doctor Links tab
  const [linkStatus, setLinkStatus] = useState({});
  const loadLinkStatus = useCallback(async () => {
    try {
      const { data } = await apiClient.get('/referrers/link-status');
      const map = {};
      (Array.isArray(data) ? data : []).forEach(r => { map[r.referrerId] = r; });
      setLinkStatus(map);
    } catch (err) {
      console.warn('[DOCTOR LINKS] link status unavailable', err);   // informational only - the tab still works without it
    }
  }, []);
  const [bulkSend, setBulkSend] = useState(null); // null | { status:'sending'|'done', channel, sent, skipped, failed }
  const patientMasterSeq = useRef(0);
  const doctorList = useMemo(
    () => (allReferrers || []).filter(r => r.isDoctor !== false && (r.name || '').trim().toLowerCase() !== 'self'),
    [allReferrers]
  );
  const buildDoctorLink = async (referrerId) => {
    const { data } = await apiClient.get(`/referrers/${referrerId}/share-link`);
    return `${window.location.origin}/r/${referrerId}?t=${data.token}`;
  };
  // Pull back every portal link ever issued for this doctor (a forwarded message, a
  // lost phone, a doctor who left). Old links stop working immediately; links copied or
  // sent afterwards work. Throws on failure so the confirm dialog can show the reason.
  const revokeDoctorLinks = async (referrerId) => {
    await apiClient.post(`/referrers/${referrerId}/revoke-links`);
    notifyToast('Old links stopped working. Send the doctor a fresh link.', 'success');
    loadLinkStatus();
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
    } finally { setLinksBusy(false); loadLinkStatus(); }
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
    } finally { setLinksBusy(false); loadLinkStatus(); }
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
  const [isTestMode] = useState(false);

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

  // "Aarav Kumar" -> "A. K." - the WhatsApp share is a payout summary sent to an arbitrary chat,
  // so it carries the patient ID, never the full name.
  const initialsOf = (name) => String(name || '').trim().split(/\s+/).filter(Boolean).map(w => w[0].toUpperCase() + '.').join(' ') || 'PATIENT';
  // A visit may carry several service lines; the scalar modality/service is only the first one.
  const visitModalities = (p) => (Array.isArray(p.serviceLines) && p.serviceLines.length > 0
    ? [...new Set(p.serviceLines.map(l => l.modality).filter(Boolean))].join(' + ')
    : (p.modality || ''));
  const visitServices = (p) => (Array.isArray(p.serviceLines) && p.serviceLines.length > 0
    ? p.serviceLines.map(l => l.serviceName).filter(Boolean).join(' + ')
    : (p.service || ''));

  const handleExportLedger = (type) => {
    // Rows come from whatever the screen has loaded (a summary carries none; opened sources hold theirs).
    const loadedRows = new Map();
    [...referralIntelligence.flatMap(r => r.patients || []),
     ...Object.values(sourceVisits).filter(v => v.rangeKey === rangeKey).flatMap(v => v.rows)]
      .forEach(p => loadedRows.set(p.appointmentId || p.patientId, p));
    const selectedData = [...loadedRows.values()].filter(p => selectedLedgerRows.includes(p.appointmentId || p.patientId));
    if (selectedData.length === 0) return;

    if (type === 'EXCEL') {
      const header = ['REFERRAL_ID', 'PATIENT', 'CONTACT', 'MODALITY', 'SERVICE', 'VISIT_DATE', 'BILLED', 'COLLECTED', 'COMMISSION', 'COMMISSION_STATUS', 'VISIT_STATUS', 'ADDRESS', 'SOURCE_OF_INFO'];
      const lines = selectedData.map(p => [
        csvCell(p.patientIdentifier || 'N/A'), csvCell(p.name), csvPhone(p.mobile),
        csvCell(visitModalities(p)), csvCell(visitServices(p)), csvCell(p.registrationDate),
        csvNumber(p.totalAmount), csvNumber(p.paidAmount), csvNumber(p.commissionAmount),
        csvCell(p.commissionStatus), csvCell(p.status),
        csvCell([p.address, p.village, p.district].filter(Boolean).join(', ')), csvCell(p.sourceOfInfo),
      ].join(','));
      downloadCsv(`Referral_Ledger_${fmtLocalISO(new Date())}.csv`, [header.join(','), ...lines]);
    } else if (type === 'WHATSAPP') {
      let msg = `*REFERRAL CASE LEDGER REPORT*\n\n`;
      selectedData.forEach((p, i) => {
        msg += `${i + 1}. *${initialsOf(p.name)}* (${visitModalities(p)})\n   ID: ${p.patientIdentifier || 'N/A'}\n   Service: ${visitServices(p)}\n   Payout: ₹${p.commissionAmount}\n   Status: ${p.status}\n\n`;
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

    const header = ['REFERRING SOURCE', ...temporalMatrixData.cols, 'TOTAL VISITS'].map(csvCell).join(',');
    const lines = temporalMatrixData.rows.map(row => [
      csvCell(row.name || 'ANONYMOUS'),
      ...temporalMatrixData.cols.map(c => csvNumber(row.counts[c])),
      csvNumber(row.total),
    ].join(','));

    // Grand totals row
    if (temporalMatrixData.rows.length > 0) {
      const colTotals = temporalMatrixData.cols.map(c => temporalMatrixData.rows.reduce((sum, r) => sum + (r.counts[c] || 0), 0));
      const grandTotal = temporalMatrixData.rows.reduce((sum, r) => sum + r.total, 0);
      lines.push([csvCell('GRAND TOTAL'), ...colTotals, grandTotal].join(','));
    }

    downloadCsv(`Referral_Matrix_${matrixPeriod}_${matrixDateStr}_${fmtLocalISO(new Date())}.csv`, [header, ...lines]);
  };

  const handleExportRoster = () => {
    if (!caseLedgerList || caseLedgerList.length === 0) {
      notifyToast('No partners to export yet.', 'info');
      return;
    }
    // Plain, complete headers - every detail a partner row carries.
    const header = [
      'Rank', 'Partner Name', 'Type', 'Speciality', 'Degree', 'Supporting Doctor',
      'Email', 'Contact Number', 'Address', 'Total Visits', 'Total Billed',
      'Total Commission', 'Total Paid Incentive', 'Unpaid Commission',
    ].map(csvCell).join(',');
    const lines = caseLedgerList.map((s, i) => [
      i + 1, csvCell(s.name), csvCell(s.isDoctor ? 'Doctor' : 'Other person'),
      csvCell(s.isDoctor ? (s.specialty || '') : ''), csvCell(s.isDoctor ? (s.degree || '') : ''),
      csvCell(!s.isDoctor ? (s.supportedByDoctor || '') : ''),
      csvCell(s.email), csvPhone(s.contact), csvCell(s.address),
      csvNumber(s.patientCount), csvNumber(s.totalRevenue), csvNumber(s.totalCommission),
      csvNumber(s.paidCommission), csvNumber(s.unpaidCommission),
    ].join(','));
    downloadCsv(`Partner_Network_${fmtLocalISO(new Date())}.csv`, [header, ...lines]);
    notifyToast(`Download started — ${caseLedgerList.length} partner${caseLedgerList.length === 1 ? '' : 's'} exported to Excel (CSV).`, 'success');
  };

  const handleExportPatientMasterList = () => {
    if (!patientMasterList || patientMasterList.length === 0) {
      notifyToast('No patients to export yet.', 'info');
      return;
    }
    const header = ['ID', 'PTID', 'Full Name', 'Mobile', 'Age', 'Gender', 'Address', 'Source Of Info', 'Registered Date'].map(csvCell).join(',');
    const lines = patientMasterList.map((p, i) => [
      i + 1, csvCell(p.patientIdentifier), csvCell(p.fullName), csvPhone(p.mobile),
      csvCell(formatPatientAge(p.age)), csvCell(p.gender),
      csvCell([p.address, p.village, p.district].filter(Boolean).join(', ')), csvCell(p.sourceOfInfo),
      csvCell(p.registeredAt ? fmtLocalISO(new Date(p.registeredAt)) : ''),
    ].join(','));
    downloadCsv(`Patient_Master_${fmtLocalISO(new Date())}.csv`, [header, ...lines]);
  };


  // --- API FETCHING ---
  // Live only — no cached fallback. The old fallback was keyed by referralFilterMode alone (not the
  // actual date range or search text), so a failed request could show an EARLIER range's or search's
  // patient list as if it were the one on screen right now.
  const fetchPatientMasterList = useCallback(async () => {
    const seq = ++patientMasterSeq.current;
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
      if (seq !== patientMasterSeq.current) return;
      setPatientMasterList(res.data);
      setPatientMasterError(null);
    } catch (err) {
      if (seq !== patientMasterSeq.current) return;
      console.error('[PATIENT MASTER] Live fetch failed', err);
      setPatientMasterError(!err?.response
        ? 'Cannot reach the server — the patient list shown may be out of date.'
        : 'Could not load the live patient list — the list shown may be out of date.');
    } finally {
      if (seq === patientMasterSeq.current) setLoadingMaster(false);
    }
  }, [referralRange, referralFilterMode, referralPatientsSearch]);

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
      // Summary first; an API that predates it (404) answers the full endpoint, whose rows the
      // screen then simply uses as already loaded.
      const loadIntel = () => apiClient.get('/referrers/intelligence/summary', { params })
        .catch(err => (err?.response?.status === 404 ? apiClient.get('/referrers/intelligence', { params }) : Promise.reject(err)));
      const [res, allRes] = await Promise.all([
        loadIntel(),
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
    fetchReferralIntelligence();
    // financeRev: refresh when a commission/invoice change syncs in.
  }, [financeRev, fetchReferralIntelligence]);

  // Keep the Referrals figures live: refresh quietly every 90s while this tab is
  // showing, and immediately when the browser tab comes back to the foreground
  // (a payout / patient payment recorded on another screen or device shows up
  // without a manual reload).
  useEffect(() => {
    const tick = () => { if (!document.hidden) fetchReferralIntelligence(null, null, false, { silent: true }); };
    const id = setInterval(tick, 90_000);
    document.addEventListener('visibilitychange', tick);
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', tick); };
  }, [fetchReferralIntelligence]);

  // Doctor Links tab: show when each doctor's link was sent / expires / renews.
  useEffect(() => {
    if (referralViewMode === 'LINKS') loadLinkStatus();
  }, [referralViewMode, loadLinkStatus]);

  // Patient Master List
  useEffect(() => {
    if (referralViewMode === 'PATIENTS') {
      fetchPatientMasterList();
    }
  }, [referralViewMode, fetchPatientMasterList]);

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

  const getStatusConfig = (status) => {
    const s = status?.toUpperCase() || 'UNKNOWN';
    if (s.includes('COMPLETED')) return { bg: '#ecfdf5', color: '#059669', label: 'COMPLETED' };
    if (s.includes('CANCEL')) return { bg: '#fef2f2', color: '#dc2626', label: 'CANCELLED' };
    if (s.includes('PROGRESS')) return { bg: '#eff6ff', color: '#2563eb', label: 'IN PROGRESS' };
    if (s.includes('ARRIVE')) return { bg: '#fff7ed', color: '#ea580c', label: 'ARRIVED' };
    return { bg: '#f8fafc', color: '#64748b', label: s };
  };

  // Handle window resize for responsive layout
  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 1024);
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);


  // Referral Intelligence Logic (Moved to top-level to satisfy Rules of Hooks)
  // Every attended visit in range, across all sources (a server total - the summary has no rows).
  const totalAttendedVisits = useMemo(
    () => (referralIntelligence || []).reduce((n, r) => n + (r.totalPatients || 0), 0),
    [referralIntelligence]
  );

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
    // The API labels every source with sourceKind (PARTNER | SELF | UNLINKED | UNATTRIBUTED). "Empty id"
    // used to mean Self, but a typed name with no partner record is ALSO empty-id - so the first such
    // node was shown as Self / Walk-in. (Older API without sourceKind: fall back to the old rule.)
    const node = (referralIntelligence || []).find(
      i => i.sourceKind ? i.sourceKind === 'SELF' : (i.referrerId === EMPTY || i.name === 'Self / Walk-in')
    );
    if (!node) return null;
    return {
      patientCount: node.totalPatients || 0,
      totalRevenue: node.totalRevenue || 0,
      totalCollected: node.totalCollected || 0,
      totalDiscount: node.totalDiscount || 0,
      bookedPending: node.bookedPending || 0,
      noShows: node.noShows || 0,
      patients: node.patients || [],
    };
  }, [referralIntelligence]);

  // Sources that are not partners: a hand-typed referrer name with no partner record (UNLINKED) and
  // visits that record no referrer at all (UNATTRIBUTED). Shown so the totals reconcile and the
  // data gaps can be fixed, instead of being silently dropped.
  const unlinkedSources = useMemo(
    () => (referralIntelligence || []).filter(i => i.sourceKind === 'UNLINKED'),
    [referralIntelligence]
  );
  const unattributedSummary = useMemo(() => {
    const node = (referralIntelligence || []).find(i => i.sourceKind === 'UNATTRIBUTED');
    return node ? { patientCount: node.totalPatients || 0, bookedPending: node.bookedPending || 0, noShows: node.noShows || 0, patients: node.patients || [] } : null;
  }, [referralIntelligence]);

  const referralAggregated = useMemo(() => {
    // Map the backend intelligence DTOs to the frontend's expected Matrix structure. Only real
    // PARTNERS belong here - Self / Walk-in, unlinked names and unattributed visits have their own
    // sections (identified by sourceKind; an empty id is NOT enough to tell them apart).
    const EMPTY = '00000000-0000-0000-0000-000000000000';
    const isPartner = (ref) => (ref.sourceKind
      ? ref.sourceKind === 'PARTNER'
      : (ref.referrerId !== EMPTY && (ref.name || '').trim().toLowerCase() !== 'self' && ref.name !== 'Self / Walk-in'));
    const mapped = referralIntelligence
      .filter(isPartner)
      .map(ref => {
      // Multi-service rollout (batch-5 fix). Per-modality counts walk the ServiceLines array when the
      // server provided it - so a single patient referred for X-Ray + CT + USG contributes 3 counts
      // (one per modality) rather than 1 attributed to the primary scalar. Falls back to the scalar
      // modality when the server is older or the entry has no service lines.
      const key = ref.sourceKey || String(ref.referrerId);
      const cached = sourceVisits[key];
      const cachedForRange = cached && cached.rangeKey === rangeKey ? cached : null;
      const inlineRows = Array.isArray(ref.patients) ? ref.patients : [];
      const rows = inlineRows.length > 0 ? inlineRows : (cachedForRange ? cachedForRange.rows : []);
      const derivedModalities = rows.reduce((acc, p) => {
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
      // The server counts the modality mix over EVERY visit of the source; only an older API lacks it.
      const modalities = ref.modalities || derivedModalities;

      return {
        referrerId: ref.referrerId,
        sourceKey: key,
        name: ref.name,
        contact: ref.contact,
        address: ref.address,
        patients: rows,
        // The number of attended visits is a server total; `patients` is only what has been loaded so far.
        totalPatients: ref.totalPatients ?? rows.length,
        visitsInline: inlineRows.length > 0,
        visitsLoading: !!(cachedForRange && cachedForRange.loading),
        visitsError: cachedForRange ? cachedForRange.error : null,
        modalities,
        totalCommission: ref.totalCommission,
        paidCommission: ref.paidCommission,
        unpaidCommission: ref.unpaidCommission,
        totalRevenue: ref.totalRevenue,
        totalCollected: ref.totalCollected ?? 0,
        totalDiscount: ref.totalDiscount ?? 0,
        netProfit: ref.netProfit,
        // Attendance + real new-vs-returning from the server (null on an older API -> the panel falls back).
        bookedPending: ref.bookedPending ?? 0,
        noShows: ref.noShows ?? 0,
        uniquePatients: ref.uniquePatients ?? null,
        newPatients: ref.newPatients ?? null,
        returningVisits: ref.returningVisits ?? null,
      };
    });

    // When showing ALL records, include registered referrers with zero activity. Merged duplicates are
    // left out: their visits already roll up under their primary partner.
    if (referralFilterMode === 'ALL') {
      const mappedIds = new Set(mapped.map(r => r.referrerId));
      allReferrers.forEach(ref => {
        if ((ref.name || '').trim().toLowerCase() === 'self') return; // Self excluded from partners (#20)
        if (ref.mergedIntoId) return;
        if (!mappedIds.has(ref.referrerId)) {
          mapped.push({
            referrerId: ref.referrerId,
            sourceKey: String(ref.referrerId),
            name: ref.name,
            contact: ref.contact,
            address: ref.address,
            patients: [],
            totalPatients: 0,
            visitsInline: false,
            visitsLoading: false,
            visitsError: null,
            modalities: {},
            totalCommission: 0,
            paidCommission: 0,
            unpaidCommission: 0,
            totalRevenue: 0,
            totalCollected: 0,
            totalDiscount: 0,
            netProfit: 0,
            bookedPending: 0,
            noShows: 0,
            uniquePatients: 0,
            newPatients: 0,
            returningVisits: 0,
          });
        }
      });
    }

    let final = [...mapped];

    // Person-type filter (#2): Doctor / Other / Self. isDoctor comes from the referrer roster
    // (intelligence rows don't carry it). SELF hides partners - the Self / Walk-in card renders separately.
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

    if (hideZeroSources) final = final.filter(r => (r.totalPatients || 0) > 0);

    // Sort. The old comparator never returned 0 (it answered -1 for equal values), which breaks the
    // sort contract - ties flipped order between renders. Equal values now fall back to name, always A-Z.
    const byName = (a, b) => String(a.name || '').localeCompare(String(b.name || ''), undefined, { sensitivity: 'base' });
    final.sort((a, b) => {
      let cmp;
      if (referralSort.key === 'missions') cmp = (a.totalPatients || 0) - (b.totalPatients || 0);
      else if (referralSort.key === 'yield') cmp = (Number(a.totalCommission) || 0) - (Number(b.totalCommission) || 0);
      else if (referralSort.key === 'pending') cmp = (Number(a.unpaidCommission) || 0) - (Number(b.unpaidCommission) || 0);
      else cmp = byName(a, b);
      if (cmp === 0) return byName(a, b);
      return referralSort.direction === 'asc' ? cmp : -cmp;
    });

    if (!referralMatrixSearch) return final;

    const searchLow = referralMatrixSearch.toLowerCase();
    return final.filter(ref => (ref.name || '').toLowerCase().includes(searchLow));
  }, [referralIntelligence, referralViewMode, referralMatrixSearch, referralSort, allReferrers, referralFilterMode, personTypeFilter, sourceVisits, rangeKey, hideZeroSources]);

  // Auto-select first referrer in Matrix mode
  useEffect(() => {
    if (referralViewMode === 'MATRIX' && referralAggregated.length > 0
        && (!expandedReferrer || !referralAggregated.some(r => r.referrerId === expandedReferrer))) {
      setExpandedReferrer(referralAggregated[0].referrerId);
    }
  }, [referralViewMode, referralAggregated, expandedReferrer]);

  // Opening a source loads its visits (page 1); every summary refresh quietly re-reads what is on
  // screen. A source whose rows arrived inline (older API) or that has no visits needs no call.
  const expandedNode = referralAggregated.find(r => r.referrerId === expandedReferrer);
  const expandedKey = expandedNode && !expandedNode.visitsInline && expandedNode.totalPatients > 0 ? expandedNode.sourceKey : null;
  useEffect(() => {
    if (referralViewMode !== 'MATRIX' || !expandedKey) return;
    const cached = peekVisits(expandedKey);
    loadSourceVisits(expandedKey, { silent: !!(cached && cached.rangeKey === rangeKey && cached.rows.length > 0) });
  }, [referralViewMode, expandedKey, referralUpdatedAt, rangeKey, loadSourceVisits, peekVisits]);

  // The Volume Matrix is computed by the SERVER (/referrers/matrix): IST day / hour buckets, the same
  // attribution and "the patient arrived" rule as Source Analytics, merged duplicates rolled into their
  // primary. It used to be rebuilt in the browser from whatever the page-level date range had loaded -
  // so choosing Month / Year (or another week) showed only that range's visits, and the Day view put
  // every visit in "Morning" because visits carried no time.
  // "How They Heard": patients by the channel recorded at registration (/referrers/acquisition-sources),
  // for the same date range the rest of the page uses.
  const [channelData, setChannelData] = useState({ data: null, loading: false, error: null });
  const channelSeq = useRef(0);
  useEffect(() => {
    if (referralViewMode !== 'CHANNELS') return;
    const seq = ++channelSeq.current;
    setChannelData(prev => ({ ...prev, loading: true, error: null }));
    const params = referralFilterMode === 'ALL'
      ? {}
      : { startDate: referralRange.start, endDate: referralFilterMode === 'SINGLE' ? referralRange.start : referralRange.end };
    apiClient.get('/referrers/acquisition-sources', { params })
      .then(res => {
        if (seq !== channelSeq.current) return;
        setChannelData({ data: res.data || null, loading: false, error: null });
      })
      .catch(err => {
        if (seq !== channelSeq.current) return;
        console.error('[PATIENT SOURCES] Live fetch failed', err);
        setChannelData(prev => ({ ...prev, loading: false, error: 'Could not load this report - the figures below may be out of date.' }));
      });
  }, [referralViewMode, referralRange, referralFilterMode]);
  const channelRangeLabel = referralFilterMode === 'ALL'
    ? 'all time'
    : (referralFilterMode === 'SINGLE' || referralRange.start === referralRange.end
        ? referralRange.start
        : `${referralRange.start} to ${referralRange.end}`);

  const [matrixServer, setMatrixServer] = useState({ cols: [], rows: [], loading: false, error: null });
  const matrixSeq = useRef(0);
  useEffect(() => {
    if (referralViewMode !== 'LOG') return;
    const seq = ++matrixSeq.current;
    setMatrixServer(prev => ({ ...prev, loading: true, error: null }));
    apiClient.get('/referrers/matrix', {
      params: { period: matrixPeriod, referenceDate: matrixDateStr || TODAY, weekIndex: matrixWeekIndex },
    })
      .then(res => {
        if (seq !== matrixSeq.current) return;   // a newer selection superseded this one
        setMatrixServer({ cols: res.data?.cols || [], rows: res.data?.rows || [], loading: false, error: null });
      })
      .catch(err => {
        if (seq !== matrixSeq.current) return;
        console.error('[REFERRAL MATRIX] Live fetch failed', err);
        setMatrixServer(prev => ({ ...prev, loading: false, error: 'Could not load the volume matrix — the figures below may be out of date.' }));
      });
  }, [referralViewMode, matrixPeriod, matrixDateStr, matrixWeekIndex]);

  const temporalMatrixData = useMemo(() => {
    if (referralViewMode !== 'LOG') return null;
    const { cols, rows: serverRows } = matrixServer;
    const searchLow = (referralLogSearch || '').toLowerCase();
    const zeroCounts = () => Object.fromEntries(cols.map(c => [c, 0]));
    const docById = new Map((allReferrers || []).map(r => [r.referrerId, r.isDoctor !== false]));
    const partnerVisible = (id) => {
      const isDoc = docById.has(id) ? docById.get(id) : true;
      if (personTypeFilter === 'DOCTOR') return isDoc;
      if (personTypeFilter === 'OTHER') return !isDoc;
      return personTypeFilter !== 'SELF';
    };
    const matches = (name) => !searchLow || String(name || '').toLowerCase().includes(searchLow);

    const partnerRows = new Map(serverRows.filter(r => r.kind === 'PARTNER').map(r => [r.referrerId, r]));
    const rows = [];
    // Every registered PRIMARY partner gets a row (zeros included). Merged duplicates are left out - the
    // server already rolled their visits into the primary.
    (allReferrers || [])
      .filter(ref => !ref.mergedIntoId && (ref.name || '').trim().toLowerCase() !== 'self')
      .forEach(ref => {
        if (!matches(ref.name) || !partnerVisible(ref.referrerId)) return;
        const hit = partnerRows.get(ref.referrerId);
        partnerRows.delete(ref.referrerId);
        rows.push({ referrerId: ref.referrerId, name: ref.name, contact: ref.contact, total: hit?.total || 0, counts: hit?.counts || zeroCounts(), kind: 'PARTNER' });
      });
    // A partner with visits that is not in the roster list (e.g. since deleted).
    partnerRows.forEach(hit => {
      if (!matches(hit.name) || !partnerVisible(hit.referrerId)) return;
      rows.push({ referrerId: hit.referrerId, name: hit.name, contact: hit.contact, total: hit.total, counts: hit.counts, kind: 'PARTNER' });
    });
    // Self / Walk-in, unlinked names and unattributed visits - each its own labelled row, so the matrix
    // adds up to every visit.
    if (personTypeFilter !== 'DOCTOR' && personTypeFilter !== 'OTHER') {
      serverRows.filter(r => r.kind !== 'PARTNER').forEach(r => {
        const label = r.kind === 'SELF' ? 'Self / Walk-in' : r.kind === 'UNATTRIBUTED' ? 'Unattributed (no source recorded)' : r.name;
        if (!matches(label)) return;
        rows.push({ referrerId: null, name: label, contact: '', total: r.total, counts: r.counts, kind: r.kind, isSelf: r.kind === 'SELF' });
      });
    }

    const visibleRows = hideZeroSources ? rows.filter(r => r.total > 0) : rows;
    visibleRows.sort((a, b) => (b.total - a.total) || String(a.name).localeCompare(String(b.name)));
    // Self / Walk-in pinned to the TOP of the matrix by default.
    const selfIdx = visibleRows.findIndex(r => r.isSelf);
    if (selfIdx > 0) { const [selfRow] = visibleRows.splice(selfIdx, 1); visibleRows.unshift(selfRow); }

    return { cols, rows: visibleRows };
  }, [matrixServer, allReferrers, referralViewMode, referralLogSearch, personTypeFilter, hideZeroSources]);

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
        revokeDoctorLinks={revokeDoctorLinks}
        linkStatus={linkStatus}
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
        patientMasterError={patientMasterError}
        retryPatientMasterList={fetchPatientMasterList}
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
        hideZeroSources={hideZeroSources}
        setHideZeroSources={setHideZeroSources}
        channelData={channelData}
        channelRangeLabel={channelRangeLabel}
        rosterSort={rosterSort}
        selectedLedgerRows={selectedLedgerRows}
        selectedLinks={selectedLinks}
        selfSummary={selfSummary}
        unlinkedSources={unlinkedSources}
        unattributedSummary={unattributedSummary}
        referralSort={referralSort}
        matrixLoading={matrixServer.loading}
        matrixError={matrixServer.error}
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
        totalAttendedVisits={totalAttendedVisits}
        loadMoreSourceVisits={(key) => loadSourceVisits(key, { more: true })}
        retrySourceVisits={(key) => loadSourceVisits(key)}
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
    </div>
  );
}
