import React, { useEffect, useState } from 'react';

/**
 * Compact readout of the current selection's style — sits on the QAT so the
 * typist can glance at it without bouncing through ribbon tabs to find the
 * active alignment / heading level / format state.
 *
 * Subscribes to Tiptap's `selectionUpdate` and `transaction` events so the
 * value reflects whatever the cursor is currently in.
 *
 * Display patterns (smallest-meaningful first):
 *   • inside a plain paragraph, no formatting    →  "Normal"
 *   • inside an H2, no formatting                →  "Heading 2"
 *   • inside a bold paragraph                    →  "Normal · Bold"
 *   • inside an H2 with bold + italic + right    →  "Heading 2 · Bold · Italic · Right"
 *   • inside a bullet list item                  →  "Bullet"
 *
 * Truncates with ellipsis if the row gets crowded — the title attribute
 * exposes the full string on hover.
 */
const HEADING_LABELS = { 1: 'Heading 1', 2: 'Heading 2', 3: 'Heading 3', 4: 'Heading 4' };

export default function ActiveStyleIndicator({ editor }) {
  // Bump a tick on every selection / transaction so React re-reads editor state.
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

  // Compute the active style label
  const parts = [];

  // Block type (heading vs list item vs paragraph)
  let blockLabel = 'Normal';
  for (let lvl = 1; lvl <= 4; lvl++) {
    if (editor.isActive('heading', { level: lvl })) {
      blockLabel = HEADING_LABELS[lvl];
      break;
    }
  }
  if (editor.isActive('bulletList')) blockLabel = 'Bullet';
  else if (editor.isActive('orderedList')) blockLabel = 'Numbered';
  else if (editor.isActive('blockquote')) blockLabel = 'Quote';
  parts.push(blockLabel);

  // Marks
  if (editor.isActive('bold')) parts.push('Bold');
  if (editor.isActive('italic')) parts.push('Italic');
  if (editor.isActive('underline')) parts.push('Underline');
  if (editor.isActive('strike')) parts.push('Strike');

  // Alignment (only show if not default-left, since left is the unmarked state)
  for (const align of ['center', 'right', 'justify']) {
    if (
      editor.isActive('paragraph', { textAlign: align }) ||
      editor.isActive('heading', { textAlign: align })
    ) {
      parts.push(align[0].toUpperCase() + align.slice(1));
      break;
    }
  }

  const label = parts.join(' · ');

  return (
    <div
      title={`Current style: ${label}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        height: '20px',
        padding: '0 8px',
        margin: '0 2px',
        background: 'rgba(15, 23, 42, 0.04)',
        border: '1px solid rgba(15, 23, 42, 0.08)',
        borderRadius: '4px',
        fontSize: '10px',
        fontWeight: 600,
        color: '#475569',
        letterSpacing: '0.2px',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        maxWidth: '240px',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        userSelect: 'none',
        // Subtle accent on the block-level portion so the typist's eye lands
        // there first. Achieved via a leading colored dot.
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: '6px',
          height: '6px',
          borderRadius: '50%',
          background: blockLabel === 'Normal' ? '#cbd5e1' : '#0f52ba',
          flexShrink: 0,
        }}
      />
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</span>
    </div>
  );
}
