import React from 'react';
import { fetchCreditNotes, downloadGstr1 } from '../../api/billing/creditNotesApi';
import { printCreditNote } from '../../utils/billing/printHandlers';
import { istDate } from '../../utils/billing/gst';
import { istTodayYmd, shiftYmd } from '../../utils/istClock';
import { notifyToast } from '../../utils/toast';

// Review B6/B10: credit notes (a paid bill lowered, made free or cancelled) and refund
// vouchers (money returned, bill unchanged). The server raises them automatically
// whenever a bill changes; this lists and prints them, and downloads the month's
// GSTR-1 working sheet for the accountant.

const money = (n) => `₹${(Number(n) || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const card = { background: 'white', border: '1px solid #e2e8f0', borderRadius: '14px', padding: '16px' };
const label = { fontSize: '10px', fontWeight: 800, color: '#64748b', letterSpacing: '0.6px', textTransform: 'uppercase' };
const input = { padding: '7px 10px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '13px' };
const btn = { padding: '7px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', background: 'white', fontSize: '12px', fontWeight: 700, cursor: 'pointer' };

const errorText = async (e, fallback) => {
  const data = e?.response?.data;
  if (data instanceof Blob) {
    try { const j = JSON.parse(await data.text()); return j.message || j.error || fallback; } catch { return fallback; }
  }
  if (e?.response?.status === 403) return 'Only finance roles can download the GST return sheet.';
  return data?.message || data?.error || fallback;
};

export default function CreditNotesHub({ isMobile, isOnline, activeCenter, taxProfile }) {
  const today = istTodayYmd();
  const [from, setFrom] = React.useState(shiftYmd(today, -30));
  const [to, setTo] = React.useState(today);
  const [rows, setRows] = React.useState([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState('');
  const [month, setMonth] = React.useState(shiftYmd(`${today.slice(0, 7)}-01`, -1).slice(0, 7)); // last month
  const [downloading, setDownloading] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true); setError('');
    try { setRows(await fetchCreditNotes({ from, to })); }
    catch (e) { setError(await errorText(e, 'Could not load credit notes.')); }
    finally { setLoading(false); }
  }, [from, to]);

  React.useEffect(() => { if (isOnline !== false) load(); }, [load, isOnline]);

  const getGstr1 = async () => {
    setDownloading(true);
    try {
      const { blob, name } = await downloadGstr1(month);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    } catch (e) {
      notifyToast({ title: 'GSTR-1 not downloaded', message: await errorText(e, 'Please try again.') }, 'error');
    } finally { setDownloading(false); }
  };

  const cns = rows.filter(r => r.kind === 'CREDIT_NOTE');
  const rvs = rows.filter(r => r.kind !== 'CREDIT_NOTE');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', padding: isMobile ? '12px 16px' : 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
        <div style={{ fontSize: '16px', fontWeight: 800, color: '#0f172a' }}>Credit notes</div>
        <input type="date" value={from} max={to} onChange={e => setFrom(e.target.value)} style={input} />
        <span style={{ color: '#94a3b8' }}>to</span>
        <input type="date" value={to} min={from} max={today} onChange={e => setTo(e.target.value)} style={input} />
        <button type="button" onClick={load} disabled={loading} style={btn}>{loading ? 'Loading…' : 'Refresh'}</button>
        <div style={{ flex: 1 }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={label}>GSTR-1</span>
          <input type="month" value={month} max={today.slice(0, 7)} onChange={e => setMonth(e.target.value)} style={input} />
          <button type="button" onClick={getGstr1} disabled={downloading || !month || isOnline === false}
            style={{ ...btn, background: '#0f52ba', color: 'white', border: 'none' }}>
            {downloading ? 'Preparing…' : 'Download sheet'}
          </button>
        </div>
      </div>
      <div style={{ fontSize: '11px', color: '#64748b' }}>
        Raised automatically when a paid bill is lowered, made free or cancelled (credit note), or money is returned on a bill whose value didn&apos;t change (refund voucher).
      </div>

      {error && <div style={{ ...card, borderColor: '#fecaca', color: '#b91c1c', fontSize: '12px' }}>{error}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(3, 1fr)', gap: '10px' }}>
        <div style={card}><div style={label}>Credit notes</div><div style={{ fontSize: '20px', fontWeight: 900, marginTop: 4 }}>{cns.length}</div><div style={{ fontSize: 11, color: '#64748b' }}>{money(cns.reduce((s, r) => s + r.amount, 0))}</div></div>
        <div style={card}><div style={label}>Refund vouchers</div><div style={{ fontSize: '20px', fontWeight: 900, marginTop: 4 }}>{rvs.length}</div><div style={{ fontSize: 11, color: '#64748b' }}>{money(rvs.reduce((s, r) => s + r.amount, 0))}</div></div>
        <div style={card}><div style={label}>Money returned</div><div style={{ fontSize: '20px', fontWeight: 900, marginTop: 4 }}>{money(rows.reduce((s, r) => s + (r.refundedAmount || 0), 0))}</div></div>
      </div>

      <div style={{ ...card, padding: 0, overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', minWidth: '720px' }}>
          <thead>
            <tr style={{ background: '#f8fafc', textAlign: 'left' }}>
              {['Number', 'Date', 'Bill', 'Patient', 'Reason', 'Value', 'Returned', ''].map(h => (
                <th key={h} style={{ padding: '10px 12px', ...label, textAlign: h === 'Value' || h === 'Returned' ? 'right' : 'left' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && !loading && (
              <tr><td colSpan={8} style={{ padding: '16px', color: '#64748b', textAlign: 'center' }}>None in these dates.</td></tr>
            )}
            {rows.map(r => (
              <tr key={r.id} style={{ borderTop: '1px solid #f1f5f9' }}>
                <td style={{ padding: '8px 12px', fontWeight: 800 }}>
                  {r.number}
                  <div style={{ fontSize: 10, fontWeight: 700, color: r.kind === 'CREDIT_NOTE' ? '#0f52ba' : '#92400e' }}>{r.kind === 'CREDIT_NOTE' ? 'Credit note' : 'Refund voucher'}</div>
                </td>
                <td style={{ padding: '8px 12px', color: '#64748b' }}>{istDate(r.createdAt)}</td>
                <td style={{ padding: '8px 12px' }}>{r.invoiceNumber}</td>
                <td style={{ padding: '8px 12px' }}>{r.patientName || '—'}</td>
                <td style={{ padding: '8px 12px', color: '#475569', maxWidth: 280 }}>{r.reason}</td>
                <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 800 }}>{money(r.amount)}</td>
                <td style={{ padding: '8px 12px', textAlign: 'right' }}>{r.refundedAmount > 0 ? `${money(r.refundedAmount)}${r.refundModes ? ` · ${r.refundModes}` : ''}` : '—'}</td>
                <td style={{ padding: '8px 12px' }}>
                  <button type="button" style={btn} onClick={() => printCreditNote(r, { activeCenter, taxProfile })}>Print</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
