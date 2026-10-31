import React from 'react';
import { refundPayment } from '../../../api/billing/paymentApi';
import { notifyToast } from '../../../utils/toast';

// Review B6: money in and out of a bill, and a proper refund. A refund is its own
// row (today's date, how it went back, who did it); the original payment stays.
// Money that came from the patient's advance always goes back to the advance.

const MODES = [
  { id: 'CASH', label: 'Cash' },
  { id: 'UPI', label: 'UPI' },
  { id: 'CARD', label: 'Card' },
  { id: 'ADVANCE', label: 'Keep as advance' },
];

const fmtDate = (d) => {
  try { return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }); }
  catch { return ''; }
};

export const RefundPanel = ({ invoice, isOnline, onRefunded }) => {
  const payments = Array.isArray(invoice?.payments) ? invoice.payments : [];
  const collected = Number(invoice?.paidAmount) || 0;
  const [open, setOpen] = React.useState(false);
  const [amount, setAmount] = React.useState('');
  const [mode, setMode] = React.useState('CASH');
  const [reason, setReason] = React.useState('');
  const [busy, setBusy] = React.useState(false);

  if (payments.length === 0 && collected <= 0) return null;
  if (invoice?.status === 'CANCELLED') return null;

  const value = Number(amount) || 0;
  const tooMuch = value > collected + 0.009;
  const canSubmit = isOnline && !busy && value > 0 && !tooMuch && reason.trim().length > 0;

  const submit = async () => {
    if (!canSubmit) return;
    setBusy(true);
    try {
      const res = await refundPayment(invoice.invoiceId, { amount: value, mode, reason: reason.trim() });
      const toWallet = Number(res?.toWallet) || 0;
      notifyToast({
        title: 'Refund recorded',
        message: toWallet > 0 && toWallet < value
          ? `₹${value.toLocaleString()} returned — ₹${toWallet.toLocaleString()} of it went back to the patient's advance.`
          : `₹${value.toLocaleString()} returned${mode === 'ADVANCE' || toWallet >= value ? ' to the patient\'s advance' : ''}.`,
      }, 'success');
      setOpen(false); setAmount(''); setReason('');
      if (onRefunded) onRefunded(res);
    } catch (err) {
      const msg = err?.response?.data?.error || err?.response?.data?.message
        || (err?.response ? 'The refund was not recorded.' : 'No connection — the refund was not recorded.');
      notifyToast({ title: 'Refund not recorded', message: msg }, 'error');
    } finally {
      setBusy(false);
    }
  };

  const label = { fontSize: '9px', fontWeight: 950, color: '#64748b', letterSpacing: '1px', textTransform: 'uppercase' };

  return (
    <div style={{ marginTop: '12px', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '12px', background: 'white' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
        <div style={label}>Payments on this bill</div>
        {collected > 0 && !open && (
          <button type="button" onClick={() => { setAmount(String(collected)); setOpen(true); }}
            style={{ border: '1px solid #fecaca', background: '#fef2f2', color: '#b91c1c', borderRadius: '8px', padding: '4px 10px', fontSize: '10px', fontWeight: 800, cursor: 'pointer' }}>
            Refund…
          </button>
        )}
      </div>

      {payments.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {payments.map(p => {
            const refund = p.kind === 'REFUND' || Number(p.amount) < 0;
            return (
              <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', fontSize: '11px' }}>
                <span style={{ color: '#475569', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {fmtDate(p.createdAt)} · {refund ? 'Refund' : 'Paid'} · {p.method === 'ADVANCE' ? 'advance' : (p.method || '').toLowerCase()}
                  {p.reason ? ` · ${p.reason}` : ''}
                </span>
                <span style={{ fontWeight: 800, color: refund ? '#b91c1c' : '#059669', flexShrink: 0 }}>
                  {refund ? '−' : ''}₹{Math.abs(Number(p.amount) || 0).toLocaleString()}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {open && (
        <div style={{ marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '8px', borderTop: '1px dashed #e2e8f0', paddingTop: '10px' }}>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <div style={{ ...label, flexShrink: 0 }}>Amount ₹</div>
            <input type="number" min="0" step="0.01" value={amount} onChange={e => setAmount(e.target.value)}
              style={{ flex: 1, minWidth: 0, padding: '6px 8px', border: `1px solid ${tooMuch ? '#ef4444' : '#cbd5e1'}`, borderRadius: '8px', fontSize: '12px', fontWeight: 800 }} />
          </div>
          {tooMuch && <div style={{ fontSize: '10px', color: '#b91c1c' }}>Only ₹{collected.toLocaleString()} has been collected on this bill.</div>}
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            {MODES.map(m => (
              <button key={m.id} type="button" onClick={() => setMode(m.id)}
                style={{ padding: '5px 10px', borderRadius: '999px', fontSize: '10px', fontWeight: 800, cursor: 'pointer',
                  border: mode === m.id ? '1px solid #0f52ba' : '1px solid #e2e8f0',
                  background: mode === m.id ? '#eff6ff' : 'white', color: mode === m.id ? '#0f52ba' : '#475569' }}>
                {m.label}
              </button>
            ))}
          </div>
          <input type="text" placeholder="Reason (required)" value={reason} onChange={e => setReason(e.target.value)} maxLength={300}
            style={{ padding: '6px 8px', border: '1px solid #cbd5e1', borderRadius: '8px', fontSize: '11px' }} />
          <div style={{ fontSize: '10px', color: '#64748b' }}>
            Anything this patient paid from their advance goes back to the advance, whichever option you pick.
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button type="button" onClick={() => setOpen(false)} disabled={busy}
              style={{ flex: 1, padding: '9px', borderRadius: '10px', border: '1px solid #e2e8f0', background: 'white', fontSize: '10px', fontWeight: 800, cursor: 'pointer' }}>
              Cancel
            </button>
            <button type="button" onClick={submit} disabled={!canSubmit}
              style={{ flex: 1, padding: '9px', borderRadius: '10px', border: 'none', fontSize: '10px', fontWeight: 900,
                background: canSubmit ? '#b91c1c' : '#fca5a5', color: 'white', cursor: canSubmit ? 'pointer' : 'not-allowed' }}>
              {busy ? 'Recording…' : `Refund ₹${value.toLocaleString()}`}
            </button>
          </div>
          {!isOnline && <div style={{ fontSize: '10px', color: '#b45309' }}>Refunds need a live connection.</div>}
        </div>
      )}
    </div>
  );
};

export default RefundPanel;
