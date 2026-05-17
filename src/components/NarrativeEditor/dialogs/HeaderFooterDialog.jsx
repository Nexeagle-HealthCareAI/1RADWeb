import React, { useState, useEffect } from 'react';

const ALIGN_OPTIONS = [
  { value: 'left',   label: '⬅ Left' },
  { value: 'center', label: '↔ Center' },
  { value: 'right',  label: '➡ Right' },
];

const DEFAULT_STYLE = {
  fontFamily: 'Calibri',
  fontSize: '9',
  align: 'left',
  text: '',
};

function parseState(raw) {
  if (!raw) return { ...DEFAULT_STYLE };
  return { ...DEFAULT_STYLE, ...raw };
}

/**
 * HeaderFooterDialog
 *
 * Simple modal to set header and footer text for every page.
 * Supports font family/size, alignment, and a page-number token.
 *
 * Props:
 *  open           – boolean
 *  initialFocus   – 'header' | 'footer'
 *  header         – current header state object
 *  footer         – current footer state object
 *  onSave(h, f)   – called with updated header + footer state objects
 *  onClose        – called when dialog dismissed without saving
 */
export default function HeaderFooterDialog({
  open,
  initialFocus = 'header',
  header,
  footer,
  onSave,
  onClose,
}) {
  const [tab, setTab] = useState(initialFocus);
  const [hdr, setHdr] = useState(parseState(header));
  const [ftr, setFtr] = useState(parseState(footer));

  useEffect(() => {
    if (open) {
      setTab(initialFocus);
      setHdr(parseState(header));
      setFtr(parseState(footer));
    }
  }, [open, initialFocus, header, footer]);

  if (!open) return null;

  const current = tab === 'header' ? hdr : ftr;
  const setCurrent = tab === 'header' ? setHdr : setFtr;

  const insertPageNumber = () => {
    setCurrent(prev => ({
      ...prev,
      text: prev.text + '{pageNumber}',
    }));
  };

  const handleSave = () => {
    onSave?.(hdr, ftr);
    onClose?.();
  };

  return (
    <div
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.45)',
        zIndex: 12000,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      onMouseDown={e => { if (e.target === e.currentTarget) onClose?.(); }}
    >
      <div style={{
        background: '#fff',
        borderRadius: '6px',
        boxShadow: '0 8px 32px rgba(0,0,0,0.28)',
        width: '520px',
        fontFamily: '"Segoe UI", system-ui, sans-serif',
        overflow: 'hidden',
      }}>
        {/* Title bar */}
        <div style={{
          background: '#0078d4', color: '#fff',
          padding: '12px 16px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <span style={{ fontWeight: 600, fontSize: '14px' }}>Header and Footer</span>
          <button
            onMouseDown={e => { e.preventDefault(); onClose?.(); }}
            style={{
              background: 'transparent', border: 'none', color: '#fff',
              fontSize: '18px', cursor: 'pointer', lineHeight: 1, padding: '0 4px',
            }}
          >×</button>
        </div>

        {/* Tab strip */}
        <div style={{
          display: 'flex',
          borderBottom: '1px solid #e5e7eb',
          background: '#fafafa',
        }}>
          {['header', 'footer'].map(t => (
            <button
              key={t}
              onMouseDown={e => { e.preventDefault(); setTab(t); }}
              style={{
                flex: 1, height: '36px',
                background: tab === t ? '#fff' : 'transparent',
                border: 'none',
                borderBottom: tab === t ? '2px solid #0078d4' : '2px solid transparent',
                cursor: 'pointer',
                fontSize: '13px',
                fontWeight: tab === t ? 600 : 400,
                color: tab === t ? '#0078d4' : '#555',
                fontFamily: 'inherit',
                textTransform: 'capitalize',
              }}
            >{t === 'header' ? '🔝 Header' : '🔚 Footer'}</button>
          ))}
        </div>

        {/* Body */}
        <div style={{ padding: '16px' }}>
          {/* Font controls row */}
          <div style={{ display: 'flex', gap: '8px', marginBottom: '10px', flexWrap: 'wrap' }}>
            <div>
              <label style={{ fontSize: '11px', color: '#666', display: 'block', marginBottom: '3px' }}>Font</label>
              <select
                value={current.fontFamily}
                onChange={e => setCurrent(p => ({ ...p, fontFamily: e.target.value }))}
                style={{
                  height: '28px', padding: '0 6px', fontSize: '12px',
                  border: '1px solid #d1d5db', borderRadius: '3px',
                  fontFamily: 'inherit',
                }}
              >
                {['Calibri', 'Arial', 'Times New Roman', 'Georgia', 'Verdana', 'Courier New'].map(f => (
                  <option key={f} value={f} style={{ fontFamily: f }}>{f}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={{ fontSize: '11px', color: '#666', display: 'block', marginBottom: '3px' }}>Size</label>
              <select
                value={current.fontSize}
                onChange={e => setCurrent(p => ({ ...p, fontSize: e.target.value }))}
                style={{
                  height: '28px', padding: '0 6px', fontSize: '12px', width: '64px',
                  border: '1px solid #d1d5db', borderRadius: '3px',
                  fontFamily: 'inherit',
                }}
              >
                {['7', '8', '9', '10', '11', '12', '14'].map(s => (
                  <option key={s} value={s}>{s}pt</option>
                ))}
              </select>
            </div>
            <div>
              <label style={{ fontSize: '11px', color: '#666', display: 'block', marginBottom: '3px' }}>Alignment</label>
              <div style={{ display: 'flex', gap: '2px' }}>
                {ALIGN_OPTIONS.map(a => (
                  <button
                    key={a.value}
                    onMouseDown={e => { e.preventDefault(); setCurrent(p => ({ ...p, align: a.value })); }}
                    style={{
                      height: '28px', padding: '0 8px',
                      background: current.align === a.value ? '#cce4f7' : 'transparent',
                      border: `1px solid ${current.align === a.value ? '#90c8f0' : '#d1d5db'}`,
                      borderRadius: '3px', cursor: 'pointer',
                      fontSize: '12px', fontFamily: 'inherit',
                      color: current.align === a.value ? '#003a75' : '#374151',
                    }}
                  >{a.label}</button>
                ))}
              </div>
            </div>
          </div>

          {/* Text input */}
          <label style={{ fontSize: '11px', color: '#666', display: 'block', marginBottom: '4px' }}>
            Content
            <span style={{ color: '#999', marginLeft: '8px', fontWeight: 400 }}>
              Use {'{pageNumber}'} for automatic page numbers
            </span>
          </label>
          <textarea
            value={current.text}
            onChange={e => setCurrent(p => ({ ...p, text: e.target.value }))}
            rows={3}
            style={{
              width: '100%', boxSizing: 'border-box',
              padding: '8px 10px',
              border: '1px solid #d1d5db', borderRadius: '4px',
              fontSize: '12px', fontFamily: current.fontFamily,
              resize: 'vertical',
              outline: 'none',
            }}
            placeholder={tab === 'header'
              ? 'e.g. Institution Name | Patient: {name} | Date: {date}'
              : 'e.g. Page {pageNumber} | Radiologist signature'
            }
          />

          {/* Insert page number shortcut */}
          <div style={{ marginTop: '6px' }}>
            <button
              onMouseDown={e => { e.preventDefault(); insertPageNumber(); }}
              style={{
                padding: '4px 10px',
                background: '#f0f7ff',
                border: '1px solid #90c8f0',
                borderRadius: '3px',
                cursor: 'pointer',
                fontSize: '11px',
                color: '#0078d4',
                fontFamily: 'inherit',
              }}
            >+ Insert Page Number token</button>
          </div>

          {/* Preview */}
          {current.text && (
            <div style={{ marginTop: '12px' }}>
              <label style={{ fontSize: '11px', color: '#666', display: 'block', marginBottom: '4px' }}>Preview</label>
              <div style={{
                border: '1px solid #e5e7eb',
                borderRadius: '4px',
                padding: '8px 12px',
                background: '#fafafa',
                fontFamily: current.fontFamily,
                fontSize: `${current.fontSize}pt`,
                textAlign: current.align,
                color: '#333',
                minHeight: '28px',
                borderBottom: tab === 'header' ? '1px solid #d0d0d0' : undefined,
                borderTop: tab === 'footer' ? '1px solid #d0d0d0' : undefined,
              }}>
                {current.text.replace('{pageNumber}', '1')}
              </div>
            </div>
          )}
        </div>

        {/* Footer buttons */}
        <div style={{
          display: 'flex', justifyContent: 'flex-end', gap: '8px',
          padding: '12px 16px',
          borderTop: '1px solid #e5e7eb',
          background: '#fafafa',
        }}>
          <button
            onMouseDown={e => { e.preventDefault(); onClose?.(); }}
            style={{
              padding: '6px 18px', border: '1px solid #d1d5db',
              borderRadius: '4px', background: '#fff', cursor: 'pointer',
              fontSize: '13px', fontFamily: 'inherit', color: '#374151',
            }}
          >Cancel</button>
          <button
            onMouseDown={e => { e.preventDefault(); handleSave(); }}
            style={{
              padding: '6px 18px',
              background: '#0078d4', border: '1px solid #0078d4',
              borderRadius: '4px', cursor: 'pointer',
              fontSize: '13px', fontFamily: 'inherit', color: '#fff',
              fontWeight: 600,
            }}
          >Apply</button>
        </div>
      </div>
    </div>
  );
}
