import React from 'react';
import { t } from '../../i18n';
import { Button, Tag } from '../../components/saral/Saral';
import { C, inr } from '../../components/saral/tokens';
import { fetchBillHistory } from '../../api/billing/moneyApi';
import { billTag, istDate, istTime } from './mnUtil';

/**
 * One bill: its lines, how the total was reached, and its money history (made,
 * each payment with receipt and mode, money given back, credit notes, approvals).
 * Actions: take money, print the bill or a receipt, correct it (via the owner).
 */
const EV_COLOUR = {
  PAYMENT: C.ok, REFUND: C.danger, ADVANCE_HELD: C.primary, CREDIT_NOTE: C.danger, REFUND_VOUCHER: C.danger,
  APPROVAL_ASKED: C.primary, APPROVAL_DONE: C.primary, BILL_MADE: C.ink, CANCELLED: C.muted,
};

function Row({ label, value, strong, colour, note }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, padding: '4px 0', fontSize: strong ? 17 : 15, fontWeight: strong ? 800 : 500, color: colour || C.ink }}>
      <span style={{ flex: 1 }}>{label}{note && <span style={{ display: 'block', fontSize: 13, color: C.faint, fontWeight: 500 }}>{note}</span>}</span>
      <span>{value}</span>
    </div>
  );
}

export default function BillPanel({ bill, ver, canTake, canFix, onTake, onFix, onPrintBill, onPrintReceipt, onClose }) {
  const [h, setH] = React.useState(null);
  const [err, setErr] = React.useState('');
  React.useEffect(() => {
    if (!bill?.invoiceId) return undefined;
    let alive = true;
    setH(null); setErr('');
    fetchBillHistory(bill.invoiceId).then(d => { if (alive) setH(d); }).catch(() => { if (alive) setErr(t('mn.bill.loadFailed')); });
    return () => { alive = false; };
  }, [bill?.invoiceId, ver]);

  if (!bill) return <div style={{ padding: 24, color: C.faint, fontSize: 16 }}>{t('mn.pickBill')}</div>;
  const tag = billTag(h || bill);
  const left = h ? h.balance : bill.balanceAmount;
  const cancelled = String((h || bill).status).toUpperCase() === 'CANCELLED';
  const receipts = h ? [...new Set(h.events.filter(e => e.kind === 'PAYMENT' && e.document).map(e => e.document))] : [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <div style={{ padding: '16px 18px 10px', borderBottom: `1px solid ${C.line}`, display: 'flex', gap: 10, alignItems: 'flex-start' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 21, fontWeight: 800 }}>{bill.patientName}</div>
          <div style={{ fontSize: 14, color: C.faint }}>{bill.displayId} · {istDate(bill.createdAt)} {istTime(bill.createdAt)}</div>
          {h?.partner && <div style={{ fontSize: 14, color: C.muted }}>{t('mn.bill.partner', { name: h.partner })}</div>}
        </div>
        <Tag bg={tag.bg} fg={tag.fg}>{tag.word}</Tag>
        {onClose && (
          <button type="button" onClick={onClose} aria-label="Close"
            style={{ width: 40, height: 40, borderRadius: 10, border: 'none', background: '#F3F4F6', cursor: 'pointer', fontSize: 20 }}>×</button>
        )}
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 18px', display: 'grid', gridAutoRows: 'max-content', gap: 16, alignContent: 'start' }}>
        {err && <div role="alert" style={{ color: C.danger, fontWeight: 700 }}>{err}</div>}
        <div>
          {(h?.lines || bill.items || []).map((l, i) => (
            <Row key={i} label={l.description} value={l.isFree ? t('mn.tag.free') : inr(l.amount * (l.quantity || 1))} />
          ))}
          {h && (
            <div style={{ borderTop: `1px dashed ${C.line}`, marginTop: 6, paddingTop: 6 }}>
              {h.extraCharges > 0 && <Row label={t('mn.bill.extra')} value={inr(h.extraCharges)} />}
              {h.centreDiscount > 0 && (
                <Row label={t('mn.bill.discount')} value={`−${inr(h.centreDiscount)}`}
                  note={[h.discountReason && t('mn.bill.reason', { reason: h.discountReason }), h.discountBy && t('mn.bill.by', { name: h.discountBy })].filter(Boolean).join(' · ')} />
              )}
              {h.referrerDiscount > 0 && <Row label={t('mn.bill.partnerDisc')} value={`−${inr(h.referrerDiscount)}`} />}
              {h.deduction > 0 && <Row label={t('mn.bill.deduction')} value={`−${inr(h.deduction)}`} />}
              <Row label={t('mn.bill.total')} value={inr(h.total)} strong />
              {h.paid > 0 && <Row label={t('mn.bill.paid')} value={inr(h.paid)} colour={C.ok} />}
              {h.balance > 0.009 && <Row label={t('mn.bill.left')} value={inr(h.balance)} strong colour={C.due} />}
            </div>
          )}
        </div>

        <div>
          <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: 1, color: C.faint, marginBottom: 6 }}>{t('mn.bill.history').toUpperCase()}</div>
          {!h && !err && <div style={{ color: C.faint }}>…</div>}
          {h && h.events.map((e, i) => {
            const mode = e.mode ? String(e.mode).split(',').map(m => { const k = m.trim().toLowerCase(); return ['cash', 'upi', 'card', 'bank'].includes(k) ? t(`mn.pay.${k}`) : m.trim(); }).join(', ') : null;
            const extra = [mode, e.reference, e.document, e.by].filter(Boolean).join(' · ');
            const verdict = e.kind === 'APPROVAL_DONE' ? ` — ${String(e.document).toUpperCase() === 'APPROVED' ? t('mn.ev.approved') : t('mn.ev.rejected')}` : '';
            return (
              <div key={i} style={{ display: 'flex', gap: 10, padding: '7px 0', borderBottom: `1px solid #F3F4F6` }}>
                <span style={{ width: 8, height: 8, borderRadius: 4, marginTop: 8, background: EV_COLOUR[e.kind] || C.ink, flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 700 }}>{t(`mn.ev.${e.kind}`)}{verdict}</div>
                  <div style={{ fontSize: 13, color: C.faint }}>{istDate(e.at)} {istTime(e.at)}{extra && e.kind !== 'APPROVAL_DONE' ? ` · ${extra}` : e.by ? ` · ${e.by}` : ''}</div>
                  {e.note && e.kind !== 'BILL_MADE' && <div style={{ fontSize: 13, color: C.muted }}>{e.note}</div>}
                </div>
                {Math.abs(e.amount) > 0.009 && (
                  <span style={{ fontSize: 15, fontWeight: 800, color: EV_COLOUR[e.kind] || C.ink, whiteSpace: 'nowrap' }}>
                    {e.kind === 'REFUND' || e.kind === 'CREDIT_NOTE' || e.kind === 'REFUND_VOUCHER' ? `−${inr(Math.abs(e.amount))}` : inr(e.amount)}
                  </span>
                )}
              </div>
            );
          })}
        </div>
        {h?.hasMoney && <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.5, background: C.ground, borderRadius: 12, padding: '10px 12px' }}>{t('mn.bill.locked')}</div>}
      </div>

      <div style={{ padding: '12px 18px', borderTop: `1px solid ${C.line}`, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {canTake && !cancelled && left > 0.009 && (
          <Button kind="money" onClick={() => onTake?.(h)} style={{ flex: '1 1 160px' }}>{t('mn.bill.collect', { amount: inr(left) })}</Button>
        )}
        <Button kind="quiet" icon="print" onClick={() => onPrintBill?.()}>{t('mn.bill.print')}</Button>
        {receipts.length > 0 && <Button kind="quiet" icon="print" onClick={() => onPrintReceipt?.()}>{t('mn.bill.receipt')}</Button>}
        {canFix && h?.hasMoney && !cancelled && <Button kind="outline" onClick={() => onFix?.(h)}>{t('mn.bill.correct')}</Button>}
      </div>
    </div>
  );
}
