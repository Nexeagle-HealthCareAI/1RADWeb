import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  Btn, BigBtn, Sep, Icon, Group, selectStyle, ICONS,
  FONT_FAMILIES, FONT_SIZES, HIGHLIGHTS, ColorPicker, SplitButton,
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
          background: open ? '#cce4f7' : 'transparent',
          border: `1px solid ${open ? '#90c8f0' : 'transparent'}`,
          borderRadius: '3px', cursor: 'pointer',
          color: open ? '#003a75' : '#323130',
          fontSize: '13px', fontFamily: '"Segoe UI", system-ui, sans-serif',
          lineHeight: 1,
        }}
        onMouseEnter={e => { if (!open) e.currentTarget.style.background = '#e8e8e8'; }}
        onMouseLeave={e => { if (!open) e.currentTarget.style.background = 'transparent'; }}
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
      width: '78px', height: '18px',
      padding: '0 6px',
      background: active ? '#cce4f7' : 'transparent',
      border: `1px solid ${active ? '#90c8f0' : 'transparent'}`,
      borderRadius: '3px',
      cursor: 'pointer',
      fontSize: '11px', lineHeight: 1,
      color: active ? '#003a75' : '#323130',
      fontFamily: '"Segoe UI", system-ui, sans-serif',
      boxSizing: 'border-box',
      flexShrink: 0,
      transition: 'background 0.08s, border-color 0.08s',
    }}
    onMouseEnter={e => { if (!active) e.currentTarget.style.background = '#e8e8e8'; }}
    onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent'; }}
  >
    <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 12, flexShrink: 0 }}>{icon}</span>
    <span style={{ whiteSpace: 'nowrap', lineHeight: 1 }}>{label}</span>
  </button>
);

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
  const colorBtnRef = useRef(null);
  const hlBtnRef = useRef(null);
  const bulletBtnRef = useRef(null);
  const orderedBtnRef = useRef(null);
  const shadingBtnRef = useRef(null);
  const bordersBtnRef = useRef(null);

  if (!editor) return null;

  const attrs = editor.getAttributes('textStyle');
  const currentFontFamily = attrs.fontFamily || 'Calibri';
  const currentFontSize = (attrs.fontSize || '12pt').replace('pt', '');
  const currentColor = attrs.color || '#000000';
  const currentHL = editor.getAttributes('highlight').color || null;
  const painterActive = !!editor.storage?.formatPainter?.active;

  return (
    <div style={{ display: 'flex', alignItems: 'stretch', height: '100%' }}>
      {/* ── Clipboard group ─────────────────────────────── */}
      <Group label="Clipboard">
        <BigBtn
          icon="📋"
          label="Paste"
          title="Paste (Ctrl+V)"
          onClick={() => navigator.clipboard.readText().then(t => editor.chain().focus().insertContent(t).run()).catch(() => {})}
        />
        <div style={{
          display: 'flex', flexDirection: 'column',
          gap: '2px',
          alignSelf: 'center',
          marginLeft: '2px',
        }}>
          <SmallRowBtn
            label="Cut"
            icon={<span style={{ fontSize: '11px' }}>✂</span>}
            title="Cut (Ctrl+X)"
            onClick={() => { editor.commands.focus(); document.execCommand('cut'); }}
          />
          <SmallRowBtn
            label="Copy"
            icon={<span style={{ fontSize: '11px' }}>⎘</span>}
            title="Copy (Ctrl+C)"
            onClick={() => { editor.commands.focus(); document.execCommand('copy'); }}
          />
          <SmallRowBtn
            label="Painter"
            icon={<Icon d={ICONS.brush} size={11} />}
            title="Format Painter (Ctrl+Shift+C / V)"
            active={painterActive}
            onClick={() => {
              if (painterActive) editor.chain().applyFormat().run();
              else editor.chain().pickupFormat().run();
            }}
          />
        </div>
      </Group>

      <Sep />

      {/* ── Font group ──────────────────────────────────── */}
      <Group label="Font" onLauncher={() => window.dispatchEvent(new CustomEvent('narrative-editor:open-font-dialog'))}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'flex-start' }}>
          <div style={{ display: 'flex', gap: '4px' }}>
            <select
              value={currentFontFamily}
              onChange={e => editor.chain().focus().setMark('textStyle', { fontFamily: e.target.value }).run()}
              style={{ ...selectStyle, width: '130px', fontFamily: currentFontFamily }}
              title="Font Family"
            >
              {FONT_FAMILIES.map(f => (
                <option key={f} value={f} style={{ fontFamily: f }}>{f}</option>
              ))}
            </select>
            <select
              value={currentFontSize}
              onChange={e => editor.chain().focus().setMark('textStyle', { fontSize: `${e.target.value}pt` }).run()}
              style={{ ...selectStyle, width: '54px' }}
              title="Font Size"
            >
              {FONT_SIZES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
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
              onClick={() => onToggleFormattingMarks?.()}
              active={!!showFormattingMarks}
              title="Show/Hide formatting marks (¶)"
              style={{ fontSize: '13px', fontWeight: 700 }}
            >¶</Btn>
            <select
              value={editor.getAttributes('paragraph').lineHeight || editor.getAttributes('heading').lineHeight || ''}
              onChange={async e => {
                const v = e.target.value;
                if (v === '__custom__') {
                  const current = editor.getAttributes('paragraph').lineHeight || editor.getAttributes('heading').lineHeight || '1.6';
                  const input = await editorPrompt({
                    title: 'Custom Line Spacing',
                    message: 'Enter a number (e.g. 1.75) or value with unit (e.g. 24px, 150%).',
                    defaultValue: String(current),
                    placeholder: '1.75',
                    confirmLabel: 'Apply',
                  });
                  // Reset the select to its previous state (so it doesn't stay on Custom…)
                  e.target.value = current || '';
                  if (input == null) return;
                  const trimmed = input.trim();
                  if (!trimmed) editor.chain().focus().unsetLineHeight().run();
                  else editor.chain().focus().setLineHeight(trimmed).run();
                  return;
                }
                if (v) editor.chain().focus().setLineHeight(v).run();
                else editor.chain().focus().unsetLineHeight().run();
              }}
              style={{ ...selectStyle, width: '78px' }}
              title="Line Spacing"
            >
              <option value="">Spacing</option>
              <option value="1">1.0</option>
              <option value="1.15">1.15</option>
              <option value="1.5">1.5</option>
              <option value="2">2.0</option>
              <option value="2.5">2.5</option>
              <option value="3">3.0</option>
              <option value="__custom__">Custom…</option>
            </select>
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
        <Btn onClick={() => editor.chain().focus().undo().run()} disabled={!editor.can().undo()} title="Undo (Ctrl+Z)">
          <Icon d={ICONS.undo} />
        </Btn>
        <Btn onClick={() => editor.chain().focus().redo().run()} disabled={!editor.can().redo()} title="Redo (Ctrl+Y)">
          <Icon d={ICONS.redo} />
        </Btn>
      </Group>
    </div>
  );
}
