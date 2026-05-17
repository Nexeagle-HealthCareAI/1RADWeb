import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

const TBtn = ({ title, onClick, danger, children }) => (
  <button
    onMouseDown={e => { e.preventDefault(); onClick?.(); }}
    title={title}
    style={{
      display: 'inline-flex', alignItems: 'center', gap: '3px',
      height: '26px', padding: '0 7px',
      background: 'transparent', border: 'none',
      cursor: 'pointer', borderRadius: '3px',
      fontSize: '11px', whiteSpace: 'nowrap',
      color: danger ? '#dc2626' : '#1f2937',
      fontFamily: '"Segoe UI", system-ui, sans-serif',
    }}
    onMouseEnter={e => { e.currentTarget.style.background = danger ? '#fef2f2' : '#eff6ff'; }}
    onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
  >{children}</button>
);

const TDivider = () => (
  <div style={{ width: '1px', height: '16px', background: '#d1d5db', margin: '0 2px', flexShrink: 0 }} />
);

/**
 * TableToolbar — floating context bar that appears above any table the
 * cursor is inside. Self-contained: subscribes to editor transactions.
 */
export default function TableToolbar({ editor, containerRef }) {
  const [rect, setRect] = useState(null);

  useEffect(() => {
    if (!editor) return;

    const update = () => {
      if (!editor.isActive('table')) {
        setRect(null);
        return;
      }
      const { state, view } = editor;
      const { $from } = state.selection;

      // Walk up to find the table node position
      for (let d = $from.depth; d > 0; d--) {
        if ($from.node(d).type.name === 'table') {
          const tablePos = $from.before(d);
          const dom = view.nodeDOM(tablePos);
          if (dom) {
            setRect((dom).getBoundingClientRect());
          }
          return;
        }
      }
      setRect(null);
    };

    editor.on('transaction', update);
    editor.on('selectionUpdate', update);
    editor.on('focus', update);
    editor.on('blur', () => setRect(null));

    return () => {
      editor.off('transaction', update);
      editor.off('selectionUpdate', update);
      editor.off('focus', update);
      editor.off('blur', () => setRect(null));
    };
  }, [editor]);

  if (!rect || !editor) return null;

  const target = document.fullscreenElement || document.body;

  // Clamp to viewport
  const toolbarH = 34;
  const top = Math.max(4, rect.top - toolbarH - 4);
  const left = rect.left;

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
        userSelect: 'none',
        fontFamily: '"Segoe UI", system-ui, sans-serif',
      }}
    >
      {/* Row operations */}
      <TBtn title="Insert row above" onClick={() => editor.chain().focus().addRowBefore().run()}>
        ↑ Row
      </TBtn>
      <TBtn title="Insert row below" onClick={() => editor.chain().focus().addRowAfter().run()}>
        ↓ Row
      </TBtn>
      <TBtn title="Delete row" danger onClick={() => editor.chain().focus().deleteRow().run()}>
        ✕ Row
      </TBtn>

      <TDivider />

      {/* Column operations */}
      <TBtn title="Insert column to the left" onClick={() => editor.chain().focus().addColumnBefore().run()}>
        ← Col
      </TBtn>
      <TBtn title="Insert column to the right" onClick={() => editor.chain().focus().addColumnAfter().run()}>
        → Col
      </TBtn>
      <TBtn title="Delete column" danger onClick={() => editor.chain().focus().deleteColumn().run()}>
        ✕ Col
      </TBtn>

      <TDivider />

      {/* Cell operations */}
      <TBtn title="Merge selected cells" onClick={() => editor.chain().focus().mergeCells().run()}>
        ⊡ Merge
      </TBtn>
      <TBtn title="Split cell" onClick={() => editor.chain().focus().splitCell().run()}>
        ⊞ Split
      </TBtn>
      <TBtn title="Toggle header row" onClick={() => editor.chain().focus().toggleHeaderRow().run()}>
        ⊟ Header
      </TBtn>

      <TDivider />

      {/* Table delete */}
      <TBtn title="Delete entire table" danger onClick={() => editor.chain().focus().deleteTable().run()}>
        🗑 Table
      </TBtn>
    </div>,
    target
  );
}
