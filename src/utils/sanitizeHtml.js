// ════════════════════════════════════════════════════════════════════════════
//  sanitizeHtml.js — single source of truth for rendering untrusted/report HTML.
//
//  Report content (findings/impression/advice), AI-formatter output, and the
//  anonymous public tracker all render stored HTML. Without sanitization a report
//  body can carry <img onerror>, <svg onload>, <script>, javascript: URLs, etc.
//  and execute in any viewer's browser (including unauthenticated patients).
//  Every dangerouslySetInnerHTML and every document.write of report HTML MUST
//  pass through sanitizeReportHtml first.
// ════════════════════════════════════════════════════════════════════════════
import DOMPurify from 'dompurify';

// Strict allow-list: keep the rich-text formatting reports rely on (paragraphs,
// lists, tables, basic styling, images) but strip anything executable. The HTML
// profile disallows SVG/MathML entirely (kills <svg onload>); FORBID_* and the
// URI regexp are belt-and-suspenders on top of DOMPurify's defaults.
const CONFIG = {
  USE_PROFILES: { html: true },
  FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'form', 'base', 'link', 'meta', 'style'],
  FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover', 'onmouseenter', 'onfocus', 'onblur', 'onanimationstart', 'onanimationend', 'ontoggle', 'srcdoc'],
  // data-* are inert (not a script vector) and the report pagination/spacing
  // relies on them (data-page-break, data-spacing-before/after), so keep them.
  ALLOW_DATA_ATTR: true,
  // Only http(s)/mailto/tel and protocol-relative; blocks javascript:/data:.
  ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|tel):|[^a-z]|[a-z+.-]+(?:[^a-z+.\-:]|$))/i,
};

// Sanitize report / clinical HTML for safe rendering or printing. Returns a
// clean HTML string (never null). Use everywhere report HTML is injected.
export function sanitizeReportHtml(dirty) {
  if (dirty == null) return '';
  return DOMPurify.sanitize(String(dirty), CONFIG);
}

// Convenience for dangerouslySetInnerHTML props: sanitizeMarkup(html) → { __html }.
export function sanitizeMarkup(dirty) {
  return { __html: sanitizeReportHtml(dirty) };
}

export default sanitizeReportHtml;
