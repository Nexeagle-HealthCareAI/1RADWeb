import React from 'react';
import { createPortal } from 'react-dom';

const SECTIONS = [
  {
    title: 'Character formatting',
    items: [
      ['Ctrl + B', 'Bold'],
      ['Ctrl + I', 'Italic'],
      ['Ctrl + U', 'Underline'],
      ['Ctrl + Shift + X', 'Strikethrough'],
      ['Ctrl + =', 'Subscript'],
      ['Ctrl + Shift + =', 'Superscript'],
      ['Ctrl + ]', 'Grow font'],
      ['Ctrl + [', 'Shrink font'],
      ['Ctrl + Space', 'Clear character formatting'],
    ],
  },
  {
    title: 'Paragraph',
    items: [
      ['Ctrl + L', 'Align left'],
      ['Ctrl + E', 'Center'],
      ['Ctrl + R', 'Align right'],
      ['Ctrl + J', 'Justify'],
      ['Ctrl + M', 'Increase indent'],
      ['Ctrl + Shift + M', 'Decrease indent'],
      ['Ctrl + 1', 'Line spacing 1.0'],
      ['Ctrl + 2', 'Line spacing 2.0'],
      ['Ctrl + 5', 'Line spacing 1.5'],
      ['Ctrl + Q', 'Reset paragraph'],
    ],
  },
  {
    title: 'Lists',
    items: [
      ['Ctrl + Shift + L', 'Bullet list'],
      ['Ctrl + Shift + 7', 'Numbered list'],
      ['Tab',              'Increase indent (paragraph or list level)'],
      ['Shift + Tab',      'Decrease indent (paragraph or list level)'],
    ],
  },
  {
    title: 'Styles',
    items: [
      ['Ctrl + Alt + 1', 'Heading 1'],
      ['Ctrl + Alt + 2', 'Heading 2'],
      ['Ctrl + Alt + 3', 'Heading 3'],
      ['Ctrl + Alt + 4', 'Heading 4'],
      ['Ctrl + Shift + N', 'Normal paragraph'],
    ],
  },
  {
    title: 'Clipboard',
    items: [
      ['Ctrl + C', 'Copy'],
      ['Ctrl + X', 'Cut'],
      ['Ctrl + V', 'Paste'],
      ['Ctrl + Shift + V', 'Paste plain / Apply Painter'],
      ['Ctrl + A', 'Select all'],
    ],
  },
  {
    title: 'Find / Edit',
    items: [
      ['Ctrl + F', 'Find'],
      ['Ctrl + H', 'Find & Replace'],
      ['Ctrl + Z', 'Undo'],
      ['Ctrl + Y / Ctrl + Shift + Z', 'Redo'],
      ['Ctrl + K', 'Insert hyperlink'],
      ['Ctrl + Enter', 'Insert page break'],
    ],
  },
  {
    title: 'Format Painter',
    items: [
      ['Ctrl + Shift + C', 'Pick up formatting'],
      ['Ctrl + Shift + V', 'Apply formatting'],
    ],
  },
  {
    title: 'Navigation',
    items: [
      ['Ctrl + Home', 'Go to document start'],
      ['Ctrl + End', 'Go to document end'],
      ['Ctrl + G / F5', 'Go to page…'],
      ['PgUp / PgDn', 'Scroll one page'],
    ],
  },
  {
    title: 'Text editing',
    items: [
      ['Shift + F3', 'Toggle case (Mixed → UPPER → lower → Title)'],
      ['Alt + Shift + ↑ / ↓', 'Move paragraph up / down'],
      ['Ctrl + Shift + Space', 'Insert non-breaking space'],
      ['Ctrl + –', 'Insert soft/optional hyphen'],
      ['Ctrl + Shift + –', 'Insert em dash —'],
    ],
  },
  {
    title: 'Special characters',
    items: [
      ['Ctrl + Alt + .', 'Ellipsis …'],
      ['Ctrl + Alt + C', 'Copyright ©'],
      ['Ctrl + Alt + R', 'Registered ®'],
      ['Ctrl + Alt + T', 'Trademark ™'],
    ],
  },
  {
    title: 'App',
    items: [
      ['Ctrl + S', 'Save'],
      ['Ctrl + P', 'Print preview'],
      ['F11', 'Toggle full screen'],
      ['F1', 'Show this list'],
      ['Esc', 'Close dialogs'],
    ],
  },
];

export default function ShortcutsDialog({ open, onClose }) {
  if (!open) return null;

  const panel = (
    <div
      onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(10, 22, 40, 0.45)',
        backdropFilter: 'blur(2px)',
        zIndex: 13800, display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: '"Segoe UI", system-ui, sans-serif',
      }}
    >
      <div
        onMouseDown={e => e.stopPropagation()}
        style={{
          width: '760px', maxWidth: '92vw', maxHeight: '85vh',
          background: '#ffffff', borderRadius: '8px',
          boxShadow: '0 24px 60px rgba(0,0,0,0.35)',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}
      >
        <div style={{ padding: '14px 18px', borderBottom: '1px solid #f0f0f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: '15px', fontWeight: 600, color: '#1f2937' }}>Keyboard Shortcuts</div>
          <button
            onMouseDown={e => { e.preventDefault(); onClose(); }}
            style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '20px', color: '#666' }}
          >×</button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '14px 18px', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(330px, 1fr))', gap: '20px' }}>
          {SECTIONS.map(s => (
            <div key={s.title}>
              <div style={{ fontSize: '11px', fontWeight: 700, color: '#0078d4', textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: '6px' }}>{s.title}</div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                <tbody>
                  {s.items.map(([kbd, label]) => (
                    <tr key={kbd}>
                      <td style={{ padding: '4px 0', whiteSpace: 'nowrap', width: '160px' }}>
                        <code style={{ background: '#f3f4f6', border: '1px solid #e0e0e0', borderRadius: '3px', padding: '1px 6px', fontFamily: '"Cascadia Code", Consolas, monospace', fontSize: '11px', color: '#1f2937' }}>{kbd}</code>
                      </td>
                      <td style={{ padding: '4px 0', color: '#374151' }}>{label}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>

        <div style={{ padding: '10px 18px', background: '#fafafa', borderTop: '1px solid #f0f0f0', textAlign: 'right' }}>
          <button
            onMouseDown={e => { e.preventDefault(); onClose(); }}
            style={{
              padding: '6px 18px', borderRadius: '4px', border: 'none',
              background: '#0078d4', color: '#fff', fontSize: '12px',
              fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
            }}
          >Close</button>
        </div>
      </div>
    </div>
  );

  return createPortal(panel, document.body);
}
