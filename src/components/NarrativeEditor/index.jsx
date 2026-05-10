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
import EditorToolbar from './EditorToolbar';
import './NarrativeEditor.css';

const NarrativeEditor = ({ 
  content = '', 
  onChange, 
  placeholder = 'Start typing your radiology report...',
  editable = true,
  onSave,
  className = '',
  keywordLibrary = []
}) => {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [1, 2, 3, 4, 5, 6],
        },
        bulletList: {
          keepMarks: true,
          keepAttributes: false,
        },
        orderedList: {
          keepMarks: true,
          keepAttributes: false,
        },
      }),
      Underline,
      TextAlign.configure({
        types: ['heading', 'paragraph'],
      }),
      TextStyle,
      Color,
      Highlight.configure({
        multicolor: true,
      }),
      Image.configure({
        inline: true,
        allowBase64: true,
      }),
      Table.configure({
        resizable: true,
      }),
      TableRow,
      TableCell,
      TableHeader,
      Placeholder.configure({
        placeholder,
      }),
      CharacterCount,
    ],
    content,
    editable,
    onUpdate: ({ editor }) => {
      const html = editor.getHTML();
      if (onChange) {
        onChange(html);
      }
    },
    editorProps: {
      attributes: {
        class: 'narrative-editor-content',
        'data-gramm': 'false',
        'data-gramm_editor': 'false',
        'data-enable-grammarly': 'false',
        spellcheck: 'false',
      },
    },
  });

  // Expose editor instance for external control
  React.useImperativeHandle(React.useRef(), () => ({
    getHTML: () => editor?.getHTML(),
    getText: () => editor?.getText(),
    setContent: (content) => editor?.commands.setContent(content),
    focus: () => editor?.commands.focus(),
    clear: () => editor?.commands.clearContent(),
  }));

  // Handle Ctrl+S for save
  React.useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        if (onSave) {
          onSave();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onSave]);

  // Handle Keyword Expansion (Macros)
  React.useEffect(() => {
    if (editor && keywordLibrary && keywordLibrary.length > 0) {
      editor.setOptions({
        editorProps: {
          ...editor.options.editorProps,
          handleKeyDown: (view, event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              const { state } = view;
              const { $from, empty } = state.selection;
              
              if (!empty) return false;

              // Get text before cursor in the current block
              const textBefore = $from.parent.textBetween(0, $from.parentOffset, undefined, '\ufffc');
              if (!textBefore) return false;
              
              const lastSegment = textBefore.split(/\s+/).pop();
              if (!lastSegment) return false;

              // Find matching macro
              const match = keywordLibrary.find(k => (k.trigger || '').toLowerCase() === lastSegment.toLowerCase());
              
              if (match) {
                event.preventDefault(); // Stop normal enter/space
                
                const from = $from.pos - lastSegment.length;
                const to = $from.pos;
                
                const html = (match.replacementText || '').replace(/\n/g, '<br>');
                
                // Chain: focus -> delete trigger text -> insert HTML -> run
                editor.chain().focus().deleteRange({ from, to }).insertContent(html).run();
                
                return true; // Indicate event was handled
              }
            }
            return false;
          }
        }
      });
    }
  }, [editor, keywordLibrary]);

  if (!editor) {
    return (
      <div className="narrative-editor-loading">
        <div className="loading-spinner"></div>
        <p>Loading editor...</p>
      </div>
    );
  }

  return (
    <div className={`narrative-editor-container ${className}`}>
      <EditorToolbar editor={editor} onSave={onSave} />
      <div className="narrative-editor-wrapper">
        <EditorContent editor={editor} />
      </div>
      <div className="narrative-editor-footer">
        <div className="editor-stats">
          <span className="stat-item">
            <strong>{editor.storage.characterCount?.characters() || 0}</strong> characters
          </span>
          <span className="stat-item">
            <strong>{editor.storage.characterCount?.words() || 0}</strong> words
          </span>
        </div>
        <div className="editor-shortcuts">
          <span className="shortcut-hint">
            <kbd>Ctrl+S</kbd> Save
          </span>
          <span className="shortcut-hint">
            <kbd>Ctrl+B</kbd> Bold
          </span>
          <span className="shortcut-hint">
            <kbd>Ctrl+I</kbd> Italic
          </span>
          <span className="shortcut-hint">
            <kbd>Ctrl+U</kbd> Underline
          </span>
        </div>
      </div>
    </div>
  );
};

export default NarrativeEditor;
