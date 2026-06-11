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

export default function StudiesPage() {
  const navigate = useNavigate();
  const [tab, setTab] = useState(TABS.ALL);
  const [q, setQ] = useState('');
  const [modality, setModality] = useState('');
  const [studies, setStudies] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const PAGE_SIZE = 50;

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

  const fetchStudies = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = { page, pageSize: PAGE_SIZE };
      if (tab === TABS.INBOX) params.assigned = false;
      if (q.trim()) params.q = q.trim();
      if (modality.trim()) params.modality = modality.trim();
      const res = await apiClient.get('/Study/studies', { params });
      const data = res?.data?.data;
      setStudies(data?.items || []);
      setTotal(data?.total || 0);
    } catch (e) {
      setError(e?.response?.data?.error || e.message || 'Failed to load studies.');
      setStudies([]);
    } finally {
      setLoading(false);
    }
  }, [tab, q, modality, page]);

  // Reset to page 1 whenever the tab or filters change.
  useEffect(() => { setPage(1); }, [tab, q, modality]);

  useEffect(() => { fetchStudies(); }, [fetchStudies]);

  // ── Upload ────────────────────────────────────────────────────────────────
  const handleFiles = useCallback(async (fileList) => {
    const files = Array.from(fileList || []);
    if (files.length === 0) return;

    for (const file of files) {
      const key = `${file.name}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      setUploads((u) => [...u, { key, name: file.name, pct: 0, stage: 'starting', error: null }]);
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
      fetchStudies();
    } catch (e) {
      alert(e?.response?.data?.error || e.message || 'Assign failed.');
    } finally {
      setAssignBusy(false);
    }
  };
  const assignToPatient = (patientId) => doAssign({ PatientId: patientId });
  const assignToAppointment = (appointmentId) => doAssign({ AppointmentId: appointmentId });

  const exportStudy = async (s) => {
    try {
      const res = await apiClient.get(`/Study/studies/${s.imagingStudyId}/export`);
      const files = res?.data?.data?.files || [];
      if (files.length === 0) { alert('No files available to export for this study.'); return; }
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
      alert(e?.response?.data?.error || e.message || 'Export failed.');
    }
  };

  const deleteStudy = async (s) => {
    if (!window.confirm(`Delete this study and all its images?\n\n${s.patientName || 'Unknown'} · ${s.modality || '—'} · ${fmtDate(s.studyDate)}\n\nThis permanently removes the DICOM files and cannot be undone.`)) return;
    try {
      await apiClient.delete(`/Study/studies/${s.imagingStudyId}`);
      fetchStudies();
    } catch (e) {
      alert(e?.response?.data?.error || e.message || 'Delete failed.');
    }
  };

  const fmtDate = (d) => (d ? new Date(d).toLocaleDateString() : '—');
  const isInbox = (s) => !s.appointmentId && !s.patientId;

  return (
    <div style={{ padding: 20, maxWidth: 1200, margin: '0 auto' }}>
      <h1 style={{ marginBottom: 4 }}>Studies</h1>
      <p style={{ color: '#8a94a6', marginTop: 0 }}>Cloud PACS worklist — upload, browse, assign, view & report.</p>

      {/* Upload Center */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        onClick={() => fileInputRef.current?.click()}
        style={{
          border: `2px dashed ${dragOver ? '#4f8cff' : '#3a4252'}`,
          borderRadius: 8, padding: 24, textAlign: 'center', cursor: 'pointer',
          background: dragOver ? 'rgba(79,140,255,0.08)' : 'transparent', marginBottom: 16,
        }}
      >
        <input
          ref={fileInputRef} type="file" multiple accept=".zip,.dcm,.dicom,application/zip,application/dicom"
          style={{ display: 'none' }}
          onChange={(e) => { handleFiles(e.target.files); e.target.value = ''; }}
        />
        <div style={{ fontWeight: 600 }}>Drop DICOM ZIP / .dcm files here, or click to choose</div>
        <div style={{ color: '#8a94a6', fontSize: 13 }}>Each upload creates a study; matching to a patient/visit runs automatically.</div>
      </div>

      {uploads.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          {uploads.map((u) => (
            <div key={u.key} style={{ fontSize: 13, color: u.error ? '#ff6b6b' : '#cbd3e1', marginBottom: 2 }}>
              {u.name} — {u.error ? `failed: ${u.error}` : u.stage === 'done' ? 'done ✓' : `${u.stage} ${Math.round((u.pct || 0) * 100)}%`}
            </div>
          ))}
        </div>
      )}

      {/* Tabs + filters */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
        <button onClick={() => setTab(TABS.ALL)} style={tabStyle(tab === TABS.ALL)}>All studies</button>
        <button onClick={() => setTab(TABS.INBOX)} style={tabStyle(tab === TABS.INBOX)}>Inbox (unassigned)</button>
        <input
          placeholder="Search name / MRN / accession" value={q} onChange={(e) => setQ(e.target.value)}
          style={inputStyle} />
        <input placeholder="Modality" value={modality} onChange={(e) => setModality(e.target.value)} style={{ ...inputStyle, width: 110 }} />
        <button onClick={fetchStudies} style={tabStyle(false)}>Refresh</button>
        <span style={{ color: '#8a94a6', fontSize: 13 }}>{total} total</span>
      </div>

      {error && <div style={{ color: '#ff6b6b', marginBottom: 12 }}>{error}</div>}
      {loading ? <div style={{ color: '#8a94a6' }}>Loading…</div> : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
          <thead>
            <tr style={{ textAlign: 'left', color: '#8a94a6', borderBottom: '1px solid #2a3140' }}>
              <th style={th}>Patient</th><th style={th}>MRN</th><th style={th}>Modality</th>
              <th style={th}>Study date</th><th style={th}>Accession</th><th style={th}>Status</th>
              <th style={th}>Link</th><th style={th}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {studies.length === 0 && (
              <tr><td colSpan={8} style={{ padding: 16, color: '#8a94a6' }}>No studies.</td></tr>
            )}
            {studies.map((s) => (
              <tr key={s.imagingStudyId} style={{ borderBottom: '1px solid #232a36' }}>
                <td style={td}>{s.patientName || '—'}</td>
                <td style={td}>{s.dicomPatientId || '—'}</td>
                <td style={td}>{s.modality || '—'}</td>
                <td style={td}>{fmtDate(s.studyDate)}</td>
                <td style={td}>{s.accessionNumber || '—'}</td>
                <td style={td}>
                  <span title={`Match: ${s.matchStatus}`}>{s.status}</span>
                </td>
                <td style={td}>
                  {isInbox(s)
                    ? <span style={{ color: '#e0a83a' }}>Unassigned</span>
                    : <span style={{ color: '#4caf7d' }}>{s.appointmentId ? 'Visit' : 'Patient'}</span>}
                </td>
                <td style={td}>
                  <button style={linkBtn} disabled={s.status !== 'Ready'} onClick={() => navigate(`/dicom-viewer?studyId=${s.imagingStudyId}`)}>View</button>
                  <button style={linkBtn} onClick={() => navigate(`/reporting?studyId=${s.imagingStudyId}`)}>Report</button>
                  {isInbox(s) && <button style={linkBtn} onClick={() => setAssignFor(s)}>Assign</button>}
                  <button style={linkBtn} onClick={() => exportStudy(s)}>Export</button>
                  {/* Delete is PACS-only (backend blocks appointment-linked studies). */}
                  {!s.appointmentId && <button style={dangerBtn} onClick={() => deleteStudy(s)}>Delete</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* Pagination */}
      {!loading && total > PAGE_SIZE && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'flex-end', marginTop: 12 }}>
          <button style={linkBtn} disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>Prev</button>
          <span style={{ color: '#8a94a6', fontSize: 13 }}>
            Page {page} of {Math.max(1, Math.ceil(total / PAGE_SIZE))}
          </span>
          <button style={linkBtn} disabled={page >= Math.ceil(total / PAGE_SIZE)} onClick={() => setPage((p) => p + 1)}>Next</button>
        </div>
      )}

      {/* Assign modal */}
      {assignFor && (
        <div style={modalBackdrop} onClick={closeAssign}>
          <div style={modalBox} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ marginTop: 0 }}>Assign study</h3>
            <div style={{ color: '#8a94a6', fontSize: 13, marginBottom: 8 }}>
              {assignFor.patientName || 'Unknown'} · {assignFor.modality || '—'} · {fmtDate(assignFor.studyDate)}
            </div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
              <button style={tabStyle(assignMode === 'patient')} onClick={() => setAssignMode('patient')}>To patient</button>
              <button style={tabStyle(assignMode === 'appointment')} onClick={() => setAssignMode('appointment')}>To appointment</button>
            </div>

            {assignMode === 'patient' ? (
              <>
                <input autoFocus placeholder="Search patient by name / MRN…" value={patientQuery}
                  onChange={(e) => setPatientQuery(e.target.value)} style={{ ...inputStyle, width: '100%', marginBottom: 8 }} />
                <div style={{ maxHeight: 240, overflowY: 'auto' }}>
                  {patientResults.map((p) => (
                    <div key={p.patientId || p.PatientId}
                      style={{ padding: '8px 10px', borderBottom: '1px solid #232a36', display: 'flex', justifyContent: 'space-between' }}>
                      <span>{p.fullName || p.FullName || '—'} <span style={{ color: '#8a94a6' }}>({p.patientIdentifier || p.PatientIdentifier || 'no MRN'})</span></span>
                      <button style={linkBtn} disabled={assignBusy} onClick={() => assignToPatient(p.patientId || p.PatientId)}>Assign</button>
                    </div>
                  ))}
                  {patientQuery.length >= 2 && patientResults.length === 0 && (
                    <div style={{ color: '#8a94a6', padding: 8 }}>No patients found.</div>
                  )}
                </div>
              </>
            ) : (
              <>
                <input autoFocus placeholder="Search appointment by patient / ID / mobile…" value={apptQuery}
                  onChange={(e) => setApptQuery(e.target.value)} style={{ ...inputStyle, width: '100%', marginBottom: 8 }} />
                <div style={{ maxHeight: 240, overflowY: 'auto' }}>
                  {apptResults.map((a) => {
                    const id = a.appointmentId || a.AppointmentId;
                    return (
                      <div key={id}
                        style={{ padding: '8px 10px', borderBottom: '1px solid #232a36', display: 'flex', justifyContent: 'space-between' }}>
                        <span>{a.patientName || a.PatientName || '—'} <span style={{ color: '#8a94a6' }}>({a.displayId || a.DisplayId || '—'} · {a.modality || a.Modality || '—'})</span></span>
                        <button style={linkBtn} disabled={assignBusy} onClick={() => assignToAppointment(id)}>Assign</button>
                      </div>
                    );
                  })}
                  {apptQuery.length >= 2 && apptResults.length === 0 && (
                    <div style={{ color: '#8a94a6', padding: 8 }}>No appointments found.</div>
                  )}
                </div>
              </>
            )}

            <div style={{ marginTop: 12, textAlign: 'right' }}>
              <button style={tabStyle(false)} onClick={closeAssign}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const th = { padding: '8px 10px', fontWeight: 600 };
const td = { padding: '8px 10px' };
const inputStyle = { padding: '6px 10px', borderRadius: 6, border: '1px solid #3a4252', background: '#161b24', color: '#e6ebf2' };
const tabStyle = (active) => ({
  padding: '6px 12px', borderRadius: 6, border: '1px solid #3a4252', cursor: 'pointer',
  background: active ? '#4f8cff' : '#1b212c', color: active ? '#fff' : '#cbd3e1',
});
const linkBtn = { padding: '4px 8px', marginRight: 6, borderRadius: 6, border: '1px solid #3a4252', background: '#1b212c', color: '#cbd3e1', cursor: 'pointer' };
const dangerBtn = { padding: '4px 8px', marginRight: 6, borderRadius: 6, border: '1px solid #5a2a2a', background: '#2a1717', color: '#ff8a8a', cursor: 'pointer' };
const modalBackdrop = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 };
const modalBox = { background: '#12161d', border: '1px solid #2a3140', borderRadius: 10, padding: 20, width: 460, maxWidth: '90vw' };
