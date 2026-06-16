import React, { useEffect, useState, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { search as searchTerms, warmRadiologyData } from '../../data/radiologyData';

/**
 * RadLex term autocomplete for the NarrativeEditor.
 *
 * As the radiologist types, the word immediately before the caret is matched
 * against the server-side RadLex corpus (GET /reporting/terms/suggest). Matching
 * terms appear in a small caret-anchored dropdown.
 *
 * Keyboard:
 *   ↑/↓    navigate
 *   Tab    insert the highlighted term (Enter is left alone, so it still makes a
 *          new line — important in a report where Enter = newline is constant)
 *   Esc    dismiss
 *
 * Deliberately does NOT trigger inside a "/" slash command (the SlashMenu owns
 * that), and skips common English words to stay quiet.
 */
const MIN_CHARS = 3;
const MAX_ITEMS = 8;
// Common English words that prefix RadLex terms but aren't worth suggesting on.
const STOP = new Set([
  'the', 'and', 'was', 'were', 'has', 'have', 'had', 'for', 'with', 'are',
  'this', 'that', 'from', 'not', 'but', 'its', 'his', 'her', 'their', 'which',
  'where', 'when', 'also', 'than', 'then', 'there', 'these', 'those', 'into',
]);

export default function TermAutocomplete({ editor }) {
  const [state, setState] = useState({ open: false, anchor: null, from: -1, to: -1, query: '' });
  const [items, setItems] = useState([]);
  const [selected, setSelected] = useState(0);

  const stateRef = useRef(state);
  const itemsRef = useRef(items);
  const reqRef = useRef(0);
  const debounceRef = useRef(null);
  // Warm the local RadLex index so it's ready by the time the user types.
  useEffect(() => { warmRadiologyData(); }, []);
  useEffect(() => { stateRef.current = state; }, [state]);
  useEffect(() => { itemsRef.current = items; }, [items]);

  const close = useCallback(() => {
    if (debounceRef.current) { clearTimeout(debounceRef.current); debounceRef.current = null; }
    reqRef.current++;                       // invalidate any in-flight request
    if (stateRef.current.open) setState({ open: false, anchor: null, from: -1, to: -1, query: '' });
    setItems([]);
    setSelected(0);
  }, []);

  const apply = useCallback((idx) => {
    const term = itemsRef.current[idx];
    if (!editor || !term) { close(); return; }
    // Recompute the word range from the LIVE state — the caret may have moved
    // since these suggestions were fetched (fast typing within the debounce).
    const { $from, empty } = editor.state.selection;
    if (!empty) { close(); return; }
    const textBefore = $from.parent.textBetween(0, $from.parentOffset, undefined, '￼');
    const m = textBefore.match(/[A-Za-z][A-Za-z-]*$/);
    if (!m) { close(); return; }
    const from = $from.start() + ($from.parentOffset - m[0].length);
    const to = $from.pos;
    editor.chain().focus().deleteRange({ from, to }).insertContent(term + ' ').run();
    close();
  }, [editor, close]);

  // ── Detect the word at the caret + fetch suggestions (debounced) ───────────
  useEffect(() => {
    if (!editor) return;

    const recompute = () => {
      if (!editor.isEditable) { if (stateRef.current.open) close(); return; }
      const { selection } = editor.state;
      const { $from, empty } = selection;
      if (!empty) { if (stateRef.current.open) close(); return; }

      const textBefore = $from.parent.textBetween(0, $from.parentOffset, undefined, '￼');
      const m = textBefore.match(/[A-Za-z][A-Za-z-]*$/);
      if (!m || m[0].length < MIN_CHARS) { if (stateRef.current.open) close(); return; }

      const word = m[0];
      // Inside a "/" slash command → let the SlashMenu handle it.
      const charBeforeWord = textBefore[textBefore.length - word.length - 1];
      if (charBeforeWord === '/') { if (stateRef.current.open) close(); return; }
      if (STOP.has(word.toLowerCase())) { if (stateRef.current.open) close(); return; }

      const blockStart = $from.start();
      const from = blockStart + ($from.parentOffset - word.length);
      const to = $from.pos;

      // Instant, offline, frequency-ranked match against the local 68k RadLex
      // index (no per-keystroke network). Same source as the inline ghost, so
      // the dropdown's top item and the ghost agree — no Tab ambiguity.
      const list = searchTerms(word, MAX_ITEMS)
        .map((r) => r.label)
        .filter((t) => t && t.toLowerCase() !== word.toLowerCase());
      if (list.length === 0) { if (stateRef.current.open) close(); return; }
      let anchor = null;
      try { const c = editor.view.coordsAtPos(from); anchor = { top: c.bottom + 4, left: c.left }; } catch { /* ignore */ }
      if (!anchor) { if (stateRef.current.open) close(); return; }
      setItems(list);
      setSelected(0);
      setState({ open: true, anchor, from, to, query: word });
    };

    // Debounce so the coordsAtPos() forced-layout read + lookup runs once per
    // brief typing pause instead of on every keystroke/transaction — this keeps
    // the typing hot path free of synchronous layout reads on long reports.
    const schedule = () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(recompute, 120);
    };
    editor.on('selectionUpdate', schedule);
    editor.on('transaction', schedule);
    return () => {
      editor.off('selectionUpdate', schedule);
      editor.off('transaction', schedule);
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [editor, close]);

  // ── Keyboard nav (capture-phase so it wins over the editor) ────────────────
  useEffect(() => {
    if (!state.open) return;
    const onKey = (e) => {
      if (!stateRef.current.open) return;
      if (e.key === 'ArrowDown') { e.preventDefault(); setSelected((c) => Math.min(c + 1, itemsRef.current.length - 1)); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); setSelected((c) => Math.max(c - 1, 0)); }
      else if (e.key === 'Tab') { if (itemsRef.current.length > 0) { e.preventDefault(); apply(selected); } }
      else if (e.key === 'Escape') { e.preventDefault(); close(); }
      // NB: Enter is intentionally NOT handled — it stays a newline.
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [state.open, selected, apply, close]);

  if (!state.open || !state.anchor || items.length === 0) return null;

  return createPortal(
    <div
      style={{
        position: 'fixed', top: state.anchor.top, left: state.anchor.left, zIndex: 99999,
        minWidth: '220px', maxWidth: '320px', maxHeight: '46vh', overflowY: 'auto',
        background: '#fff', border: '1px solid #cbd5e1', borderRadius: '10px',
        boxShadow: '0 14px 32px rgba(15,23,42,0.18)', padding: '5px',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      }}
      onMouseDown={(e) => e.preventDefault()}      // keep the caret in the editor
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 9px 5px', fontSize: '9.5px', fontWeight: 800, letterSpacing: '0.6px', color: '#64748b', textTransform: 'uppercase' }}>
        <span>RadLex · {state.query}</span>
        <span style={{ opacity: 0.7 }}>↹ insert</span>
      </div>
      {items.map((term, idx) => (
        <button
          key={term + idx}
          type="button"
          onMouseDown={(e) => { e.preventDefault(); apply(idx); }}
          onMouseEnter={() => setSelected(idx)}
          style={{
            display: 'flex', alignItems: 'center', gap: '8px', width: '100%', padding: '6px 9px',
            background: idx === selected ? '#eff6ff' : 'transparent', border: 'none',
            borderRadius: '6px', cursor: 'pointer', textAlign: 'left',
          }}
        >
          <span style={{ fontSize: '12px', color: '#16a34a', flexShrink: 0 }}>🩺</span>
          <span style={{ fontSize: '12.5px', fontWeight: 600, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{term}</span>
        </button>
      ))}
    </div>,
    document.body,
  );
}
