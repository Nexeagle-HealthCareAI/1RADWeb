import React from 'react';
import { t } from '../../i18n';
import { Button, Sheet } from '../../components/saral/Saral';
import { C, inr } from '../../components/saral/tokens';
import { apiError, fieldStyle } from '../../components/saral/formUtil';
import { askOwner } from '../../api/billing/moneyApi';

/**
 * "Correct this bill": a bill that has money on it is never edited. The person asks
 * the owner to lower it by an amount, with a reason. When the owner approves
 * (Approvals), the discount is applied, a credit note is issued and anything paid
 * above the new total goes back the way the owner picks.
 */
export default function FixSheet({ open, bill, onClose, onDone }) {
  const [amount, setAmount] = React.useState('');
  const [reason, setReason] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState('');
  React.useEffect(() => { if (open) { setAmount(''); setReason(''); setErr(''); } }, [open]);
  if (!bill) return null;

  const total = Number(bill.total ?? bill.totalAmount) || 0;
  const off = Math.min(total, Math.max(0, Math.round((Number(amount) || 0) * 100) / 100));
  const ok = off > 0.009 && reason.trim().length >= 3 && !busy;

  const send = async () => {
    if (!ok) return;
    setBusy(true); setErr('');
    try {
      await askOwner({
        bill: { invoiceId: bill.id, displayId: bill.number, patientName: bill.patientName, referrerDiscount: bill.referrerDiscount, deduction: bill.deduction },
        centreDiscount: (Number(bill.centreDiscount) || 0) + off,
        reason: reason.trim(),
        title: `${bill.number} · ${bill.patientName || ''} · −${inr(off)}`,
      });
      onDone?.();
    } catch (e) { setErr(apiError(e) || t('mn.fix.failed')); } finally { setBusy(false); }
  };

  return (
    <Sheet open={open} onClose={busy ? undefined : onClose} title={t('mn.fix.title', { no: bill.number })}
      footer={(
        <div style={{ display: 'grid', gap: 8 }}>
          {err && <div role="alert" style={{ color: C.danger, fontWeight: 700 }}>{err}</div>}
          <Button kind="primary" size="lg" onClick={send} disabled={!ok}>{t('mn.fix.send')}</Button>
        </div>
      )}>
      <div style={{ display: 'grid', gap: 14 }}>
        <div style={{ fontSize: 15, color: C.muted, lineHeight: 1.5 }}>{t('mn.fix.help')}</div>
        <label style={{ display: 'grid', gap: 6 }}>
          <span style={{ fontSize: 16, fontWeight: 700 }}>{t('mn.fix.amount')}</span>
          <input inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value.replace(/[^\d.]/g, ''))} style={fieldStyle} />
          {off > 0 && <span style={{ fontSize: 15, color: C.muted }}>{t('mn.fix.newTotal', { amount: inr(total - off) })}</span>}
        </label>
        <label style={{ display: 'grid', gap: 6 }}>
          <span style={{ fontSize: 16, fontWeight: 700 }}>{t('mn.fix.reason')}</span>
          <textarea value={reason} onChange={e => setReason(e.target.value.slice(0, 300))} rows={3}
            style={{ ...fieldStyle, height: 'auto', padding: 12, resize: 'vertical' }} />
        </label>
      </div>
    </Sheet>
  );
}
