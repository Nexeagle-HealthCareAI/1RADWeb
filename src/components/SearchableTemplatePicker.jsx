import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

/**
 * Searchable Template Picker — replaces the native <select> so doctors can
 * filter through dozens of templates as they type. Renders the dropdown via
 * portal so it never gets clipped by overflow:hidden ancestors.
 *
 * Props:
 *   templates:  Array<{ id, name?: string, Name?: string, content?, Content? }>
 *   value:      currently selected template id (or null)
 *   onChange:   (template) => void  fired when a template is clicked
 *   placeholder: button label when nothing is selected
 *   compact:    true for mobile (smaller padding)
 */
export default function SearchableTemplatePicker({
  templates = [],
  value,
  onChange,
  placeholder = 'Select a template…',
  compact = false,
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [pos, setPos] = useState({ top: 0, left: 0, width: 0 });
  const [activeIdx, setActiveIdx] = useState(0);
  const btnRef = useRef(null);
  const menuRef = useRef(null);
  const inputRef = useRef(null);

  const selected = useMemo(
    () => templates.find(t => String(t.id) === String(value)) || null,
    [templates, value]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return templates;
    return templates.filter(t => (t.name || t.Name || '').toLowerCase().includes(q));
  }, [templates, query]);

  useEffect(() => { if (!open) { setQuery(''); setActiveIdx(0); } }, [open]);
  useEffect(() => { setActiveIdx(0); }, [query]);

  // Anchor + outside-click handling
  useEffect(() => {
    if (!open || !btnRef.current) return;
    const r = btnRef.current.getBoundingClientRect();
    const menuH = Math.min(320, 56 + filtered.length * 32);
    const spaceBelow = window.innerHeight - r.bottom - 8;
    const openUp = spaceBelow < menuH && r.top > menuH;
    setPos({
      top: openUp ? r.top - menuH - 4 : r.bottom + 4,
      left: r.left,
      width: r.width,
      openUp,
    });

    const onDown = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target) && !btnRef.current?.contains(e.target)) {
        setOpen(false);
      }
    };
    const t = setTimeout(() => document.addEventListener('mousedown', onDown), 0);
    setTimeout(() => inputRef.current?.focus(), 50);
    return () => { clearTimeout(t); document.removeEventListener('mousedown', onDown); };
  }, [open, filtered.length]);

  const onKey = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx(i => Math.min(filtered.length - 1, i + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIdx(i => Math.max(0, i - 1)); }
    else if (e.key === 'Enter') {
      e.preventDefault();
      const tpl = filtered[activeIdx];
      if (tpl) { onChange?.(tpl); setOpen(false); }
    } else if (e.key === 'Escape') { e.preventDefault(); setOpen(false); }
  };

  const padding = compact ? '8px 10px' : '10px 12px';
  const fontSize = compact ? 12 : 12;

  return (
    <>
      <button
        ref={btnRef}
        onMouseDown={e => { e.preventDefault(); setOpen(v => !v); }}
        style={{
          width: '100%', textAlign: 'left',
          padding, borderRadius: compact ? '8px' : '9px',
          border: '1px solid #e2e8f0',
          background: 'white', cursor: 'pointer',
          fontSize, fontWeight: 700, color: selected ? '#0a1628' : '#64748b',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          fontFamily: 'inherit', outline: 'none',
        }}
        onMouseEnter={e => { if (!open) e.currentTarget.style.borderColor = '#cbd5e1'; }}
        onMouseLeave={e => { if (!open) e.currentTarget.style.borderColor = '#e2e8f0'; }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, minWidth: 0 }}>
          {selected ? (selected.name || selected.Name) : placeholder}
        </span>
        <span style={{ marginLeft: '8px', color: '#94a3b8', fontSize: '10px' }}>▾</span>
      </button>

      {open && createPortal(
        <div
          ref={menuRef}
          style={{
            position: 'fixed',
            top: pos.top, left: pos.left, width: Math.max(280, pos.width),
            maxHeight: '320px',
            background: 'white', borderRadius: '8px',
            border: '1px solid #d1d5db',
            boxShadow: pos.openUp ? '0 -10px 28px rgba(15,23,42,0.18)' : '0 10px 28px rgba(15,23,42,0.18)',
            zIndex: 13000, padding: '6px',
            fontFamily: '"Segoe UI", system-ui, sans-serif',
            display: 'flex', flexDirection: 'column', gap: '4px',
          }}
        >
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={onKey}
            placeholder="Search templates…"
            style={{
              width: '100%', boxSizing: 'border-box',
              padding: '8px 10px', border: '1px solid #e2e8f0',
              borderRadius: '6px', fontSize: '12px',
              outline: 'none', fontFamily: 'inherit',
            }}
            onFocus={e => e.currentTarget.style.borderColor = '#0078d4'}
            onBlur={e => e.currentTarget.style.borderColor = '#e2e8f0'}
          />
          <div style={{ overflowY: 'auto', maxHeight: '240px', display: 'flex', flexDirection: 'column' }}>
            {filtered.length === 0 ? (
              <div style={{ padding: '10px', fontSize: '12px', color: '#94a3b8', textAlign: 'center' }}>
                No templates match
              </div>
            ) : (
              filtered.map((tpl, i) => {
                const isActive = i === activeIdx;
                const isSelected = String(tpl.id) === String(value);
                return (
                  <button
                    key={tpl.id}
                    onMouseDown={e => { e.preventDefault(); onChange?.(tpl); setOpen(false); }}
                    onMouseEnter={() => setActiveIdx(i)}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      width: '100%', textAlign: 'left',
                      padding: '7px 10px',
                      background: isActive ? '#eff6fc' : 'transparent',
                      border: 'none', borderRadius: '4px',
                      cursor: 'pointer',
                      fontSize: '12px',
                      color: isSelected ? '#0078d4' : '#1f2937',
                      fontWeight: isSelected ? 700 : 500,
                      fontFamily: 'inherit',
                    }}
                  >
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, minWidth: 0 }}>
                      {tpl.name || tpl.Name}
                    </span>
                    {isSelected && <span style={{ marginLeft: '8px', color: '#0078d4', fontSize: '12px' }}>✓</span>}
                  </button>
                );
              })
            )}
          </div>
          <div style={{ fontSize: '10px', color: '#94a3b8', padding: '2px 8px', borderTop: '1px solid #f1f5f9', paddingTop: '6px' }}>
            ↑↓ navigate · Enter to apply · Esc to close
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
