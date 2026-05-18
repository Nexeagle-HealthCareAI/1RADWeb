import React, { useState, useRef, useEffect } from 'react';

const UNITS = ['cm', 'mm', 'HU', 'mL', 'SUV', 'mm Hg', 'mSv', 'mg/dL', 'g', 'kg', 'IU/mL'];

const OVL = {
  position: 'fixed', inset: 0,
  background: 'rgba(0,0,0,0.45)',
  zIndex: 1000,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  fontFamily: '"Segoe UI", system-ui, sans-serif',
};

const inputStyle = {
  width: '72px', padding: '6px 8px',
  border: '1px solid #d1d5db', borderRadius: '4px',
  fontSize: '13px', textAlign: 'center', fontFamily: 'inherit',
};

const SEP = <span style={{ fontSize: '16px', color: '#9ca3af', alignSelf: 'center', margin: '0 2px' }}>×</span>;

/**
 * MeasurementDialog — format and insert a clinical measurement string.
 *
 * Produces output like: `1.2 × 0.8 × 0.6 cm` or `45 HU` or `1.8 cm (SI)`
 *
 * Props:
 *   open      {boolean}
 *   onInsert  {fn(text)} — insert formatted text at cursor
 *   onClose   {fn()}
 */
export default function MeasurementDialog({ open, onInsert, onClose }) {
  const [v1, setV1]   = useState('');
  const [v2, setV2]   = useState('');
  const [v3, setV3]   = useState('');
  const [unit, setUnit] = useState('cm');
  const [label, setLabel] = useState('');
  const [siNote, setSiNote] = useState(false);
  const ref1 = useRef(null);

  useEffect(() => {
    if (open) {
      setV1(''); setV2(''); setV3('');
      setUnit('cm'); setLabel(''); setSiNote(false);
      setTimeout(() => ref1.current?.focus(), 50);
    }
  }, [open]);

  if (!open) return null;

  // Build the formatted measurement string
  const dims = [v1, v2, v3].filter(v => v.trim());
  const dimStr = dims.join(' × ');
  const preview = [
    label.trim() ? `${label.trim()}: ` : '',
    dimStr,
    dimStr ? ` ${unit}` : '',
    siNote ? ' (SI)' : '',
  ].join('');

  const canInsert = dims.length > 0;

  const handleInsert = () => {
    if (!canInsert) return;
    onInsert(preview.trim());
    onClose();
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') { onClose(); return; }
    if (e.key === 'Enter' && canInsert) handleInsert();
  };

  return (
    <div style={OVL} onClick={onClose} onKeyDown={handleKeyDown}>
      <div
        style={{
          background: '#fff', borderRadius: '8px',
          boxShadow: '0 24px 64px rgba(0,0,0,0.22)',
          width: '420px', maxWidth: '96vw',
          overflow: 'hidden',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ padding: '16px 20px 12px', borderBottom: '1px solid #e5e7eb', background: '#f8f9fa', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: '14px', color: '#111827' }}>📏 Insert Measurement</div>
            <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '2px' }}>Format and insert a clinical measurement value</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer', color: '#6b7280' }}>✕</button>
        </div>

        {/* Body */}
        <div style={{ padding: '18px 20px' }}>

          {/* Optional label */}
          <div style={{ marginBottom: '14px' }}>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#374151', marginBottom: '4px' }}>
              Label (optional, e.g. "Lesion", "Nodule", "Liver")
            </label>
            <input
              type="text"
              value={label}
              onChange={e => setLabel(e.target.value)}
              placeholder="Leave blank for no label"
              style={{ width: '100%', boxSizing: 'border-box', ...inputStyle, width: '100%', textAlign: 'left' }}
            />
          </div>

          {/* Dimensions row */}
          <div style={{ marginBottom: '14px' }}>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#374151', marginBottom: '6px' }}>
              Dimensions (fill 1–3 values)
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <input ref={ref1} type="text" value={v1} onChange={e => setV1(e.target.value)} placeholder="e.g. 1.2" style={inputStyle} />
              {SEP}
              <input type="text" value={v2} onChange={e => setV2(e.target.value)} placeholder="0.8" style={inputStyle} />
              {SEP}
              <input type="text" value={v3} onChange={e => setV3(e.target.value)} placeholder="0.6" style={inputStyle} />
              <select
                value={unit}
                onChange={e => setUnit(e.target.value)}
                style={{ marginLeft: '8px', padding: '6px 8px', border: '1px solid #d1d5db', borderRadius: '4px', fontSize: '13px', fontFamily: 'inherit' }}
              >
                {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
          </div>

          {/* SI note */}
          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#374151', cursor: 'pointer', marginBottom: '16px' }}>
            <input type="checkbox" checked={siNote} onChange={e => setSiNote(e.target.checked)} style={{ accentColor: '#2563eb' }} />
            Append "(SI)" note
          </label>

          {/* Preview */}
          <div style={{
            background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: '5px',
            padding: '10px 14px', fontSize: '14px', fontWeight: 500,
            color: '#0c4a6e', letterSpacing: '0.01em', minHeight: '40px',
            display: 'flex', alignItems: 'center',
          }}>
            {preview.trim() || <span style={{ color: '#94a3b8', fontWeight: 400 }}>Enter values above to preview</span>}
          </div>
        </div>

        {/* Footer */}
        <div style={{ padding: '12px 20px', borderTop: '1px solid #e5e7eb', display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ padding: '7px 16px', border: '1px solid #d1d5db', background: '#fff', borderRadius: '5px', cursor: 'pointer', fontSize: '12px', fontFamily: 'inherit' }}>
            Cancel
          </button>
          <button
            disabled={!canInsert}
            onClick={handleInsert}
            style={{
              padding: '7px 20px',
              border: '1px solid #1d4ed8',
              background: canInsert ? '#2563eb' : '#93c5fd',
              color: '#fff', borderRadius: '5px',
              cursor: canInsert ? 'pointer' : 'not-allowed',
              fontSize: '12px', fontWeight: 600, fontFamily: 'inherit',
            }}
          >
            Insert
          </button>
        </div>
      </div>
    </div>
  );
}
