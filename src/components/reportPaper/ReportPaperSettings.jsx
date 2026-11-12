import React, { useEffect, useMemo, useRef, useState } from 'react';
import apiClient from '../../api/apiClient';
import { notifyToast } from '../../utils/toast';
import { C, FONT } from '../saral/tokens';
import {
  PAPER_MODES, ACCENTS, TEXT_FONTS, normalizePaper, loadPaperAssets, ensurePaperFonts,
  buildReportSheets, printDocumentHtml, paperCss, effectiveMode, resolveAssetUrl,
} from './reportPaper';
import { renderPdfLetterhead } from './pdfLetterhead';

/**
 * Admin ▸ Report paper — how every report from this centre looks on paper.
 * Three ways: own header + footer pictures, our standard design, or the
 * centre's own pre-printed letterhead. One setting per centre.
 */

const SAMPLE = {
  facts: {
    patientName: 'Mrs. Pooja Kumari', patientId: 'SD-2026-04812', age: '26', sex: 'Female',
    referredBy: 'Dr. A. Sinha, MS (Obs & Gyn)', study: 'USG — Obstetric (Level II)',
    scanDate: new Date(), reportDate: new Date(), accession: '',
    status: 'FINAL', signedAt: new Date(),
  },
  chunks: ['<p>Single live intrauterine fetus in cephalic presentation with regular cardiac activity. Fetal heart rate 148 bpm.</p><p>Composite ultrasound gestational age <b>22 weeks 3 days</b>; estimated fetal weight 512 g (54th centile). EDD by scan matches dates.</p><p>Placenta is posterior, upper segment, grade I. No previa. Liquor is adequate — single deepest pocket 5.2 cm, AFI 13.</p><p>Fetal head, spine, four-chamber heart, stomach, kidneys, bladder and limbs appear normal for gestational age.</p>'],
  impression: 'Single live intrauterine pregnancy of 22 weeks 3 days in cephalic presentation. No obvious congenital anomaly.',
  advice: 'Routine antenatal follow-up. Growth scan at 32 weeks.',
};

const MODE_CARDS = [
  { id: PAPER_MODES.IMAGES, title: 'My own header & footer', sub: 'Upload two pictures — header and footer. We write the report in between.' },
  { id: PAPER_MODES.STANDARD, title: 'Use our standard design', sub: "A clean, ready report built from your centre's name, address and logo. Nothing to upload." },
  { id: PAPER_MODES.LETTERHEAD, title: 'Print on my own letterhead paper', sub: 'You already have printed paper. We print only the report text, in the right place on it.' },
];

const btn = (on) => ({
  height: 44, padding: '0 18px', borderRadius: 12, fontSize: 15, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
  border: on ? `2px solid ${C.primary}` : `1.5px solid ${C.lineStrong}`, background: on ? C.primarySoft : 'white', color: on ? C.primary : C.ink,
});
const box = { background: 'white', border: `1.5px solid ${C.line}`, borderRadius: 16, padding: 18, display: 'flex', flexDirection: 'column', gap: 14 };
const h = { fontSize: 18, fontWeight: 800 };
const note = { background: C.ground, borderRadius: 12, padding: '10px 12px', fontSize: 15, color: '#374151', lineHeight: 1.45 };

function Stepper({ label, value, onChange, min, max, step = 5, unit = 'mm' }) {
  const set = (v) => onChange(Math.max(min, Math.min(max, v)));
  const sq = { width: 44, height: 44, borderRadius: 12, border: `1.5px solid ${C.lineStrong}`, background: 'white', fontSize: 22, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' };
  return (
    <div style={{ flex: 1, minWidth: 180, background: C.ground, borderRadius: 12, padding: '10px 12px' }}>
      <div style={{ fontSize: 15, color: C.muted }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4 }}>
        <button type="button" aria-label={`${label} less`} style={sq} onClick={() => set(value - step)}>−</button>
        <span style={{ fontSize: 22, fontWeight: 800, minWidth: 80, textAlign: 'center' }}>{value} {unit}</span>
        <button type="button" aria-label={`${label} more`} style={sq} onClick={() => set(value + step)}>+</button>
      </div>
    </div>
  );
}

function Tick({ on, onClick, children }) {
  return (
    <button type="button" onClick={onClick} style={{ display: 'flex', gap: 10, alignItems: 'center', background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: 16, color: C.ink, fontFamily: 'inherit', textAlign: 'left' }}>
      <span style={{ width: 24, height: 24, borderRadius: 7, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, color: 'white', background: on ? C.ok : 'white', border: on ? 'none' : `2px solid ${C.lineStrong}` }}>{on ? '✓' : ''}</span>
      {children}
    </button>
  );
}

function PictureTile({ title, hint, url, isPdf = false, onPick, onRemove, accept = 'image/png,image/jpeg' }) {
  const ref = useRef(null);
  return (
    <div style={{ flex: 1, minWidth: 220, border: '2px dashed #A5B4FC', borderRadius: 14, padding: 12, background: '#F5F7FF' }}>
      <div style={{ fontSize: 15, fontWeight: 700, color: C.primary }}>{title}</div>
      <div style={{ height: 64, marginTop: 8, borderRadius: 8, background: 'white', border: `1px solid ${C.line}`, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
        {url && isPdf ? <span style={{ fontSize: 14, fontWeight: 700, color: C.ink }}>PDF saved</span>
          : url ? <img src={url} alt="" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
            : <span style={{ fontSize: 14, color: C.faint }}>No picture yet</span>}
      </div>
      <div style={{ fontSize: 14, color: C.muted, marginTop: 6 }}>{hint}</div>
      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        <button type="button" onClick={() => ref.current?.click()} style={{ ...btn(false), height: 38, padding: '0 14px', borderColor: C.primary, color: C.primary }}>{url ? 'Replace' : 'Upload'}</button>
        {url && <button type="button" onClick={onRemove} style={{ ...btn(false), height: 38, padding: '0 14px' }}>Remove</button>}
      </div>
      <input ref={ref} type="file" accept={accept} style={{ display: 'none' }}
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onPick(f); e.target.value = ''; }} />
    </div>
  );
}

const PREVIEW_W = 520; // px

export default function ReportPaperSettings({ currentUser }) {
  const [loaded, setLoaded] = useState(null);       // normalized server settings
  const [draft, setDraft] = useState(null);
  const [files, setFiles] = useState({});           // { header, footer, logo, letterhead } → File
  const [view, setView] = useState('print');        // LETTERHEAD: 'print' | 'pdf'
  const [preview, setPreview] = useState(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const applyLoaded = (p) => { setLoaded(p); setDraft(p); setFiles({}); };
  const fetchPaper = () => apiClient.get('/Prescription/me').then(res => normalizePaper(res.data));
  useEffect(() => {
    let cancelled = false;
    fetchPaper()
      .then(p => { if (!cancelled) applyLoaded(p); })
      .catch(e => { if (!cancelled) setErr(e?.response?.data?.error || 'Could not load the report paper settings.'); });
    return () => { cancelled = true; };
  }, []);

  // Object URLs for freshly picked files (preview only — revoked on change).
  const fileUrls = useMemo(() => {
    const out = {};
    Object.entries(files).forEach(([k, f]) => { if (f) out[k] = URL.createObjectURL(f); });
    return out;
  }, [files]);
  useEffect(() => () => Object.values(fileUrls).forEach(u => URL.revokeObjectURL(u)), [fileUrls]);

  // What the preview / save use: draft + any new pictures.
  const working = useMemo(() => draft && ({
    ...draft,
    header: fileUrls.header || draft.header,
    footer: fileUrls.footer || draft.footer,
    logo: fileUrls.logo || draft.logo,
    letterhead: fileUrls.letterhead || draft.letterhead,
  }), [draft, fileUrls]);

  // Live preview — the real builder, a sample report.
  useEffect(() => {
    if (!working) return;
    let cancelled = false;
    (async () => {
      const [assets] = await Promise.all([loadPaperAssets(working, { letterheadLoader: renderPdfLetterhead }), ensurePaperFonts()]);
      if (cancelled) return;
      const facts = { ...SAMPLE.facts, signerName: currentUser?.name || 'Dr. Reporting Radiologist', authorName: currentUser?.name || 'Dr. Reporting Radiologist', signerCredentials: [currentUser?.degree, currentUser?.specialty].filter(Boolean).join(', ') || 'MD (Radiodiagnosis)' };
      const target = working.mode === PAPER_MODES.LETTERHEAD ? view : 'print';
      const doc = buildReportSheets({ paper: working, target, assets, facts, chunks: SAMPLE.chunks, impression: SAMPLE.impression, advice: SAMPLE.advice, qr: null, guides: true });
      setPreview({ ...doc, sheet: doc.sheets[0] });
    })();
    return () => { cancelled = true; };
  }, [working, view, currentUser]);

  if (err && !draft) return <div style={{ padding: 30, fontFamily: FONT, fontSize: 16, color: C.danger }}>{err}</div>;
  if (!draft) return <div style={{ padding: 30, fontFamily: FONT, fontSize: 16, color: C.muted }}>Loading…</div>;

  const set = (patch) => setDraft(d => ({ ...d, ...patch }));
  const setM = (patch) => setDraft(d => ({ ...d, margins: { ...d.margins, ...patch } }));
  const pick = (k) => (f) => {
    if (f.size > 8 * 1024 * 1024) { notifyToast('That picture is larger than 8 MB. Please pick a smaller one.', 'warning'); return; }
    setErr('');
    setFiles(x => ({ ...x, [k]: f }));
  };
  const remove = (k) => () => { setFiles(x => ({ ...x, [k]: null })); set({ [k]: null }); };
  const m = draft.mode;
  const shown = (k) => fileUrls[k] || resolveAssetUrl(draft[k]);
  const isPdfLetterhead = files.letterhead ? files.letterhead.type === 'application/pdf' : /\.pdf(\?|$)/i.test(draft.letterhead || '');
  const dirty = JSON.stringify(draft) !== JSON.stringify(loaded) || Object.values(files).some(Boolean);

  const printTestPage = () => {
    // A frame where the text will go + mm marks, to hold against the paper.
    const t = draft.margins.top, b = draft.margins.bottom, l = draft.margins.left, r = draft.margins.right;
    const sheet = `<div class="rp-sheet"><div style="position:absolute;top:${t}mm;bottom:${b}mm;left:${l}mm;right:${r}mm;border:0.4mm dashed #111"></div>
      <div style="position:absolute;top:${t / 2 - 2}mm;left:0;right:0;text-align:center;font:600 12px Inter,Arial">Top gap ${t} mm — the dashed frame must sit below your printed header</div>
      <div style="position:absolute;bottom:${b / 2 - 2}mm;left:0;right:0;text-align:center;font:600 12px Inter,Arial">Bottom gap ${b} mm — the frame must end above your printed footer</div>
      <div style="position:absolute;top:${t + 8}mm;left:${l + 6}mm;right:${r + 6}mm;font:400 13px Georgia,serif;line-height:1.6">The report text prints inside this frame. If the frame overlaps your printed header or footer, go back and press + on the top or bottom gap, then print this page again.</div></div>`;
    const html = printDocumentHtml({ sheets: [sheet], css: paperCss(draft), title: 'Test page' });
    const iframe = document.createElement('iframe');
    iframe.style.cssText = 'position:fixed;left:-99999px;top:0;width:794px;height:1200px;border:0';
    document.body.appendChild(iframe);
    setTimeout(() => { try { document.body.removeChild(iframe); } catch { /* gone */ } }, 60000);
    const d = iframe.contentWindow?.document;
    if (d) { d.open(); d.write(html); d.close(); }
  };

  const save = async () => {
    setErr('');
    if (m === PAPER_MODES.IMAGES && !(working.header && working.footer)) {
      setErr('Upload both a header picture and a footer picture, or choose another way.');
      return;
    }
    setSaving(true);
    try {
      const fd = new FormData();
      const add = (k, v) => { if (v !== undefined && v !== null) fd.append(k, v); };
      add('DoctorId', currentUser?.id || '');
      add('PaperMode', m);
      add('HeaderMargin', Math.max(8, draft.margins.top));
      add('BottomMargin', Math.max(8, draft.margins.bottom));
      add('LeftMargin', Math.max(8, draft.margins.left));
      add('RightMargin', Math.max(8, draft.margins.right));
      add('FontSize', draft.fontSize);
      add('FontFamily', draft.fontFamily);
      add('FontColor', draft.fontColor || '#111827');
      add('OverflowBackgroundMode', draft.overflow);
      add('AccentColor', draft.accent);
      add('ShowRegistration', String(!!draft.showRegistration));
      add('ShowQr', String(!!draft.showQr));
      add('PdfStandardHeader', String(!!draft.pdfStandardHeader));
      if (files.header) fd.append('HeaderImageFile', files.header);
      if (files.footer) fd.append('FooterImageFile', files.footer);
      if (files.logo) fd.append('LogoFile', files.logo);
      if (files.letterhead) fd.append('LetterheadFile', files.letterhead);
      if (!draft.header && loaded.header && !files.header) add('RemoveHeaderImage', 'true');
      if (!draft.footer && loaded.footer && !files.footer) add('RemoveFooterImage', 'true');
      if (!draft.logo && loaded.logo && !files.logo) add('RemoveLogo', 'true');
      if (!draft.letterhead && loaded.letterhead && !files.letterhead) add('RemoveLetterhead', 'true');
      await apiClient.post('/Prescription', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      notifyToast('Saved. New reports will print this way.', 'success');
      applyLoaded(await fetchPaper());
    } catch (e) {
      setErr(e?.response ? (e.response.data?.error || 'Could not save. Please try again.') : 'No internet — the report paper needs a connection to save.');
    } finally {
      setSaving(false);
    }
  };

  const scale = PREVIEW_W / 794;
  const previewNote = {
    [PAPER_MODES.IMAGES]: 'Your header and footer pictures, the report text in between.',
    [PAPER_MODES.STANDARD]: 'Built from Admin ▸ Hospitals — change the address there and every report follows.',
    [PAPER_MODES.LETTERHEAD]: view === 'pdf'
      ? (effectiveMode(working, 'pdf') === PAPER_MODES.STANDARD ? 'PDF copy: our standard header is added, because a PDF has no printed paper.' : 'PDF copy: same as the paper.')
      : 'On paper: the shaded gaps stay empty, so the report lands inside your printed header and footer.',
  }[m];

  return (
    <div style={{ fontFamily: FONT, color: C.ink, display: 'flex', gap: 28, flexWrap: 'wrap', alignItems: 'flex-start', paddingBottom: 90 }}>
      {/* LEFT: choose, then the few settings for that way */}
      <div style={{ flex: '1 1 520px', maxWidth: 680, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div>
          <div style={{ fontSize: 26, fontWeight: 800 }}>How should your reports look on paper?</div>
          <div style={{ fontSize: 16, color: C.muted, marginTop: 2 }}>Pick one. Applies to every report printed from this centre. Old reports print the new way too — their words and signature don&apos;t change.</div>
        </div>

        {MODE_CARDS.map(card => {
          const on = m === card.id;
          return (
            <button key={card.id} type="button" onClick={() => { set({ mode: card.id }); setView('print'); setErr(''); }} aria-pressed={on}
              style={{ display: 'flex', alignItems: 'center', gap: 14, textAlign: 'left', borderRadius: 18, padding: '16px 18px', cursor: 'pointer', fontFamily: 'inherit', border: on ? `2.5px solid ${C.primary}` : `1.5px solid ${C.line}`, background: on ? C.primarySoft : 'white' }}>
              <span style={{ width: 26, height: 26, borderRadius: 13, flexShrink: 0, boxSizing: 'border-box', background: 'white', border: on ? `8px solid ${C.primary}` : '2px solid #9CA3AF' }} />
              <span>
                <span style={{ display: 'block', fontSize: 19, fontWeight: 800, color: C.ink }}>{card.title}</span>
                <span style={{ display: 'block', fontSize: 15, color: C.muted, marginTop: 2 }}>{card.sub}</span>
              </span>
            </button>
          );
        })}

        {m === PAPER_MODES.IMAGES && (
          <div style={box}>
            <div style={h}>Your two pictures</div>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <PictureTile title="Header picture" hint="Best size: 2480 × 420 px, wide and short" url={shown('header')} onPick={pick('header')} onRemove={remove('header')} />
              <PictureTile title="Footer picture" hint="Best size: 2480 × 300 px" url={shown('footer')} onPick={pick('footer')} onRemove={remove('footer')} />
            </div>
            <Tick on={draft.overflow === 'REUSE'} onClick={() => set({ overflow: draft.overflow === 'REUSE' ? 'BLANK' : 'REUSE' })}>
              Show the header picture on every page (off: pages 2 onwards get a slim line with the patient and page number)
            </Tick>
            <div style={note}>✓ Space for the pictures is worked out automatically — the report text never runs under them.</div>
          </div>
        )}

        {m === PAPER_MODES.STANDARD && (
          <div style={box}>
            <div style={h}>Make it yours</div>
            <PictureTile title="Centre logo" hint="Square picture, at least 300 × 300 px" url={shown('logo')} onPick={pick('logo')} onRemove={remove('logo')} />
            <div>
              <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>Colour</div>
              <div style={{ display: 'flex', gap: 10 }}>
                {ACCENTS.map(c => (
                  <button key={c} type="button" aria-label={`Colour ${c}`} onClick={() => set({ accent: c })}
                    style={{ width: 44, height: 44, borderRadius: 12, cursor: 'pointer', background: c, border: draft.accent === c ? '3px solid #111827' : '3px solid white', boxShadow: `0 0 0 1.5px ${C.lineStrong}` }} />
                ))}
              </div>
            </div>
            <Tick on={draft.showRegistration} onClick={() => set({ showRegistration: !draft.showRegistration })}>Show registration &amp; NABH number</Tick>
            <div style={note}>Name, address, phone and registration come from <b>Admin ▸ Hospitals</b>, so there is only one place to correct them.</div>
          </div>
        )}

        {m === PAPER_MODES.LETTERHEAD && (
          <div style={box}>
            <div style={h}>Keep these gaps empty for your printed paper</div>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <Stepper label="Top (under your header)" value={draft.margins.top} min={8} max={120} onChange={(v) => setM({ top: v })} />
              <Stepper label="Bottom (above your footer)" value={draft.margins.bottom} min={8} max={90} onChange={(v) => setM({ bottom: v })} />
            </div>
            <button type="button" onClick={printTestPage} style={{ height: 50, borderRadius: 14, border: `2px solid ${C.primary}`, background: C.primarySoft, color: C.primary, fontSize: 17, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>
              🖨 Print a test page — put your paper in the printer
            </button>
            <div style={{ fontSize: 15, color: C.muted, lineHeight: 1.45 }}>The test page prints a dashed frame where the text will go. If the frame sits inside your header and footer, you are done. If not, press + or − and print it again.</div>
            <div style={{ borderTop: `1px solid ${C.line}`, paddingTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ fontSize: 16, fontWeight: 700 }}>Have your letterhead as a picture or PDF? (optional)</div>
              <PictureTile title="Full-page letterhead" hint="A4 picture or PDF. Shown behind the text on screen, in PDFs and when printing on plain paper." url={shown('letterhead')} isPdf={isPdfLetterhead} accept="image/png,image/jpeg,application/pdf" onPick={pick('letterhead')} onRemove={remove('letterhead')} />
            </div>
            {!working.letterhead && (
              <div style={{ borderTop: `1px solid ${C.line}`, paddingTop: 12 }}>
                <div style={{ fontSize: 16, fontWeight: 700 }}>PDF and WhatsApp copies</div>
                <div style={{ fontSize: 15, color: C.muted, marginTop: 2 }}>A PDF has no paper, so it would look bare. Add our standard header to PDFs only?</div>
                <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
                  <button type="button" style={btn(draft.pdfStandardHeader)} onClick={() => set({ pdfStandardHeader: true })}>Yes, add it</button>
                  <button type="button" style={btn(!draft.pdfStandardHeader)} onClick={() => set({ pdfStandardHeader: false })}>No, plain</button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Same for every way */}
        <div style={box}>
          <div style={h}>Text</div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {TEXT_FONTS.map(f => (
              <button key={f.value} type="button" style={{ ...btn(draft.fontFamily === f.value), fontFamily: `'${f.value}', ${/Serif|Georgia/.test(f.value) ? 'Georgia, serif' : 'Arial, sans-serif'}` }} onClick={() => set({ fontFamily: f.value })}>{f.label}</button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <Stepper label="Text size" value={draft.fontSize} min={9} max={14} step={0.5} unit="pt" onChange={(v) => set({ fontSize: v })} />
            <Stepper label="Side margins" value={draft.margins.left} min={10} max={35} step={1} onChange={(v) => setM({ left: v, right: v })} />
          </div>
          <Tick on={draft.showQr} onClick={() => set({ showQr: !draft.showQr })}>Show a QR code so anyone can verify the report online</Tick>
        </div>
      </div>

      {/* RIGHT: live A4 preview */}
      <div style={{ flex: '0 0 auto', width: PREVIEW_W, display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'sticky', top: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: C.muted, letterSpacing: 1 }}>WHAT THE PATIENT GETS</div>
          {m === PAPER_MODES.LETTERHEAD && (
            <div style={{ display: 'flex', background: 'white', border: `1.5px solid ${C.lineStrong}`, borderRadius: 999, padding: 3 }}>
              {[['print', 'On paper'], ['pdf', 'As PDF']].map(([k, label]) => (
                <button key={k} type="button" onClick={() => setView(k)} style={{ height: 32, padding: '0 14px', borderRadius: 999, border: 'none', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', background: view === k ? C.primary : 'transparent', color: view === k ? 'white' : C.ink }}>{label}</button>
              ))}
            </div>
          )}
        </div>
        <div data-testid="paper-preview" style={{ width: PREVIEW_W, height: 1123 * scale, overflow: 'hidden', borderRadius: 4, boxShadow: '0 8px 30px rgba(15,23,42,0.18)', background: 'white' }}>
          {preview && (
            <div className="rp-doc" style={{ width: 794, transform: `scale(${scale})`, transformOrigin: 'top left' }}>
              <style>{preview.css}</style>
              <div dangerouslySetInnerHTML={{ __html: preview.sheet }} />
            </div>
          )}
        </div>
        <div style={{ fontSize: 14, color: C.faint, marginTop: 10, textAlign: 'center' }}>{previewNote}</div>
      </div>

      {/* Save bar */}
      <div style={{ position: 'sticky', bottom: 0, left: 0, right: 0, width: '100%', background: 'white', borderTop: `1px solid ${C.line}`, padding: '12px 4px', display: 'flex', alignItems: 'center', gap: 14, zIndex: 5 }}>
        <div style={{ flex: 1, fontSize: 15, color: err ? C.danger : C.muted, fontWeight: err ? 700 : 400 }}>
          {err || (dirty ? 'You have changes that are not saved yet.' : 'Saved for the whole centre.')}
        </div>
        <button type="button" onClick={save} disabled={saving || !dirty}
          style={{ height: 52, padding: '0 30px', borderRadius: 16, border: 'none', background: dirty ? C.ok : '#9CA3AF', color: 'white', fontSize: 18, fontWeight: 800, cursor: dirty && !saving ? 'pointer' : 'default', fontFamily: 'inherit' }}>
          {saving ? 'Saving…' : 'Save paper settings'}
        </button>
      </div>
    </div>
  );
}
