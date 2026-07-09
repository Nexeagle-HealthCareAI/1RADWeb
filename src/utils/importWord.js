// ════════════════════════════════════════════════════════════════
// src/utils/importWord.js
//
// Converts a saved Word .docx back into editor HTML for the auto-sync
// round-trip. Uses DocxWorker (docx → HTML), then extracts the FINDINGS,
// IMPRESSION, and ADVICE regions fenced by the SDT markers.
// ════════════════════════════════════════════════════════════════

import mammoth from 'mammoth';
import DocxWorker from './docxWorker?worker';
import { FINDINGS_START_TOKEN, FINDINGS_END_TOKEN } from './exportWord';
import { notifyToast } from './toast';

function base64ToArrayBuffer(b64) {
  const bin = atob(b64);
  const len = bin.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

// Extract sections wrapped in `<rad-sdt-start name="...">` tags.
function extractSections(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const children = Array.from(doc.body.children);

  const sections = { findingsHtml: '', impressionText: '', adviceText: '' };
  
  let currentSection = null;
  let collected = [];

  for (const el of children) {
    if (el.tagName.toLowerCase() === 'rad-sdt-start') {
      const name = el.getAttribute('name');
      if (name === '1RAD-FINDINGS') currentSection = 'findingsHtml';
      else if (name === '1RAD-IMPRESSION') currentSection = 'impressionText';
      else if (name === '1RAD-ADVICE') currentSection = 'adviceText';
      collected = [];
      continue;
    }
    
    if (el.tagName.toLowerCase() === 'rad-sdt-end') {
      if (currentSection) {
        if (currentSection === 'findingsHtml') {
          sections[currentSection] = collected.join('').trim();
        } else {
          // For impression and advice, extract plain text.
          const tmp = document.createElement('div');
          tmp.innerHTML = collected.join('');
          sections[currentSection] = tmp.textContent.trim();
        }
        currentSection = null;
      }
      continue;
    }
    
    if (currentSection) {
      collected.push(el.outerHTML);
    }
  }

  // Fallback for Mammoth which strips custom HTML tags.
  if (!sections.findingsHtml) {
    // Ultimate fallback: Strip the leading header table, keep the rest.
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
        if (typeof FINDINGS_END_TOKEN === 'string' && FINDINGS_END_TOKEN && txt.includes(FINDINGS_END_TOKEN)) break;
        out.push(el.outerHTML);
      }
      sections.findingsHtml = out.join('').trim();
    } else {
      sections.findingsHtml = doc.body.innerHTML.trim();
    }
  }

  return sections;
}

/**
 * Convert a .docx (base64 string or ArrayBuffer) to the report's sections.
 * @returns {Promise<{ findingsHtml: string, impressionText: string, adviceText: string }>} 
 */
export async function docxToFindingsHtml(input) {
  const arrayBuffer = typeof input === 'string' ? base64ToArrayBuffer(input) : input;
  let html;
  try {
    html = await new Promise((resolve, reject) => {
      const worker = new DocxWorker();
      worker.onmessage = (e) => {
        worker.terminate();
        if (e.data.ok) resolve(e.data.html);
        else reject(new Error(e.data.error));
      };
      worker.onerror = (e) => {
        worker.terminate();
        reject(e);
      };
      worker.postMessage(arrayBuffer);
    });
  } catch (e) {
    console.warn('[Word] faithful reader failed, falling back to mammoth:', e?.message);
    const res = await mammoth.convertToHtml({ arrayBuffer });
    html = res?.value || '';
    notifyToast('Note: Some advanced Word formatting could not be synced perfectly. Please verify your layout.', 'warning');
  }
  return extractSections(html || '');
}
