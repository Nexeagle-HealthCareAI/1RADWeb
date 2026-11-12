import React from 'react';
import apiClient from '../../api/apiClient';
import { t } from '../../i18n';
import { Button, Chip, Sheet, Tag } from '../../components/saral/Saral';
import { C, inr } from '../../components/saral/tokens';
import { Err, Note } from '../../components/saral/parts';
import { apiError, fieldStyle, labelStyle } from '../../components/saral/formUtil';
import { rowState, shortDate } from './ptUtil';
import { printVoucher } from './voucher';

/**
 * Pay a partner. Same server call as the Referral Hub's payout
 * (POST /referrers/commissions/pay): one payout, one transaction, safe to repeat.
 *  1. Tick what is being paid (only cuts whose patient has paid in full can be ticked).
 *  2. How the money goes: cash / UPI / bank / cheque, with the UTR or cheque number.
 *  3. Tax: the centre's TDS rule (or none), PAN. "Work it out" asks the server for the
 *     exact gross, owed-back recovered, TDS and cash to hand over (nothing is recorded).
 *  4. Pay - the server records it and returns the payout number; the voucher can be printed.
 */
const MODES = ['CASH', 'UPI', 'BANK', 'CHEQUE'];
const CATS = ['COMMISSION', 'PROFESSIONAL', 'NONE'];

export default function PayoutSheet({ partner, rows, settings, payer, centre, onClose, onPaid }) {
  const payable = rows.filter(r => rowState(r) === 'ready');
  const waiting = rows.filter(r => rowState(r) === 'waiting');
  const owed = rows.filter(r => rowState(r) === 'owed').reduce((s, r) => s - Number(r.amount || 0), 0);
  const tdsOn = settings ? settings.tdsEnabled !== false : true;

  const [picked, setPicked] = React.useState(() => new Set(payable.map(r => r.id)));
  const [recover, setRecover] = React.useState(owed > 0);
  const [mode, setMode] = React.useState('CASH');
  const [reference, setReference] = React.useState('');
  const [category, setCategory] = React.useState(tdsOn ? (settings?.defaultTdsCategory || 'COMMISSION') : 'NONE');
  const [pan, setPan] = React.useState('');
  const [payee, setPayee] = React.useState(partner.name || '');
  const [paidBy, setPaidBy] = React.useState(payer || '');
  const [preview, setPreview] = React.useState(null);
  const [phase, setPhase] = React.useState('form'); // form | busy | done
  const [result, setResult] = React.useState(null);
  const [err, setErr] = React.useState('');
  const [idemKey] = React.useState(() => `payout-${partner.referrerId}-${Date.now()}`);

  const gross = payable.filter(r => picked.has(r.id)).reduce((s, r) => s + Number(r.amount || 0), 0);
  const panClean = pan.trim().toUpperCase();
  const panBad = panClean.length > 0 && !/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(panClean);
  const needsRef = mode !== 'CASH';

  const body = (previewOnly) => ({
    commissionIds: [...picked],
    paidBy: paidBy.trim() || payer || 'Centre',
    payeeName: payee.trim() || partner.name,
    payeeContact: partner.contact || null,
    payeeEmail: partner.email || null,
    payeeAddress: partner.address || null,
    netDeficits: recover,
    tdsCategory: tdsOn ? category : 'NONE',
    payeePan: panClean || null,
    mode,
    reference: reference.trim() || null,
    previewOnly,
  });

  // Any change makes an earlier preview stale.
  const change = (fn) => (...a) => { setPreview(null); fn(...a); };

  const check = async () => {
    setErr('');
    if (!picked.size) return setErr(t('po.pickOne'));
    if (panBad) return setErr(t('po.panBad'));
    setPhase('busy');
    try {
      const res = await apiClient.post('/referrers/commissions/pay', body(true), { suppressErrorToast: true });
      setPreview(res?.data || null);
      setPhase('form');
    } catch (e) { setErr(apiError(e) || t('po.failed')); setPhase('form'); }
  };

  const pay = async () => {
    setErr('');
    if (!preview) return check();
    if (needsRef && !reference.trim()) return setErr(t('po.needRef'));
    if (!paidBy.trim()) return setErr(t('po.needPaidBy'));
    if (!payee.trim()) return setErr(t('po.needPayee'));
    setPhase('busy');
    try {
      const res = await apiClient.post('/referrers/commissions/pay', body(false), { headers: { 'Idempotency-Key': idemKey }, suppressErrorToast: true });
      const data = res?.data || {};
      if (!data.paid?.length) { setErr((data.skipped || []).map(s => s.reason).join(' ') || t('po.nothingPaid')); setPhase('form'); return; }
      setResult(data); setPhase('done');
      onPaid?.(data);
    } catch (e) { setErr(apiError(e) || t('po.failed')); setPhase('form'); }
  };

  const sum = preview?.payouts?.[0];
  const doneSum = result?.payouts?.[0];

  if (phase === 'done' && result) {
    return (
      <Sheet open onClose={onClose} title={t('po.title')} footer={
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <Button kind="outline" icon="print" onClick={() => printVoucher({ partner, payout: doneSum, result, centre, payer: paidBy || payer, mode, reference })}>{t('po.printVoucher')}</Button>
          <Button onClick={onClose}>{t('tk.done')}</Button>
        </div>}>
        <div style={{ background: C.okSoft, color: C.ok, borderRadius: 16, padding: 16, fontSize: 19, fontWeight: 800 }}>
          {t('po.paidDone', { amount: inr(result.netPaid), name: partner.name })}
        </div>
        <Totals data={result} sum={doneSum} />
        {doneSum?.payoutNumber && <Note>{t('po.number')}: <b>{doneSum.payoutNumber}</b></Note>}
        {(result.skipped || []).length > 0 && <Note tone="warn">{t('po.someSkipped', { n: result.skipped.length })}</Note>}
      </Sheet>
    );
  }

  return (
    <Sheet open onClose={onClose} wide title={t('po.titleFor', { name: partner.name })} footer={
      <div style={{ display: 'grid', gap: 8 }}>
        {err && <Err>{err}</Err>}
        {preview
          ? <Button kind="money" size="lg" disabled={phase === 'busy'} onClick={pay}>{phase === 'busy' ? t('po.paying') : t('po.payNow', { amount: inr(preview.netPaid) })}</Button>
          : <Button size="lg" disabled={phase === 'busy' || !picked.size} onClick={check}>{phase === 'busy' ? t('po.working') : t('po.workOut', { amount: inr(gross) })}</Button>}
      </div>}>
      <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'minmax(0, 1fr)' }}>
        <section>
          <div style={labelStyle}>{t('po.whatPaid')}</div>
          {payable.length === 0 && <Note tone="warn">{t('po.noneReady')}</Note>}
          <div style={{ display: 'grid', gap: 8, marginTop: 8 }}>
            {payable.map(r => {
              const on = picked.has(r.id);
              return (
                <label key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'white', border: `1.5px solid ${on ? C.primary : C.line}`, borderRadius: 14, padding: '10px 12px', cursor: 'pointer' }}>
                  <input type="checkbox" checked={on} onChange={change(() => setPicked(p => { const n = new Set(p); if (n.has(r.id)) n.delete(r.id); else n.add(r.id); return n; }))} style={{ width: 22, height: 22 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 16, fontWeight: 700 }}>{r.patientName || t('pt.patient')}</div>
                    <div style={{ fontSize: 14, color: C.muted }}>{[r.serviceName || r.modality, shortDate(r.serviceDate)].filter(Boolean).join(' · ')}</div>
                  </div>
                  <div style={{ fontSize: 17, fontWeight: 800 }}>{inr(r.amount)}</div>
                </label>
              );
            })}
          </div>
          {waiting.length > 0 && <Note>{t('po.waitingNote', { n: waiting.length, amount: inr(waiting.reduce((s, r) => s + Number(r.amount || 0), 0)) })}</Note>}
        </section>

        {owed > 0 && (
          <label style={{ display: 'flex', gap: 12, alignItems: 'flex-start', background: C.dueSoft, color: C.dueInk, borderRadius: 14, padding: 12 }}>
            <input type="checkbox" checked={recover} onChange={change(() => setRecover(v => !v))} style={{ width: 22, height: 22, marginTop: 2 }} />
            <span style={{ fontSize: 16 }}><b>{t('po.recover', { amount: inr(owed) })}</b><br />{t('po.recoverHelp')}</span>
          </label>
        )}

        <section>
          <div style={labelStyle}>{t('po.how')}</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
            {MODES.map(m => <Chip key={m} on={mode === m} onClick={change(() => setMode(m))}>{t(`po.mode.${m}`)}</Chip>)}
          </div>
          {needsRef && (
            <label style={{ display: 'grid', gap: 6, marginTop: 10 }}>
              <span style={{ fontSize: 15, color: C.muted }}>{mode === 'CHEQUE' ? t('po.chequeNo') : t('po.utr')}</span>
              <input value={reference} onChange={e => setReference(e.target.value.slice(0, 60))} style={fieldStyle} />
            </label>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10, marginTop: 10 }}>
            <label style={{ display: 'grid', gap: 6 }}>
              <span style={{ fontSize: 15, color: C.muted }}>{t('po.payee')}</span>
              <input value={payee} onChange={change(e => setPayee(e.target.value.slice(0, 200)))} style={fieldStyle} />
            </label>
            <label style={{ display: 'grid', gap: 6 }}>
              <span style={{ fontSize: 15, color: C.muted }}>{t('po.paidByLabel')}</span>
              <input value={paidBy} onChange={e => setPaidBy(e.target.value.slice(0, 200))} style={fieldStyle} />
            </label>
          </div>
        </section>

        <section>
          <div style={labelStyle}>{t('po.tax')}</div>
          {!tdsOn
            ? <Note>{t('po.tdsOff')}</Note>
            : (
              <>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
                  {CATS.map(c => <Chip key={c} on={category === c} onClick={change(() => setCategory(c))}>{t(`po.cat.${c}`)}</Chip>)}
                </div>
                <label style={{ display: 'grid', gap: 6, marginTop: 10 }}>
                  <span style={{ fontSize: 15, color: C.muted }}>{partner.hasPan ? t('po.panSaved') : t('po.pan')}</span>
                  <input value={pan} placeholder="ABCDE1234F" autoCapitalize="characters" onChange={change(e => setPan(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10)))} style={{ ...fieldStyle, textTransform: 'uppercase', letterSpacing: 1 }} />
                </label>
                {panBad && <Err>{t('po.panBad')}</Err>}
              </>
            )}
        </section>

        {preview && <Totals data={preview} sum={sum} />}
        {preview?.notices?.length > 0 && preview.notices.map((n, i) => <Note key={i} tone="warn">{n}</Note>)}
      </div>
    </Sheet>
  );
}

function Totals({ data, sum }) {
  const line = (label, value, strong) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: strong ? 19 : 16, fontWeight: strong ? 800 : 600, padding: '6px 0' }}>
      <span>{label}</span><span>{value}</span>
    </div>
  );
  return (
    <div style={{ background: 'white', border: `1px solid ${C.line}`, borderRadius: 16, padding: '8px 14px', marginTop: 4 }}>
      {line(t('po.gross'), inr(data.totalPaid))}
      {Number(data.deficitRecovered) > 0 && line(t('po.recovered'), `− ${inr(data.deficitRecovered)}`)}
      {line(sum && Number(sum.tdsRate) > 0 ? t('po.tdsAt', { pct: Number(sum.tdsRate) }) : t('po.tdsLine'), Number(data.tdsDeducted) > 0 ? `− ${inr(data.tdsDeducted)}` : inr(0))}
      <div style={{ borderTop: `1px solid ${C.line}`, marginTop: 4 }} />
      {line(t('po.handOver'), inr(data.netPaid), true)}
      {sum?.tdsNote && <div style={{ fontSize: 14, color: C.muted, paddingBottom: 6 }}>{sum.tdsNote}</div>}
      {sum && <Tag bg={C.primarySoft} fg={C.primary} style={{ marginBottom: 8 }}>{t('po.yearSoFar', { amount: inr(sum.yearTotal) })}</Tag>}
    </div>
  );
}
