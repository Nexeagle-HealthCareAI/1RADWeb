/**
 * Report quality checker.
 * Analyses the editor's HTML and returns structured findings.
 *
 * Each finding: { type: 'error'|'warning'|'info'|'success', code, message, suggestion }
 */

const REQUIRED_SECTIONS = [
  { key: 'clinical',    patterns: [/clinical\s+h(istory|x)/i, /indication/i, /clinical\s+information/i], label: 'Clinical History / Indication' },
  { key: 'technique',   patterns: [/technique/i],                                                          label: 'Technique' },
  { key: 'findings',    patterns: [/findings/i],                                                           label: 'Findings' },
  { key: 'impression',  patterns: [/impression/i, /conclusion/i],                                         label: 'Impression' },
];

const CRITICAL_TERMS = [
  'hemorrhage', 'hematoma', 'acute infarct', 'active ischemia',
  'pulmonary embolism', 'aortic dissection', 'tension pneumothorax',
  'cardiac tamponade', 'bowel obstruction', 'bowel perforation',
  'active extravasation', 'ruptured', 'cord compression', 'cauda equina',
  'uncal herniation', 'tonsillar herniation', 'critical stenosis',
  'appendicitis', 'intussusception', 'volvulus',
];

/**
 * Run all quality checks against the provided HTML.
 *
 * @param {string} html - Editor HTML
 * @param {{ trackChangeCount?: number, hasUnfilledFields?: boolean }} opts
 * @returns {{ type: string, code: string, message: string, suggestion: string }[]}
 */
export function runQualityCheck(html, { trackChangeCount = 0, hasUnfilledFields = false } = {}) {
  const results = [];
  const tmp = document.createElement('div');
  tmp.innerHTML = html || '';

  const headings    = [...tmp.querySelectorAll('h1, h2, h3')].map(h => h.textContent.trim());
  const headingsLC  = headings.map(h => h.toLowerCase());
  const fullText    = tmp.textContent || '';
  const wordCount   = fullText.trim().split(/\s+/).filter(Boolean).length;

  // ── 1. Required sections ──────────────────────────────────────────────────
  for (const sec of REQUIRED_SECTIONS) {
    const found = headingsLC.some(h => sec.patterns.some(p => p.test(h)));
    if (!found) {
      results.push({
        type: 'error',
        code: `missing-${sec.key}`,
        message: `Missing required section: "${sec.label}"`,
        suggestion: `Add a "${sec.label}" heading to the report.`,
      });
    }
  }

  // ── 2. Impression word count ──────────────────────────────────────────────
  const impressionEl = [...tmp.querySelectorAll('h1, h2, h3')].find(h =>
    /impression|conclusion/i.test(h.textContent)
  );
  if (impressionEl) {
    let text = '';
    let el = impressionEl.nextElementSibling;
    while (el && !/^H[123]$/.test(el.tagName)) {
      text += ' ' + el.textContent;
      el = el.nextElementSibling;
    }
    if (text.trim().split(/\s+/).filter(Boolean).length < 5) {
      results.push({
        type: 'warning',
        code: 'short-impression',
        message: 'Impression section appears very brief (fewer than 5 words).',
        suggestion: 'Ensure the impression summarises all key findings and recommendations.',
      });
    }
  }

  // ── 3. Overall report length ──────────────────────────────────────────────
  if (wordCount > 0 && wordCount < 50) {
    results.push({
      type: 'warning',
      code: 'short-report',
      message: `Report is very short (${wordCount} word${wordCount !== 1 ? 's' : ''}).`,
      suggestion: 'Ensure all required sections have been completed before finalising.',
    });
  }
  if (wordCount === 0) {
    results.push({
      type: 'error',
      code: 'empty-report',
      message: 'Report appears to be empty.',
      suggestion: 'Add content to the report before finalising.',
    });
  }

  // ── 4. Critical / urgent terms ────────────────────────────────────────────
  const lowerText    = fullText.toLowerCase();
  const foundCritical = CRITICAL_TERMS.filter(t => lowerText.includes(t));
  if (foundCritical.length > 0) {
    const listed = foundCritical.slice(0, 3).join(', ') + (foundCritical.length > 3 ? ` (+${foundCritical.length - 3} more)` : '');
    results.push({
      type: 'info',
      code: 'critical-terms',
      message: `Critical / urgent term(s) detected: ${listed}.`,
      suggestion: 'Ensure direct communication with the referring clinician has been documented or is planned.',
    });
  }

  // ── 5. Unresolved track changes ───────────────────────────────────────────
  if (trackChangeCount > 0) {
    results.push({
      type: 'warning',
      code: 'pending-track-changes',
      message: `${trackChangeCount} unresolved tracked change${trackChangeCount !== 1 ? 's' : ''} remain in the report.`,
      suggestion: 'Accept or reject all tracked changes before finalising.',
    });
  }

  // ── 6. Unfilled structured fields ─────────────────────────────────────────
  if (hasUnfilledFields) {
    results.push({
      type: 'warning',
      code: 'unfilled-fields',
      message: 'One or more structured field placeholders have not been filled in.',
      suggestion: 'Click each blue field chip and enter the appropriate value.',
    });
  }

  // ── 7. Duplicate headings ─────────────────────────────────────────────────
  const seenHeadings = new Set();
  for (const h of headingsLC) {
    if (seenHeadings.has(h)) {
      results.push({
        type: 'warning',
        code: 'duplicate-heading',
        message: `Heading "${h}" appears more than once.`,
        suggestion: 'Consider merging duplicate sections for clarity.',
      });
      break; // report once only
    }
    seenHeadings.add(h);
  }

  // ── 8. All clear ──────────────────────────────────────────────────────────
  const hasErrors   = results.some(r => r.type === 'error');
  const hasWarnings = results.some(r => r.type === 'warning');
  if (!hasErrors && !hasWarnings) {
    results.push({
      type: 'success',
      code: 'ok',
      message: 'Report structure is complete — no errors or warnings.',
      suggestion: '',
    });
  }

  return results;
}
