import React from 'react';
import { t } from '../../i18n';
import { Button, Chip, Sheet } from '../../components/saral/Saral';
import { C, inr } from '../../components/saral/tokens';
import { apiError, fieldStyle } from '../../components/saral/formUtil';
import { askOwner, takePayment } from '../../api/billing/moneyApi';
import { balanceOf, discountLimitPercent, newKey } from './mnUtil';

/**
 * Take money on one bill (Money ▸ Collect).
 *  • Discount: % chips or ₹, with a reason. Within the person's limit it is applied
 *    with the payment; above it, "Send to owner" raises an approval instead (the
 *    full amount can still be taken now).
 *  • Paid with: one or more parts (cash + UPI …), each with a reference for non-cash.
 *  • Cash: "Patient gave" works out the change, or keeps the extra as advance.
 * One request to the server, so the parts share one receipt number.
 */
const MODES = ['CASH', 'UPI', 'CARD', 'BANK'];
const modeWord = (m) => t(`mn.pay.${m.toLowerCase()}`);
const REASONS = ['senior', 'staff', 'regular', 'camp', 'doctor', 'other'];
const PCTS = [0, 5, 10, 15, 20];
const num = (v) => Math.max(0, Math.round((Number(String(v).replace(/[^\d.]/g, '')) || 0) * 100) / 100);

export default function CollectSheet({ open, bill, role, settings, onClose, onDone }) {
  const gross = Number(bill?.grossAmount) || 0;
  const already = Number(bill?.centreDiscount) || 0;
  const otherOff = (Number(bill?.referrerDiscount) || 0) + (Number(bill?.institutionalDeduction) || 0);
  const paid = Number(bill?.paidAmount) || 0;
  const hasMoney = paid > 0.009;
  const limitPct = discountLimitPercent(role, settings);
  const limitRs = limitPct == null ? Infinity : Math.round(gross * limitPct) / 100;
  // A discount always needs a reason here (Money ▸ Setup rule); the server enforces it
  // only when the centre switches DiscountReasonRequired on, so older screens keep working.

  const [disc, setDisc] = React.useState(already);
  const [reasonKey, setReasonKey] = React.useState('');
  const [reasonText, setReasonText] = React.useState('');
  const [parts, setParts] = React.useState([]);
  const [gave, setGave] = React.useState('');
  const [keepAdvance, setKeepAdvance] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState('');
  const key = React.useRef(newKey());

  const total = Math.max(0, Math.round((gross - disc - otherOff) * 100) / 100);
  const due = Math.max(0, Math.round((total - paid) * 100) / 100);

  // Fresh form each time a bill is opened: one cash part for what is due.
  React.useEffect(() => {
    if (!open || !bill) return;
    setDisc(Number(bill.centreDiscount) || 0);
    setReasonKey(''); setReasonText(''); setGave(''); setKeepAdvance(false); setErr('');
    setParts([{ mode: 'CASH', amount: String(balanceOf(bill)), ref: '' }]);
    key.current = newKey();
  }, [open, bill?.invoiceId]); // eslint-disable-line react-hooks/exhaustive-deps

  // When the discount changes, a single part follows what is due.
  React.useEffect(() => {
    setParts(p => (p.length === 1 ? [{ ...p[0], amount: String(due) }] : p));
  }, [due]);

  if (!bill) return null;
  const raised = disc > already + 0.009;
  const above = raised && disc > limitRs + 0.009;
  const reason = reasonKey === 'other' ? reasonText.trim() : reasonKey ? t(`mn.pay.r.${reasonKey}`) : '';
  const taking = parts.reduce((a, p) => a + num(p.amount), 0);
  const cashPart = parts.filter(p => p.mode === 'CASH').reduce((a, p) => a + num(p.amount), 0);
  const gaveN = num(gave);
  const change = cashPart > 0 && gaveN > cashPart ? Math.round((gaveN - cashPart) * 100) / 100 : 0;
  const extraAdvance = keepAdvance ? change : 0;
  const over = taking > due + 0.009;
  const needReason = raised && !reason;
  const canTake = !busy && !above && !over && !needReason && (taking > 0.009 || (due <= 0.009 && raised));

  const setPart = (i, patch) => setParts(ps => ps.map((p, j) => (j === i ? { ...p, ...patch } : p)));
  const addPart = () => setParts(ps => {
    const used = new Set(ps.map(p => p.mode));
    const mode = MODES.find(m => !used.has(m)) || 'UPI';
    const rest = Math.max(0, Math.round((due - ps.reduce((a, p) => a + num(p.amount), 0)) * 100) / 100);
    return [...ps, { mode, amount: String(rest), ref: '' }];
  });
  const removePart = (i) => setParts(ps => ps.filter((_, j) => j !== i));

  const take = async () => {
    if (!canTake) { if (needReason) setErr(t('mn.pay.needReason')); return; }
    setBusy(true); setErr('');
    try {
      const tenders = parts.filter(p => num(p.amount) > 0)
        .map(p => ({ mode: p.mode, amount: num(p.amount), reference: p.mode === 'CASH' ? null : (p.ref.trim() || null) }));
      if (extraAdvance > 0) {
        const c = tenders.find(x => x.mode === 'CASH');
        if (c) c.amount = Math.round((c.amount + extraAdvance) * 100) / 100;
      }
      await takePayment({
        invoiceId: bill.invoiceId,
        tenders,
        centreDiscount: raised || disc !== already ? disc : null,
        discountReason: raised ? reason : null,
        rowVersion: bill.rowVersion,
      }, key.current);
      onDone?.({ amount: tenders.reduce((a, x) => a + x.amount, 0) });
    } catch (e) {
      setErr(apiError(e) || t('mn.pay.failed'));
      key.current = newKey();
    } finally { setBusy(false); }
  };

  const sendToOwner = async () => {
    if (!reason) { setErr(t('mn.pay.needReason')); return; }
    setBusy(true); setErr('');
    try {
      await askOwner({ bill, centreDiscount: disc, reason });
      onDone?.({ asked: true });
    } catch (e) { setErr(apiError(e) || t('mn.fix.failed')); } finally { setBusy(false); }
  };

  const lab = { fontSize: 13, fontWeight: 800, letterSpacing: 1, color: C.faint, textTransform: 'uppercase' };
  const pctOf = gross > 0 ? Math.round((disc / gross) * 1000) / 10 : 0;

  return (
    <Sheet open={open} onClose={busy ? undefined : onClose} title={`${t('mn.pay.title')} · ${bill.displayId}`} wide
      footer={(
        <div style={{ display: 'grid', gap: 8 }}>
          {err && <div role="alert" style={{ color: C.danger, fontWeight: 700, fontSize: 15 }}>{err}</div>}
          {above ? (
            <>
              <Button kind="primary" size="lg" onClick={sendToOwner} disabled={busy}>{t('mn.pay.ask', { amount: inr(disc) })}</Button>
              <Button kind="quiet" onClick={() => setDisc(already)} disabled={busy}>{t('mn.pay.take', { amount: inr(Math.max(0, gross - already - otherOff - paid)) })}</Button>
            </>
          ) : (
            <Button kind="ok" size="lg" onClick={take} disabled={!canTake}>
              {t('mn.pay.take', { amount: inr(taking + extraAdvance) })}
            </Button>
          )}
        </div>
      )}>
      <div style={{ display: 'grid', gap: 16 }}>
        {/* Who and what */}
        <div style={{ background: 'white', borderRadius: 16, padding: '12px 14px', border: `1px solid ${C.line}` }}>
          <div style={{ fontSize: 19, fontWeight: 800 }}>{bill.patientName}</div>
          {(bill.items || []).map((it, i) => (
            <div key={i} style={{ display: 'flex', fontSize: 15, color: C.muted, padding: '2px 0' }}>
              <span style={{ flex: 1 }}>{it.description}{it.isFree ? ` · ${t('mn.tag.free')}` : ''}</span><span>{inr(it.amount * (it.quantity || 1))}</span>
            </div>
          ))}
          <div style={{ display: 'flex', marginTop: 6, fontSize: 16, fontWeight: 800 }}>
            <span style={{ flex: 1 }}>{t('mn.bill.total')}</span><span>{inr(total)}</span>
          </div>
          {hasMoney && <div style={{ display: 'flex', fontSize: 15, color: C.ok, fontWeight: 700 }}><span style={{ flex: 1 }}>{t('mn.bill.paid')}</span><span>{inr(paid)}</span></div>}
          <div style={{ display: 'flex', fontSize: 17, fontWeight: 800, color: C.due }}><span style={{ flex: 1 }}>{t('mn.bill.left')}</span><span>{inr(due)}</span></div>
        </div>

        {/* Discount (not after money was taken: that is a correction) */}
        {!hasMoney && gross > 0 && (
          <div style={{ display: 'grid', gap: 8 }}>
            <div style={lab}>{t('mn.pay.discount')}</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              {PCTS.map(p => (
                <Chip key={p} on={Math.abs(pctOf - p) < 0.05} onClick={() => setDisc(Math.round(gross * p) / 100)}>
                  {p === 0 ? t('mn.pay.none') : `${p}%`}
                </Chip>
              ))}
              <input inputMode="decimal" aria-label={t('mn.pay.rupees')} placeholder={t('mn.pay.rupees')}
                value={disc ? String(disc) : ''} onChange={e => setDisc(Math.min(gross, num(e.target.value)))}
                style={{ ...fieldStyle, width: 130, height: 44 }} />
            </div>
            <div style={{ fontSize: 14, color: above ? C.danger : C.faint, fontWeight: above ? 700 : 500 }}>
              {above ? t('mn.pay.above', { pct: limitPct }) : limitPct != null ? t('mn.pay.limit', { pct: limitPct, amount: inr(limitRs) }) : ''}
            </div>
            {raised && (
              <>
                <div style={lab}>{t('mn.pay.why')}</div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {REASONS.map(r => <Chip key={r} on={reasonKey === r} onClick={() => setReasonKey(r)}>{t(`mn.pay.r.${r}`)}</Chip>)}
                </div>
                {reasonKey === 'other' && (
                  <input aria-label={t('mn.pay.otherReason')} placeholder={t('mn.pay.otherReason')} value={reasonText}
                    onChange={e => setReasonText(e.target.value.slice(0, 200))} style={fieldStyle} />
                )}
              </>
            )}
          </div>
        )}

        {/* How it is paid */}
        {!above && (due > 0.009) && (
          <div style={{ display: 'grid', gap: 10 }}>
            <div style={lab}>{t('mn.pay.with')}</div>
            {parts.map((p, i) => (
              <div key={i} style={{ background: 'white', border: `1px solid ${C.line}`, borderRadius: 14, padding: 10, display: 'grid', gap: 8 }}>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                  {MODES.map(m => <Chip key={m} on={p.mode === m} onClick={() => setPart(i, { mode: m })} style={{ minHeight: 40 }}>{modeWord(m)}</Chip>)}
                  <span style={{ flex: 1 }} />
                  <input inputMode="decimal" aria-label={`${modeWord(p.mode)} ₹`} value={p.amount}
                    onChange={e => setPart(i, { amount: e.target.value.replace(/[^\d.]/g, '') })}
                    style={{ ...fieldStyle, width: 130, height: 44, fontWeight: 800, textAlign: 'right' }} />
                  {parts.length > 1 && (
                    <button type="button" onClick={() => removePart(i)} aria-label={t('mn.pay.remove')}
                      style={{ width: 40, height: 40, borderRadius: 10, border: `1.5px solid ${C.lineStrong}`, background: 'white', cursor: 'pointer', fontSize: 18 }}>×</button>
                  )}
                </div>
                {p.mode !== 'CASH' && (
                  <input aria-label={t('mn.pay.ref')} placeholder={t('mn.pay.ref')} value={p.ref}
                    onChange={e => setPart(i, { ref: e.target.value.slice(0, 60) })} style={{ ...fieldStyle, height: 44 }} />
                )}
              </div>
            ))}
            {parts.length < 4 && <Button kind="ghost" icon="plus" onClick={addPart} style={{ justifySelf: 'start' }}>{t('mn.pay.split')}</Button>}

            {cashPart > 0 && (
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                <label style={{ fontSize: 15, fontWeight: 700 }} htmlFor="mn-gave">{t('mn.pay.gave')}</label>
                <input id="mn-gave" inputMode="decimal" value={gave} onChange={e => setGave(e.target.value.replace(/[^\d.]/g, ''))}
                  style={{ ...fieldStyle, width: 130, height: 44 }} />
                {change > 0 && !keepAdvance && <strong style={{ color: C.due, fontSize: 17 }}>{t('mn.pay.change', { amount: inr(change) })}</strong>}
                {change > 0 && (
                  <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 15 }}>
                    <input type="checkbox" checked={keepAdvance} onChange={e => setKeepAdvance(e.target.checked)} />
                    {t('mn.pay.keepAdvance', { amount: inr(change) })}
                  </label>
                )}
              </div>
            )}

            <div style={{ fontSize: 15, fontWeight: 700, color: over ? C.danger : C.muted }}>
              {over ? t('mn.pay.tooMuch')
                : `${t('mn.pay.sum', { amount: inr(taking) })}${taking < due - 0.009 ? ' · ' + t('mn.pay.leftAfter', { amount: inr(due - taking) }) : ''}`}
            </div>
          </div>
        )}
      </div>
    </Sheet>
  );
}
