import React from 'react';
import { Btn, BigBtn, Sep, Icon, Group, ICONS } from './RibbonControls';

/** Inserts a radiology report section heading + empty body paragraph. */
function insertSection(editor, title) {
  editor.chain().focus().insertContent(`<h2>${title}</h2><p></p>`).run();
}

const SECTIONS = [
  { key: 'clinical',        label: 'Clinical Hx',   title: 'Clinical History',  icon: '📋' },
  { key: 'technique',       label: 'Technique',      title: 'Technique',         icon: '⚙️' },
  { key: 'findings',        label: 'Findings',       title: 'Findings',          icon: '🔍' },
  { key: 'impression',      label: 'Impression',     title: 'Impression',        icon: '📝' },
  { key: 'recommendation',  label: 'Recommend.',     title: 'Recommendation',    icon: '💡' },
];

/**
 * InsertTab — report templates, sections, table, image, link, page break, symbol, etc.
 */
export default function InsertTab({ editor, onOpenTemplates }) {
  if (!editor) return null;

  return (
    <div style={{ display: 'flex', alignItems: 'stretch', height: '100%' }}>
      {/* ── Templates ── */}
      <Group label="Templates">
        <BigBtn
          icon="📋"
          label="Templates"
          title="Pick a radiology report template"
          onClick={onOpenTemplates}
        />
      </Group>

      <Sep />

      {/* ── Radiology Sections ── */}
      <Group label="Report Sections">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', justifyContent: 'center', height: '100%' }}>
          <div style={{ display: 'flex', gap: '2px' }}>
            {SECTIONS.slice(0, 3).map(s => (
              <Btn
                key={s.key}
                title={`Insert "${s.title}" section`}
                onClick={() => insertSection(editor, s.title)}
                style={{ fontSize: '10px', padding: '0 5px', whiteSpace: 'nowrap', height: '22px' }}
              >
                {s.icon} {s.label}
              </Btn>
            ))}
          </div>
          <div style={{ display: 'flex', gap: '2px' }}>
            {SECTIONS.slice(3).map(s => (
              <Btn
                key={s.key}
                title={`Insert "${s.title}" section`}
                onClick={() => insertSection(editor, s.title)}
                style={{ fontSize: '10px', padding: '0 5px', whiteSpace: 'nowrap', height: '22px' }}
              >
                {s.icon} {s.label}
              </Btn>
            ))}
          </div>
        </div>
      </Group>

      <Sep />

      <Group label="Tables">
        <BigBtn
          icon={<Icon d={ICONS.table} size={20} />}
          label="Table"
          title="Insert a 3×3 table"
          onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}
        />
      </Group>

      <Sep />

      <Group label="Illustrations">
        <BigBtn
          icon={<Icon d={ICONS.image} size={20} />}
          label="Image"
          title="Insert image from URL"
          onClick={() => { const url = window.prompt('Image URL:'); if (url) editor.chain().focus().setImage({ src: url }).run(); }}
        />
      </Group>

      <Sep />

      <Group label="Links">
        <BigBtn
          icon={<Icon d={ICONS.link} size={20} />}
          label="Link"
          title="Insert hyperlink"
          onClick={() => {
            const url = window.prompt('Enter URL:', 'https://');
            if (url) editor.chain().focus().setLink({ href: url, target: '_blank' }).run();
          }}
        />
      </Group>

      <Sep />

      <Group label="Symbols">
        <BigBtn
          icon={<Icon d={ICONS.symbol} size={20} />}
          label="Symbol"
          title="Insert symbol (°, µ, ±, Greek letters, …)"
          onClick={() => window.dispatchEvent(new CustomEvent('narrative-editor:open-symbol-picker'))}
        />
      </Group>

      <Sep />

      <Group label="Page Elements">
        <BigBtn
          icon={<Icon d={ICONS.pageBreak} size={20} />}
          label="Page Break"
          title="Insert Page Break (Ctrl+Enter)"
          onClick={() => editor.chain().focus().insertPageBreak().run()}
        />
        <BigBtn
          icon={<Icon d={ICONS.hr} size={20} />}
          label="Horizontal Rule"
          title="Insert a horizontal rule"
          onClick={() => editor.chain().focus().setHorizontalRule().run()}
        />
      </Group>
    </div>
  );
}
