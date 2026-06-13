import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import apiClient from '../api/apiClient';
import { registerStudy, uploadStudyAssetToStudy } from '../utils/azureUpload';

/**
 * Cloud PACS-only worklist + Upload Center.
 *
 * - Upload Center: drag/drop or pick ZIP/DICOM → register an appointment-free
 *   ImagingStudy → SAS-upload the file → extraction + server-side matching run
 *   on the backend.
 * - Worklist: every study for the centre, newest first.
 * - Inbox: the subset that matched neither a patient nor an appointment and
 *   needs a human to assign it.
 * - Assign: link an inbox study to a patient (search) and/or appointment.
 *
 * PACS-gated route (/studies). The viewer + reporting open by study id.
 */
const TABS = { ALL: 'all', INBOX: 'inbox' };

const Icons = {
  Upload: () => (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  ),
  Search: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.5" y2="16.5" />
    </svg>
  ),
  Check: () => (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  ),
  Inbox: () => (
    <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="22 12 16 12 14 15 10 15 8 12 2 12" /><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
    </svg>
  ),
  Scan: () => (
    <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 7V5a2 2 0 0 1 2-2h2" /><path d="M17 3h2a2 2 0 0 1 2 2v2" /><path d="M21 17v2a2 2 0 0 1-2 2h-2" /><path d="M7 21H5a2 2 0 0 1-2-2v-2" /><circle cx="12" cy="12" r="3.5" />
    </svg>
  ),
  X: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  ),
};

const initials = (name) =>
  (name || '?')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('') || '?';

const AVATAR_HUES = ['#1d4ed8', '#7c3aed', '#0f766e', '#b45309', '#be185d', '#4338ca'];
const avatarColor = (name) => {
  let h = 0;
  for (const c of String(name || '')) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return AVATAR_HUES[h % AVATAR_HUES.length];
};

// Human-readable bytes → "642 KB" / "1.4 GB". 0 / null → "—".
const fmtBytes = (b) => {
  const n = Number(b || 0);
  if (n <= 0) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
};

export default function StudiesPage() {
  const navigate = useNavigate();
  const [tab, setTab] = useState(TABS.ALL);
  const [q, setQ] = useState('');
  const [modality, setModality] = useState('');
  const [dateMode, setDateMode] = useState('all'); // 'all' | 'today' | 'range'
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [studies, setStudies] = useState([]);
  const [total, setTotal] = useState(0);
  const [inboxCount, setInboxCount] = useState(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [storage, setStorage] = useState({ used: 0, quota: null }); // whole-centre usage
  const [sort, setSort] = useState({ by: 'created', dir: 'desc' });
  const PAGE_SIZE = 10;

  // Upload state
  const fileInputRef = useRef(null);
  const [uploads, setUploads] = useState([]); // [{name, pct, stage, error}]
  const [dragOver, setDragOver] = useState(false);

  // Assign modal state
  const [assignFor, setAssignFor] = useState(null); // the study being assigned
  const [assignMode, setAssignMode] = useState('patient'); // 'patient' | 'appointment'
  const [patientQuery, setPatientQuery] = useState('');
  const [patientResults, setPatientResults] = useState([]);
  const [apptQuery, setApptQuery] = useState('');
  const [apptResults, setApptResults] = useState([]);
  const [assignBusy, setAssignBusy] = useState(false);

  // Share-link modal
  const [shareFor, setShareFor] = useState(null);   // study being shared
  const [shareLink, setShareLink] = useState('');
  const [shareBusy, setShareBusy] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);

  // Delete confirm + toast
  const [deleteFor, setDeleteFor] = useState(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [toast, setToast] = useState(null); // { kind: 'ok'|'err', text }
  const toastTimer = useRef(null);
  const showToast = useCallback((kind, text) => {
    setToast({ kind, text });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 4000);
  }, []);
  useEffect(() => () => clearTimeout(toastTimer.current), []);

  const fetchStudies = useCallback(async (opts = {}) => {
    // `silent` skips the full-page loading flash — used by the processing poll
    // so the table updates in place without blinking every few seconds.
    if (!opts.silent) setLoading(true);
    setError(null);
    try {
      const params = { page, pageSize: PAGE_SIZE };
      if (tab === TABS.INBOX) params.assigned = false;
      if (q.trim()) params.q = q.trim();
      if (modality.trim()) params.modality = modality.trim();
      if (dateMode === 'today') {
        const today = new Date().toISOString().slice(0, 10);
        params.from = today;
        params.to = today;
      } else if (dateMode === 'range') {
        if (dateFrom) params.from = dateFrom;
        if (dateTo) params.to = dateTo;
      }
      params.sortBy = sort.by;
      params.sortDir = sort.dir;
      const res = await apiClient.get('/Study/studies', { params });
      const data = res?.data?.data;
      setStudies(data?.items || []);
      setTotal(data?.total || 0);
      setStorage({ used: data?.usedBytes ?? 0, quota: data?.quotaBytes ?? null });
      // Lightweight inbox badge count (1-row page; total is all we need).
      apiClient
        .get('/Study/studies', { params: { assigned: false, page: 1, pageSize: 1 } })
        .then((r) => setInboxCount(r?.data?.data?.total ?? null))
        .catch(() => {});
    } catch (e) {
      if (!opts.silent) {
        setError(e?.response?.data?.error || e.message || 'Failed to load studies.');
        setStudies([]);
      }
    } finally {
      if (!opts.silent) setLoading(false);
    }
  }, [tab, q, modality, page, dateMode, dateFrom, dateTo, sort.by, sort.dir]);

  // Reset to page 1 whenever the tab or filters change.
  useEffect(() => { setPage(1); }, [tab, q, modality, dateMode, dateFrom, dateTo, sort.by, sort.dir]);

  // Clicking a column header toggles asc/desc, or switches to that column
  // (defaulting to descending — most-recent / largest first).
  const toggleSort = (col) => setSort((s) => s.by === col ? { by: col, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { by: col, dir: 'desc' });

  useEffect(() => { fetchStudies(); }, [fetchStudies]);

  // Auto-poll while ANY study on the page is still extracting, so the loader +
  // % advance live without the user clicking Refresh. Stops once everything is
  // Ready/Failed. Silent (no full-page spinner) — updates the rows in place.
  const anyProcessing = studies.some((s) => {
    const st = String(s.status || '').toLowerCase();
    return st && st !== 'ready' && st !== 'failed';
  });
  useEffect(() => {
    if (!anyProcessing) return;
    const t = setInterval(() => fetchStudies({ silent: true }), 4000);
    return () => clearInterval(t);
  }, [anyProcessing, fetchStudies]);

  // ── Upload ────────────────────────────────────────────────────────────────
  const handleFiles = useCallback(async (fileList) => {
    const files = Array.from(fileList || []);
    if (files.length === 0) return;

    for (const file of files) {
      const key = `${file.name}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      setUploads((u) => [...u, { key, name: file.name, size: file.size, pct: 0, stage: 'starting', error: null }]);
      const onProgress = (p) =>
        setUploads((u) => u.map((x) => (x.key === key ? { ...x, pct: p.pct ?? x.pct, stage: p.stage } : x)));
      try {
        const studyId = await registerStudy({ source: 'web-upload' });
        await uploadStudyAssetToStudy(file, studyId, onProgress);
        setUploads((u) => u.map((x) => (x.key === key ? { ...x, pct: 1, stage: 'done' } : x)));
      } catch (e) {
        setUploads((u) => u.map((x) => (x.key === key ? { ...x, stage: 'error', error: e.message } : x)));
      }
    }
    fetchStudies();
  }, [fetchStudies]);

  const onDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    handleFiles(e.dataTransfer.files);
  };

  // ── Assign ──────────────────────────────────────────────────────────────
  const searchPatients = useCallback(async (term) => {
    if (!term || term.trim().length < 2) { setPatientResults([]); return; }
    try {
      const res = await apiClient.get('/patients', { params: { search: term.trim() } });
      const list = Array.isArray(res?.data) ? res.data : (res?.data?.data || res?.data?.items || []);
      setPatientResults(list.slice(0, 20));
    } catch {
      setPatientResults([]);
    }
  }, []);

  const searchAppointments = useCallback(async (term) => {
    if (!term || term.trim().length < 2) { setApptResults([]); return; }
    try {
      const res = await apiClient.get('/appointments', { params: { search: term.trim() } });
      const list = Array.isArray(res?.data) ? res.data : (res?.data?.data || res?.data?.items || []);
      setApptResults(list.slice(0, 20));
    } catch {
      setApptResults([]);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => searchPatients(patientQuery), 300);
    return () => clearTimeout(t);
  }, [patientQuery, searchPatients]);

  useEffect(() => {
    const t = setTimeout(() => searchAppointments(apptQuery), 300);
    return () => clearTimeout(t);
  }, [apptQuery, searchAppointments]);

  const closeAssign = () => {
    setAssignFor(null);
    setAssignMode('patient');
    setPatientQuery(''); setPatientResults([]);
    setApptQuery(''); setApptResults([]);
  };

  const doAssign = async (body) => {
    if (!assignFor) return;
    setAssignBusy(true);
    try {
      await apiClient.post(`/Study/studies/${assignFor.imagingStudyId}/assign`, body);
      closeAssign();
      showToast('ok', 'Study assigned.');
      fetchStudies();
    } catch (e) {
      showToast('err', e?.response?.data?.error || e.message || 'Assign failed.');
    } finally {
      setAssignBusy(false);
    }
  };
  const assignToPatient = (patientId) => doAssign({ PatientId: patientId });
  const assignToAppointment = (appointmentId) => doAssign({ AppointmentId: appointmentId });

  // ── Secure 24h share link ──────────────────────────────────────────────
  const openShare = async (s) => {
    setShareFor(s);
    setShareLink('');
    setShareCopied(false);
    setShareBusy(true);
    try {
      const res = await apiClient.post(`/Study/studies/${s.imagingStudyId}/share`);
      const token = res?.data?.data?.token;
      if (!token) throw new Error('No share token returned.');
      setShareLink(`${window.location.origin}/share/${token}`);
    } catch (e) {
      showToast('err', e?.response?.data?.error || e.message || 'Could not create share link.');
      setShareFor(null);
    } finally {
      setShareBusy(false);
    }
  };
  const copyShare = async () => {
    try {
      await navigator.clipboard.writeText(shareLink);
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 2500);
    } catch {
      showToast('err', 'Copy failed — select and copy the link manually.');
    }
  };
  const nativeShare = async () => {
    const msg = `View this radiology study on 1Rad (secure link, expires in 24h):\n${shareLink}\n\nPowered by NexEagle 1Rad — fast, secure cloud DICOM.`;
    try {
      if (navigator.share) await navigator.share({ title: 'Radiology study · NexEagle 1Rad', text: msg, url: shareLink });
      else { await navigator.clipboard.writeText(msg); showToast('ok', 'Share message copied.'); }
    } catch { /* user cancelled */ }
  };

  const reextract = async (s) => {
    try {
      await apiClient.post(`/Study/studies/${s.imagingStudyId}/reextract`);
      showToast('ok', 'Re-processing started — this will refresh shortly.');
      fetchStudies();
    } catch (e) {
      showToast('err', e?.response?.data?.error || e.message || 'Could not retry processing.');
    }
  };

  const exportStudy = async (s) => {
    try {
      const res = await apiClient.get(`/Study/studies/${s.imagingStudyId}/export`);
      const files = res?.data?.data?.files || [];
      if (files.length === 0) { showToast('err', 'No files available to export for this study.'); return; }
      showToast('ok', `Downloading ${files.length} file${files.length === 1 ? '' : 's'}…`);
      // Trigger a download per original file, staggered so the browser doesn't
      // drop concurrent downloads.
      for (const f of files) {
        if (!f.downloadUrl) continue;
        const a = document.createElement('a');
        a.href = f.downloadUrl;
        a.download = f.fileName || 'study-file';
        a.target = '_blank';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        await new Promise((r) => setTimeout(r, 400));
      }
    } catch (e) {
      showToast('err', e?.response?.data?.error || e.message || 'Export failed.');
    }
  };

  const confirmDelete = async () => {
    const s = deleteFor;
    if (!s) return;
    setDeleteBusy(true);
    try {
      await apiClient.delete(`/Study/studies/${s.imagingStudyId}`);
      setDeleteFor(null);
      showToast('ok', 'Study deleted.');
      fetchStudies();
    } catch (e) {
      showToast('err', e?.response?.data?.error || e.message || 'Delete failed.');
    } finally {
      setDeleteBusy(false);
    }
  };

  const fmtDate = (d) =>
    d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
  const isInbox = (s) => !s.appointmentId && !s.patientId;

  const statusPill = (s) => {
    const st = String(s.status || '').toLowerCase();
    if (st === 'ready') return <span className="st-pill st-pill-green"><Icons.Check /> Ready</span>;
    if (st === 'failed') return <span className="st-pill st-pill-red">Failed</span>;

    // Processing — show a live loader + % + slice count while extraction runs.
    const total = Number(s.progressTotal) || 0;
    const processed = Number(s.progressProcessed) || 0;
    const pct = total > 0 ? Math.max(0, Math.min(100, Number(s.progressPercent) || Math.round((100 * processed) / total))) : null;
    const phase = s.progressPhase || s.status || 'Processing';
    return (
      <span className="st-pill st-pill-blue st-pulse" style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-start', gap: 3, minWidth: 96 }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          {pct != null ? `${phase} · ${pct}%` : phase}
        </span>
        {pct != null && (
          <>
            <span style={{ width: '100%', height: 3, borderRadius: 999, background: 'rgba(255,255,255,0.25)', overflow: 'hidden', display: 'block' }}>
              <span style={{ display: 'block', height: '100%', width: `${Math.max(3, pct)}%`, background: '#fff', borderRadius: 999, transition: 'width 0.4s ease' }} />
            </span>
            <span style={{ fontSize: 8, opacity: 0.85 }}>{processed} / {total} slices</span>
          </>
        )}
      </span>
    );
  };

  // Report state on the board: Finalized (signed) / Draft (in progress) / none.
  const reportPill = (s) => {
    const rs = String(s.reportStatus || 'None');
    if (rs === 'Finalized') return <span className="st-pill st-pill-green"><Icons.Check /> Finalized</span>;
    if (rs === 'Draft') return <span className="st-pill st-pill-amber">Draft</span>;
    return <span className="st-sub">No report</span>;
  };

  const linkPill = (s) => {
    if (isInbox(s)) return <span className="st-pill st-pill-amber">Unassigned</span>;
    const auto = s.matchStatus === 'AutoMatched';
    return (
      <span className="st-pill st-pill-teal">
        {s.appointmentId ? 'Visit' : 'Patient'}
        {auto && <em className="st-auto">auto</em>}
      </span>
    );
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="st-page">
      <style>{`
        @keyframes stFadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes stPulse { 0%,100% { opacity: 1; } 50% { opacity: 0.55; } }
        @keyframes stShimmer { 0% { background-position: -400px 0; } 100% { background-position: 400px 0; } }
        @keyframes stToastIn { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }

        .st-page { background: #f8fafc; min-height: 100vh; padding: 32px 40px 60px; box-sizing: border-box; font-family: system-ui, 'Segoe UI', Roboto, sans-serif; }

        .st-header { display: flex; justify-content: space-between; align-items: flex-end; gap: 16px; flex-wrap: wrap; margin-bottom: 22px; }
        .st-header h1 { margin: 0 0 4px; font-size: 24px; font-weight: 800; color: #0a1628; letter-spacing: -0.5px; }
        .st-header p { margin: 0; font-size: 13px; color: #6b7280; }

        .st-card { background: white; border: 1px solid #e2e8f0; border-radius: 20px; box-shadow: 0 4px 20px rgba(0,0,0,0.02); animation: stFadeIn 0.3s ease; }

        /* Upload zone */
        .st-drop { border: 2px dashed #cbd5e1; border-radius: 20px; padding: 26px 24px; text-align: center; cursor: pointer; background: white; transition: all 0.2s; margin-bottom: 18px; }
        .st-drop:hover { border-color: #93c5fd; background: #fbfdff; }
        .st-drop.over { border-color: #1d4ed8; background: #eff6ff; box-shadow: 0 0 0 4px rgba(29,78,216,0.08); }
        .st-drop-icon { width: 52px; height: 52px; border-radius: 16px; margin: 0 auto 12px; display: flex; align-items: center; justify-content: center; background: linear-gradient(135deg, #38bdf8, #1d4ed8); color: white; box-shadow: 0 8px 20px rgba(56,189,248,0.25); }
        .st-drop b { display: block; font-size: 14px; font-weight: 700; color: #0a1628; margin-bottom: 3px; }
        .st-drop span { font-size: 12.5px; color: #6b7280; }

        .st-uploads { margin: -6px 0 18px; display: flex; flex-direction: column; gap: 8px; }
        .st-upload-row { background: white; border: 1px solid #e2e8f0; border-radius: 12px; padding: 10px 14px; }
        .st-upload-top { display: flex; justify-content: space-between; gap: 12px; font-size: 12.5px; margin-bottom: 6px; }
        .st-upload-name { font-weight: 600; color: #0a1628; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .st-upload-state { color: #6b7280; flex-shrink: 0; font-weight: 600; }
        .st-upload-state.ok { color: #10b981; }
        .st-upload-state.err { color: #ef4444; }
        .st-bar { height: 5px; border-radius: 99px; background: #f1f5f9; overflow: hidden; }
        .st-bar > div { height: 100%; border-radius: 99px; background: linear-gradient(90deg, #38bdf8, #1d4ed8); transition: width 0.3s ease; }
        .st-bar > div.err { background: #ef4444; }

        /* Toolbar */
        .st-toolbar { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-bottom: 16px; }
        .st-seg { background: white; border: 1px solid #e2e8f0; border-radius: 10px; padding: 4px; display: flex; gap: 4px; }
        .st-seg button { padding: 7px 14px; border-radius: 7px; border: none; background: transparent; color: #6b7280; font-size: 13px; font-weight: 600; cursor: pointer; transition: all 0.2s; display: flex; align-items: center; gap: 7px; }
        .st-seg button.on { background: #0a1628; color: white; }
        .st-badge { min-width: 18px; height: 18px; padding: 0 5px; border-radius: 9px; background: #f59e0b; color: white; font-size: 10.5px; font-weight: 800; display: inline-flex; align-items: center; justify-content: center; }
        .st-seg button.on .st-badge { background: #f59e0b; }

        .st-search { position: relative; flex: 1; min-width: 200px; max-width: 340px; }
        .st-search svg { position: absolute; left: 12px; top: 50%; transform: translateY(-50%); color: #94a3b8; }
        .st-input { width: 100%; box-sizing: border-box; padding: 9px 12px 9px 34px; border-radius: 10px; border: 1px solid #e2e8f0; background: white; color: #0a1628; font-size: 13px; outline: none; transition: all 0.15s; font-family: inherit; }
        .st-input:focus { border-color: #93c5fd; box-shadow: 0 0 0 3px rgba(29,78,216,0.08); }
        .st-input.plain { padding-left: 12px; }

        .st-count { font-size: 12px; color: #6b7280; font-weight: 600; background: white; border: 1px solid #e2e8f0; padding: 7px 12px; border-radius: 10px; }
        .st-refresh { padding: 9px 16px; border-radius: 10px; border: 1px solid #e2e8f0; background: white; color: #475569; font-size: 13px; font-weight: 600; cursor: pointer; transition: all 0.15s; }
        .st-refresh:hover { border-color: #93c5fd; color: #1d4ed8; }

        /* Table */
        .st-table-wrap { overflow-x: auto; }
        .st-table { width: 100%; border-collapse: collapse; font-size: 13.5px; min-width: 860px; }
        .st-table thead th { text-align: left; padding: 14px 16px; font-size: 10px; font-weight: 900; letter-spacing: 1.2px; text-transform: uppercase; color: #94a3b8; border-bottom: 1px solid #e2e8f0; white-space: nowrap; }
        .st-table tbody td { padding: 13px 16px; border-bottom: 1px solid #f1f5f9; color: #334155; vertical-align: middle; }
        .st-table tbody tr { transition: background 0.13s; }
        .st-table tbody tr:hover { background: #f8fafc; }
        .st-table tbody tr:last-child td { border-bottom: none; }

        .st-patient { display: flex; align-items: center; gap: 10px; }
        .st-avatar { width: 32px; height: 32px; border-radius: 10px; color: white; display: flex; align-items: center; justify-content: center; font-size: 11.5px; font-weight: 800; flex-shrink: 0; }
        .st-pname { font-weight: 700; color: #0a1628; }
        .st-sub { font-size: 11.5px; color: #94a3b8; }

        .st-mod { display: inline-block; padding: 3px 9px; border-radius: 7px; background: #f1f5f9; color: #475569; font-size: 11.5px; font-weight: 800; letter-spacing: 0.5px; }

        .st-pill { display: inline-flex; align-items: center; gap: 5px; padding: 4px 10px; border-radius: 20px; font-size: 11px; font-weight: 800; white-space: nowrap; }
        .st-pill-green { background: #ecfdf5; color: #059669; }
        .st-pill-red { background: #fef2f2; color: #dc2626; }
        .st-pill-blue { background: #eff6ff; color: #2563eb; }
        .st-pill-amber { background: #fffbeb; color: #d97706; }
        .st-pill-teal { background: #f0fdfa; color: #0f766e; }
        .st-pulse { animation: stPulse 2s infinite; }
        .st-auto { font-style: normal; font-size: 9px; font-weight: 900; background: #ccfbf1; padding: 1px 5px; border-radius: 6px; letter-spacing: 0.5px; text-transform: uppercase; }

        .st-actions { display: flex; gap: 6px; justify-content: flex-end; flex-wrap: wrap; }
        .st-btn { padding: 6px 12px; border-radius: 8px; border: 1px solid #e2e8f0; background: white; color: #475569; font-size: 12px; font-weight: 700; cursor: pointer; transition: all 0.15s; font-family: inherit; }
        .st-btn:hover:not(:disabled) { border-color: #93c5fd; color: #1d4ed8; }
        .st-btn:disabled { opacity: 0.45; cursor: default; }
        .st-btn-primary { background: #1d4ed8; border-color: #1d4ed8; color: white; }
        .st-btn-primary:hover:not(:disabled) { background: #1e40af; color: white; }
        .st-btn-danger { color: #dc2626; border-color: #fecaca; }
        .st-btn-danger:hover:not(:disabled) { background: #fef2f2; border-color: #fca5a5; color: #b91c1c; }

        /* Skeleton + empty */
        .st-skel { height: 14px; border-radius: 7px; background: linear-gradient(90deg, #f1f5f9 25%, #e9eef5 37%, #f1f5f9 63%); background-size: 800px 100%; animation: stShimmer 1.4s linear infinite; }
        .st-empty { text-align: center; padding: 56px 20px; color: #6b7280; }
        .st-empty-icon { width: 64px; height: 64px; border-radius: 20px; margin: 0 auto 16px; background: #f1f5f9; color: #94a3b8; display: flex; align-items: center; justify-content: center; }
        .st-empty b { display: block; font-size: 15px; font-weight: 700; color: #0a1628; margin-bottom: 4px; }
        .st-empty span { font-size: 13px; }

        /* Pagination */
        .st-pager { display: flex; gap: 6px; align-items: center; justify-content: flex-end; padding: 14px 16px; border-top: 1px solid #f1f5f9; flex-wrap: wrap; }
        .st-pager span { color: #6b7280; font-size: 12.5px; font-weight: 600; }
        .st-page-btn { min-width: 32px; height: 32px; padding: 0 6px; border-radius: 8px; border: 1px solid #e2e8f0; background: white; color: #475569; font-size: 12.5px; font-weight: 700; cursor: pointer; transition: all 0.15s; font-family: inherit; }
        .st-page-btn:hover { border-color: #93c5fd; color: #1d4ed8; }
        .st-page-btn.on { background: #0a1628; border-color: #0a1628; color: white; }

        /* Modal */
        .st-backdrop { position: fixed; inset: 0; background: rgba(10,22,40,0.45); backdrop-filter: blur(3px); display: flex; align-items: center; justify-content: center; z-index: 1000; animation: stFadeIn 0.18s ease; }
        .st-modal { background: white; border-radius: 20px; padding: 26px; width: 480px; max-width: calc(100vw - 40px); max-height: 85vh; overflow-y: auto; box-shadow: 0 24px 60px -12px rgba(10,22,40,0.35); animation: stFadeIn 0.22s ease; box-sizing: border-box; }
        .st-modal h3 { margin: 0 0 4px; font-size: 17px; font-weight: 800; color: #0a1628; letter-spacing: -0.3px; }
        .st-modal-sub { color: #6b7280; font-size: 12.5px; margin-bottom: 16px; }
        .st-result { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 10px 12px; border-radius: 12px; transition: background 0.13s; }
        .st-result:hover { background: #f8fafc; }
        .st-result-name { font-weight: 700; color: #0a1628; font-size: 13.5px; }

        .st-toast { position: fixed; right: 24px; bottom: 24px; z-index: 1100; padding: 12px 18px; border-radius: 12px; font-size: 13px; font-weight: 700; box-shadow: 0 12px 30px -6px rgba(10,22,40,0.25); animation: stToastIn 0.2s ease; display: flex; align-items: center; gap: 8px; }
        .st-toast.ok { background: #0a1628; color: #34d399; }
        .st-toast.err { background: #0a1628; color: #f87171; }

        @media (max-width: 720px) {
          .st-page { padding: 20px 16px 48px; }
          .st-header h1 { font-size: 20px; }
          .st-search { max-width: none; }
        }
      `}</style>

      {/* Header */}
      <div className="st-header">
        <div>
          <h1>Cloud PACS</h1>
          <p>Worklist — upload, browse, assign, view &amp; report studies.</p>
        </div>
      </div>

      {/* Upload Center */}
      <div
        className={`st-drop${dragOver ? ' over' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        onClick={() => fileInputRef.current?.click()}
      >
        <input
          ref={fileInputRef} type="file" multiple accept=".zip,.dcm,.dicom,application/zip,application/dicom"
          style={{ display: 'none' }}
          onChange={(e) => { handleFiles(e.target.files); e.target.value = ''; }}
        />
        <div className="st-drop-icon"><Icons.Upload /></div>
        <b>Drop DICOM ZIP / .dcm files here, or click to choose</b>
        <span>Each upload creates a study; matching to a patient/visit runs automatically.</span>
      </div>

      {uploads.length > 0 && (
        <div className="st-uploads">
          {uploads.map((u) => (
            <div key={u.key} className="st-upload-row">
              <div className="st-upload-top">
                <span className="st-upload-name">{u.name} <span style={{ color: '#94a3b8', fontWeight: 500 }}>· {fmtBytes(u.size)}</span></span>
                <span className={`st-upload-state${u.error ? ' err' : u.stage === 'done' ? ' ok' : ''}`}>
                  {u.error ? `Failed — ${u.error}` : u.stage === 'done' ? 'Uploaded ✓' : `${u.stage} · ${Math.round((u.pct || 0) * 100)}%`}
                </span>
              </div>
              <div className="st-bar">
                <div className={u.error ? 'err' : ''} style={{ width: `${u.error ? 100 : Math.round((u.pct || 0) * 100)}%` }} />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Tabs + filters */}
      <div className="st-toolbar">
        <div className="st-seg">
          <button className={tab === TABS.ALL ? 'on' : ''} onClick={() => setTab(TABS.ALL)}>All studies</button>
          <button className={tab === TABS.INBOX ? 'on' : ''} onClick={() => setTab(TABS.INBOX)}>
            Inbox
            {inboxCount > 0 && <span className="st-badge">{inboxCount > 99 ? '99+' : inboxCount}</span>}
          </button>
        </div>
        <div className="st-search">
          <Icons.Search />
          <input className="st-input" placeholder="Search name / MRN / accession…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <input className="st-input plain" style={{ width: 110 }} placeholder="Modality" value={modality} onChange={(e) => setModality(e.target.value)} />
        <div className="st-seg">
          {[{ k: 'all', label: 'All dates' }, { k: 'today', label: 'Today' }, { k: 'range', label: 'Date range' }].map((d) => (
            <button key={d.k} className={dateMode === d.k ? 'on' : ''} onClick={() => setDateMode(d.k)}>{d.label}</button>
          ))}
        </div>
        {dateMode === 'range' && (
          <>
            <input className="st-input plain" type="date" style={{ width: 140 }} value={dateFrom} max={dateTo || undefined} onChange={(e) => setDateFrom(e.target.value)} aria-label="From date" />
            <span style={{ color: '#94a3b8', fontSize: 12, fontWeight: 700 }}>→</span>
            <input className="st-input plain" type="date" style={{ width: 140 }} value={dateTo} min={dateFrom || undefined} onChange={(e) => setDateTo(e.target.value)} aria-label="To date" />
          </>
        )}
        <button className="st-refresh" onClick={fetchStudies}>Refresh</button>
        <span className="st-count">{total} {total === 1 ? 'study' : 'studies'}</span>
        <span className="st-count" title="Total cloud storage used by this centre" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontWeight: 800, color: '#0a1628' }}>💾 {fmtBytes(storage.used)}</span>
          {storage.quota ? <span style={{ color: '#94a3b8' }}>/ {fmtBytes(storage.quota)}</span> : <span style={{ color: '#94a3b8' }}>used</span>}
          {storage.quota ? (
            <span style={{ width: 60, height: 5, borderRadius: 99, background: '#eef2f7', overflow: 'hidden', display: 'inline-block' }}>
              <span style={{ display: 'block', height: '100%', borderRadius: 99, width: `${Math.min(100, Math.round((storage.used / storage.quota) * 100))}%`, background: (storage.used / storage.quota) > 0.9 ? '#ef4444' : '#1d4ed8' }} />
            </span>
          ) : null}
        </span>
      </div>

      {error && (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', borderRadius: 12, padding: '12px 16px', fontSize: 13, fontWeight: 600, marginBottom: 14 }}>
          {error}
        </div>
      )}

      {/* Worklist */}
      <div className="st-card" style={{ overflow: 'hidden' }}>
        <div className="st-table-wrap">
          <table className="st-table">
            <thead>
              <tr>
                {[
                  { label: 'Patient', col: 'patient' },
                  { label: 'Modality', col: 'modality' },
                  { label: 'Study date', col: 'studydate' },
                  { label: 'Accession', col: 'accession' },
                  { label: 'Size', col: 'size' },
                  { label: 'Status', col: 'status' },
                ].map((h) => (
                  <th key={h.col} onClick={() => toggleSort(h.col)} style={{ cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }} title={`Sort by ${h.label}`}>
                    {h.label}
                    <span style={{ marginLeft: 4, color: sort.by === h.col ? '#1d4ed8' : '#cbd5e1', fontSize: 9 }}>
                      {sort.by === h.col ? (sort.dir === 'asc' ? '▲' : '▼') : '⇅'}
                    </span>
                  </th>
                ))}
                <th>Link</th><th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && [...Array(6)].map((_, i) => (
                <tr key={`sk-${i}`}>
                  <td>
                    <div className="st-patient">
                      <div className="st-skel" style={{ width: 32, height: 32, borderRadius: 10 }} />
                      <div className="st-skel" style={{ width: 140 }} />
                    </div>
                  </td>
                  <td><div className="st-skel" style={{ width: 40 }} /></td>
                  <td><div className="st-skel" style={{ width: 80 }} /></td>
                  <td><div className="st-skel" style={{ width: 90 }} /></td>
                  <td><div className="st-skel" style={{ width: 56 }} /></td>
                  <td><div className="st-skel" style={{ width: 64 }} /></td>
                  <td><div className="st-skel" style={{ width: 70 }} /></td>
                  <td><div className="st-skel" style={{ width: 150, marginLeft: 'auto' }} /></td>
                </tr>
              ))}

              {!loading && studies.length === 0 && (
                <tr>
                  <td colSpan={8}>
                    <div className="st-empty">
                      <div className="st-empty-icon">{tab === TABS.INBOX ? <Icons.Inbox /> : <Icons.Scan />}</div>
                      {tab === TABS.INBOX ? (
                        <>
                          <b>Inbox zero</b>
                          <span>Every study is linked to a patient or visit.</span>
                        </>
                      ) : (
                        <>
                          <b>No studies yet</b>
                          <span>Drop a DICOM ZIP above, or send from a modality via the bridge.</span>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              )}

              {!loading && studies.map((s) => (
                <tr key={s.imagingStudyId}>
                  <td>
                    <div className="st-patient">
                      <div className="st-avatar" style={{ background: avatarColor(s.patientName) }}>{initials(s.patientName)}</div>
                      <div>
                        <div className="st-pname">{s.patientName || 'Unknown patient'}</div>
                        <div className="st-sub">{s.dicomPatientId ? `MRN ${s.dicomPatientId}` : 'No MRN'}</div>
                      </div>
                    </div>
                  </td>
                  <td>{s.modality ? <span className="st-mod">{s.modality}</span> : <span className="st-sub">—</span>}</td>
                  <td>{fmtDate(s.studyDate)}</td>
                  <td>{s.accessionNumber || <span className="st-sub">—</span>}</td>
                  <td title={`${s.assetCount || 0} file(s) · ${fmtBytes(s.sizeBytes)}`} style={{ fontWeight: 600, color: '#475569' }}>{fmtBytes(s.sizeBytes)}</td>
                  <td title={`Match: ${s.matchStatus || '—'}`}>
                    {statusPill(s)}
                    {/* Report state (Drafted / Finalized) under the extraction status. */}
                    <div style={{ marginTop: 4 }}>{reportPill(s)}</div>
                    {/* Failure reason inline so the user sees WHY it failed. */}
                    {String(s.status).toLowerCase() === 'failed' && s.extractionError && (
                      <div className="st-sub" style={{ color: '#dc2626', maxWidth: 200, marginTop: 4, lineHeight: 1.35 }} title={s.extractionError}>
                        {s.extractionError.length > 90 ? s.extractionError.slice(0, 90) + '…' : s.extractionError}
                      </div>
                    )}
                  </td>
                  <td>{linkPill(s)}</td>
                  <td>
                    <div className="st-actions">
                      {String(s.status).toLowerCase() === 'failed'
                        ? <button className="st-btn st-btn-primary" title="Re-process this study" onClick={() => reextract(s)}>Retry</button>
                        : <button className="st-btn st-btn-primary" disabled={s.status !== 'Ready'} title="Open the viewer + report in a new window (starts on the DICOM viewer)" onClick={() => window.open(`/reporting?studyId=${s.imagingStudyId}&view=dicom`, '_blank', 'noopener')}>View</button>}
                      {isInbox(s) && <button className="st-btn" onClick={() => setAssignFor(s)}>Assign</button>}
                      <button className="st-btn" disabled={s.status !== 'Ready'} title="Create a 24-hour secret link" onClick={() => openShare(s)}>Share</button>
                      <button className="st-btn" onClick={() => exportStudy(s)}>Export</button>
                      {/* Delete is PACS-only (backend blocks appointment-linked studies). */}
                      {!s.appointmentId && <button className="st-btn st-btn-danger" onClick={() => setDeleteFor(s)}>Delete</button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination — numbered pages (up to 10 in a sliding window) */}
        {!loading && total > PAGE_SIZE && (
          <div className="st-pager">
            <span style={{ marginRight: 'auto' }}>
              {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} of {total}
            </span>
            <button className="st-btn" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>←</button>
            {(() => {
              const MAX_BTNS = 10;
              let start = Math.max(1, page - Math.floor(MAX_BTNS / 2));
              const end = Math.min(totalPages, start + MAX_BTNS - 1);
              start = Math.max(1, end - MAX_BTNS + 1);
              const nums = [];
              for (let n = start; n <= end; n++) nums.push(n);
              return nums.map((n) => (
                <button
                  key={n}
                  className={`st-page-btn${n === page ? ' on' : ''}`}
                  onClick={() => setPage(n)}
                >
                  {n}
                </button>
              ));
            })()}
            <button className="st-btn" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>→</button>
          </div>
        )}
      </div>

      {/* Assign modal */}
      {assignFor && (
        <div className="st-backdrop" onClick={closeAssign}>
          <div className="st-modal" role="dialog" aria-label="Assign study" onClick={(e) => e.stopPropagation()}>
            <h3>Assign study</h3>
            <div className="st-modal-sub">
              {assignFor.patientName || 'Unknown'} · {assignFor.modality || '—'} · {fmtDate(assignFor.studyDate)}
            </div>
            <div className="st-seg" style={{ marginBottom: 14, display: 'inline-flex' }}>
              <button className={assignMode === 'patient' ? 'on' : ''} onClick={() => setAssignMode('patient')}>To patient</button>
              <button className={assignMode === 'appointment' ? 'on' : ''} onClick={() => setAssignMode('appointment')}>To appointment</button>
            </div>

            {assignMode === 'patient' ? (
              <>
                <div className="st-search" style={{ maxWidth: 'none', marginBottom: 10 }}>
                  <Icons.Search />
                  <input autoFocus className="st-input" placeholder="Search patient by name / MRN…" value={patientQuery}
                    onChange={(e) => setPatientQuery(e.target.value)} />
                </div>
                <div style={{ maxHeight: 260, overflowY: 'auto' }}>
                  {patientResults.map((p) => {
                    const name = p.fullName || p.FullName || '—';
                    return (
                      <div key={p.patientId || p.PatientId} className="st-result">
                        <div className="st-patient">
                          <div className="st-avatar" style={{ background: avatarColor(name) }}>{initials(name)}</div>
                          <div>
                            <div className="st-result-name">{name}</div>
                            <div className="st-sub">{p.patientIdentifier || p.PatientIdentifier || 'No MRN'}</div>
                          </div>
                        </div>
                        <button className="st-btn st-btn-primary" disabled={assignBusy} onClick={() => assignToPatient(p.patientId || p.PatientId)}>Assign</button>
                      </div>
                    );
                  })}
                  {patientQuery.length >= 2 && patientResults.length === 0 && (
                    <div className="st-sub" style={{ padding: 10 }}>No patients found.</div>
                  )}
                </div>
              </>
            ) : (
              <>
                <div className="st-search" style={{ maxWidth: 'none', marginBottom: 10 }}>
                  <Icons.Search />
                  <input autoFocus className="st-input" placeholder="Search appointment by patient / ID / mobile…" value={apptQuery}
                    onChange={(e) => setApptQuery(e.target.value)} />
                </div>
                <div style={{ maxHeight: 260, overflowY: 'auto' }}>
                  {apptResults.map((a) => {
                    const id = a.appointmentId || a.AppointmentId;
                    const name = a.patientName || a.PatientName || '—';
                    return (
                      <div key={id} className="st-result">
                        <div className="st-patient">
                          <div className="st-avatar" style={{ background: avatarColor(name) }}>{initials(name)}</div>
                          <div>
                            <div className="st-result-name">{name}</div>
                            <div className="st-sub">{(a.displayId || a.DisplayId || '—')} · {(a.modality || a.Modality || '—')}</div>
                          </div>
                        </div>
                        <button className="st-btn st-btn-primary" disabled={assignBusy} onClick={() => assignToAppointment(id)}>Assign</button>
                      </div>
                    );
                  })}
                  {apptQuery.length >= 2 && apptResults.length === 0 && (
                    <div className="st-sub" style={{ padding: 10 }}>No appointments found.</div>
                  )}
                </div>
              </>
            )}

            <div style={{ marginTop: 16, textAlign: 'right' }}>
              <button className="st-btn" onClick={closeAssign}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirm */}
      {deleteFor && (
        <div className="st-backdrop" onClick={() => !deleteBusy && setDeleteFor(null)}>
          <div className="st-modal" role="dialog" aria-label="Delete study" style={{ width: 420 }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ color: '#b91c1c' }}>Delete this study?</h3>
            <div className="st-modal-sub">
              {deleteFor.patientName || 'Unknown'} · {deleteFor.modality || '—'} · {fmtDate(deleteFor.studyDate)}
            </div>
            <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 12, padding: '12px 14px', fontSize: 12.5, color: '#7f1d1d', lineHeight: 1.6, marginBottom: 18 }}>
              This permanently removes the study and all its DICOM files from cloud storage. It cannot be undone.
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button className="st-btn" disabled={deleteBusy} onClick={() => setDeleteFor(null)}>Cancel</button>
              <button
                className="st-btn"
                style={{ background: '#dc2626', borderColor: '#dc2626', color: 'white' }}
                disabled={deleteBusy}
                onClick={confirmDelete}
              >
                {deleteBusy ? 'Deleting…' : 'Delete permanently'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Share-link modal */}
      {shareFor && (
        <div className="st-backdrop" onClick={() => setShareFor(null)}>
          <div className="st-modal" role="dialog" aria-label="Share study" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
              <img src={`${import.meta.env.BASE_URL}Logo.png`} alt="NexEagle" style={{ width: 30, height: 30, objectFit: 'contain', borderRadius: 7 }} />
              <h3 style={{ margin: 0 }}>Share study securely</h3>
            </div>
            <div className="st-modal-sub">
              {shareFor.patientName || 'Study'} · {shareFor.modality || '—'} · {fmtDate(shareFor.studyDate)}
            </div>

            {shareBusy ? (
              <div className="st-sub" style={{ padding: '24px 0', textAlign: 'center' }}>Generating secure link…</div>
            ) : (
              <>
                <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                  <input className="st-input plain" readOnly value={shareLink} onFocus={(e) => e.target.select()} style={{ flex: 1, fontSize: 12 }} />
                  <button className="st-btn st-btn-primary" onClick={copyShare}>{shareCopied ? '✓ Copied' : 'Copy'}</button>
                </div>

                <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 12, padding: '10px 14px', fontSize: 12, color: '#92400e', lineHeight: 1.6, marginBottom: 14 }}>
                  🔒 This is a secret link that <strong>expires in 24 hours</strong>. Anyone with the link can view this study on mobile, tablet or desktop — no login needed. After it expires the viewer shows an expiry notice.
                </div>

                <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 12, padding: '12px 14px', marginBottom: 16 }}>
                  <div style={{ fontSize: 11, fontWeight: 800, color: '#1d4ed8', letterSpacing: 0.5, marginBottom: 4 }}>POWERED BY NEXEAGLE 1Rad</div>
                  <div style={{ fontSize: 12, color: '#475569', lineHeight: 1.6 }}>
                    Faster reads, rock-solid data security and instant cloud sharing. Ask your centre about 1Rad to speed up reporting and collaborate with referring doctors effortlessly.
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                  <button className="st-btn" onClick={() => setShareFor(null)}>Close</button>
                  <button className="st-btn st-btn-primary" onClick={nativeShare}>Share via…</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className={`st-toast ${toast.kind}`}>
          {toast.kind === 'ok' ? <Icons.Check /> : <Icons.X />}
          {toast.text}
        </div>
      )}
    </div>
  );
}
