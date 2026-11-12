import React from 'react';
import { useNavigate } from 'react-router-dom';
import { t } from '../../i18n';
import { Button, Chip } from '../../components/saral/Saral';
import { C, inr } from '../../components/saral/tokens';
import { apiError } from '../../components/saral/formUtil';
import { fetchOverview } from '../../api/billing/moneyApi';
import { istDay, istMonthStart } from './mnUtil';

/**
 * Money ▸ Overview (owner, accountant). Four numbers that always add up for the
 * bills made in the period — Billed = Collected + Still to collect, and what the
 * centre keeps after partner share — then the cash view, day by day, the tests
 * that bring the money and what needs the owner.
 */
const PERIODS = ['today', 'week', 'month', 'last'];
function periodRange(p) {
  if (p === 'today') return [istDay(0), istDay(0)];
  if (p === 'week') return [istDay(-6), istDay(0)];
  if (p === 'month') return [istMonthStart(), istDay(0)];
  const first = new Date(`${istMonthStart()}T00:00:00Z`);
  const lastEnd = new Date(first.getTime() - 86400000);
  const lastStart = new Date(Date.UTC(lastEnd.getUTCFullYear(), lastEnd.getUTCMonth(), 1));
  return [lastStart.toISOString().slice(0, 10), lastEnd.toISOString().slice(0, 10)];
}
const modeWord = (m) => (['CASH', 'UPI', 'CARD', 'BANK'].includes(m) ? t(`mn.pay.${m.toLowerCase()}`) : m);
const signed = (n) => (n < 0 ? `−${inr(-n)}` : inr(n));

function Big({ label, value, sub, colour, onClick }) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag type={onClick ? 'button' : undefined} onClick={onClick}
      style={{ textAlign: 'left', background: 'white', border: `1.5px solid ${C.line}`, borderRadius: 18, padding: '14px 16px', fontFamily: 'inherit',
        color: C.ink, cursor: onClick ? 'pointer' : 'default', display: 'grid', gap: 2 }}>
      <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: 1, color: C.faint }}>{label.toUpperCase()}</span>
      <span style={{ fontSize: 'clamp(20px, 5.4vw, 28px)', fontWeight: 800, color: colour || C.ink, lineHeight: 1.15 }}>{value}</span>
      <span style={{ fontSize: 13, color: C.muted }}>{sub}</span>
    </Tag>
  );
}

function DayBars({ days }) {
  const max = Math.max(1, ...days.map(d => Math.max(d.billed, d.received)));
  const W = 100 / Math.max(1, days.length);
  return (
    <div>
      <svg viewBox="0 0 100 40" preserveAspectRatio="none" style={{ width: '100%', height: 120, display: 'block' }} role="img" aria-label={t('mn.ov.days')}>
        {days.map((d, i) => (
          <g key={i}>
            <rect x={i * W + W * 0.12} y={40 - (d.billed / max) * 38} width={W * 0.36} height={(d.billed / max) * 38} fill={C.primary} opacity="0.85" />
            <rect x={i * W + W * 0.52} y={40 - (Math.max(0, d.received) / max) * 38} width={W * 0.36} height={(Math.max(0, d.received) / max) * 38} fill={C.ok} />
          </g>
        ))}
      </svg>
      <div style={{ display: 'flex', gap: 14, fontSize: 13, color: C.muted, marginTop: 6 }}>
        <span><span style={{ display: 'inline-block', width: 10, height: 10, background: C.primary, borderRadius: 2, marginRight: 6 }} />{t('mn.ov.legendBilled')}</span>
        <span><span style={{ display: 'inline-block', width: 10, height: 10, background: C.ok, borderRadius: 2, marginRight: 6 }} />{t('mn.ov.legendReceived')}</span>
        <span style={{ flex: 1 }} />
        {days.length > 0 && <span>{String(days[0].date).slice(5, 10)} → {String(days[days.length - 1].date).slice(5, 10)}</span>}
      </div>
    </div>
  );
}

export default function OverviewArea({ vp }) {
  const navigate = useNavigate();
  const [period, setPeriod] = React.useState('today');
  const [d, setD] = React.useState(null);
  const [err, setErr] = React.useState('');

  React.useEffect(() => {
    let alive = true;
    const [from, to] = periodRange(period);
    setD(null); setErr('');
    fetchOverview(from, to).then(r => { if (alive) setD(r); }).catch(e => { if (alive) setErr(apiError(e) || t('mn.ov.loadFailed')); });
    return () => { alive = false; };
  }, [period]);

  const needs = d ? [
    d.needs.approvals > 0 && { text: t('mn.ov.n.approvals', { n: d.needs.approvals }), go: '/approvals' },
    d.needs.oldDueBills > 0 && { text: t('mn.ov.n.old', { n: d.needs.oldDueBills, amount: inr(d.needs.oldDueAmount) }), go: '/money/bills' },
    d.needs.daysNotClosed > 0 && { text: t('mn.ov.n.days', { n: d.needs.daysNotClosed }), go: '/money/book' },
    d.needs.tdsNotSet && { text: t('mn.ov.n.tds'), go: '/money/setup' },
  ].filter(Boolean) : [];
  const card = { background: 'white', border: `1.5px solid ${C.line}`, borderRadius: 18, padding: '14px 16px' };
  const lab = { fontSize: 13, fontWeight: 800, letterSpacing: 1, color: C.faint, marginBottom: 8 };

  return (
    <div style={{ flex: 1, minWidth: 0, overflowY: 'auto', padding: vp.phone ? '12px 12px 90px' : '18px 22px 24px', display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gridAutoRows: 'max-content', gap: 14, alignContent: 'start' }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 260px' }}>
          <div style={{ fontSize: vp.phone ? 22 : 26, fontWeight: 800 }}>{t('mn.ov.title')}</div>
          <div style={{ fontSize: 15, color: C.muted }}>{t('mn.ov.help')}</div>
        </div>
        <div style={{ display: 'flex', gap: 8, overflowX: 'auto', minWidth: 0, maxWidth: '100%' }}>
          {PERIODS.map(p => <Chip key={p} on={period === p} onClick={() => setPeriod(p)}>{t(`mn.ov.p.${p}`)}</Chip>)}
        </div>
      </div>

      {err && <div role="alert" style={{ background: C.dangerSoft, color: C.danger, borderRadius: 14, padding: 14, fontWeight: 700 }}>{err}</div>}
      {!d && !err && <div style={{ color: C.faint }}>…</div>}

      {d && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: vp.phone ? 'repeat(2, minmax(0,1fr))' : 'repeat(4, minmax(0,1fr))', gap: 10 }}>
            <Big label={t('mn.ov.billed')} value={inr(d.billed)} sub={t('mn.ov.billedSub', { n: d.bills, amount: inr(d.discounts) })} />
            <Big label={t('mn.ov.collected')} value={inr(d.collected)} sub={t('mn.ov.collectedSub')} colour={C.ok} />
            <Big label={t('mn.ov.due')} value={inr(d.due)} sub={t('mn.ov.dueSub')} colour={C.due} onClick={() => navigate('/money/bills')} />
            <Big label={t('mn.ov.keeps')} value={inr(d.centreKeeps)} sub={t('mn.ov.keepsSub', { amount: inr(d.partnerShare) })} />
          </div>
          {d.cancelled > 0 && <div style={{ fontSize: 13, color: C.faint, marginTop: -6 }}>{t('mn.ov.cancelled', { n: d.cancelled })}</div>}

          <div style={{ display: 'grid', gridTemplateColumns: vp.desktop ? '1.2fr 1fr' : '1fr', gap: 12 }}>
            <div style={card}>
              <div style={lab}>{t('mn.ov.received').toUpperCase()}</div>
              <div style={{ fontSize: 24, fontWeight: 800 }}>{signed(d.received)}</div>
              <div style={{ fontSize: 13, color: C.muted, marginBottom: 8 }}>{t('mn.ov.receivedSub')}</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {d.receivedByMode.map(m => (
                  <span key={m.mode} style={{ background: C.ground, borderRadius: 12, padding: '6px 12px', fontSize: 15 }}>
                    {modeWord(m.mode)} <b>{signed(m.net)}</b>
                  </span>
                ))}
                <span style={{ background: C.ground, borderRadius: 12, padding: '6px 12px', fontSize: 15 }}>{t('mn.ov.expenses')} <b>{inr(d.expensesPaid)}</b></span>
              </div>
              {d.days.length > 1 && <div style={{ marginTop: 14 }}><DayBars days={d.days} /></div>}
            </div>

            <div style={card}>
              <div style={lab}>{t('mn.ov.needs').toUpperCase()}</div>
              {!needs.length && <div style={{ color: C.ok, fontWeight: 700 }}>{t('mn.ov.n.none')}</div>}
              {needs.map((n, i) => (
                <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '8px 0', borderTop: i ? `1px solid #F3F4F6` : 'none' }}>
                  <span style={{ flex: 1, fontSize: 15, fontWeight: 600 }}>{n.text}</span>
                  <Button kind="quiet" onClick={() => navigate(n.go)}>{t('mn.ov.open')}</Button>
                </div>
              ))}
            </div>
          </div>

          <div style={card}>
            <div style={lab}>{t('mn.ov.tests').toUpperCase()}</div>
            {d.tests.map((x, i) => {
              const pct = d.tests[0]?.billed ? (x.billed / d.tests[0].billed) * 100 : 0;
              return (
                <div key={i} style={{ display: 'grid', gridTemplateColumns: vp.phone ? '1fr auto' : 'minmax(0,1.4fr) minmax(0,2fr) 110px', gap: 10, alignItems: 'center', padding: '6px 0' }}>
                  <span style={{ fontSize: 15, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {x.test} <span style={{ fontWeight: 500, color: C.faint, fontSize: 13 }}>· {t('mn.ov.patients', { n: x.count })}</span>
                  </span>
                  {!vp.phone && <span style={{ height: 10, background: '#EEF2FF', borderRadius: 5, overflow: 'hidden' }}><span style={{ display: 'block', height: '100%', width: `${pct}%`, background: C.primary }} /></span>}
                  <span style={{ textAlign: 'right', fontWeight: 800 }}>{inr(x.billed)}</span>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
