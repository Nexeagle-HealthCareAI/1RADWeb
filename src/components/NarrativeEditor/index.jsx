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
import PromptDialog from './dialogs/PromptDialog';
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

  // MS Word-style keyboard shortcuts.
  // Tiptap StarterKit already handles: Ctrl+B/I, Ctrl+U (Underline), Ctrl+Z/Y,
  // Ctrl+Shift+8/7 (lists). We add what's missing.
  useEffect(() => {
    if (!editor) return;
    const handler = e => {
      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;
      const inEditor = containerRef.current?.contains(document.activeElement)
        || containerRef.current?.contains(e.target);
      const key = e.key.toLowerCase();

      // Global (app-level) shortcuts
      if (key === 's') { e.preventDefault(); onSave?.(); return; }

      if (!inEditor) return;

      // Find / Replace
      if (key === 'f') { e.preventDefault(); setFindFocusReplace(false); setFindOpen(true); return; }
      if (key === 'h') { e.preventDefault(); setFindFocusReplace(true);  setFindOpen(true); return; }

      // Alignment
      if (!e.shiftKey && key === 'l') { e.preventDefault(); editor.chain().focus().setTextAlign('left').run(); return; }
      if (key === 'e') { e.preventDefault(); editor.chain().focus().setTextAlign('center').run(); return; }
      if (!e.shiftKey && key === 'r') { e.preventDefault(); editor.chain().focus().setTextAlign('right').run(); return; }
      if (key === 'j') { e.preventDefault(); editor.chain().focus().setTextAlign('justify').run(); return; }

      // Headings (Ctrl+1..4 = H1..H4, Ctrl+0 = Normal)
      if (!e.shiftKey && ['1', '2', '3', '4'].includes(e.key)) {
        e.preventDefault();
        editor.chain().focus().setHeading({ level: parseInt(e.key, 10) }).run();
        return;
      }
      if (!e.shiftKey && e.key === '0') {
        e.preventDefault();
        editor.chain().focus().setParagraph().run();
        return;
      }

      // Insert link (Ctrl+K)
      if (key === 'k') {
        e.preventDefault();
        const url = window.prompt('Enter URL:', 'https://');
        if (url) editor.chain().focus().setLink({ href: url, target: '_blank' }).run();
        return;
      }

      // Format Painter — Ctrl+Shift+C captures, Ctrl+Shift+V applies
      if (e.shiftKey && key === 'c') { e.preventDefault(); editor.chain().pickupFormat().run(); return; }
      if (e.shiftKey && key === 'v') {
        if (editor.storage?.formatPainter?.active) {
          e.preventDefault();
          editor.chain().applyFormat().run();
          return;
        }
      }

      // Page break (Ctrl+Enter — same as Word)
      if (e.key === 'Enter') {
        e.preventDefault();
        editor.chain().focus().insertPageBreak().run();
        return;
      }

      // Clear formatting (Ctrl+Space — Word also uses this)
      if (key === ' ') {
        e.preventDefault();
        editor.chain().focus().unsetAllMarks().run();
        return;
      }

      // Print preview (Ctrl+P)
      if (key === 'p' && typeof window !== 'undefined') {
        // Let browser handle it
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onSave, editor]);

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
