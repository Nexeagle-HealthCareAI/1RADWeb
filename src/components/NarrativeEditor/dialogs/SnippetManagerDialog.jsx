import React, { useState, useEffect, useRef } from 'react';
import {
  CATEGORIES,
  DEFAULT_SNIPPETS,
  loadSnippets,
  saveSnippets,
  addSnippet,
  updateSnippet,
  removeSnippet,
} from '../data/snippetStorage';

const OVL = {
  position: 'fixed', inset: 0,
  background: 'rgba(0,0,0,0.45)',
  zIndex: 1000,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  fontFamily: '"Segoe UI", system-ui, sans-serif',
};

const EMPTY_FORM = { trigger: '/', label: '', category: 'General', content: '' };

/**
 * SnippetManagerDialog — create / edit / delete text-expansion snippets.
 * Snippets are stored in localStorage and merged with the editor's keywordLibrary prop.
 *
 * Props:
 *   open       {boolean}
 *   onClose    {fn()}
 *   onChanged  {fn(snippets[])}  — called when snippets are saved
 */
export default function SnippetManagerDialog({ open, onClose, onChanged }) {
  const [snippets, setSnippets]     = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [search, setSearch]         = useState('');
  const [form, setForm]             = useState(EMPTY_FORM);
  const [saved, setSaved]           = useState(false);
  const contentRef = useRef(null);

  // Load on open
  useEffect(() => {
    if (!open) return;
    const loaded = loadSnippets();
    setSnippets(loaded);
    const first = loaded[0]?.id ?? null;
    setSelectedId(first);
    if (first) {
      const s = loaded.find(x => x.id === first);
      setForm({ trigger: s.trigger, label: s.label, category: s.category || 'General', content: s.content });
    }
    setSearch('');
    setSaved(false);
  }, [open]);

  // Sync form when selection changes (save current first)
  const selectSnippet = (id) => {
    // Auto-save pending form edits into snippets array
    if (selectedId) {
      setSnippets(prev => updateSnippet(prev, selectedId, form));
    }
    setSelectedId(id);
    const s = snippets.find(x => x.id === id);
    if (s) setForm({ trigger: s.trigger, label: s.label, category: s.category || 'General', content: s.content });
  };

  if (!open) return null;

  const filtered = snippets.filter(s => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      s.trigger.toLowerCase().includes(q) ||
      s.label.toLowerCase().includes(q) ||
      (s.category || '').toLowerCase().includes(q)
    );
  });

  const handleNew = () => {
    // Persist current form
    let current = snippets;
    if (selectedId) current = updateSnippet(current, selectedId, form);
    const updated = addSnippet(current, { ...EMPTY_FORM });
    const newId = updated[updated.length - 1].id;
    setSnippets(updated);
    setSelectedId(newId);
    setForm({ ...EMPTY_FORM });
    setTimeout(() => contentRef.current?.focus(), 50);
  };

  const handleDelete = () => {
    if (!selectedId) return;
    // eslint-disable-next-line no-restricted-globals
    if (!confirm('Delete this snippet?')) return;
    const updated = removeSnippet(snippets, selectedId);
    setSnippets(updated);
    const next = updated[0]?.id ?? null;
    setSelectedId(next);
    if (next) {
      const s = updated.find(x => x.id === next);
      setForm({ trigger: s.trigger, label: s.label, category: s.category || 'General', content: s.content });
    } else {
      setForm(EMPTY_FORM);
    }
  };

  const handleSaveClose = () => {
    let finalSnippets = snippets;
    if (selectedId) finalSnippets = updateSnippet(snippets, selectedId, form);
    saveSnippets(finalSnippets);
    onChanged?.(finalSnippets);
    setSaved(true);
    onClose();
  };

  const handleReset = () => {
    // eslint-disable-next-line no-restricted-globals
    if (!confirm('Reset all snippets to factory defaults? Custom snippets will be removed.')) return;
    const defaults = DEFAULT_SNIPPETS.map(s => ({ ...s }));
    setSnippets(defaults);
    setSelectedId(defaults[0]?.id ?? null);
    if (defaults[0]) {
      const s = defaults[0];
      setForm({ trigger: s.trigger, label: s.label, category: s.category, content: s.content });
    }
  };

  const fc = (field, val) => setForm(prev => ({ ...prev, [field]: val }));

  const ITEM_STYLE = (active) => ({
    padding: '7px 12px', cursor: 'pointer', fontSize: '12px',
    background: active ? '#dbeafe' : 'transparent',
    color: active ? '#1d4ed8' : '#374151',
    borderLeft: active ? '3px solid #3b82f6' : '3px solid transparent',
    transition: 'background 0.1s',
  });

  return (
    <div style={OVL} onClick={onClose}>
      <div
        style={{
          background: '#fff', borderRadius: '8px',
          boxShadow: '0 24px 64px rgba(0,0,0,0.22)',
          width: '820px', maxWidth: '96vw', maxHeight: '88vh',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}
        onClick={e => e.stopPropagation()}
      >

        {/* ── Header ── */}
        <div style={{ padding: '16px 22px 12px', borderBottom: '1px solid #e5e7eb', background: '#f8f9fa', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: '15px', color: '#111827' }}>⚡ Snippet Manager</div>
            <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '2px' }}>
              Type <code style={{ background: '#f3f4f6', padding: '0 4px', borderRadius: '3px', fontFamily: 'monospace' }}>/trigger</code> in the editor followed by <kbd style={{ background: '#f3f4f6', padding: '0 4px', borderRadius: '3px', fontSize: '10px' }}>Space</kbd> or <kbd style={{ background: '#f3f4f6', padding: '0 4px', borderRadius: '3px', fontSize: '10px' }}>Enter</kbd> to expand
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: '#6b7280' }}>✕</button>
        </div>

        {/* ── Body ── */}
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

          {/* Left — snippet list */}
          <div style={{ width: '240px', flexShrink: 0, borderRight: '1px solid #e5e7eb', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '7px 8px', borderBottom: '1px solid #f3f4f6', display: 'flex', gap: '5px' }}>
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search snippets…"
                style={{ flex: 1, padding: '4px 7px', border: '1px solid #d1d5db', borderRadius: '4px', fontSize: '11px', fontFamily: 'inherit' }}
              />
              <button
                onClick={handleNew}
                title="New snippet"
                style={{ padding: '4px 8px', border: '1px solid #3b82f6', background: '#eff6ff', color: '#1d4ed8', borderRadius: '4px', cursor: 'pointer', fontSize: '13px', fontWeight: 700, lineHeight: 1 }}
              >+</button>
            </div>

            <div style={{ flex: 1, overflowY: 'auto' }}>
              {CATEGORIES.map(cat => {
                const items = filtered.filter(s => (s.category || 'General') === cat);
                if (!items.length) return null;
                return (
                  <div key={cat}>
                    <div style={{ padding: '5px 12px 3px', fontSize: '10px', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.06em', background: '#f9fafb' }}>
                      {cat}
                    </div>
                    {items.map(s => (
                      <div key={s.id} onClick={() => selectSnippet(s.id)} style={ITEM_STYLE(s.id === selectedId)}>
                        <div style={{ fontWeight: 600, fontFamily: 'monospace', fontSize: '11px' }}>{s.trigger}</div>
                        <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '1px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.label}</div>
                      </div>
                    ))}
                  </div>
                );
              })}
              {/* Other categories */}
              {(() => {
                const other = filtered.filter(s => !CATEGORIES.includes(s.category));
                if (!other.length) return null;
                return (
                  <div>
                    <div style={{ padding: '5px 12px 3px', fontSize: '10px', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.06em', background: '#f9fafb' }}>Other</div>
                    {other.map(s => (
                      <div key={s.id} onClick={() => selectSnippet(s.id)} style={ITEM_STYLE(s.id === selectedId)}>
                        <div style={{ fontWeight: 600, fontFamily: 'monospace', fontSize: '11px' }}>{s.trigger}</div>
                        <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '1px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.label}</div>
                      </div>
                    ))}
                  </div>
                );
              })()}
              {filtered.length === 0 && (
                <p style={{ padding: '16px', fontSize: '11px', color: '#9ca3af', textAlign: 'center' }}>No snippets match</p>
              )}
            </div>
          </div>

          {/* Right — edit form */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {!selectedId ? (
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9ca3af', fontSize: '13px' }}>
                ← Select a snippet or click <strong style={{ margin: '0 4px' }}>+</strong> to create one
              </div>
            ) : (
              <div style={{ flex: 1, overflowY: 'auto', padding: '18px 22px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '14px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#374151', marginBottom: '4px' }}>Trigger *</label>
                    <input
                      type="text"
                      value={form.trigger}
                      onChange={e => fc('trigger', e.target.value)}
                      placeholder="/trigger"
                      style={{ width: '100%', boxSizing: 'border-box', padding: '6px 9px', border: '1px solid #d1d5db', borderRadius: '5px', fontSize: '13px', fontFamily: 'monospace' }}
                    />
                    <div style={{ fontSize: '10px', color: '#9ca3af', marginTop: '3px' }}>Type this + Space/Enter to expand</div>
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#374151', marginBottom: '4px' }}>Label *</label>
                    <input
                      type="text"
                      value={form.label}
                      onChange={e => fc('label', e.target.value)}
                      placeholder="Descriptive name"
                      style={{ width: '100%', boxSizing: 'border-box', padding: '6px 9px', border: '1px solid #d1d5db', borderRadius: '5px', fontSize: '13px', fontFamily: 'inherit' }}
                    />
                  </div>
                </div>

                <div style={{ marginBottom: '14px' }}>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#374151', marginBottom: '4px' }}>Category</label>
                  <select
                    value={form.category}
                    onChange={e => fc('category', e.target.value)}
                    style={{ padding: '6px 9px', border: '1px solid #d1d5db', borderRadius: '5px', fontSize: '12px', fontFamily: 'inherit', minWidth: '160px' }}
                  >
                    {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#374151', marginBottom: '4px' }}>
                    Content <span style={{ fontWeight: 400, color: '#9ca3af' }}>(plain text or HTML)</span>
                  </label>
                  <textarea
                    ref={contentRef}
                    value={form.content}
                    onChange={e => fc('content', e.target.value)}
                    placeholder="Text or HTML inserted when trigger expands…"
                    style={{
                      width: '100%', boxSizing: 'border-box',
                      minHeight: '160px', padding: '8px 10px',
                      border: '1px solid #d1d5db', borderRadius: '5px',
                      fontSize: '12px', fontFamily: 'monospace', lineHeight: 1.6, resize: 'vertical',
                    }}
                  />
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '10px' }}>
                  <button
                    onClick={handleDelete}
                    style={{ padding: '5px 14px', border: '1px solid #fca5a5', background: '#fef2f2', color: '#dc2626', borderRadius: '4px', cursor: 'pointer', fontSize: '11px', fontFamily: 'inherit' }}
                  >
                    🗑 Delete Snippet
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── Footer ── */}
        <div style={{ padding: '10px 22px', borderTop: '1px solid #e5e7eb', display: 'flex', gap: '8px', alignItems: 'center' }}>
          <button
            onClick={handleReset}
            style={{ padding: '6px 14px', border: '1px solid #d1d5db', background: '#f9fafb', borderRadius: '4px', cursor: 'pointer', fontSize: '11px', fontFamily: 'inherit', color: '#6b7280' }}
          >
            ↺ Reset to Defaults
          </button>
          <div style={{ flex: 1, fontSize: '11px', color: '#9ca3af' }}>
            {snippets.length} snippet{snippets.length !== 1 ? 's' : ''}
            {saved && ' — saved'}
          </div>
          <button
            onClick={onClose}
            style={{ padding: '7px 18px', border: '1px solid #d1d5db', background: '#fff', borderRadius: '5px', cursor: 'pointer', fontSize: '12px', fontFamily: 'inherit' }}
          >
            Cancel
          </button>
          <button
            onClick={handleSaveClose}
            style={{ padding: '7px 22px', border: '1px solid #1d4ed8', background: '#2563eb', color: '#fff', borderRadius: '5px', cursor: 'pointer', fontSize: '12px', fontWeight: 600, fontFamily: 'inherit' }}
          >
            ✓ Save & Close
          </button>
        </div>

      </div>
    </div>
  );
}
