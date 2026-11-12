import React from 'react';
import { t } from '../../i18n';
import { Button, Chip } from '../../components/saral/Saral';
import { C, inr } from '../../components/saral/tokens';
import { apiError, fieldStyle } from '../../components/saral/formUtil';
import { closeCashDay, fetchCashDay, fetchDayStrip } from '../../api/billing/moneyApi';
import { istDay, istTime } from './mnUtil';

/**
 * Money ▸ Cash book. A strip of the last 7 days (closed or open), the chosen day's
 * money by mode and line by line, and closing the day: opening cash + cash in −
 * cash out = what should be in the drawer; count it note by note; say why if it
 * differs; keep a float for tomorrow and hand over the rest. A closed day is
 * locked; only an accountant or the owner can count it again.
 */
const NOTES = [500, 200, 100, 50, 20, 10];
const REASONS = ['change', 'expense', 'count', 'unknown', 'other'];
const FLOATS = [0, 1000, 2000, 5000];
const MODES = ['CASH', 'UPI', 'CARD', 'BANK', 'OTHER'];
const modeWord = (m) => (['CASH', 'UPI', 'CARD', 'BANK'].includes(m) ? t(`mn.pay.${m.toLowerCase()}`) : m);
const dayLabel = (iso) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
const isoOf = (d) => String(d).slice(0, 10);
const signed = (n) => (n < 0 ? `−${inr(-n)}` : inr(n));

function stripWord(d) {
  if (d.closed) {
    if (Math.abs(d.variance) < 0.01) return [t('mn.cb.matched'), C.ok];
    return [d.variance < 0 ? t('mn.cb.short', { amount: inr(-d.variance) }) : t('mn.cb.over', { amount: inr(d.variance) }), C.dueInk];
  }
  if (!d.entries) return [t('mn.cb.nothing'), C.faint];
  return [t('mn.cb.open'), C.primary];
}

export default function CashBookArea({ role, toast, vp }) {
  const today = istDay(0);
  const [strip, setStrip] = React.useState([]);
  const [day, setDay] = React.useState(today);
  const [book, setBook] = React.useState(null);
  const [mode, setMode] = React.useState('');
  const [err, setErr] = React.useState('');
  const [ver, setVer] = React.useState(0);
  const [recount, setRecount] = React.useState(false);

  React.useEffect(() => {
    let alive = true;
    fetchDayStrip(today, 7).then(d => { if (alive) setStrip(d || []); }).catch(() => {});
    return () => { alive = false; };
  }, [today, ver]);

  React.useEffect(() => {
    let alive = true;
    setBook(null); setErr(''); setRecount(false);
    fetchCashDay(day).then(d => { if (alive) setBook(d); }).catch(e => { if (alive) setErr(apiError(e) || t('mn.cb.loadFailed')); });
    return () => { alive = false; };
  }, [day, ver]);

  const close = book?.closes?.find(c => isoOf(c.businessDate) === day) || null;
  const byMode = Object.fromEntries((book?.byMode || []).map(m => [m.mode, m]));
  const lines = (book?.lines || []).filter(l => !mode || l.mode === mode);
  const allNet = (book?.byMode || []).reduce((a, m) => a + m.net, 0);
  const canRecount = role === 'owner' || role === 'acc';

  const cards = [
    ...MODES.filter(m => byMode[m] || m !== 'OTHER').map(m => ({ id: m, label: modeWord(m), net: byMode[m]?.net || 0, inn: byMode[m]?.in || 0, out: byMode[m]?.out || 0 })),
    { id: '', label: t('mn.cb.day'), net: allNet, inn: (book?.byMode || []).reduce((a, m) => a + m.in, 0), out: (book?.byMode || []).reduce((a, m) => a + m.out, 0) },
  ];

  const panel = !book ? null : day > today ? (
    <div style={{ color: C.faint, padding: 18 }}>{t('mn.cb.future')}</div>
  ) : close && !recount ? (
    <ClosedView close={close} canRecount={canRecount} onRecount={() => setRecount(true)} />
  ) : (
    <CloseForm key={`${day}-${recount}`} day={day} book={book}
      onDone={(r) => { toast.show(t('mn.cb.closed', { amount: inr(r?.handedOver || 0) })); setVer(v => v + 1); }} />
  );

  return (
    <div style={{ display: 'flex', flex: 1, minHeight: 0, flexDirection: vp.desktop ? 'row' : 'column' }}>
      <div style={{ flex: 1, minWidth: 0, overflowY: 'auto', padding: vp.phone ? '12px 12px 90px' : '18px 22px 20px', display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 14, alignContent: 'start' }}>
        <div>
          <div style={{ fontSize: vp.phone ? 22 : 26, fontWeight: 800 }}>{t('mn.cb.title')}</div>
          <div style={{ fontSize: 15, color: C.muted }}>{t('mn.cb.help')}</div>
        </div>

        <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 2 }}>
          {(strip.length ? strip : [{ date: today, closed: false, variance: 0, entries: 0 }]).map(d => {
            const iso = isoOf(d.date);
            const [word, colour] = stripWord(d);
            const on = iso === day;
            return (
              <button key={iso} type="button" onClick={() => setDay(iso)} aria-pressed={on}
                style={{ flexShrink: 0, minWidth: 128, textAlign: 'left', padding: '8px 12px', borderRadius: 14, cursor: 'pointer', fontFamily: 'inherit',
                  background: on ? C.primarySoft : 'white', border: on ? `2px solid ${C.primary}` : `1.5px solid ${C.line}`, color: C.ink }}>
                <span style={{ display: 'block', fontSize: 15, fontWeight: 800 }}>{iso === today ? t('mn.d.today') : dayLabel(iso)}</span>
                <span style={{ display: 'block', fontSize: 13, fontWeight: 700, color: colour }}>{word}</span>
              </button>
            );
          })}
        </div>

        {err && <div role="alert" style={{ background: C.dangerSoft, color: C.danger, borderRadius: 14, padding: 14, fontWeight: 700 }}>{err}</div>}

        <div style={{ display: 'grid', gridTemplateColumns: vp.phone ? 'repeat(2, minmax(0,1fr))' : `repeat(${cards.length}, minmax(0,1fr))`, gap: 10 }}>
          {cards.map(c => (
            <button key={c.id || 'all'} type="button" onClick={() => setMode(c.id)} aria-pressed={mode === c.id}
              style={{ textAlign: 'left', padding: '10px 14px', borderRadius: 16, cursor: 'pointer', fontFamily: 'inherit', color: C.ink,
                background: 'white', border: mode === c.id ? `2px solid ${C.ink}` : `1.5px solid ${C.line}` }}>
              <span style={{ display: 'block', fontSize: 12, fontWeight: 800, letterSpacing: 1, color: C.faint }}>{c.label.toUpperCase()}</span>
              <span style={{ display: 'block', fontSize: vp.desktop ? 19 : 20, fontWeight: 800, color: c.net < 0 ? C.danger : C.ink, whiteSpace: 'nowrap' }}>{signed(c.net)}</span>
              <span style={{ display: 'block', fontSize: 12, color: C.faint }}>{t('mn.cb.in', { amount: inr(c.inn) })} · {t('mn.cb.out', { amount: inr(c.out) })}</span>
            </button>
          ))}
        </div>

        <div style={{ background: 'white', border: `1.5px solid ${C.line}`, borderRadius: 16, overflow: 'hidden' }}>
          {!book && !err && <div style={{ padding: 14, color: C.faint }}>…</div>}
          {book && !lines.length && <div style={{ padding: 14, color: C.faint }}>{t('mn.cb.none')}</div>}
          {lines.map((l, i) => (
            <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '10px 14px', borderTop: i ? `1px solid #F3F4F6` : 'none', fontSize: 15 }}>
              <span style={{ width: 64, color: C.faint, fontSize: 13 }}>{istTime(l.at)}</span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block', fontWeight: 700 }}>{t(`mn.cb.k.${l.kind}`)}{l.party ? ` · ${l.party}` : ''}</span>
                <span style={{ display: 'block', fontSize: 13, color: C.faint, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {[modeWord(l.mode), l.reference, l.cashier].filter(Boolean).join(' · ')}
                </span>
              </span>
              <span style={{ fontWeight: 800, color: l.amount < 0 ? C.danger : C.ok, whiteSpace: 'nowrap' }}>{l.amount < 0 ? `−${inr(-l.amount)}` : inr(l.amount)}</span>
            </div>
          ))}
        </div>
      </div>

      <div style={{ width: vp.desktop ? 400 : 'auto', flexShrink: 0, background: 'white', borderLeft: vp.desktop ? `1px solid ${C.line}` : 'none',
        borderTop: vp.desktop ? 'none' : `1px solid ${C.line}`, overflowY: 'auto', marginBottom: vp.phone ? 80 : 0 }}>
        {panel}
      </div>
    </div>
  );
}

function SumRow({ label, value, strong, colour }) {
  return (
    <div style={{ display: 'flex', fontSize: strong ? 17 : 15, fontWeight: strong ? 800 : 600, padding: '3px 0', color: colour || C.ink }}>
      <span style={{ flex: 1 }}>{label}</span><span>{value}</span>
    </div>
  );
}

function ClosedView({ close, canRecount, onRecount }) {
  const v = close.variance;
  return (
    <div style={{ padding: 18, display: 'grid', gap: 12 }}>
      <div style={{ fontSize: 20, fontWeight: 800 }}>{Math.abs(v) < 0.01 ? t('mn.cb.matched') : v < 0 ? t('mn.cb.short', { amount: inr(-v) }) : t('mn.cb.over', { amount: inr(v) })}</div>
      <div style={{ fontSize: 14, color: C.faint }}>{t('mn.cb.closedBy', { name: close.closedByName || '—', time: istTime(close.closedAt) })}</div>
      <div>
        <SumRow label={t('mn.cb.opening')} value={inr(close.openingFloat)} />
        <SumRow label={t('mn.cb.cashIn') + ' − ' + t('mn.cb.cashOut').toLowerCase()} value={signed(close.expectedCash)} />
        <SumRow label={t('mn.cb.expected')} value={inr(close.openingFloat + close.expectedCash)} strong />
        <SumRow label={t('mn.cb.counted')} value={inr(close.countedCash)} strong />
        {close.differenceReason && <div style={{ fontSize: 14, color: C.muted }}>{t('mn.bill.reason', { reason: close.differenceReason })}</div>}
        <SumRow label={t('mn.cb.kept')} value={inr(close.floatKept)} />
        <SumRow label={t('mn.cb.handed') + (close.handedTo ? ` · ${close.handedTo}` : '')} value={inr(close.handedOver)} />
      </div>
      <div style={{ fontSize: 13, color: C.muted, background: C.ground, borderRadius: 12, padding: '10px 12px', lineHeight: 1.5 }}>{t('mn.cb.locked')}</div>
      {canRecount && <Button kind="quiet" onClick={onRecount}>{t('mn.cb.recount')}</Button>}
    </div>
  );
}

function CloseForm({ day, book, onDone }) {
  const cash = (book.byMode || []).find(m => m.mode === 'CASH') || { in: 0, out: 0, net: 0 };
  const opening = Number(book.openingFloat) || 0;
  const expected = Math.round((opening + cash.net) * 100) / 100;
  const [counts, setCounts] = React.useState(() => Object.fromEntries(NOTES.map(n => [n, 0])));
  const [coins, setCoins] = React.useState('');
  const [reasonKey, setReasonKey] = React.useState('');
  const [reasonText, setReasonText] = React.useState('');
  const [keep, setKeep] = React.useState(opening > 0 ? opening : 2000);
  const [handTo, setHandTo] = React.useState('owner');
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState('');

  const counted = NOTES.reduce((a, n) => a + n * (counts[n] || 0), 0) + (Number(coins) || 0);
  const diff = Math.round((counted - expected) * 100) / 100;
  const differs = Math.abs(diff) > 0.009;
  const reason = reasonKey === 'other' ? reasonText.trim() : reasonKey ? t(`mn.cb.r.${reasonKey}`) : '';
  const keepN = Math.min(keep, counted);
  const handed = Math.max(0, counted - keepN);
  const ok = !busy && (!differs || reason);

  const bump = (n, d) => setCounts(c => ({ ...c, [n]: Math.max(0, (c[n] || 0) + d) }));
  const submit = async () => {
    if (!ok) return;
    setBusy(true); setErr('');
    try {
      const noteCounts = Object.fromEntries(NOTES.filter(n => counts[n] > 0).map(n => [String(n), counts[n]]));
      if (Number(coins) > 0) noteCounts.coins = Math.round(Number(coins));
      if (!Object.keys(noteCounts).length) noteCounts.coins = 0;
      const r = await closeCashDay({
        date: day, noteCounts, differenceReason: differs ? reason : null, floatKept: keepN,
        handedTo: handTo === 'owner' ? t('mn.cb.h.owner') : handTo === 'bank' ? t('mn.cb.h.bank') : null,
      });
      onDone?.(r);
    } catch (e) { setErr(apiError(e) || t('mn.cb.closeFailed')); } finally { setBusy(false); }
  };

  const lab = { fontSize: 13, fontWeight: 800, letterSpacing: 1, color: C.faint, textTransform: 'uppercase' };
  const sq = { width: 40, height: 40, borderRadius: 10, border: `1.5px solid ${C.lineStrong}`, background: 'white', fontSize: 20, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' };
  const when = day === istDay(0) ? t('mn.d.today').toLowerCase() : dayLabel(day);

  return (
    <div style={{ padding: 18, display: 'grid', gap: 14 }}>
      <div style={{ fontSize: 20, fontWeight: 800 }}>{t('mn.cb.close', { date: when })}</div>
      <div>
        <SumRow label={t('mn.cb.opening')} value={inr(opening)} />
        <SumRow label={t('mn.cb.cashIn')} value={`+ ${inr(cash.in)}`} />
        <SumRow label={t('mn.cb.cashOut')} value={`− ${inr(cash.out)}`} />
        <SumRow label={t('mn.cb.expected')} value={signed(expected)} strong />
      </div>

      <div style={lab}>{t('mn.cb.count')}</div>
      <div style={{ display: 'grid', gap: 6 }}>
        {NOTES.map(n => (
          <div key={n} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ width: 64, fontSize: 16, fontWeight: 800 }}>₹{n}</span>
            <button type="button" style={sq} onClick={() => bump(n, -1)} aria-label={`₹${n} −1`}>−</button>
            <input inputMode="numeric" aria-label={`₹${n} notes`} value={counts[n] || ''} placeholder="0"
              onChange={e => setCounts(c => ({ ...c, [n]: Math.max(0, parseInt(e.target.value.replace(/\D/g, '') || '0', 10)) }))}
              style={{ ...fieldStyle, width: 70, height: 40, textAlign: 'center', fontWeight: 800 }} />
            <button type="button" style={sq} onClick={() => bump(n, 1)} aria-label={`₹${n} +1`}>+</button>
            <span style={{ flex: 1, textAlign: 'right', color: C.muted }}>{inr(n * (counts[n] || 0))}</span>
          </div>
        ))}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <label htmlFor="mn-coins" style={{ flex: 1, fontSize: 15, fontWeight: 700 }}>{t('mn.cb.coins')}</label>
          <input id="mn-coins" inputMode="numeric" value={coins} onChange={e => setCoins(e.target.value.replace(/\D/g, ''))}
            style={{ ...fieldStyle, width: 120, height: 40, textAlign: 'right' }} />
        </div>
      </div>
      <div style={{ background: differs ? C.dueSoft : C.okSoft, borderRadius: 14, padding: '10px 14px' }}>
        <SumRow label={t('mn.cb.counted')} value={inr(counted)} strong />
        <div style={{ fontSize: 16, fontWeight: 800, color: differs ? C.dueInk : C.ok }}>
          {!differs ? t('mn.cb.diff.ok') : diff < 0 ? t('mn.cb.diff.short', { amount: inr(-diff) }) : t('mn.cb.diff.over', { amount: inr(diff) })}
        </div>
      </div>

      {differs && (
        <>
          <div style={lab}>{t('mn.cb.why')}</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {REASONS.map(r => <Chip key={r} on={reasonKey === r} onClick={() => setReasonKey(r)}>{t(`mn.cb.r.${r}`)}</Chip>)}
          </div>
          {reasonKey === 'other' && <input aria-label={t('mn.pay.otherReason')} placeholder={t('mn.pay.otherReason')} value={reasonText}
            onChange={e => setReasonText(e.target.value.slice(0, 120))} style={fieldStyle} />}
        </>
      )}

      <div style={lab}>{t('mn.cb.keep')}</div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {FLOATS.map(f => <Chip key={f} on={keep === f} onClick={() => setKeep(f)}>{f ? inr(f) : t('mn.cb.keepNone')}</Chip>)}
      </div>
      <div style={{ fontSize: 17, fontWeight: 800 }}>{t('mn.cb.hand', { amount: inr(handed) })}</div>
      {handed > 0 && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontSize: 14, color: C.muted }}>{t('mn.cb.handTo')}</span>
          {['owner', 'bank'].map(h => <Chip key={h} on={handTo === h} onClick={() => setHandTo(h)}>{t(`mn.cb.h.${h}`)}</Chip>)}
        </div>
      )}

      {err && <div role="alert" style={{ color: C.danger, fontWeight: 700 }}>{err}</div>}
      <Button kind="ok" size="lg" onClick={submit} disabled={!ok}>{differs && !reason ? t('mn.cb.pickReason') : t('mn.cb.doClose')}</Button>
    </div>
  );
}

