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
    const t = esc(node.textContent);
    if (!t) return '';
    return `<w:r>${buildRPr(marks)}<w:t xml:space="preserve">${t}</w:t></w:r>`;
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
  else if (tag === 'span') {
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
  } else if (tag === 'a') {
    m.u = true;
    m.color = '0078D4';
  } else if (tag === 'code') {
    m.font = 'Courier New';
  }

  let out = '';
  for (const c of node.childNodes) out += textRuns(c, m);
  return out;
}

// ─── List item paragraph ──────────────────────────────────────────────────────
function makeLiPara(inline, isBullet, ilvl, counter) {
  const indent = (ilvl + 1) * 720;
  const prefix = isBullet
    ? `<w:r><w:t xml:space="preserve">• </w:t></w:r>`
    : `<w:r><w:t xml:space="preserve">${counter}. </w:t></w:r>`;
  return `<w:p><w:pPr><w:ind w:left="${indent}" w:hanging="360"/></w:pPr>${prefix}${inline}</w:p>`;
}

function listToWml(listEl, isBullet, ilvl) {
  let out = '';
  let counter = 1;
  for (const child of listEl.childNodes) {
    if (child.nodeType !== 1 || child.tagName.toLowerCase() !== 'li') continue;

    // Gather direct inline content, separating nested lists
    let inline = '';
    for (const n of child.childNodes) {
      const t = n.tagName?.toLowerCase();
      if (t !== 'ul' && t !== 'ol') inline += textRuns(n, {});
    }

    out += makeLiPara(inline, isBullet, ilvl, counter);
    if (!isBullet) counter++;

    // Process nested lists
    for (const n of child.childNodes) {
      const t = n.tagName?.toLowerCase();
      if (t === 'ul') out += listToWml(n, true,  ilvl + 1);
      if (t === 'ol') out += listToWml(n, false, ilvl + 1);
    }
  }
  return out;
}

// ─── Table ────────────────────────────────────────────────────────────────────
function tableToWml(table) {
  const borderAttr = (side) =>
    `<w:${side} w:val="single" w:sz="4" w:color="auto"/>`;
  const borders = `<w:tblBorders>${
    ['top','left','bottom','right','insideH','insideV'].map(borderAttr).join('')
  }</w:tblBorders>`;

  let wml = `<w:tbl><w:tblPr><w:tblW w:w="5000" w:type="pct"/>${borders}</w:tblPr>`;

  // Support both <table><tr> and <table><tbody><tr>
  const rows = Array.from(table.querySelectorAll('tr')).filter(
    r => r.closest('table') === table,
  );

  for (const row of rows) {
    wml += '<w:tr>';
    const cells = row.querySelectorAll(':scope > td, :scope > th');
    for (const cell of cells) {
      const isHeader = cell.tagName.toLowerCase() === 'th';
      wml += '<w:tc>';
      if (isHeader) wml += '<w:tcPr><w:shd w:val="clear" w:color="auto" w:fill="D9D9D9"/></w:tcPr>';

      // Try block children first, then fall back to inline
      let cellWml = '';
      for (const c of cell.childNodes) cellWml += blockToWml(c);
      if (!cellWml.includes('<w:p')) {
        cellWml = `<w:p>${textRuns(cell, isHeader ? { b: true } : {})}</w:p>`;
      }
      wml += cellWml + '</w:tc>';
    }
    wml += '</w:tr>';
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
    const ml = parseInt(st.marginLeft || '0');
    if (ml > 0) ppr += `<w:ind w:left="${Math.round(ml / 96 * 1440)}"/>`;
    return `<w:p>${ppr ? `<w:pPr>${ppr}</w:pPr>` : ''}${textRuns(node, {})}</w:p>`;
  }

  // Horizontal rule
  if (tag === 'hr') {
    return '<w:p><w:pPr><w:pBdr><w:bottom w:val="single" w:sz="4" w:sp="1" w:color="auto"/></w:pBdr></w:pPr></w:p>';
  }

  // Lists
  if (tag === 'ul') return listToWml(node, true,  0);
  if (tag === 'ol') return listToWml(node, false, 0);

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
function buildContentTypes(hasHeader, hasFooter) {
  const hdrCT = hasHeader ? '\n  <Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/>' : '';
  const ftrCT = hasFooter ? '\n  <Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>' : '';
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml"  ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml"   ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>${hdrCT}${ftrCT}
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

function buildFooterXml({ text, fontFamily, fontSize, align }) {
  const szVal = Math.round(Number(fontSize) * 2);
  const rPrXml = `<w:rPr><w:rFonts w:ascii="${esc(fontFamily)}" w:hAnsi="${esc(fontFamily)}"/><w:sz w:val="${szVal}"/><w:szCs w:val="${szVal}"/></w:rPr>`;
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
       xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <w:p><w:pPr><w:jc w:val="${alignToJc(align)}"/></w:pPr>${buildHdrFtrRuns(text, rPrXml)}</w:p>
</w:ftr>`;
}

function buildDocumentRels(hasHeader, hasFooter) {
  const hdrRel = hasHeader ? '\n  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/>' : '';
  const ftrRel = hasFooter ? '\n  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/>' : '';
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>${hdrRel}${ftrRel}
</Relationships>`;
}

function buildDocument(bodyWml, hasHeader, hasFooter) {
  const hdrRef = hasHeader ? '\n      <w:headerReference w:type="default" r:id="rId2"/>' : '';
  const ftrRef = hasFooter ? '\n      <w:footerReference w:type="default" r:id="rId3"/>' : '';
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document
  xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
  xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <w:body>
    ${bodyWml}
    <w:sectPr>${hdrRef}${ftrRef}
      <w:pgSz w:w="12240" w:h="15840"/>
      <w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/>
    </w:sectPr>
  </w:body>
</w:document>`;
}

function buildStyles() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:docDefaults>
    <w:rPrDefault>
      <w:rPr>
        <w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/>
        <w:sz w:val="24"/><w:szCs w:val="24"/>
      </w:rPr>
    </w:rPrDefault>
  </w:docDefaults>

  <w:style w:type="paragraph" w:default="1" w:styleId="Normal">
    <w:name w:val="Normal"/>
    <w:pPr><w:spacing w:after="160" w:line="276" w:lineRule="auto"/></w:pPr>
  </w:style>

  <w:style w:type="paragraph" w:styleId="Heading1">
    <w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/>
    <w:pPr><w:spacing w:before="240" w:after="60"/><w:outlineLvl w:val="0"/></w:pPr>
    <w:rPr>
      <w:rFonts w:ascii="Calibri Light" w:hAnsi="Calibri Light"/>
      <w:b/><w:bCs/><w:sz w:val="40"/><w:szCs w:val="40"/>
      <w:color w:val="2F3645"/>
    </w:rPr>
  </w:style>

  <w:style w:type="paragraph" w:styleId="Heading2">
    <w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/>
    <w:pPr><w:spacing w:before="200" w:after="40"/><w:outlineLvl w:val="1"/></w:pPr>
    <w:rPr>
      <w:rFonts w:ascii="Calibri Light" w:hAnsi="Calibri Light"/>
      <w:b/><w:bCs/><w:sz w:val="32"/><w:szCs w:val="32"/>
      <w:color w:val="2E74B5"/>
    </w:rPr>
  </w:style>

  <w:style w:type="paragraph" w:styleId="Heading3">
    <w:name w:val="heading 3"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/>
    <w:pPr><w:spacing w:before="160" w:after="40"/><w:outlineLvl w:val="2"/></w:pPr>
    <w:rPr>
      <w:b/><w:bCs/><w:sz w:val="28"/><w:szCs w:val="28"/>
      <w:color w:val="1F3864"/>
    </w:rPr>
  </w:style>

  <w:style w:type="paragraph" w:styleId="Heading4">
    <w:name w:val="heading 4"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/>
    <w:pPr><w:spacing w:before="120" w:after="40"/><w:outlineLvl w:val="3"/></w:pPr>
    <w:rPr><w:b/><w:bCs/><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr>
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
export async function buildDocxBlob(html, { header, footer } = {}) {
  const bodyWml = htmlToWmlBody(html);
  const hasHeader = !!(header?.text);
  const hasFooter = !!(footer?.text);

  const zip = new JSZip();
  zip.file('[Content_Types].xml', buildContentTypes(hasHeader, hasFooter));
  zip.folder('_rels').file('.rels', buildRels());
  const word = zip.folder('word');
  word.file('document.xml', buildDocument(bodyWml, hasHeader, hasFooter));
  word.file('styles.xml', buildStyles());
  word.folder('_rels').file('document.xml.rels', buildDocumentRels(hasHeader, hasFooter));
  if (hasHeader) word.file('header1.xml', buildHeaderXml(header));
  if (hasFooter) word.file('footer1.xml', buildFooterXml(footer));

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
