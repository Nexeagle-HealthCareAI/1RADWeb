// ════════════════════════════════════════════════════════════════════════════
//  Admin dashboard ▸ Overview (rebuilt Nov 2026)
//
//  "How is the centre doing?" in plain words, for the chosen period:
//    1. Headline: patients, money billed, money collected, still to collect,
//       reports waiting — each with what to open next.
//    2. Patients per day (last 7 days) and by scan type (patients and money).
//    3. Reports waiting by scan type and the average time to a signed report.
//    4. Money: billed vs collected, how it was paid, dues by age, and each
//       scan type's earnings after partners' share and running costs.
//    5. Partners who sent the most patients, and what is still owed to them.
//    6. Patients: new vs returning, women/men, age groups, where they come from.
//  Only numbers the server actually counted are shown; anything missing is "—".
// ════════════════════════════════════════════════════════════════════════════
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Chip } from '../../components/saral/Saral';
import { C, FONT, inr } from '../../components/saral/tokens';
import { useViewport, useChipRow } from '../../components/saral/hooks';

const PERIODS = [
  { key: 'DAY', label: 'Today', prev: 'yesterday' },
  { key: 'WEEK', label: 'Last 7 days', prev: 'the week before' },
  { key: 'MONTH', label: 'This month', prev: 'the period before' },
  { key: 'YEAR', label: 'This year', prev: 'the period before' },
  { key: 'ALL', label: 'All time', prev: null },
];

const MODALITY_COLOUR = { CT: '#2563EB', MRI: '#7C3AED', USG: '#0891B2', 'X-RAY': '#475569', XRAY: '#475569', XR: '#475569', MAMMO: '#DB2777', ECG: '#DC2626', ECHO: '#EA580C', DEXA: '#65A30D', PET: '#A16207' };
const colourOf = (m, fallback) => MODALITY_COLOUR[String(m || '').toUpperCase()] || fallback || '#64748B';
const n0 = (v) => Number(v) || 0;
const pct = (part, whole) => (whole > 0 ? Math.round((part / whole) * 100) : 0);
const count = (v) => n0(v).toLocaleString('en-IN');
const minutes = (m) => {
  const v = Math.round(n0(m));
  if (v <= 0) return '—';
  if (v < 60) return `${v} min`;
  const h = Math.floor(v / 60); const r = v % 60;
  return h >= 24 ? `${Math.round(v / 1440 * 10) / 10} days` : `${h} h${r ? ` ${r} min` : ''}`;
};

const card = { background: 'white', border: `1.5px solid ${C.line}`, borderRadius: 18, padding: 18, minWidth: 0 };
const kicker = { fontSize: 12, fontWeight: 800, letterSpacing: 1, color: C.faint, textTransform: 'uppercase' };
const h2 = { fontSize: 18, fontWeight: 800, margin: 0, color: C.ink };
const sub = { fontSize: 14, color: C.muted, margin: '2px 0 0' };

function Section({ title, note, action, onAction, children, style }) {
  return (
    <section style={{ ...card, display: 'grid', gap: 14, alignContent: 'start', ...style }}>
      <header style={{ display: 'flex', alignItems: 'flex-start', gap: 10, justifyContent: 'space-between' }}>
        <div style={{ minWidth: 0 }}>
          <h2 style={h2}>{title}</h2>
          {note && <p style={sub}>{note}</p>}
        </div>
        {action && <button type="button" onClick={onAction} style={linkBtn}>{action} →</button>}
      </header>
      {children}
    </section>
  );
}
const linkBtn = { background: 'none', border: 'none', color: C.primary, fontWeight: 700, fontSize: 14, cursor: 'pointer', padding: '4px 0', whiteSpace: 'nowrap', fontFamily: 'inherit' };

function Headline({ label, value, note, tone, onClick }) {
  const T = onClick ? 'button' : 'div';
  return (
    <T type={onClick ? 'button' : undefined} onClick={onClick}
      style={{ ...card, padding: '14px 16px', textAlign: 'left', fontFamily: 'inherit', cursor: onClick ? 'pointer' : 'default', display: 'grid', gap: 4, alignContent: 'start', height: '100%', boxSizing: 'border-box', width: '100%' }}>
      <span style={kicker}>{label}</span>
      <span style={{ fontSize: 'clamp(24px, 5.6vw, 32px)', fontWeight: 800, lineHeight: 1.1, color: tone || C.ink, fontVariantNumeric: 'tabular-nums' }}>{value}</span>
      {note && <span style={{ fontSize: 13, color: C.muted }}>{note}</span>}
    </T>
  );
}

/** A labelled horizontal bar: name, bar, value. */
function BarRow({ label, value, max, colour, right, sub: subText }) {
  const w = max > 0 ? Math.max(2, (n0(value) / max) * 100) : 0;
  return (
    <div style={{ display: 'grid', gap: 4 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 15 }}>
        <span style={{ fontWeight: 700, color: C.ink, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
        <span style={{ fontWeight: 800, color: C.ink, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{right}</span>
      </div>
      <div style={{ height: 10, background: '#F1F5F9', borderRadius: 999, overflow: 'hidden' }} aria-hidden="true">
        <div style={{ width: `${w}%`, height: '100%', background: colour || C.primary, borderRadius: 999 }} />
      </div>
      {subText && <div style={{ fontSize: 13, color: C.faint }}>{subText}</div>}
    </div>
  );
}

/** Stacked share bar with a legend underneath (payment modes, women/men). */
function ShareBar({ parts, label }) {
  const total = parts.reduce((s, p) => s + n0(p.value), 0);
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <div role="img" aria-label={label} style={{ display: 'flex', height: 14, borderRadius: 999, overflow: 'hidden', background: '#F1F5F9' }}>
        {total > 0 && parts.filter(p => n0(p.value) > 0).map(p => (
          <div key={p.label} style={{ width: `${(n0(p.value) / total) * 100}%`, background: p.colour }} />
        ))}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 16px' }}>
        {parts.map(p => (
          <span key={p.label} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 14, color: C.muted }}>
            <span style={{ width: 10, height: 10, borderRadius: 3, background: p.colour, flexShrink: 0 }} />
            {p.label} <strong style={{ color: C.ink }}>{p.show ? p.show(p.value) : count(p.value)}</strong>
            {total > 0 && <span style={{ color: C.faint }}>({pct(n0(p.value), total)}%)</span>}
          </span>
        ))}
      </div>
    </div>
  );
}

function Empty({ children }) {
  return <div style={{ fontSize: 15, color: C.faint, padding: '8px 0' }}>{children}</div>;
}

export default function OverviewDashboard({ outlook, matrix, partners, timeframe, onTimeframe, loading, centreName }) {
  const navigate = useNavigate();
  const vp = useViewport();
  const [chipRef, chipRow] = useChipRow(timeframe);
  const period = PERIODS.find(p => p.key === timeframe) || PERIODS[0];

  const k = outlook?.kpis || {};
  const perf = matrix?.performance || {};
  const visits = n0(k.dailyMissions);
  const growth = Number(k.growthPercentage);
  const billed = n0(perf.grossRevenue);
  const collected = n0(perf.cashCollected);
  const due = n0(perf.outstandingAR);
  const queues = (outlook?.pendingQueues || []).filter(q => n0(q.count) > 0).sort((a, b) => n0(b.count) - n0(a.count));
  const waiting = queues.reduce((s, q) => s + n0(q.count), 0);

  // Scan types: patients (service lines) with money billed for them.
  const revenueOf = Object.fromEntries((outlook?.revenueBreakdown || []).map(r => [String(r.modality).toUpperCase(), n0(r.revenue)]));
  const modalities = (outlook?.modalities || []).filter(m => n0(m.count) > 0)
    .map(m => ({ name: m.label, scans: n0(m.count), money: revenueOf[String(m.label).toUpperCase()] || 0, colour: colourOf(m.label, m.color) }))
    .sort((a, b) => b.scans - a.scans);
  const maxScans = Math.max(0, ...modalities.map(m => m.scans));

  const trend = (outlook?.volumeTrends || []).map(d => ({ day: d.day, n: n0(d.count) }));
  const maxDay = Math.max(1, ...trend.map(d => d.n));
  const busiest = trend.reduce((b, d) => (d.n > (b?.n ?? -1) ? d : b), null);

  const channels = matrix?.collectionChannels || {};
  const aging = matrix?.agingDues || {};
  const ageParts = [
    { label: 'Up to 30 days', value: n0(aging.bucket0To30), colour: '#3B82F6' },
    { label: '31–60 days', value: n0(aging.bucket31To60), colour: '#F59E0B' },
    { label: '61–90 days', value: n0(aging.bucket61To90), colour: '#EA580C' },
    { label: 'Over 90 days', value: n0(aging.bucket91Plus), colour: '#B91C1C' },
  ];
  const ageTotal = ageParts.reduce((s, p) => s + p.value, 0);
  const profit = (matrix?.modalityProfitability || []).filter(m => n0(m.scanCount) > 0 || n0(m.grossRevenue) > 0)
    .sort((a, b) => n0(b.grossRevenue) - n0(a.grossRevenue));

  const topPartners = (partners || []).filter(p => n0(p.totalPatients) > 0).slice(0, 6);
  const maxPartner = Math.max(0, ...topPartners.map(p => n0(p.totalPatients)));
  const owedTotal = (partners || []).reduce((s, p) => s + n0(p.unpaidCommission), 0);

  const loyalty = outlook?.loyalty || {};
  const g = outlook?.demographics?.gender || {};
  const ages = (outlook?.demographics?.ageGroups || []).filter(a => n0(a.count) > 0);
  const maxAge = Math.max(0, ...ages.map(a => n0(a.count)));
  const places = [...(outlook?.demographics?.villages || []), ...(outlook?.demographics?.districts || [])]
    .filter(p => p?.name && n0(p.count) > 0 && !/^unknown$/i.test(p.name));
  const topPlaces = Object.values(places.reduce((acc, p) => { acc[p.name] = acc[p.name] && acc[p.name].count >= p.count ? acc[p.name] : p; return acc; }, {}))
    .sort((a, b) => n0(b.count) - n0(a.count)).slice(0, 5);
  const maxPlace = Math.max(0, ...topPlaces.map(p => n0(p.count)));

  const cols2 = vp.phone ? 'minmax(0,1fr)' : 'repeat(2, minmax(0,1fr))';
  const growthNote = period.prev && Number.isFinite(growth)
    ? (growth === 0 ? `Same as ${period.prev}` : `${growth > 0 ? '↑' : '↓'} ${Math.abs(growth)}% vs ${period.prev}`)
    : null;

  return (
    <div style={{ fontFamily: FONT, color: C.ink, display: 'grid', gap: 16, gridTemplateColumns: 'minmax(0,1fr)', padding: vp.phone ? '4px 0 24px' : '4px 0 32px', opacity: loading ? 0.6 : 1, transition: 'opacity 0.2s' }}>
      {/* Title + period */}
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0 }}>
          <div style={kicker}>{centreName || 'Your centre'}</div>
          <h2 style={{ fontSize: vp.phone ? 24 : 28, fontWeight: 800, margin: '2px 0 0', letterSpacing: '-0.3px' }}>How the centre is doing</h2>
        </div>
        <nav aria-label="Period" ref={chipRef} onScroll={chipRow.onScroll}
          style={{ display: 'flex', gap: 8, overflowX: 'auto', maxWidth: '100%', ...chipRow.style }}>
          {PERIODS.map(p => (
            <Chip key={p.key} on={p.key === timeframe} aria-current={p.key === timeframe ? 'page' : undefined} onClick={() => onTimeframe(p.key)}>{p.label}</Chip>
          ))}
        </nav>
      </div>

      {/* 1. Headline numbers */}
      <div style={{ display: 'grid', gap: 10, gridTemplateColumns: vp.phone ? 'repeat(2, minmax(0,1fr))' : 'repeat(5, minmax(0,1fr))' }}>
        <Headline label="Patients" value={count(visits)} note={growthNote || 'visits booked'}
          tone={C.ink} onClick={() => navigate('/appointment-board')} />
        <Headline label="Billed" value={inr(billed)} note={`${count(perf.totalScansCount)} tests`} onClick={() => navigate('/money/bills')} />
        <Headline label="Collected" value={inr(collected)} tone={C.ok}
          note={billed > 0 ? `${pct(collected, billed)}% of billed` : 'money received'} onClick={() => navigate('/money/book')} />
        <Headline label="Still to collect" value={inr(due)} tone={due > 0 ? C.due : C.ink}
          note="all unpaid bills" onClick={() => navigate('/money/bills')} />
        <div style={{ display: 'grid', ...(vp.phone ? { gridColumn: '1 / -1' } : {}) }}>
          <Headline label="Reports waiting" value={count(waiting)} tone={waiting > 0 ? C.due : C.ok}
            note={`avg. ${minutes(k.averageLatencyMinutes)} to sign`} onClick={() => navigate('/doctor-board')} />
        </div>
      </div>

      {/* 2. Patients per day + scan types */}
      <div style={{ display: 'grid', gap: 16, gridTemplateColumns: cols2 }}>
        <Section title="Patients per day" note={busiest && busiest.n > 0 ? `Last 7 days · busiest ${busiest.day.slice(0, 1)}${busiest.day.slice(1).toLowerCase()} (${busiest.n})` : 'Last 7 days'}>
          {trend.length === 0 || trend.every(d => d.n === 0) ? <Empty>No visits in the last 7 days.</Empty> : (
            <div role="img" aria-label={`Patients per day: ${trend.map(d => `${d.day} ${d.n}`).join(', ')}`}
              style={{ display: 'grid', gridTemplateColumns: `repeat(${trend.length}, minmax(0,1fr))`, gap: 8, alignItems: 'end', height: 170 }}>
              {trend.map((d, i) => (
                <div key={`${d.day}${i}`} style={{ display: 'grid', gap: 6, alignItems: 'end', height: '100%', gridTemplateRows: '1fr auto' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', alignItems: 'center', height: '100%' }}>
                    <span style={{ fontSize: 13, fontWeight: 800, color: C.ink, marginBottom: 4 }}>{d.n}</span>
                    <div style={{ width: '100%', maxWidth: 44, height: `${(d.n / maxDay) * 100}%`, minHeight: d.n ? 4 : 0, borderRadius: '8px 8px 3px 3px',
                      background: i === trend.length - 1 ? C.primary : '#A5B4FC' }} />
                  </div>
                  <span style={{ fontSize: 12, fontWeight: 700, color: i === trend.length - 1 ? C.primary : C.faint, textAlign: 'center' }}>
                    {d.day.slice(0, 1)}{d.day.slice(1, 3).toLowerCase()}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Section>

        <Section title="By scan type" note={`${period.label} · tests done and money billed`}>
          {modalities.length === 0 ? <Empty>No tests in this period.</Empty> : (
            <div style={{ display: 'grid', gap: 12 }}>
              {modalities.slice(0, 7).map(m => (
                <BarRow key={m.name} label={m.name} value={m.scans} max={maxScans} colour={m.colour}
                  right={`${count(m.scans)} · ${inr(m.money)}`} />
              ))}
            </div>
          )}
        </Section>
      </div>

      {/* 3. Reports + Money in */}
      <div style={{ display: 'grid', gap: 16, gridTemplateColumns: cols2 }}>
        <Section title="Reports waiting" note={`Average from scan to signed report: ${minutes(k.averageLatencyMinutes)}`}
          action="Open reports" onAction={() => navigate('/doctor-board')}>
          {queues.length === 0 ? <Empty>Nothing waiting — every report is signed.</Empty> : (
            <div style={{ display: 'grid', gap: 12 }}>
              {queues.map(q => (
                <BarRow key={q.modality} label={q.modality} value={q.count} max={queues[0].count} colour={colourOf(q.modality)}
                  right={`${count(q.count)} waiting`} />
              ))}
            </div>
          )}
        </Section>

        <Section title="Money in" note={`${period.label} · how patients paid`} action="Cash book" onAction={() => navigate('/money/book')}>
          <div style={{ display: 'grid', gap: 10 }}>
            <BarRow label="Billed" value={billed} max={Math.max(billed, collected)} colour="#94A3B8" right={inr(billed)} />
            <BarRow label="Collected" value={collected} max={Math.max(billed, collected)} colour={C.ok} right={inr(collected)} />
          </div>
          {n0(channels.totalCollected) > 0 && (
            <ShareBar label="How patients paid" parts={[
              { label: 'Cash', value: n0(channels.cashAmount), colour: '#16A34A', show: inr },
              { label: 'UPI', value: n0(channels.upiAmount), colour: '#4F46E5', show: inr },
              { label: 'Card', value: n0(channels.cardAmount), colour: '#7C3AED', show: inr },
              ...(n0(channels.advanceAmount) > 0 ? [{ label: 'Advance', value: n0(channels.advanceAmount), colour: '#0891B2', show: inr }] : []),
            ]} />
          )}
        </Section>
      </div>

      {/* 4. Dues + earnings by scan type */}
      <div style={{ display: 'grid', gap: 16, gridTemplateColumns: cols2 }}>
        <Section title="Still to collect" note={ageTotal > 0 ? `${inr(ageTotal)} unpaid, by how long it has been waiting` : 'Unpaid bills by age'}
          action="Unpaid bills" onAction={() => navigate('/money/bills')}>
          {ageTotal <= 0 ? <Empty>No unpaid bills.</Empty> : (
            <div style={{ display: 'grid', gap: 12 }}>
              {ageParts.map(p => <BarRow key={p.label} label={p.label} value={p.value} max={Math.max(...ageParts.map(x => x.value))} colour={p.colour} right={inr(p.value)} />)}
              {n0(aging.bucket91Plus) > 0 && (
                <div style={{ fontSize: 14, color: C.danger, fontWeight: 700 }}>{inr(aging.bucket91Plus)} has been unpaid for over 3 months — follow up or write it off.</div>
              )}
            </div>
          )}
        </Section>

        <Section title="What each scan type earned" note="Billed − partners' share − running cost">
          {profit.length === 0 ? <Empty>No bills in this period.</Empty> : vp.phone ? (
            // Phones: one line per scan type, nothing to scroll sideways.
            <div style={{ display: 'grid' }}>
              {profit.slice(0, 8).map(m => {
                const earned = n0(m.netOperatingProfit);
                return (
                  <div key={m.modality} style={{ display: 'grid', gap: 2, padding: '10px 0', borderTop: `1px solid ${C.line}` }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 16 }}>
                      <span style={{ fontWeight: 800 }}><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: colourOf(m.modality), marginRight: 8 }} />{m.modality}</span>
                      <span style={{ fontWeight: 800, color: earned < 0 ? C.danger : C.ok }}>{earned < 0 ? `−${inr(-earned)}` : inr(earned)}</span>
                    </div>
                    <div style={{ fontSize: 13, color: C.faint }}>
                      {count(m.scanCount)} tests · billed {inr(m.grossRevenue)} · partners {inr(m.referralCut)} · cost {inr(m.operatingCost)}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div style={{ overflowX: 'auto', margin: '0 -4px' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 15, minWidth: 420 }}>
                <thead>
                  <tr style={{ color: C.faint, fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.6 }}>
                    <th style={th}>Type</th><th style={thR}>Tests</th><th style={thR}>Billed</th><th style={thR}>Partners</th><th style={thR}>Cost</th><th style={thR}>Earned</th>
                  </tr>
                </thead>
                <tbody>
                  {profit.slice(0, 8).map(m => {
                    const earned = n0(m.netOperatingProfit);
                    return (
                      <tr key={m.modality} style={{ borderTop: `1px solid ${C.line}` }}>
                        <td style={td}><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: colourOf(m.modality), marginRight: 8 }} />{m.modality}</td>
                        <td style={tdR}>{count(m.scanCount)}</td>
                        <td style={tdR}>{inr(m.grossRevenue)}</td>
                        <td style={tdR}>{inr(m.referralCut)}</td>
                        <td style={tdR}>{inr(m.operatingCost)}</td>
                        <td style={{ ...tdR, fontWeight: 800, color: earned < 0 ? C.danger : C.ok }}>{earned < 0 ? `−${inr(-earned)}` : inr(earned)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Section>
      </div>

      {/* 5. Partners + 6. Patients */}
      <div style={{ display: 'grid', gap: 16, gridTemplateColumns: cols2 }}>
        <Section title="Partners who sent patients" note={owedTotal > 0 ? `${inr(owedTotal)} still owed to partners` : `${period.label}`}
          action="Partners" onAction={() => navigate('/partners')}>
          {topPartners.length === 0 ? <Empty>No referred patients in this period.</Empty> : (
            <div style={{ display: 'grid', gap: 12 }}>
              {topPartners.map(p => (
                <BarRow key={p.referrerId || p.name} label={p.name} value={p.totalPatients} max={maxPartner} colour={C.primary}
                  right={`${count(p.totalPatients)} patients`}
                  sub={`${inr(p.totalRevenue)} billed${n0(p.unpaidCommission) > 0 ? ` · ${inr(p.unpaidCommission)} owed` : ''}`} />
              ))}
            </div>
          )}
        </Section>

        <Section title="Patients" note={`${period.label} · who came`}>
          <div style={{ display: 'grid', gap: 16 }}>
            {(n0(loyalty.newTargets) + n0(loyalty.returningPatients)) > 0 && (
              <ShareBar label="New and returning patients" parts={[
                { label: 'New', value: n0(loyalty.newTargets), colour: C.primary },
                { label: 'Came before', value: n0(loyalty.returningPatients), colour: '#A5B4FC' },
              ]} />
            )}
            {(n0(g.female) + n0(g.male) + n0(g.other)) > 0 && (
              <ShareBar label="Women and men" parts={[
                { label: 'Women', value: n0(g.female), colour: '#DB2777' },
                { label: 'Men', value: n0(g.male), colour: '#2563EB' },
                ...(n0(g.other) > 0 ? [{ label: 'Other', value: n0(g.other), colour: '#64748B' }] : []),
              ]} />
            )}
            {ages.length > 0 && (
              <div style={{ display: 'grid', gap: 8 }}>
                <div style={kicker}>Age</div>
                {ages.map(a => <BarRow key={a.label} label={a.label} value={a.count} max={maxAge} colour="#0891B2" right={count(a.count)} />)}
              </div>
            )}
            {topPlaces.length > 0 && (
              <div style={{ display: 'grid', gap: 8 }}>
                <div style={kicker}>Where they came from</div>
                {topPlaces.map(p => <BarRow key={p.name} label={p.name} value={p.count} max={maxPlace} colour="#65A30D" right={count(p.count)} />)}
              </div>
            )}
            {(n0(loyalty.newTargets) + n0(loyalty.returningPatients) + n0(g.female) + n0(g.male) + ages.length + topPlaces.length) === 0 && <Empty>No patients in this period.</Empty>}
          </div>
        </Section>
      </div>
    </div>
  );
}

const th = { textAlign: 'left', padding: '6px 4px', fontWeight: 800 };
const thR = { ...th, textAlign: 'right' };
const td = { padding: '10px 4px', fontWeight: 700, whiteSpace: 'nowrap' };
const tdR = { padding: '10px 4px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' };
