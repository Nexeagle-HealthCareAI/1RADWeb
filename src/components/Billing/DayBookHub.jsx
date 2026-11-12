import React from 'react';
import { fetchDayBook, closeDay } from '../../api/billing/dayBookApi';
import { notifyToast } from '../../utils/toast';

// Review B12: the cash view. Only money that actually moved — bill payments and
// refunds, advances taken and returned, referral payouts and expenses — by IST day,
// mode and cashier, with an end-of-day count against what the book expects.
// (Revenue's "collected" figures are by service date; this is by the day money moved.)

const KIND_LABEL = {
  BILL_PAYMENT: 'Bill payment',
  BILL_REFUND: 'Bill refund',
  ADVANCE_IN: 'Advance taken',
  ADVANCE_REFUND: 'Advance returned',
  REFERRAL_PAYOUT: 'Referral payout',
  EXPENSE: 'Expense',
};

const istToday = () => {
  const now = new Date(Date.now() + 330 * 60000);
  return now.toISOString().slice(0, 10);
};
const asUtc = (s) => (typeof s === 'string' && !/[zZ]|[+-]\d\d:?\d\d$/.test(s) ? `${s}Z` : s);
const fmtTime = (s) => {
  try { return new Date(asUtc(s)).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' }); }
  catch { return ''; }
};
const money = (n) => `${Number(n) < 0 ? '−' : ''}₹${Math.abs(Number(n) || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

const card = { background: 'white', border: '1px solid #e2e8f0', borderRadius: '14px', padding: '16px' };
const label = { fontSize: '10px', fontWeight: 800, color: '#64748b', letterSpacing: '0.6px', textTransform: 'uppercase' };

export default function DayBookHub({ isMobile, isOnline }) {
  const [date, setDate] = React.useState(istToday());
  const [book, setBook] = React.useState(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState('');
  const [counted, setCounted] = React.useState('');
  const [note, setNote] = React.useState('');
  const [closing, setClosing] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true); setError('');
    try {
      setBook(await fetchDayBook(date, date));
    } catch (e) {
      setError(e?.response?.data?.message || e?.response?.data?.error || 'Could not load the day book.');
    } finally {
      setLoading(false);
    }
  }, [date]);

  React.useEffect(() => { if (isOnline !== false) load(); }, [load, isOnline]);

  const mode = (m) => book?.byMode?.find(x => x.mode === m) || { in: 0, out: 0, net: 0 };
  const close = book?.closes?.[0] || null;
  const expectedCash = mode('CASH').net;
  const countedValue = counted === '' ? null : Number(counted);
  const variance = countedValue === null ? null : Math.round((countedValue - expectedCash) * 100) / 100;

  const submitClose = async () => {
    if (countedValue === null || Number.isNaN(countedValue) || countedValue < 0) return;
    setClosing(true);
    try {
      await closeDay({ date, countedCash: countedValue, note: note.trim() || null });
      notifyToast({ title: 'Day closed', message: variance === 0 ? 'Cash matches the day book.' : `Cash is ${variance > 0 ? 'over' : 'short'} by ${money(Math.abs(variance))}.` },
        variance === 0 ? 'success' : 'warning');
      setCounted(''); setNote('');
      await load();
    } catch (e) {
      notifyToast({ title: 'Day not closed', message: e?.response?.data?.message || e?.response?.data?.error || 'Please try again.' }, 'error');
    } finally {
      setClosing(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', padding: isMobile ? '12px 16px' : 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
        <div style={{ fontSize: '16px', fontWeight: 800, color: '#0f172a' }}>Day book</div>
        <input type="date" value={date} max={istToday()} onChange={e => setDate(e.target.value)}
          style={{ padding: '7px 10px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '13px' }} />
        <button type="button" onClick={load} disabled={loading}
          style={{ padding: '7px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', background: 'white', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}>
          {loading ? 'Loading…' : 'Refresh'}
        </button>
        <div style={{ fontSize: '11px', color: '#64748b' }}>Money that moved on this day (India time). Settling a bill from a patient&apos;s advance isn&apos;t counted here.</div>
      </div>

      {error && <div style={{ ...card, borderColor: '#fecaca', color: '#b91c1c', fontSize: '12px' }}>{error}</div>}

      {book && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4, 1fr)', gap: '10px' }}>
            {['CASH', 'UPI', 'CARD', 'OTHER'].map(m => {
              const t = mode(m);
              return (
                <div key={m} style={card}>
                  <div style={label}>{m === 'OTHER' ? 'Bank / other' : m}</div>
                  <div style={{ fontSize: '20px', fontWeight: 900, color: '#0f172a', marginTop: '4px' }}>{money(t.net)}</div>
                  <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>in {money(t.in)} · out {money(t.out)}</div>
                </div>
              );
            })}
          </div>

          <div style={{ ...card, display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: '14px', alignItems: isMobile ? 'stretch' : 'flex-end' }}>
            <div style={{ flex: 1 }}>
              <div style={label}>Cash in the drawer</div>
              {close ? (
                <div style={{ fontSize: '12px', color: '#334155', marginTop: '6px', lineHeight: 1.6 }}>
                  Closed by {close.closedByName || 'someone'}{close.closeCount > 1 ? ` (counted ${close.closeCount} times)` : ''}:
                  counted {money(close.countedCash)} against {money(close.expectedCash)} expected —{' '}
                  <b style={{ color: close.variance === 0 ? '#15803d' : '#b45309' }}>
                    {close.variance === 0 ? 'matches' : `${close.variance > 0 ? 'over' : 'short'} by ${money(Math.abs(close.variance))}`}
                  </b>
                  {close.note ? <div style={{ color: '#64748b' }}>Note: {close.note}</div> : null}
                  {Math.abs(close.expectedCash - expectedCash) > 0.009 && (
                    <div style={{ color: '#b45309' }}>Cash entries changed after the close (now {money(expectedCash)} expected). Re-count to update.</div>
                  )}
                </div>
              ) : (
                <div style={{ fontSize: '12px', color: '#64748b', marginTop: '6px' }}>Expected {money(expectedCash)}. Count the drawer and record it to close the day.</div>
              )}
            </div>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
              <input type="number" min="0" step="0.01" placeholder="Counted ₹" value={counted} onChange={e => setCounted(e.target.value)}
                style={{ width: '130px', padding: '8px 10px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px', fontWeight: 700 }} />
              <input type="text" placeholder="Note (e.g. why it's short)" value={note} onChange={e => setNote(e.target.value)} maxLength={300}
                style={{ flex: 1, minWidth: '160px', padding: '8px 10px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '12px' }} />
              {variance !== null && !Number.isNaN(variance) && (
                <span style={{ fontSize: '12px', fontWeight: 800, color: variance === 0 ? '#15803d' : '#b45309' }}>
                  {variance === 0 ? 'Matches' : `${variance > 0 ? 'Over' : 'Short'} ${money(Math.abs(variance))}`}
                </span>
              )}
              <button type="button" onClick={submitClose} disabled={closing || countedValue === null || isOnline === false}
                style={{ padding: '9px 14px', borderRadius: '9px', border: 'none', background: '#0f52ba', color: 'white', fontSize: '12px', fontWeight: 800,
                  cursor: closing || countedValue === null ? 'not-allowed' : 'pointer', opacity: closing || countedValue === null ? 0.6 : 1 }}>
                {closing ? 'Saving…' : close ? 'Re-count' : 'Close the day'}
              </button>
            </div>
          </div>

          {book.byCashier?.length > 0 && (
            <div style={card}>
              <div style={{ ...label, marginBottom: '8px' }}>By cashier</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                {book.byCashier.map((c, i) => (
                  <div key={i} style={{ fontSize: '12px', padding: '6px 10px', borderRadius: '999px', background: '#f1f5f9', color: '#334155' }}>
                    {c.cashier} · {c.mode}: <b>{money(c.net)}</b> ({c.entries})
                  </div>
                ))}
              </div>
            </div>
          )}

          <div style={{ ...card, padding: 0, overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', minWidth: '560px' }}>
              <thead>
                <tr style={{ background: '#f8fafc', textAlign: 'left' }}>
                  {['Time', 'Entry', 'Mode', 'Bill / ref', 'Patient / party', 'By', 'Amount'].map(h => (
                    <th key={h} style={{ padding: '10px 12px', ...label, textAlign: h === 'Amount' ? 'right' : 'left' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {book.lines.length === 0 && (
                  <tr><td colSpan={7} style={{ padding: '16px', color: '#64748b', textAlign: 'center' }}>No money moved on this day.</td></tr>
                )}
                {book.lines.map((l, i) => (
                  <tr key={i} style={{ borderTop: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '8px 12px', color: '#64748b' }}>{fmtTime(l.at)}</td>
                    <td style={{ padding: '8px 12px' }}>{KIND_LABEL[l.kind] || l.kind}</td>
                    <td style={{ padding: '8px 12px' }}>{l.mode}</td>
                    <td style={{ padding: '8px 12px' }}>{l.reference || '—'}</td>
                    <td style={{ padding: '8px 12px' }}>{l.party || '—'}</td>
                    <td style={{ padding: '8px 12px', color: '#64748b' }}>{l.cashier || '—'}</td>
                    <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 800, color: l.amount < 0 ? '#b91c1c' : '#15803d' }}>{money(l.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
