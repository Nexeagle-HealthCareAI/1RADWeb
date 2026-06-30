// ════════════════════════════════════════════════════════════════
// src/utils/exportWord.js
//
// Launches Microsoft Word with this patient's report, preserving the
// EXACT formatting the doctor authored in the editor.
//
// How: we reuse the editor's proven HTML→.docx converter (buildDocxBlob in
// NarrativeEditor/utils/exportDocx.js). It walks the editor's own getHTML()
// output and emits real OOXML — keeping headings, bold/italic/underline,
// lists, tables, alignment, colours, fonts and sizes intact. We prepend a
// patient header + append the impression/advice, then hand the .docx bytes
// to the desktop bridge, which writes a temp file and opens it in Word.
//   • Desktop (Electron): Word launches with the document.
//   • Browser/PWA: the .docx downloads (opens in Word on double-click).
// ════════════════════════════════════════════════════════════════

import QRCode from 'qrcode';
import { buildDocxBlob } from '../components/NarrativeEditor/utils/exportDocx';
import { nativeWord } from '../hooks/useElectron';
import { BASE_URL } from '../api/apiClient';
import { getTrackingUrl } from './trackingUrl';
import { formatPatientAge } from './patientAge';

// Resolve the letterhead asset URL, proxying Azure blobs through the API (same
// origin) so the fetch/canvas isn't blocked by CORS — mirrors ReportPreviewModal.
function resolveLetterheadUrl(protocol) {
  const raw = protocol?.letterheadBlobUrl;
  if (!raw) return null;
  const url = raw.startsWith('http') ? raw : `${BASE_URL}${raw}`;
  if (url.includes('blob.core.windows.net')) {
    return `${BASE_URL}/Study/proxy-asset?url=${encodeURIComponent(url)}`;
  }
  return url;
}

// Render page 1 of a PDF letterhead to PNG bytes via pdfjs (dynamic import so it
// stays out of the main bundle). Best-effort: returns null on any failure.
async function renderPdfFirstPageToPng(url) {
  try {
    const pdfjs = await import('pdfjs-dist');
    if (!pdfjs.GlobalWorkerOptions.workerSrc) {
      // Locally-bundled worker only — never load executable worker JS from a CDN.
      pdfjs.GlobalWorkerOptions.workerSrc = `${import.meta.env.BASE_URL}pdf.worker.min.mjs`;
    }
    const doc = await pdfjs.getDocument({ url }).promise;
    const page = await doc.getPage(1);
    const viewport = page.getViewport({ scale: 2 });
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
    const blob = await new Promise((res) => canvas.toBlob(res, 'image/png'));
    return blob ? new Uint8Array(await blob.arrayBuffer()) : null;
  } catch (e) {
    console.warn('[Word] PDF letterhead render failed:', e?.message);
    return null;
  }
}

// Fetch the letterhead as { bytes, ext } for embedding, or null if none/failed.
async function fetchLetterhead(protocol) {
  const url = resolveLetterheadUrl(protocol);
  if (!url) return null;
  const raw = protocol?.letterheadBlobUrl || '';
  const isPdf = /\.pdf(\?|$)/i.test(raw) || /\.pdf/i.test(url) || /type=pdf/i.test(url);
  try {
    if (isPdf) {
      const bytes = await renderPdfFirstPageToPng(url);
      return bytes ? { bytes, ext: 'png' } : null;
    }
    const res = await fetch(url);
    if (!res.ok) return null;
    const bytes = new Uint8Array(await res.arrayBuffer());
    const ct = (res.headers.get('content-type') || '').toLowerCase();
    const ext = (ct.includes('jpeg') || ct.includes('jpg')) ? 'jpeg' : 'png';
    return { bytes, ext };
  } catch (e) {
    console.warn('[Word] letterhead fetch failed:', e?.message);
    return null;
  }
}

const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;');

// Invisible sentinels that fence off the FINDINGS region inside the Word doc.
// The auto-sync importer reads only what's between them, so the patient header
// (above) and impression/advice (below) never leak into the findings, and real
// "FINDINGS:" / "IMPRESSION:" section text in the body can't be mistaken for a
// boundary. Rendered as 1pt white text → effectively invisible in Word.
export const FINDINGS_START_TOKEN = '[[1RAD-FINDINGS-START]]';
export const FINDINGS_END_TOKEN   = '[[1RAD-FINDINGS-END]]';
const marker = (token) => `<p><span style="font-size:1pt; color:#FFFFFF">${token}</span></p>`;

// Generate the patient-tracking QR as a PNG data URL (high-res so it stays crisp
// when Word scales it down in the banner). Best-effort — '' on any failure.
async function buildQrDataUrl(appointmentId) {
  if (!appointmentId) return '';
  let url;
  try { url = await getTrackingUrl(appointmentId); }
  catch { url = `${(typeof window !== 'undefined' ? window.location.origin : '')}/track/${appointmentId}`; }
  try {
    return await QRCode.toDataURL(url, {
      errorCorrectionLevel: 'M', type: 'image/png', width: 240, margin: 1,
      color: { dark: '#000000', light: '#ffffff' },
    });
  } catch (e) {
    console.warn('[Word] QR generation failed:', e?.message);
    return '';
  }
}

// Build the patient banner — the polished, organised block from the on-screen
// preview (QR + name + a clean detail strip + the "thank you for referring"
// line). Authored as HTML the docx converter captures faithfully: a bordered
// <table> for the card, <span style="font-size/color"> for type, <b>/<i> for
// emphasis, and an <img> (data URI) for the QR. Lives at the TOP OF THE BODY on
// page 1 (not the repeating header) so it matches the preview and is bound by
// the configured page margins.
function buildPatientBannerHtml({ appointment, protocol, study, qrDataUrl, hasLetterhead = false, margins }) {
  const name   = (appointment?.patientName || '').toUpperCase() || '—';
  const ptid   = appointment?.patientIdentifier || appointment?.ptid || appointment?.id || '—';
  // Age with its saved unit (Y / M / D) — e.g. "56Y", "6M", "15D".
  const age    = formatPatientAge(appointment?.patientAge ?? appointment?.age, '—');
  const sex    = appointment?.patientGender || appointment?.gender || '—';
  const refDegSpec = [appointment?.referrerDegree, appointment?.referrerSpecialty].filter(Boolean).join(', ');
  const refBy  = (appointment?.referredBy || 'Self') + (refDegSpec && appointment?.referredBy ? ` (${refDegSpec})` : '');
  // Reported date as "5 June, 2026" (day-first, month name, comma before year).
  const _d = new Date();
  const repDate = `${_d.getDate()} ${_d.toLocaleString('en-US', { month: 'long' })}, ${_d.getFullYear()}`;
  const clinic = protocol?.clinicName || protocol?.practiceName || protocol?.hospitalName || '';

  // Grey label + bold value, with a middot separator between fields. The detail
  // strip is split into TWO short lines so it never wraps awkwardly mid-field
  // (e.g. "Patient ID: PTID000…" breaking onto the next line).
  const lbl = (t) => `<span style="color:#94A3B8"><b>${esc(t)}</b></span>`;
  const sep = `<span style="color:#CBD5E1">&#160;&#160;·&#160;&#160;</span>`;
  const metaLine1 =
    `${lbl('Patient ID:')} <b>${esc(ptid)}</b>${sep}` +
    `${lbl('Age / Sex:')} <b>${esc(age)} / ${esc(sex)}</b>${sep}` +
    `${lbl('Study:')} <span style="color:#0F52BA"><b>${esc(study)}</b></span>`;
  const metaLine2 =
    `${lbl('Prescribed By:')} <b>${esc(refBy)}</b>${sep}` +
    `${lbl('Reported:')} <b>${esc(repDate)}</b>`;

  // Card spans the text width (A4 210mm − left − right margins) → px @96dpi, with
  // a small safety inset so it can NEVER exceed the text area (which is what
  // clips text / "half-cuts fonts" at the right edge in Word).
  const QR_W = 92;
  const textWidthPx = Math.max(
    360,
    Math.round((210 - (Number(margins?.left) || 20) - (Number(margins?.right) || 20)) * 96 / 25.4),
  );
  const tableW = textWidthPx - 8;
  const detailsW = qrDataUrl ? Math.max(260, tableW - QR_W) : tableW;

  const detailsCell =
    `<td colwidth="${detailsW}"><p><span style="font-size:15pt; color:#0A1628"><b>${esc(name)}</b></span></p>` +
    `<p><span style="font-size:9.5pt; color:#475569">${metaLine1}</span></p>` +
    `<p><span style="font-size:9.5pt; color:#475569">${metaLine2}</span></p></td>`;

  // QR ("scanner") sits on the LEFT, details on the right.
  const qrCell = qrDataUrl
    ? `<td colwidth="${QR_W}"><p style="text-align:center"><img src="${qrDataUrl}" width="80" height="80"/></p></td>`
    : '';

  return `
    ${(!hasLetterhead && clinic) ? `<p style="text-align:center"><span style="font-size:15pt; color:#0A1628"><b>${esc(clinic)}</b></span></p>` : ''}
    <table>
      <tr>${qrCell}${detailsCell}</tr>
    </table>
    <p style="text-align:center"><span style="font-size:10.5pt; color:#475569"><i>Thank you for referring the patient for </i></span><span style="font-size:10.5pt; color:#0F52BA"><b>${esc(study)}</b></span><span style="font-size:10.5pt; color:#475569"><i>.</i></span></p>
    <p></p>`;
}

function buildImpressionHtml(impression, advice) {
  let out = '';
  if (impression) {
    out += `<p></p><p><span style="font-size:10pt; color:#0F52BA"><b>IMPRESSION</b></span></p>`;
    out += `<p><span style="font-size:12pt"><b>${esc(impression)}</b></span></p>`;
  }
  if (advice) {
    out += `<p></p><p><span style="font-size:10pt; color:#64748B"><b>ADVICE</b></span></p>`;
    out += `<p><span style="color:#475569"><i>${esc(advice)}</i></span></p>`;
  }
  return out;
}

/**
 * Build the BODY html: the editor's findings (verbatim) fenced by the FINDINGS
 * markers, plus the impression/advice. The patient header is NOT here — it goes
 * into the Word page header (w:hdr) so it repeats on every page.
 *
 * The editor may wrap its content in .word-page / .word-page-inner page
 * containers (PageDocument pagination). The docx converter only reads the
 * children of .word-page-inner, so the START fence is injected into the FIRST
 * page-inner and the END fence + impression into the LAST. When there are no
 * wrappers (flat pagination) we concatenate.
 */
export function buildReportHtml({ findingsHtml, impression, advice, bannerHtml = '' }) {
  const trailingHtml = buildImpressionHtml(impression, advice);
  const startM = marker(FINDINGS_START_TOKEN);
  const endM = marker(FINDINGS_END_TOKEN);

  // The patient banner goes ABOVE the START fence (page 1, top of body) so it's
  // never read as findings by the auto-sync importer.
  if (typeof document !== 'undefined') {
    const tmp = document.createElement('div');
    tmp.innerHTML = findingsHtml || '';
    const inners = tmp.querySelectorAll('.word-page-inner');
    if (inners.length > 0) {
      inners[0].insertAdjacentHTML('afterbegin', bannerHtml + startM);
      inners[inners.length - 1].insertAdjacentHTML('beforeend', endM + trailingHtml);
      return tmp.innerHTML;
    }
  }
  return `${bannerHtml}${startM}${findingsHtml || ''}${endM}${trailingHtml}`;
}

/**
 * Convert the current report to a faithful .docx and launch Microsoft Word.
 * Returns the nativeWord.openDocx() result ({ ok, mode|path|error }).
 */
/**
 * Build the report .docx as a Blob — the SINGLE source of truth used by both
 * "Launch Word" and the on-screen true-Word preview (docx-preview renders this
 * exact blob, so the preview is byte-identical to what Word opens).
 */
export async function buildReportDocxBlob({ appointment, findingsHtml, impression, advice, protocol, watermark = '' }) {
  // Embed the actual letterhead (image, or PDF page 1) as a full-page repeating
  // background when the protocol has one. Best-effort — null if absent/failed.
  const letterhead = await fetchLetterhead(protocol);

  // Patient banner (with QR) → TOP OF THE BODY on page 1, exactly like the
  // on-screen preview. Bound by the configured page margins (not a header band),
  // so left/right/top match the editor. The letterhead/watermark stay in the
  // repeating page header as the branding background.
  // Carry the report's page margins (mm) and base font into Word so the
  // document opens with the SAME layout the doctor configured in the editor —
  // headerMargin (top) / leftMargin / rightMargin / bottomMargin, verbatim.
  const margins = {
    top:    protocol?.headerMargin ?? 25,
    left:   protocol?.leftMargin   ?? 20,
    right:  protocol?.rightMargin  ?? 20,
    bottom: protocol?.bottomMargin ?? 20,
  };

  const apptId = appointment?.appointmentId || appointment?.id || appointment?.ptid || null;
  const qrDataUrl = await buildQrDataUrl(apptId);
  const study = appointment?.service || appointment?.modality || '—';
  // Banner spans the full text width (page − left − right) so it lines up with
  // the margins instead of being a fixed-width card floating on the page.
  const bannerHtml = buildPatientBannerHtml({ appointment, protocol, study, qrDataUrl, hasLetterhead: !!letterhead, margins });
  const bodyHtml = buildReportHtml({ findingsHtml, impression, advice, bannerHtml });
  const defaultFont = {
    family: protocol?.fontFamily || 'Calibri',
    sizePt: protocol?.fontSize   || 12,
    color:  protocol?.fontColor  || undefined,
  };

  // No headerHtml — the patient banner is in the body now. The header carries
  // only the letterhead background + optional watermark.
  return buildDocxBlob(bodyHtml, { margins, defaultFont, letterhead, watermark });
}

export async function openReportInWord({ appointment, findingsHtml, impression, advice, protocol, watch = false, watermark = '' }) {
  const blob = await buildReportDocxBlob({ appointment, findingsHtml, impression, advice, protocol, watermark });
  const who = (appointment?.patientName || 'patient').replace(/\s+/g, '-').replace(/[^a-z0-9\-]/gi, '');
  const filename = `report-${who}-${new Date().toISOString().split('T')[0]}`;
  return nativeWord.openDocx(blob, filename, 'docx', { watch });
}
