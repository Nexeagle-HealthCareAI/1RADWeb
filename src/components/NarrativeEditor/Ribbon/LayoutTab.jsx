import React from 'react';
import { Btn, BigBtn, Sep, Group, selectStyle } from './RibbonControls';
import { notifyToast } from '../../../utils/toast';

/**
 * LayoutTab — page setup, headers/footers, columns.
 * (Margins/orientation are informational — actual values come from the
 * prescription protocol on the radiologist's profile.)
 */
export default function LayoutTab({ editor, documentMeta = {}, watermark = '', onSetWatermark }) {
  if (!editor) return null;

  const PRESETS = ['', 'DRAFT', 'CONFIDENTIAL', 'PROVISIONAL'];
  const wmSelectValue = PRESETS.includes(watermark) ? watermark : 'custom';

  return (
    <div style={{ display: 'flex', alignItems: 'stretch', height: '100%' }}>
      <Group label="Page Setup">
        <BigBtn
          icon="📐"
          label="Margins"
          title="Page margins are set per radiologist in Letterhead settings"
          onClick={() => notifyToast({ title: 'Page margins', message: 'Configured per radiologist in Letterhead settings. Open Settings → Letterhead to adjust.' }, 'info')}
        />
        <BigBtn
          icon="📄"
          label="Orientation"
          title="Reports use A4 portrait (210×297mm)"
          onClick={() => notifyToast({ title: 'Orientation', message: 'Reports are fixed to A4 portrait (210×297mm) for clinical printing consistency.' }, 'info')}
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
          onClick={() => editor.chain().focus().insertPageNumber().run()}
        />
      </Group>

      <Sep />

      {/* Columns — wrap the selection into a 2/3-column CSS section. */}
      <Group label="Columns">
        <select
          style={selectStyle}
          title="Flow the selected text into columns"
          value=""
          onChange={(e) => { const n = parseInt(e.target.value, 10); if (n) editor.chain().focus().setColumns(n).run(); e.target.value = ''; }}
        >
          <option value="">Columns…</option>
          <option value="1">One column</option>
          <option value="2">Two columns</option>
          <option value="3">Three columns</option>
        </select>
      </Group>

      <Sep />

      {/* Watermark — faint diagonal text on every page (screen + print). */}
      <Group label="Watermark">
        <select
          style={selectStyle}
          title="Show a diagonal watermark on every page"
          value={wmSelectValue}
          onChange={(e) => {
            const v = e.target.value;
            if (v === 'custom') {
              const t = window.prompt('Watermark text', watermark || 'DRAFT');
              if (t != null) onSetWatermark?.(t.trim());
            } else {
              onSetWatermark?.(v);
            }
          }}
        >
          <option value="">None</option>
          <option value="DRAFT">DRAFT</option>
          <option value="CONFIDENTIAL">CONFIDENTIAL</option>
          <option value="PROVISIONAL">PROVISIONAL</option>
          <option value="custom">Custom…</option>
        </select>
      </Group>
    </div>
  );
}
