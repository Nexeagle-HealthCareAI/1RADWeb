import React, { useRef, useState, useEffect, useCallback, useImperativeHandle } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import { StarterKit } from '@tiptap/starter-kit';
import { Underline } from '@tiptap/extension-underline';
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
import { Extension, Mark } from '@tiptap/core';
import EditorToolbar from './EditorToolbar';
import Ribbon from './Ribbon';
import { PageDocument, Page } from './extensions/PageNode';
import { Pagination } from './extensions/Pagination';
import { LineHeight, ParagraphIndent, PageBreak } from './extensions/Spacing';
import { FormatPainter } from './extensions/FormatPainter';
import { ParagraphFraming } from './extensions/ParagraphFraming';
import { ListStyles } from './extensions/ListStyles';
import { Sort } from './extensions/Sort';
import { MultilevelList } from './extensions/MultilevelList';
import { PageNumber } from './extensions/PageNumberNode';
import { AutoCorrect } from './extensions/AutoCorrect';
import Footnote from './extensions/Footnote';
import { GrammarCheck, buildOffsetMap, buildGrammarDecorations } from './extensions/GrammarCheck';
import { TrackInsert, TrackDelete, TrackChanges } from './extensions/TrackChanges';
import { CommentMark, Comment } from './extensions/Comment';
import { MedicalAutocomplete } from './extensions/MedicalAutocomplete';
import { StructuredField } from './extensions/StructuredField';
import TableToolbar from './TableToolbar';
import ImageToolbar from './ImageToolbar';
import ContextMenu from './ContextMenu';
import FindReplaceDialog from './dialogs/FindReplaceDialog';
import SymbolPickerDialog from './dialogs/SymbolPickerDialog';
import PromptDialog, { editorPrompt } from './dialogs/PromptDialog';
import ShortcutsDialog from './dialogs/ShortcutsDialog';
import FontDialog from './dialogs/FontDialog';
import ParagraphDialog from './dialogs/ParagraphDialog';
import HeaderFooterDialog from './dialogs/HeaderFooterDialog';
import ReportTemplatesDialog from './dialogs/ReportTemplatesDialog';
import VersionHistoryDialog, { loadVersions, persistVersions, addVersion, removeVersion } from './dialogs/VersionHistoryDialog';
import CommentsPanel from './dialogs/CommentsPanel';
import NormalFindingsDialog from './dialogs/NormalFindingsDialog';
import FinalizeDialog from './dialogs/FinalizeDialog';
import MeasurementDialog from './dialogs/MeasurementDialog';
import QualityCheckPanel from './dialogs/QualityCheckPanel';
import SnippetManagerDialog from './dialogs/SnippetManagerDialog';
import AddendumDialog from './dialogs/AddendumDialog';
import HorizontalRuler from './HorizontalRuler';
import { FONT_SIZES } from './Ribbon/RibbonControls';
import { useVoiceDictation } from './hooks/useVoiceDictation';
import { exportToDocx } from './utils/exportDocx';
import { exportPdf } from './utils/exportPdf';
import { runQualityCheck } from './utils/reportQuality';
import { loadSnippets, saveSnippets } from './data/snippetStorage';
import './NarrativeEditor.css';

/**
 * Wrap raw HTML content in a <div class="word-page"> if it isn't already.
 * Ensures the editor's schema (doc -> page+) accepts legacy flat-HTML reports.
 */
function ensurePagedHTML(html) {
  const trimmed = (html || '').trim();
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
  if ($from.depth < 2) return;
  const pageNode = $from.node(1);
  const pagePos  = $from.before(1);
  const blockIdx = $from.index(1);
  const sibIdx   = direction === 'up' ? blockIdx - 1 : blockIdx + 1;
  if (sibIdx < 0 || sibIdx >= pageNode.childCount) return;
  const lowerIdx = Math.min(blockIdx, sibIdx);
  let lowerPos = pagePos + 1;
  for (let i = 0; i < lowerIdx; i++) lowerPos += pageNode.child(i).nodeSize;
  const lowerBlock = pageNode.child(lowerIdx);
  const upperBlock = pageNode.child(lowerIdx + 1);
  const rangeEnd   = lowerPos + lowerBlock.nodeSize + upperBlock.nodeSize;
  const tr = state.tr.replaceWith(lowerPos, rangeEnd, [upperBlock, lowerBlock]);
  tr.scrollIntoView();
  editor.view.dispatch(tr);
}

// ── Main component ────────────────────────────────────────────────────────────

const ZOOM_LEVELS = [50, 75, 90, 100, 110, 125, 150, 200];

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
  // Accepted but unused — kept so callers don't need to remove them yet.
  // The editor stays a stable A4 surface; the patient banner and the
  // protocol-margin preview overlay are rendered by the caller above the
  // editor (e.g., ReportingPage) so the editor itself doesn't get racy
  // DOM mutations during typing.
  pageMargins, // eslint-disable-line no-unused-vars
  firstPageBanner, // eslint-disable-line no-unused-vars
}, ref) {
  const containerRef = useRef(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  // CSS-only fallback fullscreen — used on iPad/Safari when requestFullscreen API is unavailable or fails
  const [cssFullscreen, setCssFullscreen] = useState(false);
  // Set to true just before we intentionally call exitFullscreen() so that
  // onFsChange can tell the difference between a user-initiated exit and iOS
  // auto-cancelling native fullscreen on scroll/app-switch.
  const exitingIntentionallyRef = useRef(false);
  const [zoom, setZoom] = useState(100);
  const [findOpen, setFindOpen] = useState(false);
  const [findFocusReplace, setFindFocusReplace] = useState(false);
  const [symbolOpen, setSymbolOpen] = useState(false);
  const [spellcheckOn, setSpellcheckOn] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [promptState, setPromptState] = useState(null); // {title, message, defaultValue, placeholder, resolve}
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [fontDlgOpen, setFontDlgOpen] = useState(false);
  const [paragraphDlgOpen, setParagraphDlgOpen] = useState(false);
  const [showFormattingMarks, setShowFormattingMarks] = useState(false);

  // Header / footer state — { text, fontFamily, fontSize, align }
  const [headerFooterOpen, setHeaderFooterOpen] = useState(false);
  const [headerFooterFocus, setHeaderFooterFocus] = useState('header');
  const [headerState, setHeaderState] = useState({ text: '', fontFamily: 'Calibri', fontSize: '9', align: 'left' });
  const [footerState, setFooterState] = useState({ text: '', fontFamily: 'Calibri', fontSize: '9', align: 'center' });

  // Auto-save
  const [saveStatus, setSaveStatus] = useState(''); // '' | 'modified' | 'saving' | 'saved'
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

  // Medical Autocomplete
  const [autocomplete, setAutocomplete] = useState({
    active: false, query: '', suggestions: [], from: 0, rect: null, selected: 0,
  });

  // Debounced onChange — avoid serialising the whole document to HTML on
  // every keystroke (which would cascade-re-render the entire ReportingPage).
  const onChangeRef = useRef(onChange);
  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);
  const onChangeTimerRef = useRef(null);
  const latestEditorRef = useRef(null);
  // Flush any pending HTML on unmount so we don't lose the last edit.
  useEffect(() => () => {
    if (onChangeTimerRef.current) {
      clearTimeout(onChangeTimerRef.current);
      try {
        const e = latestEditorRef.current;
        if (e) onChangeRef.current?.(e.getHTML());
      } catch (_) {}
    }
  }, []);

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
  });

  useEffect(() => {
    const onFsChange = () => {
      const active = !!(document.fullscreenElement || document.webkitFullscreenElement);
      setIsFullscreen(active);
      if (!active) {
        if (exitingIntentionallyRef.current) {
          // User tapped "Exit Fullscreen" — honour the intent and clear everything.
          setCssFullscreen(false);
        } else {
          // iOS/browser cancelled native fullscreen externally (scroll triggers
          // address-bar, app-switcher, etc.). Re-enter CSS fallback so the
          // user's fullscreen session is NOT interrupted by a stray scroll.
          setCssFullscreen(true);
        }
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
  useEffect(() => {
    const handler = (e) => {
      const d = e.detail;
      setAutocomplete(prev => ({
        active:      d.active,
        query:       d.query || '',
        suggestions: d.suggestions || [],
        from:        d.from ?? 0,
        rect:        d.rect ?? null,
        selected:    0,
      }));
    };
    window.addEventListener('narrative-editor:autocomplete', handler);
    return () => window.removeEventListener('narrative-editor:autocomplete', handler);
  }, []);

  // Keyboard navigation for autocomplete dropdown
  useEffect(() => {
    if (!autocomplete.active) return;
    const handler = (e) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setAutocomplete(prev => ({ ...prev, selected: Math.min(prev.selected + 1, prev.suggestions.length - 1) }));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setAutocomplete(prev => ({ ...prev, selected: Math.max(prev.selected - 1, 0) }));
      } else if (e.key === 'Enter' || e.key === 'Tab') {
        if (autocomplete.suggestions.length > 0) {
          e.preventDefault();
          const term = autocomplete.suggestions[autocomplete.selected];
          editor?.commands.insertAutocomplete({ term, from: autocomplete.from });
          setAutocomplete(prev => ({ ...prev, active: false }));
        }
      } else if (e.key === 'Escape') {
        setAutocomplete(prev => ({ ...prev, active: false }));
      }
    };
    document.addEventListener('keydown', handler, true);
    return () => document.removeEventListener('keydown', handler, true);
    // `editor` intentionally omitted from deps: it's referenced via lexical
    // closure with optional chaining and is initialised by `useEditor()` later
    // in the function body. Including it would trigger Temporal Dead Zone.
  }, [autocomplete.active, autocomplete.selected, autocomplete.suggestions, autocomplete.from]);

  const toggleFullscreen = () => {
    const el = containerRef.current;
    if (!el) return;

    // CSS fallback mode — just clear the class
    if (cssFullscreen) {
      setCssFullscreen(false);
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

  // ── Export PDF ────────────────────────────────────────────────────────────
  const handleExportPdf = () => {
    exportPdf(containerRef.current, {
      title: 'Radiology Report',
      header: headerState.text ? headerState : undefined,
      footer: footerState.text ? footerState : undefined,
    });
    showToast('PDF print dialog opened', 'info');
  };

  // ── Report Finalization ───────────────────────────────────────────────────
  const handleFinalize = ({ name, credentials, timestamp }) => {
    if (!editor) return;
    const credStr = credentials ? `, ${credentials}` : '';
    const sigBlock = `<hr><p><strong>Electronically signed by:</strong> ${name}${credStr}</p><p><strong>Date/Time:</strong> ${timestamp}</p><p><em>I attest that I have reviewed this report and it accurately reflects my interpretation of the imaging study.</em></p>`;
    editor.chain().focus().command(({ tr, dispatch, state }) => {
      if (dispatch) {
        const end = state.doc.content.size;
        tr.insertText('', end - 1); // move to end
      }
      return true;
    }).insertContent(sigBlock).run();
    editor.setEditable(false);
    setIsFinalized(true);
    setFinalizeOpen(false);
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

  // ── Grammar Check (LanguageTool free API) ─────────────────────────────────
  const handleGrammarCheck = async () => {
    if (!editor || grammarLoading) return;

    // One-time privacy acknowledgement stored in localStorage
    const ackKey = 'ne:lt-privacy-ack';
    if (!localStorage.getItem(ackKey)) {
      const ok = window.confirm(
        'Grammar Check sends the document text to api.languagetool.org for analysis.\n\n' +
        'Do not use this feature with documents that contain identifiable patient data, ' +
        'or ensure your organisation permits use of external grammar-check services.\n\n' +
        'Continue?'
      );
      if (!ok) return;
      localStorage.setItem(ackKey, '1');
    }

    setGrammarLoading(true);
    setGrammarMatches([]);
    editor.commands.clearGrammarDecorations();

    try {
      const text = editor.state.doc.textContent;
      if (!text.trim()) {
        showToast('Document is empty', 'info');
        return;
      }

      const resp = await fetch('https://api.languagetool.org/v2/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ text, language: 'en-US', enabledOnly: 'false' }),
      });

      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json();

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
      showToast('Grammar check failed — check your connection', 'error');
    } finally {
      setGrammarLoading(false);
    }
  };

  // ── Addendum ──────────────────────────────────────────────────────────────
  const handleAddendum = ({ author, text, timestamp }) => {
    if (!editor) return;
    const html = `<hr><p><strong>ADDENDUM</strong></p><p><strong>Author:</strong> ${author}</p><p><strong>Date/Time:</strong> ${timestamp}</p><p>${text.replace(/\n/g, '<br>')}</p>`;
    // Temporarily re-enable editing to insert addendum, then lock again
    editor.setEditable(true);
    editor.chain().focus().insertContent(html).run();
    editor.setEditable(false);
    setAddendumOpen(false);
  };

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        document: false, // we use our own PageDocument (schema: doc -> page+)
        heading: { levels: [1, 2, 3, 4, 5, 6] },
        bulletList: { keepMarks: true, keepAttributes: false },
        orderedList: { keepMarks: true, keepAttributes: false },
      }),
      PageDocument,
      Page,
      Pagination,
      LineHeight,
      ParagraphIndent,
      PageBreak,
      FormatPainter,
      ParagraphFraming,
      ListStyles,
      Sort,
      MultilevelList,
      PageNumber,
      AutoCorrect,
      Footnote,
      GrammarCheck,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
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
        try { onChangeRef.current?.(e.getHTML()); } catch (_) {}
      }, 300);
    },
    editorProps: {
      attributes: {
        class: 'narrative-editor-content',
        spellcheck: 'false', // toggled at runtime by spellcheckOn effect
      },
      // Strip <div class="word-page"> and <div class="word-page-inner"> wrappers
      // from pasted HTML so copy/paste from the editor itself does not create
      // page-in-page visuals.
      transformPastedHTML(html) {
        return (html || '')
          .replace(/<div[^>]*class="[^"]*word-page-inner[^"]*"[^>]*>/gi, '')
          .replace(/<div[^>]*class="[^"]*word-page[^"]*"[^>]*>/gi, '')
          .replace(/<\/div>\s*<\/div>(?=\s*(<div[^>]*class="[^"]*word-page|$))/gi, '');
      },
    },
  });

  // ── Track change count — update on every editor transaction ──────────────
  useEffect(() => {
    if (!editor) return;
    const update = () => {
      try {
        const count = editor.commands.getTrackChangeCount?.() ?? 0;
        setTrackChangeCount(count);
      } catch (_) {}
    };
    editor.on('update', update);
    return () => editor.off('update', update);
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
    container: containerRef.current,
    editor
  }));

  // Sync content prop → editor whenever it changes from the outside
  // (initial load, template selection, draft restore, etc.).
  // Guard: skip if the editor is focused AND already has the same text length —
  // this avoids clobbering live typing while still applying external changes.
  useEffect(() => {
    if (!editor || content === undefined) return;
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

  // (Patient banner / WYSIWYG margin overlays moved out of the editor — they
  // now live as a sibling element above the editor in the caller. This keeps
  // the editor a stable A4 surface and avoids Tiptap-vs-DOM race conditions.)

  // ── Footnote renumbering ──────────────────────────────────────────────────
  // Re-run whenever the doc changes and assign sequential [1], [2]… numbers to
  // all footnote atoms so they always reflect document order.
  useEffect(() => {
    if (!editor) return;
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
    editor.on('update', renumber);
    return () => editor.off('update', renumber);
  }, [editor]);

  // ── Insert-footnote custom event (fired from InsertTab button) ────────────
  useEffect(() => {
    if (!editor) return;
    const handler = async () => {
      const text = await editorPrompt({
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

    const inEditor = (e) =>
      containerRef.current?.contains(e.target) ||
      containerRef.current?.contains(document.activeElement);

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
      // F5 — Go to page (same as Ctrl+G)
      if (e.key === 'F5') {
        if (inEditor(e)) {
          e.preventDefault();
          e.stopImmediatePropagation();
          editorPrompt({
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
        // Explicit exit from browser fullscreen API. Some browsers' native
        // Esc-to-exit-fullscreen is unreliable when other capture-phase keydown
        // handlers are on `document`; do it ourselves to be safe.
        if (document.fullscreenElement && containerRef.current?.contains(document.fullscreenElement)) {
          e.preventDefault();
          document.exitFullscreen?.().catch(() => {});
          return;
        }
        // Find/Symbol dialogs handle their own Esc
        return;
      }

      // ── Tab — Word-style indent (no modifier required) ────
      if (e.key === 'Tab' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        if (!inEditor(e)) return;

        // Let the Table extension handle Tab inside table cells
        const { state } = editor;
        const $from = state.selection.$from;
        let insideTable = false;
        for (let d = $from.depth; d > 0; d--) {
          const name = $from.node(d).type.name;
          if (name === 'table') { insideTable = true; break; }
        }
        if (insideTable) return; // pass through to Tiptap's table keymap

        e.preventDefault();
        e.stopImmediatePropagation();

        if (e.shiftKey) {
          // Shift+Tab: lift list item or decrease paragraph indent
          if (editor.can().liftListItem('listItem')) {
            editor.chain().focus().liftListItem('listItem').run();
          } else {
            editor.chain().focus().decreaseParagraphIndent().run();
          }
        } else {
          // Tab: sink list item or increase paragraph indent
          if (editor.can().sinkListItem('listItem')) {
            editor.chain().focus().sinkListItem('listItem').run();
          } else {
            editor.chain().focus().increaseParagraphIndent().run();
          }
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
      if (key === 's' && !e.shiftKey) return run(() => onSave?.());

      // ── Find / Replace ────────────────────────────────────
      if (key === 'f') return run(() => { setFindFocusReplace(false); setFindOpen(true); });
      if (key === 'h') return run(() => { setFindFocusReplace(true);  setFindOpen(true); });

      // ── Go to page (Ctrl+G or F5) ─────────────────────────
      if (key === 'g') {
        return run(async () => {
          const n = await editorPrompt({
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
          const url = await editorPrompt({
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

      // Clear character formatting (Ctrl+Space)
      if (e.key === ' ' && !e.shiftKey && !e.altKey) return run(() => editor.chain().focus().unsetAllMarks().run());

      // ── Paragraph alignment ───────────────────────────────
      if (!e.shiftKey && !e.altKey && key === 'l') return run(() => editor.chain().focus().setTextAlign('left').run());
      if (!e.shiftKey && !e.altKey && key === 'e') return run(() => editor.chain().focus().setTextAlign('center').run());
      if (!e.shiftKey && !e.altKey && key === 'r') return run(() => editor.chain().focus().setTextAlign('right').run());
      if (!e.shiftKey && !e.altKey && key === 'j') return run(() => editor.chain().focus().setTextAlign('justify').run());

      // Paragraph indent (Ctrl+M / Ctrl+Shift+M)
      if (key === 'm' && !e.shiftKey) return run(() => {
        if (editor.can().sinkListItem('listItem')) editor.chain().focus().sinkListItem('listItem').run();
        else editor.chain().focus().increaseParagraphIndent().run();
      });
      if (key === 'm' && e.shiftKey) return run(() => {
        if (editor.can().liftListItem('listItem')) editor.chain().focus().liftListItem('listItem').run();
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
      if (key === 'z' && !e.shiftKey) return run(() => editor.chain().focus().undo().run());
      if (key === 'y' || (e.shiftKey && key === 'z')) return run(() => editor.chain().focus().redo().run());

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
      if (e.key === 'Enter') return run(() => editor.chain().focus().insertPageBreak().run());
      if (e.shiftKey && (e.key === '-' || e.key === '_')) return run(() => editor.chain().focus().insertContent('—').run());
      if (e.shiftKey && e.key === ' ')  return run(() => editor.chain().focus().insertContent(' ').run()); // non-breaking space
      if (!e.shiftKey && !e.altKey && e.key === '-') return run(() => editor.chain().focus().insertContent('­').run()); // soft/optional hyphen

      // ── Navigation ────────────────────────────────────────
      if (e.key === 'Home') {
        return run(() => {
          const size = editor.state.doc.content.size;
          editor.chain().focus().setTextSelection(1).scrollIntoView().run();
        });
      }
      if (e.key === 'End') {
        return run(() => {
          const size = editor.state.doc.content.size;
          editor.chain().focus().setTextSelection(size - 1).scrollIntoView().run();
        });
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
  }, [editor, onSave, onPrint]);

  // Toolbar Find button dispatches a window event — listen and open the dialog
  useEffect(() => {
    const open = (e) => {
      setFindFocusReplace(!!e?.detail?.focusReplace);
      setFindOpen(true);
    };
    window.addEventListener('narrative-editor:open-find-replace', open);
    return () => window.removeEventListener('narrative-editor:open-find-replace', open);
  }, []);

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

  // Dialog-launcher events from Ribbon group corners
  useEffect(() => {
    const openFont = () => setFontDlgOpen(true);
    const openPara = () => setParagraphDlgOpen(true);
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

  // Toggle the browser's native spellcheck attribute on the ProseMirror DOM.
  useEffect(() => {
    if (!editor) return;
    const el = editor.view?.dom;
    if (el) el.setAttribute('spellcheck', spellcheckOn ? 'true' : 'false');
  }, [editor, spellcheckOn]);

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

  // Track current page (most visible) + total pages.
  useEffect(() => {
    if (!editor) return;

    const updateTotal = () => {
      try {
        setTotalPages(Math.max(1, editor.state.doc.childCount));
      } catch {}
    };
    updateTotal();
    editor.on('update', updateTotal);

    let observer;
    let cleanupTimer;
    const attachObserver = () => {
      const canvas = containerRef.current?.querySelector('.word-canvas');
      if (!canvas) return;
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
      observer?.disconnect();
      editor.off('update', updateTotal);
      editor.off('update', reattach);
    };
  }, [editor]);

  const goToPage = (n) => {
    const canvas = containerRef.current?.querySelector('.word-canvas');
    if (!canvas) return;
    const pages = canvas.querySelectorAll('.word-page');
    const idx = Math.max(0, Math.min(pages.length - 1, n - 1));
    pages[idx]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
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

  return (
    <div ref={containerRef} className={`narrative-editor-container${isFinalized ? ' is-finalized' : ''}${cssFullscreen ? ' ne--css-fullscreen' : ''} ${className}`} style={style}>
      {!previewMode && (
        <Ribbon
          editor={editor}
          onSave={onSave}
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
          onOpenVersionHistory={() => setVersionsOpen(true)}
          onSaveVersion={saveVersion}
          onExportDocx={handleExportDocx}
          onExportPdf={handleExportPdf}
          onOpenFinalize={() => setFinalizeOpen(true)}
          isFinalized={isFinalized}
          onOpenNormalFindings={() => setNormalFindingsOpen(true)}
          onOpenMeasurement={() => setMeasurementOpen(true)}
          onRunQualityCheck={handleRunQualityCheck}
          onRunGrammarCheck={handleGrammarCheck}
          grammarLoading={grammarLoading}
          grammarMatchCount={grammarMatches.length}
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

      {isFinalized && (
        <div className="finalized-banner">
          🔒 This report has been electronically signed and finalized.
          <button className="finalized-addendum-btn" onClick={() => setAddendumOpen(true)}>
            + Addendum
          </button>
          <button className="finalized-undo" onClick={() => { setIsFinalized(false); editor?.setEditable(true); }}>
            Unlock
          </button>
        </div>
      )}

      {!previewMode && showRuler && (
        <HorizontalRuler editor={editor} zoom={zoom} />
      )}

      <div className={`word-canvas${showFormattingMarks ? ' show-formatting-marks' : ''}${previewMode ? ' preview-mode-canvas' : ''}`} style={{ '--zoom': zoom / 100, position: 'relative' }}>
        {previewMode && (
          <button
            onClick={() => setPreviewMode(false)}
            className="exit-preview-btn"
            title="Exit reading view and return to editing"
          >
            ✏️ Exit Reading View
          </button>
        )}
        <EditorContent editor={editor} />

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

      <ShortcutsDialog open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />

      <FontDialog editor={editor} open={fontDlgOpen} onClose={() => setFontDlgOpen(false)} />
      <ParagraphDialog editor={editor} open={paragraphDlgOpen} onClose={() => setParagraphDlgOpen(false)} />

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

      <FinalizeDialog
        open={finalizeOpen}
        defaultName={trackAuthorRef.current}
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
        defaultAuthor={trackAuthorRef.current}
        onAddendum={handleAddendum}
        onClose={() => setAddendumOpen(false)}
      />

      {/* ── Medical Autocomplete Dropdown ── */}
      {autocomplete.active && autocomplete.suggestions.length > 0 && autocomplete.rect && (
        <div
          className="ne-autocomplete-dropdown"
          style={{
            top:  Math.min(autocomplete.rect.bottom + 4, window.innerHeight - 200),
            left: Math.min(autocomplete.rect.left,       window.innerWidth  - 400),
          }}
          onMouseDown={e => e.preventDefault()} // keep editor focus
        >
          <div className="ne-autocomplete-header">Medical terms</div>
          {autocomplete.suggestions.map((term, i) => {
            const matchLen = autocomplete.query.length;
            return (
              <div
                key={term}
                className={`ne-autocomplete-item${i === autocomplete.selected ? ' ne-autocomplete-item--active' : ''}`}
                onMouseEnter={() => setAutocomplete(prev => ({ ...prev, selected: i }))}
                onMouseDown={() => {
                  editor?.commands.insertAutocomplete({ term, from: autocomplete.from });
                  setAutocomplete(prev => ({ ...prev, active: false }));
                }}
              >
                <span className="ne-autocomplete-item__match">{term.slice(0, matchLen)}</span>
                {term.slice(matchLen)}
              </div>
            );
          })}
        </div>
      )}

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
          {saveStatus && <span className="statusbar-sep" />}
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
