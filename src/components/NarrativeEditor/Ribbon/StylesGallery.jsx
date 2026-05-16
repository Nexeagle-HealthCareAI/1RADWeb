import React from 'react';

/**
 * StylesGallery — Word-style preset cards. One click applies the preset
 * to the current paragraph or selection.
 *
 * Each preset is a chain of editor commands that sets the heading level
 * (or paragraph), applies fontSize via textStyle, and may add other marks.
 */
const PRESETS = [
  {
    id: 'normal',
    label: 'Normal',
    sample: { fontSize: '12pt', fontWeight: 400 },
    apply: (editor) =>
      editor.chain().focus().setParagraph().unsetAllMarks().run(),
    isActive: (editor) => editor.isActive('paragraph') && !editor.isActive('blockquote'),
  },
  {
    id: 'title',
    label: 'Title',
    sample: { fontSize: '20pt', fontWeight: 700, color: '#1f3864' },
    apply: (editor) => editor.chain().focus()
      .setHeading({ level: 1 })
      .setMark('textStyle', { fontSize: '26pt' })
      .setTextAlign('center')
      .run(),
    isActive: (editor) => editor.isActive('heading', { level: 1 }) && editor.isActive({ textAlign: 'center' }),
  },
  {
    id: 'subtitle',
    label: 'Subtitle',
    sample: { fontSize: '14pt', fontWeight: 600, fontStyle: 'italic', color: '#444' },
    apply: (editor) => editor.chain().focus()
      .setHeading({ level: 2 })
      .setMark('textStyle', { fontSize: '18pt' })
      .toggleItalic()
      .run(),
  },
  {
    id: 'h1',
    label: 'Heading 1',
    sample: { fontSize: '16pt', fontWeight: 700, color: '#1f3864' },
    apply: (editor) => editor.chain().focus()
      .setHeading({ level: 1 })
      .setMark('textStyle', { fontSize: '24pt' })
      .run(),
    isActive: (editor) => editor.isActive('heading', { level: 1 }),
  },
  {
    id: 'h2',
    label: 'Heading 2',
    sample: { fontSize: '14pt', fontWeight: 700, color: '#2e4d7b' },
    apply: (editor) => editor.chain().focus()
      .setHeading({ level: 2 })
      .setMark('textStyle', { fontSize: '20pt' })
      .run(),
    isActive: (editor) => editor.isActive('heading', { level: 2 }),
  },
  {
    id: 'h3',
    label: 'Heading 3',
    sample: { fontSize: '12pt', fontWeight: 600, color: '#2e4d7b' },
    apply: (editor) => editor.chain().focus()
      .setHeading({ level: 3 })
      .setMark('textStyle', { fontSize: '16pt' })
      .run(),
    isActive: (editor) => editor.isActive('heading', { level: 3 }),
  },
  {
    id: 'h4',
    label: 'Heading 4',
    sample: { fontSize: '11pt', fontWeight: 600, color: '#374151' },
    apply: (editor) => editor.chain().focus()
      .setHeading({ level: 4 })
      .setMark('textStyle', { fontSize: '14pt' })
      .run(),
    isActive: (editor) => editor.isActive('heading', { level: 4 }),
  },
  {
    id: 'quote',
    label: 'Quote',
    sample: { fontSize: '12pt', fontStyle: 'italic', color: '#555' },
    apply: (editor) => editor.chain().focus()
      .toggleBlockquote()
      .run(),
    isActive: (editor) => editor.isActive('blockquote'),
  },
];

export default function StylesGallery({ editor }) {
  if (!editor) return null;

  return (
    <div style={{
      display: 'flex', gap: '4px', alignItems: 'center',
      overflowX: 'auto', overflowY: 'hidden',
      maxWidth: '420px', height: '60px',
      msOverflowStyle: 'none', scrollbarWidth: 'none',
    }}>
      <style>{`.styles-gallery::-webkit-scrollbar { display: none; }`}</style>
      {PRESETS.map(preset => {
        const active = preset.isActive ? preset.isActive(editor) : false;
        return (
          <button
            key={preset.id}
            className="styles-gallery"
            onMouseDown={e => { e.preventDefault(); preset.apply(editor); }}
            title={preset.label}
            style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              minWidth: '70px', height: '52px', padding: '4px 8px',
              background: active ? '#cce4f7' : '#fff',
              border: `1px solid ${active ? '#90c8f0' : '#d1d1d1'}`,
              borderRadius: '3px', cursor: 'pointer', flexShrink: 0,
              fontFamily: '"Segoe UI", system-ui, sans-serif',
              transition: 'background 0.1s, border-color 0.1s',
            }}
            onMouseEnter={e => { if (!active) e.currentTarget.style.background = '#f0f0f0'; }}
            onMouseLeave={e => { if (!active) e.currentTarget.style.background = '#fff'; }}
          >
            <div style={{
              ...preset.sample,
              lineHeight: 1,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              maxWidth: '60px',
            }}>Aa</div>
            <div style={{ fontSize: '9px', color: '#666', marginTop: '4px', whiteSpace: 'nowrap' }}>
              {preset.label}
            </div>
          </button>
        );
      })}
    </div>
  );
}
