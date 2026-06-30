import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import apiClient from '../api/apiClient';
import AdvancedDicomViewer from '../components/AdvancedDicomViewer';

/**
 * Public, login-free viewer for a study shared via a secret 24h link
 * (/share/:token). No auth — access is gated entirely by the signed token.
 * On expiry the backend returns 410 and we show a branded expiry + upgrade
 * message. Designed to work on mobile, tablet and desktop.
 */
const LOGO = `${import.meta.env.BASE_URL}Logo.png`;

function Brand({ size = 34 }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <img src={LOGO} alt="NexEagle" style={{ width: size, height: size, objectFit: 'contain', borderRadius: 8, background: 'rgba(255,255,255,0.1)', padding: 3 }} />
      <div style={{ lineHeight: 1.1 }}>
        <div style={{ color: 'white', fontSize: size * 0.5, fontWeight: 900, letterSpacing: 0.3 }}>NexEagle</div>
        <div style={{ color: '#93c5fd', fontSize: size * 0.34, fontWeight: 800, letterSpacing: 1.5 }}>1Rad</div>
      </div>
    </div>
  );
}

export default function SharedStudyPage() {
  const { token } = useParams();
  const [state, setState] = useState('loading'); // loading | ready | expired | invalid | error
  const [series, setSeries] = useState([]);
  const [active, setActive] = useState(0);
  const [meta, setMeta] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await apiClient.get(`/Study/shared/${token}/manifest`);
        if (cancelled) return;
        const data = res?.data?.data;
        const assets = data?.assets || [];
        const built = [];
        for (const asset of assets) {
          if (asset.extractionStatus === 'Extracted' && Array.isArray(asset.series)) {
            asset.series.forEach((s) => {
              const files = (s.slices || []).map((slice, i) => ({
                name: `${slice.sopInstanceUID || 'slice'}_${i}.dcm`,
                size: 0, type: 'application/dicom',
                dicomUrl: slice.url,
                frameUrl: slice.frameUrl,
                sopInstanceUID: slice.sopInstanceUID,
                instanceNumber: slice.instanceNumber,
              }));
              if (files.length) built.push({ name: s.seriesDescription || `Series ${built.length + 1}`, modality: s.modality, files, thumbnailUrl: s.thumbnailUrl });
            });
          } else if (asset.extractionStatus === 'NotApplicable' && asset.blobUrl) {
            const ft = (asset.fileType || '').toLowerCase();
            if (ft === 'dcm' || ft === 'dicom') {
              built.push({ name: asset.fileName || 'Image', modality: '', files: [{ name: asset.fileName || 'image.dcm', size: 0, type: 'application/dicom', dicomUrl: asset.blobUrl }] });
            }
          }
        }
        if (built.length === 0) { setState('error'); return; }
        setSeries(built);
        setMeta({ patientName: data?.patientName, modality: data?.modality, studyDate: data?.studyDate });
        setState('ready');
      } catch (e) {
        if (cancelled) return;
        const code = e?.response?.data?.code;
        const status = e?.response?.status;
        if (code === 'SHARE_EXPIRED' || status === 410) setState('expired');
        else if (code === 'SHARE_INVALID' || status === 404) setState('invalid');
        else setState('error');
      }
    })();
    return () => { cancelled = true; };
  }, [token]);

  // ── Branded full-screen message (expired / invalid / error) ──────────────
  if (state === 'expired' || state === 'invalid' || state === 'error') {
    const isExpired = state === 'expired';
    return (
      <div style={{ minHeight: '100dvh', background: 'radial-gradient(ellipse at top, #0f172a 0%, #020617 100%)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24, fontFamily: 'system-ui, "Segoe UI", sans-serif' }}>
        <div style={{ marginBottom: 28 }}><Brand size={46} /></div>
        <div style={{ width: '100%', maxWidth: 460, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 22, padding: '36px 28px', textAlign: 'center' }}>
          <div style={{ fontSize: 44, marginBottom: 14 }}>{isExpired ? '⏳' : '🔒'}</div>
          <h1 style={{ color: 'white', fontSize: 20, fontWeight: 800, margin: '0 0 10px' }}>
            {isExpired ? 'This share link has expired' : state === 'invalid' ? 'This link is not valid' : 'Study unavailable'}
          </h1>
          <p style={{ color: '#94a3b8', fontSize: 13.5, lineHeight: 1.7, margin: '0 0 24px' }}>
            {isExpired
              ? 'Shared study links stay active for 24 hours for security. Please ask the centre to send you a fresh link.'
              : state === 'invalid'
                ? 'The link may be mistyped or was revoked. Ask the centre to share the study again.'
                : 'The shared study could not be loaded. Please request a new link.'}
          </p>
          <div style={{ background: 'linear-gradient(135deg, rgba(29,78,216,0.18), rgba(56,189,248,0.12))', border: '1px solid rgba(56,189,248,0.25)', borderRadius: 16, padding: '18px 18px', textAlign: 'left' }}>
            <div style={{ fontSize: 10.5, fontWeight: 900, letterSpacing: 1.5, color: '#7dd3fc', marginBottom: 8 }}>WHY 1Rad?</div>
            <ul style={{ margin: 0, paddingLeft: 18, color: '#cbd5e1', fontSize: 12.5, lineHeight: 1.9 }}>
              <li><strong>Faster reporting</strong> — cloud DICOM that opens in seconds, even on mobile.</li>
              <li><strong>Bank-grade security</strong> — encrypted storage and expiring, audited share links.</li>
              <li><strong>Effortless collaboration</strong> — share studies with any referring doctor instantly.</li>
            </ul>
            <div style={{ color: '#7dd3fc', fontSize: 12, fontWeight: 700, marginTop: 12 }}>
              Ask your diagnostic centre about NexEagle 1Rad.
            </div>
          </div>
        </div>
        <div style={{ color: '#475569', fontSize: 11, marginTop: 20 }}>Powered by NexEagle 1Rad · Secure cloud radiology</div>
      </div>
    );
  }

  if (state === 'loading') {
    return (
      <div style={{ minHeight: '100dvh', background: '#020617', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 18 }}>
        <Brand size={44} />
        <div style={{ width: 38, height: 38, border: '3px solid rgba(59,130,246,0.2)', borderTopColor: '#3b82f6', borderRadius: '50%', animation: 'shspin 0.8s linear infinite' }} />
        <div style={{ color: '#3b82f6', fontSize: 13, fontWeight: 800, letterSpacing: 2 }}>LOADING SECURE STUDY</div>
        <style>{`@keyframes shspin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  // ── Ready: header + viewer ───────────────────────────────────────────────
  const current = series[active];
  return (
    <div style={{ height: '100dvh', width: '100dvw', background: '#000', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxSizing: 'border-box', paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)', paddingLeft: 'env(safe-area-inset-left)', paddingRight: 'env(safe-area-inset-right)' }}>
      <div style={{ height: 56, flexShrink: 0, background: 'linear-gradient(135deg, #0f172a, #1e293b)', borderBottom: '2px solid #334155', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 16px' }}>
        <Brand size={32} />
        <div style={{ textAlign: 'right', color: '#94a3b8', fontSize: 12 }}>
          <div style={{ color: 'white', fontWeight: 800, fontSize: 13 }}>{meta?.patientName || 'Shared study'}</div>
          <div>{(meta?.modality || '') } · secure 24h link</div>
        </div>
      </div>

      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        {series.length > 1 && (
          <div style={{ width: 92, flexShrink: 0, background: 'linear-gradient(180deg,#0f172a,#1e293b)', borderRight: '2px solid #334155', overflowY: 'auto', padding: 8 }}>
            {series.map((s, i) => (
              <button key={i} onClick={() => setActive(i)} style={{ width: '100%', marginBottom: 8, padding: 6, borderRadius: 8, cursor: 'pointer', textAlign: 'center', background: active === i ? 'linear-gradient(135deg,#8b5cf6,#6366f1)' : 'rgba(255,255,255,0.05)', border: active === i ? '2px solid #8b5cf6' : '2px solid transparent', color: 'white' }}>
                {s.thumbnailUrl && <img src={s.thumbnailUrl} alt="" loading="lazy" style={{ width: '100%', aspectRatio: '1/1', objectFit: 'contain', borderRadius: 6, background: '#000', marginBottom: 4 }} />}
                <div style={{ fontSize: 9, fontWeight: 800 }}>S{i + 1}</div>
                <div style={{ fontSize: 8, opacity: 0.7 }}>{s.files.length} slc</div>
              </button>
            ))}
          </div>
        )}
        <div style={{ flex: 1, position: 'relative', minWidth: 0 }}>
          <AdvancedDicomViewer
            key={`shared-${active}`}
            files={current?.files}
            seriesName={current?.name}
            modality={current?.modality || undefined}
            autoMpr={false}
            enableFullscreen={false}
            placeholderUrl={current?.thumbnailUrl}
          />
        </div>
      </div>
    </div>
  );
}
