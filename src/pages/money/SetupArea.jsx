import React from 'react';
import { t } from '../../i18n';
import { Button, Chip, Sheet } from '../../components/saral/Saral';
import { C } from '../../components/saral/tokens';
import { apiError } from '../../components/saral/formUtil';
import apiClient from '../../api/apiClient';
import { saveBillingSettings, useBillingSettings } from '../../api/billing/billingSettingsApi';
import TaxBillingSettings from '../../components/Admin/TaxBillingSettings';

const BillingPage = React.lazy(() => import('../BillingPage'));

/**
 * Money ▸ Setup (owner). Three tabs:
 *  • Discounts & partners — limits per role (with a "try it"), the reason rule, and
 *    when a partner's share can be paid;
 *  • Price list — the existing price screen;
 *  • Tax & TDS — the existing Admin ▸ Tax & billing screen.
 * Saving sends the whole settings record, keeping every value the other screen owns.
 */
const DESK = [0, 5, 10, 15, 20, 25];
const ACC = [null, 10, 20, 30, 50];

export default function SetupArea({ centre, toast, vp, isOnline = true }) {
  const settings = useBillingSettings(centre?.id);
  const [tab, setTab] = React.useState('rules');
  const [f, setF] = React.useState(null);
  const [busy, setBusy] = React.useState(false);
  const [tryPct, setTryPct] = React.useState(15);
  // Automatic billing (Hospital.IsAutoBillingEnabled): a bill is made by itself when a
  // visit is completed. The same switch as Price list ▸ Billing Settings; shown first here.
  const [auto, setAuto] = React.useState(null);
  const [autoAsk, setAutoAsk] = React.useState(false);
  const [autoBusy, setAutoBusy] = React.useState(false);
  React.useEffect(() => {
    if (!centre?.id) return undefined;
    let alive = true;
    apiClient.get(`/hospitals/${centre.id}`, { suppressErrorToast: true })
      .then(r => { if (alive) setAuto(!!(r.data?.isAutoBillingEnabled ?? r.data?.IsAutoBillingEnabled)); })
      .catch(() => { if (alive) setAuto(!!centre?.isAutoBillingEnabled); });
    return () => { alive = false; };
  }, [centre?.id, tab]); // eslint-disable-line react-hooks/exhaustive-deps
  const saveAuto = async () => {
    setAutoBusy(true);
    try {
      const r = await apiClient.put(`/hospitals/${centre.id}/auto-billing`, { enabled: !auto }, { suppressErrorToast: true });
      setAuto(!!(r.data?.isAutoBillingEnabled ?? !auto));
      toast.show(!auto ? t('mn.st.autoOnDone') : t('mn.st.autoOffDone'));
      setAutoAsk(false);
    } catch (e) { toast.show(apiError(e) || t('mn.st.failed')); } finally { setAutoBusy(false); }
  };

  React.useEffect(() => {
    if (!settings) return;
    setF({
      desk: Number(settings.frontDeskDiscountLimitPercent ?? 10),
      acc: settings.accountantDiscountLimitPercent ?? null,
      reason: !!settings.discountReasonRequired,
      payBilled: settings.partnerPayWhenBilled !== false,
    });
  }, [settings]);

  const dirty = f && settings && (
    f.desk !== Number(settings.frontDeskDiscountLimitPercent ?? 10) || f.acc !== (settings.accountantDiscountLimitPercent ?? null)
    || f.reason !== !!settings.discountReasonRequired || f.payBilled !== (settings.partnerPayWhenBilled !== false));

  const save = async () => {
    if (!f || !settings) return;
    setBusy(true);
    try {
      await saveBillingSettings(centre.id, {
        gstEnabled: settings.gstEnabled, creditNotesEnabled: settings.creditNotesEnabled, tdsEnabled: settings.tdsEnabled,
        defaultTdsCategory: settings.defaultTdsCategory, tdsCommissionRate: settings.tdsCommissionRate, tdsCommissionThreshold: settings.tdsCommissionThreshold,
        tdsProfessionalRate: settings.tdsProfessionalRate, tdsProfessionalThreshold: settings.tdsProfessionalThreshold, tdsNoPanRate: settings.tdsNoPanRate,
        frontDeskDiscountLimitPercent: f.desk,
        accountantDiscountLimitPercent: f.acc, clearAccountantLimit: f.acc == null,
        discountReasonRequired: f.reason, partnerPayWhenBilled: f.payBilled,
      });
      toast.show(t('mn.st.saved'));
    } catch (e) { toast.show(apiError(e) || t('mn.st.failed')); } finally { setBusy(false); }
  };

  const card = { background: 'white', border: `1.5px solid ${C.line}`, borderRadius: 18, padding: '14px 16px', display: 'grid', gap: 10 };
  const h = { fontSize: 18, fontWeight: 800 };
  const row = { display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' };
  const who = { width: 120, fontSize: 15, fontWeight: 700 };
  const choice = (on) => ({ textAlign: 'left', display: 'grid', gap: 2, padding: '10px 14px', borderRadius: 14, cursor: 'pointer', fontFamily: 'inherit', color: C.ink,
    background: on ? C.primarySoft : 'white', border: on ? `2px solid ${C.primary}` : `1.5px solid ${C.line}` });
  const tryOk = f && tryPct <= f.desk;

  return (
    <div style={{ flex: 1, minWidth: 0, overflowY: 'auto', padding: vp.phone ? '12px 12px 90px' : '18px 22px 24px', display: 'grid', gridTemplateColumns: 'minmax(0,1fr)', gridAutoRows: 'max-content', gap: 14, alignContent: 'start' }}>
      <div>
        <div style={{ fontSize: vp.phone ? 22 : 26, fontWeight: 800 }}>{t('mn.st.title')}</div>
        <div style={{ fontSize: 15, color: C.muted }}>{t('mn.st.help')}</div>
      </div>
      <div style={{ display: 'flex', gap: 8, overflowX: 'auto', minWidth: 0 }}>
        {['rules', 'prices', 'tax'].map(k => <Chip key={k} on={tab === k} onClick={() => setTab(k)}>{t(`mn.st.tab.${k}`)}</Chip>)}
      </div>

      {tab === 'rules' && auto != null && (
        <div style={{ ...card, borderColor: auto ? '#BBF7D0' : C.line }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ flex: '1 1 240px' }}>
              <div style={h}>{t('mn.st.auto')}</div>
              <div style={{ fontSize: 14, color: C.muted }}>{auto ? t('mn.st.autoOnSub') : t('mn.st.autoOffSub')}</div>
            </div>
            <span style={{ fontSize: 14, fontWeight: 800, padding: '4px 12px', borderRadius: 999, background: auto ? C.okSoft : '#F3F4F6', color: auto ? C.ok : C.muted }}>
              {auto ? t('mn.st.autoOn') : t('mn.st.autoOff')}
            </span>
            <Button kind={auto ? 'outline' : 'ok'} onClick={() => setAutoAsk(true)}>{auto ? t('mn.st.autoTurnOff') : t('mn.st.autoTurnOn')}</Button>
          </div>
        </div>
      )}
      <Sheet open={autoAsk} onClose={() => !autoBusy && setAutoAsk(false)} title={auto ? t('mn.st.autoTurnOff') : t('mn.st.autoTurnOn')}
        footer={<Button kind="primary" size="lg" disabled={autoBusy} onClick={saveAuto}>{autoBusy ? '…' : (auto ? t('mn.st.autoTurnOff') : t('mn.st.autoTurnOn'))}</Button>}>
        <div style={{ fontSize: 16, lineHeight: 1.5 }}>{auto ? t('mn.st.autoOffAsk') : t('mn.st.autoOnAsk')}</div>
      </Sheet>
      {tab === 'rules' && !f && <div style={{ color: C.faint }}>{t('mn.st.loading')}</div>}
      {tab === 'rules' && f && (
        <>
          <div style={card}>
            <div style={h}>{t('mn.st.disc')}</div>
            <div style={{ fontSize: 14, color: C.muted }}>{t('mn.st.discHelp')}</div>
            <div style={row}><span style={who}>{t('mn.st.desk')}</span>
              {DESK.map(p => <Chip key={p} on={f.desk === p} onClick={() => setF({ ...f, desk: p })}>{p}%</Chip>)}</div>
            <div style={row}><span style={who}>{t('mn.st.acc')}</span>
              {ACC.map(p => <Chip key={String(p)} on={f.acc === p} onClick={() => setF({ ...f, acc: p })}>{p == null ? t('mn.st.noLimit') : `${p}%`}</Chip>)}</div>
            <div style={row}><span style={who}>{t('mn.st.owner')}</span><span style={{ color: C.muted }}>{t('mn.st.any')}</span></div>
            <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', cursor: 'pointer' }}>
              <input type="checkbox" checked={f.reason} onChange={e => setF({ ...f, reason: e.target.checked })} style={{ width: 20, height: 20, marginTop: 2 }} />
              <span><span style={{ display: 'block', fontWeight: 700 }}>{t('mn.st.reason')}</span><span style={{ fontSize: 13, color: C.muted }}>{t('mn.st.reasonSub')}</span></span>
            </label>
            <div style={{ background: C.ground, borderRadius: 14, padding: '10px 12px', display: 'grid', gap: 8 }}>
              <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: 1, color: C.faint }}>{t('mn.st.try').toUpperCase()}</div>
              <div style={row}>{[5, 10, 15, 33].map(p => <Chip key={p} on={tryPct === p} onClick={() => setTryPct(p)}>{p}%</Chip>)}</div>
              <div style={{ fontSize: 15 }}>{t('mn.st.tryText', { pct: tryPct })} <b style={{ color: tryOk ? C.ok : C.dueInk }}>{tryOk ? t('mn.st.tryOk') : t('mn.st.tryAsk')}</b></div>
            </div>
          </div>

          <div style={card}>
            <div style={h}>{t('mn.st.pay')}</div>
            <div style={{ display: 'grid', gridTemplateColumns: vp.phone ? 'minmax(0,1fr)' : 'repeat(2, minmax(0,1fr))', gap: 10 }}>
              <button type="button" style={choice(f.payBilled)} onClick={() => setF({ ...f, payBilled: true })} aria-pressed={f.payBilled}>
                <b style={{ fontSize: 16 }}>{t('mn.st.payBilled')}</b><span style={{ fontSize: 13, color: C.muted }}>{t('mn.st.payBilledSub')}</span></button>
              <button type="button" style={choice(!f.payBilled)} onClick={() => setF({ ...f, payBilled: false })} aria-pressed={!f.payBilled}>
                <b style={{ fontSize: 16 }}>{t('mn.st.payPaid')}</b><span style={{ fontSize: 13, color: C.muted }}>{t('mn.st.payPaidSub')}</span></button>
            </div>
          </div>

          <div style={card}>
            <div style={h}>{t('mn.st.numbers')}</div>
            <div style={{ fontSize: 14, color: C.muted }}>{t('mn.st.numbersSub')}</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 14 }}>
              {['INV2627-00001', 'RCP-2627-00001', 'CN2627-00001', 'RPO2627-00001'].map(x => <span key={x} style={{ background: C.ground, borderRadius: 10, padding: '6px 10px' }}>{x}</span>)}
            </div>
          </div>

          <div style={{ position: 'sticky', bottom: vp.phone ? 80 : 0, display: 'flex', justifyContent: 'flex-end' }}>
            <Button kind="primary" size="lg" onClick={save} disabled={!dirty || busy}>{t('mn.st.save')}</Button>
          </div>
        </>
      )}

      {tab === 'prices' && (
        <React.Suspense fallback={<div style={{ color: C.faint }}>…</div>}>
          <BillingPage embedded initialView="FINANCE" />
        </React.Suspense>
      )}
      {tab === 'tax' && <TaxBillingSettings hospitalId={centre?.id} isOnline={isOnline} isMobile={vp.phone} />}
    </div>
  );
}
