import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';

/**
 * StylesGallery — Word-style preset cards. One click applies the preset
 * to the current paragraph or selection.
 *
 * The inline ribbon strip shows the presets in a scrollable row; a trailing
 * "More" button opens a full grid popover so every style is reachable on
 * desktop even when the ribbon is narrow.
 */
const PRESETS = [
  {
    id: 'normal',
    label: 'Normal',
    sample: { fontSize: '12pt', fontWeight: 400 },
    apply: (editor) =>
      editor.chain().focus().setParagraph().unsetAllMarks().run(),
    isActive: (editor) => editor.isActive('paragraph') && !editor.isActive('blockquote'),
  },
  {
    id: 'title',
    label: 'Title',
    sample: { fontSize: '20pt', fontWeight: 700, color: '#1f3864' },
    apply: (editor) => editor.chain().focus()
      .setHeading({ level: 1 })
      .setMark('textStyle', { fontSize: '26pt' })
      .setTextAlign('center')
      .run(),
    isActive: (editor) => editor.isActive('heading', { level: 1 }) && editor.isActive({ textAlign: 'center' }),
  },
  {
    id: 'subtitle',
    label: 'Subtitle',
    sample: { fontSize: '14pt', fontWeight: 600, fontStyle: 'italic', color: '#444' },
    apply: (editor) => editor.chain().focus()
      .setHeading({ level: 2 })
      .setMark('textStyle', { fontSize: '18pt' })
      .toggleItalic()
      .run(),
  },
  {
    id: 'h1',
    label: 'Heading 1',
    sample: { fontSize: '16pt', fontWeight: 700, color: '#1f3864' },
    apply: (editor) => editor.chain().focus()
      .setHeading({ level: 1 })
      .setMark('textStyle', { fontSize: '24pt' })
      .run(),
    isActive: (editor) => editor.isActive('heading', { level: 1 }),
  },
  {
    id: 'h2',
    label: 'Heading 2',
    sample: { fontSize: '14pt', fontWeight: 700, color: '#2e4d7b' },
    apply: (editor) => editor.chain().focus()
      .setHeading({ level: 2 })
      .setMark('textStyle', { fontSize: '20pt' })
      .run(),
    isActive: (editor) => editor.isActive('heading', { level: 2 }),
  },
  {
    id: 'h3',
    label: 'Heading 3',
    sample: { fontSize: '12pt', fontWeight: 600, color: '#2e4d7b' },
    apply: (editor) => editor.chain().focus()
      .setHeading({ level: 3 })
      .setMark('textStyle', { fontSize: '16pt' })
      .run(),
    isActive: (editor) => editor.isActive('heading', { level: 3 }),
  },
  {
    id: 'h4',
    label: 'Heading 4',
    sample: { fontSize: '11pt', fontWeight: 600, color: '#374151' },
    apply: (editor) => editor.chain().focus()
      .setHeading({ level: 4 })
      .setMark('textStyle', { fontSize: '14pt' })
      .run(),
    isActive: (editor) => editor.isActive('heading', { level: 4 }),
  },
  {
    id: 'quote',
    label: 'Quote',
    sample: { fontSize: '12pt', fontStyle: 'italic', color: '#555' },
    apply: (editor) => editor.chain().focus()
      .toggleBlockquote()
      .run(),
    isActive: (editor) => editor.isActive('blockquote'),
  },
];

/** A single preset card (shared by the strip and the "More" grid). */
const StyleCard = ({ preset, active, onPick, width = 108, height = 52 }) => (
  <button
    onMouseDown={e => { e.preventDefault(); onPick(); }}
    title={preset.label}
    style={{
      display: 'flex', alignItems: 'center',
      width: `${width}px`, height: `${height}px`,
      padding: '8px 10px',
      background: active ? '#eff6fc' : '#ffffff',
      border: `1px solid ${active ? '#0078d4' : '#d1d5db'}`,
      borderRadius: '4px', cursor: 'pointer', flexShrink: 0,
      fontFamily: '"Segoe UI", system-ui, sans-serif',
      boxShadow: active ? '0 0 0 1px #0078d4 inset' : 'none',
      transition: 'background 0.1s, border-color 0.1s',
      textAlign: 'left',
    }}
    onMouseEnter={e => { if (!active) { e.currentTarget.style.background = '#f3f4f6'; e.currentTarget.style.borderColor = '#9ca3af'; } }}
    onMouseLeave={e => { if (!active) { e.currentTarget.style.background = '#ffffff'; e.currentTarget.style.borderColor = '#d1d5db'; } }}
  >
    <div style={{
      ...preset.sample,
      lineHeight: 1,
      whiteSpace: 'nowrap',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      flex: 1,
    }}>{preset.label}</div>
  </button>
);

/** Portaled grid popover showing every style preset. */
const StylesMorePanel = ({ anchor, editor, onClose }) => {
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const [target, setTarget] = useState(() =>
    typeof document !== 'undefined' ? (document.fullscreenElement || document.body) : null
  );
  const menuRef = useRef(null);

  useEffect(() => {
    const onFs = () => setTarget(document.fullscreenElement || document.body);
    document.addEventListener('fullscreenchange', onFs);
    return () => document.removeEventListener('fullscreenchange', onFs);
  }, []);

  useEffect(() => {
    if (!anchor) return;
    const r = anchor.getBoundingClientRect();
    const PANEL_W = 360;
    let left = r.right - PANEL_W;
    if (left < 8) left = 8;
    setPos({ top: r.bottom + 6, left });
    const onDown = e => { if (menuRef.current && !menuRef.current.contains(e.target) && !anchor.contains(e.target)) onClose(); };
    const t = setTimeout(() => document.addEventListener('mousedown', onDown), 0);
    return () => { clearTimeout(t); document.removeEventListener('mousedown', onDown); };
  }, [anchor, onClose]);

  if (!target) return null;

  return createPortal(
    <div ref={menuRef} style={{
      position: 'fixed', top: pos.top, left: pos.left,
      width: '360px',
      background: 'linear-gradient(180deg,#ffffff 0%,#fbfcfe 100%)',
      border: '1px solid #e2e6ee', borderRadius: '12px',
      boxShadow: '0 18px 48px -12px rgba(15,23,42,0.30), 0 4px 12px rgba(15,23,42,0.10)',
      padding: '14px', zIndex: 13000,
      fontFamily: '"Segoe UI", system-ui, sans-serif',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '7px', margin: '0 2px 11px' }}>
        <span style={{ fontSize: '11px', fontWeight: 700, color: '#0f172a', letterSpacing: '0.4px', textTransform: 'uppercase' }}>Styles</span>
        <span style={{ flex: 1, height: '1px', background: 'linear-gradient(90deg,#e2e6ee,transparent)' }} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
        {PRESETS.map(preset => (
          <StyleCard
            key={preset.id}
            preset={preset}
            active={preset.isActive ? preset.isActive(editor) : false}
            onPick={() => { preset.apply(editor); onClose(); }}
            width={104}
            height={50}
          />
        ))}
      </div>
    </div>,
    target
  );
};

export default function StylesGallery({ editor }) {
  const [showMore, setShowMore] = useState(false);
  const moreRef = useRef(null);
  if (!editor) return null;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
      <div style={{
        display: 'flex', gap: '4px', alignItems: 'center',
        overflowX: 'auto', overflowY: 'hidden',
        maxWidth: '440px', height: '56px', padding: '2px',
        msOverflowStyle: 'none', scrollbarWidth: 'none',
      }}>
        <style>{`.styles-gallery-strip::-webkit-scrollbar { display: none; }`}</style>
        {PRESETS.map(preset => (
          <StyleCard
            key={preset.id}
            preset={preset}
            active={preset.isActive ? preset.isActive(editor) : false}
            onPick={() => preset.apply(editor)}
          />
        ))}
      </div>

      {/* "More" expander — opens a grid with every style so nothing is
          hidden off the right edge of the ribbon. */}
      <button
        ref={moreRef}
        onMouseDown={e => { e.preventDefault(); setShowMore(v => !v); }}
        title="More styles"
        style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          gap: '2px',
          width: '26px', height: '52px', flexShrink: 0,
          background: showMore ? '#eff6fc' : '#ffffff',
          border: `1px solid ${showMore ? '#0078d4' : '#d1d5db'}`,
          borderRadius: '4px', cursor: 'pointer',
          color: '#475569',
          transition: 'background 0.1s, border-color 0.1s',
        }}
        onMouseEnter={e => { if (!showMore) { e.currentTarget.style.background = '#f3f4f6'; e.currentTarget.style.borderColor = '#9ca3af'; } }}
        onMouseLeave={e => { if (!showMore) { e.currentTarget.style.background = '#ffffff'; e.currentTarget.style.borderColor = '#d1d5db'; } }}
      >
        <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 6l4 4 4-4" />
        </svg>
        <span style={{ fontSize: '7.5px', fontWeight: 600, letterSpacing: '0.3px' }}>MORE</span>
      </button>
      {showMore && (
        <StylesMorePanel anchor={moreRef.current} editor={editor} onClose={() => setShowMore(false)} />
      )}
    </div>
  );
}
