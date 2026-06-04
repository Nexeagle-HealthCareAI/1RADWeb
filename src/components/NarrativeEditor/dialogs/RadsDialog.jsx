import React, { useMemo, useState } from 'react';
import { CATEGORY_SYSTEMS, TIRADS, tiradsLevel, tiradsRecommendation } from '../data/radsTemplates';

// Structured RADS assistant. Tabs across the systems; TI-RADS is a live points
// calculator, the others are category pickers. Both produce a standardized
// assessment block the radiologist inserts into the report.
const SYSTEMS = [
  { id: 'TIRADS', label: TIRADS.label },
  { id: 'BIRADS', label: CATEGORY_SYSTEMS.BIRADS.label },
  { id: 'LUNGRADS', label: CATEGORY_SYSTEMS.LUNGRADS.label },
  { id: 'PIRADS', label: CATEGORY_SYSTEMS.PIRADS.label },
  { id: 'LIRADS', label: CATEGORY_SYSTEMS.LIRADS.label },
];

const overlay = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' };
const box = { background: '#fff', borderRadius: '10px', boxShadow: '0 24px 64px rgba(0,0,0,0.24)', width: '720px', maxWidth: '96vw', maxHeight: '90vh', display: 'flex', flexDirection: 'column', fontFamily: '"Segoe UI", system-ui, sans-serif', overflow: 'hidden' };

export default function RadsDialog({ open, onClose, onInsert }) {
  const [system, setSystem] = useState('TIRADS');
  // TI-RADS state
  const [picks, setPicks] = useState({}); // groupKey -> option label (or {label:true} for multi)
  const [sizeMm, setSizeMm] = useState('');
  // Category-pick state
  const [catCode, setCatCode] = useState(null);

  const tirads = useMemo(() => {
    let points = 0;
    for (const g of TIRADS.groups) {
      if (g.multi) {
        const sel = picks[g.key] || {};
        for (const o of g.options) if (sel[o.label]) points += o.pts;
      } else {
        const o = g.options.find((x) => x.label === picks[g.key]);
        if (o) points += o.pts;
      }
    }
    const { tr, risk } = tiradsLevel(points);
    return { points, tr, risk, rec: tiradsRecommendation(tr, sizeMm) };
  }, [picks, sizeMm]);

  if (!open) return null;

  const reset = () => { setPicks({}); setSizeMm(''); setCatCode(null); };
  const switchSystem = (id) => { setSystem(id); reset(); };

  // Build the HTML block to insert.
  const buildHtml = () => {
    if (system === 'TIRADS') {
      const feat = TIRADS.groups
        .map((g) => {
          if (g.multi) {
            const sel = picks[g.key] || {};
            const chosen = g.options.filter((o) => sel[o.label]).map((o) => o.label);
            return chosen.length ? `${g.label}: ${chosen.join(', ')}` : null;
          }
          return picks[g.key] ? `${g.label}: ${picks[g.key]}` : null;
        })
        .filter(Boolean);
      const sizeLine = sizeMm ? ` Nodule size ${sizeMm} mm.` : '';
      return `<p><strong>ACR TI-RADS: ${tirads.tr}</strong> (${tirads.points} points — ${tirads.risk}).${sizeLine}</p>`
        + (feat.length ? `<p>${feat.join('; ')}.</p>` : '')
        + `<p><em>Recommendation:</em> ${tirads.rec}</p>`;
    }
    const sys = CATEGORY_SYSTEMS[system];
    const cat = sys.categories.find((c) => c.code === catCode);
    if (!cat) return '';
    const tag = sys.label.split(' ')[0];
    return `<p><strong>${tag} ${cat.code}</strong> — ${cat.assessment}</p>`
      + `<p><em>Recommendation:</em> ${cat.management}</p>`;
  };

  const canInsert = system === 'TIRADS'
    ? Object.keys(picks).length > 0
    : !!catCode;

  const doInsert = () => {
    const html = buildHtml();
    if (html) { onInsert?.(html); onClose?.(); reset(); }
  };

  const sys = system !== 'TIRADS' ? CATEGORY_SYSTEMS[system] : null;

  return (
    <div style={overlay} onMouseDown={onClose}>
      <div style={box} onMouseDown={(e) => e.stopPropagation()}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: '15px', fontWeight: 800, color: '#0f172a' }}>Structured Reporting (RADS)</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer', color: '#64748b' }}>✕</button>
        </div>

        {/* System tabs */}
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', padding: '12px 20px', borderBottom: '1px solid #f1f5f9' }}>
          {SYSTEMS.map((s) => (
            <button key={s.id} onClick={() => switchSystem(s.id)}
              style={{ padding: '7px 12px', borderRadius: '8px', fontSize: '12px', fontWeight: 700, cursor: 'pointer',
                border: `1.5px solid ${system === s.id ? '#0f52ba' : '#e2e8f0'}`,
                background: system === s.id ? '#eff6ff' : 'white', color: system === s.id ? '#0f52ba' : '#475569' }}>
              {s.label}
            </button>
          ))}
        </div>

        <div style={{ padding: '16px 20px', overflowY: 'auto', flex: 1 }}>
          {system === 'TIRADS' ? (
            <>
              {TIRADS.groups.map((g) => (
                <div key={g.key} style={{ marginBottom: '14px' }}>
                  <div style={{ fontSize: '11px', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px' }}>{g.label}</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                    {g.options.map((o) => {
                      const active = g.multi ? !!(picks[g.key]?.[o.label]) : picks[g.key] === o.label;
                      return (
                        <button key={o.label}
                          onClick={() => setPicks((p) => {
                            if (g.multi) {
                              const cur = { ...(p[g.key] || {}) };
                              cur[o.label] = !cur[o.label];
                              return { ...p, [g.key]: cur };
                            }
                            return { ...p, [g.key]: o.label };
                          })}
                          style={{ padding: '6px 10px', borderRadius: '7px', fontSize: '12px', fontWeight: 600, cursor: 'pointer',
                            border: `1.5px solid ${active ? '#0f52ba' : '#e2e8f0'}`,
                            background: active ? '#0f52ba' : 'white', color: active ? 'white' : '#334155' }}>
                          {o.label} <span style={{ opacity: 0.6 }}>+{o.pts}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
              <div style={{ marginBottom: '6px' }}>
                <span style={{ fontSize: '12px', fontWeight: 700, color: '#475569', marginRight: '8px' }}>Nodule size (mm):</span>
                <input type="number" value={sizeMm} onChange={(e) => setSizeMm(e.target.value)} min="0"
                  style={{ width: '90px', padding: '6px 8px', borderRadius: '7px', border: '1px solid #cbd5e1', fontSize: '13px' }} />
              </div>
            </>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {sys.categories.map((c) => (
                <button key={c.code} onClick={() => setCatCode(c.code)}
                  style={{ textAlign: 'left', padding: '10px 12px', borderRadius: '8px', cursor: 'pointer',
                    border: `1.5px solid ${catCode === c.code ? '#0f52ba' : '#e2e8f0'}`,
                    background: catCode === c.code ? '#eff6ff' : 'white' }}>
                  <div style={{ fontSize: '13px', fontWeight: 800, color: '#0f172a' }}>{sys.label.split(' ')[0]} {c.code} · {c.label}</div>
                  <div style={{ fontSize: '11px', color: '#475569', marginTop: '2px' }}>{c.assessment}</div>
                </button>
              ))}
            </div>
          )}

          {/* Live preview */}
          {canInsert && (
            <div style={{ marginTop: '14px', padding: '12px 14px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px' }}>
              <div style={{ fontSize: '10px', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px' }}>Preview</div>
              <div style={{ fontSize: '13px', color: '#1e293b' }} dangerouslySetInnerHTML={{ __html: buildHtml() }} />
            </div>
          )}

          <div style={{ marginTop: '12px', fontSize: '10px', color: '#94a3b8', fontStyle: 'italic' }}>
            A drafting aid — verify the category and recommendation against current ACR/standard criteria.
          </div>
        </div>

        <div style={{ padding: '12px 20px', borderTop: '1px solid #e5e7eb', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
          <button onClick={onClose} style={{ padding: '9px 16px', borderRadius: '8px', border: '1px solid #e2e8f0', background: 'white', fontSize: '12px', fontWeight: 700, cursor: 'pointer', color: '#475569' }}>Cancel</button>
          <button onClick={doInsert} disabled={!canInsert}
            style={{ padding: '9px 18px', borderRadius: '8px', border: 'none', fontSize: '12px', fontWeight: 800, cursor: canInsert ? 'pointer' : 'not-allowed',
              background: canInsert ? '#0f52ba' : '#cbd5e1', color: 'white' }}>
            Insert into report
          </button>
        </div>
      </div>
    </div>
  );
}
