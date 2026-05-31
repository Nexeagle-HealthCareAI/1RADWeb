// Lightweight onboarding hints for NarrativeEditor.
//
// Design rules (anti-Clippy):
//   1. One hint visible at a time. Never two.
//   2. Each hint shows AT MOST ONCE per device (localStorage flag).
//   3. Hints fire only AFTER the user has done real work that proves
//      they're engaged with the editor (typed something, applied a mark,
//      added a heading) - never on bare mount, never during the first
//      few seconds.
//   4. Bottom-right toast. No backdrop, no spotlight, no arrow pointing
//      at toolbar buttons. The hint is text the user can read, dismiss,
//      and forget.
//   5. Auto-dismiss after 20s if untouched. Manual dismiss via the X.
//   6. "Got it" button persists the seen state. Closing via X also
//      persists (treating manual dismissal as acknowledgement).
//
// Adding a hint: append to HINTS below with a stable id, title, body,
// and a trigger(state) function returning true when it's time to show.

import React, { useEffect, useState } from 'react';

const STORAGE_KEY = 'narrative-editor:hints-seen';

// Hints are evaluated in array order. The first unseen hint whose trigger
// returns true is the one that surfaces.
const HINTS = [
  {
    id: 'f1-cheatsheet',
    title: 'Tip - keyboard shortcuts',
    body: 'Press F1 anytime to open the full shortcuts cheat-sheet.',
    trigger: ({ charCount }) => charCount > 60,
  },
  {
    id: 'section-jump',
    title: 'Jump between sections',
    body: 'Press Alt+1 / Alt+2 / Alt+3 to jump to Findings / Impression / Advice.',
    trigger: ({ hasHeading }) => hasHeading,
  },
  {
    id: 'format-painter',
    title: 'Copy formatting',
    body: 'Select formatted text, press Ctrl+Shift+C to pick it up, then Ctrl+Shift+V on target text to apply.',
    trigger: ({ hasBold, charCount }) => hasBold && charCount > 200,
  },
];

function loadSeen() {
  try {
    const raw = window.localStorage?.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
}

function persistSeen(seen) {
  try { window.localStorage?.setItem(STORAGE_KEY, JSON.stringify(Array.from(seen))); } catch {}
}

export default function OnboardingHints({ editor }) {
  const [seen, setSeen] = useState(loadSeen);
  const [active, setActive] = useState(null); // current hint object or null
  const [bootedAtMs] = useState(() => Date.now());

  // Compute the per-hint state on a poll so triggers can fire as the user
  // works without us listening to every editor transaction. 4s is responsive
  // enough that a hint appears soon after its condition becomes true, while
  // being cheap (zero work when the editor isn't doing anything).
  useEffect(() => {
    if (!editor || active) return undefined;
    const id = setInterval(() => {
      // Don't fire any hint in the first 12 seconds - lets the radiologist
      // settle into the page before we ever ask for their attention.
      if (Date.now() - bootedAtMs < 12_000) return;

      let charCount = 0;
      let hasHeading = false;
      let hasBold = false;
      try {
        charCount = editor.storage.characterCount?.characters?.() ?? editor.getText().length;
        // Walk the doc once for the heading / bold flags. Cheap for normal
        // doc sizes; could be cached if reports grow huge.
        editor.state.doc.descendants((n) => {
          if (n.type?.name === 'heading') hasHeading = true;
          if (n.marks?.some?.(m => m.type?.name === 'bold')) hasBold = true;
          // Stop early if we already learned everything we need.
          if (hasHeading && hasBold) return false;
          return undefined;
        });
      } catch {
        // If editor state isn't readable for any reason, just defer to next tick.
        return;
      }

      const state = { charCount, hasHeading, hasBold };
      for (const h of HINTS) {
        if (seen.has(h.id)) continue;
        try {
          if (h.trigger(state)) {
            setActive(h);
            break;
          }
        } catch {
          // Trigger failure shouldn't crash the editor - skip this hint.
        }
      }
    }, 4_000);
    return () => clearInterval(id);
  }, [editor, active, seen, bootedAtMs]);

  // Auto-dismiss after 20s.
  useEffect(() => {
    if (!active) return undefined;
    const t = setTimeout(() => dismiss(), 20_000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  const dismiss = () => {
    if (!active) return;
    setSeen(prev => {
      const next = new Set(prev);
      next.add(active.id);
      persistSeen(next);
      return next;
    });
    setActive(null);
  };

  // Re-render once a second while a hint is up so the implicit "soft
  // pulse" (CSS transition on first paint) doesn't compete with anything.
  // No actual content depends on time - this isn't needed, removed.

  if (!active) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: 'fixed',
        bottom: '24px',
        right: '24px',
        width: '320px',
        background: '#0f172a',
        color: '#f1f5f9',
        borderRadius: '12px',
        padding: '14px 16px 12px',
        boxShadow: '0 16px 40px rgba(0,0,0,0.25), 0 2px 8px rgba(0,0,0,0.12)',
        zIndex: 14000,
        fontFamily: '"Segoe UI", system-ui, sans-serif',
        animation: 'narrative-hint-in 280ms cubic-bezier(0.16, 1, 0.3, 1) both',
      }}
    >
      <style>{`
        @keyframes narrative-hint-in {
          0%   { opacity: 0; transform: translateY(8px); }
          100% { opacity: 1; transform: translateY(0); }
        }
      `}</style>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '10px', marginBottom: '6px' }}>
        <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.6px', textTransform: 'uppercase', color: '#94a3b8' }}>
          {active.title}
        </div>
        <button
          onMouseDown={e => { e.preventDefault(); dismiss(); }}
          aria-label="Dismiss hint"
          style={{
            background: 'transparent', border: 'none', cursor: 'pointer',
            color: '#94a3b8', fontSize: '15px', lineHeight: 1,
            padding: 0, marginTop: '-2px',
          }}
          onMouseEnter={e => { e.currentTarget.style.color = '#f1f5f9'; }}
          onMouseLeave={e => { e.currentTarget.style.color = '#94a3b8'; }}
        >×</button>
      </div>
      <div style={{ fontSize: '13px', lineHeight: 1.45, color: '#e2e8f0', marginBottom: '10px' }}>
        {active.body}
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button
          onMouseDown={e => { e.preventDefault(); dismiss(); }}
          style={{
            background: '#334155', color: '#f8fafc',
            border: 'none', borderRadius: '6px',
            padding: '6px 14px',
            fontSize: '11px', fontWeight: 700, letterSpacing: '0.3px',
            cursor: 'pointer', fontFamily: 'inherit',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = '#475569'; }}
          onMouseLeave={e => { e.currentTarget.style.background = '#334155'; }}
        >Got it</button>
      </div>
    </div>
  );
}

// Dev-only helper for testing - call from DevTools to reset the seen
// flag and see hints again.
if (typeof window !== 'undefined') {
  window.__resetNarrativeHints = () => {
    try { window.localStorage.removeItem(STORAGE_KEY); } catch {}
    console.info('[hints] reset - reload to see hints again');
  };
}

