import React from 'react';
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
import './NarrativeEditor.css';

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

const NarrativeEditor = ({
  content = '',
  onChange,
  placeholder = 'Start typing your radiology report...',
  editable = true,
  onSave,
  className = '',
  keywordLibrary = [],
}) => {
  const containerRef = React.useRef(null);
  const [isFullscreen, setIsFullscreen] = React.useState(false);
  const [zoom, setZoom] = React.useState(100);

  React.useEffect(() => {
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
        heading: { levels: [1, 2, 3, 4, 5, 6] },
        bulletList: { keepMarks: true, keepAttributes: false },
        orderedList: { keepMarks: true, keepAttributes: false },
      }),
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
    content,
    editable,
    onUpdate: ({ editor }) => onChange?.(editor.getHTML()),
    editorProps: {
      attributes: {
        class: 'narrative-editor-content',
        spellcheck: 'false',
      },
    },
  });

  // Sync content prop on initial load
  React.useEffect(() => {
    if (editor && content !== undefined && content !== editor.getHTML()) {
      if (!editor.isFocused || editor.isEmpty) {
        editor.commands.setContent(content, false);
      }
    }
  }, [content, editor]);

  // Ctrl+S handler
  React.useEffect(() => {
    const handler = e => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        onSave?.();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onSave]);

  // Keyword macro expansion
  React.useEffect(() => {
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
          const lastWord = textBefore.split(/\s+/).pop();
          if (!lastWord) return false;
          const match = keywordLibrary.find(k => (k.trigger || '').toLowerCase() === lastWord.toLowerCase());
          if (!match) return false;
          event.preventDefault();
          const from = $from.pos - lastWord.length;
          const to = $from.pos;
          const html = (match.replacementText || '').replace(/\n/g, '<br>');
          editor.chain().focus().deleteRange({ from, to }).insertContent(html).run();
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
    <div ref={containerRef} className={`narrative-editor-container ${className}`}>
      <EditorToolbar
        editor={editor}
        onSave={onSave}
        isFullscreen={isFullscreen}
        toggleFullscreen={toggleFullscreen}
        zoom={zoom}
        setZoom={setZoom}
        zoomLevels={ZOOM_LEVELS}
      />

      {/* Word-like gray canvas */}
      <div className="word-canvas">
        <div className="word-page" style={{ zoom: zoom / 100 }}>
          <EditorContent editor={editor} />
        </div>
      </div>

      {/* Status bar */}
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
};

export default NarrativeEditor;
