import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  Btn, BigBtn, Sep, Icon, Group, selectStyle, ICONS,
  FONT_FAMILIES, THEME_FONTS, FONT_SIZES, HIGHLIGHTS, ColorPicker, SplitButton, Combobox,
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
          display: 'inline-flex', alignItems: 'center', gap: '4px',
          minWidth: '38px', height: '28px', padding: '0 8px',
          background: open ? '#dde7fb' : 'transparent',
          border: `1px solid ${open ? '#0066ff' : 'transparent'}`,
          borderRadius: '6px', cursor: 'pointer',
          color: open ? '#0050d4' : '#1f2937',
          fontSize: '13px',
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Inter", Roboto, "Helvetica Neue", Arial, sans-serif',
          fontWeight: open ? 600 : 500,
          lineHeight: 1,
          boxShadow: open ? 'inset 0 0 0 1px rgba(0, 102, 255, 0.18)' : 'none',
          transition: 'all 0.16s cubic-bezier(0.16, 1, 0.3, 1)',
        }}
        onMouseEnter={e => { if (!open) { e.currentTarget.style.background = '#eef4ff'; e.currentTarget.style.borderColor = '#c5d6ee'; e.currentTarget.style.color = '#0050d4'; } }}
        onMouseLeave={e => { if (!open) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = 'transparent'; e.currentTarget.style.color = '#1f2937'; } }}
      >
        <span style={{ fontWeight: 700 }}>Aa</span>
        <span style={{ fontSize: '9px', marginTop: '1px', opacity: 0.7 }}>▾</span>
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
/**
 * ListPreviewTile — a Word-style mini preview: three sample rows each prefixed
 * with the list marker and followed by a faux text line, so the user sees what
 * the bullet/number format will look like before picking it.
 */
const ListPreviewTile = ({ markers, active, gradient }) => (
  <div style={{
    display: 'flex', flexDirection: 'column', gap: '3px',
    width: '100%', height: '100%', justifyContent: 'center',
    padding: '6px 7px', boxSizing: 'border-box',
  }}>
    {markers.map((m, i) => (
      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
        <span style={{
          minWidth: '13px', textAlign: 'right',
          fontSize: '9px', lineHeight: 1,
          fontFamily: '"Segoe UI", system-ui, sans-serif',
          // Gradient markers (e.g. the multi-colour arrowhead) clip a
          // gradient to the glyph; otherwise a plain solid colour.
          ...(gradient ? {
            background: gradient,
            WebkitBackgroundClip: 'text',
            backgroundClip: 'text',
            color: 'transparent',
            WebkitTextFillColor: 'transparent',
          } : { color: active ? '#0078d4' : '#444' }),
        }}>{m}</span>
        <span style={{ flex: 1, height: '2px', background: '#c4c4c4', borderRadius: '1px' }} />
      </div>
    ))}
  </div>
);

/** Small uppercase section heading used inside the list-library dropdown. */
const LibrarySectionLabel = ({ children }) => (
  <div style={{
    fontSize: '10px', fontWeight: 600, color: '#6b7280',
    textTransform: 'uppercase', letterSpacing: '0.5px',
    margin: '2px 2px 6px',
  }}>{children}</div>
);

/**
 * Portaled "list library" dropdown for picking a bullet or number style.
 * Mirrors Word's split layout: a "<Library Title>" section with all the
 * presets, then a "Document <kind>" section showing the style currently
 * applied in the document. `items` carry `{ id, markers, desc }`;
 * `currentStyle` highlights the active tile and feeds the Document section.
 */
const ListStyleMenu = ({
  anchor, items, onPick, onClose, currentStyle, columns = 3,
  libraryTitle = 'List Library', documentTitle = 'Document Lists',
}) => {
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

  const tileBtn = (active) => ({
    width: '62px', height: '52px',
    padding: 0,
    background: active ? '#eff6fc' : '#fff',
    border: `1px solid ${active ? '#0078d4' : '#e5e7eb'}`,
    borderRadius: '3px', cursor: 'pointer',
    transition: 'border-color 0.1s, background 0.1s',
  });

  const Tile = ({ it, active }) => (
    <button
      key={it.id}
      title={it.desc}
      onMouseDown={e => { e.preventDefault(); onPick(it.id); onClose(); }}
      style={tileBtn(active)}
      onMouseEnter={e => { if (!active) { e.currentTarget.style.borderColor = '#0078d4'; e.currentTarget.style.background = '#f3f9ff'; } }}
      onMouseLeave={e => { if (!active) { e.currentTarget.style.borderColor = '#e5e7eb'; e.currentTarget.style.background = '#fff'; } }}
    >
      <ListPreviewTile markers={it.markers} active={active} gradient={it.gradient} />
    </button>
  );

  // The "Document" section shows whichever preset is currently applied.
  const docItem = currentStyle ? items.find(it => it.id === currentStyle) : null;

  return createPortal(
    <div ref={menuRef} style={{
      position: 'fixed', top: pos.top, left: pos.left,
      background: '#fff', border: '1px solid #d1d5db', borderRadius: '6px',
      boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
      padding: '8px', zIndex: 13000,
      fontFamily: '"Segoe UI", system-ui, sans-serif',
    }}>
      <LibrarySectionLabel>{libraryTitle}</LibrarySectionLabel>
      <div style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${columns}, 62px)`,
        gap: '6px',
      }}>
        {items.map(it => <Tile key={it.id} it={it} active={currentStyle === it.id} />)}
      </div>

      {docItem && (
        <div style={{ borderTop: '1px solid #e5e7eb', marginTop: '8px', paddingTop: '8px' }}>
          <LibrarySectionLabel>{documentTitle}</LibrarySectionLabel>
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${columns}, 62px)`, gap: '6px' }}>
            <Tile it={docItem} active />
          </div>
        </div>
      )}

      <div style={{ borderTop: '1px solid #e5e7eb', marginTop: '8px', paddingTop: '6px' }}>
        <button
          onMouseDown={e => { e.preventDefault(); onPick(null); onClose(); }}
          style={{
            display: 'flex', alignItems: 'center', gap: '8px',
            width: '100%', padding: '5px 8px',
            background: 'transparent', border: 'none', borderRadius: '3px',
            cursor: 'pointer', fontSize: '12px', color: '#374151',
            fontFamily: 'inherit', textAlign: 'left',
          }}
          onMouseEnter={e => e.currentTarget.style.background = '#f3f4f6'}
          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
        >None</button>
      </div>
    </div>,
    target
  );
};

/**
 * Custom split-button for Underline — one rounded box containing "U" on the
 * left and a "▾" caret on the right, separated by a 1-px vertical divider.
 * Two independent click targets:
 *   - main → toggles underline (Ctrl+U behaviour)
 *   - caret → opens the underline-style picker
 * Renders the same 30-px hit area as the neighbouring B / I / S buttons so
 * the row stays visually balanced.
 */
const UnderlineSplit = ({ wrapperRef, isActive, caretOpen, onMain, onCaret }) => {
  const [hover, setHover] = useState(false);
  const showOutline = isActive || caretOpen || hover;
  return (
    <span
      ref={wrapperRef}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'inline-flex', alignItems: 'stretch', height: '20px',
        background: isActive ? '#cce4f7' : 'transparent',
        border: `1px solid ${showOutline ? '#0078d4' : 'transparent'}`,
        borderRadius: '6px', flexShrink: 0,
        transition: 'background 0.15s, border-color 0.15s',
      }}
    >
      <button
        onMouseDown={e => { e.preventDefault(); onMain(); }}
        title="Underline (Ctrl+U)"
        style={{
          // text-decoration:underline adds visible pixels below the U
          // baseline. With alignItems:center the glyph + underline sit
          // BELOW the box's geometric centre — making the hover halo
          // appear "above" the U. paddingBottom 4 px pushes the centred
          // content upward so the U cap-top and underline-bottom are
          // symmetric around the box's vertical centre.
          background: 'transparent', border: 'none', cursor: 'pointer',
          padding: '0 6px 4px 6px', minWidth: '24px',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Inter", Roboto, "Helvetica Neue", Arial, sans-serif',
          fontSize: '13px', fontWeight: isActive ? 600 : 500,
          color: isActive ? '#0a4f8f' : '#1f2937',
          textDecoration: 'underline',
          lineHeight: 1,
        }}
      >U</button>
      <span style={{
        // Short stub sitting at the bottom of the box, near the U's
        // baseline / underline. Just a 4-px tick — visually anchors the
        // split without overpowering the glyph.
        width: '1px',
        height: '4px',
        background: showOutline ? '#0078d4' : '#c8c8c8',
        alignSelf: 'flex-end',
        marginBottom: '2px',
        flexShrink: 0,
      }} />
      <button
        onMouseDown={e => { e.preventDefault(); onCaret(); }}
        title="Underline styles"
        style={{
          background: caretOpen ? '#cce4f7' : 'transparent',
          border: 'none', cursor: 'pointer',
          padding: '0 4px', minWidth: '16px',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          color: caretOpen ? '#0a4f8f' : '#6b7280',
          fontSize: '9px',
          borderRadius: '0 5px 5px 0',
        }}
      >▾</button>
    </span>
  );
};

/**
 * Word-style "Line Spacing" menu. Top section shows preset multipliers
 * (1.0 / 1.15 / 1.5 / 2.0 / 2.5 / 3.0) with a check on the current value;
 * the bottom section offers "Line Spacing Options…" plus toggle entries
 * to add/remove space BEFORE and AFTER the paragraph (the exact Word
 * dropdown layout).
 */
const SpacingMenu = ({ anchor, editor, onClose, onCustom }) => {
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const [target, setTarget] = useState(() =>
    typeof document !== 'undefined' ? (document.fullscreenElement || document.body) : null
  );
  const menuRef = useRef(null);

  // Live-preview machinery. On mount we capture the original line-height so
  // that hovering a preset can apply it transiently (without polluting undo
  // history) and the menu can restore it when the cursor leaves or the menu
  // closes without a commit. `committed` flips to true the moment a real
  // pick happens, so the unmount cleanup skips the restore.
  const originalLH = useRef(null);
  const committed = useRef(false);

  useEffect(() => {
    if (!editor) return;
    originalLH.current = editor.getAttributes('paragraph').lineHeight
      || editor.getAttributes('heading').lineHeight
      || null;
    return () => {
      if (committed.current) return;
      if (originalLH.current) {
        editor.chain().setLineHeight(originalLH.current).run();
      } else {
        editor.chain().unsetLineHeight().run();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const previewLH = (val) => {
    if (!editor) return;
    // Tiptap's chain supports setMeta to mark the transaction as non-historic
    // so hover previews don't show up as undo steps.
    editor.chain().setMeta('addToHistory', false).setLineHeight(val).run();
  };
  const revertPreview = () => {
    if (!editor) return;
    if (originalLH.current) {
      editor.chain().setMeta('addToHistory', false).setLineHeight(originalLH.current).run();
    } else {
      editor.chain().setMeta('addToHistory', false).unsetLineHeight().run();
    }
  };
  const commitLH = (val) => {
    committed.current = true;
    editor.chain().focus().setLineHeight(val).run();
    onClose();
  };

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

  const currentLH = editor.getAttributes('paragraph').lineHeight
    || editor.getAttributes('heading').lineHeight
    || null;
  const hasBefore = !!(editor.getAttributes('paragraph').spacingBefore
    || editor.getAttributes('heading').spacingBefore);
  const hasAfter = !!(editor.getAttributes('paragraph').spacingAfter
    || editor.getAttributes('heading').spacingAfter);

  const presets = ['0.5', '1', '1.15', '1.5', '2', '2.5', '3'];

  const rowStyle = (active) => ({
    display: 'flex', alignItems: 'center', gap: '10px',
    width: '100%', padding: '6px 12px',
    background: active ? '#eff6fc' : 'transparent',
    border: 'none', cursor: 'pointer',
    fontSize: '12px', color: active ? '#0078d4' : '#374151',
    fontFamily: 'inherit', textAlign: 'left',
  });

  return createPortal(
    <div ref={menuRef} style={{
      position: 'fixed', top: pos.top, left: pos.left,
      background: '#fff', border: '1px solid #d1d5db', borderRadius: '4px',
      boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
      padding: '4px 0', zIndex: 13000, minWidth: '240px',
      fontFamily: '"Segoe UI", system-ui, sans-serif',
    }}>
      {presets.map(p => {
        const active = String(currentLH) === p;
        return (
          <button
            key={p}
            onMouseDown={e => { e.preventDefault(); commitLH(p); }}
            style={rowStyle(active)}
            onMouseEnter={e => {
              if (!active) e.currentTarget.style.background = '#f3f4f6';
              // Live preview — apply transiently as the cursor hovers.
              previewLH(p);
            }}
            onMouseLeave={e => {
              if (!active) e.currentTarget.style.background = 'transparent';
              // Revert to the captured original line-height. If the user
              // moves to another preset row, that row's onMouseEnter will
              // re-preview, so the editor "follows" the hovered preset.
              revertPreview();
            }}
          >
            <span style={{ width: '14px' }}>{active ? '✓' : ''}</span>
            <span>{p === '1' ? '1.0' : p === '2' ? '2.0' : p === '3' ? '3.0' : p}</span>
          </button>
        );
      })}
      <div style={{ height: 1, background: '#e5e7eb', margin: '4px 0' }} />
      <button
        onMouseDown={e => { e.preventDefault(); onCustom(); onClose(); }}
        style={rowStyle(false)}
        onMouseEnter={e => e.currentTarget.style.background = '#f3f4f6'}
        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
      >
        <span style={{ width: '14px' }} />
        <span>Line Spacing Options…</span>
      </button>
      <div style={{ height: 1, background: '#e5e7eb', margin: '4px 0' }} />
      <button
        onMouseDown={e => { e.preventDefault(); editor.chain().focus().toggleSpaceBefore().run(); onClose(); }}
        style={rowStyle(false)}
        onMouseEnter={e => e.currentTarget.style.background = '#f3f4f6'}
        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
      >
        <span style={{ width: '14px' }} />
        <span>{hasBefore ? 'Remove Space Before Paragraph' : 'Add Space Before Paragraph'}</span>
      </button>
      <button
        onMouseDown={e => { e.preventDefault(); editor.chain().focus().toggleSpaceAfter().run(); onClose(); }}
        style={rowStyle(false)}
        onMouseEnter={e => e.currentTarget.style.background = '#f3f4f6'}
        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
      >
        <span style={{ width: '14px' }} />
        <span>{hasAfter ? 'Remove Space After Paragraph' : 'Add Space After Paragraph'}</span>
      </button>
    </div>,
    target
  );
};

/** Portaled menu for picking an underline style (single / double / thick /
 *  dotted / dashed / wavy / dot-dash / dot-dot-dash / none). Each row renders
 *  a live preview of the style so the user picks visually like in Word.   */
const UnderlineStyleMenu = ({ anchor, onPick, onClose, currentStyle }) => {
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

  // Preview CSS for each style — mirrors UnderlineStyle.js's STYLE_MAP /
  // SVG_PATTERNS so the swatch looks identical to the applied formatting.
  const previewCss = (style) => {
    if (!style) return { textDecoration: 'none' };
    if (style === 'dot-dash' || style === 'dot-dot-dash') {
      const dash = style === 'dot-dash'
        ? "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='14' height='3'><rect x='0' y='1' width='2' height='1.5' fill='%23374151'/><rect x='4' y='1' width='7' height='1.5' fill='%23374151'/></svg>\")"
        : "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='18' height='3'><rect x='0' y='1' width='2' height='1.5' fill='%23374151'/><rect x='4' y='1' width='2' height='1.5' fill='%23374151'/><rect x='8' y='1' width='7' height='1.5' fill='%23374151'/></svg>\")";
      return {
        textDecoration: 'none',
        backgroundImage: dash,
        backgroundRepeat: 'repeat-x',
        backgroundPosition: '0 100%',
        paddingBottom: '1px',
      };
    }
    const map = {
      'single':        { line: 'solid',  thickness: '1px' },
      'double':        { line: 'double', thickness: '3px' },
      'thick':         { line: 'solid',  thickness: '3px' },
      'dotted':        { line: 'dotted', thickness: '1.5px' },
      'thick-dotted':  { line: 'dotted', thickness: '3px' },
      'dashed':        { line: 'dashed', thickness: '1.5px' },
      'thick-dashed':  { line: 'dashed', thickness: '3px' },
      'wavy':          { line: 'wavy',   thickness: '1px' },
      'thick-wavy':    { line: 'wavy',   thickness: '2.5px' },
    };
    const c = map[style];
    if (!c) return {};
    return {
      textDecorationLine: 'underline',
      textDecorationStyle: c.line,
      textDecorationThickness: c.thickness,
      textDecorationSkipInk: 'none',
    };
  };

  const items = [
    { key: 'single',        label: 'Single' },
    { key: 'double',        label: 'Double' },
    { key: 'thick',         label: 'Thick' },
    { key: 'dotted',        label: 'Dotted' },
    { key: 'thick-dotted',  label: 'Thick Dotted' },
    { key: 'dashed',        label: 'Dashed' },
    { key: 'thick-dashed',  label: 'Thick Dashed' },
    { key: 'dot-dash',      label: 'Dot Dash' },
    { key: 'dot-dot-dash',  label: 'Dot Dot Dash' },
    { key: 'wavy',          label: 'Wavy' },
    { key: 'thick-wavy',    label: 'Thick Wavy' },
  ];

  return createPortal(
    <div ref={menuRef} style={{
      position: 'fixed', top: pos.top, left: pos.left,
      background: '#fff', border: '1px solid #d1d5db', borderRadius: '4px',
      boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
      padding: '4px', zIndex: 13000, minWidth: '200px',
      fontFamily: '"Segoe UI", system-ui, sans-serif',
    }}>
      {items.map(it => {
        const active = currentStyle === it.key || (it.key === 'single' && !currentStyle);
        return (
          <button
            key={it.key}
            onMouseDown={e => { e.preventDefault(); onPick(it.key); onClose(); }}
            style={{
              display: 'flex', alignItems: 'center', gap: '12px',
              width: '100%', padding: '5px 10px',
              background: active ? '#eff6fc' : 'transparent', border: 'none',
              borderRadius: '3px', cursor: 'pointer',
              fontSize: '12px', color: active ? '#0078d4' : '#374151',
              fontFamily: 'inherit', textAlign: 'left',
            }}
            onMouseEnter={e => { if (!active) e.currentTarget.style.background = '#f3f4f6'; }}
            onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent'; }}
          >
            <span style={{ width: '72px', display: 'inline-block', ...previewCss(it.key) }}>Ag</span>
            <span style={{ flex: 1 }}>{it.label}</span>
            {active && <span style={{ fontSize: '11px' }}>✓</span>}
          </button>
        );
      })}
      <div style={{ height: 1, background: '#e5e7eb', margin: '4px 0' }} />
      <button
        onMouseDown={e => { e.preventDefault(); onPick(null); onClose(); }}
        style={{
          display: 'flex', alignItems: 'center', gap: '12px',
          width: '100%', padding: '5px 10px',
          background: 'transparent', border: 'none',
          borderRadius: '3px', cursor: 'pointer',
          fontSize: '12px', color: '#374151',
          fontFamily: 'inherit', textAlign: 'left',
        }}
        onMouseEnter={e => e.currentTarget.style.background = '#f3f4f6'}
        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
      >
        <span style={{ width: '72px', color: '#9ca3af' }}>None</span>
        <span style={{ flex: 1 }}>Remove underline</span>
      </button>
    </div>,
    target
  );
};

/** Portaled menu for paragraph borders. */
/**
 * MultilevelMenu — Word-style "List Library" for multilevel outlines. Shows a
 * grid of template tiles, each previewing the per-level markers it applies.
 */
const MultilevelMenu = ({ anchor, onPick, onClose, currentStyle }) => {
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

  // Each template previews three indented levels.
  const templates = [
    { id: 'numbers', name: 'Numbered',  desc: 'Number / letter / roman', levels: ['1.', 'a.', 'i.'] },
    { id: 'legal',   name: 'Legal',     desc: 'Legal (1, 1.1, 1.1.1)',   levels: ['1', '1.1', '1.1.1'] },
    { id: 'bullets', name: 'Bulleted',  desc: 'Bullet outline',          levels: ['•', '◦', '▪'] },
    { id: 'mixed',   name: 'Outline',   desc: 'Roman / letter / number', levels: ['I.', 'A.', '1.'] },
  ];

  return createPortal(
    <div ref={menuRef} style={{
      position: 'fixed', top: pos.top, left: pos.left,
      background: 'linear-gradient(180deg,#ffffff 0%,#fbfcfe 100%)',
      border: '1px solid #e2e6ee', borderRadius: '12px',
      boxShadow: '0 18px 48px -12px rgba(15,23,42,0.30), 0 4px 12px rgba(15,23,42,0.10)',
      padding: '14px', zIndex: 13000,
      fontFamily: '"Segoe UI", system-ui, sans-serif',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: '7px',
        margin: '0 2px 11px',
      }}>
        <span style={{
          fontSize: '11px', fontWeight: 700, color: '#0f172a',
          letterSpacing: '0.4px', textTransform: 'uppercase',
        }}>List Library</span>
        <span style={{ flex: 1, height: '1px', background: 'linear-gradient(90deg,#e2e6ee,transparent)' }} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 104px)', gap: '10px' }}>
        {templates.map(t => {
          const active = currentStyle === t.id;
          return (
            <button
              key={t.id}
              title={t.desc}
              onMouseDown={e => { e.preventDefault(); onPick(t.id); onClose(); }}
              style={{
                width: '104px', padding: '10px 10px 8px',
                background: active
                  ? 'linear-gradient(180deg,#eef6ff 0%,#e3f0ff 100%)'
                  : 'linear-gradient(180deg,#ffffff 0%,#fafbfd 100%)',
                border: `1px solid ${active ? '#3b82f6' : '#e6e9f0'}`,
                borderRadius: '9px', cursor: 'pointer',
                display: 'flex', flexDirection: 'column', gap: '6px',
                boxShadow: active
                  ? '0 0 0 3px rgba(59,130,246,0.15), 0 4px 10px rgba(59,130,246,0.18)'
                  : '0 1px 2px rgba(15,23,42,0.05)',
                transition: 'transform 0.14s cubic-bezier(.2,.8,.2,1), box-shadow 0.14s, border-color 0.14s, background 0.14s',
                transform: 'translateY(0)',
              }}
              onMouseEnter={e => {
                if (!active) {
                  e.currentTarget.style.borderColor = '#bcd4ff';
                  e.currentTarget.style.boxShadow = '0 6px 16px -4px rgba(59,130,246,0.28)';
                }
                e.currentTarget.style.transform = 'translateY(-2px)';
              }}
              onMouseLeave={e => {
                if (!active) {
                  e.currentTarget.style.borderColor = '#e6e9f0';
                  e.currentTarget.style.boxShadow = '0 1px 2px rgba(15,23,42,0.05)';
                }
                e.currentTarget.style.transform = 'translateY(0)';
              }}
            >
              {/* Preview rows */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', minHeight: '34px', justifyContent: 'center' }}>
                {t.levels.map((lv, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '5px', marginLeft: `${i * 10}px` }}>
                    <span style={{
                      fontSize: '8.5px', fontWeight: 600,
                      color: active ? '#2563eb' : '#475569',
                      minWidth: '22px', textAlign: 'right', lineHeight: 1,
                    }}>{lv}</span>
                    <span style={{
                      flex: 1, height: '2.5px', borderRadius: '2px',
                      background: active
                        ? 'linear-gradient(90deg,#93c5fd,#dbeafe)'
                        : 'linear-gradient(90deg,#cbd5e1,#e8edf3)',
                    }} />
                  </div>
                ))}
              </div>
              {/* Template name */}
              <span style={{
                fontSize: '10.5px', fontWeight: 600,
                color: active ? '#2563eb' : '#334155',
                textAlign: 'center', letterSpacing: '0.2px',
                borderTop: '1px solid', borderImage: active
                  ? 'linear-gradient(90deg,transparent,#bfdbfe,transparent) 1'
                  : 'linear-gradient(90deg,transparent,#eceff4,transparent) 1',
                paddingTop: '6px',
              }}>{t.name}</span>
            </button>
          );
        })}
      </div>

      <div style={{ marginTop: '12px', paddingTop: '4px' }}>
        <button
          onMouseDown={e => { e.preventDefault(); onPick(null); onClose(); }}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '7px',
            width: '100%', padding: '8px',
            background: '#f8fafc', border: '1px solid #e6e9f0', borderRadius: '8px',
            cursor: 'pointer', fontSize: '11.5px', fontWeight: 600, color: '#64748b',
            fontFamily: 'inherit',
            transition: 'background 0.12s, color 0.12s, border-color 0.12s',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = '#eef2f7'; e.currentTarget.style.color = '#334155'; e.currentTarget.style.borderColor = '#d6dce6'; }}
          onMouseLeave={e => { e.currentTarget.style.background = '#f8fafc'; e.currentTarget.style.color = '#64748b'; e.currentTarget.style.borderColor = '#e6e9f0'; }}
        >
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
            <path d="M3 8h10" />
          </svg>
          None (single level)
        </button>
      </div>
    </div>,
    target
  );
};

/**
 * BorderIcon — Word-style border preview. Draws a faint dashed paragraph box
 * and overlays bold solid lines for whichever edges (and inner grid) the
 * border option affects, so each menu row reads visually like in MS Word.
 */
const BorderIcon = ({ top, bottom, left, right, inner }) => {
  const faint = '#bdbdbd';
  const bold = '#1f1f1f';
  const dash = '1.4 1.4';
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" style={{ display: 'block', flexShrink: 0 }}>
      <rect x="2.5" y="2.5" width="11" height="11" fill="none" stroke={faint} strokeWidth="1" strokeDasharray={dash} />
      {inner && (
        <>
          <line x1="8" y1="2.5" x2="8" y2="13.5" stroke={bold} strokeWidth="1.3" />
          <line x1="2.5" y1="8" x2="13.5" y2="8" stroke={bold} strokeWidth="1.3" />
        </>
      )}
      {top    && <line x1="2.2"  y1="2.5"  x2="13.8" y2="2.5"  stroke={bold} strokeWidth="1.7" />}
      {bottom && <line x1="2.2"  y1="13.5" x2="13.8" y2="13.5" stroke={bold} strokeWidth="1.7" />}
      {left   && <line x1="2.5"  y1="2.2"  x2="2.5"  y2="13.8" stroke={bold} strokeWidth="1.7" />}
      {right  && <line x1="13.5" y1="2.2"  x2="13.5" y2="13.8" stroke={bold} strokeWidth="1.7" />}
    </svg>
  );
};

/** "No border" icon — faint dashed box with a small red cross. */
const NoBorderIcon = () => (
  <svg width="15" height="15" viewBox="0 0 16 16" style={{ display: 'block', flexShrink: 0 }}>
    <rect x="2.5" y="2.5" width="11" height="11" fill="none" stroke="#bdbdbd" strokeWidth="1" strokeDasharray="1.4 1.4" />
  </svg>
);

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
    { id: 'bottom', label: 'Bottom Border', icon: { bottom: true } },
    { id: 'top',    label: 'Top Border',    icon: { top: true } },
    { id: 'left',   label: 'Left Border',   icon: { left: true } },
    { id: 'right',  label: 'Right Border',  icon: { right: true } },
    { id: 'all',    label: 'All Borders',   icon: { top: true, bottom: true, left: true, right: true, inner: true } },
    { id: 'box',    label: 'Outside Borders', icon: { top: true, bottom: true, left: true, right: true } },
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
            display: 'flex', alignItems: 'center', gap: '10px',
            width: '100%', padding: '6px 10px',
            background: 'transparent', border: 'none', borderRadius: '3px',
            cursor: 'pointer', fontSize: '12px', color: '#374151',
            fontFamily: 'inherit', textAlign: 'left',
          }}
          onMouseEnter={e => e.currentTarget.style.background = '#f3f4f6'}
          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
        >
          <BorderIcon {...it.icon} />
          <span>{it.label}</span>
        </button>
      ))}
      <div style={{ borderTop: '1px solid #e5e7eb', marginTop: '4px', paddingTop: '4px' }}>
        <button
          onMouseDown={e => { e.preventDefault(); onClear(); onClose(); }}
          style={{
            display: 'flex', alignItems: 'center', gap: '10px',
            width: '100%', padding: '6px 10px',
            background: 'transparent', border: 'none', borderRadius: '3px',
            cursor: 'pointer', fontSize: '12px', color: '#dc2626',
            fontFamily: 'inherit', textAlign: 'left',
          }}
          onMouseEnter={e => e.currentTarget.style.background = '#fef2f2'}
          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
        >
          <NoBorderIcon />
          <span>No Border</span>
        </button>
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
  const [showUnderlineStyles, setShowUnderlineStyles] = useState(false);
  const [showSpacingMenu, setShowSpacingMenu] = useState(false);
  const [showMultilevel, setShowMultilevel] = useState(false);
  const [painterActive, setPainterActive] = useState(false);
  const colorBtnRef = useRef(null);
  const hlBtnRef = useRef(null);
  const bulletBtnRef = useRef(null);
  const orderedBtnRef = useRef(null);
  const shadingBtnRef = useRef(null);
  const bordersBtnRef = useRef(null);
  const underlineBtnRef = useRef(null);
  const spacingBtnRef = useRef(null);
  const multilevelBtnRef = useRef(null);

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
      {/* ── Clipboard group — 2 × 2 icon grid:
            ┌──────┬─────┐
            │Paste │ Cut │
            ├──────┼─────┤
            │ Copy │ Pntr│
            └──────┴─────┘
          Each cell is the same size, icon-only, name in the tooltip.
          Compact and symmetrical — fits in ~62 px of horizontal space. */}
      <Group label="Clipboard">
        <div style={clipboardGridStyle}>
          <Btn
            title="Paste (Ctrl+V)"
            style={clipboardCellStyle}
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
          >
            <Icon d={ICON_PASTE} size={14} />
          </Btn>
          <Btn
            onClick={() => document.execCommand('cut')}
            title="Cut (Ctrl+X)"
            style={clipboardCellStyle}
          >
            <Icon d={ICON_CUT} size={14} />
          </Btn>
          <Btn
            onClick={() => document.execCommand('copy')}
            title="Copy (Ctrl+C)"
            style={clipboardCellStyle}
          >
            <Icon d={ICON_COPY} size={14} />
          </Btn>
          <Btn
            onClick={() => {
              if (painterActive) editor.chain().focus().cancelFormatPainter().run();
              else editor.chain().focus().pickupFormat().run();
            }}
            active={painterActive}
            title={painterActive
              ? 'Format Painter active — click again to cancel  (Ctrl+Shift+C / V)'
              : 'Format Painter — pick up formatting  (Ctrl+Shift+C)'}
            style={clipboardCellStyle}
          >
            <Icon d={ICONS.painter} size={14} />
          </Btn>
        </div>
      </Group>

      <Sep />

      {/* ── Font group ──────────────────────────────────── */}
      <Group label="Font" onLauncher={(anchor) => window.dispatchEvent(new CustomEvent('narrative-editor:open-font-dialog', { detail: { anchor } }))}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'flex-start' }}>
          <div style={{ display: 'flex', gap: '4px' }}>
            <Combobox
              value={currentFontFamily}
              onChange={(v) => editor.chain().focus().setMark('textStyle', { fontFamily: v }).run()}
              options={[
                { isHeader: true, label: 'Theme Fonts' },
                ...THEME_FONTS.map(t => ({
                  value: t.value,
                  label: t.label,
                  subtitle: t.subtitle,
                  sample: { fontFamily: t.value },
                })),
                { isHeader: true, label: 'All Fonts' },
                ...FONT_FAMILIES.map(f => ({ value: f, label: f, sample: { fontFamily: f } })),
              ]}
              renderItem={(opt) => (
                <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: '6px' }}>
                  <span style={opt.sample || {}}>{opt.label}</span>
                  {opt.subtitle && (
                    <span style={{ fontSize: '10.5px', color: '#6b7280' }}>{opt.subtitle}</span>
                  )}
                </span>
              )}
              width={104}
              title="Font Family"
              renderValue={(_, sel) => <span style={{ fontFamily: sel?.value || 'Calibri' }}>{sel?.label || 'Calibri'}</span>}
            />
            <Combobox
              value={currentFontSize}
              onChange={(v) => editor.chain().focus().setMark('textStyle', { fontSize: `${v}pt` }).run()}
              options={FONT_SIZES.map(s => ({ value: s, label: s }))}
              width={46}
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
            <UnderlineSplit
              wrapperRef={underlineBtnRef}
              isActive={editor.isActive('underline')}
              caretOpen={showUnderlineStyles}
              onMain={() => editor.chain().focus().toggleUnderline().run()}
              onCaret={() => setShowUnderlineStyles(v => !v)}
            />
            {showUnderlineStyles && (
              <UnderlineStyleMenu
                anchor={underlineBtnRef.current}
                onClose={() => setShowUnderlineStyles(false)}
                currentStyle={editor.getAttributes('underline')?.underlineStyle || null}
                onPick={(style) => editor.chain().focus().setUnderlineStyle(style).run()}
              />
            )}
            <Btn onClick={() => editor.chain().focus().toggleStrike().run()} active={editor.isActive('strike')} title="Strikethrough" style={{ textDecoration: 'line-through' }}>S</Btn>
            <Btn onClick={() => editor.commands.toggleSubscript?.()} active={editor.isActive('subscript')} title="Subscript (Ctrl+=)" style={{ fontSize: '11px' }}>
              x<sub>2</sub>
            </Btn>
            <Btn onClick={() => editor.commands.toggleSuperscript?.()} active={editor.isActive('superscript')} title="Superscript (Ctrl+Shift++)" style={{ fontSize: '11px' }}>
              x<sup>2</sup>
            </Btn>

            {/* Text color — "A" with a small square colour chip below it
                so the button stays compact (~square aspect) and the hover
                halo reads as a square rather than a wide rectangle. */}
            <div ref={colorBtnRef} style={{ display: 'inline-flex' }}>
              <Btn onClick={() => { setShowColors(v => !v); setShowHighlights(false); }} title="Font Color">
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1px' }}>
                  <span style={{ fontWeight: 900, fontSize: '12px', lineHeight: 1 }}>A</span>
                  <div style={{
                    width: '12px', height: '4px',
                    background: currentColor,
                    border: '1px solid rgba(0,0,0,0.15)',
                  }} />
                </div>
              </Btn>
            </div>
            {showColors && (
              <ColorPicker
                anchorEl={colorBtnRef.current}
                onSelect={c => editor.chain().focus().setColor(c).unsetTextGradient().run()}
                onClear={() => editor.chain().focus().unsetColor().unsetTextGradient().run()}
                onSelectGradient={g => editor.chain().focus().setTextGradient(g).run()}
                onClose={() => setShowColors(false)}
                clearLabel="Automatic"
              />
            )}

            {/* Highlight — "ab" with a colour chip below to keep the button
                compact and the hover halo square. */}
            <div ref={hlBtnRef} style={{ display: 'inline-flex' }}>
              <Btn onClick={() => { setShowHighlights(v => !v); setShowColors(false); }} title="Highlight Color">
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1px' }}>
                  <span style={{ fontSize: '11px', lineHeight: 1 }}>ab</span>
                  <div style={{
                    width: '14px', height: '4px',
                    background: currentHL || '#ffff00',
                    border: '1px solid rgba(0,0,0,0.15)',
                  }} />
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

      {/* ── Paragraph group ─────────────────────────────────────────
           Row 1: alignment.   Row 2: indent + line spacing + paragraph
           shading + borders. List-specific controls moved to the new
           Lists group on the right. */}
      <Group label="Paragraph" onLauncher={(anchor) => window.dispatchEvent(new CustomEvent('narrative-editor:open-paragraph-dialog', { detail: { anchor } }))}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'flex-start' }}>
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
          </div>
          <div style={{ display: 'flex', gap: '1px', alignItems: 'center' }}>
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
            {/* Hanging indent — wrapped lines hang under the first line (e.g. the
                organ-label layout). Toggle on (~0.5") / off; fine-tune on the ruler. */}
            <Btn
              onClick={() => {
                const cur = (editor.getAttributes('paragraph')?.hangingIndent || editor.getAttributes('heading')?.hangingIndent || 0);
                editor.chain().focus().setHangingIndent(cur > 0 ? 0 : 36).run();
              }}
              active={(editor.getAttributes('paragraph')?.hangingIndent || editor.getAttributes('heading')?.hangingIndent || 0) > 0}
              title="Hanging indent — wrapped lines indent under the first line"
              style={{ fontSize: '13px' }}
            >↳</Btn>
            {/* Word-style "Line and Paragraph Spacing" button with a rich
                dropdown — line-spacing presets at top, custom-options entry
                in the middle, and "Add / Remove Space Before / After
                Paragraph" toggles at the bottom. */}
            <span ref={spacingBtnRef} style={{ display: 'inline-flex' }}>
              <Btn
                onClick={() => setShowSpacingMenu(v => !v)}
                active={showSpacingMenu}
                title="Line and Paragraph Spacing"
                style={{ minWidth: '32px' }}
              >
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '2px', lineHeight: 1 }}>
                  <span style={{
                    display: 'inline-flex', flexDirection: 'column', gap: '2px',
                    lineHeight: 1, fontSize: '8px',
                  }}>
                    <span>▬</span>
                    <span>▬</span>
                    <span>▬</span>
                  </span>
                  <span style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', lineHeight: 1, fontSize: '8px' }}>
                    <span>▲</span>
                    <span>▼</span>
                  </span>
                  <span style={{ fontSize: '7px', marginLeft: '1px' }}>▾</span>
                </span>
              </Btn>
            </span>
            {showSpacingMenu && (
              <SpacingMenu
                anchor={spacingBtnRef.current}
                editor={editor}
                onClose={() => setShowSpacingMenu(false)}
                onCustom={async () => {
                  const current = editor.getAttributes('paragraph').lineHeight || editor.getAttributes('heading').lineHeight || '1.6';
                  const input = await editorPrompt({
                    title: 'Custom Line Spacing',
                    message: 'Enter a number (e.g. 1.75) or value with unit (e.g. 24px, 150%). Minimum is 0.5 — anything tighter would overlap text.',
                    defaultValue: String(current),
                    placeholder: '1.75',
                    confirmLabel: 'Apply',
                  });
                  if (input == null) return;
                  const trimmed = input.trim();
                  if (!trimmed) editor.chain().focus().unsetLineHeight().run();
                  else editor.chain().focus().setLineHeight(trimmed).run();
                }}
              />
            )}

            {/* Shading — paragraph background color. Word-style paint-bucket
                glyph with the active fill shown as a colour bar underneath. */}
            <span ref={shadingBtnRef} style={{ display: 'inline-flex' }}>
              <Btn
                onClick={() => { setShowShading(v => !v); setShowBorders(false); }}
                active={showShading || !!editor.getAttributes('paragraph').shading}
                title="Paragraph Shading"
                style={{ minWidth: '28px' }}
              >
                <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1px' }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                       stroke="currentColor" strokeWidth="2"
                       strokeLinecap="round" strokeLinejoin="round"
                       style={{ display: 'block' }}>
                    {/* tilted bucket */}
                    <path d="M19 11l-8.5-8.5a1 1 0 0 0-1.4 0L2.9 8.7a1 1 0 0 0 0 1.4l5.5 5.5a1 1 0 0 0 1.4 0L19 8.4" />
                    {/* spilled-paint drop */}
                    <path d="M5 3l1.5 1.5" />
                    <path d="M21.5 17.5c0 1.1-.9 2-2 2s-2-.9-2-2c0-1 2-3.5 2-3.5s2 2.5 2 3.5z" fill="currentColor" stroke="none" />
                  </svg>
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
                style={{ minWidth: '28px' }}
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

      {/* ── Lists group (NEW — carved out of Paragraph) ─────────────
           Row 1: bullet / numbered (both split buttons with style picker) +
           multilevel + sort.   Row 2: ¶ formatting marks. */}
      <Group label="Lists">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'flex-start' }}>
          <div style={{ display: 'flex', gap: '1px', alignItems: 'center' }}>
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
                currentStyle={editor.getAttributes('bulletList').listStyleType || 'disc'}
                columns={6}
                libraryTitle="Bullet Library"
                documentTitle="Document Bullets"
                items={[
                  { id: 'disc',      markers: ['•', '•', '•'],  desc: 'Disc' },
                  { id: 'circle',    markers: ['◦', '◦', '◦'],  desc: 'Circle' },
                  { id: 'square',    markers: ['▪', '▪', '▪'],  desc: 'Square' },
                  { id: 'arrow',     markers: ['▸', '▸', '▸'],  desc: 'Arrow' },
                  { id: 'triangle',  markers: ['‣', '‣', '‣'],  desc: 'Triangle' },
                  { id: 'checkmark', markers: ['✓', '✓', '✓'],  desc: 'Checkmark' },
                  { id: 'diamond',   markers: ['◆', '◆', '◆'],  desc: 'Diamond' },
                  { id: 'star',      markers: ['★', '★', '★'],  desc: 'Star' },
                  { id: 'dash',      markers: ['—', '—', '—'],  desc: 'Dash' },
                  { id: 'arrowhead', markers: ['➤', '➤', '➤'],  desc: 'Arrowhead (black & white)', gradient: 'linear-gradient(135deg,#000000 0%,#000000 50%,#9ca3af 50%,#e5e7eb 100%)' },
                  { id: 'hand',      markers: ['☞', '☞', '☞'],  desc: 'Hand' },
                  { id: 'circ-fill', markers: ['●', '●', '●'],  desc: 'Filled circle' },
                ]}
                onPick={(s) => s
                  ? editor.chain().focus().setBulletStyle(s).run()
                  : editor.chain().focus().toggleBulletList().run()}
              />
            )}

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
                currentStyle={editor.getAttributes('orderedList').listStyleType || 'decimal'}
                columns={4}
                libraryTitle="Numbering Library"
                documentTitle="Document Numbering"
                items={[
                  { id: 'decimal',       markers: ['1.', '2.', '3.'],    desc: '1. 2. 3.' },
                  { id: 'decimal-paren', markers: ['1)', '2)', '3)'],    desc: '1) 2) 3)' },
                  { id: 'lower-alpha',   markers: ['a.', 'b.', 'c.'],    desc: 'a. b. c.' },
                  { id: 'alpha-paren',   markers: ['a)', 'b)', 'c)'],    desc: 'a) b) c)' },
                  { id: 'upper-alpha',   markers: ['A.', 'B.', 'C.'],    desc: 'A. B. C.' },
                  { id: 'upper-paren',   markers: ['A)', 'B)', 'C)'],    desc: 'A) B) C)' },
                  { id: 'lower-roman',   markers: ['i.', 'ii.', 'iii.'], desc: 'i. ii. iii.' },
                  { id: 'upper-roman',   markers: ['I.', 'II.', 'III.'], desc: 'I. II. III.' },
                ]}
                onPick={(s) => s
                  ? editor.chain().focus().setOrderedStyle(s).run()
                  : editor.chain().focus().toggleOrderedList().run()}
              />
            )}

            <SplitButton
              btnRef={multilevelBtnRef}
              active={
                (editor.isActive('orderedList') && editor.getAttributes('orderedList').multilevel) ||
                (editor.isActive('bulletList') && editor.getAttributes('bulletList').multilevel)
              }
              caretOpen={showMultilevel}
              title="Multilevel List"
              onMain={() => editor.chain().focus().toggleMultilevelList().run()}
              onCaret={() => { setShowMultilevel(v => !v); setShowBullet(false); setShowOrdered(false); }}
            >
              <span style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-start', lineHeight: 1, gap: '1px', fontSize: '8px' }}>
                <span>1.</span>
                <span style={{ marginLeft: '4px' }}>a.</span>
                <span style={{ marginLeft: '8px' }}>i.</span>
              </span>
            </SplitButton>
            {showMultilevel && (
              <MultilevelMenu
                anchor={multilevelBtnRef.current}
                onClose={() => setShowMultilevel(false)}
                currentStyle={
                  editor.getAttributes('orderedList').multilevelStyle
                  || editor.getAttributes('bulletList').multilevelStyle
                  || null
                }
                onPick={(t) => t
                  ? editor.chain().focus().setMultilevelStyle(t).run()
                  : editor.chain().focus().toggleMultilevelList().run()}
              />
            )}
            <Btn
              onClick={() => editor.chain().focus().sortSelected('asc').run()}
              title="Sort A → Z (selected list / paragraphs)"
              style={{ fontSize: '12px', fontWeight: 600, minWidth: '32px' }}
            >A↓Z</Btn>
          </div>
          <div style={{ display: 'flex', gap: '1px' }}>
            <Btn
              onClick={() => onToggleFormattingMarks?.()}
              active={!!showFormattingMarks}
              title="Show/Hide formatting marks (¶)"
              style={{ fontSize: '13px', fontWeight: 700 }}
            >¶</Btn>
          </div>
        </div>
      </Group>

      <Sep />

      {/* ── Styles group ────────────────────────────────── */}
      <Group label="Styles">
        <StylesGallery editor={editor} />
      </Group>

      <Sep />

      {/* ── Find group (was "Editing") — Undo/Redo removed; they live
           in the Quick Access Toolbar at the top of the ribbon. */}
      <Group label="Find">
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
  // Explicit minHeight/minWidth needed — global.css applies
  // button { min-height: 44px; min-width: 44px } which would otherwise
  // stretch these compact rows to 44 px tall.
  minHeight: '18px', minWidth: 0,
  padding: '0 6px',
  background: 'transparent', border: '1px solid transparent',
  borderRadius: '3px', cursor: 'pointer',
  fontSize: '11px', lineHeight: 1, color: '#323130',
  fontFamily: '"Segoe UI", system-ui, sans-serif',
  boxSizing: 'border-box', flexShrink: 0,
};

// ── Clipboard 2×2 icon grid (Paste / Cut · Copy / Format Painter) ──────
// Symmetric 2-column × 2-row layout — each cell is a 30×26 icon button.
// 6 px gap between cells gives clear visual separation so adjacent icons
// don't read as one block. Tooltips carry the action name + shortcut.
const clipboardGridStyle = {
  display: 'grid',
  gridTemplateColumns: 'repeat(2, 30px)',
  gridTemplateRows: 'repeat(2, 26px)',
  gap: '6px',
};
const clipboardCellStyle = {
  width: '30px',
  minWidth: '30px',
  height: '26px',
  padding: 0,
  borderRadius: '4px',
};

// ── Per-action icon paths (Bootstrap Icons-style 16×16 viewBox) ────────
// Paste and Copy were sharing the same clipboard glyph, which was visually
// confusing. Now each action has a distinctive icon:
//   Paste — clipboard
//   Cut   — scissors (unchanged)
//   Copy  — two overlapping documents (bi-files)
//   Painter — paintbrush (from ICONS.painter)
const ICON_PASTE =
  'M4 1.5H3a2 2 0 0 0-2 2V14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V3.5a2 2 0 0 0-2-2h-1v1h1a1 1 0 0 1 1 1V14a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V3.5a1 1 0 0 1 1-1h1v-1zM9.5 1v1h-3V1h3zm-4-1a1 1 0 0 0-1 1v2a1 1 0 0 0 1 1h5a1 1 0 0 0 1-1V1a1 1 0 0 0-1-1z';
const ICON_CUT =
  'M9.828.722a.5.5 0 0 1 .354.146l4.95 4.95a.5.5 0 0 1 0 .707c-.48.48-1.072.588-1.503.588-.177 0-.335-.018-.46-.039l-3.134 3.134a5.5 5.5 0 0 1 .16 1.013c.046.702-.032 1.687-.72 2.375a.5.5 0 0 1-.707 0l-2.829-2.828-3.182 3.182a.5.5 0 0 1-.707-.707l3.182-3.182-2.828-2.829a.5.5 0 0 1 0-.707c.688-.688 1.673-.767 2.375-.72a5.5 5.5 0 0 1 1.013.16l3.134-3.133a2.7 2.7 0 0 1-.04-.461c0-.43.108-1.022.589-1.503a.5.5 0 0 1 .353-.146';
const ICON_COPY =
  'M13 0H6a2 2 0 0 0-2 2 2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h7a2 2 0 0 0 2-2 2 2 0 0 0 2-2V2a2 2 0 0 0-2-2zm0 13V4a2 2 0 0 0-2-2H5a1 1 0 0 1 1-1h7a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1zM3 4a1 1 0 0 1 1-1h7a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4z';

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
