import React from 'react';
import apiClient from '../../api/apiClient';
import { t } from '../../i18n';
import { Button, Sheet } from '../../components/saral/Saral';
import { C } from '../../components/saral/tokens';
import { Err, Note } from '../../components/saral/parts';
import { apiError, fieldStyle } from '../../components/saral/formUtil';

/** A plain "are you sure" sheet - in place of the browser's confirm pop-up. */
export function ConfirmSheet({ title, body, confirm, danger, run, onClose, onDone }) {
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState('');
  const go = async () => {
    setBusy(true); setErr('');
    try { const res = await run(); onDone?.(res); }
    catch (e) { setErr(apiError(e) || t('pf.failed')); setBusy(false); }
  };
  return (
    <Sheet open onClose={onClose} title={title} footer={
      <div style={{ display: 'grid', gap: 8 }}>
        {err && <Err>{err}</Err>}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <Button kind="outline" onClick={onClose}>{t('pa.back')}</Button>
          <Button kind={danger ? 'outlineDanger' : 'primary'} disabled={busy} onClick={go}>{busy ? t('pf.saving') : confirm}</Button>
        </div>
      </div>}>
      <Note>{body}</Note>
    </Sheet>
  );
}

/**
 * Merge this partner into another one (POST /referrers/merge). The duplicate's visits
 * and money then show under the primary; its own portal links stop working.
 */
export function MergeSheet({ source, onClose, onDone }) {
  const [q, setQ] = React.useState('');
  const [list, setList] = React.useState([]);
  const [target, setTarget] = React.useState(null);
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState('');
  const [alsoDelete, setAlsoDelete] = React.useState(false);

  React.useEffect(() => {
    let alive = true;
    const h = setTimeout(() => {
      apiClient.get('/referrers', { params: { search: q.trim() }, suppressErrorToast: true }).then(r => {
        if (!alive) return;
        const all = Array.isArray(r.data) ? r.data : r.data?.items || [];
        setList(all.filter(p => p.referrerId !== source.referrerId && !p.mergedIntoId && !p.deletedAt && String(p.name || '').trim().toLowerCase() !== 'self').slice(0, 30));
      }).catch(() => {});
    }, 250);
    return () => { alive = false; clearTimeout(h); };
  }, [q, source.referrerId]);

  const go = async () => {
    if (!target) return;
    setBusy(true); setErr('');
    try {
      await apiClient.post('/referrers/merge', { sourceReferrerId: source.referrerId, targetReferrerId: target.referrerId }, { suppressErrorToast: true });
      // Same option as the Referrals page: remove the duplicate's record too (cannot be unmerged then).
      if (alsoDelete) await apiClient.delete(`/referrers/${source.referrerId}`, { suppressErrorToast: true }).catch(() => {});
      onDone?.();
    } catch (e) { setErr(apiError(e) || t('pf.failed')); setBusy(false); }
  };

  return (
    <Sheet open onClose={onClose} title={t('pa.mergeTitle', { name: source.name })} footer={
      <div style={{ display: 'grid', gap: 8 }}>
        {err && <Err>{err}</Err>}
        <Button size="lg" disabled={!target || busy} onClick={go}>{target ? t('pa.mergeInto', { name: target.name }) : t('pa.pickPrimary')}</Button>
      </div>}>
      <div style={{ display: 'grid', gap: 12 }}>
        <Note>{t('pa.mergeHelp', { name: source.name })}</Note>
        <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 16 }}>
          <input type="checkbox" checked={alsoDelete} onChange={() => setAlsoDelete(v => !v)} style={{ width: 22, height: 22, marginTop: 2 }} />
          <span>{t('pa.alsoDelete')}</span>
        </label>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder={t('pt.search')} aria-label={t('pt.search')} style={fieldStyle} />
        <div style={{ display: 'grid', gap: 8 }}>
          {list.map(p => (
            <button key={p.referrerId} type="button" onClick={() => setTarget(p)}
              style={{ textAlign: 'left', background: 'white', border: `2px solid ${target?.referrerId === p.referrerId ? C.primary : C.line}`, borderRadius: 14, padding: '10px 12px', fontFamily: 'inherit', cursor: 'pointer' }}>
              <div style={{ fontSize: 16, fontWeight: 700 }}>{p.name}</div>
              <div style={{ fontSize: 14, color: C.muted }}>{[p.isDoctor === false ? t('ps.agent') : t('ps.doctor'), p.contact, p.specialty].filter(Boolean).join(' · ')}</div>
            </button>
          ))}
        </div>
      </div>
    </Sheet>
  );
}

/**
 * Ask an admin to approve a change to money already recorded (POST /approvals) -
 * the same requests the Referral Hub sends:
 *  UNPAY_COMMISSION  { commissionId }                                  undo a payment
 *  EDIT_COMMISSION   { commissionId, amount, modality, status, remarks }  change an amount
 * A reason of at least 4 letters is needed. Nothing changes until it is approved.
 */
export function ApprovalSheet({ kind, row, partnerName, onClose, onDone }) {
  const [reason, setReason] = React.useState('');
  const [amount, setAmount] = React.useState(String(row.amount ?? ''));
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState('');
  const unpay = kind === 'unpay';
  const send = async () => {
    setErr('');
    if (reason.trim().length < 4) return setErr(t('pa.needReason'));
    const n = Number(amount);
    if (!unpay && (!Number.isFinite(n) || n < 0)) return setErr(t('pa.badAmount'));
    setBusy(true);
    const label = row.patientName && row.patientName !== 'Unknown Patient' ? row.patientName : partnerName;
    const body = unpay
      ? { type: 'UNPAY_COMMISSION', title: `Revert paid commission — ${label} (₹${Math.round(Number(row.amount) || 0)})`, payload: JSON.stringify({ commissionId: row.id }), reason: reason.trim() }
      : { type: 'EDIT_COMMISSION', title: `Payout edit — ${partnerName} · ₹${Math.round(n)} ${row.modality || ''}`.trim(), appointmentId: row.appointmentId || null,
          payload: JSON.stringify({ commissionId: row.id, amount: n, modality: row.modality || '', status: row.status || 'UNPAID', remarks: row.remarks || '' }), reason: reason.trim() };
    try {
      await apiClient.post('/approvals', body, { suppressErrorToast: true });
      window.dispatchEvent(new Event('1rad_approvals_changed'));
      onDone?.();
    } catch (e) { setErr(apiError(e) || t('pf.failed')); setBusy(false); }
  };
  return (
    <Sheet open onClose={onClose} title={unpay ? t('pa.unpayTitle') : t('pa.amountTitle')} footer={
      <div style={{ display: 'grid', gap: 8 }}>
        {err && <Err>{err}</Err>}
        <Button size="lg" disabled={busy} onClick={send}>{busy ? t('pf.saving') : t('pa.sendApproval')}</Button>
      </div>}>
      <div style={{ display: 'grid', gap: 12 }}>
        <Note>{unpay ? t('pa.unpayHelp') : t('pa.amountHelp')}</Note>
        {!unpay && (
          <label style={{ display: 'grid', gap: 6 }}>
            <span style={{ fontSize: 15, color: C.muted }}>{t('pa.newAmount')}</span>
            <input value={amount} inputMode="decimal" onChange={e => setAmount(e.target.value.replace(/[^\d.]/g, ''))} style={fieldStyle} />
          </label>
        )}
        <label style={{ display: 'grid', gap: 6 }}>
          <span style={{ fontSize: 15, color: C.muted }}>{t('pa.reason')}</span>
          <textarea value={reason} rows={3} onChange={e => setReason(e.target.value.slice(0, 500))} style={{ ...fieldStyle, height: 'auto', padding: 12 }} />
        </label>
      </div>
    </Sheet>
  );
}

/**
 * Add an amount by hand for a partner (POST /referrers/commissions/batch) - e.g. a
 * referral from before the software, or an agreed extra. It starts unpaid and is paid
 * through Pay like any other amount.
 */
export function ManualAmountSheet({ partner, onClose, onDone }) {
  const [f, setF] = React.useState({ amount: '', test: '', patient: '', reference: '', remarks: '' });
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState('');
  const [idemKey] = React.useState(() => (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `m-${Date.now()}`));
  const set = (k) => (e) => setF(p => ({ ...p, [k]: e.target.value }));
  const save = async () => {
    setErr('');
    const n = Number(f.amount);
    if (!Number.isFinite(n) || n <= 0) return setErr(t('pa.badAmount'));
    if (f.remarks.trim().length < 4) return setErr(t('pa.needReason'));
    setBusy(true);
    try {
      await apiClient.post('/referrers/commissions/batch', {
        referrerId: partner.referrerId, referenceNumber: f.reference.trim() || null, remarks: f.remarks.trim(),
        patientName: f.patient.trim() || null, appointmentId: null,
        lines: [{ modality: f.test.trim() || 'OTHER', amount: n, status: 'UNPAID' }],
      }, { headers: { 'Idempotency-Key': idemKey }, suppressErrorToast: true });
      onDone?.();
    } catch (e) { setErr(apiError(e) || t('pf.failed')); setBusy(false); }
  };
  const field = (k, label, extra = {}) => (
    <label style={{ display: 'grid', gap: 6 }}>
      <span style={{ fontSize: 15, color: C.muted }}>{label}</span>
      <input value={f[k]} onChange={set(k)} style={fieldStyle} {...extra} />
    </label>
  );
  return (
    <Sheet open onClose={onClose} title={t('pa.manualTitle', { name: partner.name })} footer={
      <div style={{ display: 'grid', gap: 8 }}>
        {err && <Err>{err}</Err>}
        <Button size="lg" disabled={busy} onClick={save}>{busy ? t('pf.saving') : t('pa.manualSave')}</Button>
      </div>}>
      <div style={{ display: 'grid', gap: 12 }}>
        <Note>{t('pa.manualHelp')}</Note>
        {field('amount', t('pa.amount'), { inputMode: 'decimal' })}
        {field('test', t('pa.test'))}
        {field('patient', t('pa.patientOpt'))}
        {field('reference', t('pa.reference'))}
        {field('remarks', t('pa.why'))}
      </div>
    </Sheet>
  );
}
