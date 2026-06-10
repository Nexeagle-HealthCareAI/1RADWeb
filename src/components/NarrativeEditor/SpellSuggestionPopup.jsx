import React, { useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { getSuggestions, addToCustom, ignoreWord } from '../../data/spellDictionary';

/**
 * Correction popup for a misspelled word, anchored under the squiggle.
 *
 * Opened by SpellCheck's click/right-click handler (via editor.storage.spellCheck
 * .onOpenSuggestions, wired in index.jsx). Offers nearest-match replacements plus
 * "Ignore once" and "Add to dictionary". After any action it calls `onAfterMutate`
 * so index.jsx re-scans immediately (otherwise the squiggle lingers until the
 * next typing-debounce).
 *
 * Props:
 *   state         { open, word, from, to, top, left }
 *   editor        TipTap editor
 *   onClose       () => void
 *   onAfterMutate () => void                — re-run the live spell scan
 *   onAddWord     (word) => void | undefined — clinic-shared add (Increment 4);
 *                 falls back to local-only when not provided.
 */
export default function SpellSuggestionPopup({ state, editor, onClose, onAfterMutate, onAddWord }) {
  const ref = useRef(null);
  const { open, word, from, to, top, left } = state || {};

  const suggestions = useMemo(
    () => (open && word ? getSuggestions(word, 6) : []),
    [open, word],
  );

  // Dismiss on outside-click / Esc.
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
    const onKey = (e) => { if (e.key === 'Escape') { e.preventDefault(); onClose(); } };
    document.addEventListener('mousedown', onDown, true);
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('mousedown', onDown, true);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [open, onClose]);

  if (!open || !word) return null;

  const replace = (suggestion) => {
    if (editor && from != null && to != null) {
      editor.chain().focus().insertContentAt({ from, to }, suggestion).run();
    }
    onAfterMutate?.();
    onClose();
  };

  const ignore = () => { ignoreWord(word); onAfterMutate?.(); onClose(); };

  const add = () => {
    addToCustom(word);          // local cache (instant, offline)
    onAddWord?.(word);          // clinic-shared sync, if wired
    onAfterMutate?.();
    onClose();
  };

  const btn = {
    display: 'block', width: '100%', textAlign: 'left', border: 'none',
    background: 'transparent', borderRadius: '6px', cursor: 'pointer',
    padding: '7px 10px', fontSize: '13px', color: '#0f172a',
  };

  return createPortal(
    <div
      ref={ref}
      style={{
        position: 'fixed', top, left, zIndex: 99999,
        minWidth: '210px', maxWidth: '300px', maxHeight: '50vh', overflowY: 'auto',
        background: '#fff', border: '1px solid #cbd5e1', borderRadius: '10px',
        boxShadow: '0 14px 32px rgba(15,23,42,0.18)', padding: '5px',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      }}
    >
      <div style={{ padding: '4px 10px 6px', fontSize: '9.5px', fontWeight: 800, letterSpacing: '0.6px', color: '#dc2626', textTransform: 'uppercase' }}>
        Spelling · “{word}”
      </div>

      {suggestions.length > 0 ? (
        suggestions.map((s) => (
          <button
            key={s}
            type="button"
            style={btn}
            onMouseEnter={(e) => { e.currentTarget.style.background = '#eff6ff'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
            onMouseDown={(e) => { e.preventDefault(); replace(s); }}
          >
            <span style={{ color: '#16a34a', marginRight: 8 }}>✓</span>
            <span style={{ fontWeight: 600 }}>{s}</span>
          </button>
        ))
      ) : (
        <div style={{ padding: '6px 10px', fontSize: '12px', color: '#94a3b8', fontStyle: 'italic' }}>
          No suggestions
        </div>
      )}

      <div style={{ borderTop: '1px solid #f1f5f9', marginTop: 4, paddingTop: 4 }}>
        <button type="button" style={{ ...btn, color: '#475569' }}
          onMouseEnter={(e) => { e.currentTarget.style.background = '#f8fafc'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
          onMouseDown={(e) => { e.preventDefault(); ignore(); }}
        >🚫 Ignore once</button>
        <button type="button" style={{ ...btn, color: '#475569' }}
          onMouseEnter={(e) => { e.currentTarget.style.background = '#f8fafc'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
          onMouseDown={(e) => { e.preventDefault(); add(); }}
        >➕ Add to dictionary</button>
      </div>
    </div>,
    document.body,
  );
}
