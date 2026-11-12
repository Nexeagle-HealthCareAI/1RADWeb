import React from 'react';
import { useNavigate } from 'react-router-dom';
import { t } from '../../i18n';
import { Button, Chip, Sheet, Tag } from '../../components/saral/Saral';
import { C, inr } from '../../components/saral/tokens';
import { apiError, fieldStyle } from '../../components/saral/formUtil';
import { addExpense, fetchExpensePage, payExpense } from '../../api/billing/moneyApi';
import { istDate, istMonthStart, istDay, newKey } from './mnUtil';

/**
 * Money ▸ Expenses. Two lists — To pay and Paid — with head chips. "Mark paid"
 * asks where the money came from (today's cash drawer, UPI, bank); the cash book
 * counts it that day. Salary rows come from Staff & salary and are locked here.
 */
const HEADS = ['Rent', 'Utilities', 'Consumables', 'Reagents', 'Maintenance', 'Marketing', 'Other'];
const FROMS = ['CASH', 'UPI', 'BANK', 'NONE'];
const headWord = (h) => { const k = `mn.ex.h.${h}`; const w = t(k); return w === k ? h : w; };

export default function ExpensesArea({ toast, vp }) {
  const navigate = useNavigate();
  const [tab, setTab] = React.useState('TOPAY');
  const [head, setHead] = React.useState('');
  const [rows, setRows] = React.useState(null);
  const [sums, setSums] = React.useState({ toPay: 0, nToPay: 0, paidMonth: 0, nPaid: 0 });
  const [err, setErr] = React.useState('');
  const [ver, setVer] = React.useState(0);
  const [adding, setAdding] = React.useState(false);
  const [paying, setPaying] = React.useState(null);

  React.useEffect(() => {
    let alive = true;
    Promise.all([
      fetchExpensePage({ state: 'TOPAY', pageSize: 200 }),
      fetchExpensePage({ state: 'PAID', startDate: istMonthStart(), endDate: `${istDay(0)}T23:59:59`, pageSize: 200 }),
    ]).then(([a, b]) => {
      if (!alive) return;
      setSums({
        toPay: (a.items || []).reduce((s, e) => s + Number(e.amount), 0), nToPay: (a.items || []).length,
        paidMonth: (b.items || []).reduce((s, e) => s + Number(e.amount), 0), nPaid: (b.items || []).length,
      });
      setRows(tab === 'TOPAY' ? (a.items || []) : (b.items || []));
      setErr('');
    }).catch(e => { if (alive) setErr(apiError(e) || t('mn.ex.loadFailed')); });
    return () => { alive = false; };
  }, [tab, ver]);

  const shown = (rows || []).filter(e => !head || e.category === head);
  const heads = [...new Set((rows || []).map(e => e.category).filter(Boolean))];

  return (
    <div style={{ flex: 1, minWidth: 0, overflowY: 'auto', padding: vp.phone ? '12px 12px 90px' : '18px 22px 24px', display: 'grid', gridTemplateColumns: 'minmax(0,1fr)', gridAutoRows: 'max-content', gap: 14, alignContent: 'start' }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 260px' }}>
          <div style={{ fontSize: vp.phone ? 22 : 26, fontWeight: 800 }}>{t('mn.ex.title')}</div>
          <div style={{ fontSize: 15, color: C.muted }}>{t('mn.ex.help')}</div>
        </div>
        <Button kind="quiet" onClick={() => navigate('/money/tools?tab=EXPENSES')}>{t('mn.exp.more')}</Button>
        <Button kind="primary" icon="plus" onClick={() => setAdding(true)}>{t('mn.ex.add')}</Button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 10, maxWidth: 640 }}>
        {[['TOPAY', 'mn.ex.toPay', sums.toPay, sums.nToPay, C.due], ['PAID', 'mn.ex.paidMonth', sums.paidMonth, sums.nPaid, C.ok]].map(([id, k, v, n, col]) => (
          <button key={id} type="button" onClick={() => setTab(id)} aria-pressed={tab === id}
            style={{ textAlign: 'left', padding: '12px 14px', borderRadius: 16, cursor: 'pointer', fontFamily: 'inherit', color: C.ink, background: 'white',
              border: tab === id ? `2px solid ${C.ink}` : `1.5px solid ${C.line}` }}>
            <span style={{ display: 'block', fontSize: 12, fontWeight: 800, letterSpacing: 1, color: C.faint }}>{t(k).toUpperCase()} · {n}</span>
            <span style={{ display: 'block', fontSize: 26, fontWeight: 800, color: col }}>{inr(v)}</span>
          </button>
        ))}
      </div>

      {heads.length > 1 && (
        <div style={{ display: 'flex', gap: 8, overflowX: 'auto', minWidth: 0 }}>
          <Chip on={!head} onClick={() => setHead('')}>{t('mn.ex.all')}</Chip>
          {heads.map(h => <Chip key={h} on={head === h} onClick={() => setHead(h)}>{headWord(h)}</Chip>)}
        </div>
      )}

      {err && <div role="alert" style={{ background: C.dangerSoft, color: C.danger, borderRadius: 14, padding: 14, fontWeight: 700 }}>{err}</div>}
      <div style={{ background: 'white', border: `1.5px solid ${C.line}`, borderRadius: 16, overflow: 'hidden' }}>
        {rows === null && !err && <div style={{ padding: 14, color: C.faint }}>…</div>}
        {rows !== null && !shown.length && <div style={{ padding: 14, color: C.faint }}>{t('mn.ex.none')}</div>}
        {shown.map((e, i) => (
          <div key={e.id} style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '12px 14px', borderTop: i ? '1px solid #F3F4F6' : 'none', flexWrap: vp.phone ? 'wrap' : 'nowrap' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 16, fontWeight: 700 }}>{e.description}</div>
              <div style={{ fontSize: 13, color: C.faint }}>
                {[headWord(e.category), e.vendorName, istDate(e.paidAt || e.transactionDate), e.status === 'Paid' ? e.paymentMode : null].filter(Boolean).join(' · ')}
              </div>
            </div>
            {e.fromPayroll && <Tag bg="#F3F4F6" fg={C.muted} style={{ fontSize: 12 }}>{t('mn.ex.payroll')}</Tag>}
            <span style={{ fontSize: 17, fontWeight: 800, whiteSpace: 'nowrap' }}>{inr(e.amount)}</span>
            {e.status !== 'Paid' && !e.fromPayroll && <Button kind="ok" onClick={() => setPaying(e)}>{t('mn.ex.markPaid')}</Button>}
          </div>
        ))}
      </div>

      <AddSheet open={adding} onClose={() => setAdding(false)}
        onDone={() => { setAdding(false); toast.show(t('mn.ex.saved')); setVer(v => v + 1); }} />
      <PaySheet expense={paying} onClose={() => setPaying(null)}
        onDone={() => { setPaying(null); toast.show(t('mn.ex.payDone')); setVer(v => v + 1); }} />
    </div>
  );
}

function FromChips({ value, onChange, withNone }) {
  return (
    <div style={{ display: 'grid', gap: 6 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {FROMS.filter(f => withNone || f !== 'NONE').map(f => <Chip key={f} on={value === f} onClick={() => onChange(f)}>{t(`mn.ex.f.${f}`)}</Chip>)}
      </div>
      <div style={{ fontSize: 14, color: C.muted }}>{t(`mn.ex.fn.${value}`)}</div>
    </div>
  );
}

function AddSheet({ open, onClose, onDone }) {
  const [amount, setAmount] = React.useState('');
  const [what, setWhat] = React.useState('');
  const [to, setTo] = React.useState('');
  const [head, setHead] = React.useState('Utilities');
  const [from, setFrom] = React.useState('CASH');
  const [ref, setRef] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState('');
  const key = React.useRef(newKey());
  React.useEffect(() => { if (open) { setAmount(''); setWhat(''); setTo(''); setHead('Utilities'); setFrom('CASH'); setRef(''); setErr(''); key.current = newKey(); } }, [open]);
  const n = Math.round((Number(amount) || 0) * 100) / 100;
  const ok = n > 0 && what.trim().length >= 2 && !busy;
  const save = async () => {
    if (!ok) return;
    setBusy(true); setErr('');
    try {
      await addExpense({
        description: what.trim(), category: head, amount: n, taxAmount: 0, vendorName: to.trim() || null,
        status: from === 'NONE' ? 'Pending' : 'Paid',
        paymentMode: from === 'NONE' ? null : from === 'CASH' ? 'Cash' : from === 'UPI' ? 'UPI' : 'Bank Transfer',
        referenceNumber: ref.trim() || null,
      }, key.current);
      onDone?.();
    } catch (e) { setErr(apiError(e) || t('mn.ex.failed')); key.current = newKey(); } finally { setBusy(false); }
  };
  const lab = { fontSize: 15, fontWeight: 700 };
  return (
    <Sheet open={open} onClose={busy ? undefined : onClose} title={t('mn.ex.add')}
      footer={(
        <div style={{ display: 'grid', gap: 8 }}>
          {err && <div role="alert" style={{ color: C.danger, fontWeight: 700 }}>{err}</div>}
          <Button kind="primary" size="lg" onClick={save} disabled={!ok}>{from === 'NONE' ? t('mn.ex.saveToPay') : t('mn.ex.save')}</Button>
        </div>
      )}>
      <div style={{ display: 'grid', gap: 14 }}>
        <label style={{ display: 'grid', gap: 6 }}><span style={lab}>{t('mn.ex.amount')}</span>
          <input inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value.replace(/[^\d.]/g, ''))} style={fieldStyle} /></label>
        <label style={{ display: 'grid', gap: 6 }}><span style={lab}>{t('mn.ex.what')}</span>
          <input value={what} onChange={e => setWhat(e.target.value.slice(0, 200))} style={fieldStyle} /></label>
        <label style={{ display: 'grid', gap: 6 }}><span style={lab}>{t('mn.ex.to')}</span>
          <input value={to} onChange={e => setTo(e.target.value.slice(0, 200))} style={fieldStyle} /></label>
        <div style={{ display: 'grid', gap: 6 }}><span style={lab}>{t('mn.ex.head')}</span>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{HEADS.map(h => <Chip key={h} on={head === h} onClick={() => setHead(h)}>{headWord(h)}</Chip>)}</div></div>
        <div style={{ display: 'grid', gap: 6 }}><span style={lab}>{t('mn.ex.from')}</span><FromChips value={from} onChange={setFrom} withNone /></div>
        {from !== 'NONE' && from !== 'CASH' && (
          <label style={{ display: 'grid', gap: 6 }}><span style={lab}>{t('mn.ex.ref')}</span>
            <input value={ref} onChange={e => setRef(e.target.value.slice(0, 100))} style={fieldStyle} /></label>
        )}
      </div>
    </Sheet>
  );
}

function PaySheet({ expense, onClose, onDone }) {
  const [from, setFrom] = React.useState('CASH');
  const [ref, setRef] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState('');
  React.useEffect(() => { setFrom('CASH'); setRef(''); setErr(''); }, [expense?.id]);
  if (!expense) return null;
  const pay = async () => {
    setBusy(true); setErr('');
    try { await payExpense(expense.id, from, ref.trim()); onDone?.(); }
    catch (e) { setErr(apiError(e) || t('mn.ex.failed')); } finally { setBusy(false); }
  };
  return (
    <Sheet open={!!expense} onClose={busy ? undefined : onClose} title={t('mn.ex.payTitle', { amount: inr(expense.amount) })}
      footer={(
        <div style={{ display: 'grid', gap: 8 }}>
          {err && <div role="alert" style={{ color: C.danger, fontWeight: 700 }}>{err}</div>}
          <Button kind="ok" size="lg" onClick={pay} disabled={busy}>{t('mn.ex.markPaid')}</Button>
        </div>
      )}>
      <div style={{ display: 'grid', gap: 14 }}>
        <div style={{ fontSize: 17, fontWeight: 700 }}>{expense.description}{expense.vendorName ? ` · ${expense.vendorName}` : ''}</div>
        <FromChips value={from} onChange={setFrom} />
        {from !== 'CASH' && <input aria-label={t('mn.ex.ref')} placeholder={t('mn.ex.ref')} value={ref} onChange={e => setRef(e.target.value.slice(0, 100))} style={fieldStyle} />}
      </div>
    </Sheet>
  );
}
