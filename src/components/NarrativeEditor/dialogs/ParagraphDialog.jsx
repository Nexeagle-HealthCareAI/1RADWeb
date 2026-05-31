import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

/**
 * Word-style Paragraph dialog. Opens from the Paragraph group's launcher
 * arrow. Reads the current paragraph's attributes, lets the user tweak
 * alignment, line spacing, and indentation, then applies on OK.
 *
 * Friction #4 — when `anchor` is provided ({top, left}), renders as a
 * popover under the launcher button instead of as a backdrop modal.
 */
export default function ParagraphDialog({ editor, open, anchor, onClose }) {
  const [alignment, setAlignment] = useState('left');
  const [lineHeight, setLineHeight] = useState('1.6');
  const [indent, setIndent] = useState(0);
  const [portalTarget, setPortalTarget] = useState(() =>
    (typeof document !== 'undefined' ? (document.fullscreenElement || document.body) : null)
  );

  useEffect(() => {
    const onFs = () => setPortalTarget(document.fullscreenElement || document.body);
    document.addEventListener('fullscreenchange', onFs);
    return () => document.removeEventListener('fullscreenchange', onFs);
  }, []);

  useEffect(() => {
    if (!open || !editor) return;
    setAlignment(
      editor.isActive({ textAlign: 'center' }) ? 'center' :
      editor.isActive({ textAlign: 'right' })  ? 'right'  :
      editor.isActive({ textAlign: 'justify' }) ? 'justify' :
      'left'
    );
    const p = editor.getAttributes('paragraph') || {};
    const h = editor.getAttributes('heading') || {};
    setLineHeight(String(p.lineHeight || h.lineHeight || '1.6'));
    setIndent(Number(p.indent || h.indent || 0));
  }, [open, editor]);

  // Outside-mousedown dismissal for the popover variant.
  const panelRef = useRef(null);
  useEffect(() => {
    if (!open || !anchor) return undefined;
    const h = (e) => {
      if (panelRef.current && panelRef.current.contains(e.target)) return;
      onClose?.();
    };
    document.addEventListener('mousedown', h, true);
    return () => document.removeEventListener('mousedown', h, true);
  }, [open, anchor, onClose]);

  if (!open || !portalTarget) return null;

  const apply = () => {
    let c = editor.chain().focus();
    c = c.setTextAlign(alignment);
    if (lineHeight && lineHeight !== '1.6') c = c.setLineHeight(lineHeight);
    else c = c.unsetLineHeight();
    // Indent — set absolute value by clearing then bumping the right number of times
    const currentIndent = Number(editor.getAttributes('paragraph').indent || editor.getAttributes('heading').indent || 0);
    const delta = indent - currentIndent;
    for (let i = 0; i < Math.abs(delta); i++) {
      c = delta > 0 ? c.increaseParagraphIndent() : c.decreaseParagraphIndent();
    }
    c.run();
    onClose();
  };

  const isPopover = !!anchor;
  const POPOVER_W = 440;
  const POPOVER_H_EST = 360;
  let popLeft = 0, popTop = 0;
  if (isPopover) {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    popLeft = Math.min(Math.max(8, anchor.left), vw - POPOVER_W - 8);
    popTop = anchor.top + 4;
    if (popTop + POPOVER_H_EST > vh - 8) {
      popTop = Math.max(8, anchor.top - POPOVER_H_EST - 8);
    }
  }

  const panel = (
    <div
      ref={panelRef}
      onMouseDown={e => e.stopPropagation()}
      style={{
        width: '440px', background: '#fff',
        borderRadius: isPopover ? '10px' : '8px',
        boxShadow: isPopover
          ? '0 12px 40px rgba(0,0,0,0.18), 0 2px 6px rgba(0,0,0,0.08)'
          : '0 24px 60px rgba(0,0,0,0.3)',
        border: isPopover ? '1px solid #e2e8f0' : 'none',
        overflow: 'hidden',
      }}
    >
        <div style={{ padding: '14px 18px', borderBottom: '1px solid #f0f0f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: '14px', fontWeight: 600, color: '#1f2937' }}>Paragraph</div>
          <button onMouseDown={e => { e.preventDefault(); onClose(); }} style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '20px', color: '#666' }}>×</button>
        </div>

        <div style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <Field label="Alignment">
            <div style={{ display: 'flex', gap: '6px' }}>
              {[
                { v: 'left',    label: 'Left' },
                { v: 'center',  label: 'Center' },
                { v: 'right',   label: 'Right' },
                { v: 'justify', label: 'Justify' },
              ].map(a => (
                <AlignBtn key={a.v} active={alignment === a.v} onClick={() => setAlignment(a.v)}>{a.label}</AlignBtn>
              ))}
            </div>
          </Field>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <Field label="Line Spacing">
              <select value={lineHeight} onChange={e => setLineHeight(e.target.value)} style={selectStyle}>
                <option value="1">Single (1.0)</option>
                <option value="1.15">1.15</option>
                <option value="1.5">1.5 lines</option>
                <option value="1.6">Default (1.6)</option>
                <option value="2">Double (2.0)</option>
                <option value="2.5">2.5</option>
                <option value="3">3.0</option>
              </select>
            </Field>
            <Field label="Indent (levels)">
              <input
                type="number" min={0} max={10}
                value={indent}
                onChange={e => setIndent(Math.max(0, Math.min(10, Number(e.target.value) || 0)))}
                style={{ ...selectStyle, padding: '0 8px' }}
              />
            </Field>
          </div>

          <div style={{ padding: '12px', background: '#fafafa', border: '1px solid #e5e7eb', borderRadius: '4px' }}>
            <div style={{ fontSize: '10px', color: '#6b7280', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px' }}>Preview</div>
            <div style={{
              padding: '8px 10px',
              textAlign: alignment,
              lineHeight,
              marginLeft: `${indent * 24}px`,
              fontSize: '12px', color: '#1f2937',
            }}>
              The quick brown fox jumps over the lazy dog. The quick brown fox jumps over the lazy dog. The quick brown fox jumps over the lazy dog.
            </div>
          </div>
        </div>

        <div style={{ padding: '10px 18px', background: '#fafafa', borderTop: '1px solid #f0f0f0', display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
          <button onMouseDown={e => { e.preventDefault(); onClose(); }} style={btnSecondary}>Cancel</button>
          <button onMouseDown={e => { e.preventDefault(); apply(); }} style={btnPrimary}>OK</button>
        </div>
    </div>
  );

  const wrapper = isPopover ? (
    <div
      style={{
        position: 'fixed', top: popTop, left: popLeft,
        zIndex: 13500,
        fontFamily: '"Segoe UI", system-ui, sans-serif',
      }}
    >
      {panel}
    </div>
  ) : (
    <div
      onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(10, 22, 40, 0.45)',
        backdropFilter: 'blur(2px)',
        zIndex: 13500, display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: '"Segoe UI", system-ui, sans-serif',
      }}
    >
      {panel}
    </div>
  );

  return createPortal(wrapper, portalTarget);
}

const selectStyle = {
  width: '100%', height: '28px', padding: '0 8px',
  border: '1px solid #d1d5db', borderRadius: '4px',
  fontSize: '12px', outline: 'none', background: '#fff',
  fontFamily: 'inherit', boxSizing: 'border-box',
};
const btnPrimary = {
  height: '30px', padding: '0 18px', background: '#0078d4', color: '#fff',
  border: 'none', borderRadius: '4px', cursor: 'pointer',
  fontSize: '12px', fontWeight: 600, fontFamily: 'inherit',
};
const btnSecondary = {
  height: '30px', padding: '0 16px', background: '#fff', color: '#374151',
  border: '1px solid #d1d5db', borderRadius: '4px', cursor: 'pointer',
  fontSize: '12px', fontWeight: 500, fontFamily: 'inherit',
};

const Field = ({ label, children }) => (
  <div>
    <div style={{ fontSize: '10px', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '5px' }}>{label}</div>
    {children}
  </div>
);

const AlignBtn = ({ active, onClick, children }) => (
  <button
    onMouseDown={e => { e.preventDefault(); onClick(); }}
    style={{
      flex: 1, height: '28px',
      background: active ? '#cce4f7' : '#fff',
      border: `1px solid ${active ? '#0078d4' : '#d1d5db'}`,
      borderRadius: '4px', cursor: 'pointer',
      color: active ? '#003a75' : '#374151',
      fontSize: '12px', fontWeight: 500, fontFamily: 'inherit',
    }}
  >{children}</button>
);
