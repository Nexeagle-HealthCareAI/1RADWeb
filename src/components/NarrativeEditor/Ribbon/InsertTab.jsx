import React from 'react';
import { Btn, BigBtn, Sep, Icon, Group, ICONS } from './RibbonControls';

/**
 * InsertTab — table, image, link, page break, symbol, etc.
 */
export default function InsertTab({ editor }) {
  if (!editor) return null;

  return (
    <div style={{ display: 'flex', alignItems: 'stretch', height: '100%' }}>
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
