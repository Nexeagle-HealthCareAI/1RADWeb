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
 * Optional `onLauncher` shows the dialog-launcher arrow icon next to the label.
 */
export const Group = ({ label, children, onLauncher, style = {} }) => (
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
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      gap: '4px', paddingTop: '2px', userSelect: 'none',
    }}>
      <span style={{ fontSize: '10px', color: '#666', letterSpacing: '0.2px' }}>{label}</span>
      {onLauncher && (
        <button
          onMouseDown={e => { e.preventDefault(); onLauncher(); }}
          title={`${label} dialog`}
          style={{
            width: '14px', height: '14px',
            background: 'transparent', border: 'none',
            cursor: 'pointer', padding: 0,
            color: '#888', borderRadius: '2px',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            transition: 'background 0.08s, color 0.08s',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = '#e0e0e0'; e.currentTarget.style.color = '#333'; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#888'; }}
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
            <path d="M0 0v10h10V0H0zm9 9H1V1h6v4h2v4z M5 6l4-4-1-1-3 3V2H4v2h2V3l-1 1-1 1z" />
          </svg>
        </button>
      )}
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

// ── Color helpers ────────────────────────────────────────────────────────────

function hsvToRgb(h, s, v) {
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  let [r, g, b] = [0, 0, 0];
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
}

function rgbToHex(r, g, b) {
  const h = (n) => n.toString(16).padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`;
}

function hexToHsv(hex) {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) return null;
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const d = max - min;
  let hh = 0;
  if (d !== 0) {
    if (max === r) hh = ((g - b) / d) % 6;
    else if (max === g) hh = (b - r) / d + 2;
    else hh = (r - g) / d + 4;
  }
  hh = Math.round(hh * 60); if (hh < 0) hh += 360;
  const ss = max === 0 ? 0 : d / max;
  return { h: hh, s: ss, v: max };
}

// ── Color picker dropdown — Office Fluent style, fullscreen-aware portal ─────

export const ColorPicker = ({ anchorEl, onSelect, onClose, onClear, clearLabel = 'No color' }) => {
  const ref = useRef(null);
  const sbAreaRef = useRef(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const [recents, setRecents] = useState(loadRecents);
  const [showCustom, setShowCustom] = useState(false);
  const [h, setH] = useState(220);
  const [s, setS] = useState(0.7);  // 0..1
  const [v, setV] = useState(0.95); // 0..1
  const [hexInput, setHexInput] = useState('#3b82f6');
  const [portalTarget, setPortalTarget] = useState(() =>
    (typeof document !== 'undefined' ? (document.fullscreenElement || document.body) : null)
  );

  // Re-portal when entering/exiting fullscreen so the picker stays visible.
  useEffect(() => {
    const onFsChange = () => {
      setPortalTarget(document.fullscreenElement || document.body);
    };
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  useLayoutEffect(() => {
    if (!anchorEl) return;
    const rect = anchorEl.getBoundingClientRect();
    // Keep the panel inside viewport horizontally — flip left if it would overflow.
    const PANEL_W = 268;
    let left = rect.left;
    if (left + PANEL_W > window.innerWidth - 8) left = Math.max(8, window.innerWidth - PANEL_W - 8);
    setPos({ top: rect.bottom + 6, left });
  }, [anchorEl, showCustom]);

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

  // Current color from HSV
  const [r, g, b] = hsvToRgb(h, s, v);
  const currentHex = rgbToHex(r, g, b);

  // Sync hex input when sliders change
  useEffect(() => { setHexInput(currentHex); }, [currentHex]);

  // Pure-hue color for the SB area background
  const pureHue = rgbToHex(...hsvToRgb(h, 1, 1));

  const onSbMouseDown = (e) => {
    e.preventDefault();
    const move = (ev) => {
      const rect = sbAreaRef.current.getBoundingClientRect();
      const x = Math.max(0, Math.min(1, (ev.clientX - rect.left) / rect.width));
      const y = Math.max(0, Math.min(1, (ev.clientY - rect.top) / rect.height));
      setS(x);
      setV(1 - y);
    };
    move(e);
    const up = () => {
      document.removeEventListener('mousemove', move);
      document.removeEventListener('mouseup', up);
    };
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
  };

  const handleHexInput = (val) => {
    setHexInput(val);
    const cleaned = val.trim();
    const hsv = hexToHsv(cleaned);
    if (hsv) {
      setH(hsv.h);
      setS(hsv.s);
      setV(hsv.v);
    }
  };

  const panel = (
    <div ref={ref} style={{
      position: 'fixed', top: pos.top, left: pos.left,
      background: '#ffffff',
      border: '1px solid #d1d5db', borderRadius: '6px',
      padding: '12px 12px 10px', zIndex: 13000,
      boxShadow: '0 10px 32px rgba(0,0,0,0.18), 0 2px 6px rgba(0,0,0,0.08)',
      fontFamily: '"Segoe UI", system-ui, sans-serif', fontSize: '11px', color: '#1f2937',
      width: '268px', boxSizing: 'border-box',
    }}>
      {/* Automatic / Clear row */}
      {onClear && (
        <button
          onMouseDown={e => { e.preventDefault(); onClear(); onClose(); }}
          style={{
            display: 'flex', alignItems: 'center', gap: '8px', width: '100%',
            padding: '6px 8px', border: '1px solid #e5e7eb', background: '#ffffff',
            borderRadius: '4px', cursor: 'pointer', fontSize: '12px', color: '#374151',
            fontFamily: 'inherit', marginBottom: '10px',
            transition: 'background 0.1s',
          }}
          onMouseEnter={e => e.currentTarget.style.background = '#f3f4f6'}
          onMouseLeave={e => e.currentTarget.style.background = '#ffffff'}
        >
          <span style={{ display: 'inline-block', width: 14, height: 14, border: '1px solid #d1d5db', background: '#ffffff', position: 'relative', borderRadius: '2px', overflow: 'hidden' }}>
            <span style={{ position: 'absolute', top: '50%', left: '-2px', right: '-2px', height: '2px', background: '#dc2626', transform: 'rotate(-30deg)', transformOrigin: 'center' }} />
          </span>
          <span style={{ fontWeight: 500 }}>{clearLabel}</span>
        </button>
      )}

      {/* Theme colors */}
      <SectionLabel>Theme colors</SectionLabel>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', marginBottom: '10px' }}>
        {THEME_COLORS.map((row, ri) => (
          <div key={ri} style={{ display: 'grid', gridTemplateColumns: 'repeat(10, 1fr)', gap: '3px' }}>
            {row.map((c, ci) => (
              <Swatch key={ci} color={c} onClick={() => pick(c)} />
            ))}
          </div>
        ))}
      </div>

      {/* Standard colors */}
      <SectionLabel>Standard colors</SectionLabel>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(10, 1fr)', gap: '3px', marginBottom: '10px' }}>
        {STANDARD_COLORS.map((c, i) => <Swatch key={i} color={c} onClick={() => pick(c)} />)}
      </div>

      {/* Recents */}
      {recents.length > 0 && (
        <>
          <SectionLabel>Recent</SectionLabel>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(10, 1fr)', gap: '3px', marginBottom: '10px' }}>
            {recents.map((c, i) => <Swatch key={i} color={c} onClick={() => pick(c)} />)}
          </div>
        </>
      )}

      {/* More colors disclosure */}
      <button
        onMouseDown={e => { e.preventDefault(); setShowCustom(v => !v); }}
        style={{
          width: '100%', padding: '7px 10px',
          border: '1px solid #e5e7eb', background: showCustom ? '#eff6ff' : '#ffffff',
          color: showCustom ? '#0078d4' : '#374151',
          borderRadius: '4px', cursor: 'pointer', fontSize: '11.5px', fontWeight: 500,
          fontFamily: 'inherit', marginTop: '2px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          transition: 'background 0.1s, color 0.1s',
        }}
      >
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ display: 'inline-block', width: 12, height: 12, borderRadius: '50%',
            background: 'conic-gradient(red, yellow, lime, cyan, blue, magenta, red)',
            border: '1px solid #d1d5db' }} />
          More colors
        </span>
        <span style={{ fontSize: '10px' }}>{showCustom ? '▲' : '▼'}</span>
      </button>

      {showCustom && (
        <div style={{ marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {/* 2D Saturation/Value picker */}
          <div
            ref={sbAreaRef}
            onMouseDown={onSbMouseDown}
            style={{
              position: 'relative', width: '100%', height: '120px',
              background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, ${pureHue})`,
              borderRadius: '4px', cursor: 'crosshair',
              border: '1px solid #d1d5db',
              userSelect: 'none',
            }}
          >
            <div style={{
              position: 'absolute',
              left: `${s * 100}%`, top: `${(1 - v) * 100}%`,
              width: '12px', height: '12px',
              transform: 'translate(-50%, -50%)',
              border: '2px solid #fff',
              borderRadius: '50%',
              boxShadow: '0 0 0 1px rgba(0,0,0,0.4)',
              pointerEvents: 'none',
            }} />
          </div>

          {/* Hue slider */}
          <div style={{ position: 'relative', height: '14px' }}>
            <div style={{
              position: 'absolute', inset: 0, borderRadius: '4px',
              background: 'linear-gradient(to right, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)',
              border: '1px solid #d1d5db',
            }} />
            <input
              type="range" min={0} max={360} value={h}
              onChange={e => setH(Number(e.target.value))}
              style={{
                position: 'absolute', inset: 0, width: '100%', height: '100%',
                background: 'transparent', appearance: 'none',
                cursor: 'pointer', margin: 0, opacity: 0,
              }}
            />
            <div style={{
              position: 'absolute', top: '50%', left: `${(h / 360) * 100}%`,
              width: '12px', height: '20px',
              transform: 'translate(-50%, -50%)',
              background: '#fff',
              border: '2px solid #1f2937',
              borderRadius: '3px',
              pointerEvents: 'none',
              boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
            }} />
          </div>

          {/* Hex input + preview + Apply */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{
              width: 32, height: 32, background: currentHex,
              borderRadius: '4px', border: '1px solid #d1d5db',
              flexShrink: 0,
            }} />
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ color: '#6b7280', fontSize: '11px' }}>HEX</span>
              <input
                type="text"
                value={hexInput.toUpperCase()}
                onChange={e => handleHexInput(e.target.value)}
                onBlur={() => setHexInput(currentHex)}
                style={{
                  flex: 1, height: '28px', padding: '0 8px',
                  border: '1px solid #d1d5db', borderRadius: '4px',
                  fontFamily: '"Cascadia Code", Consolas, monospace',
                  fontSize: '12px', outline: 'none', color: '#1f2937',
                  textTransform: 'uppercase',
                }}
                onFocus={e => e.target.style.borderColor = '#0078d4'}
                onBlurCapture={e => e.target.style.borderColor = '#d1d5db'}
              />
            </div>
            <button
              onMouseDown={e => { e.preventDefault(); pick(currentHex); }}
              style={{
                height: '28px', padding: '0 14px',
                background: '#0078d4', color: '#fff', border: 'none',
                borderRadius: '4px', cursor: 'pointer',
                fontSize: '11.5px', fontWeight: 600, fontFamily: 'inherit',
                boxShadow: '0 1px 2px rgba(0, 120, 212, 0.35)',
              }}
            >Apply</button>
          </div>
        </div>
      )}
    </div>
  );

  if (!portalTarget) return null;
  return createPortal(panel, portalTarget);
};

const SectionLabel = ({ children }) => (
  <div style={{
    fontSize: '10px', fontWeight: 600, color: '#6b7280',
    textTransform: 'uppercase', letterSpacing: '0.5px',
    marginBottom: '5px',
  }}>{children}</div>
);

const Swatch = ({ color, onClick }) => (
  <button
    onMouseDown={e => { e.preventDefault(); onClick(); }}
    title={color}
    style={{
      width: '100%', aspectRatio: '1', minWidth: 0,
      background: color, padding: 0,
      border: '1px solid rgba(0,0,0,0.12)', borderRadius: '3px',
      cursor: 'pointer', flexShrink: 0,
      boxSizing: 'border-box',
      transition: 'transform 0.08s, box-shadow 0.08s',
    }}
    onMouseEnter={e => {
      e.currentTarget.style.boxShadow = '0 0 0 2px #0078d4, 0 1px 4px rgba(0,0,0,0.18)';
      e.currentTarget.style.transform = 'scale(1.08)';
    }}
    onMouseLeave={e => {
      e.currentTarget.style.boxShadow = 'none';
      e.currentTarget.style.transform = 'scale(1)';
    }}
  />
);

// Backwards-compat export — old code may still import COLORS
export const COLORS = THEME_COLORS.flat();
