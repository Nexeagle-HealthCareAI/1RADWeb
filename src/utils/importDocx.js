// ════════════════════════════════════════════════════════════════
// src/utils/importDocx.js
//
// Faithful .docx → editor-HTML reader. The exact inverse of exportDocx.js:
// it walks word/document.xml and converts each Word run/paragraph property
// back into the inline style the NarrativeEditor re-parses — so a report
// edited in Word returns to the editor looking the same (font size, colour,
// family, bold/italic/underline, alignment, spacing, headings, tables, lists).
//
// Why not mammoth: mammoth produces clean SEMANTIC html and deliberately drops
// direct formatting (size/colour/alignment/spacing). That's the round-trip
// fidelity loss this reader fixes.
// ════════════════════════════════════════════════════════════════

import JSZip from 'jszip';

const W_P = 'w:p', W_R = 'w:r', W_TBL = 'w:tbl';

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// Direct children of `parent` whose qualified name === `name`.
function kids(parent, name) {
  const out = [];
  if (!parent) return out;
  for (const n of parent.childNodes) if (n.nodeName === name) out.push(n);
  return out;
}
function kid(parent, name) {
  if (!parent) return null;
  for (const n of parent.childNodes) if (n.nodeName === name) return n;
  return null;
}
const wval = (el) => (el ? el.getAttribute('w:val') : null);

const ORDERED_FMTS = new Set(['decimal', 'decimalZero', 'lowerLetter', 'upperLetter', 'lowerRoman', 'upperRoman', 'ordinal']);

// ─── Image (w:drawing / w:pict) → HTML ────────────────────────────────────
function drawingToHtml(node, imageMap) {
  let embedId = null;
  const blips = node.getElementsByTagName('a:blip');
  if (blips.length > 0) {
    embedId = blips[0].getAttribute('r:embed');
  } else {
    const imagedata = node.getElementsByTagName('v:imagedata');
    if (imagedata.length > 0) {
      embedId = imagedata[0].getAttribute('r:id');
    }
  }
  
  if (embedId && imageMap && imageMap.has(embedId)) {
    let wPx = '', hPx = '';
    const extents = node.getElementsByTagName('wp:extent');
    if (extents.length > 0) {
      const cx = parseFloat(extents[0].getAttribute('cx'));
      const cy = parseFloat(extents[0].getAttribute('cy'));
      if (cx > 0) wPx = Math.round(cx / 9525);
      if (cy > 0) hPx = Math.round(cy / 9525);
    }
    const attrs = [`src="${imageMap.get(embedId)}"`];
    if (wPx) attrs.push(`width="${wPx}"`);
    if (hPx) attrs.push(`height="${hPx}"`);
    return `<img ${attrs.join(' ')}/>`;
  }
  return '';
}

// ─── Run (w:r) → inline HTML ──────────────────────────────────────────────
function runToHtml(r, imageMap) {
  // Collect text / breaks / tabs in document order.
  let inner = '';
  for (const c of r.childNodes) {
    if (c.nodeName === 'w:t') inner += esc(c.textContent);
    else if (c.nodeName === 'w:tab') inner += '&nbsp;&nbsp;&nbsp;&nbsp;';
    else if (c.nodeName === 'w:br') inner += '<br/>';
    else if (c.nodeName === 'w:cr') inner += '<br/>';
    else if (c.nodeName === 'w:drawing' || c.nodeName === 'w:pict') {
      inner += drawingToHtml(c, imageMap);
    }
  }
  if (!inner) return '';

  const rPr = kid(r, 'w:rPr');
  if (rPr) {
    const styles = [];
    const sz = kid(rPr, 'w:sz');
    if (sz) { const hp = parseFloat(wval(sz)); if (hp > 0) styles.push(`font-size:${hp / 2}pt`); }
    const color = kid(rPr, 'w:color');
    const cv = wval(color);
    if (cv && cv.toLowerCase() !== 'auto' && /^[0-9a-fA-F]{6}$/.test(cv)) styles.push(`color:#${cv.toUpperCase()}`);
    const fonts = kid(rPr, 'w:rFonts');
    const fam = fonts?.getAttribute('w:ascii');
    if (fam) styles.push(`font-family:${fam}`);

    if (styles.length) inner = `<span style="${styles.join(';')}">${inner}</span>`;

    // Boolean marks: present and not explicitly "0"/"false" → on.
    const on = (el) => el && !['0', 'false', 'off'].includes((wval(el) || '').toLowerCase());
    const va = wval(kid(rPr, 'w:vertAlign'));
    if (va === 'subscript') inner = `<sub>${inner}</sub>`;
    if (va === 'superscript') inner = `<sup>${inner}</sup>`;
    const u = kid(rPr, 'w:u');
    if (u && (wval(u) || 'single') !== 'none') inner = `<u>${inner}</u>`;
    if (on(kid(rPr, 'w:strike'))) inner = `<s>${inner}</s>`;
    if (on(kid(rPr, 'w:i'))) inner = `<em>${inner}</em>`;
    if (on(kid(rPr, 'w:b'))) inner = `<strong>${inner}</strong>`;
  }
  return inner;
}

// Concatenate the inline HTML of a paragraph's runs (incl. hyperlinks).
function inlineOf(p, imageMap) {
  let html = '';
  for (const c of p.childNodes) {
    if (c.nodeName === W_R) html += runToHtml(c, imageMap);
    else if (c.nodeName === 'w:hyperlink') html += kids(c, W_R).map((r) => runToHtml(r, imageMap)).join('');
  }
  return html;
}

// Paragraph-level properties → { tag, styleAttr, dataAttrs, list }
function paraMeta(p) {
  const pPr = kid(p, 'w:pPr');
  let tag = 'p';
  let list = null;
  const styleParts = [];
  let dataAttrs = '';

  if (pPr) {
    const pStyle = wval(kid(pPr, 'w:pStyle')) || '';
    const hm = /^Heading([1-6])$/i.exec(pStyle);
    if (hm) tag = `h${hm[1]}`;

    const jc = wval(kid(pPr, 'w:jc'));
    if (jc) {
      const align = jc === 'both' ? 'justify' : jc;
      if (['center', 'right', 'justify'].includes(align)) styleParts.push(`text-align:${align}`);
    }

    const sp = kid(pPr, 'w:spacing');
    if (sp) {
      const before = parseFloat(sp.getAttribute('w:before'));
      const after = parseFloat(sp.getAttribute('w:after'));
      const line = parseFloat(sp.getAttribute('w:line'));
      const rule = sp.getAttribute('w:lineRule');
      if (before > 0) dataAttrs += ` data-spacing-before="${Math.round(before / 20)}pt"`;
      if (after > 0) dataAttrs += ` data-spacing-after="${Math.round(after / 20)}pt"`;
      if (line > 0 && (rule === 'auto' || !rule)) styleParts.push(`line-height:${(line / 240).toFixed(2)}`);
    }

    // Indentation (inverse of exportDocx's w:ind). twips → px (1440 tw = 96 px).
    // A hanging indent becomes padding-left + negative text-indent (what the
    // editor's ParagraphIndent/hangingIndent attributes re-parse).
    const ind = kid(pPr, 'w:ind');
    if (ind) {
      const twToPx = (tw) => Math.round((parseFloat(tw) || 0) / 1440 * 96);
      const leftTw  = parseFloat(ind.getAttribute('w:left'))      || 0;
      const hangTw  = parseFloat(ind.getAttribute('w:hanging'))   || 0;
      const firstTw = parseFloat(ind.getAttribute('w:firstLine')) || 0;
      if (hangTw > 0) {
        const hPx = twToPx(hangTw);
        const mlPx = twToPx(Math.max(0, leftTw - hangTw));
        if (mlPx > 0) styleParts.push(`margin-left:${mlPx}px`);
        styleParts.push(`padding-left:${hPx}px`);
        styleParts.push(`text-indent:-${hPx}px`);
      } else {
        const mlPx = twToPx(leftTw);
        if (mlPx > 0) styleParts.push(`margin-left:${mlPx}px`);
        if (firstTw > 0) styleParts.push(`text-indent:${twToPx(firstTw)}px`);
      }
    }

    const numPr = kid(pPr, 'w:numPr');
    if (numPr) {
      list = {
        ilvl: parseInt(wval(kid(numPr, 'w:ilvl')) || '0', 10) || 0,
        numId: wval(kid(numPr, 'w:numId')) || '0',
      };
    }
  }
  const styleAttr = styleParts.length ? ` style="${styleParts.join(';')}"` : '';
  return { tag, styleAttr, dataAttrs, list };
}

// ─── Numbering (lists) ────────────────────────────────────────────────────
// Map numId → ordered?(boolean) from numbering.xml. Best-effort; defaults to
// bullet. Our own export writes bullets as literal text (no numbering), so this
// only matters for lists the user creates in Word.
function buildNumberingMap(numberingXml) {
  const map = new Map(); // numId -> ordered boolean
  if (!numberingXml) return map;
  try {
    const doc = new DOMParser().parseFromString(numberingXml, 'application/xml');
    const abstractFmt = new Map(); // abstractNumId -> ordered (lvl 0)
    for (const an of doc.getElementsByTagName('w:abstractNum')) {
      const aid = an.getAttribute('w:abstractNumId');
      const lvl0 = kids(an, 'w:lvl').find(l => (l.getAttribute('w:ilvl') || '0') === '0') || kid(an, 'w:lvl');
      const fmt = wval(kid(lvl0, 'w:numFmt'));
      abstractFmt.set(aid, ORDERED_FMTS.has(fmt));
    }
    for (const num of doc.getElementsByTagName('w:num')) {
      const numId = num.getAttribute('w:numId');
      const aid = num.getElementsByTagName('w:abstractNumId')[0]?.getAttribute('w:val');
      map.set(numId, !!abstractFmt.get(aid));
    }
  } catch { /* ignore — default bullets */ }
  return map;
}

// ─── Table (w:tbl) → HTML ─────────────────────────────────────────────────
function tableToHtml(tbl, imageMap) {
  // Column widths from <w:tblGrid> (twips → px). Applied as `colwidth` on the
  // first row's cells so the editor's resizable table restores the widths.
  const tblGrid = kid(tbl, 'w:tblGrid');
  const gridPx = tblGrid
    ? kids(tblGrid, 'w:gridCol').map((g) => { const t = parseFloat(g.getAttribute('w:w')); return Number.isFinite(t) && t > 0 ? Math.round(t / 15) : null; })
    : [];

  let rows = '';
  let rowIdx = 0;
  for (const tr of kids(tbl, 'w:tr')) {
    let cells = '';
    let colIdx = 0; // grid column position (first row only, for colwidth)
    for (const tc of kids(tr, 'w:tc')) {
      const tcPr = kid(tc, 'w:tcPr');
      // Merged columns → colspan; cell shading → background-color.
      const span = parseInt(wval(kid(tcPr, 'w:gridSpan')) || '1', 10);
      const fill = (kid(tcPr, 'w:shd')?.getAttribute('w:fill') || '').trim();
      const attrs = [];
      if (span > 1) attrs.push(`colspan="${span}"`);
      if (fill && /^[0-9a-fA-F]{6}$/.test(fill) && fill.toLowerCase() !== 'auto') {
        attrs.push(`style="background-color:#${fill.toUpperCase()}"`);
      }
      if (rowIdx === 0 && gridPx.length) {
        const ws = gridPx.slice(colIdx, colIdx + span).filter((w) => w != null);
        if (ws.length) attrs.push(`colwidth="${ws.join(',')}"`);
      }
      colIdx += span;
      let cellHtml = '';
      for (const c of tc.childNodes) {
        if (c.nodeName === W_P) cellHtml += blockParaToHtml(c, imageMap);
        else if (c.nodeName === W_TBL) cellHtml += tableToHtml(c, imageMap);
      }
      cells += `<td${attrs.length ? ' ' + attrs.join(' ') : ''}>${cellHtml || '<p></p>'}</td>`;
    }
    rows += `<tr>${cells}</tr>`;
    rowIdx++;
  }
  return `<table>${rows}</table>`;
}

// A single (non-list) paragraph → block HTML.
function blockParaToHtml(p, imageMap) {
  const { tag, styleAttr, dataAttrs } = paraMeta(p);
  const inner = inlineOf(p, imageMap);
  return `<${tag}${styleAttr}${dataAttrs}>${inner}</${tag}>`;
}

// ─── Body walker (handles list grouping) ──────────────────────────────────
function bodyToHtml(body, numberingMap, imageMap) {
  const blocks = Array.from(body.childNodes).filter(n => n.nodeName === W_P || n.nodeName === W_TBL);
  let html = '';
  let i = 0;
  while (i < blocks.length) {
    const node = blocks[i];
    if (node.nodeName === W_TBL) { html += tableToHtml(node, imageMap); i++; continue; }

    const meta = paraMeta(node);
    if (!meta.list) { html += blockParaToHtml(node, imageMap); i++; continue; }

    // Collect a run of consecutive list paragraphs and emit nested <ul>/<ol>.
    const items = [];
    while (i < blocks.length && blocks[i].nodeName === W_P) {
      const m = paraMeta(blocks[i]);
      if (!m.list) break;
      items.push({ ilvl: m.list.ilvl, ordered: !!numberingMap.get(m.list.numId), html: inlineOf(blocks[i], imageMap) });
      i++;
    }
    html += renderList(items);
  }
  return html;
}

// Render a flat list of {ilvl, ordered, html} into nested <ul>/<ol>.
function renderList(items) {
  let out = '';
  const stack = []; // { ilvl, ordered }
  const close = (toLevel) => {
    while (stack.length > toLevel) {
      const top = stack.pop();
      out += top.ordered ? '</ol>' : '</ul>';
      if (stack.length) out += '</li>';
    }
  };
  for (const it of items) {
    const depth = it.ilvl + 1;
    if (stack.length < depth) {
      while (stack.length < depth) {
        if (stack.length) out += '<li>';
        out += it.ordered ? '<ol>' : '<ul>';
        stack.push({ ilvl: stack.length, ordered: it.ordered });
      }
    } else if (stack.length > depth) {
      close(depth);
    }
    out += `<li><p>${it.html || ''}</p></li>`;
  }
  close(0);
  return out;
}

/**
 * Convert a .docx (ArrayBuffer) into editor-ready HTML, preserving formatting.
 * @returns {Promise<string>}
 */
export async function docxToHtml(arrayBuffer) {
  const zip = await JSZip.loadAsync(arrayBuffer);
  const docXml = await zip.file('word/document.xml')?.async('string');
  if (!docXml) throw new Error('document.xml not found in .docx');
  const numberingXml = await zip.file('word/numbering.xml')?.async('string');
  const numberingMap = buildNumberingMap(numberingXml);

  const imageMap = new Map();
  const relsXml = await zip.file('word/_rels/document.xml.rels')?.async('string');
  if (relsXml) {
    const relsDoc = new DOMParser().parseFromString(relsXml, 'application/xml');
    const rels = relsDoc.getElementsByTagName('Relationship');
    for (const rel of rels) {
      const id = rel.getAttribute('Id');
      const target = rel.getAttribute('Target');
      if (target && (target.startsWith('media/') || target.startsWith('/word/media/'))) {
        const zipPath = target.startsWith('/') ? target.slice(1) : `word/${target}`;
        const file = zip.file(zipPath);
        if (file) {
          const base64 = await file.async('base64');
          let mime = 'image/png';
          const ext = target.split('.').pop()?.toLowerCase();
          if (ext === 'jpg' || ext === 'jpeg') mime = 'image/jpeg';
          else if (ext === 'gif') mime = 'image/gif';
          else if (ext === 'svg') mime = 'image/svg+xml';
          imageMap.set(id, `data:${mime};base64,${base64}`);
        }
      }
    }
  }

  const doc = new DOMParser().parseFromString(docXml, 'application/xml');
  const body = doc.getElementsByTagName('w:body')[0];
  if (!body) throw new Error('w:body not found');
  return bodyToHtml(body, numberingMap, imageMap);
}
