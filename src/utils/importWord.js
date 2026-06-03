// ════════════════════════════════════════════════════════════════
// src/utils/importWord.js
//
// Converts a saved Word .docx back into editor HTML for the auto-sync
// round-trip. Uses mammoth (docx → HTML), then extracts only the FINDINGS
// region fenced by the invisible sentinels we wrote on export — so the
// patient header and impression/advice never leak into the findings.
// ════════════════════════════════════════════════════════════════

import mammoth from 'mammoth';
import { FINDINGS_START_TOKEN, FINDINGS_END_TOKEN } from './exportWord';

function base64ToArrayBuffer(b64) {
  const bin = atob(b64);
  const len = bin.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

// Pull just the findings out of the full converted HTML. Primary path: collect
// every block strictly between the START and END sentinels. Fallback (a user
// deleted a marker line): drop everything up to and including the header table
// and keep the rest.
function extractFindings(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const children = Array.from(doc.body.children);

  let collecting = false;
  let sawStart = false;
  const collected = [];
  for (const el of children) {
    const txt = el.textContent || '';
    if (!collecting && txt.includes(FINDINGS_START_TOKEN)) { collecting = true; sawStart = true; continue; }
    if (collecting && txt.includes(FINDINGS_END_TOKEN)) { collecting = false; break; }
    if (collecting) collected.push(el.outerHTML);
  }
  if (sawStart) return collected.join('').trim();

  // Fallback — no fences found. Strip the leading header table, keep the rest.
  const firstTable = doc.body.querySelector('table');
  if (firstTable) {
    const out = [];
    let passedHeader = false;
    for (const el of children) {
      if (!passedHeader) {
        if (el === firstTable || el.contains(firstTable)) passedHeader = true;
        continue;
      }
      const txt = el.textContent || '';
      if (txt.includes(FINDINGS_END_TOKEN)) break; // still honour an END fence if present
      out.push(el.outerHTML);
    }
    return out.join('').trim();
  }

  return doc.body.innerHTML.trim();
}

/**
 * Convert a .docx (base64 string or ArrayBuffer) to the report's findings HTML.
 * @returns {Promise<string>} findings HTML ready to load into the editor
 */
export async function docxToFindingsHtml(input) {
  const arrayBuffer = typeof input === 'string' ? base64ToArrayBuffer(input) : input;
  const { value: html } = await mammoth.convertToHtml({ arrayBuffer });
  return extractFindings(html || '');
}
