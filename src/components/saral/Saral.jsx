import React from 'react';
import { C, FONT } from './tokens';

/**
 * Saral — the shared building blocks for rebuilt screens (UI review, round 2).
 * One look everywhere: indigo for actions, saffron for money still due, ink text
 * on a pale ground; every icon has a word; every status has a colour AND a word;
 * buttons at least 48 px tall. No emoji (they render as boxes on cheap phones).
 */

/** Inline stroke icons (24px grid). Decorative: always paired with a word. */
const PATHS = {
  plus: 'M12 5v14M5 12h14',
  search: 'M11 4a7 7 0 100 14 7 7 0 000-14zM20 20l-3.5-3.5',
  back: 'M15 5l-7 7 7 7',
  close: 'M6 6l12 12M18 6L6 18',
  check: 'M5 12.5l4.5 4.5L19 7',
  print: 'M6 9V3h12v6M6 18H4v-7h16v7h-2M8 14h8v7H8z',
  rupee: 'M7 4h10M7 9h10M7 14l8 6M7 9c6 0 6 5 0 5',
  phone: 'M5 4h4l2 5-2.5 1.5a11 11 0 005 5L15 13l5 2v4a2 2 0 01-2 2A16 16 0 013 6a2 2 0 012-2z',
  whatsapp: 'M4 20l1.3-4A8 8 0 1112 20a8 8 0 01-4-1z',
  user: 'M12 4a4 4 0 110 8 4 4 0 010-8zM4 21c1-4 4-6 8-6s7 2 8 6',
  report: 'M6 3h9l4 4v14H6zM9 13l2 2 4-4',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  clock: 'M12 3a9 9 0 100 18 9 9 0 000-18zM12 7v5l3 2',
  refresh: 'M20 11a8 8 0 10-2.3 5.7M20 4v7h-7',
  filter: 'M4 6h16M7 12h10M10 18h4',
};
export function Icon({ name, size = 22, stroke = 2.2, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={stroke}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0 }}>
      <path d={PATHS[name] || ''} />
    </svg>
  );
}

const BTN = {
  primary: { background: C.primary, color: 'white', border: 'none' },
  money: { background: C.due, color: 'white', border: 'none' },
  outline: { background: 'white', color: C.primary, border: `2px solid ${C.primary}` },
  outlineMoney: { background: 'white', color: C.due, border: `2px solid ${C.due}` },
  quiet: { background: '#F9FAFB', color: C.ink, border: `1.5px solid ${C.lineStrong}` },
  ok: { background: '#15803D', color: 'white', border: 'none' },
  ghost: { background: 'transparent', color: C.primary, border: 'none' },
  outlineDanger: { background: 'white', color: C.danger, border: `2px solid ${C.danger}` },
};

/** Button: a word always, icon optional. size: 'lg' (56) | 'md' (48). */
export function Button({ kind = 'primary', size = 'md', icon, children, full, style, disabled, ...rest }) {
  return (
    <button type="button" disabled={disabled} {...rest}
      style={{
        height: size === 'lg' ? 56 : 48, padding: '0 18px', borderRadius: size === 'lg' ? 16 : 14,
        fontFamily: 'inherit', fontSize: size === 'lg' ? 18 : 16, fontWeight: 700,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        width: full ? '100%' : undefined, cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.55 : 1,
        whiteSpace: 'nowrap', ...BTN[kind], ...style,
      }}>
      {icon && <Icon name={icon} size={size === 'lg' ? 22 : 20} />}
      {children}
    </button>
  );
}

/** Pill chip used for filters and picks. */
export function Chip({ on, children, style, ...rest }) {
  return (
    <button type="button" aria-pressed={!!on} {...rest}
      style={{
        flexShrink: 0, minHeight: 44, padding: '0 16px', borderRadius: 999, fontFamily: 'inherit',
        fontSize: 16, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap',
        ...(on ? { background: C.ink, color: 'white', border: 'none' } : { background: 'white', color: '#374151', border: `1.5px solid ${C.lineStrong}` }),
        ...style,
      }}>
      {children}
    </button>
  );
}

/** Status tag: colour and word together. */
export function Tag({ bg, fg, children, style }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 12px', borderRadius: 999,
      background: bg, color: fg, fontSize: 15, fontWeight: 700, whiteSpace: 'nowrap', ...style }}>{children}</span>
  );
}

/**
 * Bottom sheet on phones, centred panel on tablet/desktop. Escape and the
 * backdrop close it; focus moves into it on open.
 */
export function Sheet({ open, onClose, title, children, footer, wide }) {
  const ref = React.useRef(null);
  React.useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    document.addEventListener('keydown', onKey);
    ref.current?.focus();
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  const phone = typeof window !== 'undefined' && window.innerWidth < 640;
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(17,24,39,0.45)', zIndex: 2147483605, // above the RadAI launcher
      display: 'flex', alignItems: phone ? 'flex-end' : 'center', justifyContent: 'center', fontFamily: FONT }}>
      <div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-label={title} onClick={e => e.stopPropagation()}
        style={{ background: C.ground, width: phone ? '100%' : (wide ? 720 : 520), maxWidth: '100%',
          maxHeight: phone ? '94vh' : '90vh', borderRadius: phone ? '22px 22px 0 0' : 22, display: 'flex', flexDirection: 'column',
          outline: 'none', boxShadow: '0 20px 60px rgba(0,0,0,0.25)', overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px', background: 'white', borderBottom: `1px solid ${C.line}` }}>
          <div style={{ flex: 1, fontSize: 21, fontWeight: 800, color: C.ink }}>{title}</div>
          <button type="button" onClick={onClose} aria-label="Close"
            style={{ width: 44, height: 44, borderRadius: 12, border: 'none', background: '#F3F4F6', color: C.ink, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
            <Icon name="close" />
          </button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>{children}</div>
        {footer && <div style={{ padding: '12px 16px 16px', background: 'white', borderTop: `1px solid ${C.line}`, display: 'grid' }}>{footer}</div>}
      </div>
    </div>
  );
}

export function UndoBar({ held, onUndo, label, bottom = 96 }) {
  if (!held) return null;
  return (
    <div role="status" style={{ position: 'fixed', left: 16, right: 16, bottom, maxWidth: 560, margin: '0 auto', zIndex: 2147483604,
      background: C.ink, color: 'white', borderRadius: 16, padding: '10px 10px 10px 16px', display: 'flex', alignItems: 'center', gap: 10,
      boxShadow: '0 10px 30px rgba(0,0,0,0.25)', fontFamily: FONT }}>
      <div style={{ flex: 1, fontSize: 16 }}>{held.text}</div>
      <button type="button" onClick={onUndo}
        style={{ height: 44, padding: '0 18px', borderRadius: 12, border: 'none', background: '#FDE68A', color: C.ink, fontSize: 16, fontWeight: 800, fontFamily: 'inherit', cursor: 'pointer' }}>
        {label}
      </button>
    </div>
  );
}

