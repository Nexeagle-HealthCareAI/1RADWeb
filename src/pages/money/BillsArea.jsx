import React from 'react';
import { t } from '../../i18n';
import { Button, Chip, Icon, Tag } from '../../components/saral/Saral';
import { C, inr } from '../../components/saral/tokens';
import { apiError, fieldStyle } from '../../components/saral/formUtil';
import { fetchBillByNumber, fetchBills } from '../../api/billing/moneyApi';
import { useLocation, useNavigate } from 'react-router-dom';
import { printA4Invoice, printReceiptSlip, printThermalSlip } from '../../utils/billing/printHandlers';
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
  const location = useLocation();
  // Daily check ▸ "Open bill" lands here with ?q=<bill number>.
  const [search, setSearch] = React.useState(() => new URLSearchParams(location.search).get('q') || '');
  const [q, setQ] = React.useState('');
  const [state, setState] = React.useState(() => (counter || new URLSearchParams(location.search).get('q') ? '' : 'DUE'));
  const [date, setDate] = React.useState(counter ? 'today' : 'month');
  const [rows, setRows] = React.useState([]);
  const [next, setNext] = React.useState(null);
  const [total, setTotal] = React.useState(0);
  const [sums, setSums] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [err, setErr] = React.useState('');
  const [sel, setSel] = React.useState(null);
  const [collect, setCollect] = React.useState(null);
  const [fix, setFix] = React.useState(null);
  const [ver, setVer] = React.useState(0);
  const seq = React.useRef(0);
  const navigate = useNavigate();
  const fullTools = role === 'owner' || role === 'acc'; // the older billing tools were for these roles

  React.useEffect(() => { const h = setTimeout(() => setQ(search.trim()), 300); return () => clearTimeout(h); }, [search]);

  const load = React.useCallback(async (cursor = null) => {
    const my = ++seq.current;
    const [startDate, endDate] = range(q ? 'any' : date);
    if (!cursor) setLoading(true);
    try {
      // A busy day is ~200 bills: big pages, so a whole day is one or two loads.
      const r = await fetchBills({ search: q, status: counter ? '' : state, startDate, endDate, cursor, pageSize: counter ? 100 : 60 });
      if (my !== seq.current) return;
      setRows(prev => (cursor ? [...prev, ...(r.items || [])] : (r.items || [])));
      setNext(r.nextCursor || null);
      if (!cursor) { setTotal(r.totalCount ?? (r.items || []).length); setSums(r.totals || null); }
      setErr('');
    } catch (e) {
      if (my === seq.current) setErr(apiError(e) || t('mn.loadFailed'));
    } finally {
      if (my === seq.current) setLoading(false);
    }
  }, [q, state, date, counter]);

  React.useEffect(() => { load(null); }, [load, ver]);

  // Arrived with ?q=<bill number> and it found exactly that bill: open it.
  const opened = React.useRef(false);
  React.useEffect(() => {
    const want = new URLSearchParams(location.search).get('q');
    if (opened.current || !want || !q || rows.length !== 1) return;
    opened.current = true; setSel(rows[0]);
  }, [rows, q]); // eslint-disable-line react-hooks/exhaustive-deps

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
  const printThermal = async (bill) => {
    const fresh = (await fetchBillByNumber(bill.displayId).catch(() => null)) || bill;
    await printThermalSlip(fresh, { ...printCtx, notify: (m) => toast.show(String(m?.message || m || '')) });
  };

  // Totals for every bill the filters match (from the server, not just the rows loaded).
  const local = rows.reduce((a, r) => {
    if (String(r.status).toUpperCase() === 'CANCELLED') return a;
    const tot = Number(r.totalAmount) || 0; const paid = Math.min(tot, Number(r.paidAmount) || 0);
    return { bills: a.bills + 1, billed: a.billed + tot, paid: a.paid + paid, due: a.due + (tot - paid), dueBills: a.dueBills + (tot - paid > 0.009 ? 1 : 0) };
  }, { bills: 0, billed: 0, paid: 0, due: 0, dueBills: 0 });
  const sum = sums || local;
  const shown = counter ? [...rows].sort((a, b) => (balanceOf(b) > 0) - (balanceOf(a) > 0)) : rows;

  // Desktop: the table takes the full width until a bill is picked, then the bill
  // opens beside it. Phone and tablet: tight two-line rows, the bill opens on top.
  const twoPane = vp.desktop && !!sel;
  const table = !vp.phone;
  const wide = vp.desktop && !sel;
  const cols = wide
    ? '64px minmax(140px,1.4fr) 130px minmax(120px,1.4fr) minmax(100px,1fr) 88px 88px 96px'
    : '56px minmax(110px,1.5fr) minmax(80px,1fr) 80px 92px';
  const panel = (
    <BillPanel bill={sel} ver={ver} canTake={canTake} canFix={canFix}
      onTake={() => setCollect(sel)} onFix={(h) => setFix(h)}
      onPrintBill={() => printBill(sel)} onPrintReceipt={() => printReceipt(sel)} onPrintThermal={() => printThermal(sel)}
      onMore={fullTools ? () => navigate('/money/tools', { state: { openInvoice: sel } }) : null}
      onClose={twoPane ? null : () => setSel(null)} />
  );

  return (
    <div style={{ display: 'flex', flex: 1, minHeight: 0, gap: 0 }}>
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <div style={{ padding: vp.phone ? '12px 12px 6px' : '18px 22px 8px', display: 'grid', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ flex: 1, fontSize: vp.phone ? 22 : 26, fontWeight: 800 }}>{counter ? t('mn.nav.counter') : t('mn.nav.bills')}</div>
            {fullTools && <Button kind="outline" icon="plus" onClick={() => navigate('/money/tools', { state: { newBill: Date.now() } })}>{t('mn.bills.new')}</Button>}
          </div>
          {counter && !vp.phone && <div style={{ fontSize: 14, color: C.muted, marginTop: -6 }}>{t('mn.counter.help')}</div>}
          {/* One line of totals for everything the filters match. */}
          <div role="group" aria-label={t('mn.bills.totals')} style={{ display: 'grid', gridTemplateColumns: vp.phone ? 'repeat(2, minmax(0,1fr))' : 'repeat(4, minmax(0,1fr))', gap: 8 }}>
            {[[t('mn.bills.tBills'), String(sum.bills), C.ink, sum.dueBills ? t('mn.bills.tDueN', { n: sum.dueBills }) : null],
              [t('mn.bills.tBilled'), inr(sum.billed), C.ink, null],
              [t('mn.bills.tPaid'), inr(sum.paid), C.ok, null],
              [t('mn.bills.tDue'), inr(sum.due), sum.due > 0.009 ? C.due : C.ink, null]].map(([k, v, c, sub]) => (
              <div key={k} style={{ background: 'white', border: `1.5px solid ${C.line}`, borderRadius: 14, padding: '6px 12px', minWidth: 0 }}>
                <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 1, color: C.faint }}>{k.toUpperCase()}</div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: vp.phone ? 18 : 21, fontWeight: 800, color: c }}>{v}</span>
                  {sub && <span style={{ fontSize: 12, color: C.dueInk, fontWeight: 700 }}>{sub}</span>}
                </div>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: vp.desktop ? 'nowrap' : 'wrap', minWidth: 0 }}>
            <div style={{ position: 'relative', flex: vp.desktop ? '0 0 300px' : '1 1 100%' }}>
              <span style={{ position: 'absolute', left: 12, top: 13, color: C.faint }}><Icon name="search" size={20} /></span>
              <input aria-label={t('mn.search')} placeholder={t('mn.search')} value={search} onChange={e => setSearch(e.target.value)}
                style={{ ...fieldStyle, paddingLeft: 40 }} />
            </div>
            {!counter && (
              <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 2, minWidth: 0, flex: 1 }}>
                {STATES.map(([id, k]) => <Chip key={k} on={state === id} onClick={() => setState(id)}>{t(k)}</Chip>)}
                <span style={{ width: 6, flexShrink: 0 }} />
                {DATES.map(d => <Chip key={d} on={date === d && !q} onClick={() => { setDate(d); setSearch(''); }}>{t(`mn.d.${d}`)}</Chip>)}
              </div>
            )}
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: vp.phone ? '0 12px 90px' : '0 22px 20px', minWidth: 0 }}>
          {err && (
            <div role="alert" style={{ background: C.dangerSoft, color: C.danger, borderRadius: 14, padding: 14, fontWeight: 700, display: 'flex', gap: 10, alignItems: 'center' }}>
              <span style={{ flex: 1 }}>{err}</span><Button kind="quiet" onClick={() => setVer(v => v + 1)}>{t('mn.retry')}</Button>
            </div>
          )}
          {loading && !rows.length && <div style={{ color: C.faint, padding: 12 }}>…</div>}
          {!loading && !err && !rows.length && <div style={{ color: C.faint, padding: 12, fontSize: 16 }}>{t('mn.none')}</div>}
          {rows.length > 0 && (
            <div style={{ background: 'white', border: `1.5px solid ${C.line}`, borderRadius: 14, overflow: 'hidden' }}>
              {table && (
                <div role="row" style={{ display: 'grid', gridTemplateColumns: cols, gap: 10, padding: '8px 12px', position: 'sticky', top: 0, zIndex: 1,
                  background: C.ground, borderBottom: `1px solid ${C.line}`, fontSize: 11, fontWeight: 800, letterSpacing: 0.8, color: C.faint }}>
                  <span>{(date === 'today' && !q ? t('mn.col.time') : t('mn.col.date')).toUpperCase()}</span>
                  <span>{t('mn.col.patient').toUpperCase()}</span>
                  {wide && <span>{t('mn.col.bill').toUpperCase()}</span>}
                  <span>{t('mn.col.tests').toUpperCase()}</span>
                  {wide && <span>{t('mn.col.partner').toUpperCase()}</span>}
                  <span style={{ textAlign: 'right' }}>{t('mn.col.total').toUpperCase()}</span>
                  {wide && <span style={{ textAlign: 'right' }}>{t('mn.col.paid').toUpperCase()}</span>}
                  <span style={{ textAlign: 'right' }}>{t('mn.col.left').toUpperCase()}</span>
                </div>
              )}
              {shown.map((r, i) => {
                const tag = billTag(r);
                const cancelled = String(r.status).toUpperCase() === 'CANCELLED';
                const left = cancelled ? 0 : balanceOf(r);
                const on = sel?.invoiceId === r.invoiceId;
                const tests = (r.items || []).map(x => x.description).filter(Boolean);
                const testText = tests.length > 2 ? `${tests[0]} +${tests.length - 1}` : tests.join(', ');
                const when = date === 'today' && !q ? istTime(r.createdAt) : istDate(r.createdAt);
                const state = left > 0.009
                  ? <span style={{ fontWeight: 800, color: C.due }}>{inr(left)}</span>
                  : <Tag bg={tag.bg} fg={tag.fg} style={{ fontSize: 12, padding: '1px 8px' }}>{tag.word}</Tag>;
                const base = { width: '100%', textAlign: 'left', border: 'none', borderTop: i ? '1px solid #F3F4F6' : 'none', fontFamily: 'inherit',
                  color: cancelled ? C.faint : C.ink, cursor: 'pointer', background: on ? C.primarySoft : 'white',
                  boxShadow: on ? `inset 3px 0 0 ${C.primary}` : 'none', textDecoration: cancelled ? 'line-through' : 'none' };
                if (!table) {
                  return (
                    <button key={r.invoiceId} type="button" onClick={() => setSel(r)} aria-pressed={on}
                      style={{ ...base, display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto', gap: '0 10px', padding: '8px 12px', alignItems: 'center' }}>
                      <span style={{ fontSize: 15, fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.patientName}</span>
                      <span style={{ fontSize: 15, fontWeight: 800, textAlign: 'right' }}>{inr(r.totalAmount)}</span>
                      <span style={{ fontSize: 12, color: C.faint, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{when} · {r.displayId}{testText ? ` · ${testText}` : ''}</span>
                      <span style={{ fontSize: 13, textAlign: 'right' }}>{state}</span>
                    </button>
                  );
                }
                return (
                  <button key={r.invoiceId} type="button" onClick={() => setSel(r)} aria-pressed={on}
                    style={{ ...base, display: 'grid', gridTemplateColumns: cols, gap: 10, padding: '0 12px', height: 40, alignItems: 'center', fontSize: 14 }}>
                    <span style={{ color: C.faint, fontVariantNumeric: 'tabular-nums' }}>{when}</span>
                    <span style={{ fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {r.patientName}{!wide && <span style={{ fontWeight: 500, color: C.faint }}> · {r.displayId}</span>}
                    </span>
                    {wide && <span style={{ color: C.muted, fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 12.5 }}>{r.displayId}</span>}
                    <span style={{ color: C.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={tests.join(', ')}>{testText}</span>
                    {wide && <span style={{ color: C.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.referrerName || '—'}</span>}
                    <span style={{ textAlign: 'right', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{inr(r.totalAmount)}</span>
                    {wide && <span style={{ textAlign: 'right', color: C.ok, fontVariantNumeric: 'tabular-nums' }}>{inr(Math.min(Number(r.paidAmount) || 0, Number(r.totalAmount) || 0))}</span>}
                    <span style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{state}</span>
                  </button>
                );
              })}
            </div>
          )}
          {!loading && rows.length > 0 && <div style={{ fontSize: 13, color: C.faint, padding: '8px 2px' }}>{t('mn.bills.shown', { n: rows.length, total })}</div>}
          {next && <div style={{ textAlign: 'center' }}><Button kind="quiet" onClick={() => load(next)}>{t('mn.more')}</Button></div>}
        </div>
      </div>

      {twoPane && (
        <div style={{ width: 400, flexShrink: 0, borderLeft: `1px solid ${C.line}`, background: 'white', minHeight: 0, display: 'flex', flexDirection: 'column' }}>
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
