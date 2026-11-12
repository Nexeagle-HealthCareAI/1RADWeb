// Report paper — ONE builder for every printed report.
//
// Three ways a centre prints (Admin ▸ Report paper, migration 111):
//   IMAGES     the centre's header picture + footer picture, text in between
//   STANDARD   our design, drawn from the centre's details (name, address,
//              registration) plus a logo and a colour
//   LETTERHEAD the centre's own pre-printed paper: we print only the text and
//              keep the top / bottom gaps empty. A full-page letterhead image
//              (the old behaviour) lives here too.
//
// The preview, Print, Download PDF and the Admin live preview all render the
// HTML this file produces, so what the doctor sees is what prints.
//
// Everything is plain HTML strings + CSS (no React) so the same output can go
// into an iframe print document, html2pdf, or dangerouslySetInnerHTML.

import { BASE_URL } from '../../api/apiClient';

export const PAPER_MODES = { IMAGES: 'IMAGES', STANDARD: 'STANDARD', LETTERHEAD: 'LETTERHEAD' };
export const ACCENTS = ['#0F52BA', '#15803D', '#9F1239', '#334155'];
export const TEXT_FONTS = [
  { value: 'Source Serif 4', label: 'Book (serif)' },
  { value: 'Inter', label: 'Clean (sans)' },
  { value: 'Georgia', label: 'Georgia' },
  { value: 'Arial', label: 'Arial' },
];

const PX_PER_MM = 96 / 25.4;
const A4_W = 210;
const A4_H = 297;
const SAFETY_PX = 14;          // print engines render a hair taller than the measurer
const RUN_H = 13;              // running header (pages 2+) height, mm
const STD_HEAD_H = 34;         // standard design header band, page 1, mm
const STD_FOOT_H = 13;         // standard design footer line, mm
const GAP = 5;                 // space between header/footer art and the text, mm

export const esc = (v) => String(v ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

// Stored asset path → loadable URL (same rules the letterhead always used:
// relative paths hang off the API, Azure blobs go through the API proxy).
export function resolveAssetUrl(url) {
  if (!url) return null;
  if (url.startsWith('data:') || url.startsWith('blob:')) return url;
  const full = url.startsWith('http') ? url : `${BASE_URL}${url}`;
  if (full.includes('blob.core.windows.net')) return `${BASE_URL}/Study/proxy-asset?url=${encodeURIComponent(full)}`;
  return full;
}

// GET /Prescription/* response body → one settings object. Works with the
// old API too: no paperMode field = the old full-page letterhead behaviour.
export function normalizePaper(body) {
  const d = body?.data || null;
  const centre = d?.centre || body?.centre || {};
  const num = (v, dflt) => (v === null || v === undefined || v === '' || Number.isNaN(+v) ? dflt : +v);
  if (!d) {
    return {
      exists: false,
      mode: PAPER_MODES.STANDARD,
      header: null, footer: null, logo: null, letterhead: null,
      accent: ACCENTS[0],
      showRegistration: true, showQr: true, pdfStandardHeader: true,
      overflow: 'REUSE',
      margins: { top: 45, left: 18, right: 18, bottom: 25 },
      fontSize: 11, fontFamily: 'Source Serif 4', fontColor: '#111827',
      centre,
    };
  }
  const mode = Object.values(PAPER_MODES).includes(d.paperMode) ? d.paperMode : PAPER_MODES.LETTERHEAD;
  return {
    exists: true,
    mode,
    header: d.headerImageBlobUrl || null,
    footer: d.footerImageBlobUrl || null,
    logo: d.logoBlobUrl || null,
    letterhead: d.letterheadBlobUrl || null,
    accent: d.accentColor || ACCENTS[0],
    showRegistration: d.showRegistration !== false,
    showQr: d.showQr !== false,
    pdfStandardHeader: d.pdfStandardHeader !== false,
    overflow: d.overflowBackgroundMode === 'BLANK' ? 'BLANK' : 'REUSE',
    margins: {
      top: num(d.headerMargin, 45), left: num(d.leftMargin, 18),
      right: num(d.rightMargin, 18), bottom: num(d.bottomMargin, 25),
    },
    fontSize: num(d.fontSize, 11),
    fontFamily: d.fontFamily || 'Source Serif 4',
    fontColor: d.fontColor || '#111827',
    centre,
  };
}

// Which layout actually applies. A PDF has no pre-printed paper, so in
// LETTERHEAD mode without a letterhead image the PDF borrows the standard
// header (when the centre asked for that).
export function effectiveMode(paper, target = 'print') {
  if (paper.mode === PAPER_MODES.IMAGES && !(paper.header && paper.footer)) return PAPER_MODES.STANDARD;
  if (paper.mode === PAPER_MODES.LETTERHEAD && target === 'pdf' && !paper.letterhead && paper.pdfStandardHeader) {
    return PAPER_MODES.STANDARD;
  }
  return paper.mode;
}

const fontStack = (family) => {
  const f = (family || '').replace(/['"]/g, '');
  const serif = /serif|georgia|times|book/i.test(f) && !/sans/i.test(f);
  return `'${f}', ${serif ? "Georgia, 'Times New Roman', serif" : "'Helvetica Neue', Arial, sans-serif"}`;
};

export const PAPER_FONTS_HREF = 'https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&family=Source+Serif+4:ital,wght@0,400;0,600;0,700;1,400&display=swap';

// CSS for every sheet. Scoped under .rp-doc so it can live in the app page
// (preview, measurer) as well as in the print document.
export function paperCss(paper) {
  const body = fontStack(paper.fontFamily);
  const ui = "'Inter', 'Helvetica Neue', Arial, sans-serif";
  const accent = paper.accent || '#0F52BA';
  return `
  .rp-doc { color: #111417; }
  .rp-doc * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .rp-sheet { width: 210mm; height: 297mm; position: relative; overflow: hidden; background: #fff; }
  .rp-abs { position: absolute; left: 0; right: 0; }
  .rp-bg { position: absolute; inset: 0; width: 210mm; height: 297mm; object-fit: fill; pointer-events: none; }
  .rp-img { display: block; width: 210mm; height: 100%; object-fit: fill; }
  .rp-content { position: absolute; overflow: visible; }

  .rp-band { height: 100%; padding: 9mm 0 0; display: flex; align-items: center; gap: 4.5mm; border-bottom: 0.7mm solid ${accent}; }
  .rp-logo { width: 14mm; height: 14mm; border-radius: 3mm; object-fit: contain; flex-shrink: 0; }
  .rp-logo-ph { width: 14mm; height: 14mm; border-radius: 3mm; background: ${accent}; color: #fff; display: flex; align-items: center; justify-content: center; font: 800 20px ${ui}; flex-shrink: 0; }
  .rp-cname { font: 800 21px/1.15 ${ui}; color: #0F2A5A; }
  .rp-cline { font: 400 10.5px/1.45 ${ui}; color: #4B5563; margin-top: 1mm; }
  .rp-ctag { margin-left: auto; text-align: right; font: 700 9px/1.5 ${ui}; letter-spacing: 1.4px; color: #6B7280; white-space: nowrap; }

  .rp-run { height: 100%; display: flex; align-items: flex-end; gap: 4mm; padding-bottom: 2mm; border-bottom: 0.4mm solid ${accent}; font: 400 10px ${ui}; color: #4B5563; }
  .rp-run b { font-weight: 800; color: #0F2A5A; font-size: 11px; white-space: nowrap; }
  .rp-run .rp-mid { flex: 1; text-align: center; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .rp-run .rp-pg { white-space: nowrap; }
  .rp-run-inline { height: ${RUN_H - 4}mm; margin-bottom: 4mm; }

  .rp-foot { height: 100%; display: flex; align-items: flex-start; gap: 4mm; padding-top: 2.2mm; border-top: 0.3mm solid #C9CFD8; font: 400 9px ${ui}; color: #6B7280; }
  .rp-foot .rp-mid { flex: 1; text-align: center; }
  .rp-pgnum { position: absolute; font: 400 9px ${ui}; color: #6B7280; text-align: right; }

  .rp-grid { border: 0.3mm solid #C9CFD8; border-radius: 1mm; font-family: ${ui}; margin-bottom: 4.5mm; }
  .rp-row { display: grid; grid-template-columns: 2.1fr 1fr 1fr 1.6fr; }
  .rp-row + .rp-row { border-top: 0.3mm solid #E2E6EC; }
  .rp-cell { padding: 1.8mm 3mm; min-width: 0; }
  .rp-cell + .rp-cell { border-left: 0.3mm solid #E2E6EC; }
  .rp-k { font-size: 8px; font-weight: 700; letter-spacing: 1px; color: #6B7280; text-transform: uppercase; }
  .rp-v { font-size: 12px; color: #111417; margin-top: 0.4mm; overflow-wrap: anywhere; }
  .rp-v.rp-strong { font-size: 13px; font-weight: 700; }

  .rp-title { text-align: center; font: 800 13px ${ui}; letter-spacing: 2.2px; color: #0F2A5A; text-transform: uppercase; margin: 1mm 0 5mm; }
  .rp-title::after { content: ''; display: block; width: 30mm; height: 0.5mm; background: ${accent}; margin: 1.8mm auto 0; }

  .rp-doc .report-content { font-family: ${body}; font-size: ${paper.fontSize}pt; line-height: 1.55; color: ${paper.fontColor || '#111827'}; overflow-wrap: break-word; }
  .rp-doc .report-content p { margin: 0 0 2.2mm; }
  .rp-doc .report-content h1, .rp-doc .report-content h2, .rp-doc .report-content h3, .rp-doc .report-content h4 { font-family: ${ui}; color: #0F2A5A; line-height: 1.3; }
  .rp-doc .report-content h1 { font-size: 13px; font-weight: 800; letter-spacing: 1.6px; text-transform: uppercase; margin: 4mm 0 2mm; }
  .rp-doc .report-content h2 { font-size: 12px; font-weight: 800; letter-spacing: 1.2px; text-transform: uppercase; margin: 3.5mm 0 1.5mm; }
  .rp-doc .report-content h3 { font-size: 12px; font-weight: 700; margin: 3mm 0 1.2mm; }
  .rp-doc .report-content h4 { font-size: 11px; font-weight: 700; margin: 2.5mm 0 1mm; }
  .rp-doc .report-content ul, .rp-doc .report-content ol { padding-left: 6mm; margin: 1mm 0 2.5mm; }
  .rp-doc .report-content li { margin: 0.6mm 0; }
  .rp-doc .report-content li p { margin: 0; }
  .rp-doc .report-content table { border-collapse: collapse; width: 100%; margin: 3mm 0; font-family: ${ui}; font-size: 10.5px; }
  .rp-doc .report-content th { text-align: left; font-weight: 700; color: #0F2A5A; background: #F3F5F9; border-bottom: 0.4mm solid #9CA3AF; padding: 1.6mm 2.4mm; }
  .rp-doc .report-content td { border-bottom: 0.25mm solid #E2E6EC; padding: 1.4mm 2.4mm; vertical-align: top; }
  .rp-doc .report-content img { max-width: 100%; height: auto; display: block; margin: 3mm 0; }
  .rp-doc .report-content hr { border: none; border-top: 0.3mm solid #C9CFD8; margin: 4mm 0; }
  .rp-doc .report-content blockquote { border-left: 0.8mm solid ${accent}; padding-left: 4mm; margin: 3mm 0; color: #374151; }
  .rp-doc .report-content .word-page, .rp-doc .report-content .word-page-inner { margin: 0 !important; padding: 0 !important; width: auto !important; height: auto !important; box-shadow: none !important; border: none !important; background: transparent !important; }
  .rp-doc .report-content [style*="line-height: 0."] { line-height: 1 !important; }

  .rp-imp { margin-top: 5mm; border: 0.5mm solid #0F2A5A; border-radius: 1.5mm; overflow: hidden; break-inside: avoid; }
  .rp-imp-h { background: #0F2A5A; color: #fff; font: 800 10px ${ui}; letter-spacing: 2px; padding: 1.6mm 3.5mm; }
  .rp-imp-b { padding: 2.8mm 3.5mm; font-family: ${body}; font-size: ${paper.fontSize + 0.5}pt; font-weight: 600; line-height: 1.5; }
  .rp-imp-b p { margin: 0 0 1.2mm; }
  .rp-imp-b p:last-child { margin: 0; }
  .rp-adv { margin-top: 3mm; font-family: ${body}; font-size: ${Math.max(8, paper.fontSize - 1)}pt; font-style: italic; color: #374151; }
  .rp-adv b { font: 700 9.5px ${ui}; font-style: normal; letter-spacing: 1.4px; color: #6B7280; margin-right: 2mm; }

  .rp-sign { margin-top: 7mm; display: flex; align-items: flex-end; gap: 5mm; break-inside: avoid; font-family: ${ui}; }
  .rp-qr { display: flex; gap: 2.5mm; align-items: center; }
  .rp-qr img { width: 19mm; height: 19mm; border: 0.3mm solid #C9CFD8; border-radius: 1mm; display: block; }
  .rp-qr span { font-size: 8.5px; color: #6B7280; line-height: 1.45; max-width: 26mm; }
  .rp-end { flex: 1; text-align: center; align-self: center; font-size: 9px; letter-spacing: 2px; color: #9CA3AF; white-space: nowrap; }
  .rp-who { text-align: right; }
  .rp-who .rp-line { width: 62mm; height: 0.3mm; background: #9CA3AF; margin: 0 0 1.5mm auto; }
  .rp-who .rp-name { font-size: 13px; font-weight: 800; }
  .rp-who .rp-cred { font-size: 10.5px; color: #4B5563; margin-top: 0.3mm; }
  .rp-who .rp-when { font-size: 10px; color: #4B5563; margin-top: 0.8mm; }
  .rp-chip { display: inline-block; font-size: 8.5px; font-weight: 800; letter-spacing: 1px; padding: 0.4mm 2.2mm; border-radius: 99px; margin-left: 1.5mm; vertical-align: 1px; }
  .rp-chip.final { background: #DCFCE7; color: #166534; }
  .rp-chip.prelim { background: #FEF3C7; color: #92400E; }
  .rp-chip.draft { background: #F3F4F6; color: #4B5563; }

  .rp-guide { position: absolute; left: 0; right: 0; display: flex; align-items: center; justify-content: center; font: 400 11px ${ui}; color: #4F46E5; background: repeating-linear-gradient(135deg, #EEF2FF, #EEF2FF 10px, #E0E7FF 10px, #E0E7FF 20px); }
  `;
}

// ── Date helpers (IST — the platform's clinical clock) ────────────────────
const IST = 'Asia/Kolkata';
export const fmtDate = (d) => {
  if (!d) return '';
  const x = new Date(d);
  if (Number.isNaN(x.getTime())) return '';
  return x.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: IST });
};
export const fmtDateTime = (d) => {
  if (!d) return '';
  const x = new Date(d);
  if (Number.isNaN(x.getTime())) return '';
  return `${fmtDate(x)}, ${x.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: IST })} IST`;
};

// Appointment / report → the few facts the paper prints.
export function reportFacts({ appointment = {}, serviceId = null, report = {}, signature = null }) {
  const a = appointment || {};
  const svc = serviceId ? (a.services || []).find(s => s.id === serviceId) : null;
  const refExtra = [a.referrerDegree, a.referrerSpecialty].filter(Boolean).join(', ');
  const sig = signature || {};
  const r = report || {};
  const signerName = sig.name || r.signerName || r.SignerName || '';
  const status = sig.status || r.status || r.reportStatus || (r.isFinalized ? 'Final' : 'Draft');
  return {
    patientName: a.patientName || '',
    patientId: a.patientIdentifier || a.ptid || '',
    age: a.patientAge || a.age || '',
    sex: a.patientGender || a.gender || '',
    referredBy: (a.referredBy || 'Self') + (refExtra && a.referredBy ? `, ${refExtra}` : ''),
    study: svc?.serviceName || a.service || a.modality || '',
    scanDate: a.dateTime || a.appointmentDate || a.scheduledAt || a.date || a.createdAt || null,
    reportDate: r.signedAt || r.finalizedAt || r.updatedAt || null,
    accession: svc?.accessionNumber || a.accessionNumber || '',
    signerName,
    signerCredentials: sig.credentials || r.signerCredentials || r.SignerCredentials || '',
    signedAt: sig.signedAt || r.signedAt || r.SignedAt || null,
    status: /final|addend/i.test(status) ? 'FINAL' : /prelim/i.test(status) ? 'PRELIMINARY' : 'DRAFT',
    authorName: signerName || a.doctor || '',
  };
}

// ── Geometry per page ─────────────────────────────────────────────────────
// assets: { header:{url,ratio}, footer:{url,ratio}, logo:url, letterhead:url }
export function geometry(paper, mode, assets = {}) {
  const left = Math.max(10, paper.margins.left);
  const right = Math.max(10, paper.margins.right);
  if (mode === PAPER_MODES.IMAGES) {
    const hH = Math.min(85, A4_W * (assets.header?.ratio || 0.17));
    const fH = Math.min(55, A4_W * (assets.footer?.ratio || 0.12));
    const repeat = paper.overflow !== 'BLANK';
    return {
      left, right,
      top: (i) => (i === 0 || repeat ? hH : RUN_H) + GAP,
      bottom: () => fH + GAP + 3,
      inlineRun: () => false,
      headH: (i) => (i === 0 || repeat ? hH : RUN_H),
      footH: () => fH,
      repeatHeader: repeat,
    };
  }
  if (mode === PAPER_MODES.STANDARD) {
    return {
      left, right,
      top: (i) => (i === 0 ? STD_HEAD_H : RUN_H + 5) + GAP,
      bottom: () => STD_FOOT_H + 4,
      inlineRun: () => false,
      headH: (i) => (i === 0 ? STD_HEAD_H : RUN_H + 5),
      footH: () => STD_FOOT_H,
    };
  }
  // LETTERHEAD: the user's paper owns the top and bottom.
  return {
    left, right,
    top: () => Math.max(8, paper.margins.top),
    bottom: () => Math.max(8, paper.margins.bottom),
    inlineRun: (i) => i > 0,
    headH: () => 0,
    footH: () => 0,
  };
}

export function capacityPx(geo, i) {
  const mm = A4_H - geo.top(i) - geo.bottom(i) - (geo.inlineRun(i) ? RUN_H : 0);
  return Math.max(140, mm * PX_PER_MM - SAFETY_PX);
}

// ── Content blocks ────────────────────────────────────────────────────────
export function patientGridHtml(f) {
  const cell = (k, v, strong) => `<div class="rp-cell"><div class="rp-k">${esc(k)}</div><div class="rp-v${strong ? ' rp-strong' : ''}">${esc(v || '—')}</div></div>`;
  const ageSex = [f.age && (/\d$/.test(String(f.age)) ? `${f.age} Y` : f.age), f.sex].filter(Boolean).join(' / ');
  const row2 = [
    cell('Study', f.study),
    cell('Scan date', fmtDate(f.scanDate)),
    cell('Report date', fmtDate(f.reportDate || new Date())),
    f.accession ? cell('Accession', f.accession) : cell('Status', f.status === 'FINAL' ? 'Final' : f.status === 'PRELIMINARY' ? 'Preliminary' : 'Draft'),
  ].join('');
  return `<div class="rp-grid"><div class="rp-row">${cell('Patient', f.patientName, true)}${cell('Age / Sex', ageSex)}${cell('Patient ID', f.patientId)}${cell('Referred by', f.referredBy)}</div><div class="rp-row">${row2}</div></div>`;
}

export const studyTitleHtml = (f) => (f.study ? `<div class="rp-title">${esc(f.study)}</div>` : '');

const textToParas = (t) => esc(t).split(/\n+/).map(s => s.trim()).filter(Boolean).map(s => `<p>${s}</p>`).join('');

export function impressionHtml(impression) {
  if (!impression || !String(impression).trim()) return '';
  return `<div class="rp-imp"><div class="rp-imp-h">IMPRESSION</div><div class="rp-imp-b">${textToParas(impression)}</div></div>`;
}
export function adviceHtml(advice) {
  if (!advice || !String(advice).trim()) return '';
  return `<div class="rp-adv"><b>ADVICE</b>${esc(advice)}</div>`;
}

export function signoffHtml(f, { qr, showQr }) {
  const chip = f.status === 'FINAL' ? '<span class="rp-chip final">FINAL</span>'
    : f.status === 'PRELIMINARY' ? '<span class="rp-chip prelim">PRELIMINARY</span>'
      : '<span class="rp-chip draft">DRAFT — NOT SIGNED</span>';
  const signed = f.status !== 'DRAFT' && f.signedAt;
  const when = signed ? `Electronically signed · ${esc(fmtDateTime(f.signedAt))}${chip}` : chip;
  const qrHtml = showQr && qr
    ? `<div class="rp-qr"><img src="${qr}" alt="QR"><span>Scan to verify this report and view it online</span></div>`
    : '';
  return `<div class="rp-sign">${qrHtml}<div class="rp-end">·· END OF REPORT ··</div><div class="rp-who"><div class="rp-line"></div><div class="rp-name">${esc(f.authorName || 'Reporting radiologist')}</div>${f.signerCredentials ? `<div class="rp-cred">${esc(f.signerCredentials)}</div>` : ''}<div class="rp-when">${when}</div></div></div>`;
}

// ── Header / footer art ───────────────────────────────────────────────────
function centreLines(paper) {
  const c = paper.centre || {};
  const contact = [c.address, c.phone, c.email].filter(Boolean).join(' · ');
  const reg = paper.showRegistration
    ? [c.registrationNumber && `Reg. ${c.registrationNumber}`, c.nabhNumber && `NABH ${c.nabhNumber}`].filter(Boolean).join(' · ')
    : '';
  return { contact, reg };
}

function standardHeaderHtml(paper, geo, assets) {
  const c = paper.centre || {};
  const { contact, reg } = centreLines(paper);
  const logo = assets.logo
    ? `<img class="rp-logo" src="${esc(assets.logo)}" alt="">`
    : `<div class="rp-logo-ph">${esc((c.name || 'R').trim().charAt(0).toUpperCase())}</div>`;
  return `<div class="rp-band" style="margin:0 ${geo.right}mm 0 ${geo.left}mm">${logo}<div style="min-width:0"><div class="rp-cname">${esc(c.name || 'Diagnostic Centre')}</div>${contact ? `<div class="rp-cline">${esc(contact)}</div>` : ''}${reg ? `<div class="rp-cline">${esc(reg)}</div>` : ''}</div><div class="rp-ctag">RADIOLOGY<br>REPORT</div></div>`;
}

function runningHeaderHtml(paper, f, i, total, geo, inline) {
  const c = paper.centre || {};
  const mid = [f.patientName, f.patientId, f.study, fmtDate(f.reportDate || new Date())].filter(Boolean).map(esc).join(' · ');
  const style = inline ? '' : ` style="margin:0 ${geo.right}mm 0 ${geo.left}mm"`;
  return `<div class="rp-run${inline ? ' rp-run-inline' : ''}"${style}><b>${esc(c.name || '')}</b><span class="rp-mid">${mid}</span><span class="rp-pg">Page ${i + 1} of ${total}</span></div>`;
}

function standardFooterHtml(f, i, total, geo) {
  return `<div class="rp-foot" style="margin:0 ${geo.right}mm 0 ${geo.left}mm"><span>${esc([f.patientName, f.patientId].filter(Boolean).join(' · '))}</span><span class="rp-mid">Page ${i + 1} of ${total}</span><span>Digitally generated report</span></div>`;
}

// One A4 sheet. `bodyHtml` is that page's share of the flowing content.
export function sheetHtml({ paper, mode, geo, assets, facts, i, total, bodyHtml, guides = false }) {
  const parts = [];
  if (mode === PAPER_MODES.LETTERHEAD && assets.letterhead && (i === 0 || paper.overflow === 'REUSE')) {
    parts.push(`<img class="rp-bg" src="${esc(assets.letterhead)}" alt="">`);
  }
  const hH = geo.headH(i);
  const fH = geo.footH(i);
  if (mode === PAPER_MODES.IMAGES) {
    const big = i === 0 || geo.repeatHeader;
    parts.push(big
      ? `<div class="rp-abs" style="top:0;height:${hH}mm"><img class="rp-img" src="${esc(assets.header?.url || '')}" alt=""></div>`
      : `<div class="rp-abs" style="top:0;height:${hH}mm">${runningHeaderHtml(paper, facts, i, total, geo, false)}</div>`);
    parts.push(`<div class="rp-abs" style="bottom:0;height:${fH}mm"><img class="rp-img" src="${esc(assets.footer?.url || '')}" alt=""></div>`);
    if (total > 1) parts.push(`<div class="rp-pgnum" style="right:${geo.right}mm;bottom:${fH + 1.5}mm">Page ${i + 1} of ${total}</div>`);
  } else if (mode === PAPER_MODES.STANDARD) {
    parts.push(`<div class="rp-abs" style="top:0;height:${hH}mm">${i === 0 ? standardHeaderHtml(paper, geo, assets) : runningHeaderHtml(paper, facts, i, total, geo, false)}</div>`);
    parts.push(`<div class="rp-abs" style="bottom:0;height:${fH}mm">${standardFooterHtml(facts, i, total, geo)}</div>`);
  } else if (guides) {
    // Admin preview only: show the gaps kept empty for the printed paper.
    parts.push(`<div class="rp-guide" style="top:0;height:${geo.top(i)}mm">your printed header sits here · ${paper.margins.top} mm kept empty</div>`);
    parts.push(`<div class="rp-guide" style="bottom:0;height:${geo.bottom(i)}mm">your printed footer sits here · ${paper.margins.bottom} mm kept empty</div>`);
  }
  const run = geo.inlineRun(i) ? runningHeaderHtml(paper, facts, i, total, geo, true) : '';
  parts.push(`<div class="rp-content" style="top:${geo.top(i)}mm;bottom:${geo.bottom(i)}mm;left:${geo.left}mm;right:${geo.right}mm">${run}<div class="report-content">${bodyHtml}</div></div>`);
  return `<div class="rp-sheet${i === total - 1 ? ' rp-sheet-last' : ''}">${parts.join('')}</div>`;
}

// ── Pagination ────────────────────────────────────────────────────────────
// chunks: string[] — editor page chunks (manual / editor page breaks are kept
// as forced breaks). Each chunk's top-level elements are blocks.
// Returns string[] of per-page body HTML.
export function paginate(chunks, { paper, geo }) {
  const widthMm = Math.max(60, A4_W - geo.left - geo.right);
  const host = document.createElement('div');
  host.className = 'rp-doc';
  host.style.cssText = 'position:fixed;left:-99999px;top:0;visibility:hidden;pointer-events:none;';
  const style = document.createElement('style');
  style.textContent = paperCss(paper);
  host.appendChild(style);
  const m = document.createElement('div');
  m.className = 'report-content';
  m.style.cssText = `width:${widthMm}mm;display:flow-root;`;
  host.appendChild(m);
  document.body.appendChild(host);

  const pages = [];
  let cur = [];
  let curH = 0;
  const cap = () => capacityPx(geo, pages.length);
  try {
    chunks.forEach((chunk, ci) => {
      if (ci > 0 && cur.length) { pages.push(cur.join('')); cur = []; curH = 0; }
      m.innerHTML = chunk || '';
      const els = Array.from(m.children);
      const heights = els.map((el, k) => {
        const next = k + 1 < els.length ? els[k + 1].offsetTop : m.scrollHeight;
        return Math.max(0, next - el.offsetTop);
      });
      els.forEach((el, k) => {
        const h = heights[k];
        if (cur.length && curH + h > cap()) { pages.push(cur.join('')); cur = []; curH = 0; }
        cur.push(el.outerHTML);
        curH += h;
      });
    });
  } finally {
    document.body.removeChild(host);
  }
  if (cur.length || !pages.length) pages.push(cur.join(''));
  return pages;
}

// ── Assets ────────────────────────────────────────────────────────────────
function loadImage(url) {
  return new Promise((resolve) => {
    if (!url) { resolve(null); return; }
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      let src = url;
      try {
        const c = document.createElement('canvas');
        c.width = img.naturalWidth; c.height = img.naturalHeight;
        c.getContext('2d').drawImage(img, 0, 0);
        src = c.toDataURL('image/png');       // inline → print never re-fetches
      } catch { /* proxy without CORS: keep the URL */ }
      resolve({ url: src, ratio: img.naturalWidth ? img.naturalHeight / img.naturalWidth : null });
    };
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

// letterheadLoader(url) lets the caller render a PDF letterhead (pdfjs).
export async function loadPaperAssets(paper, { letterheadLoader } = {}) {
  const [header, footer, logo] = await Promise.all([
    loadImage(resolveAssetUrl(paper.header)),
    loadImage(resolveAssetUrl(paper.footer)),
    loadImage(resolveAssetUrl(paper.logo)),
  ]);
  let letterhead = null;
  const lh = resolveAssetUrl(paper.letterhead);
  if (lh) {
    const isPdf = /\.pdf(\?|$)|type=pdf/i.test(lh);
    if (isPdf && letterheadLoader) letterhead = await letterheadLoader(lh);
    else {
      // Not a picture? (a freshly picked PDF has a blob: URL with no .pdf) — try PDF.
      letterhead = (await loadImage(lh))?.url || (letterheadLoader ? await letterheadLoader(lh) : null) || null;
    }
  }
  return { header, footer, logo: logo?.url || null, letterhead };
}

export async function ensurePaperFonts() {
  if (typeof document === 'undefined') return;
  if (!document.querySelector('link[data-rp-fonts]')) {
    const l = document.createElement('link');
    l.rel = 'stylesheet'; l.href = PAPER_FONTS_HREF; l.setAttribute('data-rp-fonts', '1');
    document.head.appendChild(l);
  }
  try {
    await Promise.race([
      Promise.all(['400 12px "Source Serif 4"', '600 12px "Source Serif 4"', '400 12px Inter', '800 12px Inter'].map(f => document.fonts.load(f))),
      new Promise(r => setTimeout(r, 2500)),   // offline: fall back to system fonts
    ]);
  } catch { /* fonts API unavailable */ }
}

// ── The whole document ────────────────────────────────────────────────────
// Returns { sheets: string[], css } — sheets are complete A4 pages.
export function buildReportSheets({ paper, target = 'print', assets = {}, facts, chunks = [], impression, advice, qr, guides = false }) {
  const mode = effectiveMode(paper, target);
  const geo = geometry(paper, mode, assets);
  const lead = patientGridHtml(facts) + studyTitleHtml(facts);
  const tail = impressionHtml(impression) + adviceHtml(advice) + signoffHtml(facts, { qr, showQr: paper.showQr });
  const flow = chunks.length ? chunks.slice() : [''];
  flow[0] = lead + (flow[0] || '');
  flow[flow.length - 1] = (flow[flow.length - 1] || '') + tail;
  const bodies = paginate(flow, { paper, geo });
  const sheets = bodies.map((bodyHtml, i) => sheetHtml({ paper, mode, geo, assets, facts, i, total: bodies.length, bodyHtml, guides }));
  return { sheets, css: paperCss(paper), mode };
}

// A complete, self-printing HTML document (hidden-iframe print).
export function printDocumentHtml({ sheets, css, autoPrint = true, title = 'Radiology report' }) {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>${esc(title)}</title>
<link rel="stylesheet" href="${PAPER_FONTS_HREF}">
<style>
@page { size: A4; margin: 0; }
html, body { margin: 0; padding: 0; background: #fff; }
.rp-sheet { page-break-after: always; break-after: page; height: 296.6mm !important; }
.rp-sheet-last { page-break-after: auto; break-after: auto; }
${css}
</style>
${autoPrint ? `<script>
window.addEventListener('load', function () {
  var go = function () { setTimeout(function () { window.print(); }, 120); };
  var imgs = Array.prototype.slice.call(document.images);
  var wait = imgs.filter(function (i) { return !i.complete; });
  var fonts = (document.fonts && document.fonts.ready) ? document.fonts.ready : Promise.resolve();
  var timer = new Promise(function (r) { setTimeout(r, 3000); });
  Promise.race([Promise.all([fonts].concat(wait.map(function (i) { return new Promise(function (r) { i.onload = i.onerror = r; }); }))), timer]).then(go);
});
</script>` : ''}
</head><body><div class="rp-doc">${sheets.join('')}</div></body></html>`;
}
