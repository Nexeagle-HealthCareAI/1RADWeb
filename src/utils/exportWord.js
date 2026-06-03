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
function buildHeaderHtml({ appointment, protocol }) {
  const name   = (appointment?.patientName || '').toUpperCase() || '—';
  const ptid   = appointment?.patientIdentifier || appointment?.ptid || appointment?.id || '—';
  const age    = appointment?.patientAge ?? appointment?.age ?? '—';
  const sex    = appointment?.patientGender || appointment?.gender || '—';
  const study  = appointment?.service || appointment?.modality || '—';
  const refBy  = appointment?.referredBy || 'Self';
  const repDate = new Date().toLocaleDateString();
  const clinic = protocol?.clinicName || protocol?.practiceName || protocol?.hospitalName || '';

  const cell = (inner) => `<td><p>${inner}</p></td>`;

  return `
    ${clinic ? `<p style="text-align:center"><span style="font-size:15pt; color:#0A1628"><b>${esc(clinic)}</b></span></p>` : ''}
    <p style="text-align:center"><span style="font-size:11pt; color:#64748B"><b>DIAGNOSTIC REPORT</b></span></p>
    <p><span style="font-size:16pt; color:#0A1628"><b>${esc(name)}</b></span></p>
    <table>
      <tr>${cell(`<b>Patient ID:</b> ${esc(ptid)}`)}${cell(`<b>Age / Sex:</b> ${esc(age)} / ${esc(sex)}`)}</tr>
      <tr>${cell(`<b>Study:</b> ${esc(study)}`)}${cell(`<b>Reported:</b> ${esc(repDate)}`)}</tr>
      <tr><td colspan="2"><p><b>Referred By:</b> ${esc(refBy)}</p></td></tr>
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
 * Build the combined report HTML: patient header + the editor's findings
 * (verbatim, so its format is preserved) + impression + advice.
 *
 * The editor may wrap its content in .word-page / .word-page-inner page
 * containers (PageDocument pagination). The docx converter only reads the
 * children of .word-page-inner, so anything prepended/appended OUTSIDE those
 * wrappers is silently dropped — which is why the header went missing. So we
 * inject the header into the FIRST page-inner and the impression/advice into
 * the LAST one. When there are no wrappers (flat pagination) we concatenate.
 */
export function buildReportHtml({ appointment, findingsHtml, impression, advice, protocol }) {
  const headerHtml = buildHeaderHtml({ appointment, protocol });
  const trailingHtml = buildImpressionHtml(impression, advice);
  const startM = marker(FINDINGS_START_TOKEN);
  const endM = marker(FINDINGS_END_TOKEN);

  if (typeof document !== 'undefined') {
    const tmp = document.createElement('div');
    tmp.innerHTML = findingsHtml || '';
    const inners = tmp.querySelectorAll('.word-page-inner');
    if (inners.length > 0) {
      // header + START fence at the very top; END fence + impression at the end.
      inners[0].insertAdjacentHTML('afterbegin', headerHtml + startM);
      inners[inners.length - 1].insertAdjacentHTML('beforeend', endM + trailingHtml);
      return tmp.innerHTML;
    }
  }
  return `${headerHtml}${startM}${findingsHtml || ''}${endM}${trailingHtml}`;
}

/**
 * Convert the current report to a faithful .docx and launch Microsoft Word.
 * Returns the nativeWord.openDocx() result ({ ok, mode|path|error }).
 */
export async function openReportInWord({ appointment, findingsHtml, impression, advice, protocol, watch = false }) {
  const html = buildReportHtml({ appointment, findingsHtml, impression, advice, protocol });
  const blob = await buildDocxBlob(html);
  const who = (appointment?.patientName || 'patient').replace(/\s+/g, '-').replace(/[^a-z0-9\-]/gi, '');
  const filename = `report-${who}-${new Date().toISOString().split('T')[0]}`;
  return nativeWord.openDocx(blob, filename, 'docx', { watch });
}
