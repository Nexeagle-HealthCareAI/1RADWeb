import React from 'react';
import { t } from '../../i18n';
import { Button, Chip, Icon, Tag } from '../../components/saral/Saral';
import { C, inr } from '../../components/saral/tokens';
import { apiError, fieldStyle } from '../../components/saral/formUtil';
import { fetchBillByNumber, fetchBills } from '../../api/billing/moneyApi';
import { printA4Invoice, printReceiptSlip } from '../../utils/billing/printHandlers';
import BillPanel from './BillPanel';
import CollectSheet from './CollectSheet';
import FixSheet from './FixSheet';
import { balanceOf, billTag, istDay, istMonthStart, istTime, istDate } from './mnUtil';

/**
 * Money ▸ Bills, and (counter = true) Money ▸ Today at the counter.
 * One filter line (search · state · date), a list of bills, and the chosen bill's
 * money history beside it (a sheet on phones). Money is taken in CollectSheet;
 * a bill with money on it is corrected only through the owner (FixSheet).
 */
const STATES = [['', 'mn.st.all'], ['DUE', 'mn.st.due'], ['PAID', 'mn.st.paid'], ['CANCELLED', 'mn.st.cancelled']];
const DATES = ['today', 'yesterday', 'week', 'month', 'any'];
const range = (d) => {
  switch (d) {
    case 'today': return [istDay(0), istDay(0)];
    case 'yesterday': return [istDay(-1), istDay(-1)];
    case 'week': return [istDay(-6), istDay(0)];
    case 'month': return [istMonthStart(), istDay(0)];
    default: return [null, null];
  }
};

export default function BillsArea({ counter = false, role, settings, centre, printCtx, toast, vp }) {
  const [search, setSearch] = React.useState('');
  const [q, setQ] = React.useState('');
  const [state, setState] = React.useState(counter ? '' : 'DUE');
  const [date, setDate] = React.useState(counter ? 'today' : 'month');
  const [rows, setRows] = React.useState([]);
  const [next, setNext] = React.useState(null);
  const [total, setTotal] = React.useState(0);
  const [loading, setLoading] = React.useState(true);
  const [err, setErr] = React.useState('');
  const [sel, setSel] = React.useState(null);
  const [collect, setCollect] = React.useState(null);
  const [fix, setFix] = React.useState(null);
  const [ver, setVer] = React.useState(0);
  const seq = React.useRef(0);

  React.useEffect(() => { const h = setTimeout(() => setQ(search.trim()), 300); return () => clearTimeout(h); }, [search]);

  const load = React.useCallback(async (cursor = null) => {
    const my = ++seq.current;
    const [startDate, endDate] = range(q ? 'any' : date);
    if (!cursor) setLoading(true);
    try {
      const r = await fetchBills({ search: q, status: counter ? '' : state, startDate, endDate, cursor });
      if (my !== seq.current) return;
      setRows(prev => (cursor ? [...prev, ...(r.items || [])] : (r.items || [])));
      setNext(r.nextCursor || null);
      setTotal(r.totalCount ?? (r.items || []).length);
      setErr('');
    } catch (e) {
      if (my === seq.current) setErr(apiError(e) || t('mn.loadFailed'));
    } finally {
      if (my === seq.current) setLoading(false);
    }
  }, [q, state, date, counter]);

  React.useEffect(() => { load(null); }, [load, ver]);

  // Keep the open bill in step with the refreshed list.
  React.useEffect(() => {
    if (!sel) return;
    const fresh = rows.find(r => r.invoiceId === sel.invoiceId);
    if (fresh && fresh !== sel) setSel(fresh);
  }, [rows]); // eslint-disable-line react-hooks/exhaustive-deps

  const canTake = true; // everyone who reaches Money can take money; the server checks the role
  const canFix = true;  // anyone can ASK; only the owner approves

  const afterPay = async (res) => {
    setCollect(null);
    if (res?.asked) { toast.show(t('mn.pay.asked')); setVer(v => v + 1); return; }
    toast.show(t('mn.pay.doneNoNo', { amount: inr(res?.amount || 0) }));
    setVer(v => v + 1);
  };

  const printBill = async (bill) => {
    const fresh = (await fetchBillByNumber(bill.displayId).catch(() => null)) || bill;
    await printA4Invoice(fresh, printCtx);
  };
  const printReceipt = async (bill) => {
    const fresh = (await fetchBillByNumber(bill.displayId).catch(() => null)) || bill;
    await printReceiptSlip(fresh, printCtx);
  };

  // Counter summary from the bills on screen (today's bills).
  const sum = counter ? rows.reduce((a, r) => ({
    n: a.n + 1,
    taken: a.taken + (Number(r.paidAmount) || 0),
    due: a.due + (String(r.status).toUpperCase() === 'CANCELLED' ? 0 : balanceOf(r)),
  }), { n: 0, taken: 0, due: 0 }) : null;
  const shown = counter ? [...rows].sort((a, b) => (balanceOf(b) > 0) - (balanceOf(a) > 0)) : rows;

  const twoPane = vp.desktop;
  const panel = (
    <BillPanel bill={sel} ver={ver} canTake={canTake} canFix={canFix}
      onTake={() => setCollect(sel)} onFix={(h) => setFix(h)}
      onPrintBill={() => printBill(sel)} onPrintReceipt={() => printReceipt(sel)}
      onClose={twoPane ? null : () => setSel(null)} />
  );

  return (
    <div style={{ display: 'flex', flex: 1, minHeight: 0, gap: 0 }}>
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <div style={{ padding: vp.phone ? '12px 12px 6px' : '18px 22px 8px', display: 'grid', gap: 10 }}>
          <div style={{ fontSize: vp.phone ? 22 : 26, fontWeight: 800 }}>{counter ? t('mn.nav.counter') : t('mn.nav.bills')}</div>
          {counter && <div style={{ fontSize: 15, color: C.muted }}>{t('mn.counter.help')}</div>}
          {counter && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: 10 }}>
              {[['mn.counter.bills', String(sum.n), C.ink], ['mn.counter.taken', inr(sum.taken), C.ok], ['mn.counter.toTake', inr(sum.due), C.due]].map(([k, v, c]) => (
                <div key={k} style={{ background: 'white', border: `1.5px solid ${C.line}`, borderRadius: 16, padding: '10px 14px' }}>
                  <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: 1, color: C.faint }}>{t(k).toUpperCase()}</div>
                  <div style={{ fontSize: vp.phone ? 20 : 26, fontWeight: 800, color: c }}>{v}</div>
                </div>
              ))}
            </div>
          )}
          <div style={{ position: 'relative' }}>
            <span style={{ position: 'absolute', left: 12, top: 13, color: C.faint }}><Icon name="search" size={20} /></span>
            <input aria-label={t('mn.search')} placeholder={t('mn.search')} value={search} onChange={e => setSearch(e.target.value)}
              style={{ ...fieldStyle, paddingLeft: 40 }} />
          </div>
          {!counter && (
            <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 2 }}>
              {STATES.map(([id, k]) => <Chip key={k} on={state === id} onClick={() => setState(id)}>{t(k)}</Chip>)}
              <span style={{ width: 8, flexShrink: 0 }} />
              {DATES.map(d => <Chip key={d} on={date === d && !q} onClick={() => { setDate(d); setSearch(''); }}>{t(`mn.d.${d}`)}</Chip>)}
            </div>
          )}
          {!loading && !err && <div style={{ fontSize: 14, color: C.faint }}>{t('mn.bills.n', { n: total })}</div>}
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: vp.phone ? '0 12px 90px' : '0 22px 20px', display: 'grid', gap: 8, alignContent: 'start' }}>
          {err && (
            <div role="alert" style={{ background: C.dangerSoft, color: C.danger, borderRadius: 14, padding: 14, fontWeight: 700, display: 'flex', gap: 10, alignItems: 'center' }}>
              <span style={{ flex: 1 }}>{err}</span><Button kind="quiet" onClick={() => setVer(v => v + 1)}>{t('mn.retry')}</Button>
            </div>
          )}
          {loading && !rows.length && <div style={{ color: C.faint, padding: 12 }}>…</div>}
          {!loading && !err && !rows.length && <div style={{ color: C.faint, padding: 12, fontSize: 16 }}>{t('mn.none')}</div>}
          {shown.map(r => {
            const tag = billTag(r);
            const left = String(r.status).toUpperCase() === 'CANCELLED' ? 0 : balanceOf(r);
            const on = sel?.invoiceId === r.invoiceId;
            const tests = (r.items || []).map(i => i.description).filter(Boolean);
            return (
              <button key={r.invoiceId} type="button" onClick={() => setSel(r)} aria-pressed={on}
                style={{ display: 'flex', gap: 12, alignItems: 'center', width: '100%', textAlign: 'left', padding: '12px 14px', borderRadius: 16,
                  background: on ? C.primarySoft : 'white', border: on ? `2px solid ${C.primary}` : `1.5px solid ${C.line}`,
                  fontFamily: 'inherit', color: C.ink, cursor: 'pointer' }}>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: 17, fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.patientName}</span>
                  <span style={{ display: 'block', fontSize: 14, color: C.faint, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {r.displayId} · {date === 'today' && !q ? istTime(r.createdAt) : istDate(r.createdAt)}{tests.length ? ` · ${tests.length > 2 ? `${tests[0]} +${tests.length - 1}` : tests.join(', ')}` : ''}
                  </span>
                </span>
                <span style={{ textAlign: 'right', display: 'grid', gap: 4, justifyItems: 'end' }}>
                  <span style={{ fontSize: 17, fontWeight: 800 }}>{inr(r.totalAmount)}</span>
                  {left > 0.009 ? <span style={{ fontSize: 14, fontWeight: 800, color: C.due }}>{t('mn.due', { amount: inr(left) })}</span>
                    : <Tag bg={tag.bg} fg={tag.fg} style={{ fontSize: 13, padding: '2px 10px' }}>{tag.word}</Tag>}
                </span>
              </button>
            );
          })}
          {next && <Button kind="quiet" onClick={() => load(next)} style={{ justifySelf: 'center' }}>{t('mn.more')}</Button>}
        </div>
      </div>

      {twoPane && (
        <div style={{ width: 440, flexShrink: 0, borderLeft: `1px solid ${C.line}`, background: 'white', minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          {panel}
        </div>
      )}
      {!twoPane && sel && (
        <div role="dialog" aria-modal="true" aria-label={sel.displayId}
          style={{ position: 'fixed', inset: 0, zIndex: 2147483600, background: 'white', display: 'flex', flexDirection: 'column' }}>
          {panel}
        </div>
      )}

      <CollectSheet open={!!collect} bill={collect} role={role} settings={settings} centre={centre}
        onClose={() => setCollect(null)} onDone={afterPay} />
      <FixSheet open={!!fix} bill={fix} onClose={() => setFix(null)}
        onDone={() => { setFix(null); toast.show(t('mn.fix.sent')); setVer(v => v + 1); }} />
    </div>
  );
}
