import React, { useRef, useState, useEffect, useImperativeHandle } from 'react';
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
import { Placeholder } from '@tiptap/extension-placeholder';
import { CharacterCount } from '@tiptap/extension-character-count';
import { Extension, Mark } from '@tiptap/core';
import EditorToolbar from './EditorToolbar';
import Ribbon from './Ribbon';
import { PageDocument, Page } from './extensions/PageNode';
import { Pagination } from './extensions/Pagination';
import { LineHeight, ParagraphIndent, PageBreak } from './extensions/Spacing';
import { FormatPainter } from './extensions/FormatPainter';
import FindReplaceDialog from './dialogs/FindReplaceDialog';
import SymbolPickerDialog from './dialogs/SymbolPickerDialog';
import PromptDialog, { editorPrompt } from './dialogs/PromptDialog';
import ShortcutsDialog from './dialogs/ShortcutsDialog';
import FontDialog from './dialogs/FontDialog';
import ParagraphDialog from './dialogs/ParagraphDialog';
import { FONT_SIZES } from './Ribbon/RibbonControls';
import { useVoiceDictation } from './hooks/useVoiceDictation';
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
}, ref) {
  const containerRef = useRef(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
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
    const onFsChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen();
    } else {
      document.exitFullscreen();
    }
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
      Underline,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      TextStyle,
      Color,
      Highlight.configure({ multicolor: true }),
      Image.configure({ inline: true, allowBase64: true }),
      Table.configure({ resizable: true }),
      TableRow,
      TableCell,
      TableHeader,
      Placeholder.configure({ placeholder }),
      CharacterCount,
      FontSize,
      FontFamily,
      Subscript,
      Superscript,
      Link,
    ],
    content: ensurePagedHTML(content),
    editable,
    onUpdate: ({ editor: e }) => onChange?.(e.getHTML()),
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

  // Expose methods to parent
  useImperativeHandle(ref, () => ({
    insertContent: (html) => {
      if (editor) {
        editor.chain().focus().insertContent(html).run();
      }
    },
    setContent: (html) => {
      if (editor) {
        editor.commands.setContent(html);
      }
    },
    getHTML: () => editor?.getHTML() || '',
    container: containerRef.current,
    editor
  }));

  // Sync content prop on initial load
  useEffect(() => {
    if (editor && content !== undefined && content !== editor.getHTML()) {
      if (!editor.isFocused || editor.isEmpty) {
        editor.commands.setContent(ensurePagedHTML(content), false);
      }
    }
  }, [content, editor]);

  // Refs that the keydown closure reads — keeps the effect deps minimal so the
  // listener isn't torn down and re-added on every scroll/page-count change.
  const currentPageRef = useRef(currentPage);
  const totalPagesRef = useRef(totalPages);
  const shortcutsOpenRef = useRef(shortcutsOpen);
  useEffect(() => { currentPageRef.current = currentPage; }, [currentPage]);
  useEffect(() => { totalPagesRef.current = totalPages; }, [totalPages]);
  useEffect(() => { shortcutsOpenRef.current = shortcutsOpen; }, [shortcutsOpen]);

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
          if (!document.fullscreenElement) containerRef.current?.requestFullscreen?.();
          else document.exitFullscreen?.();
        }
        return;
      }
      // Esc — close any of our open dialogs
      if (e.key === 'Escape') {
        if (shortcutsOpenRef.current) { e.preventDefault(); setShortcutsOpen(false); return; }
        // Find/Symbol dialogs handle their own Esc
        return;
      }

      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;
      if (!inEditor(e)) return;

      const key = e.key.toLowerCase();
      const stop = () => { e.preventDefault(); e.stopImmediatePropagation(); };
      const run = (fn) => { stop(); fn(); };

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
      if (!e.altKey && key === 'e')                return run(() => editor.chain().focus().setTextAlign('center').run());
      if (!e.shiftKey && !e.altKey && key === 'r') return run(() => editor.chain().focus().setTextAlign('right').run());
      if (!e.altKey && key === 'j')                return run(() => editor.chain().focus().setTextAlign('justify').run());

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

      // Headings — Ctrl+Alt+1..4 (Word), Ctrl+Shift+N = Normal
      if (e.altKey && ['1', '2', '3', '4'].includes(e.key)) {
        return run(() => editor.chain().focus().setHeading({ level: parseInt(e.key, 10) }).run());
      }
      if (e.shiftKey && key === 'n') return run(() => editor.chain().focus().setParagraph().run());

      // ── Lists ─────────────────────────────────────────────
      if (e.shiftKey && key === 'l') return run(() => editor.chain().focus().toggleBulletList().run());
      if (e.shiftKey && e.key === '7') return run(() => editor.chain().focus().toggleOrderedList().run());

      // ── History ───────────────────────────────────────────
      if (key === 'z' && !e.shiftKey) return run(() => editor.chain().focus().undo().run());
      if (key === 'y' || (e.shiftKey && key === 'z')) return run(() => editor.chain().focus().redo().run());

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
        return;
      }

      // ── Insert ────────────────────────────────────────────
      if (e.key === 'Enter') return run(() => editor.chain().focus().insertPageBreak().run());
      if (e.shiftKey && (e.key === '-' || e.key === '_')) return run(() => editor.chain().focus().insertContent('—').run());
      if (e.shiftKey && e.key === ' ') return run(() => editor.chain().focus().insertContent(' ').run());

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

  // Toggle the browser's native spellcheck attribute on the ProseMirror DOM.
  useEffect(() => {
    if (!editor) return;
    const el = editor.view?.dom;
    if (el) el.setAttribute('spellcheck', spellcheckOn ? 'true' : 'false');
  }, [editor, spellcheckOn]);

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

  // Keyword macro expansion
  useEffect(() => {
    if (!editor || !keywordLibrary?.length) return;
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
          const match = keywordLibrary.find(k =>
            (k.trigger || '').toLowerCase() === searchTrigger.toLowerCase()
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
  }, [editor, keywordLibrary]);

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
    <div ref={containerRef} className={`narrative-editor-container ${className}`} style={style}>
      <Ribbon
        editor={editor}
        onSave={onSave}
        isFullscreen={isFullscreen}
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
      />

      <div className="word-canvas" style={{ '--zoom': zoom / 100, position: 'relative' }}>
        <EditorContent editor={editor} />
        <FindReplaceDialog editor={editor} open={findOpen} focusReplace={findFocusReplace} onClose={() => setFindOpen(false)} />
      </div>

      <SymbolPickerDialog editor={editor} open={symbolOpen} onClose={() => setSymbolOpen(false)} />

      <ShortcutsDialog open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />

      <FontDialog editor={editor} open={fontDlgOpen} onClose={() => setFontDlgOpen(false)} />
      <ParagraphDialog editor={editor} open={paragraphDlgOpen} onClose={() => setParagraphDlgOpen(false)} />

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
          <span>{wordCount} words</span>
          <span className="statusbar-sep" />
          <span>{charCount} characters</span>
        </div>
        <div className="statusbar-right">
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
