/**
 * exportDocx.js — export the NarrativeEditor's HTML as a .docx file.
 *
 * Uses JSZip (already in package.json) to create a minimal OOXML ZIP package.
 * Tables, headings, bold/italic/underline, lists, horizontal rules and page
 * breaks are all converted.  Images are embedded as base64 data URIs.
 */
import JSZip from 'jszip';

// ─── XML helpers ──────────────────────────────────────────────────────────────
function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Normalise a CSS colour (#rgb, #rrggbb, rgb()/rgba()) to a 6-hex Word colour.
function cssColorToHex(c) {
  if (!c) return null;
  const v = String(c).trim();
  if (v.startsWith('#')) {
    let h = v.slice(1);
    if (h.length === 3) h = h.split('').map(x => x + x).join('');
    return h.toUpperCase().padEnd(6, '0').slice(0, 6);
  }
  const m = v.match(/rgba?\(([^)]+)\)/i);
  if (m) {
    const [r, g, b] = m[1].split(',').map(x => parseInt(x.trim(), 10));
    if ([r, g, b].every(Number.isFinite)) {
      return [r, g, b].map(n => Math.max(0, Math.min(255, n)).toString(16).padStart(2, '0')).join('').toUpperCase();
    }
  }
  return null;
}

// CSS font-size → Word half-points. The ribbon authors sizes in pt; some paths
// carry px. parseFloat copes with either suffix (plain "+'14pt'" is NaN).
function fontSizeToHalfPt(fs) {
  if (!fs) return null;
  const v = parseFloat(fs);
  if (!(v > 0)) return null;
  const pt = String(fs).includes('px') ? v * 0.75 : v;
  return Math.round(pt * 2);
}

// mm → twips (1 inch = 1440 twips = 25.4 mm). Used for page margins.
const mmToTwips = (mm) => Math.round((Number(mm) || 0) * 1440 / 25.4);

// A CSS length (pt/px/mm/in/number) → twips. Used for paragraph spacing so the
// editor's "space before/after" choices reach Word exactly.
function cssLenToTwips(v) {
  if (v == null || v === '') return null;
  const n = parseFloat(v);
  if (!Number.isFinite(n)) return null;
  const s = String(v);
  if (s.includes('pt')) return Math.round(n * 20);
  if (s.includes('mm')) return Math.round(n * 56.6929);
  if (s.includes('in')) return Math.round(n * 1440);
  return Math.round(n * 15); // px (and unit-less) → 1px ≈ 0.75pt = 15 twips
}

// ─── Inline images ────────────────────────────────────────────────────────────
// <img src="data:image/png;base64,…"> → a real embedded Word inline picture.
// Images are collected during conversion (like list numbering), then written to
// word/media/ with relationships + content-types in buildDocxBlob. Only data
// URIs are handled (no async network fetch); width/height attrs set the size.
let _images = []; // [{ idx, rId, ext, bytes }]
function resetImages() { _images = []; }

// Usable text width in twips (page width − left/right margins). Tables and
// images are clamped to this so nothing runs off the right edge in Word. 0 =
// no limit (set per-document in buildDocxBlob before conversion).
let _maxContentTwips = 0;

function dataUriToImage(uri) {
  const m = /^data:([^;]+);base64,(.*)$/s.exec(String(uri || '').trim());
  if (!m) return null;
  const mime = m[1].toLowerCase();
  const ext = mime.includes('png') ? 'png'
            : (mime.includes('jpeg') || mime.includes('jpg')) ? 'jpeg'
            : mime.includes('gif') ? 'gif' : 'png';
  try {
    const bin = atob(m[2]);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return { bytes, ext };
  } catch { return null; }
}

// Emit an inline-picture run for an <img> node (data URI only). px → EMU at
// 96 dpi (1px = 9525 EMU). wp namespace is declared on the element so the body
// document (which only declares w/r) stays valid.
function imageRunXml(node) {
  const decoded = dataUriToImage(node.getAttribute?.('src'));
  if (!decoded) return '';
  const wPx = parseFloat(node.getAttribute?.('width')  || node.style?.width  || '') || 96;
  const hPx = parseFloat(node.getAttribute?.('height') || node.style?.height || '') || 96;
  let cx = Math.round(wPx * 9525);
  let cy = Math.round(hPx * 9525);
  // Don't let an oversized image overflow the right margin (1 twip = 635 EMU).
  const maxEmu = _maxContentTwips > 0 ? _maxContentTwips * 635 : 0;
  if (maxEmu && cx > maxEmu) { cy = Math.round(cy * (maxEmu / cx)); cx = maxEmu; }
  const idx = _images.length + 1;
  const rId = `rIdImg${idx}`;
  const did = 300 + idx;
  _images.push({ idx, rId, ext: decoded.ext, bytes: decoded.bytes });
  return `<w:r><w:drawing>` +
    `<wp:inline xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" distT="0" distB="0" distL="0" distR="0">` +
    `<wp:extent cx="${cx}" cy="${cy}"/><wp:effectExtent l="0" t="0" r="0" b="0"/>` +
    `<wp:docPr id="${did}" name="Image${did}"/>` +
    `<wp:cNvGraphicFramePr><a:graphicFrameLocks xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" noChangeAspect="1"/></wp:cNvGraphicFramePr>` +
    `<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">` +
    `<a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">` +
    `<pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">` +
    `<pic:nvPicPr><pic:cNvPr id="${did}" name="Image${did}"/><pic:cNvPicPr/></pic:nvPicPr>` +
    `<pic:blipFill><a:blip r:embed="${rId}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>` +
    `<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm>` +
    `<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>` +
    `</pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`;
}

// ─── Run-property builder ─────────────────────────────────────────────────────
function buildRPr(m) {
  let x = '';
  if (m.b)     x += '<w:b/><w:bCs/>';
  if (m.i)     x += '<w:i/><w:iCs/>';
  if (m.u)     x += '<w:u w:val="single"/>';
  if (m.s)     x += '<w:strike/>';
  if (m.sub)   x += '<w:vertAlign w:val="subscript"/>';
  if (m.sup)   x += '<w:vertAlign w:val="superscript"/>';
  if (m.sz)    x += `<w:sz w:val="${m.sz}"/><w:szCs w:val="${m.sz}"/>`;
  if (m.color) x += `<w:color w:val="${m.color}"/>`;
  if (m.font)  x += `<w:rFonts w:ascii="${esc(m.font)}" w:hAnsi="${esc(m.font)}"/>`;
  return x ? `<w:rPr>${x}</w:rPr>` : '';
}

// ─── Inline text-run walker ───────────────────────────────────────────────────
function textRuns(node, marks) {
  if (node.nodeType === 3) {
    const raw = node.textContent;
    if (!raw) return '';
    const rpr = buildRPr(marks);
    // Convert literal tab characters into REAL Word tabs (<w:tab/>) so they
    // honour tab stops / hanging indents instead of rendering as raw text.
    if (raw.includes('\t')) {
      return raw.split('\t').map((seg, i) =>
        (i > 0 ? `<w:r>${rpr}<w:tab/></w:r>` : '') +
        (seg ? `<w:r>${rpr}<w:t xml:space="preserve">${esc(seg)}</w:t></w:r>` : '')
      ).join('');
    }
    return `<w:r>${rpr}<w:t xml:space="preserve">${esc(raw)}</w:t></w:r>`;
  }
  if (node.nodeType !== 1) return '';

  const tag = node.tagName.toLowerCase();
  const m = { ...marks };

  if      (tag === 'strong' || tag === 'b')                 m.b = true;
  else if (tag === 'em'     || tag === 'i')                 m.i = true;
  else if (tag === 'u')                                     m.u = true;
  else if (tag === 's' || tag === 'del' || tag === 'strike') m.s = true;
  else if (tag === 'sub')  m.sub = true;
  else if (tag === 'sup')  m.sup = true;
  else if (tag === 'br')   return '<w:r><w:br/></w:r>';
  else if (tag === 'img')  return imageRunXml(node);
  else if (tag === 'span') {
    // Structured fill-in fields render as plain text in Word (no pill /
    // colour / underline) — their styling is decorative editor chrome only.
    if (node.getAttribute?.('data-field-type') == null) {
      const st = node.style || {};
      if (+st.fontWeight >= 600 || st.fontWeight === 'bold') m.b = true;
      if (st.fontStyle === 'italic') m.i = true;
      if (st.textDecoration?.includes('underline'))    m.u = true;
      if (st.textDecoration?.includes('line-through')) m.s = true;
      const sz = fontSizeToHalfPt(st.fontSize);
      if (sz) m.sz = sz;
      if (st.fontFamily) m.font = st.fontFamily.replace(/['"]/g, '').split(',')[0].trim();
      const col = cssColorToHex(st.color);
      if (col) m.color = col;
    }
  } else if (tag === 'a') {
    // Only style as a hyperlink when it's a REAL URL. In-document anchors /
    // field markers (no http href) must stay plain — not blue-underlined.
    const href = node.getAttribute?.('href') || '';
    if (/^https?:\/\//i.test(href)) { m.u = true; m.color = '0078D4'; }
  } else if (tag === 'code') {
    m.font = 'Courier New';
  }

  let out = '';
  for (const c of node.childNodes) out += textRuns(c, m);
  return out;
}

// ─── Lists → real Word numbering ───────────────────────────────────────────────
// We emit proper <w:numPr> paragraphs tied to numbering.xml (not literal "•/1."
// text), so lists render as real Word lists AND round-trip back as <ul>/<ol>.
// abstractNumId 0 = bullet, 1 = ordered. Each list element gets its own numId so
// ordered lists restart at 1 and bullet/ordered nesting keep their own format.
let _listNums = []; // [{ numId, abstractNumId }]
function resetNumbering() { _listNums = []; }
function allocNum(isOrdered) {
  const numId = _listNums.length + 1;
  _listNums.push({ numId, abstractNumId: isOrdered ? 1 : 0 });
  return numId;
}

function listToWml(listEl, isOrdered, ilvl) {
  const numId = allocNum(isOrdered);
  let out = '';
  for (const child of listEl.childNodes) {
    if (child.nodeType !== 1 || child.tagName.toLowerCase() !== 'li') continue;

    // Gather direct inline content, separating nested lists
    let inline = '';
    for (const n of child.childNodes) {
      const t = n.tagName?.toLowerCase();
      if (t !== 'ul' && t !== 'ol') inline += textRuns(n, {});
    }

    out += `<w:p><w:pPr><w:pStyle w:val="ListParagraph"/>`
      + `<w:numPr><w:ilvl w:val="${ilvl}"/><w:numId w:val="${numId}"/></w:numPr>`
      + `</w:pPr>${inline}</w:p>`;

    // Nested lists keep their own numId (own format) at the next indent level.
    for (const n of child.childNodes) {
      const t = n.tagName?.toLowerCase();
      if (t === 'ul') out += listToWml(n, false, ilvl + 1);
      if (t === 'ol') out += listToWml(n, true,  ilvl + 1);
    }
  }
  return out;
}

// numbering.xml: one bullet abstractNum, one ordered abstractNum (9 levels each),
// plus a <w:num> for every list allocated during this conversion.
function buildNumberingXml() {
  const bulletLvls = [];
  const orderedLvls = [];
  const orderedFmts = ['decimal', 'lowerLetter', 'lowerRoman'];
  for (let i = 0; i < 9; i++) {
    const indent = (i + 1) * 720;
    bulletLvls.push(
      `<w:lvl w:ilvl="${i}"><w:start w:val="1"/><w:numFmt w:val="bullet"/>` +
      `<w:lvlText w:val="&#xF0B7;"/><w:lvlJc w:val="left"/>` +
      `<w:pPr><w:ind w:left="${indent}" w:hanging="360"/></w:pPr>` +
      `<w:rPr><w:rFonts w:ascii="Symbol" w:hAnsi="Symbol" w:hint="default"/></w:rPr></w:lvl>`
    );
    const fmt = orderedFmts[i % 3];
    orderedLvls.push(
      `<w:lvl w:ilvl="${i}"><w:start w:val="1"/><w:numFmt w:val="${fmt}"/>` +
      `<w:lvlText w:val="%${i + 1}."/><w:lvlJc w:val="left"/>` +
      `<w:pPr><w:ind w:left="${indent}" w:hanging="360"/></w:pPr></w:lvl>`
    );
  }
  const nums = _listNums
    .map(n => `<w:num w:numId="${n.numId}"><w:abstractNumId w:val="${n.abstractNumId}"/></w:num>`)
    .join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:abstractNum w:abstractNumId="0"><w:multiLevelType w:val="hybridMultilevel"/>${bulletLvls.join('')}</w:abstractNum>
  <w:abstractNum w:abstractNumId="1"><w:multiLevelType w:val="hybridMultilevel"/>${orderedLvls.join('')}</w:abstractNum>
  ${nums}
</w:numbering>`;
}

// ─── Table ────────────────────────────────────────────────────────────────────
// Build a <w:tblGrid> from the table's column widths (TipTap serialises a
// per-cell `colwidth` attribute in px; some docs use a <colgroup>). Returns ''
// when no widths are present, so untouched tables keep the full-width default.
function tableGrid(table, rows) {
  const widths = [];
  const cols = Array.from(table.querySelectorAll(':scope > colgroup > col'));
  if (cols.length) {
    for (const c of cols) {
      const w = parseFloat((c.style?.width || c.getAttribute('width') || '').toString());
      widths.push(Number.isFinite(w) ? w : null);
    }
  } else if (rows[0]) {
    const firstCells = rows[0].querySelectorAll(':scope > td, :scope > th');
    for (const cell of firstCells) {
      const cw = cell.getAttribute('colwidth');
      if (cw) {
        cw.split(',').forEach((x) => { const n = parseFloat(x); widths.push(Number.isFinite(n) ? n : null); });
      } else {
        const span = parseInt(cell.getAttribute('colspan') || '1', 10);
        for (let k = 0; k < span; k++) widths.push(null);
      }
    }
  }
  if (!widths.length || widths.every((w) => w == null)) return '';
  // px → twips (1px ≈ 15 twips). Fall back to ~60px for any unsized column.
  let twips = widths.map((w) => Math.round((w || 60) * 15));
  // If the table is wider than the usable text area, scale every column down
  // proportionally so it fits the page instead of running off the right edge.
  const total = twips.reduce((a, b) => a + (b || 0), 0);
  if (_maxContentTwips > 0 && total > _maxContentTwips) {
    const f = _maxContentTwips / total;
    twips = twips.map((t) => Math.max(120, Math.round(t * f)));
  }
  const gridCols = twips.map((t) => `<w:gridCol w:w="${t}"/>`).join('');
  return `<w:tblGrid>${gridCols}</w:tblGrid>`;
}

// Render one real cell → <w:tc>. vMerge='restart' starts a vertical (row) merge.
function cellToWml(cell, vMerge) {
  const isHeader = cell.tagName.toLowerCase() === 'th';
  const tcPrParts = [];
  const colspan = parseInt(cell.getAttribute('colspan') || '1', 10);
  if (colspan > 1) tcPrParts.push(`<w:gridSpan w:val="${colspan}"/>`);
  if (vMerge === 'restart') tcPrParts.push('<w:vMerge w:val="restart"/>');
  const bgHex = cssColorToHex(cell.style?.backgroundColor) || (isHeader ? 'D9D9D9' : null);
  if (bgHex) tcPrParts.push(`<w:shd w:val="clear" w:color="auto" w:fill="${bgHex}"/>`);
  let cellWml = '';
  for (const c of cell.childNodes) cellWml += blockToWml(c);
  if (!cellWml.includes('<w:p')) cellWml = `<w:p>${textRuns(cell, isHeader ? { b: true } : {})}</w:p>`;
  return `<w:tc>${tcPrParts.length ? `<w:tcPr>${tcPrParts.join('')}</w:tcPr>` : ''}${cellWml}</w:tc>`;
}

function tableToWml(table) {
  const borderAttr = (side) =>
    `<w:${side} w:val="single" w:sz="4" w:color="auto"/>`;
  const borders = `<w:tblBorders>${
    ['top','left','bottom','right','insideH','insideV'].map(borderAttr).join('')
  }</w:tblBorders>`;

  // Support both <table><tr> and <table><tbody><tr>
  const rows = Array.from(table.querySelectorAll('tr')).filter(
    r => r.closest('table') === table,
  );

  // Honour explicit column widths when present; otherwise full-width (100%).
  const grid = tableGrid(table, rows);
  const tblW = grid ? '<w:tblW w:w="0" w:type="auto"/>' : '<w:tblW w:w="5000" w:type="pct"/>';
  const layout = grid ? '<w:tblLayout w:type="fixed"/>' : '';
  let wml = `<w:tbl><w:tblPr>${tblW}${layout}${borders}</w:tblPr>${grid}`;

  // Vertical merges (rowspan) need column-grid tracking; only engage that path
  // when the table actually uses rowspan, so the common case stays on the
  // simple, proven loop.
  const hasRowspan = Array.from(table.querySelectorAll(':scope tr > td[rowspan], :scope tr > th[rowspan]'))
    .some((c) => parseInt(c.getAttribute('rowspan') || '1', 10) > 1);

  if (!hasRowspan) {
    for (const row of rows) {
      wml += '<w:tr>';
      const cells = row.querySelectorAll(':scope > td, :scope > th');
      for (const cell of cells) wml += cellToWml(cell);
      wml += '</w:tr>';
    }
  } else {
    // Total grid columns = the wider of the grid count and row-0's colspan sum.
    const gridCount = (grid.match(/<w:gridCol/g) || []).length;
    const r0 = rows[0] ? Array.from(rows[0].querySelectorAll(':scope > td, :scope > th')) : [];
    let r0sum = 0; r0.forEach((c) => { r0sum += parseInt(c.getAttribute('colspan') || '1', 10); });
    const totalCols = Math.max(gridCount, r0sum, 1);

    const pending = new Array(totalCols).fill(0);     // continuation rows left, per column
    const pendingSpan = new Array(totalCols).fill(1); // colspan of the merged region
    for (const row of rows) {
      wml += '<w:tr>';
      const cells = Array.from(row.querySelectorAll(':scope > td, :scope > th'));
      let ci = 0;
      let col = 0;
      while (col < totalCols) {
        if (pending[col] > 0) {
          const span = pendingSpan[col] || 1;
          wml += `<w:tc><w:tcPr>${span > 1 ? `<w:gridSpan w:val="${span}"/>` : ''}<w:vMerge/></w:tcPr><w:p/></w:tc>`;
          pending[col] -= 1;
          col += span;
          continue;
        }
        if (ci >= cells.length) { wml += '<w:tc><w:p/></w:tc>'; col += 1; continue; }
        const cell = cells[ci++];
        const colspan = parseInt(cell.getAttribute('colspan') || '1', 10);
        const rowspan = parseInt(cell.getAttribute('rowspan') || '1', 10);
        wml += cellToWml(cell, rowspan > 1 ? 'restart' : null);
        if (rowspan > 1) { pending[col] = rowspan - 1; pendingSpan[col] = colspan; }
        col += colspan;
      }
      wml += '</w:tr>';
    }
  }
  return wml + '</w:tbl>';
}

// ─── Block converter ──────────────────────────────────────────────────────────
function blockToWml(node) {
  if (node.nodeType === 3) {
    const t = node.textContent?.trim();
    if (!t) return '';
    return `<w:p><w:r><w:t xml:space="preserve">${esc(t)}</w:t></w:r></w:p>`;
  }
  if (node.nodeType !== 1) return '';

  const tag = node.tagName.toLowerCase();

  // Callout / text box → a single-cell shaded, bordered table (the closest
  // faithful Word equivalent of the editor's bordered box).
  if (tag === 'div' && node.getAttribute('data-callout') !== null) {
    let inner = '';
    for (const c of node.childNodes) inner += blockToWml(c);
    if (!inner.includes('<w:p')) inner = `<w:p>${textRuns(node, {})}</w:p>`;
    const tcBorders = `<w:tcBorders>${['top', 'left', 'bottom', 'right']
      .map((s) => `<w:${s} w:val="single" w:sz="4" w:color="CBD5E1"/>`).join('')}</w:tcBorders>`;
    return `<w:tbl><w:tblPr><w:tblW w:w="5000" w:type="pct"/></w:tblPr>` +
      `<w:tr><w:tc><w:tcPr>${tcBorders}<w:shd w:val="clear" w:color="auto" w:fill="F8FAFC"/></w:tcPr>${inner}</w:tc></w:tr></w:tbl>`;
  }

  // Standalone image (block-level) → its own paragraph.
  if (tag === 'img') {
    const run = imageRunXml(node);
    return run ? `<w:p>${run}</w:p>` : '';
  }

  // Headings
  const hm = tag.match(/^h([1-6])$/);
  if (hm) {
    return `<w:p><w:pPr><w:pStyle w:val="Heading${hm[1]}"/></w:pPr>${textRuns(node, {})}</w:p>`;
  }

  // Paragraph
  if (tag === 'p') {
    const st = node.style || {};
    let ppr = '';
    const jcMap = { center: 'center', right: 'right', justify: 'both' };
    const jc = jcMap[st.textAlign];
    if (jc) ppr += `<w:jc w:val="${jc}"/>`;
    // Space before/after — the editor stores "Add space before/after paragraph"
    // as data-spacing-* attributes (and/or inline margins). Carry them to Word
    // so vertical rhythm matches the editor exactly.
    const before = cssLenToTwips(node.getAttribute?.('data-spacing-before') || st.marginTop);
    const after  = cssLenToTwips(node.getAttribute?.('data-spacing-after')  || st.marginBottom);
    if (before != null || after != null) {
      ppr += `<w:spacing${before != null ? ` w:before="${before}"` : ''}${after != null ? ` w:after="${after}"` : ''}/>`;
    }
    // Line height → w:spacing line (240ths of a line; lineRule auto).
    const lh = parseFloat(st.lineHeight);
    if (Number.isFinite(lh) && lh > 0 && lh < 5) {
      ppr += `<w:spacing w:line="${Math.round(lh * 240)}" w:lineRule="auto"/>`;
    }
    // Indentation. Left = margin-left + padding-left (px → twips). text-indent
    // becomes a Word FIRST-LINE indent (positive) or a HANGING indent (negative)
    // so wrapped lines align under the first line — e.g. the organ-label layout.
    const pxToTw = (v) => Math.round((parseFloat(v) || 0) / 96 * 1440);
    const leftTw = pxToTw(st.marginLeft) + pxToTw(st.paddingLeft);
    const tiPx = parseFloat(st.textIndent) || 0;
    if (leftTw > 0 || tiPx) {
      let indAttr = '';
      if (leftTw > 0) indAttr += ` w:left="${leftTw}"`;
      if (tiPx < 0) indAttr += ` w:hanging="${Math.round(-tiPx / 96 * 1440)}"`;
      else if (tiPx > 0) indAttr += ` w:firstLine="${Math.round(tiPx / 96 * 1440)}"`;
      if (indAttr) ppr += `<w:ind${indAttr}/>`;
    }
    return `<w:p>${ppr ? `<w:pPr>${ppr}</w:pPr>` : ''}${textRuns(node, {})}</w:p>`;
  }

  // Horizontal rule
  if (tag === 'hr') {
    return '<w:p><w:pPr><w:pBdr><w:bottom w:val="single" w:sz="4" w:sp="1" w:color="auto"/></w:pBdr></w:pPr></w:p>';
  }

  // Lists
  if (tag === 'ul') return listToWml(node, false, 0); // bullet
  if (tag === 'ol') return listToWml(node, true,  0); // ordered

  // Table
  if (tag === 'table') return tableToWml(node);

  // Blockquote
  if (tag === 'blockquote') {
    let out = '';
    for (const c of node.childNodes) {
      const wml = blockToWml(c);
      // Indent each paragraph inside blockquote
      out += wml.replace(/<w:p>(<w:pPr>)?/, (match, hasPPr) =>
        hasPPr
          ? '<w:p><w:pPr><w:ind w:left="720"/>'
          : '<w:p><w:pPr><w:ind w:left="720"/></w:pPr>',
      );
    }
    return out;
  }

  // Preformatted / code block
  if (tag === 'pre') {
    return node.textContent.split('\n').map(l =>
      `<w:p><w:pPr><w:ind w:left="720"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Courier New" w:hAnsi="Courier New"/></w:rPr><w:t xml:space="preserve">${esc(l)}</w:t></w:r></w:p>`,
    ).join('');
  }

  // Generic container — recurse
  let out = '';
  for (const c of node.childNodes) out += blockToWml(c);
  return out;
}

// ─── HTML → WML body ─────────────────────────────────────────────────────────
function htmlToWmlBody(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');

  // Extract content from the editor's page wrappers if present
  const pageInners = doc.querySelectorAll('.word-page-inner');
  let nodes;
  if (pageInners.length > 0) {
    const all = [];
    pageInners.forEach((pi, i) => {
      for (const c of pi.childNodes) all.push(c);
      if (i < pageInners.length - 1) all.push({ _pb: true }); // page break marker
    });
    nodes = all;
  } else {
    nodes = Array.from(doc.body.childNodes);
  }

  let body = '';
  for (const node of nodes) {
    if (node._pb) {
      body += '<w:p><w:r><w:br w:type="page"/></w:r></w:p>';
    } else {
      body += blockToWml(node);
    }
  }

  return body || '<w:p/>';
}

// ─── OOXML file builders ──────────────────────────────────────────────────────
function buildContentTypes(hasHeader, hasFooter, imageExts, hasNumbering) {
  const hdrCT = hasHeader ? '\n  <Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/>' : '';
  const ftrCT = hasFooter ? '\n  <Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>' : '';
  const numCT = hasNumbering ? '\n  <Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>' : '';
  const exts = Array.from(new Set((imageExts || []).filter(Boolean)));
  const imgCT = exts.map(e => `\n  <Default Extension="${e}" ContentType="image/${e === 'jpg' ? 'jpeg' : e}"/>`).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml"  ContentType="application/xml"/>${imgCT}
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml"   ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>${hdrCT}${ftrCT}${numCT}
</Types>`;
}

function buildRels() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;
}

// ─── Header / Footer XML builders ────────────────────────────────────────────
function alignToJc(align) {
  if (align === 'right') return 'right';
  if (align === 'center') return 'center';
  return 'left';
}

function buildHdrFtrRuns(text, rPrXml) {
  if (!text) return `<w:r>${rPrXml}<w:t/></w:r>`;
  const parts = text.split('{pageNumber}');
  let xml = '';
  parts.forEach((part, i) => {
    if (part) xml += `<w:r>${rPrXml}<w:t xml:space="preserve">${esc(part)}</w:t></w:r>`;
    if (i < parts.length - 1) {
      xml += `<w:r>${rPrXml}<w:fldChar w:fldCharType="begin"/></w:r>`;
      xml += `<w:r><w:instrText xml:space="preserve"> PAGE </w:instrText></w:r>`;
      xml += `<w:r>${rPrXml}<w:fldChar w:fldCharType="end"/></w:r>`;
    }
  });
  return xml || `<w:r>${rPrXml}<w:t/></w:r>`;
}

function buildHeaderXml({ text, fontFamily, fontSize, align }) {
  const szVal = Math.round(Number(fontSize) * 2);
  const rPrXml = `<w:rPr><w:rFonts w:ascii="${esc(fontFamily)}" w:hAnsi="${esc(fontFamily)}"/><w:sz w:val="${szVal}"/><w:szCs w:val="${szVal}"/></w:rPr>`;
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:hdr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
       xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <w:p><w:pPr><w:jc w:val="${alignToJc(align)}"/></w:pPr>${buildHdrFtrRuns(text, rPrXml)}</w:p>
</w:hdr>`;
}

// Full-page (A4) letterhead drawing: anchored to the page, behind text, so it
// renders as a repeating background on every page — exactly like the print
// preview's full-page letterhead. 210×297 mm in EMU (1 mm = 36000 EMU).
function letterheadDrawingXml() {
  const cx = 7560000, cy = 10692000;
  return `<w:r><w:drawing>` +
    `<wp:anchor behindDoc="1" distT="0" distB="0" distL="0" distR="0" simplePos="0" locked="0" layoutInCell="1" allowOverlap="1" relativeHeight="0">` +
    `<wp:simplePos x="0" y="0"/>` +
    `<wp:positionH relativeFrom="page"><wp:posOffset>0</wp:posOffset></wp:positionH>` +
    `<wp:positionV relativeFrom="page"><wp:posOffset>0</wp:posOffset></wp:positionV>` +
    `<wp:extent cx="${cx}" cy="${cy}"/><wp:effectExtent l="0" t="0" r="0" b="0"/><wp:wrapNone/>` +
    `<wp:docPr id="100" name="Letterhead"/><wp:cNvGraphicFramePr/>` +
    `<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">` +
    `<a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">` +
    `<pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">` +
    `<pic:nvPicPr><pic:cNvPr id="100" name="Letterhead"/><pic:cNvPicPr/></pic:nvPicPr>` +
    `<pic:blipFill><a:blip r:embed="rIdLetterhead"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>` +
    `<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm>` +
    `<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>` +
    `</pic:pic></a:graphicData></a:graphic></wp:anchor></w:drawing></w:r>`;
}

// Rich header — converts an HTML fragment (e.g. the patient banner: paragraphs
// + a bordered table) into a real Word page header that repeats on every page.
// When hasLetterhead, the full-page letterhead image is anchored behind it.
// Standard Word watermark — a VML textpath shape in the header (repeats on every
// page, behind the body). This is exactly the structure Word itself writes for a
// text watermark, so Word opens it without a repair prompt.
function watermarkVml(text) {
  const s = esc(text);
  return `<w:p><w:r><w:pict>` +
    `<v:shapetype id="_x0000_t136" coordsize="21600,21600" o:spt="136" adj="10800" path="m@7,l@8,m@5,21600l@11,21600e">` +
    `<v:formulas><v:f eqn="sum #0 0 10800"/><v:f eqn="prod #0 2 1"/><v:f eqn="sum 21600 0 @1"/><v:f eqn="sum 0 0 @2"/><v:f eqn="sum 21600 0 @3"/><v:f eqn="if @0 @3 0"/><v:f eqn="if @0 21600 @1"/><v:f eqn="if @0 0 @2"/><v:f eqn="if @0 @4 21600"/><v:f eqn="mid @5 @6"/><v:f eqn="mid @8 @5"/><v:f eqn="mid @10 @11"/><v:f eqn="mid @11 @7"/><v:f eqn="sum @6 0 @5"/></v:formulas>` +
    `<v:path textpathok="t" o:connecttype="custom" o:connectlocs="@9,0;@10,10800;@11,21600;@12,10800" o:connectangles="270,180,90,0"/>` +
    `<v:textpath on="t" fitshape="t"/>` +
    `<v:handles><v:h position="#0,bottomRight" xrange="6629,14971"/></v:handles>` +
    `<o:lock v:ext="edit" text="t" shapetype="t"/>` +
    `</v:shapetype>` +
    `<v:shape id="PowerPlusWaterMarkObject" o:spid="_x0000_s2049" type="#_x0000_t136" ` +
    `style="position:absolute;margin-left:0;margin-top:0;width:415pt;height:207pt;rotation:315;z-index:-251654144;` +
    `mso-position-horizontal:center;mso-position-horizontal-relative:margin;mso-position-vertical:center;mso-position-vertical-relative:margin" ` +
    `o:allowincell="f" fillcolor="#d9d9d9" stroked="f">` +
    `<v:textpath style="font-family:&quot;Calibri&quot;;font-size:1pt" string="${s}"/>` +
    `</v:shape></w:pict></w:r></w:p>`;
}

function buildHeaderXmlFromHtml(headerHtml, hasLetterhead = false, watermark = '') {
  const inner = htmlToWmlBody(headerHtml) || '<w:p/>';
  const bg = hasLetterhead ? `<w:p>${letterheadDrawingXml()}</w:p>` : '';
  const wm = watermark ? watermarkVml(watermark) : '';
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:hdr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
       xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
       xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"
       xmlns:v="urn:schemas-microsoft-com:vml"
       xmlns:o="urn:schemas-microsoft-com:office:office">
  ${wm}${bg}${inner}
</w:hdr>`;
}

// Relationship file linking the header to the embedded letterhead image.
function buildHeaderRels(ext) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rIdLetterhead" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/letterhead.${ext}"/>
</Relationships>`;
}

function buildFooterXml({ text, fontFamily, fontSize, align }) {
  const szVal = Math.round(Number(fontSize) * 2);
  const rPrXml = `<w:rPr><w:rFonts w:ascii="${esc(fontFamily)}" w:hAnsi="${esc(fontFamily)}"/><w:sz w:val="${szVal}"/><w:szCs w:val="${szVal}"/></w:rPr>`;
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
       xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <w:p><w:pPr><w:jc w:val="${alignToJc(align)}"/></w:pPr>${buildHdrFtrRuns(text, rPrXml)}</w:p>
</w:ftr>`;
}

function buildDocumentRels(hasHeader, hasFooter, hasNumbering, images) {
  const hdrRel = hasHeader ? '\n  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/>' : '';
  const ftrRel = hasFooter ? '\n  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/>' : '';
  const numRel = hasNumbering ? '\n  <Relationship Id="rId4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/>' : '';
  const imgRels = (images || []).map(im =>
    `\n  <Relationship Id="${im.rId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/img${im.idx}.${im.ext}"/>`
  ).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>${hdrRel}${ftrRel}${numRel}${imgRels}
</Relationships>`;
}

function buildDocument(bodyWml, hasHeader, hasFooter, margins) {
  const hdrRef = hasHeader ? '\n      <w:headerReference w:type="default" r:id="rId2"/>' : '';
  const ftrRef = hasFooter ? '\n      <w:footerReference w:type="default" r:id="rId3"/>' : '';
  // Page margins from the report protocol (mm). Default 25.4 mm (1 inch) when
  // unset, matching Word's own default.
  const m = margins || {};
  const top    = mmToTwips(m.top    ?? 25.4);
  const right  = mmToTwips(m.right  ?? 25.4);
  const bottom = mmToTwips(m.bottom ?? 25.4);
  const left   = mmToTwips(m.left   ?? 25.4);
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document
  xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
  xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <w:body>
    ${bodyWml}
    <w:sectPr>${hdrRef}${ftrRef}
      <w:pgSz w:w="11906" w:h="16838"/>
      <w:pgMar w:top="${top}" w:right="${right}" w:bottom="${bottom}" w:left="${left}" w:header="720" w:footer="720" w:gutter="0"/>
    </w:sectPr>
  </w:body>
</w:document>`;
}

function buildStyles(defaultFont) {
  const f = defaultFont || {};
  const fam = esc(f.family || 'Calibri');
  const sz = Math.round((Number(f.sizePt) || 12) * 2); // pt → half-points
  const color = cssColorToHex(f.color);
  const colorXml = color ? `<w:color w:val="${color}"/>` : '';
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:docDefaults>
    <w:rPrDefault>
      <w:rPr>
        <w:rFonts w:ascii="${fam}" w:hAnsi="${fam}"/>
        <w:sz w:val="${sz}"/><w:szCs w:val="${sz}"/>${colorXml}
      </w:rPr>
    </w:rPrDefault>
  </w:docDefaults>

  <w:style w:type="paragraph" w:default="1" w:styleId="Normal">
    <w:name w:val="Normal"/>
    <!-- Unified with editor + preview: line-height 1.5 (=360/240) and an 8px
         (~6pt = 120 twip) gap after each paragraph. -->
    <w:pPr><w:spacing w:after="120" w:line="360" w:lineRule="auto"/></w:pPr>
  </w:style>

  <!-- Heading sizes/colours unified with the editor + preview:
       h1 26pt #1F3864 · h2 20pt #2E4D7B · h3 16pt #2E4D7B · h4 14pt #374151. -->
  <w:style w:type="paragraph" w:styleId="Heading1">
    <w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/>
    <w:pPr><w:spacing w:before="0" w:after="120"/><w:outlineLvl w:val="0"/></w:pPr>
    <w:rPr><w:b/><w:bCs/><w:sz w:val="52"/><w:szCs w:val="52"/><w:color w:val="1F3864"/></w:rPr>
  </w:style>

  <w:style w:type="paragraph" w:styleId="Heading2">
    <w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/>
    <w:pPr><w:spacing w:before="180" w:after="80"/><w:outlineLvl w:val="1"/></w:pPr>
    <w:rPr><w:b/><w:bCs/><w:sz w:val="40"/><w:szCs w:val="40"/><w:color w:val="2E4D7B"/></w:rPr>
  </w:style>

  <w:style w:type="paragraph" w:styleId="Heading3">
    <w:name w:val="heading 3"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/>
    <w:pPr><w:spacing w:before="140" w:after="60"/><w:outlineLvl w:val="2"/></w:pPr>
    <w:rPr><w:b/><w:bCs/><w:sz w:val="32"/><w:szCs w:val="32"/><w:color w:val="2E4D7B"/></w:rPr>
  </w:style>

  <w:style w:type="paragraph" w:styleId="Heading4">
    <w:name w:val="heading 4"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/>
    <w:pPr><w:spacing w:before="120" w:after="40"/><w:outlineLvl w:val="3"/></w:pPr>
    <w:rPr><w:b/><w:bCs/><w:sz w:val="28"/><w:szCs w:val="28"/><w:color w:val="374151"/></w:rPr>
  </w:style>

  <w:style w:type="paragraph" w:styleId="ListParagraph">
    <w:name w:val="List Paragraph"/><w:basedOn w:val="Normal"/>
    <w:pPr><w:spacing w:after="0"/><w:ind w:left="720"/><w:contextualSpacing/></w:pPr>
  </w:style>
</w:styles>`;
}

// ─── Public API ───────────────────────────────────────────────────────────────
/**
 * Build a .docx Blob from the editor's HTML, faithfully preserving its format
 * (headings, bold/italic/underline, lists, tables, alignment, colours, fonts,
 * sizes, page breaks). Returned so callers can download it OR hand the bytes
 * to the desktop bridge to launch Microsoft Word.
 * @param {string} html - raw HTML from editor.getHTML()
 * @returns {Promise<Blob>}
 */
export async function buildDocxBlob(html, { header, footer, headerHtml, margins, defaultFont, letterhead, watermark } = {}) {
  // Reset per-document registries, then convert (these populate during walk).
  resetNumbering();
  resetImages();
  // Usable text width (A4 = 11906 twips wide) minus the page margins — tables
  // and images wider than this are scaled down so nothing is cut off the right.
  {
    const m0 = margins || {};
    _maxContentTwips = Math.max(1440, 11906 - mmToTwips(m0.left ?? 25.4) - mmToTwips(m0.right ?? 25.4));
  }
  const bodyWml = htmlToWmlBody(html);

  // A letterhead embeds as a full-page background in the header; a watermark is
  // a VML shape in the header. Either (or a rich/legacy header) means a header.
  const hasLetterhead = !!(letterhead?.bytes && letterhead?.ext);
  const hasHeader = !!(headerHtml || header?.text || watermark || hasLetterhead);
  const hasFooter = !!(footer?.text);

  // Build header/footer WML up front so any images they carry are registered
  // before we emit media files / relationships / content-types.
  const headerXml = hasHeader
    ? ((headerHtml || watermark || hasLetterhead)
        ? buildHeaderXmlFromHtml(headerHtml || '', hasLetterhead, watermark)
        : buildHeaderXml(header))
    : null;
  const footerXml = hasFooter ? buildFooterXml(footer) : null;

  const hasNumbering = _listNums.length > 0;
  const images = _images.slice();
  const imageExts = [...(hasLetterhead ? [letterhead.ext] : []), ...images.map(im => im.ext)];

  const zip = new JSZip();
  zip.file('[Content_Types].xml', buildContentTypes(hasHeader, hasFooter, imageExts, hasNumbering));
  zip.folder('_rels').file('.rels', buildRels());
  const word = zip.folder('word');
  word.file('document.xml', buildDocument(bodyWml, hasHeader, hasFooter, margins));
  word.file('styles.xml', buildStyles(defaultFont));
  word.folder('_rels').file('document.xml.rels', buildDocumentRels(hasHeader, hasFooter, hasNumbering, images));
  if (hasNumbering) word.file('numbering.xml', buildNumberingXml());
  if (headerXml) word.file('header1.xml', headerXml);
  if (footerXml) word.file('footer1.xml', footerXml);
  if (hasLetterhead) {
    word.file(`media/letterhead.${letterhead.ext}`, letterhead.bytes);
    word.folder('_rels').file('header1.xml.rels', buildHeaderRels(letterhead.ext));
  }
  for (const im of images) {
    word.file(`media/img${im.idx}.${im.ext}`, im.bytes);
  }

  return zip.generateAsync({
    type: 'blob',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    compression: 'DEFLATE',
  });
}

/**
 * Convert the editor's HTML to a .docx file and trigger a browser download.
 * @param {string} html     - raw HTML from editor.getHTML()
 * @param {string} filename - download file name (default: radiology-report.docx)
 */
export async function exportToDocx(html, filename = 'radiology-report.docx', opts = {}) {
  const blob = await buildDocxBlob(html, opts);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
