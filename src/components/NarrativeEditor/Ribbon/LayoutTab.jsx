import React from 'react';
import { Btn, BigBtn, Sep, Group, selectStyle } from './RibbonControls';

/**
 * LayoutTab — page setup, headers/footers, columns.
 * (Margins/orientation are informational — actual values come from the
 * prescription protocol on the radiologist's profile.)
 */
export default function LayoutTab({ editor, documentMeta = {} }) {
  if (!editor) return null;

  return (
    <div style={{ display: 'flex', alignItems: 'stretch', height: '100%' }}>
      <Group label="Page Setup">
        <BigBtn
          icon="📐"
          label="Margins"
          title="Page margins are set per radiologist in Letterhead settings"
          onClick={() => alert('Page margins are configured per radiologist in Letterhead settings. Open Settings → Letterhead to adjust.')}
        />
        <BigBtn
          icon="📄"
          label="Orientation"
          title="Reports use A4 portrait (210×297mm)"
          onClick={() => alert('Reports are fixed to A4 portrait (210×297mm) for clinical printing consistency.')}
        />
      </Group>

      <Sep />

      <Group label="Header & Footer">
        <BigBtn
          icon="🔝"
          label="Header"
          title="Edit page header (appears on every page)"
          onClick={() => window.dispatchEvent(new CustomEvent('narrative-editor:open-header-footer', { detail: { focus: 'header' } }))}
        />
        <BigBtn
          icon="🔚"
          label="Footer"
          title="Edit page footer (appears on every page)"
          onClick={() => window.dispatchEvent(new CustomEvent('narrative-editor:open-header-footer', { detail: { focus: 'footer' } }))}
        />
      </Group>

      <Sep />

      <Group label="Page Numbers">
        <BigBtn
          icon="#"
          label="Insert"
          title="Insert page number token at cursor"
          onClick={() => editor.chain().focus().insertContent('{pageNumber}').run()}
        />
      </Group>
    </div>
  );
}
