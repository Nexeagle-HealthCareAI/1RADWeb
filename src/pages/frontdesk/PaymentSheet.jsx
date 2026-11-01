import React from 'react';
import apiClient from '../../api/apiClient';
import { collectPayment } from '../../api/billing/paymentApi';
import { fetchPatientCredit } from '../../api/billing/creditApi';
import { t } from '../../i18n';
import { Button, Chip, Sheet } from '../../components/saral/Saral';
import { C, inr } from '../../components/saral/tokens';

/**
 * Collect money on a visit's bill (front desk). Same server call as Billing
 * (POST /finance/payments with the bill's version, one idempotency key per
 * opening), without the discount and extra-charge controls — those stay in
 * Billing. Shows the change to hand back for cash. The parent mounts it once
 * per visit (key), so every opening starts clean with its own idempotency key.
 */
const MODES = ['CASH', 'UPI', 'CARD', 'ADVANCE'];

export default function PaymentSheet({ visit, onClose, onPaid, isOnline }) {
  const [state, setState] = React.useState({ loading: true, invoice: null, wallet: 0, error: '' });
  const [amount, setAmount] = React.useState(0);
  const [custom, setCustom] = React.useState('');
  const [mode, setMode] = React.useState('CASH');
  const [gave, setGave] = React.useState('');
  const [saving, setSaving] = React.useState(false);
  const [done, setDone] = React.useState(null);
  const idem = React.useRef(crypto.randomUUID());

  React.useEffect(() => {
    if (!visit) return undefined;
    let alive = true;
    (async () => {
      try {
        const res = await apiClient.get('/finance/invoices', { params: { appointmentId: visit.appointmentId }, suppressErrorToast: true });
        const list = (Array.isArray(res.data) ? res.data : res.data?.items || [])
          .filter(i => String(i.status || '').toUpperCase() !== 'CANCELLED' && !i.deletedAt);
        const invoice = list.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))[0] || null;
        let wallet = 0;
        if (invoice?.patientId) {
          try { wallet = Number((await fetchPatientCredit(invoice.patientId))?.balance) || 0; } catch { /* no wallet */ }
        }
        if (!alive) return;
        const due = invoice ? Math.max(0, (invoice.totalAmount || 0) - (invoice.paidAmount || 0)) : 0;
        setAmount(due);
        setState({ loading: false, invoice, wallet, error: '' });
      } catch {
        if (alive) setState({ loading: false, invoice: null, wallet: 0, error: t('fd.failed') });
      }
    })();
    return () => { alive = false; };
  }, [visit]);

  if (!visit) return null;
  const inv = state.invoice;
  const due = inv ? Math.max(0, Math.round(((inv.totalAmount || 0) - (inv.paidAmount || 0)) * 100) / 100) : 0;
  const taking = custom !== '' ? Number(custom) || 0 : amount;
  const tooMuch = taking > due + 0.009;
  const advanceShort = mode === 'ADVANCE' && taking > state.wallet + 0.009;
  const modeLabel = { CASH: t('pay.cash'), UPI: t('pay.upi'), CARD: t('pay.card'), ADVANCE: t('pay.advance') };
  const modeSub = { CASH: t('pay.cashSub'), UPI: t('pay.upiSub'), CARD: t('pay.cardSub'), ADVANCE: t('pay.advSub', { amount: inr(state.wallet) }) };
  const change = Math.max(0, (Number(gave) || 0) - taking);
  const quick = [...new Set([due, ...[2000, 1000, 500].filter(v => v < due)])].slice(0, 3);

  const confirm = async () => {
    if (!inv || taking <= 0 || tooMuch || advanceShort || saving) return;
    if (isOnline === false) return;
    setSaving(true);
    try {
      await collectPayment({ invoiceId: inv.invoiceId, amount: taking, paymentMethod: mode, rowVersion: inv.rowVersion ?? null }, idem.current);
      const left = Math.max(0, due - taking);
      setDone({ amount: taking, mode, left });
      onPaid?.(visit.appointmentId, left);
    } catch (e) {
      const msg = e?.response?.data?.message || e?.response?.data?.error || t('fd.failed');
      setState(s => ({ ...s, error: msg }));
    } finally {
      setSaving(false);
    }
  };

  const footer = done
    ? <Button kind="primary" size="lg" full onClick={onClose}>{t('pay.close')}</Button>
    : inv && due > 0
      ? <Button kind="primary" size="lg" full onClick={confirm} disabled={saving || taking <= 0 || tooMuch || advanceShort || isOnline === false}>
          {saving ? '…' : t('pay.got', { amount: inr(taking), mode: modeLabel[mode] })}
        </Button>
      : <Button kind="quiet" size="lg" full onClick={onClose}>{t('pay.close')}</Button>;

  return (
    <Sheet open={!!visit} onClose={onClose} title={`${t('pay.title')} · ${visit.patientName || ''}`} footer={footer}>
      {state.loading && <div style={{ fontSize: 17, color: C.muted, padding: 20, textAlign: 'center' }}>{t('pay.loading')}</div>}

      {!state.loading && !inv && (
        <div style={{ background: 'white', border: `1px solid ${C.line}`, borderRadius: 18, padding: 18, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ fontSize: 19, fontWeight: 800 }}>{t('pay.noBill')}</div>
          <div style={{ fontSize: 16, color: C.muted, lineHeight: 1.5 }}>{t('pay.noBillSub')}</div>
          <a href="/billing" style={{ alignSelf: 'flex-start', minHeight: 48, padding: '0 18px', borderRadius: 14, border: `2px solid ${C.primary}`, color: C.primary, fontWeight: 700, fontSize: 16, display: 'inline-flex', alignItems: 'center', textDecoration: 'none' }}>{t('pay.openBilling')}</a>
        </div>
      )}

      {!state.loading && inv && done && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: '20px 0', textAlign: 'center' }}>
          <div style={{ width: 84, height: 84, borderRadius: 999, background: C.okSoft, color: C.ok, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7" /></svg>
          </div>
          <div style={{ fontSize: 34, fontWeight: 800 }}>{inr(done.amount)}</div>
          <div style={{ fontSize: 19, fontWeight: 700 }}>{t('pay.received')} · {modeLabel[done.mode]}</div>
          <div style={{ fontSize: 16, color: done.left > 0 ? C.dueInk : C.ok, fontWeight: 700 }}>
            {done.left > 0 ? t('pay.stillDue', { amount: inr(done.left) }) : t('pay.fullyPaid')}
          </div>
          <div style={{ fontSize: 15, color: C.muted }}>{inv.displayId}</div>
        </div>
      )}

      {!state.loading && inv && !done && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ background: 'white', border: `1px solid ${C.line}`, borderRadius: 18, padding: 16, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {(inv.items || []).map((it, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 17 }}>
                <span>{it.description}</span><span style={{ fontWeight: 700 }}>{it.isFree ? '—' : inr((it.amount || 0) * (it.quantity || 1))}</span>
              </div>
            ))}
            {(inv.discountAmount || 0) > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 16, color: C.muted }}><span>{t('money.discounts')}</span><span>− {inr(inv.discountAmount)}</span></div>
            )}
            {(inv.paidAmount || 0) > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 16, color: C.ok }}><span>{t('pay.paidEarlier')}</span><span style={{ fontWeight: 700 }}>− {inr(inv.paidAmount)}</span></div>
            )}
            <div style={{ borderTop: `1px dashed ${C.lineStrong}`, paddingTop: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <span style={{ fontSize: 17, fontWeight: 700 }}>{t('pay.toCollect')}</span>
              <span style={{ fontSize: 34, fontWeight: 800, color: due > 0 ? C.due : C.ok }}>{inr(due)}</span>
            </div>
          </div>

          {due <= 0 ? (
            <div style={{ fontSize: 17, fontWeight: 700, color: C.ok }}>{t('pay.paidAlready')}</div>
          ) : (<>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ fontSize: 16, fontWeight: 700 }}>{t('pay.takingNow')}</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {quick.map((v, i) => (
                  <Chip key={v} on={custom === '' && amount === v} onClick={() => { setCustom(''); setAmount(v); }}>
                    {i === 0 ? `${t('pay.full')} ${inr(v)}` : inr(v)}
                  </Chip>
                ))}
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 44, padding: '0 12px', borderRadius: 999, border: `1.5px solid ${custom !== '' ? C.ink : C.lineStrong}`, background: 'white' }}>
                  <span style={{ fontSize: 16, fontWeight: 700, color: C.muted }}>₹</span>
                  <input inputMode="numeric" value={custom} placeholder={t('pay.other')} aria-label={t('pay.amount')}
                    onChange={e => setCustom(e.target.value.replace(/[^0-9.]/g, ''))}
                    style={{ width: 90, border: 'none', outline: 'none', fontSize: 16, fontWeight: 700, fontFamily: 'inherit', background: 'transparent' }} />
                </label>
              </div>
              {tooMuch && <div style={{ fontSize: 15, color: C.danger, fontWeight: 700 }}>{t('pay.tooMuch')}</div>}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ fontSize: 16, fontWeight: 700 }}>{t('pay.how')}</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
                {MODES.filter(m => m !== 'ADVANCE' || state.wallet > 0).map(m => (
                  <button key={m} type="button" onClick={() => setMode(m)} aria-pressed={mode === m}
                    style={{ minHeight: 68, borderRadius: 16, padding: '8px 14px', textAlign: 'left', fontFamily: 'inherit', cursor: 'pointer',
                      display: 'flex', flexDirection: 'column', justifyContent: 'center',
                      ...(mode === m ? { background: C.primary, color: 'white', border: 'none' } : { background: 'white', color: C.ink, border: `1.5px solid ${C.line}` }) }}>
                    <span style={{ fontSize: 18, fontWeight: 800 }}>{modeLabel[m]}</span>
                    <span style={{ fontSize: 14, fontWeight: 600, opacity: 0.85 }}>{modeSub[m]}</span>
                  </button>
                ))}
              </div>
            </div>

            {mode === 'CASH' && (
              <div style={{ background: 'white', border: `1px solid ${C.line}`, borderRadius: 18, padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ fontSize: 16, fontWeight: 700 }}>{t('pay.gave')}</div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {[...new Set([taking, Math.ceil(taking / 500) * 500, Math.ceil(taking / 100) * 100 + 500, 2000, 5000].filter(v => v >= taking && v > 0))].slice(0, 4).map(v => (
                    <Chip key={v} on={Number(gave) === v} onClick={() => setGave(String(v))}>{inr(v)}</Chip>
                  ))}
                </div>
                {gave !== '' && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', background: '#F0FDF4', borderRadius: 14, padding: '10px 14px' }}>
                    <span style={{ fontSize: 17, fontWeight: 700, color: C.ok }}>{t('pay.change')}</span>
                    <span style={{ fontSize: 26, fontWeight: 800, color: C.ok }}>{inr(change)}</span>
                  </div>
                )}
              </div>
            )}

            {mode === 'UPI' && (
              <div style={{ fontSize: 15, color: C.muted, lineHeight: 1.5 }}>{t('pay.upiSub')}</div>
            )}
            <div style={{ fontSize: 14, color: C.muted }}>{t('pay.discountNote')}</div>
          </>)}

          {state.error && <div role="alert" style={{ background: C.dangerSoft, color: C.danger, borderRadius: 12, padding: '10px 14px', fontSize: 15, fontWeight: 700 }}>{state.error}</div>}
        </div>
      )}
    </Sheet>
  );
}
