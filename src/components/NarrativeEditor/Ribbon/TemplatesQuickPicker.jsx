import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { TEMPLATES } from '../dialogs/ReportTemplatesDialog';

/**
 * QAT-mounted Templates dropdown.
 *
 * Goal: one-click access to the most common per-modality templates from the
 * Quick Access Toolbar. A power-typist applies a template on every case;
 * burying that behind the Insert tab + dialog → search costs 4 clicks per
 * case. This compacts the whole flow into "click → pick → done".
 *
 *   Click "Templates ▾"  → menu of all modality templates appears below
 *   Click a template     → editor's existing onReplace/onInsert fires
 *   Click "More…"        → opens the full ReportTemplatesDialog
 *
 * Props
 *   onApply   {fn(html, opts)}  — apply template; opts.replace = true to
 *                                  replace whole document, else insert at
 *                                  cursor.
 *   onOpenFull {fn()}           — opens the full picker dialog.
 */
export default function TemplatesQuickPicker({ onApply, onOpenFull }) {
  const [open, setOpen] = useState(false);
  const [anchorRect, setAnchorRect] = useState(null);
  const btnRef = useRef(null);
  const menuRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e) => {
      if (menuRef.current?.contains(e.target)) return;
      if (btnRef.current?.contains(e.target)) return;
      setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const openMenu = () => {
    const rect = btnRef.current?.getBoundingClientRect();
    if (rect) setAnchorRect(rect);
    setOpen(true);
  };

  const handlePick = (tpl) => {
    setOpen(false);
    // Replace the whole document by default — templates are full-report
    // scaffolds, not snippets. If the editor has unsaved content, the
    // existing ReportTemplatesDialog flow handles confirm-overwrite; quick
    // pick assumes the user knows what they're doing.
    onApply?.(tpl.html, { replace: true, name: tpl.modality });
  };

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        // Friction #2 — preventDefault on mousedown keeps editor focus.
        // Without this, clicking the picker steals selection and the
        // ribbon's other active-state indicators go stale.
        onMouseDown={e => { e.preventDefault(); openMenu(); }}
        title="Apply a report template (Insert tab → Templates for the full picker)"
        style={{
          display: 'flex', alignItems: 'center', gap: '5px',
          height: '24px', padding: '0 8px',
          background: open ? '#e2e8f0' : 'transparent',
          border: '1px solid ' + (open ? '#94a3b8' : '#cbd5e1'),
          borderRadius: '5px',
          fontSize: '11px',
          fontWeight: 600,
          color: '#0f172a',
          cursor: 'pointer',
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        }}
        onMouseEnter={(e) => { if (!open) e.currentTarget.style.background = '#f1f5f9'; }}
        onMouseLeave={(e) => { if (!open) e.currentTarget.style.background = 'transparent'; }}
      >
        <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
          <path d="M2 2h12v2H2V2zm0 3h12v2H2V5zm0 3h8v2H2V8zm0 3h8v2H2v-2z" />
        </svg>
        <span>Templates</span>
        <span style={{ fontSize: '9px', opacity: 0.6 }}>▾</span>
      </button>

      {open && anchorRect && createPortal(
        <div
          ref={menuRef}
          style={{
            position: 'fixed',
            top: anchorRect.bottom + 4,
            left: anchorRect.left,
            zIndex: 99999,
            minWidth: '260px',
            maxWidth: '320px',
            maxHeight: '70vh',
            overflowY: 'auto',
            background: '#ffffff',
            border: '1px solid #cbd5e1',
            borderRadius: '10px',
            boxShadow: '0 14px 32px rgba(15,23,42,0.18)',
            padding: '6px',
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          }}
        >
          <div style={{
            padding: '6px 10px 8px',
            fontSize: '10px',
            fontWeight: 800,
            letterSpacing: '1px',
            color: '#64748b',
            textTransform: 'uppercase',
          }}>
            Apply a template
          </div>
          {TEMPLATES.map((tpl) => (
            <button
              key={tpl.id}
              type="button"
              onMouseDown={e => { e.preventDefault(); handlePick(tpl); }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                width: '100%',
                padding: '8px 10px',
                background: 'transparent',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                textAlign: 'left',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = '#f1f5f9'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
            >
              <span style={{ fontSize: '18px', flexShrink: 0, color: tpl.color || '#475569' }}>
                {tpl.icon || '📄'}
              </span>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{
                  fontSize: '12px',
                  fontWeight: 700,
                  color: '#0f172a',
                  lineHeight: 1.2,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}>
                  {tpl.modality}
                </div>
                {tpl.description && (
                  <div style={{
                    fontSize: '10px',
                    color: '#64748b',
                    lineHeight: 1.3,
                    marginTop: '2px',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}>
                    {tpl.description}
                  </div>
                )}
              </div>
            </button>
          ))}

          {onOpenFull && (
            <>
              <div style={{ height: '1px', background: '#e2e8f0', margin: '4px 0' }} />
              <button
                type="button"
                onMouseDown={e => { e.preventDefault(); setOpen(false); onOpenFull(); }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  width: '100%',
                  padding: '8px 10px',
                  background: 'transparent',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  textAlign: 'left',
                  fontSize: '12px',
                  fontWeight: 600,
                  color: '#0f52ba',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = '#eff6ff'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
              >
                <span style={{ fontSize: '14px' }}>🔍</span>
                <span>Browse all templates…</span>
              </button>
            </>
          )}
        </div>,
        document.body
      )}
    </>
  );
}
