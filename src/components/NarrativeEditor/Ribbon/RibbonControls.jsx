import React, { useRef, useEffect, useState, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';

// ── Shared primitives for the ribbon ─────────────────────────────────────────

export const Btn = ({ onClick, disabled, active, title, children, style = {} }) => (
  <button
    onMouseDown={e => { e.preventDefault(); onClick?.(); }}
    disabled={disabled}
    title={title}
    style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      minWidth: '28px', height: '28px', padding: '0 6px',
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

/**
 * Larger "split" button — Word-style big icon with label below.
 * Used for primary actions in a group (e.g. Paste, Format Painter).
 */
export const BigBtn = ({ onClick, disabled, active, title, icon, label, style = {} }) => (
  <button
    onMouseDown={e => { e.preventDefault(); onClick?.(); }}
    disabled={disabled}
    title={title}
    style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-start',
      gap: '3px',
      minWidth: '52px', height: '58px', padding: '4px 6px',
      background: active ? '#cce4f7' : 'transparent',
      border: `1px solid ${active ? '#90c8f0' : 'transparent'}`,
      borderRadius: '3px', cursor: disabled ? 'not-allowed' : 'pointer',
      fontSize: '10px', color: active ? '#003a75' : '#323130',
      opacity: disabled ? 0.38 : 1, lineHeight: 1.2, flexShrink: 0,
      fontFamily: '"Segoe UI", system-ui, sans-serif',
      transition: 'background 0.08s, border-color 0.08s',
      ...style,
    }}
    onMouseEnter={e => { if (!disabled && !active) e.currentTarget.style.background = '#e8e8e8'; }}
    onMouseLeave={e => { if (!active) e.currentTarget.style.background = active ? '#cce4f7' : 'transparent'; }}
  >
    <div style={{ fontSize: '18px', lineHeight: 1, marginTop: '4px' }}>{icon}</div>
    <span style={{ marginTop: 'auto', textAlign: 'center', whiteSpace: 'nowrap' }}>{label}</span>
  </button>
);

export const Sep = () => (
  <div style={{ width: '1px', height: '52px', background: '#d1d1d1', margin: '0 6px', flexShrink: 0 }} />
);

export const Icon = ({ d, size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" style={{ display: 'block', pointerEvents: 'none' }}>
    <path d={d} />
  </svg>
);

/**
 * Group — Word-style ribbon group with controls on top and label at bottom.
 */
export const Group = ({ label, children, style = {} }) => (
  <div style={{
    display: 'flex', flexDirection: 'column', alignItems: 'stretch',
    padding: '4px 4px 0', flexShrink: 0, ...style,
  }}>
    <div style={{
      display: 'flex', alignItems: 'center', gap: '2px',
      flex: 1, minHeight: '52px',
    }}>
      {children}
    </div>
    <div style={{
      textAlign: 'center', fontSize: '10px', color: '#666',
      paddingTop: '2px', userSelect: 'none', letterSpacing: '0.2px',
    }}>
      {label}
    </div>
  </div>
);

/** Vertical mini-stack inside a Group — three small buttons stacked. */
export const VStack = ({ children, style = {} }) => (
  <div style={{
    display: 'flex', flexDirection: 'column', gap: '2px', alignItems: 'flex-start',
    ...style,
  }}>{children}</div>
);

export const selectStyle = {
  height: '24px', padding: '0 6px', border: '1px solid #c8c8c8',
  borderRadius: '3px', fontSize: '12px', background: '#fff',
  color: '#323130', cursor: 'pointer', outline: 'none',
  fontFamily: '"Segoe UI", sans-serif',
};

// ── Icon set ─────────────────────────────────────────────────────────────────

export const ICONS = {
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
  search: 'M11.742 10.344a6.5 6.5 0 1 0-1.397 1.398h-.001l3.85 3.85a1 1 0 0 0 1.415-1.414l-3.85-3.85a1.007 1.007 0 0 0-.117-.1zM12 6.5a5.5 5.5 0 1 1-11 0 5.5 5.5 0 0 1 11 0z',
  brush: 'M11.534.32a.5.5 0 0 1 .832.273l.5 4.5a.5.5 0 0 1-.84.439L9.5 4.058l-4.49 4.49 1.474 1.474a.5.5 0 0 1-.353.854l-4.5.5a.5.5 0 0 1-.547-.547l.5-4.5a.5.5 0 0 1 .854-.353L3.912 7.45 8.402 2.96l-1.474-1.475a.5.5 0 0 1 .439-.84z',
  mic: 'M3.5 6.5A.5.5 0 0 1 4 7v1a4 4 0 0 0 8 0V7a.5.5 0 0 1 1 0v1a5 5 0 0 1-4.5 4.975V15h3a.5.5 0 0 1 0 1h-7a.5.5 0 0 1 0-1h3v-2.025A5 5 0 0 1 3 8V7a.5.5 0 0 1 .5-.5zM8 1a3 3 0 0 0-3 3v4a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z',
  spell: 'M5.83 7.41 7.41 5.83 4.83 3.25l-1.58 1.58zM10.41 5.83l-2.58 2.58 1.58 1.58 2.58-2.58zM4 14h2v2H4zM7 11h2v2H7zM10 14h2v2h-2z',
  pageBreak: 'M14 7H2v2h12V7zM2 5h12V3H2v2zm0 8h12v-2H2v2z',
  symbol: 'M11.5 1a.5.5 0 0 0-.5.5V3H8.5v-.5a.5.5 0 0 0-1 0V3H5V1.5a.5.5 0 0 0-1 0V3H2.5a.5.5 0 0 0 0 1H4v3H2.5a.5.5 0 0 0 0 1H4v3H2.5a.5.5 0 0 0 0 1H4v1.5a.5.5 0 0 0 1 0V12h2.5v1.5a.5.5 0 0 0 1 0V12H11v1.5a.5.5 0 0 0 1 0V12h1.5a.5.5 0 0 0 0-1H12V8h1.5a.5.5 0 0 0 0-1H12V4h1.5a.5.5 0 0 0 0-1H12V1.5a.5.5 0 0 0-.5-.5zM5 4h2.5v3H5V4zm0 4h2.5v3H5V8zm3.5 0H11v3H8.5V8zm0-4H11v3H8.5V4z',
};

// ── Constants ────────────────────────────────────────────────────────────────

export const FONT_FAMILIES = [
  'Calibri', 'Arial', 'Times New Roman', 'Georgia',
  'Courier New', 'Verdana', 'Trebuchet MS', 'Garamond',
  'Palatino Linotype', 'Tahoma',
];

export const FONT_SIZES = ['8', '9', '10', '11', '12', '14', '16', '18', '20', '22', '24', '28', '36', '48', '72'];

export const HIGHLIGHTS = [
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

// ── Theme + Standard color rows (Word style) ─────────────────────────────────

export const THEME_COLORS = [
  // Top row: pure
  ['#ffffff', '#000000', '#e7e6e6', '#44546a', '#4472c4', '#ed7d31', '#a5a5a5', '#ffc000', '#5b9bd5', '#70ad47'],
  // Shade rows: 5 lighter/darker variants of each above
  ['#f2f2f2', '#7f7f7f', '#d0cece', '#d6dce4', '#d9e2f3', '#fbe5d6', '#ededed', '#fff2cc', '#deeaf6', '#e2efd9'],
  ['#d9d9d9', '#595959', '#afabab', '#adb9ca', '#b4c7e7', '#f7caac', '#dbdbdb', '#ffe699', '#bdd7ee', '#c5e0b3'],
  ['#bfbfbf', '#3f3f3f', '#757070', '#8497b0', '#8faadc', '#f4b183', '#c9c9c9', '#ffd966', '#9dc3e6', '#a8d08d'],
  ['#a6a6a6', '#262626', '#3a3838', '#333f4f', '#2e5495', '#c55a11', '#7b7b7b', '#bf8f00', '#2e74b5', '#538135'],
  ['#7f7f7f', '#0d0d0d', '#171616', '#222b35', '#1f3864', '#823b0c', '#525252', '#806000', '#1f4e79', '#375623'],
];

export const STANDARD_COLORS = [
  '#c00000', '#ff0000', '#ffc000', '#ffff00', '#92d050', '#00b050', '#00b0f0', '#0070c0', '#002060', '#7030a0',
];

const RECENTS_KEY = 'narrative-editor:color-recents';

function loadRecents() {
  try { return JSON.parse(localStorage.getItem(RECENTS_KEY) || '[]'); }
  catch { return []; }
}

function saveRecents(arr) {
  try { localStorage.setItem(RECENTS_KEY, JSON.stringify(arr.slice(0, 10))); } catch {}
}

// ── Color picker dropdown — Word-like, portaled so it can't be clipped ───────

export const ColorPicker = ({ anchorEl, onSelect, onClose, onClear, clearLabel = 'No color' }) => {
  const ref = useRef(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const [recents, setRecents] = useState(loadRecents);
  const [showHSL, setShowHSL] = useState(false);
  const [h, setH] = useState(220);
  const [s, setS] = useState(70);
  const [l, setL] = useState(50);

  useLayoutEffect(() => {
    if (!anchorEl) return;
    const rect = anchorEl.getBoundingClientRect();
    setPos({ top: rect.bottom + 4, left: rect.left });
  }, [anchorEl]);

  useEffect(() => {
    const handler = e => { if (ref.current && !ref.current.contains(e.target) && !anchorEl?.contains(e.target)) onClose(); };
    const t = setTimeout(() => document.addEventListener('mousedown', handler), 0);
    return () => { clearTimeout(t); document.removeEventListener('mousedown', handler); };
  }, [onClose, anchorEl]);

  const pick = (c) => {
    onSelect(c);
    const updated = [c, ...recents.filter(x => x !== c)].slice(0, 10);
    setRecents(updated);
    saveRecents(updated);
    onClose();
  };

  const hslHex = (() => {
    // HSL -> hex
    const a = s / 100;
    const ll = l / 100;
    const k = (n) => (n + h / 30) % 12;
    const f = (n) => ll - a * Math.min(ll, 1 - ll) * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    const toHex = (x) => Math.round(255 * x).toString(16).padStart(2, '0');
    return `#${toHex(f(0))}${toHex(f(8))}${toHex(f(4))}`;
  })();

  const panel = (
    <div ref={ref} style={{
      position: 'fixed', top: pos.top, left: pos.left,
      background: '#fff', border: '1px solid #c8c8c8', borderRadius: '4px',
      padding: '10px 12px', zIndex: 13000,
      boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
      fontFamily: '"Segoe UI", system-ui, sans-serif', fontSize: '11px', color: '#333',
      minWidth: '240px',
    }}>
      {/* Automatic / Clear row */}
      {onClear && (
        <button
          onMouseDown={e => { e.preventDefault(); onClear(); onClose(); }}
          style={{
            display: 'flex', alignItems: 'center', gap: '6px', width: '100%',
            padding: '5px 8px', border: '1px solid #e0e0e0', background: '#fafafa',
            borderRadius: '3px', cursor: 'pointer', fontSize: '12px', color: '#333',
            fontFamily: 'inherit', marginBottom: '8px',
          }}
        >
          <span style={{ display: 'inline-block', width: 12, height: 12, border: '1px solid #999', background: '#fff', position: 'relative' }}>
            <span style={{ position: 'absolute', inset: 0, borderTop: '2px solid red', transform: 'rotate(-30deg)', transformOrigin: 'center' }} />
          </span>
          {clearLabel}
        </button>
      )}

      {/* Theme colors */}
      <div style={{ fontWeight: 600, marginBottom: '4px', color: '#555' }}>Theme Colors</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', marginBottom: '8px' }}>
        {THEME_COLORS.map((row, ri) => (
          <div key={ri} style={{ display: 'grid', gridTemplateColumns: 'repeat(10, 18px)', gap: '2px' }}>
            {row.map((c, ci) => (
              <Swatch key={ci} color={c} onClick={() => pick(c)} />
            ))}
          </div>
        ))}
      </div>

      {/* Standard colors */}
      <div style={{ fontWeight: 600, marginBottom: '4px', color: '#555' }}>Standard Colors</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(10, 18px)', gap: '2px', marginBottom: '8px' }}>
        {STANDARD_COLORS.map((c, i) => <Swatch key={i} color={c} onClick={() => pick(c)} />)}
      </div>

      {/* Recents */}
      {recents.length > 0 && (
        <>
          <div style={{ fontWeight: 600, marginBottom: '4px', color: '#555' }}>Recent</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px', marginBottom: '8px' }}>
            {recents.map((c, i) => <Swatch key={i} color={c} onClick={() => pick(c)} />)}
          </div>
        </>
      )}

      {/* More colors toggle */}
      <button
        onMouseDown={e => { e.preventDefault(); setShowHSL(v => !v); }}
        style={{
          width: '100%', padding: '5px', border: '1px solid #e0e0e0', background: showHSL ? '#e8f0fe' : '#fff',
          borderRadius: '3px', cursor: 'pointer', fontSize: '11px', color: '#333',
          fontFamily: 'inherit', marginTop: '2px',
        }}
      >🎨 More Colors {showHSL ? '▲' : '▼'}</button>

      {showHSL && (
        <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ width: 28, height: 28, background: hslHex, border: '1px solid #c8c8c8', borderRadius: '3px' }} />
            <div style={{ flex: 1, fontFamily: 'Cascadia Code, Consolas, monospace', fontSize: '11px' }}>{hslHex.toUpperCase()}</div>
            <button
              onMouseDown={e => { e.preventDefault(); pick(hslHex); }}
              style={{ padding: '4px 10px', background: '#0078d4', color: '#fff', border: 'none', borderRadius: '3px', cursor: 'pointer', fontSize: '11px', fontFamily: 'inherit' }}
            >Apply</button>
          </div>
          <Slider label="Hue" min={0} max={360} value={h} onChange={setH}
            track={`linear-gradient(to right, hsl(0,${s}%,${l}%), hsl(60,${s}%,${l}%), hsl(120,${s}%,${l}%), hsl(180,${s}%,${l}%), hsl(240,${s}%,${l}%), hsl(300,${s}%,${l}%), hsl(360,${s}%,${l}%))`} />
          <Slider label="Sat" min={0} max={100} value={s} onChange={setS}
            track={`linear-gradient(to right, hsl(${h},0%,${l}%), hsl(${h},100%,${l}%))`} />
          <Slider label="Lit" min={0} max={100} value={l} onChange={setL}
            track={`linear-gradient(to right, #000, hsl(${h},${s}%,50%), #fff)`} />
        </div>
      )}
    </div>
  );

  return createPortal(panel, document.body);
};

const Swatch = ({ color, onClick }) => (
  <button
    onMouseDown={e => { e.preventDefault(); onClick(); }}
    title={color}
    style={{
      width: 18, height: 18, background: color, padding: 0,
      border: '1px solid rgba(0,0,0,0.15)', borderRadius: '2px', cursor: 'pointer',
      flexShrink: 0,
    }}
    onMouseEnter={e => e.currentTarget.style.outline = '2px solid #0078d4'}
    onMouseLeave={e => e.currentTarget.style.outline = 'none'}
  />
);

const Slider = ({ label, min, max, value, onChange, track }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '10px', color: '#555' }}>
    <span style={{ width: 22 }}>{label}</span>
    <input
      type="range" min={min} max={max} value={value}
      onChange={e => onChange(Number(e.target.value))}
      style={{ flex: 1, height: '14px', background: track, appearance: 'none', borderRadius: '3px', cursor: 'pointer' }}
    />
    <span style={{ width: 24, textAlign: 'right', fontFamily: 'Cascadia Code, monospace' }}>{value}</span>
  </div>
);

// Backwards-compat export — old code may still import COLORS
export const COLORS = THEME_COLORS.flat();
