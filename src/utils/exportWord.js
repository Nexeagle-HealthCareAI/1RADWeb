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

import { buildDocxBlob } from '../components/NarrativeEditor/utils/exportDocx';
import { nativeWord } from '../hooks/useElectron';
import { BASE_URL } from '../api/apiClient';

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
      pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;
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

// Build a patient-header HTML block authored so the docx converter captures it
// faithfully: sizes via <span style="font-size:Npt">, bold via <b>, a bordered
// <table> with one <p> per cell (single clean paragraph, bold labels).
function buildHeaderHtml({ appointment, protocol, hasLetterhead = false }) {
  const name   = (appointment?.patientName || '').toUpperCase() || '—';
  const ptid   = appointment?.patientIdentifier || appointment?.ptid || appointment?.id || '—';
  const age    = appointment?.patientAge ?? appointment?.age ?? '—';
  const sex    = appointment?.patientGender || appointment?.gender || '—';
  const study  = appointment?.service || appointment?.modality || '—';
  const modality = appointment?.modality || '—'; // the scanner / scan type
  const refBy  = appointment?.referredBy || 'Self';
  const token  = appointment?.dailyTokenNumber != null ? `#${appointment.dailyTokenNumber}` : '';
  const repDate = new Date().toLocaleDateString();
  const clinic = protocol?.clinicName || protocol?.practiceName || protocol?.hospitalName || '';

  const cell = (inner) => `<td><p>${inner}</p></td>`;

  // When a letterhead image is present it already carries the clinic branding,
  // so we drop the clinic name + "DIAGNOSTIC REPORT" title to avoid duplication.
  return `
    ${(!hasLetterhead && clinic) ? `<p style="text-align:center"><span style="font-size:15pt; color:#0A1628"><b>${esc(clinic)}</b></span></p>` : ''}
    ${hasLetterhead ? '' : '<p style="text-align:center"><span style="font-size:11pt; color:#64748B"><b>DIAGNOSTIC REPORT</b></span></p>'}
    <p><span style="font-size:16pt; color:#0A1628"><b>${esc(name)}</b></span>${token ? `<span style="color:#64748B">   Token ${esc(token)}</span>` : ''}</p>
    <table>
      <tr>${cell(`<b>Patient ID:</b> ${esc(ptid)}`)}${cell(`<b>Age / Sex:</b> ${esc(age)} / ${esc(sex)}`)}</tr>
      <tr>${cell(`<b>Study:</b> ${esc(study)}`)}${cell(`<b>Modality / Scanner:</b> ${esc(modality)}`)}</tr>
      <tr>${cell(`<b>Referred By:</b> ${esc(refBy)}`)}${cell(`<b>Reported:</b> ${esc(repDate)}`)}</tr>
    </table>
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
export function buildReportHtml({ findingsHtml, impression, advice }) {
  const trailingHtml = buildImpressionHtml(impression, advice);
  const startM = marker(FINDINGS_START_TOKEN);
  const endM = marker(FINDINGS_END_TOKEN);

  if (typeof document !== 'undefined') {
    const tmp = document.createElement('div');
    tmp.innerHTML = findingsHtml || '';
    const inners = tmp.querySelectorAll('.word-page-inner');
    if (inners.length > 0) {
      inners[0].insertAdjacentHTML('afterbegin', startM);
      inners[inners.length - 1].insertAdjacentHTML('beforeend', endM + trailingHtml);
      return tmp.innerHTML;
    }
  }
  return `${startM}${findingsHtml || ''}${endM}${trailingHtml}`;
}

/**
 * Convert the current report to a faithful .docx and launch Microsoft Word.
 * Returns the nativeWord.openDocx() result ({ ok, mode|path|error }).
 */
// Top margin (mm) reserved so the repeating patient header never overlaps the
// body. The header sits ~12 mm from the page top (w:header offset), so this
// leaves ~36 mm for the banner — enough for the clinic line, name and the
// 3-row detail table.
const HEADER_RESERVE_MM = 48;

export async function openReportInWord({ appointment, findingsHtml, impression, advice, protocol, watch = false, watermark = '' }) {
  // Embed the actual letterhead (image, or PDF page 1) as a full-page repeating
  // background when the protocol has one. Best-effort — null if absent/failed.
  const letterhead = await fetchLetterhead(protocol);

  // Patient banner → repeating Word page header (every page); body = findings.
  const headerHtml = buildHeaderHtml({ appointment, protocol, hasLetterhead: !!letterhead });
  const bodyHtml = buildReportHtml({ findingsHtml, impression, advice });

  // Carry the report's page margins (mm) and base font into Word so the
  // document opens with the same layout the doctor configured in the editor.
  // With a letterhead, honour the configured headerMargin (the clearance set
  // for the letterhead art); otherwise reserve room for the text banner.
  const margins = {
    top:    letterhead ? (protocol?.headerMargin ?? HEADER_RESERVE_MM)
                       : Math.max(protocol?.headerMargin ?? 20, HEADER_RESERVE_MM),
    left:   protocol?.leftMargin   ?? 20,
    right:  protocol?.rightMargin  ?? 20,
    bottom: protocol?.bottomMargin ?? 20,
  };
  const defaultFont = {
    family: protocol?.fontFamily || 'Calibri',
    sizePt: protocol?.fontSize   || 12,
    color:  protocol?.fontColor  || undefined,
  };

  const blob = await buildDocxBlob(bodyHtml, { headerHtml, margins, defaultFont, letterhead, watermark });
  const who = (appointment?.patientName || 'patient').replace(/\s+/g, '-').replace(/[^a-z0-9\-]/gi, '');
  const filename = `report-${who}-${new Date().toISOString().split('T')[0]}`;
  return nativeWord.openDocx(blob, filename, 'docx', { watch });
}
