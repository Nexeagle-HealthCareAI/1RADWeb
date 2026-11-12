import React from 'react';
import { useNavigate } from 'react-router-dom';
import { t } from '../../i18n';
import { Button, Chip, Tag } from '../../components/saral/Saral';
import { C, inr } from '../../components/saral/tokens';
import { apiError } from '../../components/saral/formUtil';
import { fetchGlance } from '../../api/billing/moneyApi';
import { istDay } from './mnUtil';

/**
 * Money ▸ Overview: the centre at a glance (rebuilt Nov 2026).
 * One money idea throughout — money in: what was actually received, as the Cash
 * book counts it. Top: today against yesterday and the same day last week. Then
 * the month so far as one plain sum (money in − expenses − partners' share =
 * what the centre earned) against the same days of last month, what needs you,
 * and the month by modality and by referrer.
 */
const signed = (n) => (n < 0 ? `−${inr(-n)}` : inr(n));
const tn = (k, v = {}) => (v.n === 1 ? t(`${k}.one`, v) : t(k, v));
const modeWord = (m) => (['CASH', 'UPI', 'CARD', 'BANK'].includes(m) ? t(`mn.pay.${m.toLowerCase()}`) : m);
const dayName = (d) => new Date(`${String(d).slice(0, 10)}T00:00:00Z`).toLocaleDateString('en-IN', { weekday: 'short', timeZone: 'UTC' });
const shortDate = (d) => new Date(`${String(d).slice(0, 10)}T00:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const range = (a, b) => (String(a).slice(0, 10) === String(b).slice(0, 10) ? shortDate(a) : `${shortDate(a)} – ${shortDate(b)}`);
const monthOf = (offset) => { const [y, m] = istDay(0).split('-').map(Number); return new Date(Date.UTC(y, m - 1 + offset, 1)).toISOString().slice(0, 7); };

/** ↑ 12% / ↓ 8% / same / new. `good` = higher is better. */
function Delta({ now, before, good = true }) {
  const n = Number(now) || 0; const b = Number(before) || 0;
  let text; let up = null;
  if (Math.abs(n - b) < 0.5) text = t('gl.same');
  else if (Math.abs(b) < 0.5) { text = t('gl.new'); up = n > 0; }
  else { const p = Math.round(((n - b) / Math.abs(b)) * 100); up = n > b; text = `${up ? '↑' : '↓'} ${Math.abs(p) > 999 ? '999+' : Math.abs(p)}%`; }
  const colour = up == null ? C.faint : (up === good ? C.ok : C.danger);
  return <span style={{ fontWeight: 800, color: colour, whiteSpace: 'nowrap' }}>{text}</span>;
}

const card = { background: 'white', border: `1.5px solid ${C.line}`, borderRadius: 18, padding: '14px 16px', minWidth: 0 };
const lab = { fontSize: 12, fontWeight: 800, letterSpacing: 1, color: C.faint };

function Tile({ label, value, colour, children, onClick }) {
  const T = onClick ? 'button' : 'div';
  return (
    <T type={onClick ? 'button' : undefined} onClick={onClick}
      style={{ ...card, textAlign: 'left', fontFamily: 'inherit', color: C.ink, cursor: onClick ? 'pointer' : 'default', display: 'grid', gap: 4, alignContent: 'start' }}>
      <span style={lab}>{label.toUpperCase()}</span>
      <span style={{ fontSize: 'clamp(22px, 5.6vw, 32px)', fontWeight: 800, lineHeight: 1.1, color: colour || C.ink }}>{value}</span>
      <span style={{ fontSize: 13, color: C.muted, display: 'grid', gap: 2 }}>{children}</span>
    </T>
  );
}

function Bars({ days }) {
  const max = Math.max(1, ...days.map(d => Math.max(0, d.moneyIn)));
  const W = 100 / Math.max(1, days.length);
  return (
    <div>
      <svg viewBox="0 0 100 36" preserveAspectRatio="none" style={{ width: '100%', height: 96, display: 'block' }} role="img" aria-label={t('gl.days')}>
        {days.map((d, i) => {
          const h = (Math.max(0, d.moneyIn) / max) * 34;
          return <rect key={i} x={i * W + W * 0.18} y={36 - h} width={W * 0.64} height={h} rx="0.6" fill={i === days.length - 1 ? C.ok : C.primary} opacity={i === days.length - 1 ? 1 : 0.8} />;
        })}
      </svg>
      <div style={{ display: 'flex', fontSize: 12, color: C.faint, marginTop: 4 }}>
        <span>{shortDate(days[0].date)}</span><span style={{ flex: 1 }} /><span>{shortDate(days[days.length - 1].date)}</span>
      </div>
    </div>
  );
}

export default function OverviewArea({ vp }) {
  const navigate = useNavigate();
  const [month, setMonth] = React.useState(monthOf(0));
  const [d, setD] = React.useState(null);
  const [err, setErr] = React.useState('');
  const [ver, setVer] = React.useState(0);

  React.useEffect(() => {
    let alive = true;
    setErr('');
    fetchGlance(month).then(r => {
      if (!alive) return;
      // An older API (before finance/glance) answers with something else: say so instead of breaking.
      if (!r || !r.today || !r.month) { setD(null); setErr(t('gl.failed')); return; }
      setD(r);
    }).catch(e => { if (alive) setErr(apiError(e) || t('gl.failed')); });
    return () => { alive = false; };
  }, [month, ver]);

  const pad = vp.phone ? '12px 12px 90px' : '18px 22px 24px';
  if (err) {
    return (
      <div style={{ padding: pad }}>
        <div role="alert" style={{ background: C.dangerSoft, color: C.danger, borderRadius: 14, padding: 14, fontWeight: 700, display: 'flex', gap: 10, alignItems: 'center' }}>
          <span style={{ flex: 1 }}>{err}</span><Button kind="quiet" onClick={() => setVer(v => v + 1)}>{t('gl.retry')}</Button>
        </div>
      </div>
    );
  }
  if (!d) return <div style={{ padding: pad, color: C.faint }}>…</div>;

  const td = d.today; const mo = d.month; const nw = mo.now; const bf = mo.before; const nd = d.needs;
  const isThis = month === monthOf(0);
  const needs = [
    nd.approvals > 0 && { k: 'a', text: t('gl.n.approvals', { n: nd.approvals }), go: '/approvals', hot: true },
    nd.lateReports > 0 && { k: 'l', text: tn('gl.n.late', { n: nd.lateReports }), go: '/doctor-board', hot: true },
    nd.daysNotClosed > 0 && { k: 'd', text: tn('gl.n.days', { n: nd.daysNotClosed }), go: '/money/book' },
    nd.unpaidBills > 0 && { k: 'u', text: t('gl.n.unpaid', { n: nd.unpaidBills, amount: inr(nd.unpaidAmount) }),
      sub: nd.oldDueBills > 0 ? t('gl.n.old', { n: nd.oldDueBills, amount: inr(nd.oldDueAmount) }) : null, go: '/money/bills' },
    nd.partnersUnpaid > 0.5 && { k: 'p', text: t('gl.n.partners', { amount: inr(nd.partnersUnpaid) }), go: '/money/partners' },
    nd.expensesToPay > 0 && { k: 'e', text: t('gl.n.expenses', { n: nd.expensesToPay, amount: inr(nd.expensesToPayAmount) }), go: '/money/exp' },
    nd.tdsNotSet && { k: 't', text: t('gl.n.tds'), go: '/money/setup' },
  ].filter(Boolean);
  const maxMod = Math.max(1, ...d.modalities.map(m => m.money));
  const sumLine = (label, now, before, sign, good) => (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto 64px', gap: 10, alignItems: 'baseline', padding: '6px 0', borderTop: '1px solid #F3F4F6' }}>
      <span style={{ fontSize: 15, color: C.muted, fontWeight: 600 }}>{sign && <span style={{ display: 'inline-block', width: 16 }}>{sign}</span>}{label}</span>
      <span style={{ fontSize: 17, fontWeight: 800, textAlign: 'right' }}>{inr(now)}</span>
      <span style={{ fontSize: 13, textAlign: 'right' }}><Delta now={now} before={before} good={good} /></span>
    </div>
  );

  return (
    <div style={{ flex: 1, minWidth: 0, overflowY: 'auto', padding: pad, display: 'grid', gridTemplateColumns: 'minmax(0,1fr)', gridAutoRows: 'max-content', gap: 14, alignContent: 'start' }}>
      <div>
        <div style={{ fontSize: vp.phone ? 22 : 26, fontWeight: 800 }}>{t('gl.title')}</div>
        <div style={{ fontSize: 15, color: C.muted }}>{t('gl.help')}</div>
      </div>

      {/* ── Today */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
        <span style={{ fontSize: 18, fontWeight: 800 }}>{t('gl.today')}</span>
        <span style={{ fontSize: 14, color: C.faint }}>{dayName(td.date)}, {shortDate(td.date)}</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: vp.phone ? 'repeat(2, minmax(0,1fr))' : 'repeat(4, minmax(0,1fr))', gap: 10, marginTop: -6 }}>
        <Tile label={t('gl.patients')} value={td.patients}>
          <span>{t('gl.vsY', { v: '' })}{td.yesterday.patients} · <Delta now={td.patients} before={td.yesterday.patients} /></span>
          <span>{t('gl.vsW', { day: dayName(td.date), v: '' })}{td.lastWeek.patients} · <Delta now={td.patients} before={td.lastWeek.patients} /></span>
          <span>{t('gl.reports', { n: td.reportsGiven })}</span>
        </Tile>
        <Tile label={t('gl.moneyIn')} value={signed(td.moneyIn)} colour={C.ok} onClick={() => navigate('/money/book')}>
          <span>{t('gl.vsY', { v: '' })}{inr(td.yesterday.moneyIn)} · <Delta now={td.moneyIn} before={td.yesterday.moneyIn} /></span>
          <span>{t('gl.vsW', { day: dayName(td.date), v: '' })}{inr(td.lastWeek.moneyIn)} · <Delta now={td.moneyIn} before={td.lastWeek.moneyIn} /></span>
          <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 2 }}>
            {td.byMode.map(m => <span key={m.mode} style={{ background: C.ground, borderRadius: 8, padding: '1px 8px', color: C.ink }}>{modeWord(m.mode)} <b>{signed(m.amount)}</b></span>)}
          </span>
        </Tile>
        <Tile label={t('gl.drawer')} value={signed(td.cashInDrawer)} onClick={() => navigate('/money/book')}>
          <span>{t('gl.opening', { amount: inr(td.openingCash) })}</span>
          <span style={{ marginTop: 2 }}>{td.closed
            ? <Tag bg={C.okSoft} fg={C.ok} style={{ fontSize: 12, padding: '2px 10px' }}>✓ {t('gl.closed')}</Tag>
            : <Tag bg={C.dueSoft} fg={C.dueInk} style={{ fontSize: 12, padding: '2px 10px' }}>{t('gl.notClosed')}</Tag>}</span>
        </Tile>
        <Tile label={t('gl.toCollect')} value={td.toCollect > 0.5 ? inr(td.toCollect) : t('gl.allPaid')} colour={td.toCollect > 0.5 ? C.due : C.ok} onClick={() => navigate('/money/counter')}>
          <span>{tn('gl.bills', { n: td.bills })}</span>
        </Tile>
      </div>

      {/* ── The month, and what needs you */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
        <span style={{ fontSize: 18, fontWeight: 800, marginRight: 4 }}>{isThis ? t('gl.month') : t('gl.monthPast')}</span>
        <Chip on={isThis} onClick={() => setMonth(monthOf(0))}>{t('gl.thisMonth')}</Chip>
        <Chip on={month === monthOf(-1)} onClick={() => setMonth(monthOf(-1))}>{t('gl.lastMonth')}</Chip>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: vp.desktop ? 'minmax(0,1.25fr) minmax(0,1fr)' : 'minmax(0,1fr)', gap: 12, marginTop: -6 }}>
        <div style={{ ...card, display: 'grid', gap: 6, alignContent: 'start' }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
            <span style={lab}>{range(mo.from, mo.to).toUpperCase()}</span>
            <span style={{ fontSize: 13, color: C.faint }}>{t('gl.vsRange', { range: range(mo.prevFrom, mo.prevTo) })}</span>
          </div>
          {sumLine(t('gl.moneyIn'), nw.moneyIn, bf.moneyIn, '', true)}
          {sumLine(t('gl.minusExp'), nw.expenses, bf.expenses, '−', false)}
          {sumLine(t('gl.minusShare'), nw.partnerShare, bf.partnerShare, '−', false)}
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto 64px', gap: 10, alignItems: 'baseline', padding: '10px 12px', margin: '4px -6px 0', background: nw.earned >= 0 ? C.okSoft : C.dangerSoft, borderRadius: 12 }}>
            <span style={{ fontSize: 16, fontWeight: 800 }}><span style={{ display: 'inline-block', width: 16 }}>=</span>{t('gl.earned')}</span>
            <span style={{ fontSize: 24, fontWeight: 800, color: nw.earned >= 0 ? C.ok : C.danger, textAlign: 'right' }}>{signed(nw.earned)}</span>
            <span style={{ fontSize: 13, textAlign: 'right' }}><Delta now={nw.earned} before={bf.earned} /></span>
          </div>
          <div style={{ fontSize: 12, color: C.faint }}>{t('gl.earnedHelp')}</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', fontSize: 14, color: C.muted, marginTop: 2 }}>
            <span style={{ background: C.ground, borderRadius: 10, padding: '4px 10px' }}>{t('gl.mPatients', { n: nw.patients })} · <Delta now={nw.patients} before={bf.patients} /></span>
            <span style={{ background: C.ground, borderRadius: 10, padding: '4px 10px' }}>{t('gl.mBills', { n: nw.bills })}</span>
            {nw.discounts > 0.5 && <span style={{ background: C.ground, borderRadius: 10, padding: '4px 10px' }}>{t('gl.mDisc', { amount: inr(nw.discounts) })}</span>}
          </div>
          {mo.days.length > 1 && <div style={{ marginTop: 8 }}><div style={{ ...lab, marginBottom: 4 }}>{t('gl.days').toUpperCase()}</div><Bars days={mo.days} /></div>}
        </div>

        <div style={{ ...card, display: 'grid', gap: 0, alignContent: 'start' }}>
          <div style={{ ...lab, marginBottom: 6 }}>{t('gl.needs').toUpperCase()}</div>
          {!needs.length && <div style={{ color: C.ok, fontWeight: 700, padding: '6px 0' }}>✓ {t('gl.allClear')}</div>}
          {needs.map((n, i) => (
            <div key={n.k} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '8px 0', borderTop: i ? '1px solid #F3F4F6' : 'none' }}>
              <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: 4, background: n.hot ? C.due : C.lineStrong, flexShrink: 0 }} />
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: 15, fontWeight: 700 }}>{n.text}</span>
                {n.sub && <span style={{ display: 'block', fontSize: 13, color: C.dueInk }}>{n.sub}</span>}
              </span>
              <Button kind="quiet" onClick={() => navigate(n.go)}>{t('gl.open')}</Button>
            </div>
          ))}
        </div>
      </div>

      {/* ── By modality, by referrer */}
      <div style={{ display: 'grid', gridTemplateColumns: vp.desktop ? 'repeat(2, minmax(0,1fr))' : 'minmax(0,1fr)', gap: 12 }}>
        <div style={card}>
          <div style={lab}>{t('gl.modality').toUpperCase()}</div>
          <div style={{ fontSize: 13, color: C.faint, marginBottom: 8 }}>{t('gl.modalityHelp')}</div>
          {!d.modalities.length && <div style={{ color: C.faint }}>{t('gl.noData')}</div>}
          {d.modalities.map(m => (
            <div key={m.modality} style={{ display: 'grid', gridTemplateColumns: 'minmax(84px, 0.9fr) minmax(0, 1.4fr) auto', gap: 10, alignItems: 'center', padding: '7px 0', borderTop: '1px solid #F3F4F6' }}>
              <span style={{ minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: 15, fontWeight: 800 }}>{m.modality}</span>
                <span style={{ display: 'block', fontSize: 13, color: C.faint }}>{t('gl.refPatients', { n: m.patients })}</span>
              </span>
              <span style={{ height: 10, background: C.primarySoft, borderRadius: 5, overflow: 'hidden' }}>
                <span style={{ display: 'block', height: '100%', width: `${Math.max(2, (m.money / maxMod) * 100)}%`, background: C.primary, borderRadius: 5 }} />
              </span>
              <span style={{ textAlign: 'right', minWidth: 92 }}>
                <span style={{ display: 'block', fontSize: 15, fontWeight: 800 }}>{inr(m.money)}</span>
                <span style={{ display: 'block', fontSize: 12 }}><Delta now={m.money} before={m.prevMoney} /></span>
              </span>
            </div>
          ))}
        </div>
        <div style={card}>
          <div style={lab}>{t('gl.referrers').toUpperCase()}</div>
          <div style={{ fontSize: 13, color: C.faint, marginBottom: 8 }}>{t('gl.referrersHelp')}</div>
          {!d.referrers.length && <div style={{ color: C.faint }}>{t('gl.noRef')}</div>}
          {d.referrers.map((r, i) => (
            <div key={r.referrerId || i} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '7px 0', borderTop: '1px solid #F3F4F6' }}>
              <span style={{ width: 26, height: 26, borderRadius: 13, background: i === 0 ? C.primary : C.primarySoft, color: i === 0 ? 'white' : C.primary,
                fontSize: 13, fontWeight: 800, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{i + 1}</span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: 15, fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</span>
                <span style={{ display: 'block', fontSize: 13, color: C.faint }}>{t('gl.refPatients', { n: r.patients })} · {t('gl.refShare', { amount: inr(r.share) })}</span>
              </span>
              <span style={{ fontSize: 15, fontWeight: 800 }}>{inr(r.billed)}</span>
            </div>
          ))}
          {d.referrers.length > 0 && <Button kind="quiet" onClick={() => navigate('/money/partners')} style={{ marginTop: 8 }}>{t('gl.allPartners')}</Button>}
        </div>
      </div>
    </div>
  );
}
