import { useState, useEffect, useMemo } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import apiClient, { BASE_URL } from '../api/apiClient';
import useTickClock from '../utils/useTickClock';
import { formatElapsed } from '../utils/timeTracking';

export default function StatusTracking() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  // The /track route is anonymous; the QR carries a signed token in the
  // ?token= query string that the backend validates before serving data.
  // Without a token we can still render an "invalid link" state below.
  const token = searchParams.get('token');
  const [study, setStudy] = useState(null);
  const [report, setReport] = useState(null);
  // Prescription protocol (letterhead, fonts) — fetched best-effort. Public
  // endpoint may not exist yet; failures are silent.
  const [protocol, setProtocol] = useState(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState(false);
  useTickClock();

  useEffect(() => {
    let active = true;
    const fetchAll = async () => {
      try {
        // One call returns both the tracker-safe appointment view AND the
        // finalized report (when present). No mobile numbers, billing,
        // technician comments — only what the patient should see.
        const res = await apiClient.get(`/public/tracking/${id}`, {
          params: token ? { token } : undefined,
        });
        if (!active) return;
        const payload = res?.data?.data;
        if (!payload?.appointment) {
          setAuthError(true);
          return;
        }
        setAuthError(false);
        setStudy(payload.appointment);

        const r = payload.report;
        if (r && (r.isFinalized || r.finalizedAt)) {
          // The DTO names match the legacy report fetch shape so the rest
          // of the page (the findingsHtml memo, IMPRESSION/ADVICE blocks)
          // continues to work unchanged.
          setReport(r);
        }

        // Branding is bundled into the same tracking response now (the
        // doctor's prescription protocol — letterhead URL + typography +
        // margins). No separate /Prescription call, no anonymous 401, no
        // missing letterhead on the patient sheet. Shape mirrors what
        // SavedReportViewer's authenticated path already uses, so the
        // downstream rendering code is unchanged.
        if (payload.branding) {
          setProtocol(payload.branding);
        }
      } catch (err) {
        if (!active) return;
        // 401 means the token was missing/expired/tampered. Surface a
        // distinct state so the patient can ask the centre for a fresh QR
        // instead of staring at a half-rendered page.
        if (err?.response?.status === 401) setAuthError(true);
        else console.error('Tracking failed', err);
      } finally {
        if (active) setLoading(false);
      }
    };
    fetchAll();
    const interval = setInterval(fetchAll, 30000);
    return () => { active = false; clearInterval(interval); };
  }, [id]);

  // Resolve letterhead URL through the Azure proxy when needed (same logic
  // as ReportPreviewModal + SavedReportViewer so we don't fork the routing).
  const letterheadUrl = useMemo(() => {
    if (!protocol?.letterheadBlobUrl) return null;
    let url = protocol.letterheadBlobUrl.startsWith('http')
      ? protocol.letterheadBlobUrl
      : `${BASE_URL}${protocol.letterheadBlobUrl}`;
    if (url.includes('blob.core.windows.net')) {
      return `${BASE_URL}/Study/proxy-asset?url=${encodeURIComponent(url)}`;
    }
    return url;
  }, [protocol?.letterheadBlobUrl]);

  // Shape the findings HTML the same way SavedReportViewer does:
  //   • unwrap the editor's .word-page / .word-page-inner scaffolding so
  //     paragraphs flow continuously instead of overlapping
  //   • hydrate data-spacing-before / -after into inline margins so the
  //     user's "Space Before / After Paragraph" choices reach the page
  //   • inject a <br> into empty <p>/headings so blank-line gaps survive
  //   • for structured reports, render the JSON sections as titled blocks
  const findingsHtml = useMemo(() => {
    if (!report) return '';
    const raw = report.findings ?? report.text ?? report.content ?? '';
    if (!raw) return '';
    const looksJson = typeof raw === 'string' && raw.trim().startsWith('{');
    if (looksJson) {
      try {
        const data = JSON.parse(raw);
        return Object.entries(data).map(([k, v]) => (
          `<div style="margin-bottom: 18px;">
             <div style="font-size: 10px; font-weight: 800; color: #64748b; text-transform: uppercase; letter-spacing: 1.5px; margin-bottom: 4px;">${k.replace(/_/g, ' ')}</div>
             <div style="white-space: pre-wrap;">${v || ''}</div>
           </div>`
        )).join('');
      } catch {
        return raw;
      }
    }
    const tmp = document.createElement('div');
    tmp.innerHTML = raw;
    tmp.querySelectorAll('.word-page-inner').forEach(el => {
      const parent = el.parentNode;
      while (el.firstChild) parent.insertBefore(el.firstChild, el);
      parent.removeChild(el);
    });
    tmp.querySelectorAll('.word-page').forEach(el => {
      const parent = el.parentNode;
      while (el.firstChild) parent.insertBefore(el.firstChild, el);
      parent.removeChild(el);
    });
    tmp.querySelectorAll('[data-spacing-before], [data-spacing-after]').forEach(el => {
      const before = el.getAttribute('data-spacing-before');
      const after  = el.getAttribute('data-spacing-after');
      const styles = [];
      if (before) styles.push(`margin-top: ${before}`);
      if (after)  styles.push(`margin-bottom: ${after}`);
      const existing = el.getAttribute('style') || '';
      const sep = existing && !existing.trim().endsWith(';') ? '; ' : '';
      el.setAttribute('style', existing + sep + styles.join('; '));
    });
    tmp.querySelectorAll('p, h1, h2, h3, h4, h5, h6, li').forEach(el => {
      if (!el.textContent.trim() && el.children.length === 0) {
        el.innerHTML = '<br>';
      }
    });
    return tmp.innerHTML;
  }, [report]);

  // Share via the native share sheet (mobile: WhatsApp, Telegram, Email, etc.).
  // Falls back to a WhatsApp web link if the Web Share API is unavailable
  // (older desktop browsers). The patient picks the recipient themselves.
  const handleShare = async () => {
    const shareUrl = window.location.href;
    const modality = study?.modality || 'radiology';
    const shareData = {
      title: 'My Radiology Report',
      text: `My ${modality} report from 1Rad`,
      url: shareUrl,
    };
    try {
      if (navigator.share) {
        await navigator.share(shareData);
        return;
      }
    } catch (err) {
      // User cancelled the share sheet — silent.
      if (err?.name === 'AbortError') return;
      console.warn('Native share failed, falling back to WhatsApp', err?.message);
    }
    // Fallback: open WhatsApp with a pre-filled message. No phone number,
    // so WhatsApp lets the patient choose the contact themselves.
    const text = encodeURIComponent(`${shareData.text}: ${shareUrl}`);
    window.open(`https://wa.me/?text=${text}`, '_blank');
  };

  const handleSaveOrPrint = () => {
    // Single button covers both. Mobile browsers' print dialog has a
    // "Save as PDF" / "Save to Files" destination on every modern platform.
    window.print();
  };

  const steps = [
    { key: 'booked', label: 'BOOKED', icon: '📅' },
    { key: 'confirmed', label: 'ARRIVED', icon: '📍' },
    { key: 'in_progress', label: 'SCANNING', icon: '🌀' },
    { key: 'scanned', label: 'ACQUIRED', icon: '📡' },
    { key: 'reporting', label: 'ANALYZING', icon: '📝' },
    { key: 'reported', label: 'FINALIZED', icon: '✅' }
  ];

  const currentStatus = study?.status?.toLowerCase() || 'booked';
  const currentIndex = steps.findIndex(s => s.key === currentStatus);

  // (printReport replaced by handleSaveOrPrint above.)

  // Token missing / invalid / expired — show a clear state so the patient
  // knows to ask for a fresh QR instead of refreshing forever.
  if (!loading && (authError || (!study && !token))) return (
    <div style={{ minHeight: '100vh', background: '#0a1628', color: 'white', fontFamily: 'Inter, sans-serif', padding: '40px 18px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ maxWidth: '420px', textAlign: 'center' }}>
        <div style={{ fontSize: '56px', marginBottom: '16px' }}>🔒</div>
        <div style={{ fontSize: '11px', fontWeight: 800, color: '#60a5fa', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: '10px' }}>1Rad · Report Tracker</div>
        <h1 style={{ fontSize: '22px', fontWeight: 900, margin: 0 }}>This link is invalid or expired</h1>
        <p style={{ fontSize: '13px', color: '#94a3b8', marginTop: '14px', lineHeight: 1.6 }}>
          Please re-scan the QR code on your most recent prescription or
          booking slip. If you still see this message, the centre can issue
          you a fresh link.
        </p>
      </div>
    </div>
  );

  if (loading) return (
    <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0a1628', color: 'white' }}>
      <div className="dicom-loader"></div>
      <style>{`
        .dicom-loader { width: 40px; height: 40px; border: 3px solid rgba(15, 82, 186, 0.1); border-top: 3px solid #0f52ba; border-radius: 50%; animation: spin 1s linear infinite; }
        @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
      `}</style>
    </div>
  );

  // ── Report view (finalized) ─────────────────────────────────────────────────
  if (report) {
    const name      = (study?.patientName || '').toUpperCase() || '—';
    const ptid      = study?.patientIdentifier || study?.ptid || study?.id || '—';
    const age       = study?.patientAge || study?.age || '—';
    const sex       = study?.patientGender || study?.gender || '—';
    const studyName = study?.service || study?.modality || '—';
    const modality  = study?.modality || '—';
    const refBy     = study?.referredBy || 'Self';
    const repDate   = report?.finalizedAt
      ? new Date(report.finalizedAt).toLocaleDateString()
      : new Date().toLocaleDateString();

    return (
      <div className="track-report-root" style={{
        minHeight: '100vh', background: '#e2e8f0', padding: '24px 12px',
        fontFamily: '"Inter", "Helvetica Neue", "Segoe UI", -apple-system, sans-serif',
      }}>
        <div style={{ maxWidth: '780px', margin: '0 auto' }}>

          {/* Top bar — only on screen, hidden on print. Stacks on small
              screens (most patients view this on a phone). */}
          <div className="track-toolbar" style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            marginBottom: '14px', gap: '10px', flexWrap: 'wrap',
          }}>
            <div style={{ fontSize: '11px', color: '#475569', fontWeight: 700, letterSpacing: '1.2px', textTransform: 'uppercase' }}>
              1RAD · Final Report
            </div>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <button
                onClick={handleSaveOrPrint}
                style={{
                  background: '#0f52ba', color: 'white', border: 'none',
                  padding: '10px 16px', borderRadius: '10px', fontSize: '12px',
                  fontWeight: 800, cursor: 'pointer',
                  boxShadow: '0 2px 6px rgba(15,82,186,0.3)',
                  display: 'inline-flex', alignItems: 'center', gap: '6px',
                }}
              >💾 Save as PDF</button>
              <button
                onClick={handleShare}
                style={{
                  background: '#25D366', color: 'white', border: 'none',
                  padding: '10px 16px', borderRadius: '10px', fontSize: '12px',
                  fontWeight: 800, cursor: 'pointer',
                  boxShadow: '0 2px 6px rgba(37,211,102,0.35)',
                  display: 'inline-flex', alignItems: 'center', gap: '6px',
                }}
              >📲 Share</button>
            </div>
          </div>

          {/* Report sheet */}
          <div className="track-report-sheet" style={{
            position: 'relative',
            background: 'white', borderRadius: '10px',
            boxShadow: '0 4px 18px rgba(15, 23, 42, 0.08)',
            padding: '24px 28px',
            overflow: 'hidden',
          }}>

            {/* Letterhead background (best-effort — patients without the
                doctor's branding still get a clean white sheet). */}
            {letterheadUrl && (
              <img
                src={letterheadUrl}
                alt=""
                style={{
                  position: 'absolute', inset: 0,
                  width: '100%', height: '100%',
                  objectFit: 'fill',
                  pointerEvents: 'none',
                  zIndex: 0,
                }}
                onError={(e) => { e.target.style.display = 'none'; }}
              />
            )}

            <div style={{ position: 'relative', zIndex: 1 }}>

            {/* Patient header — same layout as PatientInfoBlock */}
            <div style={{
              position: 'relative',
              display: 'flex', alignItems: 'center', gap: '14px',
              background: 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)',
              border: '1px solid #e2e8f0', borderRadius: '10px',
              padding: '10px 14px 10px 12px', marginBottom: '14px',
              fontFeatureSettings: '"tnum" 1, "lnum" 1',
            }}>
              <div style={{
                position: 'absolute', top: 0, bottom: 0, left: 0, width: '4px',
                background: 'linear-gradient(180deg, #0f52ba 0%, #1e40af 50%, #0f52ba 100%)',
              }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '17px', fontWeight: 800, color: '#0a1628', letterSpacing: '-0.2px', lineHeight: 1.2 }}>{name}</div>
                <div style={{ fontSize: '10.5px', color: '#475569', marginTop: '3px', display: 'flex', alignItems: 'center', gap: '7px', flexWrap: 'wrap' }}>
                  <span><span style={{ color: '#94a3b8', fontWeight: 700 }}>Patient ID:</span> <strong style={{ color: '#0f172a' }}>{ptid}</strong></span>
                  <span style={{ color: '#cbd5e1' }}>·</span>
                  <span><span style={{ color: '#94a3b8', fontWeight: 700 }}>Age/Sex:</span> <strong style={{ color: '#0f172a' }}>{age} / {sex}</strong></span>
                  <span style={{ color: '#cbd5e1' }}>·</span>
                  <span><span style={{ color: '#94a3b8', fontWeight: 700 }}>Study:</span> <strong style={{ color: '#0f52ba' }}>{studyName}</strong></span>
                  <span style={{ color: '#cbd5e1' }}>·</span>
                  <span><span style={{ color: '#94a3b8', fontWeight: 700 }}>Prescribed By:</span> <strong style={{ color: '#0f172a' }}>{refBy}</strong></span>
                </div>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0, paddingLeft: '8px', borderLeft: '1px solid #e2e8f0', minWidth: '70px' }}>
                <div style={{ fontSize: '8px', fontWeight: 800, color: '#94a3b8', letterSpacing: '1.5px', textTransform: 'uppercase' }}>Reported</div>
                <div style={{ fontSize: '12px', fontWeight: 700, color: '#1e293b', marginTop: '2px' }}>{repDate}</div>
              </div>
            </div>

            <div style={{
              fontSize: '10.5px', fontStyle: 'italic', color: '#475569',
              textAlign: 'center', marginBottom: '14px',
            }}>
              Thank you for referring the patient for <strong style={{ color: '#0f52ba', fontStyle: 'normal' }}>{modality}</strong>.
            </div>

            {/* Report content — built by `findingsHtml`, which unwraps the
                editor's page scaffolding, hydrates the spacing attrs, and
                preserves blank-line gaps so the rendering matches the
                radiology workspace's preview exactly. */}
            <div
              className="report-content"
              style={{
                fontFamily: protocol?.fontFamily || '"Calibri", "Segoe UI", sans-serif',
                fontSize: `${protocol?.fontSize || 12}pt`,
                lineHeight: 1.6,
                color: protocol?.fontColor || '#000',
              }}
              dangerouslySetInnerHTML={{ __html: findingsHtml }}
            />

            {/* Impression / advice if present */}
            {report.impression && (
              <div style={{ marginTop: '18px' }}>
                <div style={{ fontSize: '11px', fontWeight: 800, color: '#0f52ba', letterSpacing: '1px', marginBottom: '6px' }}>IMPRESSION</div>
                <div style={{ fontSize: '12pt', lineHeight: 1.6, color: '#000', whiteSpace: 'pre-wrap' }}>
                  {report.impression}
                </div>
              </div>
            )}
            {report.advice && (
              <div style={{ marginTop: '18px' }}>
                <div style={{ fontSize: '11px', fontWeight: 800, color: '#0f52ba', letterSpacing: '1px', marginBottom: '6px' }}>ADVICE</div>
                <div style={{ fontSize: '11pt', lineHeight: 1.6, color: '#374151', fontStyle: 'italic', whiteSpace: 'pre-wrap' }}>
                  {report.advice}
                </div>
              </div>
            )}
            </div>
          </div>

          <div style={{ textAlign: 'center', marginTop: '14px', fontSize: '10px', color: '#94a3b8' }}>
            Scanned via 1Rad QR · Token #{study?.displayId || id}
          </div>
        </div>

        <style>{`
          .report-content p { margin: 0 0 8px 0; }
          .report-content h1 { font-size: 20pt; font-weight: 700; line-height: 1.2; margin: 0 0 12px 0; color: #1f3864; border-bottom: 1px solid #4472c4; padding-bottom: 4px; }
          .report-content h2 { font-size: 16pt; font-weight: 700; margin: 14px 0 8px 0; color: #2e4d7b; }
          .report-content h3 { font-size: 14pt; font-weight: 600; margin: 12px 0 6px 0; color: #2e4d7b; }
          .report-content h4 { font-size: 12pt; font-weight: 600; margin: 10px 0 4px 0; color: #374151; }
          .report-content ul, .report-content ol { padding-left: 28px; margin: 6px 0 10px; }
          .report-content table { border-collapse: collapse; width: 100%; margin: 10px 0; border: 1px solid #c8c8c8; }
          .report-content th { background: #d6e4f7; padding: 7px 12px; border: 1px solid #c8c8c8; font-weight: 700; color: #1f3864; }
          .report-content td { padding: 7px 12px; border: 1px solid #c8c8c8; vertical-align: top; }
          .report-content img { max-width: 100%; height: auto; }
          @media print {
            body { background: white !important; }
            .track-toolbar { display: none !important; }
            .track-report-root { background: white !important; padding: 0 !important; }
            .track-report-sheet { box-shadow: none !important; padding: 0 !important; border-radius: 0 !important; }
          }
        `}</style>
      </div>
    );
  }

  // ── Live tracker (in-progress) ──────────────────────────────────────────────
  // Each step maps to a real timestamp on the appointment so the patient
  // sees "Arrived at 10:32 AM" instead of just "Completed". The map keeps
  // the JSX clean and makes it easy to add or rename a step later.
  const stepTimestamps = {
    booked:      study?.dateTime,
    confirmed:   study?.arrivedAt,
    in_progress: study?.scanStartedAt,
    scanned:     study?.scannedAt,
    reporting:   null, // No discrete timestamp — show as the in-flight stage.
    reported:    study?.deliveredAt,
  };

  // Helpers
  const parseUtc = (iso) => {
    if (!iso) return null;
    const hasTz = /[zZ]|[+-]\d{2}:?\d{2}$/.test(iso);
    return new Date(hasTz ? iso : iso + 'Z');
  };
  const fmtTime = (iso) => {
    const d = parseUtc(iso);
    if (!d || Number.isNaN(d.getTime())) return null;
    return d.toLocaleTimeString('en-IN', {
      timeZone: 'Asia/Kolkata',
      hour: '2-digit', minute: '2-digit', hour12: true,
    });
  };
  const onPremises = study?.arrivedAt && !study?.deliveredAt
    ? formatElapsed(study.arrivedAt)
    : null;

  // Expiry rule: a token QR is meaningful only on the day of the visit.
  // It expires at the exact stroke of midnight IST (i.e., right after
  // 11:59 PM) on the appointment day. Once midnight passes, the live
  // tracker stops — the patient is no longer on premises and shouldn't
  // keep polling a stale state. A delivered report can still be re-viewed
  // via the same QR forever (the report-view branch above runs first).
  //
  // IST is fixed UTC+5:30 (no DST), so no timezone library needed.
  const isExpired = (() => {
    if (!study?.dateTime) return false;
    if (report) return false; // Finalized reports never expire.
    const apptUtc = parseUtc(study.dateTime);
    if (!apptUtc) return false;
    const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
    // Shift to IST wall-clock so .setUTCHours(0,0,0,0) snaps to IST midnight
    // of the appointment day. Then add a full day to land on IST midnight
    // of the NEXT day — i.e., the instant right after 11:59 PM.
    const apptIst = new Date(apptUtc.getTime() + IST_OFFSET_MS);
    apptIst.setUTCHours(0, 0, 0, 0);
    const expiryUtc = new Date(apptIst.getTime() + (24 * 60 * 60 * 1000) - IST_OFFSET_MS);
    return Date.now() >= expiryUtc.getTime();
  })();

  if (isExpired) {
    return (
      <div style={{ minHeight: '100vh', background: '#0a1628', color: 'white', fontFamily: 'Inter, sans-serif', padding: '40px 18px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ maxWidth: '420px', textAlign: 'center' }}>
          <div style={{ fontSize: '56px', marginBottom: '16px' }}>⌛</div>
          <div style={{ fontSize: '11px', fontWeight: 800, color: '#60a5fa', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: '10px' }}>1Rad · Report Tracker</div>
          <h1 style={{ fontSize: '22px', fontWeight: 900, margin: 0, letterSpacing: '-0.3px' }}>This tracker has expired</h1>
          <p style={{ fontSize: '13px', color: '#94a3b8', marginTop: '14px', lineHeight: 1.6 }}>
            The live status link is only active on the day of your visit and
            expires at <strong style={{ color: 'white' }}>11:59 PM</strong> the same day.
          </p>
          <p style={{ fontSize: '12px', color: '#cbd5e1', marginTop: '20px', lineHeight: 1.6 }}>
            If your report is ready, please re-scan the prescription QR or
            contact the centre. We’ll be happy to share your report directly.
          </p>
          <div style={{ marginTop: '24px', padding: '14px 18px', background: 'rgba(255,255,255,0.04)', borderRadius: '12px', display: 'inline-block', fontSize: '11px', fontWeight: 600, color: '#94a3b8' }}>
            Token #{study?.dailyTokenNumber ?? study?.displayId ?? id}
          </div>
        </div>
      </div>
    );
  }

  // Combined "30 May 2026 · 11:45 AM IST"-style label for the appointment
  // slot, parsed UTC-safely so a server timestamp without a Z suffix isn't
  // misread as local time.
  const fmtAppointmentDate = (iso) => {
    const d = parseUtc(iso);
    if (!d || Number.isNaN(d.getTime())) return null;
    const date = d.toLocaleDateString('en-IN', {
      timeZone: 'Asia/Kolkata',
      day: '2-digit', month: 'short', year: 'numeric',
    });
    const time = d.toLocaleTimeString('en-IN', {
      timeZone: 'Asia/Kolkata',
      hour: '2-digit', minute: '2-digit', hour12: true,
    });
    return `${date} · ${time} IST`;
  };
  const appointmentSlot = fmtAppointmentDate(study?.dateTime);

  return (
    <div style={{ minHeight: '100vh', background: '#0a1628', color: 'white', fontFamily: 'Inter, sans-serif', padding: '28px 18px 60px' }}>
      <div style={{ maxWidth: '500px', margin: '0 auto' }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '28px' }}>
          <div style={{ fontSize: '11px', fontWeight: 800, color: '#60a5fa', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: '8px' }}>1Rad · Report Tracker</div>
          <h1 style={{ fontSize: '24px', fontWeight: 900, margin: 0, letterSpacing: '-0.5px' }}>
            {currentStatus === 'reported' ? 'Your report is ready' : 'We’re working on your report'}
          </h1>
          <div style={{ fontSize: '12px', opacity: 0.55, marginTop: '6px', fontWeight: 600 }}>Token #{study?.displayId || id}</div>
        </div>

        {/* Patient Info Card — labelled field grid mirroring the printed
            token slip, so the patient can verify each detail at a glance:
            TOKEN NO · PATIENT ID · NAME · DATE · MODALITY · STUDY. */}
        <div style={{
          background: 'rgba(255,255,255,0.05)', borderRadius: '20px',
          padding: '20px', border: '1px solid rgba(255,255,255,0.1)',
          marginBottom: '22px',
        }}>
          {/* Status badge floats top-right */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
            <div style={{ fontSize: '10px', fontWeight: 800, letterSpacing: '1.5px', color: '#60a5fa', textTransform: 'uppercase' }}>
              Booking Slip
            </div>
            <div style={{
              background: currentStatus === 'reported' ? '#16a34a' : '#0f52ba',
              color: 'white', padding: '5px 10px',
              borderRadius: '8px', fontSize: '9px', fontWeight: 900, letterSpacing: '1px',
              boxShadow: currentStatus === 'reported' ? '0 0 20px rgba(22,163,74,0.5)' : '0 0 20px rgba(15,82,186,0.4)',
            }}>
              {currentStatus === 'reported' ? 'READY' : 'LIVE'}
            </div>
          </div>

          {/* Two-column label/value grid. Values are vertically aligned so
              labels run as a column down the left and data sits to the right. */}
          <div style={{ display: 'grid', gridTemplateColumns: '90px 1fr', rowGap: '10px', columnGap: '10px', alignItems: 'baseline' }}>
            <TrackerField label="Token No" value={study?.dailyTokenNumber ?? '—'} highlight />
            <TrackerField label="Patient ID" value={study?.patientIdentifier || '—'} mono />
            <TrackerField label="Name" value={(study?.patientName || '').toUpperCase() || '—'} />
            <TrackerField label="Date" value={appointmentSlot || '—'} />
            <TrackerField label="Modality" value={study?.modality || '—'} />
            <TrackerField label="Study" value={study?.service || '—'} />
          </div>

          {/* On-premises clock — only while the patient is actually here. */}
          {onPremises && (
            <div style={{
              marginTop: '14px', paddingTop: '12px',
              borderTop: '1px dashed rgba(255,255,255,0.1)',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              fontSize: '11px', fontWeight: 700,
            }}>
              <span style={{ opacity: 0.6 }}>⏱ Time on premises</span>
              <span style={{ color: '#60a5fa', fontVariantNumeric: 'tabular-nums' }}>{onPremises}</span>
            </div>
          )}
        </div>

        {/* Timeline */}
        <div style={{ position: 'relative', paddingLeft: '46px' }}>
          <div style={{ position: 'absolute', left: '20px', top: '10px', bottom: '10px', width: '2px', background: 'rgba(255,255,255,0.1)' }}></div>
          {steps.map((step, idx) => {
            const isDone = idx <= currentIndex;
            const isCurrent = idx === currentIndex;
            const stamp = isDone ? fmtTime(stepTimestamps[step.key]) : null;
            return (
              <div key={step.key} style={{ marginBottom: '26px', position: 'relative', opacity: isDone ? 1 : 0.35 }}>
                <div style={{
                  position: 'absolute', left: '-34px', top: '2px', width: '14px', height: '14px',
                  borderRadius: '50%',
                  background: isCurrent ? '#0f52ba' : isDone ? '#16a34a' : '#1e293b',
                  boxShadow: isCurrent ? '0 0 16px #0f52ba' : 'none',
                  zIndex: 2, border: '3px solid #0a1628',
                  animation: isCurrent ? 'trackPulse 1.6s ease-in-out infinite' : 'none',
                }}></div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <span style={{ fontSize: '22px', flexShrink: 0 }}>{step.icon}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '13px', fontWeight: 900, color: isCurrent ? '#60a5fa' : 'white', letterSpacing: '0.3px' }}>{step.label}</div>
                    <div style={{ fontSize: '10px', opacity: 0.6, marginTop: '2px', fontWeight: 600 }}>
                      {isCurrent
                        ? 'In progress now'
                        : isDone
                          ? (stamp ? `Completed at ${stamp}` : 'Completed')
                          : 'Pending'}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div style={{
          marginTop: '32px', textAlign: 'center', padding: '18px 20px',
          background: 'rgba(255,255,255,0.03)', borderRadius: '16px',
          border: '1px solid rgba(255,255,255,0.06)',
        }}>
          <p style={{ fontSize: '12px', color: '#94a3b8', margin: 0, lineHeight: 1.5 }}>
            {currentStatus === 'reported'
              ? 'Your report is being prepared for viewing. This page will refresh automatically.'
              : currentStatus === 'reporting'
                ? 'Our radiologist is preparing your report. We’ll update this page as soon as it’s ready.'
                : currentStatus === 'scanned' || currentStatus === 'in_progress'
                  ? 'Your scan is complete. The report will be ready shortly.'
                  : 'Please relax in the waiting area. This page updates automatically as your visit progresses.'}
          </p>
          <p style={{ fontSize: '10px', color: '#64748b', marginTop: '10px', marginBottom: 0, fontWeight: 600 }}>
            Auto-refreshing every 30 seconds
          </p>
        </div>

        <style>{`
          @keyframes trackPulse {
            0%, 100% { transform: scale(1);   box-shadow: 0 0 0 0 rgba(15, 82, 186, 0.7); }
            50%      { transform: scale(1.15); box-shadow: 0 0 0 10px rgba(15, 82, 186, 0); }
          }
        `}</style>
      </div>
    </div>
  );
}

// Single label/value row in the booking-slip card. `highlight` boosts the
// value's font size + colour for the token number; `mono` swaps to a
// tabular font for IDs so digits don't shift between renders.
function TrackerField({ label, value, highlight, mono }) {
  return (
    <>
      <div style={{
        fontSize: '10px',
        fontWeight: 800,
        letterSpacing: '1.5px',
        textTransform: 'uppercase',
        color: '#94a3b8',
      }}>{label}:</div>
      <div style={{
        fontSize: highlight ? '20px' : '13px',
        fontWeight: highlight ? 900 : 700,
        color: highlight ? '#60a5fa' : 'white',
        letterSpacing: highlight ? '-0.5px' : '0',
        fontFamily: mono ? '"JetBrains Mono", ui-monospace, Menlo, Consolas, monospace' : 'inherit',
        wordBreak: 'break-word',
        lineHeight: 1.3,
      }}>{value}</div>
    </>
  );
}
