import React, { useRef, useState, useEffect, useCallback, useImperativeHandle } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import { StarterKit } from '@tiptap/starter-kit';
import { UnderlineStyle } from './extensions/UnderlineStyle';
import { TextAlign } from '@tiptap/extension-text-align';
import { TextStyle } from '@tiptap/extension-text-style';
import { Color } from '@tiptap/extension-color';
import { Highlight } from '@tiptap/extension-highlight';
import { Image } from '@tiptap/extension-image';
import { Table } from '@tiptap/extension-table';
import { TableRow } from '@tiptap/extension-table-row';
import { TableCell } from '@tiptap/extension-table-cell';
import { TableHeader } from '@tiptap/extension-table-header';

// Extend TableCell to support per-cell background colour.
const CustomTableCell = TableCell.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      backgroundColor: {
        default: null,
        renderHTML: attrs => (!attrs.backgroundColor ? {} : { style: `background-color: ${attrs.backgroundColor}` }),
        parseHTML: el => el.style.backgroundColor || null,
      },
    };
  },
});
import { Placeholder } from '@tiptap/extension-placeholder';
import { CharacterCount } from '@tiptap/extension-character-count';
import { Extension, Mark, InputRule } from '@tiptap/core';
import EditorToolbar from './EditorToolbar';
import Ribbon from './Ribbon';
import MobileToolbar from './MobileToolbar';
import SlashMenu from './SlashMenu';
import TermAutocomplete from './TermAutocomplete';
import SelectionToolbar from './SelectionToolbar';
import { PageDocument, Page } from './extensions/PageNode';
import { Pagination } from './extensions/Pagination';
import { FlatDocument, PageBreakNode } from './extensions/FlatDocument';
import { PaginationDecoration, getPrintHTML as getPaginatedPrintHTML, getContinuousPrintHTML } from './extensions/PaginationDecoration';
import { LineHeight, ParagraphIndent, PageBreak, ParagraphSpacing } from './extensions/Spacing';
import { FormatPainter } from './extensions/FormatPainter';
import { ParagraphFraming } from './extensions/ParagraphFraming';
import { ListStyles } from './extensions/ListStyles';
import { Sort } from './extensions/Sort';
import { MultilevelList } from './extensions/MultilevelList';
import { PageNumber } from './extensions/PageNumberNode';
import { AutoCorrect } from './extensions/AutoCorrect';
import Footnote from './extensions/Footnote';
import { GrammarCheck, buildOffsetMap, buildGrammarDecorations } from './extensions/GrammarCheck';
import { SpellCheck, buildSpellDecorations, buildSpellDecorationsForRange, spellCheckKey } from './extensions/SpellCheck';
import { DecorationSet } from '@tiptap/pm/view';
import SpellSuggestionPopup from './SpellSuggestionPopup';
import { warmSpellDictionary, isWordValid } from '../../data/spellDictionary';
import apiClient from '../../api/apiClient';
import { TrackInsert, TrackDelete, TrackChanges } from './extensions/TrackChanges';
import { CommentMark, Comment } from './extensions/Comment';
import { MedicalAutocomplete } from './extensions/MedicalAutocomplete';
import { StructuredField } from './extensions/StructuredField';
import { SearchHighlight } from './extensions/SearchReplace';
import { Callout, Columns } from './extensions/Blocks';
import TableToolbar from './TableToolbar';
import ImageToolbar from './ImageToolbar';
import ContextMenu from './ContextMenu';
import FindReplaceDialog from './dialogs/FindReplaceDialog';
import SymbolPickerDialog from './dialogs/SymbolPickerDialog';
import PromptDialog, { editorPrompt, editorPromptAtCursor } from './dialogs/PromptDialog';
import ShortcutsDialog from './dialogs/ShortcutsDialog';
import FontDialog from './dialogs/FontDialog';
import ParagraphDialog from './dialogs/ParagraphDialog';
import HeaderFooterDialog from './dialogs/HeaderFooterDialog';
import ReportTemplatesDialog from './dialogs/ReportTemplatesDialog';
import VersionHistoryDialog, { loadVersions, persistVersions, addVersion, removeVersion } from './dialogs/VersionHistoryDialog';
import CommentsPanel from './dialogs/CommentsPanel';
import NormalFindingsDialog from './dialogs/NormalFindingsDialog';
import RadsDialog from './dialogs/RadsDialog';
import FinalizeDialog from './dialogs/FinalizeDialog';
import MeasurementDialog from './dialogs/MeasurementDialog';
import QualityCheckPanel from './dialogs/QualityCheckPanel';
import SnippetManagerDialog from './dialogs/SnippetManagerDialog';
import AddendumDialog from './dialogs/AddendumDialog';
import HorizontalRuler from './HorizontalRuler';
import OnboardingHints from './OnboardingHints';
import { FONT_SIZES } from './Ribbon/RibbonControls';
import { useVoiceDictation } from './hooks/useVoiceDictation';
import { exportToDocx } from './utils/exportDocx';
import PrintPreviewModal from './PrintPreviewModal';
import { countFlatPages } from './utils/printReport';
import { runQualityCheck } from './utils/reportQuality';
import { loadSnippets, saveSnippets } from './data/snippetStorage';
import './NarrativeEditor.css';

/**
 * Wrap raw HTML content in a <div class="word-page"> if it isn't already.
 * Ensures the editor's schema (doc -> page+) accepts legacy flat-HTML reports.
 *
 * Flat-schema note: when USE_FLAT_SCHEMA is on (pageview OR continuous), the
 * schema is doc → block+ — wrapping in .word-page would create an unparseable
 * node. We strip the wrappers if they're there (legacy content from a Path A
 * save) and return the inner content, letting the standard block schema
 * handle it. Round-tripping back to Path A would need the wrappers; the flat
 * schema is a one-way upgrade once flipped on.
 */
function ensurePagedHTML(html) {
  const trimmed = (html || '').trim();
  if (USE_FLAT_SCHEMA) {
    if (!trimmed) return '<p></p>';
    // Strip outer .word-page / .word-page-inner wrappers (legacy Path A
    // content). Use a permissive regex — we just want their CHILDREN to
    // flow into the flat doc. A DOM-based unwrap would be more correct
    // for malformed input but rolldown rejected DOMParser at module init.
    return trimmed
      .replace(/<div[^>]*class="[^"]*word-page-inner[^"]*"[^>]*>([\s\S]*?)<\/div>/gi, '$1')
      .replace(/<div[^>]*class="[^"]*word-page[^"]*"[^>]*>([\s\S]*?)<\/div>/gi, '$1');
  }
  if (!trimmed) return '<div class="word-page"><div class="word-page-inner"><p></p></div></div>';
  // Already paginated
  if (/^<div[^>]*class="[^"]*word-page[^"]*"/i.test(trimmed)) return trimmed;
  return `<div class="word-page"><div class="word-page-inner">${trimmed}</div></div>`;
}

// ── Custom extensions ────────────────────────────────────────────────────────

const FontSize = Extension.create({
  name: 'fontSize',
  addOptions() { return { types: ['textStyle'] }; },
  addGlobalAttributes() {
    return [{
      types: this.options.types,
      attributes: {
        fontSize: {
          default: null,
          parseHTML: el => el.style.fontSize || null,
          renderHTML: attrs => attrs.fontSize ? { style: `font-size: ${attrs.fontSize}` } : {},
        },
      },
    }];
  },
  addCommands() {
    return {
      setFontSize: size => ({ chain }) => chain().setMark('textStyle', { fontSize: size }).run(),
      unsetFontSize: () => ({ chain }) => chain().setMark('textStyle', { fontSize: null }).removeEmptyTextStyle().run(),
    };
  },
});

// TextGradient — paints selected text with a CSS linear-gradient instead of
// a solid colour. Adds a `textGradient` attribute on textStyle marks; the
// renderHTML cascade sets background + background-clip:text + transparent
// text-fill so the gradient shows through the glyphs.
const TextGradient = Extension.create({
  name: 'textGradient',
  addOptions() { return { types: ['textStyle'] }; },
  addGlobalAttributes() {
    return [{
      types: this.options.types,
      attributes: {
        textGradient: {
          default: null,
          parseHTML: el => el.getAttribute('data-text-gradient') || null,
          renderHTML: attrs => {
            if (!attrs.textGradient) return {};
            // Stack a few CSS properties so the gradient masks the text.
            const css = [
              `background-image:${attrs.textGradient}`,
              'background-clip:text',
              '-webkit-background-clip:text',
              'color:transparent',
              '-webkit-text-fill-color:transparent',
            ].join(';');
            return {
              'data-text-gradient': attrs.textGradient,
              style: css,
            };
          },
        },
      },
    }];
  },
  addCommands() {
    return {
      setTextGradient: gradient => ({ chain }) =>
        // Clearing the solid colour at the same time avoids a stale `color:#..`
        // bleed-through when applying a gradient over previously coloured text.
        chain().setMark('textStyle', { textGradient: gradient, color: null }).run(),
      unsetTextGradient: () => ({ chain }) =>
        chain().setMark('textStyle', { textGradient: null }).removeEmptyTextStyle().run(),
    };
  },
});

const FontFamily = Extension.create({
  name: 'fontFamily',
  addOptions() { return { types: ['textStyle'] }; },
  addGlobalAttributes() {
    return [{
      types: this.options.types,
      attributes: {
        fontFamily: {
          default: null,
          parseHTML: el => el.style.fontFamily?.replace(/['"]/g, '') || null,
          renderHTML: attrs => attrs.fontFamily ? { style: `font-family: ${attrs.fontFamily}` } : {},
        },
      },
    }];
  },
  addCommands() {
    return {
      setFontFamily: family => ({ chain }) => chain().setMark('textStyle', { fontFamily: family }).run(),
      unsetFontFamily: () => ({ chain }) => chain().setMark('textStyle', { fontFamily: null }).removeEmptyTextStyle().run(),
    };
  },
});

const Subscript = Mark.create({
  name: 'subscript',
  excludes: 'superscript',
  parseHTML() { return [{ tag: 'sub' }]; },
  renderHTML({ HTMLAttributes }) { return ['sub', HTMLAttributes, 0]; },
  addCommands() {
    return { toggleSubscript: () => ({ commands }) => commands.toggleMark(this.name) };
  },
  addKeyboardShortcuts() {
    return { 'Mod-,': () => this.editor.commands.toggleSubscript() };
  },
});

const Superscript = Mark.create({
  name: 'superscript',
  excludes: 'subscript',
  parseHTML() { return [{ tag: 'sup' }]; },
  renderHTML({ HTMLAttributes }) { return ['sup', HTMLAttributes, 0]; },
  addCommands() {
    return { toggleSuperscript: () => ({ commands }) => commands.toggleMark(this.name) };
  },
  addKeyboardShortcuts() {
    return { 'Mod-.': () => this.editor.commands.toggleSuperscript() };
  },
});

const Link = Mark.create({
  name: 'link',
  inclusive: false,
  addAttributes() {
    return {
      href: { default: null },
      target: { default: '_blank' },
    };
  },
  parseHTML() { return [{ tag: 'a[href]' }]; },
  renderHTML({ HTMLAttributes }) {
    return ['a', { ...HTMLAttributes, style: 'color:#0078d4;text-decoration:underline;cursor:pointer' }, 0];
  },
  addCommands() {
    return {
      setLink: attrs => ({ chain }) => chain().setMark(this.name, attrs).run(),
      unsetLink: () => ({ chain }) => chain().unsetMark(this.name).run(),
    };
  },
});

// ── Typography auto-replace: smart quotes ────────────────────────────────
// AutoCorrect already handles em-dash, ellipsis, fractions, arrows on Space/
// Enter. Typography adds the one thing AutoCorrect doesn't cover: curly-
// quote substitution as the closing character is typed. Loaded HTML and
// pasted content are left untouched (InputRules fire only on typed chars).
const Typography = Extension.create({
  name: 'typography',
  addOptions() { return { enabled: true }; },
  addInputRules() {
    if (!this.options.enabled) return [];
    return [
      new InputRule({ find: /(^|[\s\(\[\{<])"$/, handler: ({ range, match, commands }) => {
        commands.command(({ tr }) => { tr.insertText(`${match[1]}“`, range.from, range.to); return true; });
      }}),
      new InputRule({ find: /(\S)"$/, handler: ({ range, match, commands }) => {
        commands.command(({ tr }) => { tr.insertText(`${match[1]}”`, range.from, range.to); return true; });
      }}),
      new InputRule({ find: /(^|[\s\(\[\{<])'$/, handler: ({ range, match, commands }) => {
        commands.command(({ tr }) => { tr.insertText(`${match[1]}‘`, range.from, range.to); return true; });
      }}),
      new InputRule({ find: /(\S)'$/, handler: ({ range, match, commands }) => {
        commands.command(({ tr }) => { tr.insertText(`${match[1]}’`, range.from, range.to); return true; });
      }}),
    ];
  },
});

// ── Report structure: one-key IMPRESSION list ───────────────────────────────
// Every radiology report ends with a numbered impression. This drops in a bold
// "IMPRESSION:" label + an auto-numbered list with the cursor in the first item,
// so the radiologist types point 1, Enter → point 2 (auto-numbered), etc. The
// ordered list auto-renumbers on add/remove/reorder — better than hand-typed
// "1." "2.". Bound to Ctrl+Alt+I and the Insert-tab button.
const ReportStructure = Extension.create({
  name: 'reportStructure',
  addCommands() {
    return {
      insertImpressionList: () => ({ chain }) =>
        chain()
          .focus()
          // H2 "Impression" matches the other Insert-tab report sections; the
          // trailing empty paragraph becomes the first numbered list item.
          .insertContent([
            { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Impression' }] },
            { type: 'paragraph' },
          ])
          .toggleOrderedList()
          .run(),
    };
  },
});

// ── Helpers used by the shortcut handler ─────────────────────────────────────

function cycleFontSize(editor, delta) {
  const attrs = editor.getAttributes('textStyle') || {};
  const current = (attrs.fontSize || '12pt').replace('pt', '');
  let idx = FONT_SIZES.indexOf(current);
  if (idx < 0) idx = FONT_SIZES.indexOf('12');
  const nextIdx = Math.max(0, Math.min(FONT_SIZES.length - 1, idx + delta));
  const next = FONT_SIZES[nextIdx];
  editor.chain().focus().setMark('textStyle', { fontSize: `${next}pt` }).run();
}

function resetParagraph(editor) {
  editor.chain().focus()
    .setTextAlign('left')
    .unsetLineHeight()
    .setParagraph()
    .unsetAllMarks()
    .run();
  // Also clear our paragraph indent if present
  try {
    editor.chain().focus().decreaseParagraphIndent().decreaseParagraphIndent().decreaseParagraphIndent().run();
  } catch {}
}

/**
 * Shift+F3 — cycle selection case: Mixed → ALL UPPER → all lower → Title Case → …
 */
function toggleCase(editor) {
  const { state } = editor;
  const { from, to, empty } = state.selection;
  if (empty) return;
  const selected = state.doc.textBetween(from, to, '\n');
  const hasLower = /[a-z]/.test(selected);
  const hasUpper = /[A-Z]/.test(selected);
  let transform;
  if (hasLower && hasUpper) {
    transform = s => s.toUpperCase();
  } else if (hasUpper && !hasLower) {
    transform = s => s.toLowerCase();
  } else {
    transform = s => s.replace(/\b\w/g, c => c.toUpperCase());
  }
  const replacements = [];
  state.doc.nodesBetween(from, to, (node, pos) => {
    if (!node.isText) return true;
    const nFrom = Math.max(from, pos);
    const nTo   = Math.min(to, pos + node.nodeSize);
    const text  = node.text.slice(nFrom - pos, nTo - pos);
    const next  = transform(text);
    if (text !== next) replacements.push({ from: nFrom, to: nTo, text: next, marks: node.marks });
  });
  if (!replacements.length) return;
  const tr = state.tr;
  for (let i = replacements.length - 1; i >= 0; i--) {
    const r = replacements[i];
    tr.replaceWith(r.from, r.to, state.schema.text(r.text, r.marks));
  }
  editor.view.dispatch(tr);
}

/**
 * Alt+Shift+↑/↓ — swap the current block with the one above/below it.
 */
function moveBlockVertically(editor, direction) {
  const { state } = editor;
  const { $from } = state.selection;
  // The container whose top-level blocks we reorder: the PAGE node on Path A, or
  // the DOC itself on the flat schema (continuous/pageview have no page node).
  // Previously this hardcoded depth 1 (the page) and bailed on $from.depth < 2,
  // so it silently did nothing in the flat schema where blocks sit at depth 1.
  const containerDepth = state.schema.nodes.page ? 1 : 0;
  if ($from.depth <= containerDepth) return; // cursor not inside a top-level block
  const container = $from.node(containerDepth);
  const blockIdx  = $from.index(containerDepth);
  const sibIdx    = direction === 'up' ? blockIdx - 1 : blockIdx + 1;
  if (sibIdx < 0 || sibIdx >= container.childCount) return;
  const lowerIdx  = Math.min(blockIdx, sibIdx);
  // First position inside the container's content: 0 for the doc, else just
  // after the container node's opening token.
  let lowerPos = containerDepth === 0 ? 0 : $from.before(containerDepth) + 1;
  for (let i = 0; i < lowerIdx; i++) lowerPos += container.child(i).nodeSize;
  const lowerBlock = container.child(lowerIdx);
  const upperBlock = container.child(lowerIdx + 1);
  const rangeEnd   = lowerPos + lowerBlock.nodeSize + upperBlock.nodeSize;
  const tr = state.tr.replaceWith(lowerPos, rangeEnd, [upperBlock, lowerBlock]);
  tr.scrollIntoView();
  editor.view.dispatch(tr);
}

// ── Main component ────────────────────────────────────────────────────────────

const ZOOM_LEVELS = [50, 75, 90, 100, 110, 125, 150, 200];

// Feature flag — Path B (decoration-based pagination). When ON, the editor
// uses FlatDocument + PaginationDecoration instead of PageDocument + Page +
// Pagination. The visual identity stays the same (stacked A4 sheets), but
// pagination becomes a visual overlay instead of document mutation, which
// eliminates typing jank and undo flicker.
//
// Flip in DevTools to test:
//   localStorage.setItem('narrative-editor:decoration-pagination', '1')
//   localStorage.removeItem('narrative-editor:decoration-pagination')
//
// Default is OFF — Path A continues to ship until Path B is validated for
// header/footer rendering and print/PDF parity.
// Pagination model. Path A (default) = distinct A4 page SHEETS that content
// flows across (page 1 → page 2 → …), exactly like Word's print layout. The old
// "editor pages ≠ Word pages" divergence was a METRICS problem (font unit, line
// height, spacing, margins) — now unified in Phase 1 — not a model problem, so
// the flowing-sheet model is the right one. The true-Word preview (docx-preview)
// remains the authoritative paginated output.
// ── Editing model (3-way) ───────────────────────────────────────────────────
//   'paged'      — Path A: distinct A4 page SHEETS, content flows across them
//                  by MUTATING the document (PageDocument + Pagination). Legacy
//                  default. Source of the typing jank / undo flicker.
//   'pageview'   — Path B: flat doc + DECORATION overlay draws the page gaps
//                  (no document mutation). Keeps the sheet look, smoother.
//   'continuous' — Option 2: flat doc rendered as ONE continuous A4-width paper
//                  column. NO pagination work happens while editing at all —
//                  pagination is computed only at print/preview time. The
//                  smoothest typing surface (Word "pageless" / Google Docs
//                  pageless). Page breaks are still insertable (Ctrl+Enter) and
//                  honoured on print.
//
// Set via DevTools, then reload:
//   localStorage.setItem('narrative-editor:mode', 'continuous')   // or 'pageview' / 'paged'
//   localStorage.removeItem('narrative-editor:mode')              // back to default
// Legacy flag 'narrative-editor:decoration-pagination'='1' still maps to 'pageview'.
function resolveEditingMode() {
  try {
    const m = window.localStorage?.getItem('narrative-editor:mode');
    if (m === 'continuous' || m === 'pageview' || m === 'paged') return m;
    if (window.localStorage?.getItem('narrative-editor:decoration-pagination') === '1') return 'pageview';
  } catch { /* SSR / blocked storage */ }
  // DEFAULT = continuous (Option 2): pageless A4-width editing surface, A4
  // pagination computed only at print/preview. Per-browser escape hatch:
  // localStorage 'narrative-editor:mode' = 'paged' (legacy sheets) or 'pageview'.
  // Global revert is this one line. Legacy paged reports load fine — their
  // .word-page wrappers are stripped by ensurePagedHTML for the flat schema.
  return 'continuous';
}
const EDITING_MODE = typeof window !== 'undefined' ? resolveEditingMode() : 'continuous';
const USE_CONTINUOUS = EDITING_MODE === 'continuous';
const USE_DECORATION_PAGINATION = EDITING_MODE === 'pageview';
// Both non-legacy modes use the flat (doc → block+) schema; only the legacy
// 'paged' mode uses the page-node schema.
const USE_FLAT_SCHEMA = USE_CONTINUOUS || USE_DECORATION_PAGINATION;

// ── Tab-through report fields ──────────────────────────────────────────────
// Jump the selection between fill-in placeholders so a radiologist can fly
// through a template like PowerScribe/Word form fields. A field is bracketed
// text "[like this]" or a run of 3+ underscores/asterisks. F2 = next, Shift+F2
// = previous (wrapping around the document). Selecting the field means the next
// keystroke (or dictated phrase) replaces it.
const FIELD_RE = /\[[^\][\n]{0,80}\]|_{3,}|\*{3,}/g;
function collectReportFields(doc) {
  const fields = [];
  doc.descendants((node, pos) => {
    if (!node.isText || !node.text) return;
    FIELD_RE.lastIndex = 0;
    let m;
    while ((m = FIELD_RE.exec(node.text)) !== null) {
      fields.push({ from: pos + m.index, to: pos + m.index + m[0].length });
    }
  });
  return fields;
}
function jumpReportField(editor, dir = 1) {
  if (!editor) return false;
  const fields = collectReportFields(editor.state.doc);
  if (!fields.length) return false;
  const sel = editor.state.selection;
  let target;
  if (dir >= 0) {
    target = fields.find(f => f.from >= sel.to) || fields[0];                 // wrap to first
  } else {
    const before = fields.filter(f => f.to <= sel.from);
    target = before.length ? before[before.length - 1] : fields[fields.length - 1]; // wrap to last
  }
  editor.chain().focus().setTextSelection({ from: target.from, to: target.to }).scrollIntoView().run();
  return true;
}

// Diagonal page watermark as a tiled SVG background (shows behind text on
// screen AND print). Applied per .word-page so it repeats on every page.
function wmEscape(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function watermarkBackground(text) {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='520' height='360'>` +
    `<text x='260' y='190' fill='rgba(15,23,42,0.07)' font-family='Arial, sans-serif' ` +
    `font-size='52' font-weight='700' text-anchor='middle' transform='rotate(-32 260 180)'>` +
    `${wmEscape(text)}</text></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

/**
 * NarrativeEditor
 * Clinical rich-text editor based on Tiptap.
 * In React 19, ref is passed as a standard prop.
 */
const NarrativeEditor = React.forwardRef(function NarrativeEditor({
  content = '',
  onChange,
  placeholder = 'Start typing your radiology report...',
  editable = true,
  onSave,
  onPrint,
  className = '',
  style = {},
  keywordLibrary = [],
  // Protocol-driven A4 margins in millimetres: { top, right, bottom, left }.
  // When supplied, they override the default 1-inch (96 px) margins and drive
  // both the writable area (.word-page-inner padding) and the dark margin
  // guide overlay. Defaults match Word's "Normal" margins (~25/20/20/20 mm).
  pageMargins,
  // Base body font size in POINTS (from protocol.fontSize). Drives the editor's
  // --report-font-size so the editor, preview and Word export all render the
  // report at the same physical size. Defaults to 12pt.
  bodyFontPt,
  // Base body line-height (unitless CSS multiplier, e.g. 1.15). Drives the
  // editor's --report-line-height so the editor, preview and Word export share
  // ONE line spacing — no hardcoded constant. Per-paragraph line spacing set via
  // the ribbon still overrides this (inline style wins). Defaults to 1.15.
  bodyLineHeight,
  // React node rendered into the first A4 page (above the editable content)
  // as a hardcoded, non-editable banner. Portaled into a sibling slot inside
  // .word-page so ProseMirror cannot overwrite it. The first page's inner
  // padding-top is auto-extended to make room for the measured banner height.
  firstPageBanner,
  // Inline AI co-pilot. async (action, text) => Promise<html>. When provided,
  // the selection toolbar shows an "AI" menu (improve/proofread/expand/shorten
  // + impression). Omitted on hosts without an AI backend.
  onAiAssist,
  // Whole-report AI. (mode) => void — 'restructure' | 'proofread'. When provided,
  // a small "✨ AI" bar shows under the ribbon (so it stays reachable even in
  // fullscreen). aiBusy disables it while a request is running.
  onWholeReportAi,
  aiBusy = false,
  // ── Electronic sign-off (21 CFR Part 11) ──────────────────────────────────
  // When onFinalize/onAddendum are provided, the editor delegates signing to the
  // host (which calls the server endpoints with a password re-auth). Without
  // them, the editor falls back to the legacy client-side signature block (used
  // by standalone demos like Example.jsx).
  //   onFinalize: async ({ targetStatus, password, credentials }) => { ok, report }
  //   onAddendum: async ({ text, password }) => { ok, report }
  onFinalize,
  onAddendum,
  signerName = '',          // logged-in radiologist's name (shown read-only in the dialog)
  signerCredentials = '',   // pre-fill for the credentials line
  reportStatus,             // server status: 'Draft'|'Preliminary'|'Final'|'Addended'
  addenda = [],             // server addendum records to render below the report
  signature = null,         // this report's signer snapshot: { name, credentials, signedAt }
}, ref) {
  const containerRef = useRef(null);
  // Phone viewport detection — the desktop Ribbon (5 tabs, 17 tools) is
  // unusable on <768 px screens. Below that we swap to MobileToolbar.
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined' && window.innerWidth < 768
  );
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
    };
  }, []);
  const [isFullscreen, setIsFullscreen] = useState(false);
  // CSS-only fallback fullscreen — used on iPad/Safari when requestFullscreen API is unavailable or fails
  const [cssFullscreen, setCssFullscreen] = useState(false);
  // Mirror cssFullscreen into a ref so the long-lived capture-phase keydown
  // handler (Esc, F11) can read the current value without being re-attached
  // every time the state flips.
  const cssFullscreenRef = useRef(false);
  useEffect(() => { cssFullscreenRef.current = cssFullscreen; }, [cssFullscreen]);
  // Set to true just before we intentionally call exitFullscreen() so that
  // onFsChange can tell the difference between a user-initiated exit and iOS
  // auto-cancelling native fullscreen on scroll/app-switch.
  const exitingIntentionallyRef = useRef(false);
  const [zoom, setZoom] = useState(100);
  const [findOpen, setFindOpen] = useState(false);
  const [findFocusReplace, setFindFocusReplace] = useState(false);
  const [symbolOpen, setSymbolOpen] = useState(false);
  // Persist the spellcheck preference per-browser so the doctor doesn't have to
  // re-enable it after each reload. Native browser spellcheck — words can be
  // added to the system dictionary via right-click → "Add to dictionary"
  // (Chrome/Edge). That allow-list is owned by the OS profile.
  const [spellcheckOn, setSpellcheckOnRaw] = useState(() => {
    try { return localStorage.getItem('narrative-editor:spellcheck') === '1'; }
    catch { return false; }
  });
  const setSpellcheckOn = useCallback((v) => {
    setSpellcheckOnRaw(prev => {
      const next = typeof v === 'function' ? v(prev) : v;
      try { localStorage.setItem('narrative-editor:spellcheck', next ? '1' : '0'); } catch {}
      return next;
    });
  }, []);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [promptState, setPromptState] = useState(null); // {title, message, defaultValue, placeholder, resolve}
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [fontDlgOpen, setFontDlgOpen] = useState(false);
  const [paragraphDlgOpen, setParagraphDlgOpen] = useState(false);
  // Launcher-anchor for the Font / Paragraph popovers (friction #4 extended).
  // Set when the Group launcher dispatches its event with the button's rect.
  const [fontDlgAnchor, setFontDlgAnchor] = useState(null);
  const [paragraphDlgAnchor, setParagraphDlgAnchor] = useState(null);
  const [showFormattingMarks, setShowFormattingMarks] = useState(false);

  // Ribbon active-state refresh signal. Tiptap v3's useEditor does NOT
  // re-render on selection changes by default (perf optimisation). Without
  // this, formatting buttons (Bold/Italic/etc.) read editor.isActive() at
  // mount and never refresh — when the cursor moves into a bold word the
  // Bold button doesn't visibly press in. We tick this on every selection
  // update so the Ribbon (a child of this component) re-renders and the
  // active states stay truthful. Selection events fire on clicks + arrow
  // keys, not on every keystroke, so the cost is bounded.
  const [, setSelectionTick] = useState(0);
  const bumpSelectionTick = useCallback(() => setSelectionTick(t => (t + 1) | 0), []);

  // Header / footer state — { text, fontFamily, fontSize, align }
  const [headerFooterOpen, setHeaderFooterOpen] = useState(false);
  const [headerFooterFocus, setHeaderFooterFocus] = useState('header');
  const [headerState, setHeaderState] = useState({ text: '', fontFamily: 'Calibri', fontSize: '9', align: 'left' });
  const [footerState, setFooterState] = useState({ text: '', fontFamily: 'Calibri', fontSize: '9', align: 'center' });

  // Auto-save
  const [saveStatus, setSaveStatus] = useState(''); // '' | 'modified' | 'saving' | 'saved'
  const [lastSavedAt, setLastSavedAt] = useState(null);
  const autoSaveTimerRef = useRef(null);
  const fadeTimerRef = useRef(null);

  // Word count goal
  const [wordCountGoal, setWordCountGoal] = useState(null); // null | number

  // Toast notifications
  const [toasts, setToasts] = useState([]);
  const toastTimersRef = useRef({});
  const showToast = useCallback((message, type = 'success') => {
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2);
    setToasts(prev => [...prev.slice(-2), { id, message, type }]);
    toastTimersRef.current[id] = setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
      delete toastTimersRef.current[id];
    }, 3200);
  }, []);

  // Preview / reading mode
  const [previewMode, setPreviewMode] = useState(false);
  // Full-screen print-preview modal (true-to-print A4 pages + silent print).
  const [printPreviewOpen, setPrintPreviewOpen] = useState(false);

  // ── Edit log — ring buffer of up to 20 timestamped document snapshots ────
  const [editLog, setEditLog] = useState([]);
  const editLogTimerRef = useRef(null);

  // Ruler
  const [showRuler, setShowRuler] = useState(true);

  // Report templates dialog
  const [templatesOpen, setTemplatesOpen] = useState(false);

  // Version history
  const [versionsOpen, setVersionsOpen] = useState(false);
  const [versions, setVersions] = useState(() => loadVersions());

  // ── Tier 2 features ──────────────────────────────────────────────────────
  const [normalFindingsOpen, setNormalFindingsOpen] = useState(false);
  const [radsOpen, setRadsOpen] = useState(false);
  const [watermark, setWatermark] = useState('');
  const wmIdRef = useRef(`ne-wm-${Math.random().toString(36).slice(2, 8)}`);
  const [finalizeOpen, setFinalizeOpen]             = useState(false);
  const [measurementOpen, setMeasurementOpen]       = useState(false);
  const [isFinalized, setIsFinalized]               = useState(false);

  // ── Tier 3 features ──────────────────────────────────────────────────────
  const [snippets, setSnippets]                     = useState(() => loadSnippets());
  const [snippetManagerOpen, setSnippetManagerOpen] = useState(false);
  const [qualityOpen, setQualityOpen]               = useState(false);
  const [qualityResults, setQualityResults]         = useState([]);
  const [addendumOpen, setAddendumOpen]             = useState(false);

  // ── Grammar Check (LanguageTool) ─────────────────────────────────────────
  const [grammarMatches, setGrammarMatches]         = useState([]);
  const [grammarLoading, setGrammarLoading]         = useState(false);
  const [grammarOpen, setGrammarOpen]               = useState(false);
  const [termLoading, setTermLoading]               = useState(false);

  // ── Live spell-check (radiology-aware, client-side) ──────────────────────
  // Popup state for the correction menu; `recheckSpellRef` lets the popup force
  // an immediate re-scan after Ignore / Add-to-dictionary (which don't change
  // the doc, so the 'update'-driven rescan wouldn't otherwise fire).
  const [spellPopup, setSpellPopup]                 = useState({ open: false });
  const recheckSpellRef                             = useRef(() => {});

  // ── Tier 1 features ──────────────────────────────────────────────────────
  // Track Changes
  const [trackChangesOn, setTrackChangesOn] = useState(false);
  const [trackChangeCount, setTrackChangeCount] = useState(0);
  const trackAuthorRef = useRef('Author');

  // Inline Comments
  const [comments, setComments] = useState([]); // [{id,text,author,date,resolved,replies}]
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [pendingCommentId, setPendingCommentId] = useState(null);
  const [activeCommentId, setActiveCommentId] = useState(null);

  // Debounced onChange — avoid serialising the whole document to HTML on
  // every keystroke (which would cascade-re-render the entire ReportingPage).
  const onChangeRef = useRef(onChange);
  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);
  const onChangeTimerRef = useRef(null);
  const latestEditorRef = useRef(null);
  // Last HTML the editor itself emitted via onChange. The parent stores this
  // and echoes it back as the `content` prop; the content-sync effect uses
  // this ref to recognise such echoes and SKIP setContent() for them —
  // otherwise every keystroke round-trip would call setContent and wipe the
  // undo history, breaking Ctrl+Z.
  const lastEmittedHtmlRef = useRef(null);
  // Synchronously flush any pending (debounced) onChange so callers reading
  // the report HTML — Save, export, version snapshot — never see content
  // that's up to 300 ms stale.
  const flushPendingChange = useCallback(() => {
    if (onChangeTimerRef.current) {
      clearTimeout(onChangeTimerRef.current);
      onChangeTimerRef.current = null;
      try {
        const e = latestEditorRef.current;
        if (e) {
          const html = e.getHTML();
          lastEmittedHtmlRef.current = html;
          onChangeRef.current?.(html);
        }
      } catch (_) {}
    }
  }, []);

  // Save wrapper used by Ctrl+S and the ribbon Save button — flush first so
  // the last few keystrokes before a manual save aren't dropped.
  const handleSave = useCallback(() => {
    flushPendingChange();
    onSave?.();
    // Return focus to the editor after a manual save so the doctor can
    // immediately Ctrl+Z to undo what they just typed/saved. Clicking the
    // ribbon Save button (or Ctrl+S landing focus on it) blurs the ProseMirror
    // surface, and the global shortcut handler ignores Ctrl+Z unless the event
    // originates INSIDE the editor (the `inEditor` guard) — so without this,
    // "undo right after saving" silently does nothing. Saving never wipes the
    // undo history, so refocusing is all that's needed. Deferred a tick so it
    // runs after the click's own focus settles on the button. (Autosave never
    // calls this, so background saves never steal focus.)
    setTimeout(() => { try { latestEditorRef.current?.commands.focus(); } catch { /* editor not ready */ } }, 0);
  }, [flushPendingChange, onSave]);

  // Flush any pending HTML on unmount so we don't lose the last edit.
  useEffect(() => () => {
    flushPendingChange();
  }, [flushPendingChange]);

  // Voice dictation — text inserted at cursor when a phrase finalises.
  const voice = useVoiceDictation({
    onResult: (text) => {
      if (!editor) return;
      // Append with a leading space if previous char isn't a space/newline
      const { state } = editor;
      const before = state.doc.textBetween(Math.max(0, state.selection.from - 1), state.selection.from);
      const prefix = (before && !/\s/.test(before)) ? ' ' : '';
      editor.chain().focus().insertContent(prefix + text).run();
    },
    // Hands-free editor actions spoken as whole-phrase commands. "next field" /
    // "previous field" drive the same template loop as Tab; "scratch that" undoes
    // the last dictated phrase; "new paragraph" / "new line" create real breaks.
    onCommand: (cmd) => {
      if (!editor) return;
      switch (cmd) {
        case 'nextField':    jumpReportField(editor, 1); break;
        case 'prevField':    jumpReportField(editor, -1); break;
        case 'undo':         editor.commands.undo(); break;              // "scratch that"
        case 'newParagraph': editor.chain().focus().splitBlock().run(); break;
        case 'newLine':      editor.chain().focus().setHardBreak().run(); break;
        default: break;
      }
    },
  });
  // Mirror voice into a ref so the capture-phase keydown listener (mounted
  // once with a stable [editor, onSave, onPrint] dep array) can always read
  // the current voice handle without forcing a listener re-mount on every
  // voice state change.
  const voiceRef = useRef(voice);
  useEffect(() => { voiceRef.current = voice; }, [voice]);

  useEffect(() => {
    // The "re-enter CSS fallback on unintentional exit" branch below is iOS-
    // specific (Safari's scroll/address-bar gesture auto-cancels fullscreen).
    // Desktop browsers exit fullscreen on Esc — that's the user's explicit
    // intent, never re-enter. Without this gate, Esc would race the Exit
    // button: browser exits fullscreen before our keydown handler can set the
    // intentional-exit flag, the watcher then bounces back into CSS fallback,
    // and the user lands on a busted half-fullscreen layout.
    const isIOS = typeof navigator !== 'undefined' &&
      (/iPad|iPhone|iPod/.test(navigator.userAgent) ||
       (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));

    // On iOS we never call requestFullscreen — toggleFullscreen takes the
    // CSS-only path. So fullscreenchange events would only come from some
    // other code path requesting native fullscreen on the editor container.
    // Skip the listener entirely; nothing valid for the editor should fire
    // it on iOS, and ignoring stray events prevents the "swipe collapses
    // the page" bug.
    if (isIOS) return;

    const onFsChange = () => {
      const active = !!(document.fullscreenElement || document.webkitFullscreenElement);
      setIsFullscreen(active);
      if (!active) {
        // Desktop: explicit exit (Esc, button, devtools, …) — honour it.
        setCssFullscreen(false);
        exitingIntentionallyRef.current = false;
      }
    };
    document.addEventListener('fullscreenchange', onFsChange);
    document.addEventListener('webkitfullscreenchange', onFsChange);
    return () => {
      document.removeEventListener('fullscreenchange', onFsChange);
      document.removeEventListener('webkitfullscreenchange', onFsChange);
    };
  }, []);

  // Track-change-count effect moved below the useEditor call (was triggering
  // a Temporal Dead Zone error here because `editor` wasn't yet declared).

  // ── Medical autocomplete — listen to plugin events ────────────────────────
  // Autocomplete is now inline ghost text (see MedicalAutocomplete) — no dropdown
  // and no document-level key capture, so shortcuts (Arrows / Enter / Esc / Tab)
  // keep working. Tab-to-accept is wired into the editor's Tab handler.

  const toggleFullscreen = () => {
    const el = containerRef.current;
    if (!el) return;

    // CSS fallback mode — just clear the class
    if (cssFullscreen) {
      setCssFullscreen(false);
      return;
    }

    // iPad Safari has a vertical-swipe-to-exit-fullscreen gesture built in.
    // Combined with a touch editor (where every drag/scroll is vertical), it
    // means the user can't even read past one paragraph without the native
    // fullscreen being torn down. On iOS we go CSS-only — flip the class and
    // rely on .ne--css-fullscreen styles to take over.
    const isIOS = typeof navigator !== 'undefined' &&
      (/iPad|iPhone|iPod/.test(navigator.userAgent) ||
       (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));
    if (isIOS) {
      setCssFullscreen(true);
      return;
    }

    const nativeActive = !!(document.fullscreenElement || document.webkitFullscreenElement);

    if (!nativeActive) {
      if (el.requestFullscreen) {
        el.requestFullscreen().catch(() => setCssFullscreen(true));
      } else if (el.webkitRequestFullscreen) {
        // Safari / old iOS
        try { el.webkitRequestFullscreen(); } catch { setCssFullscreen(true); }
      } else {
        // No Fullscreen API at all (older Safari iOS)
        setCssFullscreen(true);
      }
    } else {
      // Mark as intentional so onFsChange doesn't re-enter CSS fallback.
      exitingIntentionallyRef.current = true;
      (document.exitFullscreen?.() ?? document.webkitExitFullscreen?.())?.catch?.(() => {
        exitingIntentionallyRef.current = false;
      });
    }
  };

  // ── Version history callbacks ─────────────────────────────────────────────
  const saveVersion = (label) => {
    if (!editor) return;
    const updated = addVersion(versions, editor.getHTML(), label);
    setVersions(updated);
    persistVersions(updated);
    showToast('Version saved');
  };

  const deleteVersion = (id) => {
    const updated = removeVersion(versions, id);
    setVersions(updated);
    persistVersions(updated);
  };

  const restoreVersion = (version) => {
    if (!editor) return;
    editor.commands.setContent(ensurePagedHTML(version.html), false);
    setVersionsOpen(false);
  };

  // ── Export to Word ────────────────────────────────────────────────────────
  const handleExportDocx = async () => {
    if (!editor) return;
    await exportToDocx(editor.getHTML(), 'radiology-report.docx', {
      header: headerState.text ? headerState : undefined,
      footer: footerState.text ? footerState : undefined,
    });
    showToast('Report exported as DOCX');
  };

  // ── Print / PDF ───────────────────────────────────────────────────────────
  // Opens the full-screen print preview (true-to-print A4 pages). Printing from
  // there is silent to the default printer in the desktop app, and the standard
  // print dialog on the web.
  const handleExportPdf = () => setPrintPreviewOpen(true);

  // ── Report Finalization ───────────────────────────────────────────────────
  // Server-backed sign-off (21 CFR Part 11). Delegates to the host's onFinalize
  // (password re-auth → /reporting/report/finalize). On a successful FINAL the
  // server has locked the content; we lock the editor too. A PRELIMINARY signs
  // but stays editable. Returns { ok } so the dialog can show errors / stay open.
  const handleFinalize = async ({ targetStatus, password, credentials } = {}) => {
    if (typeof onFinalize === 'function') {
      const res = await onFinalize({ targetStatus, password, credentials });
      if (res?.ok) {
        const status = res.report?.status ?? res.report?.Status ?? targetStatus;
        if (status === 'Final' || status === 'Addended') {
          editor?.setEditable(false);
          setIsFinalized(true);
        }
      }
      return res;
    }

    // ── Legacy client-side fallback (standalone demos without a server host) ──
    if (!editor) return { ok: false };
    const credStr = credentials ? `, ${credentials}` : '';
    const stamp = new Date().toLocaleString(undefined, { dateStyle: 'full', timeStyle: 'long' });
    const sigBlock = `<hr><p><strong>Electronically signed by:</strong> ${signerName || ''}${credStr}</p><p><strong>Date/Time:</strong> ${stamp}</p><p><em>I attest that I have reviewed this report and it accurately reflects my interpretation of the imaging study.</em></p>`;
    editor.chain().focus().command(({ tr, dispatch, state }) => {
      if (dispatch) {
        const end = state.doc.content.size;
        tr.insertText('', end - 1); // move to end
      }
      return true;
    }).insertContent(sigBlock).run();
    if (targetStatus !== 'Preliminary') {
      editor.setEditable(false);
      setIsFinalized(true);
    }
    setFinalizeOpen(false);
    return { ok: true };
  };

  // ── Quality Check ─────────────────────────────────────────────────────────
  const handleRunQualityCheck = () => {
    if (!editor) return;
    const html = editor.getHTML();
    const tmp = document.createElement('div');
    tmp.innerHTML = html;
    const hasUnfilledFields = tmp.querySelectorAll('.ne-structured-field:not(.ne-structured-field--filled)').length > 0;
    const results = runQualityCheck(html, { trackChangeCount, hasUnfilledFields });
    setQualityResults(results);
    setQualityOpen(true);
    const errors   = results.filter(r => r.type === 'error').length;
    const warnings = results.filter(r => r.type === 'warning').length;
    const qType = errors > 0 ? 'error' : warnings > 0 ? 'warning' : 'success';
    const qMsg  = errors > 0
      ? `${errors} error${errors > 1 ? 's' : ''}, ${warnings} warning${warnings !== 1 ? 's' : ''} found`
      : warnings > 0
        ? `${warnings} warning${warnings > 1 ? 's' : ''} found`
        : 'Quality check passed';
    showToast(qMsg, qType);
  };

  // ── Grammar Check (self-hosted LanguageTool via our backend) ───────────────
  // Report text is sent to OUR API, which proxies a self-hosted LanguageTool
  // server — PHI never leaves the network, so no third-party privacy prompt is
  // needed. If the server hasn't configured LanguageTool, the API returns 503
  // and we tell the user the feature isn't enabled yet.
  const handleGrammarCheck = async () => {
    if (!editor || grammarLoading) return;

    setGrammarLoading(true);
    setGrammarMatches([]);
    editor.commands.clearGrammarDecorations();

    try {
      const text = editor.state.doc.textContent;
      if (!text.trim()) {
        showToast('Document is empty', 'info');
        return;
      }

      const res = await apiClient.post('/reporting/grammar-check', { text, language: 'en-US' });
      const data = res?.data || {};

      const offsetMap = buildOffsetMap(editor.state.doc);
      const { decoSet, validMatches } = buildGrammarDecorations(
        editor.state.doc,
        data.matches ?? [],
        offsetMap,
      );

      editor.commands.setGrammarDecorations(decoSet);
      setGrammarMatches(validMatches);
      setGrammarOpen(validMatches.length > 0);

      const n = validMatches.length;
      showToast(
        n === 0 ? 'No grammar issues found ✓' : `${n} issue${n !== 1 ? 's' : ''} found`,
        n === 0 ? 'success' : 'warning',
      );
    } catch (err) {
      if (err?.response?.status === 503) {
        showToast('Grammar check isn’t enabled on this server yet.', 'info');
      } else {
        showToast('Grammar check failed — please try again.', 'error');
      }
    } finally {
      setGrammarLoading(false);
    }
  };

  // ── RadLex term check (radiology-aware spelling) ──────────────────────────
  // Flags words that aren't recognised radiology terms but have a likely fix,
  // reusing the grammar decoration + fix-popup. Distinct from the LanguageTool
  // grammar check (which is general English and would mis-flag real terms).
  const handleTermCheck = async () => {
    if (!editor) return;
    setTermLoading(true);
    setGrammarMatches([]);
    editor.commands.clearGrammarDecorations();
    try {
      const text = editor.state.doc.textContent;
      if (!text.trim()) { showToast('Document is empty', 'info'); return; }
      const res = await apiClient.post('/reporting/terms/check', { text });
      const issues = res?.data?.issues || [];
      const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const matches = [];
      for (const issue of issues) {
        const word = issue.word || '';
        if (!word) continue;
        const re = new RegExp(`(?<![A-Za-z])${esc(word)}(?![A-Za-z])`, 'gi');
        let mm;
        while ((mm = re.exec(text)) !== null) {
          matches.push({
            offset: mm.index,
            length: mm[0].length,
            message: `"${mm[0]}" is not a recognised radiology term.`,
            rule: { issueType: 'misspelling', category: { name: 'Radiology term' }, id: 'radlex' },
            replacements: (issue.suggestions || []).slice(0, 3).map((s) => ({ value: s })),
          });
          if (re.lastIndex === mm.index) re.lastIndex++;
        }
      }
      matches.sort((a, b) => a.offset - b.offset);
      const offsetMap = buildOffsetMap(editor.state.doc);
      const { decoSet, validMatches } = buildGrammarDecorations(editor.state.doc, matches, offsetMap);
      editor.commands.setGrammarDecorations(decoSet);
      setGrammarMatches(validMatches);
      setGrammarOpen(validMatches.length > 0);
      const n = validMatches.length;
      showToast(n === 0 ? 'No term issues found ✓' : `${n} term issue${n !== 1 ? 's' : ''} flagged`, n === 0 ? 'success' : 'warning');
    } catch {
      showToast('Term check failed — check your connection', 'error');
    } finally {
      setTermLoading(false);
    }
  };

  // ── Addendum ──────────────────────────────────────────────────────────────
  // Server-backed (21 CFR Part 11): delegates to the host's onAddendum (password
  // re-auth → /reporting/report/addendum). The signed content is NOT mutated —
  // the addendum is stored as its own record and rendered from `addenda`.
  const handleAddendum = async ({ text, password } = {}) => {
    if (typeof onAddendum === 'function') {
      return await onAddendum({ text, password });
    }
    // Legacy client-side fallback (standalone demos).
    if (!editor) return { ok: false };
    const stamp = new Date().toLocaleString(undefined, { dateStyle: 'full', timeStyle: 'long' });
    const html = `<hr><p><strong>ADDENDUM</strong></p><p><strong>Author:</strong> ${signerName || ''}</p><p><strong>Date/Time:</strong> ${stamp}</p><p>${(text || '').replace(/\n/g, '<br>')}</p>`;
    editor.setEditable(true);
    editor.chain().focus().insertContent(html).run();
    editor.setEditable(false);
    setAddendumOpen(false);
    return { ok: true };
  };

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        document: false, // we use our own PageDocument (schema: doc -> page+)
        heading: { levels: [1, 2, 3, 4, 5, 6] },
        bulletList: { keepMarks: true, keepAttributes: false },
        orderedList: { keepMarks: true, keepAttributes: false },
        // Disable StarterKit's plain Underline — we register UnderlineStyle
        // below which extends it with an MS-Word underline-style attribute
        // (double / thick / dotted / dashed / wavy / dot-dash / dot-dot-dash).
        underline: false,
        // Beefier undo history for long-form report editing. Default is 100
        // transactions; 500 lets the doctor undo through a deeper session
        // (e.g. after applying a template by accident). newGroupDelay drops
        // from 500 ms to 350 ms so undo steps land on smaller pause-boundaries.
        history: { depth: 500, newGroupDelay: 350 },
      }),
      // Schema selection. Flat (doc → block+) for pageview + continuous; the
      // legacy page-node schema only for 'paged'. Only ONE group may register
      // `doc`. PaginationDecoration (the live page-gap overlay) runs ONLY in
      // pageview — continuous deliberately registers NO pagination plugin, so
      // zero pagination work happens while typing (it paginates at print only).
      ...(USE_FLAT_SCHEMA
        ? [FlatDocument, PageBreakNode, ...(USE_DECORATION_PAGINATION ? [PaginationDecoration] : [])]
        : [PageDocument, Page, Pagination]
      ),
      UnderlineStyle,
      Typography,
      LineHeight,
      ParagraphIndent,
      ParagraphSpacing,
      // Legacy PageBreak command (mutates page nodes) only on Path A. On
      // Path B, PageBreakNode (registered above) provides the equivalent
      // via the insertPageBreakFlat command (both flat modes use it).
      ...(USE_FLAT_SCHEMA ? [] : [PageBreak]),
      FormatPainter,
      ParagraphFraming,
      ListStyles,
      Sort,
      MultilevelList,
      PageNumber,
      AutoCorrect,
      ReportStructure,
      Footnote,
      GrammarCheck,
      SpellCheck,
      // Cover every block type a user could place the cursor in. Without
      // `listItem`/`tableCell`/`tableHeader`/`blockquote` the align buttons
      // silently no-op inside those contexts.
      TextAlign.configure({
        types: ['heading', 'paragraph', 'listItem', 'blockquote', 'tableCell', 'tableHeader'],
        alignments: ['left', 'center', 'right', 'justify'],
        defaultAlignment: 'left',
      }),
      TextStyle,
      Color,
      Highlight.configure({ multicolor: true }),
      Image.configure({ inline: true, allowBase64: true }).extend({
        addAttributes() {
          return {
            ...this.parent?.(),
            width:  { default: null, parseHTML: el => el.getAttribute('width')  || el.style.width  || null, renderHTML: a => a.width  ? { width: a.width,  style: `width:${a.width};height:auto`  } : {} },
          };
        },
      }),
      Table.configure({ resizable: true }),
      TableRow,
      CustomTableCell,
      TableHeader,
      Placeholder.configure({ placeholder }),
      CharacterCount,
      FontSize,
      FontFamily,
      TextGradient,
      Subscript,
      Superscript,
      Link,
      TrackInsert,
      TrackDelete,
      TrackChanges,
      CommentMark,
      Comment,
      MedicalAutocomplete,
      StructuredField,
      SearchHighlight,
      Callout,
      Columns,
    ],
    content: ensurePagedHTML(content),
    editable,
    onUpdate: ({ editor: e }) => {
      // Stash the editor for the unmount flush below.
      latestEditorRef.current = e;
      // Debounce the heavy getHTML() + parent setState chain by 300ms.
      // Keeps typing smooth even on long multi-page reports.
      if (onChangeTimerRef.current) clearTimeout(onChangeTimerRef.current);
      onChangeTimerRef.current = setTimeout(() => {
        try {
          const html = e.getHTML();
          lastEmittedHtmlRef.current = html;
          onChangeRef.current?.(html);
        } catch (_) {}
      }, 300);
      // Active-state refresh: content changes can also flip formatting
      // (e.g. typing while in a marked range, applying a mark). Cheap.
      bumpSelectionTick();
    },
    // Selection changes — arrow keys, mouse clicks, programmatic
    // .setTextSelection() — don't trigger onUpdate, so we listen here too.
    // Without this, the toolbar's active states (Bold pressed, alignment
    // chip, font picker value) lag behind the actual cursor location.
    onSelectionUpdate: () => bumpSelectionTick(),
    editorProps: {
      attributes: {
        // On Path B, the `.flat-pagination` modifier activates the Path B
        // CSS rules — the editor itself styles as the A4 column and the
        // boundary widgets render the inter-page gaps inside.
        class: 'narrative-editor-content' + (USE_DECORATION_PAGINATION ? ' flat-pagination' : USE_CONTINUOUS ? ' flat-continuous' : ''),
        spellcheck: 'false', // toggled at runtime by spellcheckOn effect
      },
      // Cleans pasted HTML: removes the editor's own page wrappers (avoids
      // page-in-page nesting) AND scrubs the junk Microsoft Word / Outlook
      // / Google Docs leak into the clipboard (mso-* styles, conditional
      // comments, empty <o:p> tags, MsoNormal classes, deprecated <font>
      // tags). Without this, pasting a report from Word produces bloated
      // HTML that breaks pagination and styling.
      transformPastedHTML(html) {
        if (!html) return '';
        let out = html;

        // Editor self-paste — strip own page wrappers
        out = out
          .replace(/<div[^>]*class="[^"]*word-page-inner[^"]*"[^>]*>/gi, '')
          .replace(/<div[^>]*class="[^"]*word-page[^"]*"[^>]*>/gi, '')
          .replace(/<\/div>\s*<\/div>(?=\s*(<div[^>]*class="[^"]*word-page|$))/gi, '');

        // Strip Word / Outlook conditional comments and XML islands
        out = out
          .replace(/<!--\[if[^\]]*\]>[\s\S]*?<!\[endif\]-->/gi, '')
          .replace(/<!--StartFragment-->|<!--EndFragment-->/gi, '')
          .replace(/<xml[\s\S]*?<\/xml>/gi, '')
          .replace(/<o:p[\s\S]*?<\/o:p>/gi, '')
          .replace(/<o:p[^>]*\/>/gi, '');

        // Remove mso-* CSS declarations inside style="…" attributes
        out = out.replace(/style="([^"]*)"/gi, (_m, css) => {
          const cleaned = css
            .split(';')
            .filter(d => d && !/^\s*mso-/i.test(d) && !/^\s*line-height\s*:\s*normal/i.test(d))
            .join(';')
            .trim();
          return cleaned ? `style="${cleaned}"` : '';
        });

        // Strip MsoNormal and similar class attributes; collapse Office classes
        out = out
          .replace(/\sclass="Mso[^"]*"/gi, '')
          .replace(/\sclass="WordSection\d+"/gi, '');

        // Convert deprecated <font> tags to <span> with inline style
        out = out.replace(/<font([^>]*)>/gi, (_m, attrs) => {
          const style = [];
          const color = attrs.match(/color="?([^"\s>]+)/i);
          const face  = attrs.match(/face="?([^"\s>]+)/i);
          const size  = attrs.match(/size="?(\d+)/i);
          if (color) style.push(`color: ${color[1]}`);
          if (face)  style.push(`font-family: ${face[1]}`);
          if (size)  style.push(`font-size: ${[null,'10px','13px','16px','18px','24px','32px','48px'][+size[1]] || '13px'}`);
          return `<span style="${style.join('; ')}">`;
        }).replace(/<\/font>/gi, '</span>');

        // Drop completely empty attributes left behind by the regex passes
        out = out.replace(/\s(class|style)=""/gi, '');

        return out;
      },
    },
  });

  // ── Track change count — debounced so it doesn't recompute on every
  // keystroke (the count drives a UI badge; ~300ms lag is invisible). ───────
  useEffect(() => {
    if (!editor) return;
    let t = null;
    const compute = () => {
      try {
        const count = editor.commands.getTrackChangeCount?.() ?? 0;
        setTrackChangeCount(count);
      } catch (_) {}
    };
    const schedule = () => { if (t) clearTimeout(t); t = setTimeout(compute, 300); };
    compute();
    editor.on('update', schedule);
    return () => { if (t) clearTimeout(t); editor.off('update', schedule); };
  }, [editor]);

  // Expose methods to parent
  useImperativeHandle(ref, () => ({
    insertContent: (html) => {
      if (editor) {
        editor.chain().focus().insertContent(html).run();
      }
    },
    setContent: (html) => {
      if (editor) {
        editor.commands.setContent(ensurePagedHTML(html), false);
      }
    },
    getHTML: () => editor?.getHTML() || '',
    // Path B-aware print HTML. On Path A returns getHTML() unchanged
    // (Page nodes already produce multi-page markup). On Path B injects
    // auto-page-break markers at every computed boundary so downstream
    // serializers split correctly. Safe to call regardless of flag state.
    getPrintHTML: () => {
      if (!editor) return '';
      // Continuous mode runs no live pagination plugin, so compute the page
      // boundaries on-demand now (from the live block heights) and inject the
      // same data-page-break markers the print/PDF pipeline understands.
      return USE_CONTINUOUS ? getContinuousPrintHTML(editor) : getPaginatedPrintHTML(editor);
    },
    // Current watermark text ('' = none) so the host's Word export can carry it.
    getWatermark: () => watermark,
    container: containerRef.current,
    editor,
    // Print EXACTLY the editor's own pages (the .word-page sheets + banner),
    // so the printout paginates the "narrative-editor way" — not via a separate
    // chunker. Copies the canvas + all document styles + the margin/font CSS
    // vars into a clean print window and page-breaks between sheets.
    printPages: () => {
      const container = containerRef.current;
      const canvas = container?.querySelector('.word-canvas');
      if (!canvas) return;
      const win = window.open('', '_blank', 'width=820,height=1060');
      if (!win) return;
      const styles = Array.from(document.querySelectorAll('style, link[rel="stylesheet"]'))
        .map(n => n.outerHTML).join('\n');
      const vars = container.getAttribute('style') || ''; // holds --page-margin-* / --report-font-size / --patient-banner-height
      win.document.write(
        `<!doctype html><html><head><title>Report</title>${styles}` +
        `<style>` +
        `@page{size:A4;margin:0}` +
        `html,body{margin:0;padding:0;background:#fff}` +
        `.print-root{${vars}}` +
        `.print-root .word-canvas{--zoom:1 !important;padding:0 !important;margin:0 !important;background:#fff !important;box-shadow:none !important;overflow:visible !important}` +
        `.print-root .word-page{box-shadow:none !important;margin:0 !important;break-after:page;page-break-after:always}` +
        `.print-root .word-page:last-child{break-after:auto;page-break-after:auto}` +
        `</style></head><body>` +
        `<div class="print-root narrative-editor-container">${canvas.outerHTML}</div>` +
        `</body></html>`
      );
      win.document.close();
      win.focus();
      setTimeout(() => { try { win.print(); } catch (_) {} }, 700);
    },
  }));

  // Sync content prop → editor whenever it changes from the outside
  // (initial load, template selection, draft restore, etc.).
  // Guard: skip if the editor is focused AND already has the same text length —
  // this avoids clobbering live typing while still applying external changes.
  useEffect(() => {
    if (!editor || content === undefined) return;
    // Echo guard: if the incoming content is exactly what the editor last
    // emitted, this is the parent round-tripping our own edit back to us.
    // Calling setContent here would wipe the undo history (breaking Ctrl+Z)
    // and can revert in-flight typing, so skip it entirely.
    if (content === lastEmittedHtmlRef.current) return;
    const currentHTML = editor.getHTML();
    if (content === currentHTML) return; // nothing to do
    // Always sync when the editor is empty or unfocused.
    // Also sync when the content length differs by more than 20 chars —
    // this covers template application (large delta) while ignoring the
    // tiny differences caused by Tiptap's HTML serialisation.
    const lengthDelta = Math.abs((content?.length ?? 0) - (currentHTML?.length ?? 0));
    if (!editor.isFocused || editor.isEmpty || lengthDelta > 20) {
      editor.commands.setContent(ensurePagedHTML(content), false);
    }
  }, [content, editor]);

  // Preview mode: toggle editor editability
  useEffect(() => {
    if (!editor) return;
    editor.setEditable(!previewMode && editable);
  }, [editor, previewMode, editable]);

  // Reflect the server's sign-off status into the local "finalized" flag so the
  // lock banner + signature footer show correctly on LOAD of an already-signed
  // report (not just after signing in this session). Editability itself is
  // driven by the `editable` prop (the host passes editable={!isFinalized}).
  useEffect(() => {
    if (reportStatus === 'Final' || reportStatus === 'Addended') setIsFinalized(true);
    else if (reportStatus === 'Draft' || reportStatus === 'Preliminary') setIsFinalized(false);
  }, [reportStatus]);

  // (Patient banner / WYSIWYG margin overlays moved out of the editor — they
  // now live as a sibling element above the editor in the caller. This keeps
  // the editor a stable A4 surface and avoids Tiptap-vs-DOM race conditions.)

  // ── Footnote renumbering ──────────────────────────────────────────────────
  // Re-run whenever the doc changes and assign sequential [1], [2]… numbers to
  // all footnote atoms so they always reflect document order.
  useEffect(() => {
    if (!editor) return;
    let t = null;
    const renumber = () => {
      let n = 1;
      const { tr, doc } = editor.state;
      let changed = false;
      doc.descendants((node, pos) => {
        if (node.type.name === 'footnote') {
          if (node.attrs.number !== n) {
            tr.setNodeMarkup(pos, undefined, { ...node.attrs, number: n });
            changed = true;
          }
          n++;
        }
      });
      if (changed) editor.view.dispatch(tr);
    };
    // Debounced — this is a full doc walk; running it on every keystroke
    // slowed typing on long reports. Footnote numbering can settle ~300ms
    // after a pause without the user noticing.
    const schedule = () => { if (t) clearTimeout(t); t = setTimeout(renumber, 300); };
    editor.on('update', schedule);
    return () => { if (t) clearTimeout(t); editor.off('update', schedule); };
  }, [editor]);

  // ── Insert-footnote custom event (fired from InsertTab button) ────────────
  useEffect(() => {
    if (!editor) return;
    const handler = async () => {
      const text = await editorPromptAtCursor(editor, {
        title: 'Insert Footnote',
        message: 'Enter the footnote text:',
        defaultValue: '',
        placeholder: 'Citation, reference, or annotation…',
        confirmLabel: 'Insert',
      });
      if (text?.trim()) editor.chain().focus().insertFootnote(text.trim()).run();
    };
    window.addEventListener('narrative-editor:insert-footnote', handler);
    return () => window.removeEventListener('narrative-editor:insert-footnote', handler);
  }, [editor]);
  // ─────────────────────────────────────────────────────────────────────────

  // Refs that the keydown closure reads — keeps the effect deps minimal so the
  // listener isn't torn down and re-added on every scroll/page-count change.
  const currentPageRef     = useRef(currentPage);
  const totalPagesRef      = useRef(totalPages);
  const shortcutsOpenRef   = useRef(shortcutsOpen);
  const trackChangesOnRef  = useRef(trackChangesOn);
  const commentsRef        = useRef(comments);
  useEffect(() => { currentPageRef.current   = currentPage; },    [currentPage]);
  useEffect(() => { totalPagesRef.current     = totalPages; },     [totalPages]);
  useEffect(() => { shortcutsOpenRef.current  = shortcutsOpen; },  [shortcutsOpen]);
  useEffect(() => { trackChangesOnRef.current = trackChangesOn; }, [trackChangesOn]);
  useEffect(() => { commentsRef.current       = comments; },       [comments]);

  // ── Edit log capture ─────────────────────────────────────────────────────
  // After 2 s of idle, push a snapshot entry into the ring buffer (max 20).
  useEffect(() => {
    if (!editor) return;
    const record = () => {
      clearTimeout(editLogTimerRef.current);
      editLogTimerRef.current = setTimeout(() => {
        const preview = editor.state.doc.textContent.replace(/\s+/g, ' ').trim().slice(0, 70) || '(empty)';
        const wc = editor.state.doc.textContent.split(/\s+/).filter(Boolean).length;
        setEditLog(prev => [{ time: Date.now(), preview, wordCount: wc }, ...prev].slice(0, 20));
      }, 2000);
    };
    editor.on('update', record);
    return () => { editor.off('update', record); clearTimeout(editLogTimerRef.current); };
  }, [editor]);

  // MS Word-style keyboard shortcuts — exhaustive, capture-phase so this wins
  // over any page-level (DICOM) handlers AND ensures Tiptap's internal keymap
  // doesn't fire twice (we stopImmediatePropagation on handled events).
  useEffect(() => {
    if (!editor) return;

    // True only when the keystroke is happening on the ProseMirror editing
    // surface — NOT on a plain <input>/<textarea>/<select> that lives inside
    // the editor container (the Find box, Comments textarea, prompt dialogs,
    // etc.). Without this guard, the capture-phase shortcut handler below
    // would `stopImmediatePropagation()` and hijack Ctrl+B / Ctrl+A / Ctrl+Z
    // while the user is typing in those fields, because the old check matched
    // anything contained by the editor container.
    const inEditor = (e) => {
      const el = e.target || document.activeElement;
      if (!el || !containerRef.current?.contains(el)) return false;
      const tag = el.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return false;
      // Only the ProseMirror editable (or a node inside it) counts as "in
      // editor". closest() also matches the element itself.
      return !!(el.closest?.('.narrative-editor-content'));
    };

    const handler = (e) => {
      // F1 — global, always works (open shortcuts cheat-sheet)
      if (e.key === 'F1') {
        if (inEditor(e)) {
          e.preventDefault();
          e.stopImmediatePropagation();
          setShortcutsOpen(true);
        }
        return;
      }
      // F11 — toggle fullscreen for the editor container
      if (e.key === 'F11') {
        if (inEditor(e)) {
          e.preventDefault();
          e.stopImmediatePropagation();
          toggleFullscreen();
        }
        return;
      }
      // F8 — global voice-dictation toggle.
      // Deliberately NOT gated on inEditor: a radiologist measuring with one
      // hand should be able to start/stop dictation regardless of which
      // element has focus on the Reporting page. Dragon NaturallySpeaking
      // uses the same key, so it matches existing muscle memory.
      // No-op if the Web Speech API isn't available in this browser.
      // F2 — jump to next fill-in field; Shift+F2 — previous. (Tab is left for
      // list indent / table navigation, so field-jump gets its own key.)
      if (e.key === 'F2' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        if (inEditor(e)) {
          const moved = jumpReportField(editor, e.shiftKey ? -1 : 1);
          if (moved) { e.preventDefault(); e.stopImmediatePropagation(); }
        }
        return;
      }
      if (e.key === 'F8' && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const v = voiceRef.current;
        if (v?.supported && typeof v.toggle === 'function') {
          e.preventDefault();
          e.stopImmediatePropagation();
          v.toggle();
        }
        return;
      }
      // F5 — Go to page (same as Ctrl+G)
      if (e.key === 'F5') {
        if (inEditor(e)) {
          e.preventDefault();
          e.stopImmediatePropagation();
          editorPromptAtCursor(editor, {
            title: 'Go to Page',
            message: `Enter page number (1 – ${totalPagesRef.current}).`,
            defaultValue: String(currentPageRef.current),
            placeholder: '1',
            confirmLabel: 'Go',
            inputType: 'number',
          }).then(n => {
            const num = parseInt(n, 10);
            if (Number.isFinite(num)) goToPage(num);
          });
        }
        return;
      }
      // Esc — close any of our open dialogs, OR exit fullscreen.
      if (e.key === 'Escape') {
        if (shortcutsOpenRef.current) { e.preventDefault(); setShortcutsOpen(false); return; }
        // Cancel format painter if active
        if (editor?.storage?.formatPainter?.active) {
          e.preventDefault();
          editor.chain().cancelFormatPainter().run();
          return;
        }
        // Explicit exit from native browser fullscreen. Some browsers' native
        // Esc-to-exit-fullscreen is unreliable when other capture-phase keydown
        // handlers are on `document`; do it ourselves to be safe.
        if (document.fullscreenElement && containerRef.current?.contains(document.fullscreenElement)) {
          e.preventDefault();
          exitingIntentionallyRef.current = true;
          document.exitFullscreen?.().catch(() => { exitingIntentionallyRef.current = false; });
          return;
        }
        // CSS-fallback fullscreen (iPad/Safari path) — there's no native
        // fullscreen element to exit, so just clear the flag ourselves.
        if (cssFullscreenRef.current) {
          e.preventDefault();
          setCssFullscreen(false);
          return;
        }
        // Find/Symbol dialogs handle their own Esc
        return;
      }

      // ── Tab — insert a real tab stop at the cursor (no modifier) ────
      if (e.key === 'Tab' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        // Only intercept when focus is in the actual editable surface.
        // If focus is on a Ribbon button, a template dropdown, a dialog
        // input, etc., let the browser handle Tab (focus navigation).
        const target = e.target;
        const inEditable =
          (target?.isContentEditable === true) ||
          !!target?.closest?.('.ProseMirror') ||
          !!target?.closest?.('.word-page-inner') ||
          (document.activeElement?.isContentEditable === true);
        if (!inEditable) return;

        // Inline autocomplete: Tab ACCEPTS the ghost completion if one is showing
        // (Gmail/Copilot style). Falls through to indent when there's no ghost.
        if (editor?.commands?.acceptAutocomplete?.()) {
          e.preventDefault();
          e.stopImmediatePropagation();
          return;
        }

        // Let the Table extension handle Tab inside table cells
        const { state } = editor;
        const $from = state.selection.$from;
        let insideTable = false;
        for (let d = $from.depth; d > 0; d--) {
          const name = $from.node(d).type.name;
          if (name === 'table') { insideTable = true; break; }
        }
        if (insideTable) return; // pass through to Tiptap's table keymap

        // ── PowerScribe/Fluency-style field navigation ───────────────────────
        // When the report still has fill-in fields ([like this] / ___ / ***),
        // Tab jumps to the NEXT field and SELECTS it (so the next keystroke or
        // dictated phrase replaces it); Shift+Tab goes to the previous. This is
        // the core template-filling loop a radiologist's hands expect from
        // PowerScribe. It runs AFTER autocomplete-accept + the table keymap (so
        // those still win in their contexts) and BEFORE indent/tab-char — so
        // once every field is filled (no [..] left), Tab reverts to normal
        // indent/list behaviour. jumpReportField returns false when no field
        // exists, so we only swallow Tab when we actually navigated.
        if (jumpReportField(editor, e.shiftKey ? -1 : 1)) {
          e.preventDefault();
          e.stopImmediatePropagation();
          return;
        }

        e.preventDefault();
        e.stopImmediatePropagation();

        // Safe accessor — tiptap's editor.can() can throw transient nulls in
        // dev (concurrent rendering / mid-init). Without this, Tab silently
        // does nothing because the thrown error happens AFTER preventDefault.
        const canRun = (cmd) => {
          try {
            const c = editor?.can?.();
            const fn = c && c[cmd];
            return typeof fn === 'function' ? !!fn('listItem') : false;
          } catch { return false; }
        };

        try {
          const { $from } = state.selection;
          const blockType = $from.parent.type.name;
          const isAlignable = blockType === 'paragraph' || blockType === 'heading';
          if (e.shiftKey) {
            // Shift+Tab: pop a list item out a level; else delete a tab sitting
            // just before the cursor (back-tab); else un-snap a legacy
            // right-aligned line or outdent a previously-indented paragraph.
            if (canRun('liftListItem')) {
              editor.chain().focus().liftListItem('listItem').run();
            } else {
              const sel = state.selection;
              const prevChar = sel.empty && $from.parentOffset > 0
                ? $from.parent.textBetween($from.parentOffset - 1, $from.parentOffset)
                : '';
              if (prevChar === '\t') {
                editor.chain().focus().deleteRange({ from: sel.from - 1, to: sel.from }).run();
              } else if (isAlignable && editor.isActive({ textAlign: 'right' })) {
                editor.chain().focus().setTextAlign('left').run();
              } else {
                editor.chain().focus().decreaseParagraphIndent().run();
              }
            }
          } else {
            // Tab: sink a list item (lists keep their demote behavior); in any
            // other block insert a REAL tab character at the cursor so the text
            // after it steps to the right — like a bigger space, with no cap.
            // Whole-paragraph indent now lives on Ctrl+M and the ribbon.
            if (canRun('sinkListItem')) {
              editor.chain().focus().sinkListItem('listItem').run();
            } else {
              editor.chain().focus().insertContent('\t').run();
            }
          }
        } catch (tabErr) {
          // Last-resort fallback — at minimum push the cursor forward so the
          // user feels the key did something.
          console.warn('[NarrativeEditor] Tab handler error:', tabErr?.message);
          try { editor.chain().focus().insertContent('\t').run(); } catch {}
        }
        return;
      }

      // ── Shift+F3 — toggle case of selection ───────────────────────────────
      if (e.key === 'F3' && e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
        if (!inEditor(e)) return;
        e.preventDefault();
        e.stopImmediatePropagation();
        toggleCase(editor);
        return;
      }

      // ── Alt+Shift+↑ / ↓ — move current block up or down ────────────────────
      if (e.altKey && e.shiftKey && !e.ctrlKey && !e.metaKey &&
          (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
        if (!inEditor(e)) return;
        e.preventDefault();
        e.stopImmediatePropagation();
        moveBlockVertically(editor, e.key === 'ArrowUp' ? 'up' : 'down');
        return;
      }

      // ── Alt+1 / Alt+2 / Alt+3 — jump to section heading ────────────────────
      // A radiologist drafting a report scrolls between Findings → Impression
      // → Advice constantly. Alt+1/2/3 finds the H2 (or H3) heading whose
      // text matches that section name (case-insensitive, fuzzy first-token
      // match), moves the caret to the end of its first content paragraph,
      // and scrolls it into view. Falls back to the Nth H2 in the doc if no
      // name match is found, so atypical templates still get jump targets.
      if (e.altKey && !e.shiftKey && !e.ctrlKey && !e.metaKey &&
          (e.key === '1' || e.key === '2' || e.key === '3')) {
        if (!inEditor(e)) return;
        const SECTION_KEYS = {
          '1': ['finding', 'finds'],
          '2': ['impression', 'impr', 'conclusion'],
          '3': ['advice', 'recommend', 'plan', 'follow'],
        };
        const needles = SECTION_KEYS[e.key];
        const nthFallback = parseInt(e.key, 10) - 1;
        const { doc } = editor.state;
        let nameMatchPos = -1;
        let nthH2Pos = -1;
        let h2Counter = 0;
        doc.descendants((node, pos) => {
          if (nameMatchPos >= 0) return false;
          if (node.type.name !== 'heading') return;
          const level = node.attrs?.level;
          if (level !== 2 && level !== 3) return;
          const text = (node.textContent || '').toLowerCase().trim();
          if (level === 2) {
            if (h2Counter === nthFallback) nthH2Pos = pos;
            h2Counter++;
          }
          if (needles.some((n) => text.includes(n))) {
            nameMatchPos = pos;
            return false;
          }
        });
        const targetPos = nameMatchPos >= 0 ? nameMatchPos : nthH2Pos;
        if (targetPos < 0) return; // no candidate heading in the document
        e.preventDefault();
        e.stopImmediatePropagation();
        // Land the caret inside the heading itself (start of its text). This
        // makes typing immediately replace the section title if the user
        // wants — same affordance Word offers for "Click heading then type".
        try {
          editor.chain().focus().setTextSelection(targetPos + 1).run();
          // Scroll the heading into view; rAF lets layout settle if the
          // editor was in a fresh paint cycle.
          requestAnimationFrame(() => {
            try { editor.view.dispatch(editor.state.tr.scrollIntoView()); } catch {}
          });
        } catch (err) {
          console.warn('[NE] section jump failed:', err?.message);
        }
        return;
      }

      // ── Backspace — remove one indent level when cursor is at line start ──
      if (e.key === 'Backspace' && !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey) {
        if (!inEditor(e)) return;
        const { $from, empty } = editor.state.selection;
        if (empty && $from.parentOffset === 0) {
          const nodeType = $from.parent.type.name;
          const indent = $from.parent.attrs?.indent || 0;
          if ((nodeType === 'paragraph' || nodeType === 'heading') && indent > 0) {
            e.preventDefault();
            e.stopImmediatePropagation();
            editor.chain().focus().decreaseParagraphIndent().run();
            return;
          }
        }
      }

      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;
      if (!inEditor(e)) return;

      const key = e.key.toLowerCase();
      const stop = () => { e.preventDefault(); e.stopImmediatePropagation(); };
      const run = (fn) => { stop(); fn(); };

      // ── Ctrl+Alt+I — Insert auto-numbered IMPRESSION list ──
      if (e.altKey && key === 'i') {
        return run(() => editor.chain().focus().insertImpressionList().run());
      }

      // ── Ctrl+Alt+M — Add inline comment ──────────────────
      if (e.altKey && key === 'm') {
        return run(() => {
          if (editor.state.selection.empty) return;
          const id = 'cmt-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
          editor.commands.addComment(id);
          setComments(prev => [
            ...prev,
            { id, text: '', author: trackAuthorRef.current, date: new Date().toISOString(), resolved: false, replies: [] },
          ]);
          setPendingCommentId(id);
          setCommentsOpen(true);
        });
      }

      // ── Ctrl+Alt: headings (1–4) and special character inserts ────────────
      if (e.altKey && ['1', '2', '3', '4'].includes(e.key)) {
        return run(() => editor.chain().focus().setHeading({ level: parseInt(e.key, 10) }).run());
      }
      if (e.altKey && e.key === '.')          return run(() => editor.chain().focus().insertContent('\u2026').run()); // …
      if (e.altKey && key === 'c' && !e.shiftKey) return run(() => editor.chain().focus().insertContent('\u00A9').run()); // ©
      if (e.altKey && key === 'r' && !e.shiftKey) return run(() => editor.chain().focus().insertContent('\u00AE').run()); // ®
      if (e.altKey && key === 't' && !e.shiftKey) return run(() => editor.chain().focus().insertContent('\u2122').run()); // ™

      if (e.altKey) return; // don't intercept other Ctrl+Alt combos

      // ── App-level ────────────────────────────────────────
      if (key === 's' && !e.shiftKey) return run(() => handleSave());

      // ── Find / Replace ────────────────────────────────────
      if (key === 'f') return run(() => { setFindFocusReplace(false); setFindOpen(true); });
      if (key === 'h') return run(() => { setFindFocusReplace(true);  setFindOpen(true); });

      // ── Go to page (Ctrl+G or F5) ─────────────────────────
      if (key === 'g') {
        return run(async () => {
          const n = await editorPromptAtCursor(editor, {
            title: 'Go to Page',
            message: `Enter page number (1 – ${totalPagesRef.current}).`,
            defaultValue: String(currentPageRef.current),
            placeholder: '1',
            confirmLabel: 'Go',
            inputType: 'number',
          });
          const num = parseInt(n, 10);
          if (Number.isFinite(num)) goToPage(num);
        });
      }

      // ── Insert link ───────────────────────────────────────
      if (key === 'k') {
        return run(async () => {
          const url = await editorPromptAtCursor(editor, {
            title: 'Insert Hyperlink',
            message: 'Enter the URL to link to.',
            defaultValue: 'https://',
            placeholder: 'https://example.com',
            confirmLabel: 'Insert',
          });
          if (url) editor.chain().focus().setLink({ href: url, target: '_blank' }).run();
        });
      }

      // ── Character formatting ──────────────────────────────
      if (key === 'b' && !e.shiftKey && !e.altKey) {
        return run(() => { editor.commands.focus(); editor.commands.toggleBold(); });
      }
      if (key === 'i' && !e.shiftKey && !e.altKey) {
        return run(() => { editor.commands.focus(); editor.commands.toggleItalic(); });
      }
      if (key === 'u' && !e.shiftKey && !e.altKey) {
        return run(() => { editor.commands.focus(); editor.commands.toggleUnderline(); });
      }
      if (e.shiftKey && key === 'x') {
        return run(() => { editor.commands.focus(); editor.commands.toggleStrike(); });
      }

      // Ctrl+= and Ctrl+Shift+=
      if (e.key === '=' && !e.shiftKey) return run(() => editor.commands.toggleSubscript?.());
      if (e.key === '=' && e.shiftKey)  return run(() => editor.commands.toggleSuperscript?.());
      if (e.key === '+' && e.shiftKey)  return run(() => editor.commands.toggleSuperscript?.());

      // Font size cycling
      if (e.key === ']' || (e.shiftKey && e.key === '>')) return run(() => cycleFontSize(editor, +1));
      if (e.key === '[' || (e.shiftKey && e.key === '<')) return run(() => cycleFontSize(editor, -1));

      // ── Ctrl+0 reset zoom · Ctrl+- zoom out ──────────────────────────
      // Browsers default Ctrl+0/Ctrl+- to page zoom. Inside the editor we
      // want the document's page chrome to zoom (our `zoom` state) instead,
      // so we preventDefault here. Zoom-IN via Ctrl+= conflicts with the
      // subscript toggle defined a few lines above, so we leave Ctrl+= to
      // subscript and expose zoom-in via the QAT [+] button. To zoom in
      // from the keyboard, use Ctrl+0 first then the QAT, or step the QAT
      // dropdown directly.
      if (e.key === '0' && !e.shiftKey && !e.altKey && typeof setZoom === 'function') {
        return run(() => setZoom(100));
      }
      if (e.key === '-' && !e.altKey && !e.shiftKey && typeof setZoom === 'function') {
        return run(() => {
          const idx = ZOOM_LEVELS.indexOf(zoom);
          const next = idx < 0
            ? [...ZOOM_LEVELS].reverse().find((l) => l <= zoom) ?? 100
            : ZOOM_LEVELS[Math.max(0, idx - 1)];
          setZoom(next);
        });
      }

      // Clear character formatting (Ctrl+Space)
      if (e.key === ' ' && !e.shiftKey && !e.altKey) return run(() => editor.chain().focus().unsetAllMarks().run());

      // ── Paragraph alignment ───────────────────────────────
      if (!e.shiftKey && !e.altKey && key === 'l') return run(() => editor.chain().focus().setTextAlign('left').run());
      if (!e.shiftKey && !e.altKey && key === 'e') return run(() => editor.chain().focus().setTextAlign('center').run());
      if (!e.shiftKey && !e.altKey && key === 'r') return run(() => editor.chain().focus().setTextAlign('right').run());
      if (!e.shiftKey && !e.altKey && key === 'j') return run(() => editor.chain().focus().setTextAlign('justify').run());

      // Paragraph indent (Ctrl+M / Ctrl+Shift+M) — wrap can() so a transient
      // tiptap null doesn't swallow the keystroke.
      const _canList = (cmd) => {
        try {
          const c = editor?.can?.();
          const fn = c && c[cmd];
          return typeof fn === 'function' ? !!fn('listItem') : false;
        } catch { return false; }
      };
      if (key === 'm' && !e.shiftKey) return run(() => {
        if (_canList('sinkListItem')) editor.chain().focus().sinkListItem('listItem').run();
        else editor.chain().focus().increaseParagraphIndent().run();
      });
      if (key === 'm' && e.shiftKey) return run(() => {
        if (_canList('liftListItem')) editor.chain().focus().liftListItem('listItem').run();
        else editor.chain().focus().decreaseParagraphIndent().run();
      });

      // Reset paragraph (Ctrl+Q)
      if (key === 'q') return run(() => resetParagraph(editor));

      // Line spacing — Ctrl+1 / Ctrl+2 / Ctrl+5 (Word convention)
      if (!e.shiftKey && !e.altKey && e.key === '1') return run(() => editor.chain().focus().setLineHeight('1').run());
      if (!e.shiftKey && !e.altKey && e.key === '2') return run(() => editor.chain().focus().setLineHeight('2').run());
      if (!e.shiftKey && !e.altKey && e.key === '5') return run(() => editor.chain().focus().setLineHeight('1.5').run());

      // Ctrl+Shift+N = Normal style
      if (e.shiftKey && key === 'n') return run(() => editor.chain().focus().setParagraph().run());

      // ── Lists ─────────────────────────────────────────────
      if (e.shiftKey && key === 'l') return run(() => editor.chain().focus().toggleBulletList().run());
      if (e.shiftKey && e.key === '7') return run(() => editor.chain().focus().toggleOrderedList().run());

      // ── History ───────────────────────────────────────────
      if (key === 'z' && !e.shiftKey) return run(() => {
        editor.chain().focus().undo().run();
        // Undo is a discrete action (not rapid typing), so reflow content
        // back across pages IMMEDIATELY rather than waiting the typing
        // debounce — makes undo feel instant like Word.
        window.dispatchEvent(new CustomEvent('narrative-editor:paginate-now'));
      });
      if (key === 'y' || (e.shiftKey && key === 'z')) return run(() => {
        editor.chain().focus().redo().run();
        window.dispatchEvent(new CustomEvent('narrative-editor:paginate-now'));
      });

      // ── Track Changes ─────────────────────────────────────
      if (e.shiftKey && key === 'e') {
        return run(() => {
          const next = !trackChangesOnRef.current;
          setTrackChangesOn(next);
          editor.commands.setTrackChanges(next, trackAuthorRef.current);
        });
      }

      // ── Clipboard ─────────────────────────────────────────
      // Select all
      if (key === 'a') return run(() => editor.chain().focus().selectAll().run());

      // Copy / Cut — refocus editor and let browser/Prosemirror handle natively.
      if (key === 'c' && !e.shiftKey) {
        editor.commands.focus();
        // Don't preventDefault — let browser copy from contenteditable.
        return;
      }
      if (key === 'x' && !e.shiftKey) {
        editor.commands.focus();
        return;
      }
      if (key === 'v' && !e.shiftKey) {
        editor.commands.focus();
        return;
      }

      // Format Painter — Ctrl+Shift+C / Ctrl+Shift+V
      if (e.shiftKey && key === 'c') return run(() => editor.chain().pickupFormat().run());
      if (e.shiftKey && key === 'v') {
        if (editor.storage?.formatPainter?.active) {
          return run(() => editor.chain().applyFormat().run());
        }
        // Paste as plain text (strip source formatting)
        stop();
        navigator.clipboard.readText().then(text => {
          if (text) editor.chain().focus().insertContent(text).run();
        }).catch(() => {});
        return;
      }

      // ── Insert ────────────────────────────────────────────
      if (e.key === 'Enter') return run(() => {
        // Path A: insertPageBreak (splits the Page node). Path B:
        // insertPageBreakFlat (inserts a PageBreak block node which the
        // decoration plugin recognises as a forced boundary).
        const chain = editor.chain().focus();
        if (USE_FLAT_SCHEMA) chain.insertPageBreakFlat().run();
        else chain.insertPageBreak().run();
      });
      if (e.shiftKey && (e.key === '-' || e.key === '_')) return run(() => editor.chain().focus().insertContent('—').run());
      if (e.shiftKey && e.key === ' ')  return run(() => editor.chain().focus().insertContent(' ').run()); // non-breaking space
      // Ctrl+- (no shift) is reserved for zoom-out (handled earlier). The
      // soft/optional-hyphen mapping that used to live here was unreachable
      // once zoom was wired up and behaved inconsistently; removed so Ctrl+-
      // is unambiguous. (Insert a soft hyphen via the Symbol picker.) Was:
      // run(() => editor.chain().focus().insertContent('­').run());
      // ── Navigation ────────────────────────────────────────
      // Ctrl+Home / Ctrl+End — jump to document start / end. Use Tiptap's
      // focus('start'|'end') which resolves to a VALID text position rather
      // than the raw offsets 1 / size-1, which could land on a page/paragraph
      // boundary and leave the caret in a non-editable gap.
      if (e.key === 'Home') {
        return run(() => editor.chain().focus('start').scrollIntoView().run());
      }
      if (e.key === 'End') {
        return run(() => editor.chain().focus('end').scrollIntoView().run());
      }

      // ── Print ─────────────────────────────────────────────
      if (key === 'p') {
        if (typeof onPrint === 'function') {
          return run(() => onPrint());
        }
        // else let the browser handle Ctrl+P
        return;
      }
    };

    document.addEventListener('keydown', handler, true /* capture */);
    return () => document.removeEventListener('keydown', handler, true);
  }, [editor, onSave, onPrint, handleSave]);

  // Toolbar Find button dispatches a window event — listen and open the dialog
  useEffect(() => {
    const open = (e) => {
      setFindFocusReplace(!!e?.detail?.focusReplace);
      setFindOpen(true);
    };
    window.addEventListener('narrative-editor:open-find-replace', open);
    return () => window.removeEventListener('narrative-editor:open-find-replace', open);
  }, []);

  // Open the Sign dialog from outside (e.g. the host's Ctrl+Shift+S shortcut).
  // Don't reopen if the report is already locked.
  useEffect(() => {
    const open = () => { if (!isFinalized) setFinalizeOpen(true); };
    window.addEventListener('narrative-editor:open-finalize', open);
    return () => window.removeEventListener('narrative-editor:open-finalize', open);
  }, [isFinalized]);

  // Symbol picker open event
  useEffect(() => {
    const open = () => setSymbolOpen(true);
    window.addEventListener('narrative-editor:open-symbol-picker', open);
    return () => window.removeEventListener('narrative-editor:open-symbol-picker', open);
  }, []);

  // Generic in-editor prompt — replaces window.prompt() across the toolbar.
  // Listeners dispatch `narrative-editor:prompt` with detail.{title,message,defaultValue,placeholder,resolve}.
  useEffect(() => {
    const open = (e) => setPromptState(e.detail || null);
    window.addEventListener('narrative-editor:prompt', open);
    return () => window.removeEventListener('narrative-editor:prompt', open);
  }, []);

  // Open shortcuts cheat-sheet via Ribbon "?" button
  useEffect(() => {
    const open = () => setShortcutsOpen(true);
    window.addEventListener('narrative-editor:open-shortcuts', open);
    return () => window.removeEventListener('narrative-editor:open-shortcuts', open);
  }, []);

  // Dialog-launcher events from Ribbon group corners. The Group launcher
  // dispatches with detail.anchor = the button's bounding rect, so the
  // dialogs can render as popovers under the launcher.
  useEffect(() => {
    const openFont = (e) => { setFontDlgAnchor(e?.detail?.anchor || null); setFontDlgOpen(true); };
    const openPara = (e) => { setParagraphDlgAnchor(e?.detail?.anchor || null); setParagraphDlgOpen(true); };
    window.addEventListener('narrative-editor:open-font-dialog', openFont);
    window.addEventListener('narrative-editor:open-paragraph-dialog', openPara);
    return () => {
      window.removeEventListener('narrative-editor:open-font-dialog', openFont);
      window.removeEventListener('narrative-editor:open-paragraph-dialog', openPara);
    };
  }, []);

  // Header / footer dialog launcher
  useEffect(() => {
    const open = (e) => {
      setHeaderFooterFocus(e?.detail?.focus || 'header');
      setHeaderFooterOpen(true);
    };
    window.addEventListener('narrative-editor:open-header-footer', open);
    return () => window.removeEventListener('narrative-editor:open-header-footer', open);
  }, []);

  // Native browser spellcheck stays OFF permanently — our radiology-aware
  // SpellCheck plugin owns the underline now (the browser would otherwise flag
  // every RadLex term and ignore en-GB). The `spellcheckOn` toggle drives our
  // checker, wired in the effect below.
  useEffect(() => {
    if (!editor) return;
    const el = editor.view?.dom;
    if (el) el.setAttribute('spellcheck', 'false');
  }, [editor]);

  // Live spell-check: scan on edits (debounced) while the toggle is on, push a
  // wavy-red decoration set, and skip the word under the caret so it doesn't
  // underline mid-type. Detection/suggestions live in src/data/spellDictionary.
  useEffect(() => {
    if (!editor) return undefined;
    let cancelled = false;
    let timer = null;
    // Dirty-range tracker: accumulates the edited region (in current-doc coords)
    // between debounced scans so we only re-check the changed block(s). `.full`
    // forces a whole-document rescan (first run, undo/redo, paste, multi-step).
    const dirty = { from: null, to: null, full: true };

    // Expand a position range out to the enclosing text-block boundaries so a
    // word is never split across the scanned slice.
    const blockRange = (doc, from, to) => {
      const size = doc.content.size;
      const f = Math.max(0, Math.min(from, size));
      const t = Math.max(0, Math.min(to, size));
      let bFrom = 0, bTo = size;
      try { const $f = doc.resolve(f); bFrom = $f.start($f.depth); } catch { bFrom = 0; }
      try { const $t = doc.resolve(t); bTo = $t.end($t.depth); } catch { bTo = size; }
      if (bFrom > bTo) { bFrom = 0; bTo = size; }
      return { from: bFrom, to: bTo };
    };

    const run = () => {
      if (cancelled || editor.isDestroyed) return;
      const { selection, doc } = editor.state;
      const head = selection.empty ? selection.head : null;
      const useIncremental = !dirty.full && dirty.from != null && dirty.to != null;
      if (useIncremental) {
        try {
          const { from, to } = blockRange(doc, dirty.from, dirty.to);
          let set = spellCheckKey.getState(editor.state) || DecorationSet.empty;
          const stale = set.find(from, to);
          if (stale.length) set = set.remove(stale);
          const fresh = buildSpellDecorationsForRange(doc, isWordValid, head, from, to);
          if (fresh.length) set = set.add(doc, fresh);
          editor.commands.setSpellDecorations(set);
        } catch {
          editor.commands.setSpellDecorations(buildSpellDecorations(doc, isWordValid, head));
        }
      } else {
        editor.commands.setSpellDecorations(buildSpellDecorations(doc, isWordValid, head));
      }
      dirty.from = null; dirty.to = null; dirty.full = false;
    };
    recheckSpellRef.current = () => { dirty.full = true; run(); };

    if (!spellcheckOn) {
      editor.commands.clearSpellDecorations();
      return () => { recheckSpellRef.current = () => {}; };
    }

    const schedule = () => { if (timer) clearTimeout(timer); timer = setTimeout(run, 400); };
    // Track the edited region from each transaction. A single-step edit (typing)
    // gets the fast incremental path; anything else falls back to a full rescan.
    const onUpdate = ({ transaction }) => {
      if (transaction?.docChanged) {
        if (transaction.mapping.maps.length === 1) {
          // Re-map the accumulated range into the new doc, then union the change.
          if (dirty.from != null) {
            dirty.from = transaction.mapping.map(dirty.from, -1);
            dirty.to = transaction.mapping.map(dirty.to, 1);
          }
          let cf = Infinity, ct = -1;
          transaction.mapping.maps[0].forEach((_os, _oe, ns, ne) => {
            if (ns < cf) cf = ns;
            if (ne > ct) ct = ne;
          });
          if (cf <= ct) {
            dirty.from = dirty.from == null ? cf : Math.min(dirty.from, cf);
            dirty.to = dirty.to == null ? ct : Math.max(dirty.to, ct);
          } else {
            dirty.full = true;
          }
        } else {
          dirty.full = true; // multi-step (paste/undo/replace) → rescan all
        }
      }
      schedule();
    };
    // First scan once the dictionaries are warm (full), then incrementally on edit.
    warmSpellDictionary().then(() => { if (!cancelled) { dirty.full = true; run(); } });
    editor.on('update', onUpdate);
    return () => {
      cancelled = true;
      recheckSpellRef.current = () => {};
      editor.off('update', onUpdate);
      if (timer) clearTimeout(timer);
    };
  }, [editor, spellcheckOn]);

  // Bridge the SpellCheck plugin's click/right-click to the React popup.
  useEffect(() => {
    if (!editor?.storage?.spellCheck) return;
    editor.storage.spellCheck.onOpenSuggestions = (payload) => setSpellPopup({ open: true, ...payload });
  }, [editor]);

  // Auto-save: debounce 3 s after last change, then call onSave()
  useEffect(() => {
    if (!editor || !onSave) return;
    const handleUpdate = () => {
      setSaveStatus('modified');
      clearTimeout(autoSaveTimerRef.current);
      clearTimeout(fadeTimerRef.current);
      autoSaveTimerRef.current = setTimeout(() => {
        setSaveStatus('saving');
        try { onSave(); } catch (_) { /* ignore */ }
        setSaveStatus('saved');
        setLastSavedAt(new Date());
        fadeTimerRef.current = setTimeout(() => setSaveStatus(''), 3000);
      }, 3000);
    };
    editor.on('update', handleUpdate);
    return () => {
      editor.off('update', handleUpdate);
      clearTimeout(autoSaveTimerRef.current);
      clearTimeout(fadeTimerRef.current);
    };
  }, [editor, onSave]);

  // Inject / update header & footer divs on every .word-page element.
  // These sit alongside .word-page-inner (outside ProseMirror's content hole),
  // so ProseMirror will not overwrite them on re-renders.
  useEffect(() => {
    if (!containerRef.current) return;
    // Path A only — the flat schemas have no .word-page nodes. pageview feeds
    // chrome to PaginationDecoration; continuous renders chrome at print time.
    // Skipping here avoids a pointless per-update .word-page DOM query.
    if (USE_FLAT_SCHEMA) return;

    const applyToPages = () => {
      const pages = containerRef.current?.querySelectorAll('.word-page');
      if (!pages?.length) return;

      pages.forEach((page, idx) => {
        // ── Header ─────────────────────────────────────────
        let hdrEl = page.querySelector('.word-page-header');
        if (headerState.text) {
          if (!hdrEl) {
            hdrEl = document.createElement('div');
            hdrEl.className = 'word-page-header';
            page.insertBefore(hdrEl, page.firstChild);
          }
          const display = headerState.text.replace('{pageNumber}', String(idx + 1));
          hdrEl.textContent = display;
          hdrEl.style.fontFamily = headerState.fontFamily;
          hdrEl.style.fontSize = `${headerState.fontSize}pt`;
          hdrEl.style.textAlign = headerState.align;
        } else if (hdrEl) {
          hdrEl.remove();
        }

        // ── Footer ─────────────────────────────────────────
        let ftrEl = page.querySelector('.word-page-footer');
        if (footerState.text) {
          if (!ftrEl) {
            ftrEl = document.createElement('div');
            ftrEl.className = 'word-page-footer';
            page.appendChild(ftrEl);
          }
          const display = footerState.text.replace('{pageNumber}', String(idx + 1));
          ftrEl.textContent = display;
          ftrEl.style.fontFamily = footerState.fontFamily;
          ftrEl.style.fontSize = `${footerState.fontSize}pt`;
          ftrEl.style.textAlign = footerState.align;
        } else if (ftrEl) {
          ftrEl.remove();
        }
      });
    };

    applyToPages();
    // Re-apply whenever the editor updates (pagination may add/remove pages).
    editor?.on('update', applyToPages);
    return () => editor?.off('update', applyToPages);
  }, [editor, headerState, footerState, previewMode]);

  // Path B header/footer feed - the Path A effect above mutates .word-page
  // children directly, but on Path B there ARE no .word-page nodes. Instead
  // we hand the chrome to the PaginationDecoration plugin, which renders it
  // as widget decorations at each computed boundary + the doc edges.
  // Idempotent no-op when the flag is OFF (setPageChrome command isn't
  // registered without the extension).
  useEffect(() => {
    if (!editor || !USE_DECORATION_PAGINATION) return;
    if (typeof editor.commands.setPageChrome !== 'function') return;
    // Read the current banner height from the CSS var the bannerHostRef
    // effect maintains - whichever is later (banner mount or chrome push)
    // converges within one recompute.
    const bannerHeight = parseFloat(
      containerRef.current?.style?.getPropertyValue('--patient-banner-height') || '0'
    ) || 0;
    editor.commands.setPageChrome({
      header: {
        text: headerState.text || '',
        fontFamily: headerState.fontFamily,
        fontSize: parseFloat(headerState.fontSize) || 10,
        align: headerState.align,
      },
      footer: {
        text: footerState.text || '',
        fontFamily: footerState.fontFamily,
        fontSize: parseFloat(footerState.fontSize) || 10,
        align: footerState.align,
      },
      firstPageBannerHeight: bannerHeight,
    });
  }, [editor, headerState, footerState, firstPageBanner]);

  // ── Hardcoded first-page banner (patient header) ───────────────────────────
  // Rendered directly in JSX inside .word-canvas (outside ProseMirror's
  // managed DOM, so it cannot be wiped). Positioned absolutely to overlay
  // page 1's writable area; scrolls with the canvas content. Height is
  // measured and written to --patient-banner-height so page-1's inner
  // padding-top expands and typed content never sits under the banner.
  const bannerHostRef = useRef(null);
  useEffect(() => {
    const host = bannerHostRef.current;
    if (!host) {
      containerRef.current?.style.setProperty('--patient-banner-height', '0px');
      return;
    }
    const apply = () => {
      const h = host.offsetHeight || 0;
      containerRef.current?.style.setProperty('--patient-banner-height', `${h}px`);
    };
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(host);
    return () => ro.disconnect();
  }, [firstPageBanner]);

  // ── Ctrl+Mouse-Wheel zoom on the editor canvas ─────────────────────────
  // Browsers default Ctrl+Wheel to page-zoom. Inside the editor we redirect
  // it to the document's own zoom (the `zoom` state that drives the canvas's
  // --zoom CSS variable). preventDefault + capture phase wins back the
  // default, then we step the closest ZOOM_LEVELS entry.
  useEffect(() => {
    const canvas = containerRef.current?.querySelector('.word-canvas');
    if (!canvas) return;
    let lastWheelAt = 0;
    const onWheel = (e) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      // Throttle to ~10 wheel-ticks per second so a fast-scroll trackpad
      // doesn't fly from 50→200% in one gesture.
      const now = performance.now();
      if (now - lastWheelAt < 90) return;
      lastWheelAt = now;
      const dir = e.deltaY > 0 ? -1 : +1;
      const idx = ZOOM_LEVELS.indexOf(zoom);
      let next;
      if (idx < 0) {
        // Current zoom isn't a preset — snap to the nearest, then step.
        next = ZOOM_LEVELS.reduce((b, l) => Math.abs(l - zoom) < Math.abs(b - zoom) ? l : b, ZOOM_LEVELS[0]);
        const i2 = ZOOM_LEVELS.indexOf(next);
        next = ZOOM_LEVELS[Math.max(0, Math.min(ZOOM_LEVELS.length - 1, i2 + dir))];
      } else {
        next = ZOOM_LEVELS[Math.max(0, Math.min(ZOOM_LEVELS.length - 1, idx + dir))];
      }
      if (next !== zoom) setZoom(next);
    };
    // passive:false so preventDefault is honoured (Chrome treats wheel
    // listeners on scrollables as passive by default).
    canvas.addEventListener('wheel', onWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', onWheel);
  }, [zoom, setZoom]);

  // Track current page (most visible) + total pages.
  useEffect(() => {
    if (!editor) return;

    // Path A: doc.childCount === page-node count (cheap, exact). Flat schema:
    // childCount is the PARAGRAPH count, not pages — so measure the flat column
    // into A4 page groups instead. That's a layout read, so debounce it off the
    // typing hot path (the count is a status-bar number; ~300ms lag is invisible).
    let totalT = null;
    const updateTotal = () => {
      try {
        if (USE_FLAT_SCHEMA) {
          if (totalT) clearTimeout(totalT);
          totalT = setTimeout(() => {
            try { setTotalPages(countFlatPages(containerRef.current)); } catch {}
          }, 300);
        } else {
          setTotalPages(Math.max(1, editor.state.doc.childCount));
        }
      } catch {}
    };
    updateTotal();
    editor.on('update', updateTotal);

    let observer;
    let cleanupTimer;
    let detachFlatScroll = null;
    const attachObserver = () => {
      const canvas = containerRef.current?.querySelector('.word-canvas');
      if (!canvas) return;

      // Flat schema (continuous/pageview): no .word-page sheets to observe —
      // derive the current page from scroll position (page height = 1123px ×
      // zoom) against the column's top, via a scroll listener.
      if (USE_FLAT_SCHEMA) {
        detachFlatScroll?.();
        const col = canvas.querySelector('.narrative-editor-content');
        if (!col) return;
        const onScroll = () => {
          const zoom = parseFloat(window.getComputedStyle(col).getPropertyValue('--zoom')) || 1;
          const pageH = 1123 * zoom;
          const colTop = col.getBoundingClientRect().top - canvas.getBoundingClientRect().top;
          const page = Math.floor(Math.max(0, -colTop) / Math.max(1, pageH)) + 1;
          setCurrentPage(Math.max(1, Math.min(totalPagesRef.current || 1, page)));
        };
        canvas.addEventListener('scroll', onScroll, { passive: true });
        onScroll();
        detachFlatScroll = () => canvas.removeEventListener('scroll', onScroll);
        return;
      }

      const pages = canvas.querySelectorAll('.word-page');
      if (!pages.length) return;

      observer?.disconnect();
      const visibility = new Map();
      observer = new IntersectionObserver(
        (entries) => {
          entries.forEach(en => visibility.set(en.target, en.intersectionRatio));
          let bestIdx = 0;
          let bestRatio = -1;
          let i = 0;
          for (const p of pages) {
            const r = visibility.get(p) ?? 0;
            if (r > bestRatio) { bestRatio = r; bestIdx = i; }
            i++;
          }
          setCurrentPage(bestIdx + 1);
        },
        { root: canvas, threshold: [0, 0.25, 0.5, 0.75, 1] }
      );
      pages.forEach(p => observer.observe(p));
    };

    // Attach after the next paint so new .word-page divs exist.
    cleanupTimer = setTimeout(attachObserver, 50);
    const reattach = () => { clearTimeout(cleanupTimer); cleanupTimer = setTimeout(attachObserver, 50); };
    editor.on('update', reattach);

    return () => {
      clearTimeout(cleanupTimer);
      if (totalT) clearTimeout(totalT);
      observer?.disconnect();
      detachFlatScroll?.();
      editor.off('update', updateTotal);
      editor.off('update', reattach);
    };
  }, [editor]);

  const goToPage = (n) => {
    const canvas = containerRef.current?.querySelector('.word-canvas');
    if (!canvas) return;
    const pages = canvas.querySelectorAll('.word-page');
    if (pages.length) {
      const idx = Math.max(0, Math.min(pages.length - 1, n - 1));
      pages[idx]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    // Flat schema (continuous): one column, no sheets — scroll to the start of
    // page N (page height = 1123px × zoom), measured from the column's top.
    const col = canvas.querySelector('.narrative-editor-content');
    if (!col) return;
    const zoom = parseFloat(window.getComputedStyle(col).getPropertyValue('--zoom')) || 1;
    const pageH = 1123 * zoom;
    const colTopInContent = canvas.scrollTop + (col.getBoundingClientRect().top - canvas.getBoundingClientRect().top);
    canvas.scrollTo({ top: Math.max(0, colTopInContent + (n - 1) * pageH), behavior: 'smooth' });
  };

  // Keyword macro expansion — merges internal snippets with the external keywordLibrary prop
  useEffect(() => {
    if (!editor) return;
    // Normalize trigger: strip leading '/' so "/norm" and "norm" both match.
    const normTrigger = (t = '') => (t.startsWith('/') ? t.slice(1) : t).toLowerCase();
    const mergedLibrary = [
      ...snippets.map(s => ({ trigger: s.trigger, replacementText: s.content })),
      ...(keywordLibrary || []),
    ];
    editor.setOptions({
      editorProps: {
        ...editor.options.editorProps,
        handleKeyDown: (view, event) => {
          if (event.key !== 'Enter' && event.key !== ' ') return false;
          const { state } = view;
          const { $from, empty } = state.selection;
          if (!empty) return false;

          const textBefore = $from.parent.textBetween(0, $from.parentOffset, undefined, '￼');
          if (!textBefore) return false;

          const words = textBefore.split(/\s+/);
          const lastWord = words[words.length - 1];
          if (!lastWord) return false;

          const searchTrigger = lastWord.startsWith('/') ? lastWord.slice(1) : lastWord;
          const match = mergedLibrary.find(k =>
            normTrigger(k.trigger) === searchTrigger.toLowerCase()
          );

          if (!match) return false;

          event.preventDefault();
          const from = $from.pos - lastWord.length;
          const to = $from.pos;

          // Strip the editor's own page wrappers from the saved replacement HTML —
          // otherwise inserting a Page node inside an existing Page is rejected by
          // the schema and the content gets pushed to a new page.
          const tmp = document.createElement('div');
          tmp.innerHTML = match.replacementText || '';
          tmp.querySelectorAll('.word-page-inner, .word-page').forEach(el => {
            const parent = el.parentNode;
            while (el.firstChild) parent.insertBefore(el.firstChild, el);
            el.remove();
          });

          // If the replacement is a SINGLE top-level paragraph, unwrap it so the
          // content inserts inline on the current line (instead of splitting the
          // surrounding paragraph in two and creating an extra block — which made
          // expansions feel like they jumped to a new page).
          const topChildren = Array.from(tmp.children);
          if (topChildren.length === 1 && topChildren[0].tagName === 'P') {
            tmp.innerHTML = topChildren[0].innerHTML;
          }

          const rawHtml = tmp.innerHTML.replace(/\n/g, '<br>');

          // Insert raw HTML directly. Do NOT wrap in <strong> — if the replacement
          // contains block-level elements (paragraphs, headings, lists), wrapping
          // them in an inline mark produces invalid HTML and ProseMirror re-splits
          // it into separate blocks, breaking the line/page the user was on.
          editor.chain()
            .focus()
            .deleteRange({ from, to })
            .insertContent(rawHtml + (event.key === ' ' ? '&nbsp;' : ''))
            .run();

          return true;
        },
      },
    });
  }, [editor, keywordLibrary, snippets]);

  if (!editor) {
    return (
      <div className="narrative-editor-loading">
        <div className="loading-spinner" />
        <p>Loading editor...</p>
      </div>
    );
  }

  const wordCount = editor.storage.characterCount?.words() ?? 0;
  const charCount = editor.storage.characterCount?.characters() ?? 0;

  // Convert mm → px at 96 dpi for the protocol-driven margin CSS variables.
  const mmToPx = (mm) => `${(Number(mm) * 96 / 25.4).toFixed(2)}px`;
  const marginVars = {
    ...(pageMargins ? {
      '--page-margin-top':    mmToPx(pageMargins.top    ?? 25),
      '--page-margin-right':  mmToPx(pageMargins.right  ?? 20),
      '--page-margin-bottom': mmToPx(pageMargins.bottom ?? 20),
      '--page-margin-left':   mmToPx(pageMargins.left   ?? 20),
    } : {}),
    // Unified body font (points) — shared with preview + Word export.
    '--report-font-size': `${Number(bodyFontPt) > 0 ? Number(bodyFontPt) : 12}pt`,
    // Unified body line spacing — shared with preview + Word export. Only set
    // when supplied so the CSS fallback (1.15) stays the single default; never
    // a hardcoded value baked separately into editor vs preview.
    ...(Number(bodyLineHeight) > 0 ? { '--report-line-height': String(bodyLineHeight) } : {}),
  };

  return (
    <div ref={containerRef} data-ne-wm={watermark ? wmIdRef.current : undefined} className={`narrative-editor-container${isFinalized ? ' is-finalized' : ''}${cssFullscreen ? ' ne--css-fullscreen' : ''} ${className}`} style={{ ...style, ...marginVars }}>
      {/* Watermark — tiled diagonal text behind every page (screen + print). */}
      {watermark && (
        <style dangerouslySetInnerHTML={{ __html: `
          [data-ne-wm="${wmIdRef.current}"] .word-page,
          [data-ne-wm="${wmIdRef.current}"] .narrative-editor-content.flat-pagination,
          [data-ne-wm="${wmIdRef.current}"] .narrative-editor-content.flat-continuous {
            background-image: ${watermarkBackground(watermark)} !important;
            background-repeat: repeat !important;
            background-position: center !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
        ` }} />
      )}
      {!previewMode && isMobile && (
        <MobileToolbar
          editor={editor}
          onSave={handleSave}
          saveStatus={saveStatus}
          isFinalized={isFinalized}
          isFullscreen={isFullscreen || cssFullscreen}
          toggleFullscreen={toggleFullscreen}
          position="top"
        />
      )}
      {!previewMode && !isMobile && (
        <Ribbon
          editor={editor}
          onSave={handleSave}
          saveStatus={saveStatus}
          lastSavedAt={lastSavedAt}
          isFullscreen={isFullscreen || cssFullscreen}
          toggleFullscreen={toggleFullscreen}
          zoom={zoom}
          setZoom={setZoom}
          zoomLevels={ZOOM_LEVELS}
          wordCount={editor.storage.characterCount?.words() ?? 0}
          charCount={editor.storage.characterCount?.characters() ?? 0}
          spellcheckOn={spellcheckOn}
          onToggleSpellcheck={() => setSpellcheckOn(v => !v)}
          voiceSupported={voice.supported}
          voiceActive={voice.active}
          onToggleVoice={voice.toggle}
          showFormattingMarks={showFormattingMarks}
          onToggleFormattingMarks={() => setShowFormattingMarks(v => !v)}
          wordCountGoal={wordCountGoal}
          setWordCountGoal={setWordCountGoal}
          previewMode={previewMode}
          onTogglePreview={() => setPreviewMode(v => !v)}
          showRuler={showRuler}
          onToggleRuler={() => setShowRuler(v => !v)}
          onOpenTemplates={() => setTemplatesOpen(true)}
          onApplyTemplate={(html, opts) => {
            // QAT quick-pick path — applies a template directly without
            // opening the full dialog. opts.replace defaults to true since
            // templates are full-report scaffolds. Re-uses ensurePagedHTML
            // so the new content sits inside the editor's Page wrapper.
            if (!editor) return;
            if (opts?.replace !== false) {
              editor.commands.setContent(ensurePagedHTML(html), false);
            } else {
              editor.chain().focus().insertContent(html).run();
            }
          }}
          onOpenVersionHistory={() => setVersionsOpen(true)}
          onSaveVersion={saveVersion}
          onExportDocx={handleExportDocx}
          onExportPdf={handleExportPdf}
          onOpenFinalize={() => setFinalizeOpen(true)}
          isFinalized={isFinalized}
          onOpenNormalFindings={() => setNormalFindingsOpen(true)}
          onOpenMeasurement={() => setMeasurementOpen(true)}
          onOpenRads={() => setRadsOpen(true)}
          watermark={watermark}
          onSetWatermark={setWatermark}
          onRunQualityCheck={handleRunQualityCheck}
          onRunGrammarCheck={handleGrammarCheck}
          grammarLoading={grammarLoading}
          grammarMatchCount={grammarMatches.length}
          onRunTermCheck={handleTermCheck}
          termLoading={termLoading}
          onOpenSnippetManager={() => setSnippetManagerOpen(true)}
          editLog={editLog}
          trackChangesOn={trackChangesOn}
          trackChangeCount={trackChangeCount}
          onToggleTrackChanges={() => {
            const next = !trackChangesOn;
            setTrackChangesOn(next);
            editor?.commands.setTrackChanges(next, trackAuthorRef.current);
          }}
          onAcceptAll={() => { editor?.commands.acceptTrackChange(null); showToast('All changes accepted'); }}
          onRejectAll={() => { editor?.commands.rejectTrackChange(null); showToast('All changes rejected', 'warning'); }}
          commentsOpen={commentsOpen}
          onOpenComments={() => setCommentsOpen(v => !v)}
          onAddComment={() => {
            if (!editor || editor.state.selection.empty) return;
            const id = 'cmt-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
            editor.commands.addComment(id);
            setComments(prev => [
              ...prev,
              { id, text: '', author: trackAuthorRef.current, date: new Date().toISOString(), resolved: false, replies: [] },
            ]);
            setPendingCommentId(id);
            setCommentsOpen(true);
          }}
        />
      )}

      {/* RadAI — one-click cleanup, placed directly under the toolbar for easy
          access. Restructures the report AND fixes spelling/grammar in one pass,
          then opens the before/after review. Renders under the desktop ribbon and
          the mobile toolbar alike; inside containerRef so it survives fullscreen. */}
      {onWholeReportAi && !previewMode && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '6px 14px', borderBottom: '1px solid #ece9fb', background: 'linear-gradient(90deg,#faf9ff,#f3f0ff)', flexShrink: 0 }}>
          <button
            type="button"
            onClick={() => onWholeReportAi('polish')}
            disabled={aiBusy}
            title="RadAI — restructure & fix spelling in one click"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '7px', padding: '7px 16px', borderRadius: '999px', border: 'none', background: aiBusy ? '#c4b5fd' : 'linear-gradient(135deg,#7c3aed,#6d28d9)', color: '#fff', fontSize: '12px', fontWeight: 800, letterSpacing: '0.3px', cursor: aiBusy ? 'wait' : 'pointer', boxShadow: aiBusy ? 'none' : '0 2px 8px rgba(124,58,237,0.35)', transition: 'opacity 0.18s' }}
            onMouseEnter={(e) => { if (!aiBusy) e.currentTarget.style.opacity = '0.92'; }}
            onMouseLeave={(e) => { e.currentTarget.style.opacity = '1'; }}
          >
            <span aria-hidden="true">✨</span>
            <span>{aiBusy ? 'RadAI working…' : 'RadAI'}</span>
          </button>
          <span style={{ fontSize: '11px', fontWeight: 600, color: '#94a3b8' }}>One click — restructure &amp; fix spelling</span>
        </div>
      )}

      {isFinalized && (
        <div className="finalized-banner">
          {reportStatus === 'Addended'
            ? '🔒 This report is electronically signed, with one or more addenda.'
            : '🔒 This report has been electronically signed and finalized.'}
          <button className="finalized-addendum-btn" onClick={() => setAddendumOpen(true)}>
            + Addendum
          </button>
          {/* Server-backed reports are immutable — there is no client "unlock"
              (the server rejects edits to a signed report). The unlock affordance
              is kept ONLY for the standalone/demo fallback (no onFinalize host). */}
          {typeof onFinalize !== 'function' && (
            <button className="finalized-undo" onClick={() => { setIsFinalized(false); editor?.setEditable(true); }}>
              Unlock
            </button>
          )}
        </div>
      )}

      {/* Signature block — rendered from the server's signer snapshot (NOT the
          editor content, which stays exactly as signed). Shows for signed
          reports in a server-backed host. */}
      {typeof onFinalize === 'function' && signature && (reportStatus === 'Final' || reportStatus === 'Addended' || reportStatus === 'Preliminary') && (
        <div className="ne-signature-block" style={{
          margin: '12px 0 0', padding: '12px 16px', borderTop: '2px solid #e5e7eb',
          background: '#f8fafc', fontSize: 13, color: '#1e293b',
        }}>
          <div style={{ fontWeight: 700 }}>
            {reportStatus === 'Preliminary' ? 'Preliminary (wet read) — electronically signed by:' : 'Electronically signed by:'}
            {' '}{signature.name}{signature.credentials ? `, ${signature.credentials}` : ''}
          </div>
          {signature.signedAt && (
            <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
              {new Date(signature.signedAt).toLocaleString(undefined, { dateStyle: 'full', timeStyle: 'short' })}
            </div>
          )}
        </div>
      )}

      {/* Addenda — each is an immutable, separately-signed record. */}
      {typeof onFinalize === 'function' && Array.isArray(addenda) && addenda.length > 0 && (
        <div className="ne-addenda" style={{ margin: '8px 0 0' }}>
          {[...addenda].sort((a, b) => (a.sortOrder ?? a.SortOrder ?? 0) - (b.sortOrder ?? b.SortOrder ?? 0)).map((ad, i) => {
            const author = ad.authorName ?? ad.AuthorName ?? '';
            const cred = ad.authorCredentials ?? ad.AuthorCredentials ?? '';
            const when = ad.signedAt ?? ad.SignedAt;
            const body = ad.text ?? ad.Text ?? '';
            return (
              <div key={ad.id ?? ad.Id ?? i} style={{
                margin: '8px 0 0', padding: '12px 16px', border: '1px solid #fde68a',
                background: '#fffbeb', borderRadius: 8, fontSize: 13, color: '#1e293b',
              }}>
                <div style={{ fontWeight: 700, color: '#92400e' }}>
                  ADDENDUM {ad.sortOrder ?? ad.SortOrder ?? i + 1}
                </div>
                <div style={{ whiteSpace: 'pre-wrap', margin: '4px 0 6px' }}>{body}</div>
                <div style={{ fontSize: 12, color: '#78716c' }}>
                  {author}{cred ? `, ${cred}` : ''}
                  {when ? ` — ${new Date(when).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}` : ''}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {!previewMode && showRuler && (
        <HorizontalRuler editor={editor} zoom={zoom} pageMargins={pageMargins} />
      )}

      {/* Slash menu — type "/" in the editor to open a popover with Templates,
          Normal Findings, Measurement, and the full snippet library. The menu
          is non-blocking: if the typist ignores it and keeps typing, the
          existing snippet-expansion (Space after "/trigger") still fires
          exactly as before. */}
      {!previewMode && (
        <SlashMenu
          editor={editor}
          snippets={snippets}
          onOpenTemplates={() => setTemplatesOpen(true)}
          onOpenNormalFindings={() => setNormalFindingsOpen(true)}
          onOpenMeasurement={() => setMeasurementOpen(true)}
          onOpenRads={() => setRadsOpen(true)}
        />
      )}
      {!previewMode && <TermAutocomplete editor={editor} />}

      {/* Floating selection mini-toolbar — Word-style B/I/U/S/Highlight/Link
          bubble that appears above any non-empty text selection. Saves the
          typist a trip up to the Ribbon for one-off format changes. Hidden
          in preview mode. */}
      <SelectionToolbar editor={editor} previewMode={previewMode} containerRef={containerRef} onAiAssist={onAiAssist} />

      <div className={`word-canvas${USE_CONTINUOUS ? ' canvas-continuous' : ''}${showFormattingMarks ? ' show-formatting-marks' : ''}${previewMode ? ' preview-mode-canvas' : ''}`} style={{ '--zoom': zoom / 100, position: 'relative' }}>
        {previewMode && (
          <button
            onClick={() => setPreviewMode(false)}
            className="exit-preview-btn"
            title="Exit reading view and return to editing"
          >
            ✏️ Exit Reading View
          </button>
        )}
        {firstPageBanner && (
          <div ref={bannerHostRef} className="word-page-patient-banner">
            {firstPageBanner}
          </div>
        )}
        <EditorContent editor={editor} />

        {/* Onboarding hints — light-touch toast surface, one hint per
            device, never blocks the canvas. Self-rate-limits + reads
            editor state via the prop. */}
        <OnboardingHints editor={editor} />

        {/* ── Footnotes panel ─────────────────────────────────────────────── */}
        {editor && (() => {
          const fns = [];
          editor.state.doc.descendants((node) => {
            if (node.type.name === 'footnote')
              fns.push({ number: node.attrs.number, text: node.attrs.text });
          });
          if (!fns.length) return null;
          return (
            <div className="ne-footnotes-section">
              <hr className="ne-footnotes-rule" />
              {fns.map(fn => (
                <p key={fn.number} className="ne-footnote-item">
                  <sup className="ne-footnote-num">{fn.number}</sup>&nbsp;{fn.text}
                </p>
              ))}
            </div>
          );
        })()}

        <FindReplaceDialog editor={editor} open={findOpen} focusReplace={findFocusReplace} onClose={() => setFindOpen(false)} />
      </div>

      {/* Mobile bottom toolbar — placed AFTER the canvas so it sits at the
          bottom of the editor and stays visible above the soft keyboard. */}
      {!previewMode && isMobile && (
        <MobileToolbar
          editor={editor}
          isFinalized={isFinalized}
          position="bottom"
          onOpenRads={() => setRadsOpen(true)}
        />
      )}

      {/* ── Live spell-check correction popup ───────────────────────────── */}
      <SpellSuggestionPopup
        state={spellPopup}
        editor={editor}
        onClose={() => setSpellPopup({ open: false })}
        onAfterMutate={() => recheckSpellRef.current?.()}
      />

      {/* ── Grammar errors panel ────────────────────────────────────────── */}
      {grammarOpen && grammarMatches.length > 0 && (
        <div className="ne-grammar-panel">
          <div className="ne-grammar-panel__header">
            <span>🔍 Grammar &amp; Style — {grammarMatches.length} issue{grammarMatches.length !== 1 ? 's' : ''}</span>
            <div style={{ display: 'flex', gap: 6 }}>
              <button className="ne-grammar-panel__action" onClick={() => {
                editor.commands.clearGrammarDecorations();
                setGrammarMatches([]);
                setGrammarOpen(false);
              }}>Clear all</button>
              <button className="ne-grammar-panel__close" onClick={() => setGrammarOpen(false)}>✕</button>
            </div>
          </div>
          <div className="ne-grammar-panel__list">
            {grammarMatches.map((m, i) => (
              <div key={i} className={`ne-grammar-panel__item ne-grammar-panel__item--${m.issueType}`}>
                <div className="ne-grammar-panel__item-meta">
                  <span className={`ne-grammar-panel__badge ne-grammar-panel__badge--${m.issueType}`}>
                    {m.issueType}
                  </span>
                  <span className="ne-grammar-panel__category">{m.rule?.category?.name ?? ''}</span>
                </div>
                <div className="ne-grammar-panel__message">{m.message}</div>
                {m.context?.text && (
                  <div className="ne-grammar-panel__context">
                    "…{m.context.text.slice(Math.max(0, m.context.offset - 10), m.context.offset + m.context.length + 10)}…"
                  </div>
                )}
                {m.replacements?.length > 0 && (
                  <div className="ne-grammar-panel__fixes">
                    {m.replacements.slice(0, 3).map((r, ri) => (
                      <button key={ri} className="ne-grammar-panel__fix-btn" onClick={() => {
                        const { state } = editor;
                        // Re-locate: find the current text at the stored from/to
                        editor.chain().focus()
                          .setTextSelection({ from: m.from, to: m.to })
                          .insertContent(r.value)
                          .run();
                        // Remove this match
                        const next = grammarMatches.filter((_, j) => j !== i);
                        setGrammarMatches(next);
                        if (next.length === 0) { editor.commands.clearGrammarDecorations(); setGrammarOpen(false); }
                      }}>
                        {r.value}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <SymbolPickerDialog editor={editor} open={symbolOpen} onClose={() => setSymbolOpen(false)} />

      <PrintPreviewModal
        open={printPreviewOpen}
        onClose={() => setPrintPreviewOpen(false)}
        containerEl={containerRef.current}
        header={headerState.text ? headerState : undefined}
        footer={footerState.text ? footerState : undefined}
        showToast={showToast}
      />

      <ShortcutsDialog open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />

      <FontDialog editor={editor} open={fontDlgOpen} anchor={fontDlgAnchor} onClose={() => setFontDlgOpen(false)} />
      <ParagraphDialog editor={editor} open={paragraphDlgOpen} anchor={paragraphDlgAnchor} onClose={() => setParagraphDlgOpen(false)} />

      <HeaderFooterDialog
        open={headerFooterOpen}
        initialFocus={headerFooterFocus}
        header={headerState}
        footer={footerState}
        onSave={(h, f) => { setHeaderState(h); setFooterState(f); }}
        onClose={() => setHeaderFooterOpen(false)}
      />

      <ReportTemplatesDialog
        open={templatesOpen}
        onClose={() => setTemplatesOpen(false)}
        onInsert={(html) => {
          editor.chain().focus().insertContent(html).run();
        }}
        onReplace={(html) => {
          editor.commands.setContent(ensurePagedHTML(html), false);
        }}
      />

      <VersionHistoryDialog
        open={versionsOpen}
        versions={versions}
        onClose={() => setVersionsOpen(false)}
        onSave={saveVersion}
        onRestore={restoreVersion}
        onDelete={deleteVersion}
      />

      {/* ── Inline Comments Panel ── */}
      <CommentsPanel
        open={commentsOpen}
        comments={comments}
        pendingId={pendingCommentId}
        activeId={activeCommentId}
        onSetActive={setActiveCommentId}
        onSetText={(id, text) => {
          setComments(prev => prev.map(c => c.id === id ? { ...c, text } : c));
          setPendingCommentId(null);
        }}
        onAddReply={(id, text) => {
          setComments(prev => prev.map(c =>
            c.id === id
              ? { ...c, replies: [...(c.replies || []), { text, author: trackAuthorRef.current, date: new Date().toISOString() }] }
              : c
          ));
        }}
        onResolve={(id) => {
          setComments(prev => prev.map(c => c.id === id ? { ...c, resolved: true } : c));
        }}
        onDelete={(id) => {
          editor?.commands.removeComment(id);
          setComments(prev => prev.filter(c => c.id !== id));
          if (pendingCommentId === id) setPendingCommentId(null);
          if (activeCommentId === id) setActiveCommentId(null);
        }}
        onClose={() => setCommentsOpen(false)}
      />

      {/* ── Tier 2 Dialogs ── */}
      <NormalFindingsDialog
        open={normalFindingsOpen}
        onClose={() => setNormalFindingsOpen(false)}
        onInsert={(html) => editor?.chain().focus().insertContent(html).run()}
        onAppend={(html) => {
          if (!editor) return;
          editor.chain().focus().command(({ tr, state, dispatch }) => {
            if (dispatch) tr.setSelection(state.doc.resolve(state.doc.content.size - 1));
            return true;
          }).insertContent(html).run();
        }}
        onReplace={(html) => editor?.commands.setContent(ensurePagedHTML(html), false)}
      />

      <RadsDialog
        open={radsOpen}
        onClose={() => setRadsOpen(false)}
        onInsert={(html) => editor?.chain().focus().insertContent(html).run()}
      />

      <FinalizeDialog
        open={finalizeOpen}
        signerName={signerName}
        defaultName={trackAuthorRef.current}
        defaultCredentials={signerCredentials}
        onFinalize={handleFinalize}
        onClose={() => setFinalizeOpen(false)}
      />

      <MeasurementDialog
        open={measurementOpen}
        onInsert={(text) => editor?.chain().focus().insertContent(text).run()}
        onClose={() => setMeasurementOpen(false)}
      />

      {/* ── Tier 3 Dialogs ── */}
      <QualityCheckPanel
        open={qualityOpen}
        results={qualityResults}
        onRerun={handleRunQualityCheck}
        onClose={() => setQualityOpen(false)}
      />

      <SnippetManagerDialog
        open={snippetManagerOpen}
        onClose={() => setSnippetManagerOpen(false)}
        onChanged={(updated) => {
          setSnippets(updated);
          saveSnippets(updated);
        }}
      />

      <AddendumDialog
        open={addendumOpen}
        authorName={signerName}
        defaultAuthor={trackAuthorRef.current}
        onAddendum={handleAddendum}
        onClose={() => setAddendumOpen(false)}
      />

      {/* Medical autocomplete is now inline ghost text (MedicalAutocomplete
          extension) — Tab accepts the greyed completion. No dropdown. */}

      {/* Floating toolbars */}
      <TableToolbar editor={editor} containerRef={containerRef} />
      <ImageToolbar editor={editor} containerRef={containerRef} />
      <ContextMenu  editor={editor} containerRef={containerRef} />

      <PromptDialog
        open={!!promptState}
        title={promptState?.title}
        message={promptState?.message}
        defaultValue={promptState?.defaultValue || ''}
        placeholder={promptState?.placeholder}
        confirmLabel={promptState?.confirmLabel || 'OK'}
        cancelLabel={promptState?.cancelLabel || 'Cancel'}
        inputType={promptState?.inputType || 'text'}
        // Cursor anchor (friction #4). The keyboard handlers that fire
        // editorPrompt() compute coordsAtPos(selection.from) and pass it
        // through; PromptDialog renders as a popover instead of a centred
        // modal when this is present. Falls back to centre when absent.
        anchor={promptState?.anchor}
        onConfirm={(v) => { promptState?.resolve?.(v); setPromptState(null); }}
        onCancel={() => { promptState?.resolve?.(null); setPromptState(null); }}
      />

      {toasts.length > 0 && (
        <div className="ne-toasts">
          {toasts.map(t => (
            <div key={t.id} className={`ne-toast ne-toast--${t.type}`}>
              {t.type === 'success' && <span aria-hidden>✓</span>}
              {t.type === 'warning' && <span aria-hidden>⚠</span>}
              {t.type === 'error'   && <span aria-hidden>✗</span>}
              {t.type === 'info'    && <span aria-hidden>ℹ</span>}
              {t.message}
            </div>
          ))}
        </div>
      )}

      <div className="word-statusbar">
        <div className="statusbar-left">
          <span className="page-nav">
            <button
              onMouseDown={e => { e.preventDefault(); goToPage(currentPage - 1); }}
              disabled={currentPage <= 1}
              title="Previous page"
              className="page-nav-btn"
            >▲</button>
            <span>Page {currentPage} of {totalPages}</span>
            <button
              onMouseDown={e => { e.preventDefault(); goToPage(currentPage + 1); }}
              disabled={currentPage >= totalPages}
              title="Next page"
              className="page-nav-btn"
            >▼</button>
          </span>
          <span className="statusbar-sep" />
          <span
            className={
              wordCountGoal == null ? ''
              : wordCount >= wordCountGoal ? 'wc-goal-met'
              : wordCount >= wordCountGoal * 0.8 ? 'wc-goal-near'
              : 'wc-goal-under'
            }
            title={wordCountGoal ? `Goal: ${wordCountGoal} words` : undefined}
          >
            {wordCount} words{wordCountGoal ? ` / ${wordCountGoal}` : ''}
          </span>
          <span className="statusbar-sep" />
          <span>{charCount} characters</span>
          <span className="statusbar-sep" />
          <span title="Estimated reading time at 200 wpm">
            ~{Math.max(1, Math.ceil(wordCount / 200))} min read
          </span>
          {!editor.state.selection.empty && (() => {
            const { from, to } = editor.state.selection;
            const selTxt   = editor.state.doc.textBetween(from, to, '\n');
            const selWords = selTxt.trim() ? selTxt.trim().split(/\s+/).length : 0;
            return (
              <>
                <span className="statusbar-sep" />
                <span title="Selected text">{selWords}w selected</span>
              </>
            );
          })()}
        </div>
        <div className="statusbar-right">
          {saveStatus === 'modified' && <span className="autosave-status autosave-modified">Unsaved changes</span>}
          {saveStatus === 'saving'   && <span className="autosave-status autosave-saving">Saving…</span>}
          {saveStatus === 'saved'    && <span className="autosave-status autosave-saved">✓ Saved</span>}
          {!saveStatus && lastSavedAt && (
            <span className="autosave-status autosave-saved-idle"
                  title={`Last saved at ${lastSavedAt.toLocaleTimeString()}`}>
              Saved at {lastSavedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
          {(saveStatus || lastSavedAt) && <span className="statusbar-sep" />}
          <kbd>Ctrl+S</kbd><span> Save</span>
          <span className="statusbar-sep" />
          <kbd>Ctrl+F</kbd><span> Find</span>
          <span className="statusbar-sep" />
          <kbd>Ctrl+Z</kbd><span> Undo</span>
        </div>
      </div>
    </div>
  );
});

export default NarrativeEditor;
