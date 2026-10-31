import React from 'react';
import { C, FONT } from './tokens';

/**
 * Undo bar: the action is held for `ms` and only then sent, so Undo really
 * undoes it — no "Are you sure?" pop-up first.
 */
export function useHeldAction(ms = 6000) {
  const [held, setHeld] = React.useState(null); // { text, run, cancel }
  const ref = React.useRef(null); // source of truth (state updaters do not run after unmount)
  const timer = React.useRef(null);
  const take = () => { const h = ref.current; ref.current = null; clearTimeout(timer.current); return h; };
  const flush = React.useCallback(() => { const h = take(); setHeld(null); h?.run(); }, []);
  const hold = React.useCallback((text, run, cancel) => {
    // A second action commits the first straight away.
    const prev = take();
    prev?.run();
    const next = { text, run, cancel };
    ref.current = next;
    setHeld(next);
    timer.current = setTimeout(() => { if (ref.current === next) { ref.current = null; setHeld(null); next.run(); } }, ms);
  }, [ms]);
  const undo = React.useCallback(() => { const h = take(); setHeld(null); h?.cancel?.(); }, []);
  // Leaving the page commits whatever is held.
  React.useEffect(() => {
    const onHide = () => { const h = take(); h?.run(); };
    window.addEventListener('pagehide', onHide);
    return () => { window.removeEventListener('pagehide', onHide); onHide(); };
  }, []);
  return { held, hold, undo, flush };
}

/** Small toast for results ("Booked", "Could not save"). */
export function useToast() {
  const [toast, setToast] = React.useState(null);
  const timer = React.useRef(null);
  const show = React.useCallback((text, tone = 'ok') => {
    clearTimeout(timer.current);
    setToast({ text, tone });
    timer.current = setTimeout(() => setToast(null), 4500);
  }, []);
  React.useEffect(() => () => clearTimeout(timer.current), []);
  const node = toast ? (
    <div role="alert" style={{ position: 'fixed', top: 70, left: 16, right: 16, maxWidth: 520, margin: '0 auto', zIndex: 2147483606,
      background: toast.tone === 'error' ? C.dangerSoft : C.okSoft, color: toast.tone === 'error' ? C.danger : C.ok,
      border: `1px solid ${toast.tone === 'error' ? '#FECACA' : '#BBF7D0'}`, borderRadius: 14, padding: '12px 16px', fontSize: 16, fontWeight: 700, fontFamily: FONT,
      boxShadow: '0 8px 24px rgba(0,0,0,0.12)' }}>
      {toast.text}
    </div>
  ) : null;
  return { show, node };
}

export function useViewport() {
  const [w, setW] = React.useState(() => (typeof window === 'undefined' ? 1280 : window.innerWidth));
  React.useEffect(() => {
    const on = () => setW(window.innerWidth);
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  return { width: w, phone: w < 640, tablet: w >= 640 && w < 1100, desktop: w >= 1100 };
}
