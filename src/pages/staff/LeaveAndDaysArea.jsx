// ════════════════════════════════════════════════════════════════════════════
//  Staff ▸ Leave & working days (Nov 2026)
//
//  Balances      — everyone's leave left, worked out on the server (quota,
//                  carried in, opening, corrections, taken, encashed, waiting);
//                  set an opening balance, correct with a reason, close the year.
//  Working days  — weekly off, which Saturdays are off, the holiday list, and
//                  each person's own weekly off. Leave is counted on working
//                  days only; attendance and salary will use the same calendar.
//  Leave types   — the existing leave policy editor (quota, paid, carry-forward).
// ════════════════════════════════════════════════════════════════════════════
import React from 'react';
import apiClient from '../../api/apiClient';
import { Button, Chip, Sheet } from '../../components/saral/Saral';
import { C, FONT } from '../../components/saral/tokens';
import { useToast, useViewport, useChipRow } from '../../components/saral/hooks';
import { apiError } from '../../components/saral/formUtil';
import LeavePolicyEditor from '../../components/LeavePolicyEditor';

const DAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
const DAY_NAME = { MON: 'Mon', TUE: 'Tue', WED: 'Wed', THU: 'Thu', FRI: 'Fri', SAT: 'Sat', SUN: 'Sun' };
const SATS = [{ id: '', label: 'None' }, { id: '2_4', label: '2nd & 4th' }, { id: '1_3', label: '1st & 3rd' }];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
// Fixed-date national holidays. Festival dates change every year, so those are added by hand.
const NATIONAL = [['01-26', 'Republic Day'], ['08-15', 'Independence Day'], ['10-02', 'Gandhi Jayanti']];

const num = (n) => {
  const v = Number(n) || 0;
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
};
const fmtDate = (iso) => {
  if (!iso) return '';
  const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
};

const card = { background: 'white', border: `1px solid ${C.line}`, borderRadius: 16, padding: 16 };
const label = { fontSize: 13, fontWeight: 700, color: C.faint, textTransform: 'uppercase', letterSpacing: 0.4 };
const input = {
  height: 48, borderRadius: 12, border: `1.5px solid ${C.lineStrong}`, padding: '0 12px', fontSize: 16,
  fontFamily: 'inherit', color: C.ink, background: 'white', minWidth: 0, boxSizing: 'border-box',
};

export default function LeaveAndDaysArea({ hospitalId, currentUserName, onBalancesChanged }) {
  const vp = useViewport();
  const toast = useToast();
  const [part, setPart] = React.useState('balances');
  const thisYear = new Date().getFullYear();
  const [year, setYear] = React.useState(thisYear);
  const [chipRef, chipRow] = useChipRow(part);

  const parts = [
    { id: 'balances', label: 'Leave balances' },
    { id: 'days', label: 'Working days & holidays' },
    { id: 'types', label: 'Leave types' },
  ];

  return (
    <div style={{ fontFamily: FONT, color: C.ink, padding: vp.phone ? 12 : 20, display: 'grid', gap: 14, gridTemplateColumns: 'minmax(0,1fr)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', justifyContent: 'space-between' }}>
        <nav aria-label="Leave and working days" ref={chipRef} onScroll={chipRow.onScroll}
          style={{ display: 'flex', gap: 8, overflowX: 'auto', minWidth: 0, flex: '1 1 auto', ...chipRow.style }}>
          {parts.map(p => (
            <Chip key={p.id} on={p.id === part} aria-current={p.id === part ? 'page' : undefined} onClick={() => setPart(p.id)}>{p.label}</Chip>
          ))}
        </nav>
        {part !== 'types' && (
          <div role="group" aria-label="Year" style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'white', border: `1.5px solid ${C.lineStrong}`, borderRadius: 999, padding: 3 }}>
            <button type="button" aria-label="Previous year" onClick={() => setYear(y => y - 1)} style={yearBtn}>‹</button>
            <span style={{ fontSize: 16, fontWeight: 800, minWidth: 52, textAlign: 'center' }}>{year}</span>
            <button type="button" aria-label="Next year" onClick={() => setYear(y => Math.min(thisYear + 1, y + 1))} disabled={year >= thisYear + 1} style={{ ...yearBtn, opacity: year >= thisYear + 1 ? 0.35 : 1 }}>›</button>
          </div>
        )}
      </div>

      {part === 'balances' && <Balances year={year} vp={vp} toast={toast} onChanged={onBalancesChanged} goTypes={() => setPart('types')} />}
      {part === 'days' && <WorkingDays year={year} vp={vp} toast={toast} onChanged={onBalancesChanged} />}
      {part === 'types' && (
        <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
          <LeavePolicyEditor hospitalId={hospitalId} currentUserName={currentUserName} />
        </div>
      )}
      {toast.node}
    </div>
  );
}

const yearBtn = { width: 40, height: 40, borderRadius: 999, border: 'none', background: 'transparent', fontSize: 22, fontWeight: 800, cursor: 'pointer', color: C.ink };

// ── Balances ───────────────────────────────────────────────────────────────

function Balances({ year, vp, toast, onChanged, goTypes }) {
  const [data, setData] = React.useState(null);
  const [err, setErr] = React.useState('');
  const [q, setQ] = React.useState('');
  const [open, setOpen] = React.useState(null);      // { person, type }
  const [weekly, setWeekly] = React.useState(null);  // person
  const [closing, setClosing] = React.useState(false);

  const [ver, setVer] = React.useState(0);
  const load = () => setVer(v => v + 1);
  React.useEffect(() => {
    let alive = true;
    apiClient.get(`/leave/balances?year=${year}`, { suppressErrorToast: true })
      .then(res => { if (alive) { setErr(''); setData(res.data || null); } })
      .catch(e => { if (alive) { setErr(apiError(e) || 'Could not load leave balances.'); setData(null); } });
    return () => { alive = false; };
  }, [year, ver]);

  const changed = () => { load(); onChanged?.(); };

  if (err) return <div style={{ ...card, color: C.danger, fontWeight: 700 }}>{err} <Button kind="ghost" onClick={load}>Try again</Button></div>;
  if (!data) return <div style={{ ...card, color: C.faint }}>Loading leave balances…</div>;
  if (!data.policySet) {
    return (
      <div style={{ ...card, display: 'grid', gap: 10 }}>
        <div style={{ fontSize: 18, fontWeight: 800 }}>No leave types yet</div>
        <div style={{ color: C.muted }}>Add your centre's leave types (for example Casual 12 days, Sick 6, Earned 15) and balances appear here for everyone.</div>
        <div><Button onClick={goTypes}>Set up leave types</Button></div>
      </div>
    );
  }

  const types = data.policy || [];
  const people = (data.staff || []).filter(p => !q || p.name.toLowerCase().includes(q.toLowerCase()) || (p.employeeCode || '').toLowerCase().includes(q.toLowerCase()));
  const now = new Date();
  const canClose = year < now.getFullYear() || (year === now.getFullYear() && now.getMonth() === 11);
  const carriers = types.filter(t => t.isPaid && Number(t.carryForwardMax) > 0);

  const cell = (p, t) => {
    const b = p.types.find(x => x.type === t.name);
    if (!b) return null;
    const low = b.paid && b.balance <= 0;
    return (
      <button type="button" onClick={() => setOpen({ person: p, type: b })}
        aria-label={`${p.name}, ${b.type}: ${b.paid ? `${num(b.balance)} left` : `${num(b.taken)} taken`}`}
        style={{ width: '100%', minHeight: 52, border: `1px solid ${C.line}`, borderRadius: 12, background: low ? C.dangerSoft : 'white', cursor: 'pointer',
          display: 'flex', flexDirection: 'column', alignItems: vp.phone ? 'flex-start' : 'center', justifyContent: 'center', padding: '6px 10px', fontFamily: 'inherit' }}>
        {b.paid ? (
          <>
            <span style={{ fontSize: 18, fontWeight: 800, color: low ? C.danger : C.ink, lineHeight: 1.1 }}>{num(b.balance)}<span style={{ fontSize: 13, fontWeight: 600, color: C.faint }}> left</span></span>
            <span style={{ fontSize: 12, color: C.faint }}>
              {num(b.taken)} taken{b.pending > 0 ? ` · ${num(b.pending)} waiting` : ''}
            </span>
          </>
        ) : (
          <>
            <span style={{ fontSize: 18, fontWeight: 800, lineHeight: 1.1 }}>{num(b.taken)}<span style={{ fontSize: 13, fontWeight: 600, color: C.faint }}> taken</span></span>
            <span style={{ fontSize: 12, color: C.faint }}>unpaid{b.pending > 0 ? ` · ${num(b.pending)} waiting` : ''}</span>
          </>
        )}
      </button>
    );
  };

  const weeklyLabel = (p) => (p.weeklyOff?.length ? p.weeklyOff.map(d => DAY_NAME[d]).join(', ') + ' off' : "Centre's weekly off");

  return (
    <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'minmax(0,1fr)' }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Find a person" aria-label="Find a person"
          style={{ ...input, flex: '1 1 220px' }} />
        <div style={{ fontSize: 14, color: C.muted }}>
          {data.staff.length} people · leave counted on working days only
        </div>
      </div>

      {vp.phone ? (
        <div style={{ display: 'grid', gap: 10 }}>
          {people.map(p => (
            <div key={p.staffId} style={{ ...card, padding: 12, display: 'grid', gap: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'baseline' }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 17, fontWeight: 800 }}>{p.name}</div>
                  <div style={{ fontSize: 13, color: C.faint }}>{[p.employeeCode, p.designation].filter(Boolean).join(' · ')}</div>
                </div>
                <button type="button" onClick={() => setWeekly(p)} style={linkBtn}>{weeklyLabel(p)}</button>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 8 }}>
                {types.map(t => (
                  <div key={t.name} style={{ display: 'grid', gap: 4 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: C.faint }}>{t.name}</span>
                    {cell(p, t)}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ ...card, padding: 0, overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 300 + types.length * 130 }}>
            <thead>
              <tr style={{ background: '#F9FAFB' }}>
                <th style={th}>Person</th>
                {types.map(t => (
                  <th key={t.name} style={{ ...th, textAlign: 'center' }}>
                    {t.name}
                    <div style={{ fontSize: 12, fontWeight: 600, color: C.faint, textTransform: 'none', letterSpacing: 0 }}>
                      {t.isPaid ? `${num(t.annualQuota)} a year${t.monthlyAccrual ? ', monthly' : ''}` : 'unpaid'}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {people.map(p => (
                <tr key={p.staffId} style={{ borderTop: `1px solid ${C.line}` }}>
                  <td style={{ padding: '10px 14px', verticalAlign: 'middle' }}>
                    <div style={{ fontSize: 15, fontWeight: 800 }}>{p.name}</div>
                    <div style={{ fontSize: 13, color: C.faint }}>{[p.employeeCode, p.designation].filter(Boolean).join(' · ')}</div>
                    <button type="button" onClick={() => setWeekly(p)} style={{ ...linkBtn, padding: 0, marginTop: 2 }}>{weeklyLabel(p)}</button>
                  </td>
                  {types.map(t => <td key={t.name} style={{ padding: '8px 8px', minWidth: 120 }}>{cell(p, t)}</td>)}
                </tr>
              ))}
              {people.length === 0 && (
                <tr><td colSpan={types.length + 1} style={{ padding: 24, textAlign: 'center', color: C.faint }}>No one matches.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Year end */}
      <div style={{ ...card, display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'space-between' }}>
        <div style={{ minWidth: 0, flex: '1 1 300px' }}>
          <div style={{ fontSize: 16, fontWeight: 800 }}>Close {year} and carry leave into {year + 1}</div>
          <div style={{ fontSize: 14, color: C.muted, marginTop: 2 }}>
            {carriers.length
              ? `Carried: ${carriers.map(t => `${t.name} up to ${num(t.carryForwardMax)}`).join(', ')}. Everything else left lapses.`
              : 'No leave type carries forward, so what is left lapses. Set a carry-forward limit under Leave types.'}
            {data.yearEndDone ? ` Done already — running it again replaces the earlier carry-forward.` : ''}
          </div>
        </div>
        <Button kind={data.yearEndDone ? 'quiet' : 'outline'} disabled={!canClose} onClick={() => setClosing(true)}
          title={canClose ? undefined : 'From December onwards'}>
          {data.yearEndDone ? 'Run again' : `Close ${year}`}
        </Button>
      </div>

      <BalanceSheet key={open ? `${open.person.staffId}|${open.type.type}` : 'none'} open={open} year={year} onClose={() => setOpen(null)} toast={toast} onSaved={() => { setOpen(null); changed(); }} />
      <WeeklyOffSheet key={weekly?.staffId || 'none'} person={weekly} onClose={() => setWeekly(null)} toast={toast} onSaved={() => { setWeekly(null); changed(); }} />
      <YearEndSheet open={closing} year={year} again={data.yearEndDone} onClose={() => setClosing(false)} toast={toast}
        onDone={() => { setClosing(false); changed(); }} />
    </div>
  );
}

const th = { textAlign: 'left', padding: '12px 14px', fontSize: 13, fontWeight: 800, color: C.muted, textTransform: 'uppercase', letterSpacing: 0.4, whiteSpace: 'nowrap' };
const linkBtn = { background: 'none', border: 'none', color: C.primary, fontSize: 13, fontWeight: 700, cursor: 'pointer', padding: '4px 0', fontFamily: 'inherit', textAlign: 'left' };

function Row({ k, v, strong, tone }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '7px 0', borderBottom: `1px solid ${C.line}`, fontSize: 16 }}>
      <span style={{ color: strong ? C.ink : C.muted, fontWeight: strong ? 800 : 500 }}>{k}</span>
      <span style={{ fontWeight: strong ? 800 : 700, color: tone || C.ink }}>{v}</span>
    </div>
  );
}

function BalanceSheet({ open, year, onClose, toast, onSaved }) {
  const [mode, setMode] = React.useState(null); // 'OPENING' | 'ADJUST'
  const [days, setDays] = React.useState('');
  const [sign, setSign] = React.useState(1);
  const [note, setNote] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  if (!open) return null;
  const { person: p, type: b } = open;

  const save = async () => {
    const d = Number(days);
    if (!(d > 0) && !(mode === 'OPENING' && d === 0)) { toast.show('Enter the number of days.', 'error'); return; }
    if (mode === 'ADJUST' && !note.trim()) { toast.show('Say why the balance is being corrected.', 'error'); return; }
    setBusy(true);
    try {
      await apiClient.post(`/leave/balances/${p.staffId}/adjust`, {
        year, leaveType: b.type, kind: mode, days: mode === 'ADJUST' ? sign * d : d, note: note.trim() || null,
      }, { suppressErrorToast: true });
      toast.show(mode === 'OPENING' ? 'Opening balance saved.' : 'Balance corrected.');
      onSaved();
    } catch (e) { toast.show(apiError(e) || 'Could not save.', 'error'); } finally { setBusy(false); }
  };

  return (
    <Sheet open onClose={onClose} title={`${p.name} · ${b.type} · ${year}`}
      footer={mode ? (
        <div style={{ display: 'flex', gap: 10 }}>
          <Button kind="quiet" onClick={() => setMode(null)} style={{ flex: 1 }}>Back</Button>
          <Button onClick={save} disabled={busy} style={{ flex: 2 }}>{busy ? 'Saving…' : 'Save'}</Button>
        </div>
      ) : null}>
      {!mode && (
        <div style={{ display: 'grid', gap: 4 }}>
          {b.paid ? (
            <>
              <Row k="Yearly quota" v={num(b.quota)} />
              {b.carriedIn !== 0 && <Row k={`Carried in from ${year - 1}`} v={`+${num(b.carriedIn)}`} />}
              {b.opening !== 0 && <Row k="Opening balance" v={`+${num(b.opening)}`} />}
              {b.adjusted !== 0 && <Row k="Corrections" v={`${b.adjusted > 0 ? '+' : ''}${num(b.adjusted)}`} />}
              <Row k="Taken" v={`${b.taken ? "−" : ""}${num(b.taken)}`} />
              {b.encashed !== 0 && <Row k="Paid out with salary" v={`−${num(b.encashed)}`} />}
              <Row k="Left" v={num(b.balance)} strong tone={b.balance <= 0 ? C.danger : C.ok} />
              {b.pending > 0 && <div style={{ fontSize: 14, color: C.due, fontWeight: 700, paddingTop: 6 }}>{num(b.pending)} day(s) waiting for approval are not taken off yet.</div>}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 14 }}>
                <Button kind="outline" onClick={() => setMode('OPENING')}>Opening balance</Button>
                <Button kind="quiet" onClick={() => setMode('ADJUST')}>Correct</Button>
              </div>
              <div style={{ fontSize: 13, color: C.faint, marginTop: 6 }}>
                Opening balance: leave someone already had when you started using 1Rad. Correct: add or take away days, with a reason (kept in history).
              </div>
            </>
          ) : (
            <>
              <Row k="Unpaid leave taken" v={num(b.taken)} strong />
              {b.pending > 0 && <Row k="Waiting for approval" v={num(b.pending)} />}
              <div style={{ fontSize: 14, color: C.muted, marginTop: 8 }}>Unpaid leave has no balance; it is cut from salary.</div>
            </>
          )}
        </div>
      )}
      {mode && (
        <div style={{ display: 'grid', gap: 12 }}>
          {mode === 'ADJUST' && (
            <div role="group" aria-label="Add or take away" style={{ display: 'flex', gap: 8 }}>
              <Chip on={sign === 1} onClick={() => setSign(1)}>Add days</Chip>
              <Chip on={sign === -1} onClick={() => setSign(-1)}>Take away days</Chip>
            </div>
          )}
          <label style={{ display: 'grid', gap: 6 }}>
            <span style={label}>{mode === 'OPENING' ? `Opening balance for ${year}` : 'Days'}</span>
            <input type="number" inputMode="decimal" min="0" step="0.5" value={days} onChange={e => setDays(e.target.value)} style={input} autoFocus />
          </label>
          <label style={{ display: 'grid', gap: 6 }}>
            <span style={label}>{mode === 'ADJUST' ? 'Reason (needed)' : 'Note (optional)'}</span>
            <input value={note} onChange={e => setNote(e.target.value)} maxLength={300} style={input}
              placeholder={mode === 'ADJUST' ? 'e.g. Half day marked as full day in March' : 'e.g. From the old register'} />
          </label>
          {mode === 'OPENING' && b.opening !== 0 && <div style={{ fontSize: 14, color: C.muted }}>This replaces the opening balance of {num(b.opening)}.</div>}
        </div>
      )}
    </Sheet>
  );
}

function WeeklyOffSheet({ person, onClose, toast, onSaved }) {
  const [own, setOwn] = React.useState(!!person?.weeklyOff?.length);
  const [days, setDays] = React.useState(person?.weeklyOff || []);
  const [busy, setBusy] = React.useState(false);
  if (!person) return null;
  const toggle = (d) => setDays(prev => prev.includes(d) ? prev.filter(x => x !== d) : prev.length >= 3 ? prev : [...prev, d]);
  const save = async () => {
    if (own && days.length === 0) { toast.show('Pick at least one day, or use the centre\'s weekly off.', 'error'); return; }
    setBusy(true);
    try {
      await apiClient.put(`/work-calendar/staff/${person.staffId}/weekly-off`, { weeklyOff: own ? days : [] }, { suppressErrorToast: true });
      toast.show(`${person.name}'s weekly off saved.`);
      onSaved();
    } catch (e) { toast.show(apiError(e) || 'Could not save.', 'error'); } finally { setBusy(false); }
  };
  return (
    <Sheet open onClose={onClose} title={`${person.name} · weekly off`}
      footer={<Button full onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save'}</Button>}>
      <div style={{ display: 'grid', gap: 12 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Chip on={!own} onClick={() => setOwn(false)}>Centre's weekly off</Chip>
          <Chip on={own} onClick={() => setOwn(true)}>Own day off</Chip>
        </div>
        {own && (
          <>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {DAYS.map(d => <Chip key={d} on={days.includes(d)} onClick={() => toggle(d)} style={{ minWidth: 60 }}>{DAY_NAME[d]}</Chip>)}
            </div>
            <div style={{ fontSize: 14, color: C.muted }}>For someone who works Sundays and is off another day, e.g. a radiographer off on Tuesdays. Holidays still apply.</div>
          </>
        )}
      </div>
    </Sheet>
  );
}

function YearEndSheet({ open, year, again, onClose, toast, onDone }) {
  const [busy, setBusy] = React.useState(false);
  if (!open) return null;
  const run = async () => {
    setBusy(true);
    try {
      const res = await apiClient.post('/leave/year-end', { year }, { suppressErrorToast: true });
      const r = res.data || {};
      toast.show(`${num(r.daysCarried)} day(s) carried into ${year + 1}; ${num(r.daysLapsed)} lapsed.`);
      onDone();
    } catch (e) { toast.show(apiError(e) || 'Could not close the year.', 'error'); } finally { setBusy(false); }
  };
  return (
    <Sheet open onClose={onClose} title={`Close ${year}`}
      footer={<div style={{ display: 'flex', gap: 10 }}>
        <Button kind="quiet" onClick={onClose} style={{ flex: 1 }}>Not now</Button>
        <Button onClick={run} disabled={busy} style={{ flex: 2 }}>{busy ? 'Working…' : again ? 'Run again' : `Carry into ${year + 1}`}</Button>
      </div>}>
      <div style={{ display: 'grid', gap: 10, fontSize: 16, color: C.muted }}>
        <div>For each person, the leave left at the end of {year} is carried into {year + 1} up to each type's carry-forward limit. The rest lapses.</div>
        <div>Approve or reject any leave still waiting first, so the numbers are final.</div>
        {again && <div style={{ color: C.due, fontWeight: 700 }}>This was done before. Running it again replaces the earlier carry-forward with today's numbers.</div>}
      </div>
    </Sheet>
  );
}

// ── Working days & holidays ────────────────────────────────────────────────

function WorkingDays({ year, vp, toast, onChanged }) {
  const [cal, setCal] = React.useState(null);
  const [err, setErr] = React.useState('');
  const [off, setOff] = React.useState(['SUN']);
  const [sat, setSat] = React.useState('');
  const [dirty, setDirty] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [hDate, setHDate] = React.useState('');
  const [hName, setHName] = React.useState('');

  const [ver, setVer] = React.useState(0);
  const load = () => setVer(v => v + 1);
  React.useEffect(() => {
    let alive = true;
    apiClient.get(`/work-calendar?year=${year}`, { suppressErrorToast: true })
      .then(res => {
        if (!alive) return;
        const d = res.data || {};
        setErr(''); setCal(d);
        setOff(d.weeklyOff || ['SUN']);
        setSat(d.saturdaysOff || '');
        setDirty(false);
      })
      .catch(e => { if (alive) setErr(apiError(e) || 'Could not load the calendar.'); });
    return () => { alive = false; };
  }, [year, ver]);

  const toggle = (d) => {
    setOff(prev => prev.includes(d) ? prev.filter(x => x !== d) : prev.length >= 3 ? prev : [...prev, d]);
    setDirty(true);
  };

  const saveWeek = async () => {
    setBusy(true);
    try {
      await apiClient.put('/work-calendar', { weeklyOff: off, saturdaysOff: off.includes('SAT') ? null : (sat || null) }, { suppressErrorToast: true });
      toast.show('Working week saved.');
      load(); onChanged?.();
    } catch (e) { toast.show(apiError(e) || 'Could not save.', 'error'); } finally { setBusy(false); }
  };

  const addHolidays = async (list) => {
    setBusy(true);
    try {
      await apiClient.post('/work-calendar/holidays', { holidays: list }, { suppressErrorToast: true });
      toast.show(list.length === 1 ? `${list[0].name} added.` : `${list.length} holidays added.`);
      setHDate(''); setHName('');
      load(); onChanged?.();
    } catch (e) { toast.show(apiError(e) || 'Could not add.', 'error'); } finally { setBusy(false); }
  };

  const remove = async (h) => {
    try {
      await apiClient.delete(`/work-calendar/holidays/${h.id}`, { suppressErrorToast: true });
      toast.show(`${h.name} removed.`);
      load(); onChanged?.();
    } catch (e) { toast.show(apiError(e) || 'Could not remove.', 'error'); }
  };

  if (err) return <div style={{ ...card, color: C.danger, fontWeight: 700 }}>{err} <Button kind="ghost" onClick={load}>Try again</Button></div>;
  if (!cal) return <div style={{ ...card, color: C.faint }}>Loading the calendar…</div>;

  const missingNational = NATIONAL.filter(([md]) => !(cal.holidays || []).some(h => String(h.date).slice(5, 10) === md));
  const thisMonth = new Date().getFullYear() === year ? new Date().getMonth() : -1;

  return (
    <div style={{ display: 'grid', gap: 14, gridTemplateColumns: vp.phone ? 'minmax(0,1fr)' : 'minmax(0,1fr) minmax(0,1fr)', alignItems: 'start' }}>
      <div style={{ display: 'grid', gap: 14 }}>
        <section style={{ ...card, display: 'grid', gap: 12 }} aria-labelledby="wk-title">
          <div>
            <div id="wk-title" style={{ fontSize: 18, fontWeight: 800 }}>Working week</div>
            {!cal.configured && <div style={{ fontSize: 14, color: C.due, fontWeight: 700, marginTop: 2 }}>Not set yet — 1Rad assumes Sunday off. Check and save.</div>}
          </div>
          <div>
            <div style={{ ...label, marginBottom: 6 }}>Weekly off</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {DAYS.map(d => <Chip key={d} on={off.includes(d)} onClick={() => toggle(d)} style={{ minWidth: 60 }}>{DAY_NAME[d]}</Chip>)}
            </div>
          </div>
          {!off.includes('SAT') && (
            <div>
              <div style={{ ...label, marginBottom: 6 }}>Saturdays off</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {SATS.map(s => <Chip key={s.id} on={sat === s.id} onClick={() => { setSat(s.id); setDirty(true); }}>{s.label}</Chip>)}
              </div>
            </div>
          )}
          <div style={{ fontSize: 14, color: C.muted }}>Someone with a different day off (e.g. works Sundays) can have their own — set it from Leave balances.</div>
          <div><Button onClick={saveWeek} disabled={busy || (!dirty && cal.configured)}>{busy ? 'Saving…' : 'Save working week'}</Button></div>
        </section>

        <section style={{ ...card, display: 'grid', gap: 10 }} aria-labelledby="wd-title">
          <div id="wd-title" style={{ fontSize: 18, fontWeight: 800 }}>Working days in {year}: {cal.workingDaysInYear}</div>
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${vp.phone ? 4 : 6}, minmax(0,1fr))`, gap: 6 }}>
            {(cal.months || []).map((m, i) => (
              <div key={m.month} title={`${m.weeklyOff} weekly off, ${m.holidays} holiday(s)`}
                style={{ border: `1.5px solid ${i === thisMonth ? C.primary : C.line}`, borderRadius: 12, padding: '8px 6px', textAlign: 'center', background: i === thisMonth ? C.primarySoft : 'white' }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: C.faint }}>{MONTHS[i]}</div>
                <div style={{ fontSize: 20, fontWeight: 800 }}>{m.working}</div>
                {m.holidays > 0 && <div style={{ fontSize: 11, color: C.due, fontWeight: 700 }}>{m.holidays} hol.</div>}
              </div>
            ))}
          </div>
        </section>
      </div>

      <section style={{ ...card, display: 'grid', gap: 12 }} aria-labelledby="hol-title">
        <div id="hol-title" style={{ fontSize: 18, fontWeight: 800 }}>Holidays in {year} ({(cal.holidays || []).length})</div>
        <form onSubmit={e => { e.preventDefault(); if (hDate && hName.trim()) addHolidays([{ date: hDate, name: hName.trim() }]); }}
          style={{ display: 'grid', gridTemplateColumns: vp.phone ? 'minmax(0,1fr)' : '160px minmax(0,1fr) auto', gap: 8 }}>
          <input type="date" aria-label="Holiday date" value={hDate} min={`${year}-01-01`} max={`${year}-12-31`} onChange={e => setHDate(e.target.value)} style={input} />
          <input aria-label="Holiday name" placeholder="e.g. Durga Puja" value={hName} maxLength={100} onChange={e => setHName(e.target.value)} style={input} />
          <Button type="submit" disabled={busy || !hDate || !hName.trim()}>Add</Button>
        </form>
        {missingNational.length > 0 && (
          <Button kind="quiet" disabled={busy} onClick={() => addHolidays(missingNational.map(([md, name]) => ({ date: `${year}-${md}`, name })))}>
            Add {missingNational.map(n => n[1]).join(', ')}
          </Button>
        )}
        <div style={{ display: 'grid' }}>
          {(cal.holidays || []).map(h => (
            <div key={h.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderTop: `1px solid ${C.line}` }}>
              <div style={{ width: 92, flexShrink: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 800 }}>{fmtDate(h.date).replace(` ${year}`, '')}</div>
                <div style={{ fontSize: 12, color: C.faint }}>{DAY_NAME[h.weekday]}</div>
              </div>
              <div style={{ flex: 1, minWidth: 0, fontSize: 16, fontWeight: 600 }}>{h.name}</div>
              <button type="button" onClick={() => remove(h)} aria-label={`Remove ${h.name}`}
                style={{ ...linkBtn, color: C.danger, padding: '8px 4px' }}>Remove</button>
            </div>
          ))}
          {(cal.holidays || []).length === 0 && <div style={{ color: C.faint, padding: '8px 0' }}>No holidays yet. Festival dates change every year — add them here.</div>}
        </div>
      </section>
    </div>
  );
}
