import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { FONT_FAMILIES, FONT_SIZES, STANDARD_COLORS } from '../Ribbon/RibbonControls';

/**
 * Word-style Font dialog. Opens from the Font group's launcher arrow.
 * Captures the current selection's marks and lets the user tweak them in
 * a single modal, then applies on OK.
 */
export default function FontDialog({ editor, open, onClose }) {
  const [family, setFamily] = useState('Calibri');
  const [size, setSize] = useState('12');
  const [bold, setBold] = useState(false);
  const [italic, setItalic] = useState(false);
  const [underline, setUnderline] = useState(false);
  const [strike, setStrike] = useState(false);
  const [color, setColor] = useState('#000000');
  const [highlight, setHighlight] = useState('');
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
    const ts = editor.getAttributes('textStyle') || {};
    setFamily(ts.fontFamily || 'Calibri');
    setSize((ts.fontSize || '12pt').replace('pt', ''));
    setBold(editor.isActive('bold'));
    setItalic(editor.isActive('italic'));
    setUnderline(editor.isActive('underline'));
    setStrike(editor.isActive('strike'));
    setColor(ts.color || '#000000');
    setHighlight(editor.getAttributes('highlight').color || '');
  }, [open, editor]);

  if (!open || !portalTarget) return null;

  const apply = () => {
    let c = editor.chain().focus();
    c = c.setMark('textStyle', { fontFamily: family, fontSize: `${size}pt` });
    // Marks — set or unset to match the dialog state
    if (bold !== editor.isActive('bold')) c = c.toggleBold();
    if (italic !== editor.isActive('italic')) c = c.toggleItalic();
    if (underline !== editor.isActive('underline')) c = c.toggleUnderline();
    if (strike !== editor.isActive('strike')) c = c.toggleStrike();
    if (color) c = c.setColor(color); else c = c.unsetColor();
    if (highlight) c = c.setHighlight({ color: highlight }); else c = c.unsetHighlight();
    c.run();
    onClose();
  };

  const previewStyle = {
    fontFamily: family,
    fontSize: `${Math.min(parseInt(size, 10) || 12, 36)}pt`,
    fontWeight: bold ? 700 : 400,
    fontStyle: italic ? 'italic' : 'normal',
    textDecoration: [
      underline ? 'underline' : '',
      strike ? 'line-through' : '',
    ].filter(Boolean).join(' '),
    color: color || '#000',
    background: highlight || 'transparent',
    padding: '2px 4px',
  };

  return createPortal(
    <div
      onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(10, 22, 40, 0.45)',
        backdropFilter: 'blur(2px)',
        zIndex: 13500, display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: '"Segoe UI", system-ui, sans-serif',
      }}
    >
      <div
        onMouseDown={e => e.stopPropagation()}
        style={{
          width: '460px', background: '#fff',
          borderRadius: '8px', boxShadow: '0 24px 60px rgba(0,0,0,0.3)',
          overflow: 'hidden',
        }}
      >
        <div style={{ padding: '14px 18px', borderBottom: '1px solid #f0f0f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: '14px', fontWeight: 600, color: '#1f2937' }}>Font</div>
          <button onMouseDown={e => { e.preventDefault(); onClose(); }} style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '20px', color: '#666' }}>×</button>
        </div>

        <div style={{ padding: '16px 18px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          <Field label="Font">
            <select value={family} onChange={e => setFamily(e.target.value)} style={selectStyle}>
              {FONT_FAMILIES.map(f => <option key={f} value={f} style={{ fontFamily: f }}>{f}</option>)}
            </select>
          </Field>
          <Field label="Size">
            <select value={size} onChange={e => setSize(e.target.value)} style={selectStyle}>
              {FONT_SIZES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </Field>
          <Field label="Style" full>
            <div style={{ display: 'flex', gap: '6px' }}>
              <StyleChip active={bold}      onClick={() => setBold(!bold)}      style={{ fontWeight: 700 }}>B</StyleChip>
              <StyleChip active={italic}    onClick={() => setItalic(!italic)}  style={{ fontStyle: 'italic' }}>I</StyleChip>
              <StyleChip active={underline} onClick={() => setUnderline(!underline)} style={{ textDecoration: 'underline' }}>U</StyleChip>
              <StyleChip active={strike}    onClick={() => setStrike(!strike)}  style={{ textDecoration: 'line-through' }}>S</StyleChip>
            </div>
          </Field>
          <Field label="Color">
            <ColorRow value={color} onChange={setColor} onClear={() => setColor('')} />
          </Field>
          <Field label="Highlight">
            <ColorRow value={highlight} onChange={setHighlight} onClear={() => setHighlight('')} />
          </Field>
        </div>

        <div style={{ margin: '0 18px 14px', padding: '14px', background: '#fafafa', border: '1px solid #e5e7eb', borderRadius: '4px' }}>
          <div style={{ fontSize: '10px', color: '#6b7280', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px' }}>Preview</div>
          <div style={previewStyle}>The quick brown fox jumps over the lazy dog.</div>
        </div>

        <div style={{ padding: '10px 18px', background: '#fafafa', borderTop: '1px solid #f0f0f0', display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
          <button onMouseDown={e => { e.preventDefault(); onClose(); }} style={btnSecondary}>Cancel</button>
          <button onMouseDown={e => { e.preventDefault(); apply(); }} style={btnPrimary}>OK</button>
        </div>
      </div>
    </div>,
    portalTarget
  );
}

const selectStyle = {
  width: '100%', height: '28px', padding: '0 8px',
  border: '1px solid #d1d5db', borderRadius: '4px',
  fontSize: '12px', outline: 'none', background: '#fff',
  fontFamily: 'inherit',
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

const Field = ({ label, full, children }) => (
  <div style={{ gridColumn: full ? '1 / -1' : 'auto' }}>
    <div style={{ fontSize: '10px', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>{label}</div>
    {children}
  </div>
);

const StyleChip = ({ active, onClick, style = {}, children }) => (
  <button
    onMouseDown={e => { e.preventDefault(); onClick(); }}
    style={{
      width: '32px', height: '28px',
      background: active ? '#cce4f7' : '#fff',
      border: `1px solid ${active ? '#0078d4' : '#d1d5db'}`,
      borderRadius: '4px', cursor: 'pointer',
      color: active ? '#003a75' : '#374151',
      fontSize: '13px', fontFamily: '"Segoe UI", sans-serif',
      ...style,
    }}
  >{children}</button>
);

const ColorRow = ({ value, onChange, onClear }) => (
  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', alignItems: 'center' }}>
    {STANDARD_COLORS.map(c => (
      <button
        key={c}
        onMouseDown={e => { e.preventDefault(); onChange(c); }}
        title={c}
        style={{
          width: '18px', height: '18px', background: c, padding: 0,
          border: value === c ? '2px solid #0078d4' : '1px solid rgba(0,0,0,0.15)',
          borderRadius: '3px', cursor: 'pointer',
        }}
      />
    ))}
    <button
      onMouseDown={e => { e.preventDefault(); onClear(); }}
      style={{
        height: '20px', padding: '0 8px', background: '#fff',
        border: '1px solid #d1d5db', borderRadius: '3px', cursor: 'pointer',
        fontSize: '10px', color: '#6b7280', fontFamily: 'inherit',
      }}
    >None</button>
    <input
      type="color"
      value={/^#[0-9a-f]{6}$/i.test(value) ? value : '#000000'}
      onChange={e => onChange(e.target.value)}
      style={{ width: '24px', height: '20px', border: 'none', padding: 0, cursor: 'pointer', background: 'transparent' }}
      title="Custom color"
    />
  </div>
);
