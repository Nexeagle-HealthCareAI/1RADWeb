import React, { useEffect, useState } from 'react';

/**
 * Always-visible heading strip on the QAT — H1 · H2 · H3 · ¶
 *
 * The desktop Ribbon's Styles Gallery (Home tab) already has these, but it's
 * hidden when any other tab is showing. A daily-typist who structures
 * Findings → Impression → Advice with H2 / H3 subheadings shouldn't have to
 * bounce back to Home tab every time they start a new section.
 *
 * Each button:
 *   - shows active state when the cursor is inside that heading level
 *   - applies the heading (or returns to paragraph) on click
 *   - has a 24×22 hit target with bold typography so they're scannable
 *
 * Subscribes to selectionUpdate + transaction so active states stay in sync
 * with cursor movement and formatting changes.
 */

const LEVELS = [1, 2, 3]; // we expose H1/H2/H3; H4 is rare in radiology reports

export default function HeadingQuickBar({ editor }) {
  // Tick on every relevant editor event so active-state highlights update
  // live as the cursor moves.
  const [, force] = useState(0);
  useEffect(() => {
    if (!editor) return;
    const tick = () => force((n) => n + 1);
    editor.on('selectionUpdate', tick);
    editor.on('transaction', tick);
    return () => {
      editor.off('selectionUpdate', tick);
      editor.off('transaction', tick);
    };
  }, [editor]);

  if (!editor) return null;

  const applyHeading = (level) => {
    // Toggle: if already in this heading, return to paragraph. Matches
    // Word's `Ctrl+Alt+N` ↔ heading shortcut intuition.
    if (editor.isActive('heading', { level })) {
      editor.chain().focus().setParagraph().run();
    } else {
      editor.chain().focus().toggleHeading({ level }).run();
    }
  };

  const applyParagraph = () => {
    editor.chain().focus().setParagraph().run();
  };

  const isParagraph = editor.isActive('paragraph') &&
    !LEVELS.some((lvl) => editor.isActive('heading', { level: lvl }));

  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '1px',
        padding: '2px 3px',
        background: 'rgba(15, 23, 42, 0.03)',
        border: '1px solid rgba(15, 23, 42, 0.06)',
        borderRadius: '5px',
        margin: '0 4px',
      }}
      role="group"
      aria-label="Heading style"
    >
      {LEVELS.map((level) => {
        const active = editor.isActive('heading', { level });
        return (
          <button
            key={level}
            type="button"
            onMouseDown={(e) => { e.preventDefault(); applyHeading(level); }}
            title={`Heading ${level} (Ctrl+Alt+${level})`}
            aria-pressed={active}
            style={{
              minWidth: '24px',
              height: '20px',
              padding: '0 5px',
              background: active ? '#0f52ba' : 'transparent',
              color: active ? '#ffffff' : '#475569',
              border: 'none',
              borderRadius: '3px',
              fontSize: '10px',
              fontWeight: 900,
              letterSpacing: '0.2px',
              cursor: 'pointer',
              fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
              transition: 'background 0.12s ease, color 0.12s ease',
            }}
            onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = '#e2e8f0'; }}
            onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = 'transparent'; }}
          >
            H{level}
          </button>
        );
      })}
      <button
        type="button"
        onMouseDown={(e) => { e.preventDefault(); applyParagraph(); }}
        title="Normal paragraph (Ctrl+Shift+N)"
        aria-pressed={isParagraph}
        style={{
          minWidth: '20px',
          height: '20px',
          padding: '0 5px',
          background: isParagraph ? '#0f52ba' : 'transparent',
          color: isParagraph ? '#ffffff' : '#475569',
          border: 'none',
          borderRadius: '3px',
          fontSize: '12px',
          fontWeight: 700,
          cursor: 'pointer',
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          transition: 'background 0.12s ease, color 0.12s ease',
          lineHeight: 1,
        }}
        onMouseEnter={(e) => { if (!isParagraph) e.currentTarget.style.background = '#e2e8f0'; }}
        onMouseLeave={(e) => { if (!isParagraph) e.currentTarget.style.background = 'transparent'; }}
      >
        ¶
      </button>
    </div>
  );
}
