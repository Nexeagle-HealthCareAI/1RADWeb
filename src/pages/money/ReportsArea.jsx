import React from 'react';
import { useNavigate } from 'react-router-dom';
import { t } from '../../i18n';
import { Button, Chip } from '../../components/saral/Saral';
import { C, inr } from '../../components/saral/tokens';
import { apiError, fieldStyle } from '../../components/saral/formUtil';
import { downloadMonthPack } from '../../api/billing/moneyApi';
import { downloadGstr1, fetchCreditNotes } from '../../api/billing/creditNotesApi';
import { printCreditNote } from '../../utils/billing/printHandlers';
import { istDate, istDay } from './mnUtil';

const BillingPage = React.lazy(() => import('../BillingPage'));

/**
 * Money ▸ Reports. Pick the month, then the report. Downloads come from the server
 * (month pack, GST sheet) so they always hold every row; the rest open the screen
 * that already shows them, so there is one place for each number.
 */
function monthOf(offset) {
  const [y, m] = istDay(0).split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + offset, 1));
  return d.toISOString().slice(0, 7);
}
function save(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export default function ReportsArea({ toast, vp, printCtx }) {
  const navigate = useNavigate();
  const [month, setMonth] = React.useState(monthOf(-1));
  const [busy, setBusy] = React.useState('');
  const [cn, setCn] = React.useState(null);
  const [charts, setCharts] = React.useState(false);

  const [y, m] = month.split('-').map(Number);
  const from = `${month}-01`;
  const to = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);

  React.useEffect(() => { setCn(null); }, [month]);

  const run = async (id, fn) => {
    setBusy(id);
    try { await fn(); } catch (e) { toast.show(apiError(e) || t('mn.rp.failed')); } finally { setBusy(''); }
  };
  const cards = [
    { id: 'pack', who: 'acc', label: 'mn.rp.download', act: () => run('pack', async () => save(await downloadMonthPack(month), `Month-pack-${month}.xlsx`)) },
    { id: 'gst', who: 'acc', label: 'mn.rp.download', act: () => run('gst', async () => { const f = await downloadGstr1(month); save(f.blob, f.name); }) },
    { id: 'cn', who: 'acc', label: 'mn.rp.open', act: () => run('cn', async () => setCn(await fetchCreditNotes({ from, to }) || [])) },
    { id: 'tests', who: 'owner', label: 'mn.rp.open', act: () => navigate('/money/overview') },
    { id: 'partners', who: 'owner', label: 'mn.rp.open', act: () => navigate('/money/partners') },
    { id: 'due', who: 'owner', label: 'mn.rp.open', act: () => navigate('/money/bills') },
    { id: 'charts', who: 'owner', label: 'mn.rp.open', act: () => setCharts(c => !c) },
    { id: 'services', who: 'owner', label: 'mn.rp.open', act: () => navigate('/money/tools?tab=SERVICES') },
    { id: 'tools', who: 'acc', label: 'mn.rp.open', act: () => navigate('/money/tools') },
  ];
  const title = { pack: 'mn.rp.pack', gst: 'mn.rp.gst', cn: 'mn.rp.cn', tests: 'mn.rp.tests', partners: 'mn.rp.partners', due: 'mn.rp.due', charts: 'mn.rp.charts', services: 'mn.rp.services', tools: 'mn.rp.tools' };

  return (
    <div style={{ flex: 1, minWidth: 0, overflowY: 'auto', padding: vp.phone ? '12px 12px 90px' : '18px 22px 24px', display: 'grid', gridTemplateColumns: 'minmax(0,1fr)', gridAutoRows: 'max-content', gap: 14, alignContent: 'start' }}>
      <div>
        <div style={{ fontSize: vp.phone ? 22 : 26, fontWeight: 800 }}>{t('mn.rp.title')}</div>
        <div style={{ fontSize: 15, color: C.muted }}>{t('mn.rp.help')}</div>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <Chip on={month === monthOf(0)} onClick={() => setMonth(monthOf(0))}>{t('mn.rp.thisMonth')}</Chip>
        <Chip on={month === monthOf(-1)} onClick={() => setMonth(monthOf(-1))}>{t('mn.rp.lastMonth')}</Chip>
        <input type="month" aria-label={t('mn.rp.pick')} value={month} max={monthOf(0)}
          onChange={e => e.target.value && setMonth(e.target.value)} style={{ ...fieldStyle, width: 190, height: 44 }} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: vp.desktop ? 'repeat(2, minmax(0,1fr))' : 'minmax(0,1fr)', gap: 10 }}>
        {cards.map(c => (
          <div key={c.id} style={{ background: 'white', border: `1.5px solid ${C.line}`, borderRadius: 16, padding: '14px 16px', display: 'flex', gap: 12, alignItems: 'center' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <span style={{ fontSize: 17, fontWeight: 800 }}>{t(title[c.id])}</span>
                <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: 0.6, padding: '2px 8px', borderRadius: 999, background: '#F3F4F6', color: '#374151' }}>{t(`mn.rp.who.${c.who}`)}</span>
              </div>
              <div style={{ fontSize: 14, color: C.muted, lineHeight: 1.4 }}>{t(`${title[c.id]}Sub`)}</div>
            </div>
            <Button kind={c.label === 'mn.rp.download' ? 'ok' : 'quiet'} onClick={c.act} disabled={!!busy}>{busy === c.id ? '…' : t(c.label)}</Button>
          </div>
        ))}
      </div>

      {cn && (
        <div style={{ background: 'white', border: `1.5px solid ${C.line}`, borderRadius: 16, overflow: 'hidden' }}>
          <div style={{ padding: '12px 14px', fontSize: 17, fontWeight: 800 }}>{t('mn.rp.cn')}</div>
          {!cn.length && <div style={{ padding: '0 14px 14px', color: C.faint }}>{t('mn.rp.noCn')}</div>}
          {cn.map(n => (
            <div key={n.id} style={{ display: 'flex', gap: 10, padding: '10px 14px', borderTop: '1px solid #F3F4F6', alignItems: 'center' }}>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block', fontWeight: 700 }}>{n.number} · {n.patientName} · {n.invoiceNumber}</span>
                <span style={{ display: 'block', fontSize: 13, color: C.faint }}>{istDate(n.createdAt)} · {n.reason}{n.issuedBy ? ` · ${n.issuedBy}` : ''}</span>
              </span>
              <span style={{ fontWeight: 800, color: C.danger }}>−{inr(n.amount)}</span>
              <Button kind="quiet" icon="print" onClick={() => printCreditNote(n, { activeCenter: printCtx?.activeCenter, taxProfile: printCtx?.taxProfile })}>{t('mn.rp.print')}</Button>
            </div>
          ))}
        </div>
      )}

      {charts && (
        <React.Suspense fallback={<div style={{ color: C.faint }}>…</div>}>
          <BillingPage embedded initialView="ANALYTICS" />
        </React.Suspense>
      )}
    </div>
  );
}
