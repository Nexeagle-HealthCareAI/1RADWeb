import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  Btn, BigBtn, Sep, Icon, Group, selectStyle, ICONS,
  FONT_FAMILIES, FONT_SIZES, HIGHLIGHTS, ColorPicker, SplitButton, Combobox,
} from './RibbonControls';
import StylesGallery from './StylesGallery';
import { editorPrompt } from '../dialogs/PromptDialog';

// ── Font helpers ─────────────────────────────────────────────────────────────

function cycleFontSize(editor, delta) {
  const attrs = editor.getAttributes('textStyle') || {};
  const current = (attrs.fontSize || '12pt').replace('pt', '');
  let idx = FONT_SIZES.indexOf(current);
  if (idx < 0) idx = FONT_SIZES.indexOf('12');
  const nextIdx = Math.max(0, Math.min(FONT_SIZES.length - 1, idx + delta));
  editor.chain().focus().setMark('textStyle', { fontSize: `${FONT_SIZES[nextIdx]}pt` }).run();
}

const CASE_TRANSFORMS = {
  sentence: (s) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase(),
  upper:    (s) => s.toUpperCase(),
  lower:    (s) => s.toLowerCase(),
  capitalize: (s) => s.replace(/\b\w/g, c => c.toUpperCase()),
  toggle:   (s) => s.split('').map(c => c === c.toUpperCase() ? c.toLowerCase() : c.toUpperCase()).join(''),
};

function transformSelectedText(editor, fn) {
  const { state } = editor;
  const { from, to, empty } = state.selection;
  if (empty) return;
  const text = state.doc.textBetween(from, to, '\n');
  if (!text) return;
  editor.chain().focus().insertContentAt({ from, to }, fn(text)).run();
}

// ── Change Case dropdown ─────────────────────────────────────────────────────

const ChangeCaseDropdown = ({ editor }) => {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const btnRef = useRef(null);
  const menuRef = useRef(null);
  const [portalTarget, setPortalTarget] = useState(() =>
    (typeof document !== 'undefined' ? (document.fullscreenElement || document.body) : null)
  );

  useEffect(() => {
    const onFs = () => setPortalTarget(document.fullscreenElement || document.body);
    document.addEventListener('fullscreenchange', onFs);
    return () => document.removeEventListener('fullscreenchange', onFs);
  }, []);

  useEffect(() => {
    if (!open) return;
    const rect = btnRef.current?.getBoundingClientRect();
    if (rect) setPos({ top: rect.bottom + 4, left: rect.left });
    const onDown = e => { if (menuRef.current && !menuRef.current.contains(e.target) && !btnRef.current?.contains(e.target)) setOpen(false); };
    const t = setTimeout(() => document.addEventListener('mousedown', onDown), 0);
    return () => { clearTimeout(t); document.removeEventListener('mousedown', onDown); };
  }, [open]);

  const apply = (key) => {
    transformSelectedText(editor, CASE_TRANSFORMS[key]);
    setOpen(false);
  };

  const items = [
    { key: 'sentence',   label: 'Sentence case.',     sample: 'Sentence case.' },
    { key: 'lower',      label: 'lowercase',          sample: 'lowercase' },
    { key: 'upper',      label: 'UPPERCASE',          sample: 'UPPERCASE' },
    { key: 'capitalize', label: 'Capitalize Each Word', sample: 'Capitalize Each Word' },
    { key: 'toggle',     label: 'tOGGLE cASE',        sample: 'tOGGLE cASE' },
  ];

  return (
    <>
      <button
        ref={btnRef}
        onMouseDown={e => { e.preventDefault(); setOpen(v => !v); }}
        title="Change Case"
        style={{
          display: 'inline-flex', alignItems: 'center', gap: '2px',
          minWidth: '34px', height: '24px', padding: '0 4px 0 6px',
          background: open ? '#DEECF9' : 'transparent',
          border: `1px solid ${open ? '#2B86CE' : 'transparent'}`,
          borderRadius: '2px', cursor: 'pointer',
          color: open ? '#004578' : '#1f1f1f',
          fontSize: '13px', fontFamily: '"Segoe UI", system-ui, sans-serif',
          lineHeight: 1,
        }}
        onMouseEnter={e => { if (!open) { e.currentTarget.style.background = '#DEECF9'; e.currentTarget.style.borderColor = '#C7E0F4'; } }}
        onMouseLeave={e => { if (!open) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = 'transparent'; } }}
      >
        <span style={{ fontWeight: 600 }}>Aa</span>
        <span style={{ fontSize: '8px', marginTop: '2px' }}>▾</span>
      </button>
      {open && portalTarget && createPortal(
        <div ref={menuRef} style={{
          position: 'fixed', top: pos.top, left: pos.left,
          background: '#fff', border: '1px solid #d1d5db', borderRadius: '4px',
          boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
          padding: '4px', zIndex: 13000, minWidth: '180px',
          fontFamily: '"Segoe UI", system-ui, sans-serif', fontSize: '12px',
        }}>
          {items.map(it => (
            <button
              key={it.key}
              onMouseDown={e => { e.preventDefault(); apply(it.key); }}
              style={{
                width: '100%', textAlign: 'left',
                padding: '6px 10px', background: 'transparent',
                border: 'none', borderRadius: '3px', cursor: 'pointer',
                fontFamily: 'inherit', fontSize: '12px', color: '#374151',
              }}
              onMouseEnter={e => e.currentTarget.style.background = '#f3f4f6'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >{it.sample}</button>
          ))}
        </div>,
        portalTarget
      )}
    </>
  );
};

/**
 * Small row-style button used for the stacked Cut / Copy / Painter list
 * in the Clipboard group. Compact 18px row.
 */
/** Small portaled dropdown menu for picking a list marker style. */
const ListStyleMenu = ({ anchor, items, onPick, onClose }) => {
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
    setPos({ top: r.bottom + 4, left: r.left });
    const onDown = e => { if (menuRef.current && !menuRef.current.contains(e.target) && !anchor.contains(e.target)) onClose(); };
    const t = setTimeout(() => document.addEventListener('mousedown', onDown), 0);
    return () => { clearTimeout(t); document.removeEventListener('mousedown', onDown); };
  }, [anchor, onClose]);

  if (!target) return null;
  return createPortal(
    <div ref={menuRef} style={{
      position: 'fixed', top: pos.top, left: pos.left,
      background: '#fff', border: '1px solid #d1d5db', borderRadius: '4px',
      boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
      padding: '4px', zIndex: 13000, minWidth: '140px',
      fontFamily: '"Segoe UI", system-ui, sans-serif',
    }}>
      {items.map(it => (
        <button
          key={it.id}
          onMouseDown={e => { e.preventDefault(); onPick(it.id); onClose(); }}
          style={{
            display: 'flex', alignItems: 'center', gap: '10px',
            width: '100%', padding: '5px 10px',
            background: 'transparent', border: 'none', borderRadius: '3px',
            cursor: 'pointer', fontSize: '12px', color: '#374151',
            fontFamily: 'inherit', textAlign: 'left',
          }}
          onMouseEnter={e => e.currentTarget.style.background = '#f3f4f6'}
          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
        >
          <span style={{ width: '24px', fontWeight: 700, fontFamily: '"Cascadia Code", Consolas, monospace' }}>{it.label}</span>
          <span style={{ color: '#6b7280' }}>{it.desc}</span>
        </button>
      ))}
    </div>,
    target
  );
};

/** Portaled menu for paragraph borders. */
const BordersMenu = ({ anchor, onPick, onClear, onClose }) => {
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
    setPos({ top: r.bottom + 4, left: r.left });
    const onDown = e => { if (menuRef.current && !menuRef.current.contains(e.target) && !anchor.contains(e.target)) onClose(); };
    const t = setTimeout(() => document.addEventListener('mousedown', onDown), 0);
    return () => { clearTimeout(t); document.removeEventListener('mousedown', onDown); };
  }, [anchor, onClose]);

  const items = [
    { id: 'bottom', label: 'Bottom Border' },
    { id: 'top',    label: 'Top Border' },
    { id: 'left',   label: 'Left Border' },
    { id: 'right',  label: 'Right Border' },
    { id: 'all',    label: 'All Borders' },
    { id: 'box',    label: 'Outside Borders' },
  ];

  if (!target) return null;
  return createPortal(
    <div ref={menuRef} style={{
      position: 'fixed', top: pos.top, left: pos.left,
      background: '#fff', border: '1px solid #d1d5db', borderRadius: '4px',
      boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
      padding: '4px', zIndex: 13000, minWidth: '170px',
      fontFamily: '"Segoe UI", system-ui, sans-serif',
    }}>
      {items.map(it => (
        <button
          key={it.id}
          onMouseDown={e => { e.preventDefault(); onPick(it.id); onClose(); }}
          style={{
            width: '100%', padding: '6px 10px',
            background: 'transparent', border: 'none', borderRadius: '3px',
            cursor: 'pointer', fontSize: '12px', color: '#374151',
            fontFamily: 'inherit', textAlign: 'left',
          }}
          onMouseEnter={e => e.currentTarget.style.background = '#f3f4f6'}
          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
        >{it.label}</button>
      ))}
      <div style={{ borderTop: '1px solid #e5e7eb', marginTop: '4px', paddingTop: '4px' }}>
        <button
          onMouseDown={e => { e.preventDefault(); onClear(); onClose(); }}
          style={{
            width: '100%', padding: '6px 10px',
            background: 'transparent', border: 'none', borderRadius: '3px',
            cursor: 'pointer', fontSize: '12px', color: '#dc2626',
            fontFamily: 'inherit', textAlign: 'left',
          }}
          onMouseEnter={e => e.currentTarget.style.background = '#fef2f2'}
          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
        >No Border</button>
      </div>
    </div>,
    target
  );
};

const SmallRowBtn = ({ label, icon, title, active, onClick }) => (
  <button
    onMouseDown={e => { e.preventDefault(); onClick?.(); }}
    title={title}
    style={{
      display: 'flex', alignItems: 'center', gap: '6px',
      width: '80px', height: '19px',
      padding: '0 6px',
      background: active ? '#DEECF9' : 'transparent',
      border: `1px solid ${active ? '#2B86CE' : 'transparent'}`,
      borderRadius: '2px',
      cursor: 'pointer',
      fontSize: '11px', lineHeight: 1,
      color: active ? '#004578' : '#1f1f1f',
      fontFamily: '"Segoe UI", system-ui, sans-serif',
      boxSizing: 'border-box',
      flexShrink: 0,
      outline: active ? '2px solid #2B86CE' : 'none',
      outlineOffset: '1px',
      transition: 'background 0.06s, border-color 0.06s, outline 0.06s',
    }}
    onMouseEnter={e => { if (!active) { e.currentTarget.style.background = '#DEECF9'; e.currentTarget.style.borderColor = '#C7E0F4'; } }}
    onMouseLeave={e => { if (!active) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = 'transparent'; } }}
  >
    <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 12, flexShrink: 0 }}>{icon}</span>
    <span style={{ whiteSpace: 'nowrap', lineHeight: 1 }}>{label}</span>
  </button>
);

// Wrap tiptap's editor.can().xxx() so a transient null inside tiptap (which
// happens during concurrent rendering when the editor is mid-init / mid-destroy)
// doesn't crash the whole HomeTab render.
function safeCan(editor, commandName) {
  if (!editor) return false;
  try {
    const can = editor.can?.();
    if (!can) return false;
    const fn = can[commandName];
    return typeof fn === 'function' ? !!fn() : false;
  } catch {
    return false;
  }
}

/**
 * HomeTab — primary formatting controls.
 * Groups: Clipboard | Font | Paragraph | Styles | History
 */
export default function HomeTab({ editor, showFormattingMarks, onToggleFormattingMarks }) {
  const [showColors, setShowColors] = useState(false);
  const [showHighlights, setShowHighlights] = useState(false);
  const [showBullet, setShowBullet] = useState(false);
  const [showOrdered, setShowOrdered] = useState(false);
  const [showShading, setShowShading] = useState(false);
  const [showBorders, setShowBorders] = useState(false);
  const [painterActive, setPainterActive] = useState(false);
  const colorBtnRef = useRef(null);
  const hlBtnRef = useRef(null);
  const bulletBtnRef = useRef(null);
  const orderedBtnRef = useRef(null);
  const shadingBtnRef = useRef(null);
  const bordersBtnRef = useRef(null);

  // Listen to painter state changes
  useEffect(() => {
    const handler = (e) => {
      setPainterActive(!!e.detail?.active);
    };
    window.addEventListener('narrative-editor:painter-state-changed', handler);
    return () => window.removeEventListener('narrative-editor:painter-state-changed', handler);
  }, []);

  // Change editor cursor to a crosshair while format-painter is active
  useEffect(() => {
    if (!editor) return;
    const dom = editor.view?.dom;
    if (!dom) return;
    dom.style.cursor = painterActive ? 'crosshair' : '';
    return () => { dom.style.cursor = ''; };
  }, [editor, painterActive]);

  if (!editor) return null;

  const attrs = editor.getAttributes('textStyle');
  const currentFontFamily = attrs.fontFamily || 'Calibri';
  const currentFontSize = (attrs.fontSize || '12pt').replace('pt', '');
  const currentColor = attrs.color || '#000000';
  const currentHL = editor.getAttributes('highlight').color || null;

  return (
    <div style={{ display: 'flex', alignItems: 'stretch', height: '100%' }}>
      {/* ── Clipboard group ─────────────────────────────── */}
      <Group label="Clipboard">
        <div style={{ display: 'flex', gap: '4px', alignItems: 'center', height: '100%' }}>

          {/* Paste — tall primary button */}
          <button
            onMouseDown={e => e.preventDefault()}
            onClick={async () => {
              try {
                const items = await navigator.clipboard.read();
                for (const item of items) {
                  if (item.types.includes('text/html')) {
                    const blob = await item.getType('text/html');
                    const html = await blob.text();
                    editor.chain().focus().insertContent(html).run();
                    return;
                  }
                }
                const text = await navigator.clipboard.readText();
                if (text) editor.chain().focus().insertContent(text).run();
              } catch {}
            }}
            title="Paste (Ctrl+V)"
            style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              gap: '5px', width: '48px', height: '62px',
              background: 'transparent', border: '1px solid transparent',
              borderRadius: '3px', cursor: 'pointer', flexShrink: 0,
              fontFamily: '"Segoe UI", system-ui, sans-serif',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = '#DEECF9'; e.currentTarget.style.borderColor = '#C7E0F4'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = 'transparent'; }}
          >
            <Icon d="M4 1.5H3a2 2 0 0 0-2 2V14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V3.5a2 2 0 0 0-2-2h-1v1h1a1 1 0 0 1 1 1V14a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V3.5a1 1 0 0 1 1-1h1v-1zM9.5 1v1h-3V1h3zm-4-1a1 1 0 0 0-1 1v2a1 1 0 0 0 1 1h5a1 1 0 0 0 1-1V1a1 1 0 0 0-1-1z" size={24} />
            <span style={{ fontSize: '10px', color: '#1f1f1f', lineHeight: 1, fontWeight: 500 }}>Paste</span>
          </button>

          {/* Divider line */}
          <div style={{ width: '1px', height: '48px', background: '#d8d8d8', flexShrink: 0 }} />

          {/* Cut / Copy / Painter — vertical stack */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            {/* Cut */}
            <button
              onMouseDown={e => { e.preventDefault(); document.execCommand('cut'); }}
              title="Cut (Ctrl+X)"
              style={{
                display: 'flex', alignItems: 'center', gap: '5px',
                height: '18px', padding: '0 6px',
                background: 'transparent', border: '1px solid transparent',
                borderRadius: '2px', cursor: 'pointer',
                fontSize: '11px', color: '#1f1f1f',
                fontFamily: '"Segoe UI", system-ui, sans-serif', whiteSpace: 'nowrap',
                boxSizing: 'border-box',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = '#DEECF9'; e.currentTarget.style.borderColor = '#C7E0F4'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = 'transparent'; }}
            >
              <Icon d="M9.828.722a.5.5 0 0 1 .354.146l4.95 4.95a.5.5 0 0 1 0 .707c-.48.48-1.072.588-1.503.588-.177 0-.335-.018-.46-.039l-3.134 3.134a5.5 5.5 0 0 1 .16 1.013c.046.702-.032 1.687-.72 2.375a.5.5 0 0 1-.707 0l-2.829-2.828-3.182 3.182a.5.5 0 0 1-.707-.707l3.182-3.182-2.828-2.829a.5.5 0 0 1 0-.707c.688-.688 1.673-.767 2.375-.72a5.5 5.5 0 0 1 1.013.16l3.134-3.133a2.7 2.7 0 0 1-.04-.461c0-.43.108-1.022.589-1.503a.5.5 0 0 1 .353-.146" size={11} />
              Cut
            </button>

            {/* Copy to Clipboard */}
            <button
              onMouseDown={e => { e.preventDefault(); document.execCommand('copy'); }}
              title="Copy to Clipboard (Ctrl+C)"
              style={{
                display: 'flex', alignItems: 'center', gap: '5px',
                height: '18px', padding: '0 6px',
                background: 'transparent', border: '1px solid transparent',
                borderRadius: '2px', cursor: 'pointer',
                fontSize: '11px', color: '#1f1f1f',
                fontFamily: '"Segoe UI", system-ui, sans-serif', whiteSpace: 'nowrap',
                boxSizing: 'border-box',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = '#DEECF9'; e.currentTarget.style.borderColor = '#C7E0F4'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = 'transparent'; }}
            >
              <Icon d="M4 1.5H3a2 2 0 0 0-2 2V14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V3.5a2 2 0 0 0-2-2h-1v1h1a1 1 0 0 1 1 1V14a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V3.5a1 1 0 0 1 1-1h1v-1zM9.5 1v1h-3V1h3zm-4-1a1 1 0 0 0-1 1v2a1 1 0 0 0 1 1h5a1 1 0 0 0 1-1V1a1 1 0 0 0-1-1z" size={11} />
              Copy
            </button>

            {/* Format Painter */}
            <button
              onMouseDown={e => {
                e.preventDefault();
                if (painterActive) {
                  editor.chain().focus().cancelFormatPainter().run();
                } else {
                  editor.chain().focus().pickupFormat().run();
                }
              }}
              title={painterActive
                ? 'Format Painter active — click again to cancel  (Ctrl+Shift+C / V)'
                : 'Format Painter — pick up formatting  (Ctrl+Shift+C)'}
              style={{
                display: 'flex', alignItems: 'center', gap: '5px',
                height: '18px', padding: '0 6px',
                background: painterActive ? '#DEECF9' : 'transparent',
                border: `1px solid ${painterActive ? '#2B86CE' : 'transparent'}`,
                boxShadow: painterActive ? '0 0 0 1px #2B86CE' : 'none',
                borderRadius: '2px', cursor: 'pointer',
                fontSize: '11px', color: painterActive ? '#004578' : '#1f1f1f',
                fontWeight: painterActive ? 600 : 400,
                fontFamily: '"Segoe UI", system-ui, sans-serif', whiteSpace: 'nowrap',
                boxSizing: 'border-box',
              }}
              onMouseEnter={e => {
                if (!painterActive) {
                  e.currentTarget.style.background = '#DEECF9';
                  e.currentTarget.style.borderColor = '#C7E0F4';
                }
              }}
              onMouseLeave={e => {
                if (!painterActive) {
                  e.currentTarget.style.background = 'transparent';
                  e.currentTarget.style.borderColor = 'transparent';
                }
              }}
            >
              <Icon d={ICONS.painter} size={11} />
              Painter
            </button>
          </div>

        </div>
      </Group>

      <Sep />

      {/* ── Font group ──────────────────────────────────── */}
      <Group label="Font" onLauncher={() => window.dispatchEvent(new CustomEvent('narrative-editor:open-font-dialog'))}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'flex-start' }}>
          <div style={{ display: 'flex', gap: '4px' }}>
            <Combobox
              value={currentFontFamily}
              onChange={(v) => editor.chain().focus().setMark('textStyle', { fontFamily: v }).run()}
              options={FONT_FAMILIES.map(f => ({ value: f, label: f, sample: { fontFamily: f } }))}
              width={132}
              title="Font Family"
              renderValue={(_, sel) => <span style={{ fontFamily: sel?.value || 'Calibri' }}>{sel?.label || 'Calibri'}</span>}
            />
            <Combobox
              value={currentFontSize}
              onChange={(v) => editor.chain().focus().setMark('textStyle', { fontSize: `${v}pt` }).run()}
              options={FONT_SIZES.map(s => ({ value: s, label: s }))}
              width={56}
              title="Font Size"
            />
            <Btn onClick={() => cycleFontSize(editor, +1)} title="Grow Font (Ctrl+])">
              <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: '1px', lineHeight: 1 }}>
                <span style={{ fontSize: '14px', fontWeight: 700 }}>A</span>
                <span style={{ fontSize: '9px', position: 'relative', top: '-3px' }}>▲</span>
              </span>
            </Btn>
            <Btn onClick={() => cycleFontSize(editor, -1)} title="Shrink Font (Ctrl+[)">
              <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: '1px', lineHeight: 1 }}>
                <span style={{ fontSize: '11px', fontWeight: 700 }}>A</span>
                <span style={{ fontSize: '9px', position: 'relative', top: '-2px' }}>▼</span>
              </span>
            </Btn>
            <ChangeCaseDropdown editor={editor} />
          </div>
          <div style={{ display: 'flex', gap: '1px' }}>
            <Btn onClick={() => editor.chain().focus().toggleBold().run()} active={editor.isActive('bold')} title="Bold (Ctrl+B)" style={{ fontWeight: 900 }}>B</Btn>
            <Btn onClick={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive('italic')} title="Italic (Ctrl+I)" style={{ fontStyle: 'italic' }}>I</Btn>
            <Btn onClick={() => editor.chain().focus().toggleUnderline().run()} active={editor.isActive('underline')} title="Underline (Ctrl+U)" style={{ textDecoration: 'underline' }}>U</Btn>
            <Btn onClick={() => editor.chain().focus().toggleStrike().run()} active={editor.isActive('strike')} title="Strikethrough" style={{ textDecoration: 'line-through' }}>S</Btn>
            <Btn onClick={() => editor.commands.toggleSubscript?.()} active={editor.isActive('subscript')} title="Subscript (Ctrl+=)" style={{ fontSize: '11px' }}>
              x<sub>2</sub>
            </Btn>
            <Btn onClick={() => editor.commands.toggleSuperscript?.()} active={editor.isActive('superscript')} title="Superscript (Ctrl+Shift++)" style={{ fontSize: '11px' }}>
              x<sup>2</sup>
            </Btn>

            {/* Text color */}
            <div ref={colorBtnRef} style={{ display: 'inline-flex' }}>
              <Btn onClick={() => { setShowColors(v => !v); setShowHighlights(false); }} title="Font Color">
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1px' }}>
                  <span style={{ fontWeight: 900, fontSize: '13px', lineHeight: 1 }}>A</span>
                  <div style={{ width: '16px', height: '3px', background: currentColor, borderRadius: '1px' }} />
                </div>
              </Btn>
            </div>
            {showColors && (
              <ColorPicker
                anchorEl={colorBtnRef.current}
                onSelect={c => editor.chain().focus().setColor(c).run()}
                onClear={() => editor.chain().focus().unsetColor().run()}
                onClose={() => setShowColors(false)}
                clearLabel="Automatic"
              />
            )}

            {/* Highlight */}
            <div ref={hlBtnRef} style={{ display: 'inline-flex' }}>
              <Btn onClick={() => { setShowHighlights(v => !v); setShowColors(false); }} title="Highlight Color">
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1px' }}>
                  <span style={{ fontSize: '12px', lineHeight: 1 }}>ab</span>
                  <div style={{ width: '16px', height: '3px', background: currentHL || '#ffff00', borderRadius: '1px' }} />
                </div>
              </Btn>
            </div>
            {showHighlights && (
              <ColorPicker
                anchorEl={hlBtnRef.current}
                onSelect={c => editor.chain().focus().setHighlight({ color: c }).run()}
                onClear={() => editor.chain().focus().unsetHighlight().run()}
                onClose={() => setShowHighlights(false)}
                clearLabel="No Highlight"
              />
            )}

            <Btn onClick={() => editor.chain().focus().clearNodes().unsetAllMarks().run()} title="Clear Formatting (Ctrl+\\)">
              <Icon d={ICONS.clearFmt} />
            </Btn>
          </div>
        </div>
      </Group>

      <Sep />

      {/* ── Paragraph group ─────────────────────────────── */}
      <Group label="Paragraph" onLauncher={() => window.dispatchEvent(new CustomEvent('narrative-editor:open-paragraph-dialog'))}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'flex-start' }}>
          <div style={{ display: 'flex', gap: '1px', alignItems: 'center' }}>
            {/* Bullet list — split button */}
            <SplitButton
              btnRef={bulletBtnRef}
              active={editor.isActive('bulletList')}
              caretOpen={showBullet}
              title="Bullet List (Ctrl+Shift+L)"
              onMain={() => editor.chain().focus().toggleBulletList().run()}
              onCaret={() => { setShowBullet(v => !v); setShowOrdered(false); }}
            >
              <Icon d={ICONS.bulletList} />
            </SplitButton>
            {showBullet && (
              <ListStyleMenu
                anchor={bulletBtnRef.current}
                onClose={() => setShowBullet(false)}
                items={[
                  { id: 'disc',   label: '•', desc: 'Disc (•)' },
                  { id: 'circle', label: '◦', desc: 'Circle (○)' },
                  { id: 'square', label: '▪', desc: 'Square (▪)' },
                ]}
                onPick={(s) => editor.chain().focus().setBulletStyle(s).run()}
              />
            )}

            {/* Numbered list — split button */}
            <SplitButton
              btnRef={orderedBtnRef}
              active={editor.isActive('orderedList')}
              caretOpen={showOrdered}
              title="Numbered List (Ctrl+Shift+7)"
              onMain={() => editor.chain().focus().toggleOrderedList().run()}
              onCaret={() => { setShowOrdered(v => !v); setShowBullet(false); }}
            >
              <Icon d={ICONS.orderedList} />
            </SplitButton>
            {showOrdered && (
              <ListStyleMenu
                anchor={orderedBtnRef.current}
                onClose={() => setShowOrdered(false)}
                items={[
                  { id: 'decimal',     label: '1.', desc: '1, 2, 3' },
                  { id: 'lower-alpha', label: 'a.', desc: 'a, b, c' },
                  { id: 'upper-alpha', label: 'A.', desc: 'A, B, C' },
                  { id: 'lower-roman', label: 'i.', desc: 'i, ii, iii' },
                  { id: 'upper-roman', label: 'I.', desc: 'I, II, III' },
                ]}
                onPick={(s) => editor.chain().focus().setOrderedStyle(s).run()}
              />
            )}

            <Btn
              onClick={() => {
                if (editor.can().liftListItem('listItem')) editor.chain().focus().liftListItem('listItem').run();
                else editor.chain().focus().decreaseParagraphIndent().run();
              }}
              title="Decrease Indent (Shift+Tab)"
              style={{ fontSize: '14px' }}
            >⇤</Btn>
            <Btn
              onClick={() => {
                if (editor.can().sinkListItem('listItem')) editor.chain().focus().sinkListItem('listItem').run();
                else editor.chain().focus().increaseParagraphIndent().run();
              }}
              title="Increase Indent (Tab)"
              style={{ fontSize: '14px' }}
            >⇥</Btn>
            <Btn
              onClick={() => editor.chain().focus().toggleMultilevelList().run()}
              active={
                (editor.isActive('orderedList') && editor.getAttributes('orderedList').multilevel) ||
                (editor.isActive('bulletList') && editor.getAttributes('bulletList').multilevel)
              }
              title="Multilevel List"
              style={{ fontSize: '11px', fontWeight: 700, minWidth: '28px' }}
            >
              <span style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-start', lineHeight: 1, gap: '1px', fontSize: '8px' }}>
                <span>1.</span>
                <span style={{ marginLeft: '4px' }}>a.</span>
                <span style={{ marginLeft: '8px' }}>i.</span>
              </span>
            </Btn>
            <Btn
              onClick={() => editor.chain().focus().sortSelected('asc').run()}
              title="Sort A → Z (selected list / paragraphs)"
              style={{ fontSize: '12px', fontWeight: 600, minWidth: '28px' }}
            >A↓Z</Btn>
            <Btn
              onClick={() => onToggleFormattingMarks?.()}
              active={!!showFormattingMarks}
              title="Show/Hide formatting marks (¶)"
              style={{ fontSize: '13px', fontWeight: 700 }}
            >¶</Btn>
            <Combobox
              value={editor.getAttributes('paragraph').lineHeight || editor.getAttributes('heading').lineHeight || ''}
              onChange={async v => {
                if (v === '__custom__') {
                  const current = editor.getAttributes('paragraph').lineHeight || editor.getAttributes('heading').lineHeight || '1.6';
                  const input = await editorPrompt({
                    title: 'Custom Line Spacing',
                    message: 'Enter a number (e.g. 1.75) or value with unit (e.g. 24px, 150%). Minimum is 1.0 — anything below would overlap text.',
                    defaultValue: String(current),
                    placeholder: '1.75',
                    confirmLabel: 'Apply',
                  });
                  if (input == null) return;
                  const trimmed = input.trim();
                  if (!trimmed) {
                    editor.chain().focus().unsetLineHeight().run();
                  } else {
                    // Show a one-line note if the value would have overlapped (clamped by the extension).
                    const asNum = parseFloat(trimmed);
                    if (Number.isFinite(asNum) && asNum < 1 && !/[a-z%]/i.test(trimmed)) {
                      console.info(`[NarrativeEditor] Line-spacing ${trimmed} below safe minimum — clamped to 1.0 to avoid overlapping text.`);
                    }
                    editor.chain().focus().setLineHeight(trimmed).run();
                  }
                  return;
                }
                if (v) editor.chain().focus().setLineHeight(v).run();
                else editor.chain().focus().unsetLineHeight().run();
              }}
              options={[
                { value: '', label: 'Spacing' },
                { value: '1', label: '1.0' },
                { value: '1.15', label: '1.15' },
                { value: '1.5', label: '1.5' },
                { value: '2', label: '2.0' },
                { value: '2.5', label: '2.5' },
                { value: '3', label: '3.0' },
                { value: '__custom__', label: 'Custom…' },
              ]}
              width={84}
              title="Line Spacing"
            />
          </div>
          <div style={{ display: 'flex', gap: '1px' }}>
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

            {/* Shading — paragraph background color */}
            <span ref={shadingBtnRef} style={{ display: 'inline-flex' }}>
              <Btn
                onClick={() => { setShowShading(v => !v); setShowBorders(false); }}
                active={showShading || !!editor.getAttributes('paragraph').shading}
                title="Paragraph Shading"
                style={{ minWidth: '30px' }}
              >
                <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1px' }}>
                  <span style={{ fontSize: '11px' }}>🪣</span>
                  <span style={{
                    width: '14px', height: '3px',
                    background: editor.getAttributes('paragraph').shading || '#ffeb3b',
                    borderRadius: '1px',
                  }} />
                </span>
              </Btn>
            </span>
            {showShading && (
              <ColorPicker
                anchorEl={shadingBtnRef.current}
                onSelect={c => editor.chain().focus().setParagraphShading(c).run()}
                onClear={() => editor.chain().focus().unsetParagraphShading().run()}
                onClose={() => setShowShading(false)}
                clearLabel="No shading"
              />
            )}

            {/* Borders */}
            <span ref={bordersBtnRef} style={{ display: 'inline-flex' }}>
              <Btn
                onClick={() => { setShowBorders(v => !v); setShowShading(false); }}
                active={showBorders || !!editor.getAttributes('paragraph').borders}
                title="Paragraph Borders"
                style={{ minWidth: '30px' }}
              >
                <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1px' }}>
                  <span style={{
                    width: '14px', height: '10px',
                    border: '1px solid currentColor',
                    boxSizing: 'border-box',
                  }} />
                  <span style={{ fontSize: '7px', lineHeight: 1 }}>▾</span>
                </span>
              </Btn>
            </span>
            {showBorders && (
              <BordersMenu
                anchor={bordersBtnRef.current}
                onClose={() => setShowBorders(false)}
                onPick={(b) => editor.chain().focus().setParagraphBorders(b).run()}
                onClear={() => editor.chain().focus().unsetParagraphBorders().run()}
              />
            )}
          </div>
        </div>
      </Group>

      <Sep />

      {/* ── Styles group ────────────────────────────────── */}
      <Group label="Styles">
        <StylesGallery editor={editor} />
      </Group>

      <Sep />

      {/* ── History group ───────────────────────────────── */}
      <Group label="History">
        <Btn onClick={() => editor?.chain().focus().undo().run()} disabled={!safeCan(editor, 'undo')} title="Undo (Ctrl+Z)">
          <Icon d={ICONS.undo} />
        </Btn>
        <Btn onClick={() => editor?.chain().focus().redo().run()} disabled={!safeCan(editor, 'redo')} title="Redo (Ctrl+Y)">
          <Icon d={ICONS.redo} />
        </Btn>
      </Group>

      <Sep />

      {/* ── Editing group (Word convention: Find / Replace / Select on Home) ── */}
      <Group label="Editing">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', alignItems: 'flex-start' }}>
          <button
            onMouseDown={e => { e.preventDefault(); window.dispatchEvent(new CustomEvent('narrative-editor:open-find-replace', { detail: { focusReplace: false } })); }}
            title="Find (Ctrl+F)"
            style={editingRowBtnStyle}
            onMouseEnter={e => e.currentTarget.style.background = '#e8e8e8'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
          >
            <Icon d={ICONS.search} size={11} />
            <span>Find</span>
          </button>
          <button
            onMouseDown={e => { e.preventDefault(); window.dispatchEvent(new CustomEvent('narrative-editor:open-find-replace', { detail: { focusReplace: true } })); }}
            title="Replace (Ctrl+H)"
            style={editingRowBtnStyle}
            onMouseEnter={e => e.currentTarget.style.background = '#e8e8e8'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
          >
            <span style={{ fontSize: '11px' }}>⇄</span>
            <span>Replace</span>
          </button>
          <SelectMenuButton editor={editor} />
        </div>
      </Group>
    </div>
  );
}

const editingRowBtnStyle = {
  display: 'flex', alignItems: 'center', gap: '6px',
  width: '88px', height: '18px',
  padding: '0 6px',
  background: 'transparent', border: '1px solid transparent',
  borderRadius: '3px', cursor: 'pointer',
  fontSize: '11px', lineHeight: 1, color: '#323130',
  fontFamily: '"Segoe UI", system-ui, sans-serif',
  boxSizing: 'border-box', flexShrink: 0,
};

/** Word-like "Select ▾" button that opens a tiny menu. */
const SelectMenuButton = ({ editor }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  return (
    <>
      <button
        ref={ref}
        onMouseDown={e => { e.preventDefault(); setOpen(v => !v); }}
        title="Select"
        style={{ ...editingRowBtnStyle, justifyContent: 'space-between' }}
        onMouseEnter={e => e.currentTarget.style.background = '#e8e8e8'}
        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
      >
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ fontSize: '11px' }}>☑</span>
          <span>Select</span>
        </span>
        <span style={{ fontSize: '8px' }}>▾</span>
      </button>
      {open && (
        <SelectMenuPopup
          anchor={ref.current}
          onClose={() => setOpen(false)}
          editor={editor}
        />
      )}
    </>
  );
};

const SelectMenuPopup = ({ anchor, onClose, editor }) => {
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
    setPos({ top: r.bottom + 4, left: r.left });
    const onDown = e => { if (menuRef.current && !menuRef.current.contains(e.target) && !anchor.contains(e.target)) onClose(); };
    const t = setTimeout(() => document.addEventListener('mousedown', onDown), 0);
    return () => { clearTimeout(t); document.removeEventListener('mousedown', onDown); };
  }, [anchor, onClose]);

  if (!target) return null;
  return createPortal(
    <div ref={menuRef} style={{
      position: 'fixed', top: pos.top, left: pos.left,
      background: '#fff', border: '1px solid #d1d5db', borderRadius: '4px',
      boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
      padding: '4px', zIndex: 13000, minWidth: '200px',
      fontFamily: '"Segoe UI", system-ui, sans-serif',
    }}>
      {[
        { id: 'all',       label: 'Select All', shortcut: 'Ctrl+A', fn: () => editor.chain().focus().selectAll().run() },
        { id: 'paragraph', label: 'Select Current Paragraph', fn: () => {
            const { $from } = editor.state.selection;
            let blockStart = $from.start($from.depth);
            let blockEnd   = $from.end($from.depth);
            editor.chain().focus().setTextSelection({ from: blockStart, to: blockEnd }).run();
          }
        },
      ].map(it => (
        <button
          key={it.id}
          onMouseDown={e => { e.preventDefault(); it.fn(); onClose(); }}
          style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%',
            padding: '6px 10px', background: 'transparent', border: 'none', borderRadius: '3px',
            cursor: 'pointer', fontSize: '12px', color: '#374151',
            fontFamily: 'inherit', textAlign: 'left',
          }}
          onMouseEnter={e => e.currentTarget.style.background = '#f3f4f6'}
          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
        >
          <span>{it.label}</span>
          {it.shortcut && <span style={{ color: '#9ca3af', fontSize: '10px', fontFamily: '"Cascadia Code", Consolas, monospace' }}>{it.shortcut}</span>}
        </button>
      ))}
    </div>,
    target
  );
};
