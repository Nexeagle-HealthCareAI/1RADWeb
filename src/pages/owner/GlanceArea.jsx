import React from 'react';
import { t } from '../../i18n';
import { Button, Chip, Tag } from '../../components/saral/Saral';
import { C, inr } from '../../components/saral/tokens';
import { apiError } from '../../components/saral/formUtil';
import { fetchGlance } from '../../api/billing/ownerApi';
import { LINK_COLOURS, PERIODS, linkWord, pctOf, periodRange, tn } from './owUtil';

/**
 * Owner board ▸ At a glance. Totals for every centre (the same four numbers as
 * Money ▸ Overview: Billed = Collected + Still to collect; Centres keep = Billed −
 * partner share), then one card per centre, or every centre side by side.
 */
function Big({ label, value, sub, colour }) {
  return (
    <div style={{ background: 'white', border: `1.5px solid ${C.line}`, borderRadius: 18, padding: '14px 16px', display: 'grid', gap: 2, minWidth: 0 }}>
      <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: 1, color: C.faint }}>{label.toUpperCase()}</span>
      <span style={{ fontSize: 'clamp(20px, 5.4vw, 30px)', fontWeight: 800, color: colour || C.ink, lineHeight: 1.15 }}>{value}</span>
      {sub && <span style={{ fontSize: 13, color: C.muted }}>{sub}</span>}
    </div>
  );
}

/** Billed split into collected (green) and still to collect (orange). */
function SplitBar({ collected, due }) {
  const total = collected + due;
  const c = total > 0 ? (collected / total) * 100 : 0;
  return (
    <div aria-hidden="true" style={{ display: 'flex', height: 10, borderRadius: 5, overflow: 'hidden', background: '#F3F4F6' }}>
      <span style={{ width: `${c}%`, background: C.ok }} />
      <span style={{ width: `${total > 0 ? 100 - c : 0}%`, background: C.due, opacity: 0.85 }} />
    </div>
  );
}

export function needsOf(row) {
  const n = row.money.needs;
  return [
    n.approvals > 0 && { k: 'approvals', text: t('ow.n.approvals', { n: n.approvals }), route: '/owner/needs', here: true },
    row.lateReports > 0 && { k: 'late', text: tn('ow.n.late', { n: row.lateReports }), route: '/doctor-board' },
    n.daysNotClosed > 0 && { k: 'days', text: tn('ow.n.days', { n: n.daysNotClosed }), route: '/money/book' },
    n.oldDueBills > 0 && { k: 'old', text: t('ow.n.old', { n: n.oldDueBills, amount: inr(n.oldDueAmount) }), route: '/money/bills' },
    n.tdsNotSet && { k: 'tds', text: t('ow.n.tds'), route: '/money/setup' },
  ].filter(Boolean);
}

function CentreCard({ row, all, openCentre, opening, vp }) {
  const m = row.money;
  const link = linkWord(row.centre, all);
  const needs = needsOf(row);
  return (
    <div style={{ background: 'white', border: `1.5px solid ${C.line}`, borderRadius: 20, padding: '16px 16px 14px', display: 'grid', gap: 10, alignContent: 'start' }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 19, fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.centre.name}</div>
          {row.centre.groupName && <div style={{ fontSize: 13, color: C.faint }}>{row.centre.groupName}</div>}
        </div>
        <Tag bg={LINK_COLOURS[link.kind].bg} fg={LINK_COLOURS[link.kind].fg} style={{ fontSize: 12, padding: '3px 10px', whiteSpace: 'nowrap' }}>{link.word}</Tag>
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 28, fontWeight: 800 }}>{inr(m.billed)}</span>
        <span style={{ fontSize: 14, color: C.faint }}>{t('ow.t.billed').toLowerCase()} · {tn('ow.c.bills', { n: m.bills })}</span>
      </div>
      <SplitBar collected={m.collected} due={m.due} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: 8, fontSize: 14 }}>
        <div><div style={{ color: C.faint, fontSize: 12, fontWeight: 700 }}>{t('ow.t.collected')}</div><div style={{ fontWeight: 800, color: C.ok }}>{inr(m.collected)}</div></div>
        <div><div style={{ color: C.faint, fontSize: 12, fontWeight: 700 }}>{t('ow.t.due')}</div><div style={{ fontWeight: 800, color: m.due > 0.009 ? C.due : C.ink }}>{inr(m.due)}</div></div>
        <div><div style={{ color: C.faint, fontSize: 12, fontWeight: 700 }}>{t('ow.cmp.keeps')}</div><div style={{ fontWeight: 800 }}>{inr(m.centreKeeps)}</div></div>
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', minHeight: 28 }}>
        {needs.length === 0 && <span style={{ fontSize: 13, color: C.ok, fontWeight: 700 }}>✓ {t('ow.c.allClear')}</span>}
        {needs.map(n => (
          <span key={n.k} style={{ fontSize: 13, fontWeight: 700, padding: '3px 10px', borderRadius: 999, background: n.k === 'approvals' ? C.dueSoft : '#F3F4F6', color: n.k === 'approvals' ? C.dueInk : '#374151' }}>{n.text}</span>
        ))}
      </div>
      <Button kind="quiet" onClick={() => openCentre(row.centre.hospitalId)} disabled={!!opening} style={{ justifySelf: vp.phone ? 'stretch' : 'start' }}>
        {opening === row.centre.hospitalId ? t('ow.c.opening') : t('ow.c.open')}
      </Button>
    </div>
  );
}

function CompareTable({ rows, totals }) {
  const lines = [
    ['ow.cmp.bills', r => String(r.bills), totals.bills != null ? String(totals.bills) : ''],
    ['ow.cmp.billed', r => inr(r.billed), inr(totals.billed), true],
    ['ow.cmp.collected', r => inr(r.collected), inr(totals.collected)],
    ['ow.cmp.due', r => inr(r.due), inr(totals.due)],
    ['ow.cmp.rate', r => `${pctOf(r.collected, r.billed)}%`, `${pctOf(totals.collected, totals.billed)}%`],
    ['ow.cmp.share', r => inr(r.partnerShare), inr(totals.partnerShare)],
    ['ow.cmp.keeps', r => inr(r.centreKeeps), inr(totals.centreKeeps), true],
    ['ow.cmp.received', r => inr(r.received), inr(totals.received)],
    ['ow.cmp.expenses', r => inr(r.expensesPaid), inr(totals.expensesPaid)],
  ];
  const cell = { padding: '10px 12px', borderTop: '1px solid #F3F4F6', textAlign: 'right', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' };
  return (
    <div style={{ background: 'white', border: `1.5px solid ${C.line}`, borderRadius: 18, overflowX: 'auto' }}>
      <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 15 }}>
        <thead>
          <tr>
            <th style={{ ...cell, borderTop: 'none', textAlign: 'left', fontSize: 12, letterSpacing: 1, color: C.faint, position: 'sticky', left: 0, background: 'white' }}>{t('ow.cmp.measure').toUpperCase()}</th>
            {rows.map(r => <th key={r.centre.hospitalId} style={{ ...cell, borderTop: 'none', fontWeight: 800 }}>{r.centre.name}</th>)}
            <th style={{ ...cell, borderTop: 'none', fontWeight: 800, background: C.ground }}>{t('ow.cmp.total')}</th>
          </tr>
        </thead>
        <tbody>
          {lines.map(([k, f, tot, strong]) => (
            <tr key={k}>
              <td style={{ ...cell, textAlign: 'left', fontWeight: 700, color: C.muted, position: 'sticky', left: 0, background: 'white' }}>{t(k)}</td>
              {rows.map(r => <td key={r.centre.hospitalId} style={{ ...cell, fontWeight: strong ? 800 : 500 }}>{f(r.money)}</td>)}
              <td style={{ ...cell, fontWeight: 800, background: C.ground }}>{tot}</td>
            </tr>
          ))}
          <tr>
            <td style={{ ...cell, textAlign: 'left', fontWeight: 700, color: C.muted, position: 'sticky', left: 0, background: 'white' }}>{t('ow.cmp.late')}</td>
            {rows.map(r => <td key={r.centre.hospitalId} style={{ ...cell, fontWeight: 800, color: r.lateReports > 0 ? C.due : C.ink }}>{r.lateReports}</td>)}
            <td style={{ ...cell, fontWeight: 800, background: C.ground }}>{totals.lateReports}</td>
          </tr>
          <tr>
            <td style={{ ...cell, textAlign: 'left', fontWeight: 700, color: C.muted, position: 'sticky', left: 0, background: 'white' }}>{t('ow.cmp.approvals')}</td>
            {rows.map(r => <td key={r.centre.hospitalId} style={{ ...cell, fontWeight: 800, color: r.money.needs.approvals > 0 ? C.due : C.ink }}>{r.money.needs.approvals}</td>)}
            <td style={{ ...cell, fontWeight: 800, background: C.ground }}>{totals.approvals}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

export default function GlanceArea({ vp, openCentre, opening }) {
  const [period, setPeriod] = React.useState('today');
  const [view, setView] = React.useState('cards');
  const [d, setD] = React.useState(null);
  const [err, setErr] = React.useState('');
  const [ver, setVer] = React.useState(0);

  React.useEffect(() => {
    let alive = true;
    const [from, to] = periodRange(period);
    setD(null); setErr('');
    fetchGlance(from, to).then(r => { if (alive) setD(r); }).catch(e => { if (alive) setErr(apiError(e) || t('ow.failed')); });
    return () => { alive = false; };
  }, [period, ver]);

  const rows = d?.centres || [];
  const all = rows.map(r => r.centre);
  const tot = d?.totals;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr)', gridAutoRows: 'max-content', gap: 14 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        {PERIODS.map(p => <Chip key={p} on={period === p} onClick={() => setPeriod(p)}>{t(`ow.p.${p}`)}</Chip>)}
        <span style={{ flex: 1 }} />
        {rows.length > 1 && ['cards', 'compare'].map(v => <Chip key={v} on={view === v} onClick={() => setView(v)}>{t(`ow.v.${v}`)}</Chip>)}
      </div>

      {err && (
        <div role="alert" style={{ background: C.dangerSoft, color: C.danger, borderRadius: 14, padding: 14, fontWeight: 700, display: 'flex', gap: 10, alignItems: 'center' }}>
          <span style={{ flex: 1 }}>{err}</span><Button kind="quiet" onClick={() => setVer(v => v + 1)}>{t('ow.retry')}</Button>
        </div>
      )}
      {!d && !err && <div style={{ color: C.faint }}>{t('ow.loading')}</div>}
      {d && rows.length === 0 && <div style={{ color: C.faint, fontSize: 16 }}>{t('ow.none')}</div>}

      {tot && rows.length > 0 && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: vp.phone ? 'repeat(2, minmax(0,1fr))' : 'repeat(4, minmax(0,1fr))', gap: 10 }}>
            <Big label={t('ow.t.billed')} value={inr(tot.billed)} sub={t('ow.t.billedSub', { n: tot.bills, c: rows.length })} />
            <Big label={t('ow.t.collected')} value={inr(tot.collected)} colour={C.ok} sub={t('ow.t.collectedSub', { pct: pctOf(tot.collected, tot.billed) })} />
            <Big label={t('ow.t.due')} value={inr(tot.due)} colour={tot.due > 0.009 ? C.due : C.ink} sub={t('ow.t.dueSub')} />
            <Big label={t('ow.t.keeps')} value={inr(tot.centreKeeps)} sub={t('ow.t.keepsSub', { amount: inr(tot.partnerShare) })} />
          </div>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 15, color: C.muted }}>
            <span>{t('ow.t.received')}: <b style={{ color: C.ink }}>{inr(tot.received)}</b></span>
            <span>{t('ow.t.expenses')}: <b style={{ color: C.ink }}>{inr(tot.expensesPaid)}</b></span>
          </div>
          {view === 'cards' || rows.length < 2 ? (
            <div style={{ display: 'grid', gridTemplateColumns: vp.desktop ? 'repeat(3, minmax(0,1fr))' : vp.phone ? 'minmax(0,1fr)' : 'repeat(2, minmax(0,1fr))', gap: 12 }}>
              {rows.map(r => <CentreCard key={r.centre.hospitalId} row={r} all={all} openCentre={openCentre} opening={opening} vp={vp} />)}
            </div>
          ) : <CompareTable rows={rows} totals={tot} />}
        </>
      )}
    </div>
  );
}
