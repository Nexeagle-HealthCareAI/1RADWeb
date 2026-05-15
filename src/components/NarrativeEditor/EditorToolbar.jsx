import React, { useState, useRef, useEffect } from 'react';

// ── Tiny helpers ─────────────────────────────────────────────────────────────

const Btn = ({ onClick, disabled, active, title, children, style = {} }) => (
  <button
    onMouseDown={e => { e.preventDefault(); onClick?.(); }}
    disabled={disabled}
    title={title}
    style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      minWidth: '28px', height: '28px', padding: '0 5px',
      background: active ? '#cce4f7' : 'transparent',
      border: `1px solid ${active ? '#90c8f0' : 'transparent'}`,
      borderRadius: '3px', cursor: disabled ? 'not-allowed' : 'pointer',
      fontSize: '13px', color: active ? '#003a75' : '#323130',
      opacity: disabled ? 0.38 : 1, lineHeight: 1, flexShrink: 0,
      fontFamily: '"Segoe UI", system-ui, sans-serif',
      transition: 'background 0.08s, border-color 0.08s',
      ...style,
    }}
    onMouseEnter={e => { if (!disabled && !active) e.currentTarget.style.background = '#e8e8e8'; }}
    onMouseLeave={e => { if (!active) e.currentTarget.style.background = active ? '#cce4f7' : 'transparent'; }}
  >
    {children}
  </button>
);

const Sep = () => (
  <div style={{ width: '1px', height: '20px', background: '#c8c8c8', margin: '0 3px', flexShrink: 0 }} />
);

// ── SVG icon paths ────────────────────────────────────────────────────────────

const Icon = ({ d, size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" style={{ display: 'block', pointerEvents: 'none' }}>
    <path d={d} />
  </svg>
);

const ICONS = {
  undo: 'M3.5 6.5A5 5 0 0 1 13 8.5h1.5A6.5 6.5 0 0 0 3.25 4.19V2L0 5l3.25 3V6.5z',
  redo: 'M12.5 6.5A5 5 0 0 0 3 8.5H1.5A6.5 6.5 0 0 1 12.75 4.19V2L16 5l-3.25 3V6.5z',
  bold: 'M3 2h5.5a3.5 3.5 0 0 1 2.19 6.22A3.5 3.5 0 0 1 8.5 15H3V2zm2 5.5h3.5a1.5 1.5 0 0 0 0-3H5v3zm0 5h3.5a1.5 1.5 0 0 0 0-3H5v3z',
  italic: 'M7 2h6v2H10.58L7.42 12H10v2H4v-2h2.42L9.58 4H7V2z',
  underline: 'M3 1h2v7a3 3 0 0 0 6 0V1h2v7a5 5 0 0 1-10 0V1zm-1 13h12v2H2v-2z',
  strike: 'M8 5c-1.1 0-2 .4-2 1.5S7.2 8 8 8H2v2h12v-2H9c1-.3 3-.9 3-2.5C12 3.6 10.1 3 8 3 5.9 3 4 3.8 4 5.5h2C6 5.2 6.5 5 8 5zm-6 8h12v2H2v-2z',
  sub: 'M1 3l4 5 4-5h-2.5L5 5.5 3.5 3H1zm9 9h5v1.5h-3v1H15V16h-5v-1.5h3V13h-3V12z',
  sup: 'M1 13l4-5 4 5H7L5 10.5 3 13H1zm9-10h5v1.5h-3v1H15V7h-5V5.5h3V4.5h-3V3z',
  alignL: 'M2 3h12v2H2V3zm0 4h8v2H2V7zm0 4h12v2H2v-2z',
  alignC: 'M2 3h12v2H2V3zm3 4h6v2H5V7zm-3 4h12v2H2v-2z',
  alignR: 'M2 3h12v2H2V3zm4 4h8v2H6V7zm-4 4h12v2H2v-2z',
  alignJ: 'M2 3h12v2H2V3zm0 4h12v2H2V7zm0 4h12v2H2v-2z',
  bulletList: 'M2 4a1 1 0 1 1 0-2 1 1 0 0 1 0 2zm3-2h9v2H5V2zm-3 6a1 1 0 1 1 0-2 1 1 0 0 1 0 2zm3-2h9v2H5V6zm-3 6a1 1 0 1 1 0-2 1 1 0 0 1 0 2zm3-2h9v2H5v-2z',
  orderedList: 'M2 2h1v3H2V3H1V2h1zm2 1h9v2H4V3zm-2 5.5l.5-.5H3v-.5H1v.5h1l-.9 1.1.4.4H3V10H1v.5h2v-.5zm2-.5h9v2H4V8zm-3 5h2v.5H2v.5h1V15H1v.5h2V16H1v-4zm3 0h9v2H4v-2z',
  table: 'M1 1h14v14H1V1zm2 4v2h3V5H3zm5 0v2h3V5H8zm5 0v2h1V5h-1zM3 9v2h3V9H3zm5 0v2h3V9H8zm5 0v2h1V9h-1zm-7 4v2h3v-2H8zM3 13v2h3v-2H3zm10 0v2h1v-2h-1z',
  image: 'M14 2H2a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V3a1 1 0 0 0-1-1zM5.5 6a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm8.5 7H2l3.5-5L7 10l3-4 4 7z',
  link: 'M6.5 11.5a1 1 0 0 1-1.41 0L3.5 9.91A3 3 0 0 1 7.75 5.66L9.16 7.07A1 1 0 0 1 7.75 8.48L6.34 7.07a1 1 0 0 0-1.41 1.41L6.5 10.1a1 1 0 0 1 0 1.4zm3.06-7.06A3 3 0 0 1 13.82 8.7l-1.41-1.41A1 1 0 0 0 11 8.7l1.41 1.41a1 1 0 0 1-1.41 1.41L9.59 10.1a1 1 0 0 1 0-1.41l1.41-1.41A3 3 0 0 1 9.56 4.44zM1 15l3.54-3.54 1.06 1.06L2.06 16 1 15z',
  hr: 'M1 7h14v2H1z',
  clearFmt: 'M4.5 2L3 3.5 6.5 7l-5 8h2.4l3.6-6 1.5 1.5V12h2v-3.6L14.5 5 13 3.5l-2 2L4.5 2z',
  fullscreen: 'M1 1h5v2H3v3H1V1zm9 0h5v5h-2V3h-3V1zm-9 9h2v3h3v2H1v-5zm12 3h-3v2h5v-5h-2v3z',
  exitFs: 'M3 3H1v5h2V5h3V3H3zm7 0H8v2h3v3h2V3h-3zM3 8H1v5h5v-2H3V8zm10 5h-3v2h5v-5h-2v3z',
};

// ── Constants ────────────────────────────────────────────────────────────────

const FONT_FAMILIES = [
  'Calibri', 'Arial', 'Times New Roman', 'Georgia',
  'Courier New', 'Verdana', 'Trebuchet MS', 'Garamond',
  'Palatino Linotype', 'Tahoma',
];

const FONT_SIZES = ['8', '9', '10', '11', '12', '14', '16', '18', '20', '22', '24', '28', '36', '48', '72'];

const COLORS = [
  '#000000', '#434343', '#666666', '#999999', '#b7b7b7', '#cccccc', '#d9d9d9', '#ffffff',
  '#ff0000', '#ff9900', '#ffff00', '#00ff00', '#00ffff', '#4a86e8', '#0000ff', '#9900ff',
  '#e6b8a2', '#f4cccc', '#fce5cd', '#fff2cc', '#d9ead3', '#d0e0e3', '#c9daf8', '#ead1dc',
];

const HIGHLIGHTS = [
  { label: 'Yellow', value: '#ffff00' },
  { label: 'Bright Green', value: '#00ff00' },
  { label: 'Cyan', value: '#00ffff' },
  { label: 'Pink', value: '#ff00ff' },
  { label: 'Red', value: '#ff0000' },
  { label: 'Dark Blue', value: '#0000ff' },
  { label: 'Teal', value: '#008080' },
  { label: 'Orange', value: '#ff8c00' },
  { label: 'None', value: null },
];

// ── Color picker dropdown ────────────────────────────────────────────────────

const ColorPicker = ({ colors, onSelect, onClose, extraRow }) => {
  const ref = useRef(null);
  useEffect(() => {
    const handler = e => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  return (
    <div ref={ref} style={{
      position: 'absolute', top: '100%', left: 0, marginTop: '3px',
      background: '#fff', border: '1px solid #c8c8c8', borderRadius: '4px',
      padding: '8px', zIndex: 2000,
      display: 'grid', gridTemplateColumns: 'repeat(8, 20px)', gap: '3px',
      boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
    }}>
      {colors.map(c => (
        <div
          key={c}
          onMouseDown={e => { e.preventDefault(); onSelect(c); onClose(); }}
          title={c}
          style={{
            width: 20, height: 20, background: c,
            border: '1px solid rgba(0,0,0,0.15)', borderRadius: '2px', cursor: 'pointer',
          }}
        />
      ))}
      {extraRow}
    </div>
  );
};

// ── Toolbar ───────────────────────────────────────────────────────────────────

export default function EditorToolbar({ editor, onSave, isFullscreen, toggleFullscreen, zoom, setZoom, zoomLevels }) {
  const [showColors, setShowColors] = useState(false);
  const [showHighlights, setShowHighlights] = useState(false);
  const colorBtnRef = useRef(null);
  const hlBtnRef = useRef(null);

  if (!editor) return null;

  const attrs = editor.getAttributes('textStyle');
  const currentFontFamily = attrs.fontFamily || 'Calibri';
  const currentFontSize = (attrs.fontSize || '12pt').replace('pt', '');
  const currentColor = attrs.color || '#000000';
  const currentHL = editor.getAttributes('highlight').color || null;

  const selStyle = {
    height: '28px', padding: '0 6px', border: '1px solid #c8c8c8',
    borderRadius: '3px', fontSize: '12px', background: '#fff',
    color: '#323130', cursor: 'pointer', outline: 'none',
    fontFamily: '"Segoe UI", sans-serif',
  };

  return (
    <div style={{
      background: '#f0f0f0',
      borderBottom: '2px solid #c8c8c8',
      display: 'flex', 
      flexWrap: window.innerWidth < 768 ? 'nowrap' : 'wrap', 
      alignItems: 'center',
      gap: '2px', padding: '4px 8px',
      userSelect: 'none', flexShrink: 0,
      overflowX: window.innerWidth < 768 ? 'auto' : 'visible',
      msOverflowStyle: 'none',
      scrollbarWidth: 'none',
      WebkitOverflowScrolling: 'touch'
    }}>
      <style>{`
        div::-webkit-scrollbar { display: none; }
      `}</style>

      {/* ── History ── */}
      <Btn onClick={() => editor.chain().focus().undo().run()} disabled={!editor.can().undo()} title="Undo (Ctrl+Z)">
        <Icon d={ICONS.undo} />
      </Btn>
      <Btn onClick={() => editor.chain().focus().redo().run()} disabled={!editor.can().redo()} title="Redo (Ctrl+Y)">
        <Icon d={ICONS.redo} />
      </Btn>

      <Sep />

      {/* ── Font family ── */}
      <select
        value={currentFontFamily}
        onChange={e => editor.chain().focus().setMark('textStyle', { fontFamily: e.target.value }).run()}
        style={{ ...selStyle, width: '130px', fontFamily: currentFontFamily }}
        title="Font Family"
      >
        {FONT_FAMILIES.map(f => (
          <option key={f} value={f} style={{ fontFamily: f }}>{f}</option>
        ))}
      </select>

      {/* ── Font size ── */}
      <select
        value={currentFontSize}
        onChange={e => editor.chain().focus().setMark('textStyle', { fontSize: `${e.target.value}pt` }).run()}
        style={{ ...selStyle, width: '54px' }}
        title="Font Size"
      >
        {FONT_SIZES.map(s => <option key={s} value={s}>{s}</option>)}
      </select>

      <Sep />

      {/* ── Character formatting ── */}
      <Btn onClick={() => editor.chain().focus().toggleBold().run()} active={editor.isActive('bold')} title="Bold (Ctrl+B)" style={{ fontWeight: 900 }}>B</Btn>
      <Btn onClick={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive('italic')} title="Italic (Ctrl+I)" style={{ fontStyle: 'italic' }}>I</Btn>
      <Btn onClick={() => editor.chain().focus().toggleUnderline().run()} active={editor.isActive('underline')} title="Underline (Ctrl+U)" style={{ textDecoration: 'underline' }}>U</Btn>
      <Btn onClick={() => editor.chain().focus().toggleStrike().run()} active={editor.isActive('strike')} title="Strikethrough" style={{ textDecoration: 'line-through' }}>S</Btn>
      <Btn onClick={() => editor.commands.toggleSubscript?.()} active={editor.isActive('subscript')} title="Subscript (Ctrl+,)" style={{ fontSize: '11px' }}>
        x<sub>2</sub>
      </Btn>
      <Btn onClick={() => editor.commands.toggleSuperscript?.()} active={editor.isActive('superscript')} title="Superscript (Ctrl+.)" style={{ fontSize: '11px' }}>
        x<sup>2</sup>
      </Btn>

      <Sep />

      {/* ── Text color ── */}
      <div style={{ position: 'relative' }} ref={colorBtnRef}>
        <Btn onClick={() => { setShowColors(v => !v); setShowHighlights(false); }} title="Font Color">
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1px' }}>
            <span style={{ fontWeight: 900, fontSize: '13px', lineHeight: 1 }}>A</span>
            <div style={{ width: '16px', height: '3px', background: currentColor, borderRadius: '1px' }} />
          </div>
        </Btn>
        {showColors && (
          <ColorPicker
            colors={COLORS}
            onSelect={c => editor.chain().focus().setColor(c).run()}
            onClose={() => setShowColors(false)}
            extraRow={
              <div
                onMouseDown={e => { e.preventDefault(); editor.chain().focus().unsetColor().run(); setShowColors(false); }}
                style={{ gridColumn: 'span 8', padding: '4px 2px', fontSize: '11px', color: '#555', cursor: 'pointer', textAlign: 'center', borderTop: '1px solid #eee', marginTop: '4px' }}
              >No color</div>
            }
          />
        )}
      </div>

      {/* ── Highlight ── */}
      <div style={{ position: 'relative' }} ref={hlBtnRef}>
        <Btn onClick={() => { setShowHighlights(v => !v); setShowColors(false); }} title="Highlight Color">
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1px' }}>
            <span style={{ fontSize: '12px', lineHeight: 1 }}>ab</span>
            <div style={{ width: '16px', height: '3px', background: currentHL || '#ffff00', borderRadius: '1px' }} />
          </div>
        </Btn>
        {showHighlights && (() => {
          const hlRef = { current: null };
          return (
            <div
              ref={el => { hlRef.current = el; }}
              style={{
                position: 'absolute', top: '100%', left: 0, marginTop: '3px',
                background: '#fff', border: '1px solid #c8c8c8', borderRadius: '4px',
                padding: '8px', zIndex: 2000, minWidth: '120px',
                boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
              }}
            >
              {HIGHLIGHTS.map(h => (
                <div
                  key={h.label}
                  onMouseDown={e => {
                    e.preventDefault();
                    if (h.value) editor.chain().focus().setHighlight({ color: h.value }).run();
                    else editor.chain().focus().unsetHighlight().run();
                    setShowHighlights(false);
                  }}
                  style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 6px', cursor: 'pointer', borderRadius: '3px' }}
                  onMouseEnter={e => e.currentTarget.style.background = '#f0f0f0'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  <div style={{
                    width: '16px', height: '16px', borderRadius: '2px',
                    background: h.value || 'transparent',
                    border: h.value ? '1px solid rgba(0,0,0,0.15)' : '1px solid #c8c8c8',
                  }} />
                  <span style={{ fontSize: '12px', color: '#323130' }}>{h.label}</span>
                </div>
              ))}
            </div>
          );
        })()}
      </div>

      {/* ── Clear formatting ── */}
      <Btn onClick={() => editor.chain().focus().clearNodes().unsetAllMarks().run()} title="Clear Formatting (Ctrl+\\)">
        <Icon d={ICONS.clearFmt} />
      </Btn>

      <Sep />

      {/* ── Lists ── */}
      <Btn onClick={() => editor.chain().focus().toggleBulletList().run()} active={editor.isActive('bulletList')} title="Bullet List">
        <Icon d={ICONS.bulletList} />
      </Btn>
      <Btn onClick={() => editor.chain().focus().toggleOrderedList().run()} active={editor.isActive('orderedList')} title="Numbered List">
        <Icon d={ICONS.orderedList} />
      </Btn>

      {/* ── Indent / Outdent (inside lists) ── */}
      <Btn
        onClick={() => editor.chain().focus().liftListItem('listItem').run()}
        disabled={!editor.can().liftListItem('listItem')}
        title="Decrease Indent"
        style={{ fontSize: '14px' }}
      >⇤</Btn>
      <Btn
        onClick={() => editor.chain().focus().sinkListItem('listItem').run()}
        disabled={!editor.can().sinkListItem('listItem')}
        title="Increase Indent"
        style={{ fontSize: '14px' }}
      >⇥</Btn>

      <Sep />

      {/* ── Alignment ── */}
      <Btn onClick={() => editor.chain().focus().setTextAlign('left').run()} active={editor.isActive({ textAlign: 'left' })} title="Align Left (Ctrl+L)">
        <Icon d={ICONS.alignL} />
      </Btn>
      <Btn onClick={() => editor.chain().focus().setTextAlign('center').run()} active={editor.isActive({ textAlign: 'center' })} title="Center (Ctrl+E)">
        <Icon d={ICONS.alignC} />
      </Btn>
      <Btn onClick={() => editor.chain().focus().setTextAlign('right').run()} active={editor.isActive({ textAlign: 'right' })} title="Align Right (Ctrl+R)">
        <Icon d={ICONS.alignR} />
      </Btn>
      <Btn onClick={() => editor.chain().focus().setTextAlign('justify').run()} active={editor.isActive({ textAlign: 'justify' })} title="Justify (Ctrl+J)">
        <Icon d={ICONS.alignJ} />
      </Btn>

      <Sep />

      {/* ── Paragraph style ── */}
      <select
        value={
          editor.isActive('heading', { level: 1 }) ? '1' :
          editor.isActive('heading', { level: 2 }) ? '2' :
          editor.isActive('heading', { level: 3 }) ? '3' :
          editor.isActive('heading', { level: 4 }) ? '4' : 'p'
        }
        onChange={e => {
          const v = e.target.value;
          if (v === 'p') editor.chain().focus().setParagraph().run();
          else editor.chain().focus().setHeading({ level: parseInt(v) }).run();
        }}
        style={{ ...selStyle, width: '108px' }}
        title="Paragraph Style"
      >
        <option value="p">Normal</option>
        <option value="1">Heading 1</option>
        <option value="2">Heading 2</option>
        <option value="3">Heading 3</option>
        <option value="4">Heading 4</option>
      </select>

      <Sep />

      {/* ── Insert ── */}
      <Btn
        onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}
        title="Insert Table"
      >
        <Icon d={ICONS.table} />
      </Btn>
      <Btn
        onClick={() => { const url = window.prompt('Image URL:'); if (url) editor.chain().focus().setImage({ src: url }).run(); }}
        title="Insert Image"
      >
        <Icon d={ICONS.image} />
      </Btn>
      <Btn
        onClick={() => {
          const url = window.prompt('Enter URL:', 'https://');
          if (url) editor.chain().focus().setLink({ href: url, target: '_blank' }).run();
        }}
        active={editor.isActive('link')}
        title="Insert Link"
      >
        <Icon d={ICONS.link} />
      </Btn>
      <Btn onClick={() => editor.chain().focus().setHorizontalRule().run()} title="Horizontal Rule">
        <Icon d={ICONS.hr} />
      </Btn>

      {/* ── Spacer ── */}
      <div style={{ flex: 1 }} />

      {/* ── Zoom ── */}
      {window.innerWidth >= 600 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <Btn
            onClick={() => setZoom(z => Math.max(50, zoomLevels[zoomLevels.indexOf(z) - 1] ?? 50))}
            disabled={zoom <= 50}
            title="Zoom out"
            style={{ minWidth: '22px', height: '22px', fontSize: '16px', padding: 0 }}
          >−</Btn>
          <select
            value={zoom}
            onChange={e => setZoom(Number(e.target.value))}
            style={{ ...selStyle, width: '60px', fontSize: '11px', height: '24px' }}
            title="Zoom level"
          >
            {zoomLevels.map(z => <option key={z} value={z}>{z}%</option>)}
          </select>
          <Btn
            onClick={() => setZoom(z => Math.min(200, zoomLevels[zoomLevels.indexOf(z) + 1] ?? 200))}
            disabled={zoom >= 200}
            title="Zoom in"
            style={{ minWidth: '22px', height: '22px', fontSize: '16px', padding: 0 }}
          >+</Btn>
        </div>
      )}

      <Sep />

      {/* ── Fullscreen ── */}
      {window.innerWidth >= 768 && (
        <Btn onClick={toggleFullscreen} title={isFullscreen ? 'Exit Full Screen (Esc)' : 'Full Screen'} active={isFullscreen}>
          <Icon d={isFullscreen ? ICONS.exitFs : ICONS.fullscreen} />
        </Btn>
      )}

      {/* ── Save (if handler provided) ── */}
      {onSave && (
        <>
          <Sep />
          <button
            onMouseDown={e => { e.preventDefault(); onSave(); }}
            style={{
              height: '28px', padding: '0 14px', background: '#0078d4', color: '#fff',
              border: 'none', borderRadius: '3px', fontSize: '12px', fontWeight: 600,
              cursor: 'pointer', fontFamily: '"Segoe UI", sans-serif',
            }}
          >Save</button>
        </>
      )}
    </div>
  );
}
