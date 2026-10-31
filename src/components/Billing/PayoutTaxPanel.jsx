import React from 'react';
import { payCommissions } from '../../api/billing/payoutApi';

// Review R10/R12: how the payout is made and the tax deducted from it. The server
// works out TDS from what this partner has already been paid this financial year
// (a dry run — nothing is recorded until the payout is authorised).

const MODES = ['CASH', 'UPI', 'BANK', 'CHEQUE'];
const CATEGORIES = [
  { id: 'COMMISSION', label: 'Commission' },
  { id: 'PROFESSIONAL', label: 'Professional fees' },
  { id: 'NONE', label: 'No TDS' },
];
const money = (n) => `₹${(Math.round((Number(n) || 0) * 100) / 100).toLocaleString('en-IN')}`;
const lbl = { display: 'block', fontSize: '8px', fontWeight: 950, color: '#94a3b8', letterSpacing: '1px', marginBottom: '4px' };
const input = { width: '100%', padding: '9px 12px', borderRadius: '10px', fontSize: '11px', fontWeight: 700, border: '1.5px solid #e2e8f0', outline: 'none', boxSizing: 'border-box', background: 'white' };

export default function PayoutTaxPanel({ commissionIds, netDeficits, payeeName, value, onChange, tdsEnabled = true }) {
  const [preview, setPreview] = React.useState(null);
  const [error, setError] = React.useState('');
  const panOk = !value.pan || /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(value.pan);

  React.useEffect(() => {
    if (!commissionIds?.length || !panOk) { setPreview(null); return undefined; }
    let alive = true;
    const t = setTimeout(async () => {
      try {
        const res = await payCommissions({
          commissionIds, paidBy: 'preview', payeeName: payeeName || 'preview',
          netDeficits, tdsCategory: value.tdsCategory, payeePan: value.pan || null,
          mode: value.mode, reference: value.reference || null, previewOnly: true,
        });
        if (alive) { setPreview(res); setError(''); }
      } catch (e) {
        if (alive) { setPreview(null); setError(e?.response?.data?.message || e?.response?.data?.error || 'Could not work out the tax.'); }
      }
    }, 300);
    return () => { alive = false; clearTimeout(t); };
  }, [commissionIds, netDeficits, payeeName, value.tdsCategory, value.pan, value.mode, value.reference, panOk]);

  const set = (patch) => onChange({ ...value, ...patch });
  const p = preview?.payouts?.[0];

  return (
    <div style={{ border: '1px solid #e2e8f0', borderRadius: '14px', padding: '14px', margin: '0 0 16px', background: '#f8fafc' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
        <div>
          <label style={lbl}>PAID HOW</label>
          <select value={value.mode} onChange={e => set({ mode: e.target.value })} style={input}>
            {MODES.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
        <div>
          <label style={lbl}>REFERENCE (UTR / CHEQUE NO.)</label>
          <input type="text" value={value.reference} maxLength={100} onChange={e => set({ reference: e.target.value })} placeholder="Optional" style={input} />
        </div>
        <div>
          <label style={lbl}>TDS</label>
          {tdsEnabled ? (
            <select value={value.tdsCategory} onChange={e => set({ tdsCategory: e.target.value })} style={input}>
              {CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
          ) : (
            <div style={{ ...input, color: '#64748b', background: '#f1f5f9' }} title="Admin → Tax & billing">Off for this centre</div>
          )}
        </div>
        <div>
          <label style={lbl}>PAYEE PAN</label>
          <input type="text" value={value.pan} maxLength={10} placeholder="ABCDE1234F"
            onChange={e => set({ pan: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '') })}
            style={{ ...input, borderColor: panOk ? '#e2e8f0' : '#ef4444' }} />
        </div>
      </div>

      {error && <div style={{ marginTop: '10px', fontSize: '11px', color: '#b91c1c' }}>{error}</div>}
      {p && (
        <div style={{ marginTop: '12px', fontSize: '11px', color: '#334155', lineHeight: 1.7 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Commission</span><b>{money(p.gross)}</b></div>
          {p.deficitRecovered > 0 && <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Deficit recovered</span><b>− {money(p.deficitRecovered)}</b></div>}
          <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>TDS{p.tdsRate > 0 ? ` @ ${p.tdsRate}%` : ''}</span><b>− {money(p.tdsAmount)}</b></div>
          <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #e2e8f0', marginTop: '4px', paddingTop: '4px', fontSize: '12px' }}>
            <span style={{ fontWeight: 800 }}>Hand over</span><b style={{ color: '#15803d' }}>{money(p.net)}</b>
          </div>
          <div style={{ color: '#64748b', fontSize: '10.5px', marginTop: '4px' }}>{p.tdsNote}</div>
          {(preview.notices || []).map((n, i) => (
            <div key={i} style={{ marginTop: '6px', fontSize: '10.5px', color: '#92400e', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '8px', padding: '6px 8px' }}>{n}</div>
          ))}
        </div>
      )}
    </div>
  );
}
