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
import { PageDocument, Page } from './extensions/PageNode';
import { Pagination } from './extensions/Pagination';
import { LineHeight, ParagraphIndent, PageBreak } from './extensions/Spacing';
import FindReplaceDialog from './dialogs/FindReplaceDialog';
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
        spellcheck: 'false',
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

  // Ctrl+S / Ctrl+F / Ctrl+H handlers
  useEffect(() => {
    const handler = e => {
      const inEditor = containerRef.current?.contains(document.activeElement)
        || containerRef.current?.contains(e.target);

      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        onSave?.();
      } else if ((e.ctrlKey || e.metaKey) && (e.key === 'f' || e.key === 'F')) {
        if (inEditor) {
          e.preventDefault();
          setFindFocusReplace(false);
          setFindOpen(true);
        }
      } else if ((e.ctrlKey || e.metaKey) && (e.key === 'h' || e.key === 'H')) {
        if (inEditor) {
          e.preventDefault();
          setFindFocusReplace(true);
          setFindOpen(true);
        }
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onSave]);

  // Toolbar Find button dispatches a window event — listen and open the dialog
  useEffect(() => {
    const open = (e) => {
      setFindFocusReplace(!!e?.detail?.focusReplace);
      setFindOpen(true);
    };
    window.addEventListener('narrative-editor:open-find-replace', open);
    return () => window.removeEventListener('narrative-editor:open-find-replace', open);
  }, []);

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
      <EditorToolbar
        editor={editor}
        onSave={onSave}
        isFullscreen={isFullscreen}
        toggleFullscreen={toggleFullscreen}
        zoom={zoom}
        setZoom={setZoom}
        zoomLevels={ZOOM_LEVELS}
      />

      <div className="word-canvas" style={{ '--zoom': zoom / 100, position: 'relative' }}>
        <EditorContent editor={editor} />
        <FindReplaceDialog editor={editor} open={findOpen} focusReplace={findFocusReplace} onClose={() => setFindOpen(false)} />
      </div>

      <div className="word-statusbar">
        <div className="statusbar-left">
          <span>{wordCount} words</span>
          <span className="statusbar-sep" />
          <span>{charCount} characters</span>
        </div>
        <div className="statusbar-right">
          <kbd>Ctrl+S</kbd><span> Save</span>
          <span className="statusbar-sep" />
          <kbd>Ctrl+B</kbd><span> Bold</span>
          <span className="statusbar-sep" />
          <kbd>Ctrl+Z</kbd><span> Undo</span>
        </div>
      </div>
    </div>
  );
});

export default NarrativeEditor;
