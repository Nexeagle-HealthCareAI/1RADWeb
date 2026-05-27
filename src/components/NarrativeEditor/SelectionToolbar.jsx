import React, { useEffect, useState, useRef } from 'react';
import { createPortal } from 'react-dom';

/**
 * Word-style floating mini-toolbar that appears above a non-empty text
 * selection. Surfaces the formatting actions a typist reaches for AFTER
 * selecting text — Bold / Italic / Underline / Strike / Highlight / Link —
 * without making them travel up to the Ribbon for a single tap.
 *
 * Visibility rules:
 *   - selection has a width (not just a caret)
 *   - selection lives inside the editor (not on a side panel / dialog)
 *   - editor is editable (read-only / preview mode hides it)
 *
 * Click behaviour:
 *   - Buttons use onMouseDown + preventDefault so the underlying selection
 *     stays alive while the command runs. Without that, clicking the bubble
 *     would blur the editor and the command would have nothing to apply to.
 *
 * Positioning:
 *   - Anchors above the selection's bounding rect, falling back to below
 *     when there isn't 60 px of headroom (near the top of the viewport).
 *   - Re-measures on each selectionUpdate / transaction so the bubble
 *     follows the selection through line-wraps and document edits.
 */
const ToolbarBtn = ({ active, title, onPress, children }) => (
  <button
    type="button"
    title={title}
    aria-pressed={!!active}
    onMouseDown={(e) => { e.preventDefault(); onPress?.(); }}
    style={{
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      minWidth: '28px',
      height: '28px',
      padding: '0 6px',
      background: active ? 'rgba(255,255,255,0.18)' : 'transparent',
      color: active ? '#fff' : '#e2e8f0',
      border: '1px solid ' + (active ? 'rgba(255,255,255,0.32)' : 'transparent'),
      borderRadius: '5px',
      fontSize: '13px',
      fontWeight: active ? 800 : 600,
      cursor: 'pointer',
      transition: 'background 0.12s, color 0.12s, border-color 0.12s',
    }}
    onMouseEnter={(e) => { if (!active) { e.currentTarget.style.background = 'rgba(255,255,255,0.10)'; e.currentTarget.style.color = '#fff'; } }}
    onMouseLeave={(e) => { if (!active) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#e2e8f0'; } }}
  >
    {children}
  </button>
);

const Sep = () => (
  <div style={{
    width: '1px', height: '18px',
    background: 'rgba(255,255,255,0.18)',
    margin: '0 3px',
    flexShrink: 0,
  }} />
);

export default function SelectionToolbar({ editor, previewMode, containerRef }) {
  const [anchor, setAnchor] = useState(null); // { top, left, placement: 'above'|'below' }
  const [, force] = useState(0);
  const toolbarRef = useRef(null);

  useEffect(() => {
    if (!editor) return;

    const recompute = () => {
      // Force a re-read for active states even when anchor doesn't move
      force((n) => n + 1);

      if (previewMode || !editor.isEditable) { setAnchor(null); return; }
      const { state } = editor;
      const { from, to, empty } = state.selection;
      if (empty || to === from) { setAnchor(null); return; }

      // Make sure the selection is inside the editor's DOM. If a parent
      // component has a focused input that produces a selection event, we
      // shouldn't react to it.
      const focusEl = document.activeElement;
      const editorEl = editor.view?.dom;
      if (focusEl && editorEl && !editorEl.contains(focusEl) && focusEl !== editorEl) {
        setAnchor(null);
        return;
      }

      let startCoords, endCoords;
      try {
        startCoords = editor.view.coordsAtPos(from);
        endCoords = editor.view.coordsAtPos(to);
      } catch (_) {
        setAnchor(null);
        return;
      }
      // Use the selection's bounding rect — midpoint horizontally, top
      // edge vertically. For multi-line selections this picks the top line.
      const left = (startCoords.left + endCoords.right) / 2;
      const topEdge = Math.min(startCoords.top, endCoords.top);
      const bottomEdge = Math.max(startCoords.bottom, endCoords.bottom);
      // Place ABOVE selection by default; flip to below if there's no room
      // (e.g., user is selecting text near the top of the viewport).
      const placeAbove = topEdge > 56;
      setAnchor({
        top: placeAbove ? topEdge - 8 : bottomEdge + 8,
        left,
        placement: placeAbove ? 'above' : 'below',
      });
    };

    editor.on('selectionUpdate', recompute);
    editor.on('transaction', recompute);
    editor.on('blur', () => setAnchor(null));
    // Hide on scroll — the bubble's coords would be stale until the next
    // selectionUpdate. Easier to vanish then re-show on the next selection.
    const onScroll = () => setAnchor(null);
    const scroller = containerRef?.current?.querySelector?.('.word-canvas') || window;
    scroller.addEventListener('scroll', onScroll, { passive: true });

    return () => {
      editor.off('selectionUpdate', recompute);
      editor.off('transaction', recompute);
      scroller.removeEventListener('scroll', onScroll);
    };
  }, [editor, previewMode, containerRef]);

  if (!editor || !anchor) return null;

  const isBold       = editor.isActive('bold');
  const isItalic     = editor.isActive('italic');
  const isUnderline  = editor.isActive('underline');
  const isStrike     = editor.isActive('strike');
  const isHighlight  = editor.isActive('highlight');
  const isLink       = editor.isActive('link');

  const insertLink = () => {
    const url = window.prompt('Link URL', 'https://');
    if (!url) return;
    if (isLink) {
      editor.chain().focus().extendMarkRange('link').unsetLink().setLink({ href: url }).run();
    } else {
      editor.chain().focus().setLink({ href: url }).run();
    }
  };

  return createPortal(
    <div
      ref={toolbarRef}
      role="toolbar"
      aria-label="Selection formatting"
      style={{
        position: 'fixed',
        top: anchor.top,
        left: anchor.left,
        transform: anchor.placement === 'above'
          ? 'translate(-50%, -100%)'
          : 'translate(-50%, 0)',
        zIndex: 99999,
        display: 'inline-flex',
        alignItems: 'center',
        gap: '2px',
        padding: '4px 6px',
        background: 'linear-gradient(180deg, #1e293b 0%, #0f172a 100%)',
        border: '1px solid rgba(255,255,255,0.10)',
        borderRadius: '8px',
        boxShadow: '0 10px 24px rgba(15,23,42,0.45)',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        userSelect: 'none',
        // Block native text-selection on the toolbar so a stray drag doesn't
        // overwrite the editor's selection.
        WebkitUserSelect: 'none',
      }}
      onMouseDown={(e) => e.preventDefault()}
    >
      <ToolbarBtn
        active={isBold}
        title="Bold (Ctrl+B)"
        onPress={() => editor.chain().focus().toggleBold().run()}
      >
        <span style={{ fontWeight: 900 }}>B</span>
      </ToolbarBtn>
      <ToolbarBtn
        active={isItalic}
        title="Italic (Ctrl+I)"
        onPress={() => editor.chain().focus().toggleItalic().run()}
      >
        <span style={{ fontStyle: 'italic', fontWeight: 700 }}>I</span>
      </ToolbarBtn>
      <ToolbarBtn
        active={isUnderline}
        title="Underline (Ctrl+U)"
        onPress={() => editor.chain().focus().toggleUnderline().run()}
      >
        <span style={{ textDecoration: 'underline', fontWeight: 700 }}>U</span>
      </ToolbarBtn>
      <ToolbarBtn
        active={isStrike}
        title="Strikethrough (Ctrl+Shift+X)"
        onPress={() => editor.chain().focus().toggleStrike().run()}
      >
        <span style={{ textDecoration: 'line-through', fontWeight: 700 }}>S</span>
      </ToolbarBtn>

      <Sep />

      <ToolbarBtn
        active={isHighlight}
        title="Highlight"
        onPress={() => editor.chain().focus().toggleHighlight({ color: '#fef08a' }).run()}
      >
        <span style={{
          display: 'inline-block',
          padding: '0 4px',
          fontSize: '11px',
          fontWeight: 800,
          background: isHighlight ? '#fef08a' : 'transparent',
          color: isHighlight ? '#713f12' : 'inherit',
          borderRadius: '3px',
        }}>
          ●
        </span>
      </ToolbarBtn>
      <ToolbarBtn
        active={isLink}
        title="Insert / edit link (Ctrl+K)"
        onPress={insertLink}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M10 13a5 5 0 0 0 7.07 0l3-3a5 5 0 0 0-7.07-7.07l-1.5 1.5" />
          <path d="M14 11a5 5 0 0 0-7.07 0l-3 3a5 5 0 0 0 7.07 7.07l1.5-1.5" />
        </svg>
      </ToolbarBtn>
    </div>,
    document.body
  );
}
