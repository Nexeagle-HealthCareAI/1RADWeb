import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { editorPrompt } from './dialogs/PromptDialog';

const IBtn = ({ title, onClick, active, danger, children }) => (
  <button
    onMouseDown={e => { e.preventDefault(); onClick?.(); }}
    title={title}
    style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      height: '26px', minWidth: '28px', padding: '0 6px',
      background: active ? '#cce4f7' : 'transparent',
      border: `1px solid ${active ? '#90c8f0' : 'transparent'}`,
      cursor: 'pointer', borderRadius: '3px',
      fontSize: '12px', color: danger ? '#dc2626' : active ? '#003a75' : '#1f2937',
      fontFamily: '"Segoe UI", system-ui, sans-serif',
      whiteSpace: 'nowrap',
    }}
    onMouseEnter={e => {
      if (!active) e.currentTarget.style.background = danger ? '#fef2f2' : '#eff6ff';
    }}
    onMouseLeave={e => {
      if (!active) e.currentTarget.style.background = 'transparent';
    }}
  >{children}</button>
);

const IDivider = () => (
  <div style={{ width: '1px', height: '16px', background: '#d1d5db', margin: '0 3px', flexShrink: 0 }} />
);

/**
 * ImageToolbar — floating bar above a selected image.
 * Offers alignment (via parent paragraph text-align) and delete.
 */
export default function ImageToolbar({ editor, containerRef }) {
  const [rect, setRect] = useState(null);

  useEffect(() => {
    if (!editor) return;

    const update = () => {
      if (!editor.isActive('image')) {
        setRect(null);
        return;
      }
      // ProseMirror marks the selected node with this class
      const imgEl = containerRef.current?.querySelector('.ProseMirror-selectednode');
      if (imgEl?.tagName === 'IMG') {
        setRect(imgEl.getBoundingClientRect());
      } else {
        setRect(null);
      }
    };

    editor.on('selectionUpdate', update);
    editor.on('transaction', update);
    editor.on('blur', () => setRect(null));

    return () => {
      editor.off('selectionUpdate', update);
      editor.off('transaction', update);
      editor.off('blur', () => setRect(null));
    };
  }, [editor, containerRef]);

  if (!rect || !editor) return null;

  const target = document.fullscreenElement || document.body;
  const toolbarH = 34;
  const top = Math.max(4, rect.top - toolbarH - 4);
  const left = rect.left;

  const currentAlign = editor.getAttributes('paragraph')?.textAlign || 'left';

  return createPortal(
    <div
      onMouseDown={e => e.preventDefault()}
      style={{
        position: 'fixed',
        top,
        left,
        zIndex: 11500,
        background: '#ffffff',
        border: '1px solid #d1d5db',
        borderRadius: '5px',
        boxShadow: '0 3px 10px rgba(0,0,0,0.14)',
        display: 'flex',
        alignItems: 'center',
        padding: '0 4px',
        height: `${toolbarH}px`,
        gap: '1px',
        userSelect: 'none',
      }}
    >
      {/* Alignment */}
      <IBtn
        title="Align left"
        active={currentAlign === 'left'}
        onClick={() => editor.chain().focus().setTextAlign('left').run()}
      >⬅</IBtn>
      <IBtn
        title="Center"
        active={currentAlign === 'center'}
        onClick={() => editor.chain().focus().setTextAlign('center').run()}
      >↔</IBtn>
      <IBtn
        title="Align right"
        active={currentAlign === 'right'}
        onClick={() => editor.chain().focus().setTextAlign('right').run()}
      >➡</IBtn>

      <IDivider />

      {/* Width presets */}
      <IBtn
        title="25% width"
        onClick={() => editor.chain().focus().updateAttributes('image', { width: '25%' }).run()}
      >S</IBtn>
      <IBtn
        title="50% width"
        onClick={() => editor.chain().focus().updateAttributes('image', { width: '50%' }).run()}
      >M</IBtn>
      <IBtn
        title="75% width"
        onClick={() => editor.chain().focus().updateAttributes('image', { width: '75%' }).run()}
      >L</IBtn>
      <IBtn
        title="Full width"
        onClick={() => editor.chain().focus().updateAttributes('image', { width: '100%' }).run()}
      >Full</IBtn>

      <IDivider />

      {/* Alt text */}
      <IBtn
        title="Edit alt text (accessibility)"
        onClick={async () => {
          const current = editor.getAttributes('image').alt || '';
          const alt = await editorPrompt({
            title: 'Alt Text',
            message: 'Describe the image for screen readers and accessibility.',
            defaultValue: current,
            placeholder: 'e.g. Chest X-ray showing right-sided pleural effusion',
            confirmLabel: 'Save',
          });
          if (alt !== null) editor.chain().focus().updateAttributes('image', { alt }).run();
        }}
      >Alt</IBtn>

      <IDivider />

      {/* Delete */}
      <IBtn
        title="Delete image"
        danger
        onClick={() => editor.chain().focus().deleteSelection().run()}
      >🗑</IBtn>
    </div>,
    target
  );
}
