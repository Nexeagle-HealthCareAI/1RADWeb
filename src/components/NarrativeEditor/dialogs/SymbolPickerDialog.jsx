import React, { useState, useEffect, useMemo } from 'react';

const SYMBOL_GROUPS = {
  Common: [
    { c: '°', name: 'degree' },
    { c: '±', name: 'plus minus' },
    { c: '×', name: 'multiply times' },
    { c: '÷', name: 'divide' },
    { c: 'µ', name: 'micro mu' },
    { c: '≈', name: 'approximately equal' },
    { c: '≠', name: 'not equal' },
    { c: '≤', name: 'less than or equal' },
    { c: '≥', name: 'greater than or equal' },
    { c: '∞', name: 'infinity' },
    { c: '√', name: 'square root sqrt' },
    { c: '∅', name: 'empty set' },
    { c: '∝', name: 'proportional' },
    { c: '∴', name: 'therefore' },
    { c: '∵', name: 'because' },
    { c: '⌀', name: 'diameter' },
    { c: '·', name: 'middle dot' },
    { c: '…', name: 'ellipsis' },
  ],
  Greek: [
    { c: 'α', name: 'alpha' }, { c: 'β', name: 'beta' }, { c: 'γ', name: 'gamma' },
    { c: 'δ', name: 'delta' }, { c: 'ε', name: 'epsilon' }, { c: 'ζ', name: 'zeta' },
    { c: 'η', name: 'eta' }, { c: 'θ', name: 'theta' }, { c: 'ι', name: 'iota' },
    { c: 'κ', name: 'kappa' }, { c: 'λ', name: 'lambda' }, { c: 'µ', name: 'mu micro' },
    { c: 'ν', name: 'nu' }, { c: 'ξ', name: 'xi' }, { c: 'π', name: 'pi' },
    { c: 'ρ', name: 'rho' }, { c: 'σ', name: 'sigma' }, { c: 'τ', name: 'tau' },
    { c: 'φ', name: 'phi' }, { c: 'χ', name: 'chi' }, { c: 'ψ', name: 'psi' },
    { c: 'ω', name: 'omega' },
    { c: 'Α', name: 'Alpha' }, { c: 'Β', name: 'Beta' }, { c: 'Γ', name: 'Gamma' },
    { c: 'Δ', name: 'Delta' }, { c: 'Θ', name: 'Theta' }, { c: 'Λ', name: 'Lambda' },
    { c: 'Π', name: 'Pi' }, { c: 'Σ', name: 'Sigma' }, { c: 'Φ', name: 'Phi' },
    { c: 'Ψ', name: 'Psi' }, { c: 'Ω', name: 'Omega' },
  ],
  Math: [
    { c: '∑', name: 'sum sigma' }, { c: '∫', name: 'integral' }, { c: '∂', name: 'partial' },
    { c: '∇', name: 'nabla' }, { c: '∈', name: 'in element' }, { c: '∉', name: 'not in' },
    { c: '⊂', name: 'subset' }, { c: '⊃', name: 'superset' }, { c: '⊆', name: 'subset equal' },
    { c: '⊇', name: 'superset equal' }, { c: '∪', name: 'union' }, { c: '∩', name: 'intersection' },
    { c: '∧', name: 'and logical' }, { c: '∨', name: 'or logical' }, { c: '¬', name: 'not logical' },
    { c: '∀', name: 'for all' }, { c: '∃', name: 'exists' }, { c: '⇒', name: 'implies' },
    { c: '⇔', name: 'iff equivalent' }, { c: '←', name: 'left arrow' }, { c: '→', name: 'right arrow' },
    { c: '↑', name: 'up arrow' }, { c: '↓', name: 'down arrow' }, { c: '↔', name: 'left right arrow' },
  ],
  Currency: [
    { c: '$', name: 'dollar' }, { c: '€', name: 'euro' }, { c: '£', name: 'pound' },
    { c: '¥', name: 'yen yuan' }, { c: '₹', name: 'rupee' }, { c: '¢', name: 'cent' },
  ],
  Latin: [
    { c: 'é', name: 'e acute' }, { c: 'è', name: 'e grave' }, { c: 'ê', name: 'e circumflex' },
    { c: 'à', name: 'a grave' }, { c: 'á', name: 'a acute' }, { c: 'ç', name: 'c cedilla' },
    { c: 'ñ', name: 'n tilde' }, { c: 'ü', name: 'u umlaut' }, { c: 'ö', name: 'o umlaut' },
    { c: 'ä', name: 'a umlaut' }, { c: 'ø', name: 'o slash' }, { c: 'å', name: 'a ring' },
    { c: 'ß', name: 'sharp s eszett' }, { c: '¿', name: 'inverted question' }, { c: '¡', name: 'inverted exclaim' },
  ],
  Punctuation: [
    { c: '—', name: 'em dash' }, { c: '–', name: 'en dash' }, { c: '…', name: 'ellipsis' },
    { c: '«', name: 'left guillemet' }, { c: '»', name: 'right guillemet' },
    { c: '‘', name: 'left single quote' }, { c: '’', name: 'right single quote' },
    { c: '“', name: 'left double quote' }, { c: '”', name: 'right double quote' },
    { c: '§', name: 'section' }, { c: '¶', name: 'paragraph pilcrow' },
    { c: '©', name: 'copyright' }, { c: '®', name: 'registered' }, { c: '™', name: 'trademark' },
  ],
};

const RECENTS_KEY = 'narrative-editor:symbol-recents';

export default function SymbolPickerDialog({ editor, open, onClose }) {
  const [activeGroup, setActiveGroup] = useState('Common');
  const [search, setSearch] = useState('');
  const [recents, setRecents] = useState(() => {
    try { return JSON.parse(localStorage.getItem(RECENTS_KEY) || '[]'); }
    catch { return []; }
  });

  useEffect(() => {
    if (!open) setSearch('');
  }, [open]);

  const visibleSymbols = useMemo(() => {
    if (search.trim()) {
      const q = search.toLowerCase();
      return Object.values(SYMBOL_GROUPS).flat().filter(s => s.name.includes(q) || s.c.includes(q));
    }
    return SYMBOL_GROUPS[activeGroup] || [];
  }, [search, activeGroup]);

  const handleInsert = (char) => {
    if (!editor) return;
    editor.chain().focus().insertContent(char).run();

    // Update recents
    const updated = [char, ...recents.filter(c => c !== char)].slice(0, 18);
    setRecents(updated);
    try { localStorage.setItem(RECENTS_KEY, JSON.stringify(updated)); } catch {}
  };

  if (!open) return null;

  return (
    <div
      onMouseDown={e => e.target === e.currentTarget && onClose()}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
        zIndex: 12000, display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <div
        onMouseDown={e => e.stopPropagation()}
        style={{
          width: '520px', maxHeight: '480px', background: '#fff',
          borderRadius: '8px', boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
          display: 'flex', flexDirection: 'column',
          fontFamily: '"Segoe UI", system-ui, sans-serif',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 18px', borderBottom: '1px solid #e0e0e0' }}>
          <span style={{ fontWeight: 600, fontSize: '14px' }}>Insert Symbol</span>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '20px', color: '#666' }}>×</button>
        </div>

        <div style={{ padding: '10px 14px 0' }}>
          <input
            type="text"
            placeholder="Search symbols…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            autoFocus
            style={{
              width: '100%', height: '30px', padding: '0 10px',
              border: '1px solid #c8c8c8', borderRadius: '3px', fontSize: '13px',
              outline: 'none', boxSizing: 'border-box',
            }}
          />
        </div>

        {/* Category tabs */}
        {!search.trim() && (
          <div style={{ display: 'flex', gap: '2px', padding: '8px 14px 0', flexWrap: 'wrap' }}>
            {Object.keys(SYMBOL_GROUPS).map(g => (
              <button
                key={g}
                onClick={() => setActiveGroup(g)}
                style={{
                  border: 'none', padding: '4px 12px', borderRadius: '14px',
                  background: activeGroup === g ? '#0078d4' : '#f0f0f0',
                  color: activeGroup === g ? 'white' : '#444',
                  fontSize: '11px', fontWeight: 600, cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >{g}</button>
            ))}
          </div>
        )}

        {/* Recents */}
        {!search.trim() && recents.length > 0 && (
          <div style={{ padding: '10px 14px 0' }}>
            <div style={{ fontSize: '10px', color: '#666', marginBottom: '4px', fontWeight: 600, letterSpacing: '0.4px' }}>RECENT</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
              {recents.map((c, i) => (
                <SymbolBtn key={`r${i}`} char={c} onClick={() => handleInsert(c)} />
              ))}
            </div>
          </div>
        )}

        {/* Main grid */}
        <div style={{ flex: 1, padding: '10px 14px', overflowY: 'auto' }}>
          {visibleSymbols.length === 0 ? (
            <div style={{ color: '#999', fontSize: '12px', textAlign: 'center', padding: '20px' }}>No symbols found</div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(10, 1fr)', gap: '4px' }}>
              {visibleSymbols.map((s, i) => (
                <SymbolBtn key={i} char={s.c} title={s.name} onClick={() => handleInsert(s.c)} />
              ))}
            </div>
          )}
        </div>

        <div style={{ padding: '10px 14px', borderTop: '1px solid #e0e0e0', textAlign: 'right' }}>
          <button
            onClick={onClose}
            style={{
              padding: '6px 16px', borderRadius: '3px', border: '1px solid #c8c8c8',
              background: '#fff', cursor: 'pointer', fontSize: '12px', fontFamily: 'inherit',
            }}
          >Close</button>
        </div>
      </div>
    </div>
  );
}

const SymbolBtn = ({ char, title, onClick }) => (
  <button
    onMouseDown={e => { e.preventDefault(); onClick(); }}
    title={title || char}
    style={{
      width: '100%', aspectRatio: '1', minHeight: '32px',
      background: '#fafafa', border: '1px solid #e0e0e0',
      borderRadius: '3px', cursor: 'pointer',
      fontSize: '18px', color: '#1a1a1a',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: '"Segoe UI Symbol", "Cambria Math", system-ui',
    }}
    onMouseEnter={e => e.currentTarget.style.background = '#e8f0fe'}
    onMouseLeave={e => e.currentTarget.style.background = '#fafafa'}
  >{char}</button>
);
