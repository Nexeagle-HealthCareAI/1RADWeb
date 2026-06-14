// ════════════════════════════════════════════════════════════════════════════
//  DoctorReferralPortal.jsx — public /r/:id page for a referring doctor.
//
//  Opened from a personal capability link (signed token in ?t=). No login. The
//  doctor sees every patient they referred — full name, study status, the bill,
//  the concession given, and their incentive (eligible / paid / outstanding) —
//  plus advanced performance KPIs, a gamified view of future ("optimistic")
//  cuts, a profile-completion ring with self-service editing, and a warm
//  thank-you. Premium, works on mobile + web.
// ════════════════════════════════════════════════════════════════════════════
import { useState, useEffect, useMemo } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import apiClient from '../api/apiClient';

const inr = (n) => `₹${(Number(n) || 0).toLocaleString('en-IN')}`;
const todayStr = () => new Date().toLocaleDateString('en-CA');
const prettyDate = (v) => {
  if (!v) return '—';
  const d = new Date(v);
  return isNaN(d.getTime()) ? v : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
};
const prettyTime = (v) => {
  if (!v) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true });
};
const STATUS_TONE = (s) => {
  const k = String(s || '').toLowerCase();
  if (k.includes('deliver') || k.includes('report') || k.includes('complete')) return { bg: '#dcfce7', fg: '#166534' };
  if (k.includes('scan') || k.includes('progress')) return { bg: '#fef3c7', fg: '#b45309' };
  if (k.includes('cancel')) return { bg: '#fee2e2', fg: '#991b1b' };
  return { bg: '#e0e7ff', fg: '#3730a3' };
};
const isDone = (s) => {
  const k = String(s || '').toLowerCase();
  return k.includes('deliver') || k.includes('report') || k.includes('complete');
};
const pctOf = (a, b) => (b > 0 ? Math.round((a / b) * 100) : 0);
const monthLabel = (ym) => {
  const [y, m] = (ym || '').split('-');
  const d = new Date(Number(y), Number(m) - 1, 1);
  return isNaN(d.getTime()) ? ym : d.toLocaleDateString('en-GB', { month: 'short' });
};
// Warm ramp for the profile-completion ring: red (sparse) → amber → green (full).
const ringColor = (pct) => (pct >= 80 ? '#16a34a' : pct >= 40 ? '#f59e0b' : '#ef4444');

// Sortable patient-table columns (key drives the comparator; align drives text).
const COLS = [
  { key: 'date', label: 'Date', align: 'left', num: false },
  { key: 'patient', label: 'Patient', align: 'left', num: false },
  { key: 'modality', label: 'Study', align: 'left', num: false },
  { key: 'status', label: 'Status', align: 'left', num: false },
  { key: 'total', label: 'Total amount', align: 'right', num: true },
  { key: 'discount', label: 'Net discount', align: 'right', num: true },
  { key: 'incentive', label: 'Net incentive', align: 'right', num: true },
  { key: 'paid', label: 'Paid', align: 'right', num: true },
  { key: 'unpaid', label: 'Unpaid', align: 'right', num: true },
];

export default function DoctorReferralPortal() {
  const { id } = useParams();
  const [sp] = useSearchParams();
  const token = sp.get('t') || sp.get('token');

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [intro, setIntro] = useState(true);
  const [range, setRange] = useState('ALL'); // TODAY | WEEK | MONTH | ALL | CUSTOM
  const [cStart, setCStart] = useState('');
  const [cEnd, setCEnd] = useState('');
  const [page, setPage] = useState(1); // patient table — 6 rows per page
  const [sort, setSort] = useState({ key: 'date', dir: 'desc' });

  // 3-second branded splash.
  useEffect(() => {
    const t = setTimeout(() => setIntro(false), 3000);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await apiClient.get(`/public/referral/${id}`, { params: token ? { token } : undefined });
        if (!active) return;
        const payload = res?.data?.data;
        if (!payload) { setError('This link is invalid or has expired.'); return; }
        setData(payload);
      } catch (e) {
        if (active) setError(e?.response?.data?.error || 'This link is invalid or has expired.');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [id, token]);

  // Split referrals by service date: a future date hasn't happened yet, so it's
  // an "upcoming / optimistic" cut shown in its own gamified panel; everything
  // today-or-earlier is an earned referral driving the table + stats.
  const today = todayStr();
  const presentPatients = useMemo(
    () => (data?.patients || []).filter(p => !p.date || p.date <= today),
    [data, today]
  );
  const futurePatients = useMemo(
    () => (data?.patients || []).filter(p => p.date && p.date > today),
    [data, today]
  );

  const filtered = useMemo(() => {
    const list = presentPatients;
    if (range === 'ALL') return list;
    const now = new Date();
    return list.filter(p => {
      if (!p.date) return false;
      if (range === 'TODAY') return p.date === today;
      if (range === 'WEEK') { const d = new Date(p.date); return (now - d) / 86400000 <= 7 && d <= now; }
      if (range === 'MONTH') return p.date.slice(0, 7) === today.slice(0, 7);
      if (range === 'CUSTOM') return (!cStart || p.date >= cStart) && (!cEnd || p.date <= cEnd);
      return true;
    });
  }, [presentPatients, range, cStart, cEnd, today]);

  // Sort the active view; numeric columns compare as numbers, text as locale.
  const sorted = useMemo(() => {
    const arr = [...filtered];
    const { key, dir } = sort;
    const num = (v) => Number(v) || 0;
    const valNum = { total: 'total', discount: 'discount', incentive: 'eligible', paid: 'paid', unpaid: 'unpaid' };
    arr.sort((a, b) => {
      if (key === 'patient' || key === 'modality' || key === 'status') {
        const av = String(a[key === 'modality' ? 'modality' : key === 'status' ? 'status' : 'patient'] || '').toLowerCase();
        const bv = String(b[key === 'modality' ? 'modality' : key === 'status' ? 'status' : 'patient'] || '').toLowerCase();
        return dir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
      }
      if (key in valNum) {
        const f = valNum[key];
        return dir === 'asc' ? num(a[f]) - num(b[f]) : num(b[f]) - num(a[f]);
      }
      // date (default)
      const av = a.date || '', bv = b.date || '';
      return dir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
    });
    return arr;
  }, [filtered, sort]);

  const toggleSort = (key) => {
    setSort(s => (s.key === key ? { key, dir: s.dir === 'desc' ? 'asc' : 'desc' } : { key, dir: 'desc' }));
    setPage(1);
  };

  // Headline money stats reflect the active filter so they match the table.
  const stats = useMemo(() => {
    const eligible = filtered.reduce((s, p) => s + (Number(p.eligible) || 0), 0);
    const paid = filtered.reduce((s, p) => s + (Number(p.paid) || 0), 0);
    const unpaid = filtered.reduce((s, p) => s + (Number(p.unpaid) || 0), 0);
    return { count: filtered.length, eligible, paid, unpaid };
  }, [filtered]);

  // Advanced performance KPIs — computed over the ACTIVE FILTER so the whole
  // board (headline stats + these) responds to the date filter at the top.
  const perf = useMemo(() => {
    const list = filtered;
    const total = list.length;
    const done = list.filter(p => isDone(p.status)).length;
    const eligible = list.reduce((s, p) => s + (Number(p.eligible) || 0), 0);
    const paid = list.reduce((s, p) => s + (Number(p.paid) || 0), 0);
    const avg = total ? eligible / total : 0;

    // Modality mix (top 4 by volume).
    const modMap = {};
    list.forEach(p => { const m = p.modality || '—'; modMap[m] = (modMap[m] || 0) + 1; });
    const mods = Object.entries(modMap).sort((a, b) => b[1] - a[1]).slice(0, 4)
      .map(([name, count]) => ({ name, count, pct: pctOf(count, total) }));

    // Incentive trend: the months present in the filtered set (latest 6), so the
    // sparkline tracks whatever period the user is viewing.
    const byMonth = {};
    list.forEach(p => {
      const ym = (p.date || '').slice(0, 7);
      if (!ym) return;
      (byMonth[ym] ||= { inc: 0, cnt: 0 });
      byMonth[ym].inc += Number(p.eligible) || 0;
      byMonth[ym].cnt += 1;
    });
    const series = Object.keys(byMonth).sort().slice(-6).map(ym => ({ ym, inc: byMonth[ym].inc, cnt: byMonth[ym].cnt }));
    const hasMomentum = series.length > 1;
    const lastBucket = series[series.length - 1]?.inc || 0;
    const prevBucket = series[series.length - 2]?.inc || 0;
    const momentum = prevBucket > 0 ? Math.round(((lastBucket - prevBucket) / prevBucket) * 100) : (lastBucket > 0 ? 100 : 0);

    return {
      total, done, completionRate: pctOf(done, total),
      eligible, paid, payoutRate: pctOf(paid, eligible), avg,
      mods, series, hasMomentum, momentum,
    };
  }, [filtered]);

  const todayCount = useMemo(() => presentPatients.filter(p => p.date === today).length, [presentPatients, today]);
  const todayEligible = useMemo(
    () => presentPatients.filter(p => p.date === today).reduce((s, p) => s + (Number(p.eligible) || 0), 0),
    [presentPatients, today]
  );

  // Upcoming / optimistic aggregates (projected, not yet earned).
  const upcoming = useMemo(() => {
    const list = [...futurePatients].sort((a, b) => (a.date || '').localeCompare(b.date || ''));
    const projected = list.reduce((s, p) => s + (Number(p.eligible) || 0), 0);
    return { list, count: list.length, projected, next: list[0]?.date || null };
  }, [futurePatients]);

  if (intro) return <Splash />;

  if (loading) {
    return <Shell><div style={{ padding: '80px', textAlign: 'center', color: '#94a3b8', fontWeight: 700 }}>Loading your dashboard…</div></Shell>;
  }
  if (error || !data) {
    return (
      <Shell>
        <div style={{ padding: '70px 24px', textAlign: 'center' }}>
          <div style={{ fontSize: '44px', marginBottom: '10px' }}>🔒</div>
          <div style={{ fontSize: '18px', fontWeight: 900, color: '#0f172a' }}>Link unavailable</div>
          <div style={{ fontSize: '13px', color: '#64748b', marginTop: '6px' }}>{error || 'This link is invalid or has expired. Please ask the centre for a fresh link.'}</div>
        </div>
      </Shell>
    );
  }

  const RANGES = [['TODAY', 'Today'], ['WEEK', '7 days'], ['MONTH', 'This month'], ['ALL', 'All'], ['CUSTOM', 'Custom']];
  const PAGE_SIZE = 6;
  const pageCount = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const pageRows = sorted.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  return (
    <Shell centre={data.centreName} location={data.centreLocation} adminName={data.centreAdminName} contact={data.centreContact} email={data.centreEmail}
      headerAction={<ProfileButton id={id} token={token} data={data} setData={setData} />}>
      {/* Thank-you note */}
      <ThankYou doctor={data.doctorName} centre={data.centreName} todayCount={todayCount} todayEligible={todayEligible} />

      {/* Date filter — at the top; drives every KPI and the table below */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center', marginBottom: '16px' }}>
        {RANGES.map(([k, lbl]) => (
          <button key={k} onClick={() => { setRange(k); setPage(1); }}
            style={{ padding: '9px 14px', borderRadius: '999px', border: '1px solid', borderColor: range === k ? '#0f52ba' : '#e2e8f0', background: range === k ? '#0f52ba' : 'white', color: range === k ? 'white' : '#475569', fontSize: '12px', fontWeight: 800, cursor: 'pointer' }}>
            {lbl}
          </button>
        ))}
        {range === 'CUSTOM' && (
          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
            <input type="date" value={cStart} onChange={e => { setCStart(e.target.value); setPage(1); }} style={dateInput} />
            <span style={{ color: '#94a3b8' }}>→</span>
            <input type="date" value={cEnd} onChange={e => { setCEnd(e.target.value); setPage(1); }} style={dateInput} />
          </div>
        )}
        <span style={{ marginLeft: 'auto', fontSize: '12px', fontWeight: 700, color: '#94a3b8' }}>{sorted.length} record{sorted.length === 1 ? '' : 's'}</span>
      </div>

      {/* Quick-glance stats */}
      <div className="nx-kpi-grid" style={{ marginBottom: '20px' }}>
        <Stat label="Referred patients" value={stats.count} tone="blue" icon="👥" />
        <Stat label="Eligible incentive" value={inr(stats.eligible)} tone="slate" icon="💼" />
        <Stat label="Received" value={inr(stats.paid)} tone="green" icon="✅" />
        <Stat label="Outstanding" value={inr(stats.unpaid)} tone="amber" icon="⏳" />
      </div>

      {/* Advanced performance KPIs (lifetime) */}
      <Performance perf={perf} />

      {/* Gamified upcoming / optimistic cuts */}
      {upcoming.count > 0 && <Upcoming upcoming={upcoming} />}

      {/* Patient table (scrolls on small screens) — every column header sorts */}
      <div style={{ background: 'white', border: '1px solid #e7ecf3', borderRadius: '16px', overflow: 'hidden', boxShadow: '0 4px 18px rgba(15,23,42,0.05)' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '940px' }}>
            <thead style={{ background: 'linear-gradient(180deg,#f8fafc,#f1f5f9)' }}>
              <tr>
                {COLS.map(c => (
                  <th key={c.key} onClick={() => toggleSort(c.key)} title={`Sort by ${c.label}`}
                    style={{ padding: '12px 14px', textAlign: c.align, fontSize: '10px', fontWeight: 950, color: sort.key === c.key ? '#0f52ba' : '#64748b', letterSpacing: '0.6px', whiteSpace: 'nowrap', borderBottom: '1px solid #e7ecf3', cursor: 'pointer', userSelect: 'none' }}>
                    {c.label.toUpperCase()}
                    <span style={{ marginLeft: '4px', opacity: sort.key === c.key ? 1 : 0.32 }}>{sort.key === c.key ? (sort.dir === 'asc' ? '▲' : '▼') : '⇅'}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.length === 0 ? (
                <tr><td colSpan={COLS.length} style={{ padding: '56px', textAlign: 'center', color: '#94a3b8', fontSize: '13px', fontWeight: 700 }}>No referrals in this period.</td></tr>
              ) : pageRows.map((p, i) => {
                const tone = STATUS_TONE(p.status);
                return (
                  <tr key={i} style={{ borderTop: i === 0 ? 'none' : '1px solid #f1f5f9' }}>
                    <td style={{ padding: '13px 14px', whiteSpace: 'nowrap' }}>
                      <div style={{ fontSize: '12px', fontWeight: 700, color: '#334155' }}>{p.date}</div>
                      {p.arrivedAt && <div style={{ fontSize: '10px', fontWeight: 700, color: '#94a3b8', marginTop: '2px' }}>🕐 Arrived {prettyTime(p.arrivedAt)}</div>}
                    </td>
                    <td style={{ padding: '13px 14px', fontSize: '12.5px', fontWeight: 800, color: '#0f172a', whiteSpace: 'nowrap' }}>{p.patient}</td>
                    <td style={{ padding: '13px 14px', fontSize: '12px', fontWeight: 700, color: '#475569', whiteSpace: 'nowrap' }}>{p.modality}</td>
                    <td style={{ padding: '13px 14px' }}>
                      <span style={{ padding: '3px 9px', borderRadius: '999px', fontSize: '10px', fontWeight: 900, background: tone.bg, color: tone.fg, whiteSpace: 'nowrap' }}>{(p.status || '—').toUpperCase()}</span>
                    </td>
                    <td style={{ padding: '13px 14px', textAlign: 'right', fontSize: '12.5px', fontWeight: 800, color: '#0f172a', whiteSpace: 'nowrap' }}>{inr(p.total)}</td>
                    <td style={{ padding: '13px 14px', textAlign: 'right', fontSize: '12.5px', fontWeight: 800, color: (Number(p.discount) || 0) > 0 ? '#b45309' : '#cbd5e1', whiteSpace: 'nowrap' }}>{(Number(p.discount) || 0) > 0 ? `− ${inr(p.discount)}` : inr(0)}</td>
                    <td style={{ padding: '13px 14px', textAlign: 'right', fontSize: '12.5px', fontWeight: 900, color: '#0f52ba', whiteSpace: 'nowrap' }}>{inr(p.eligible)}</td>
                    <td style={{ padding: '13px 14px', textAlign: 'right', fontSize: '12.5px', fontWeight: 800, color: '#166534', whiteSpace: 'nowrap' }}>{inr(p.paid)}</td>
                    <td style={{ padding: '13px 14px', textAlign: 'right', fontSize: '12.5px', fontWeight: 800, color: (Number(p.unpaid) || 0) > 0 ? '#b45309' : '#cbd5e1', whiteSpace: 'nowrap' }}>{inr(p.unpaid)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {pageCount > 1 && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderTop: '1px solid #f1f5f9' }}>
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={safePage <= 1}
              style={{ padding: '8px 14px', borderRadius: '9px', border: '1px solid #e2e8f0', background: safePage <= 1 ? '#f8fafc' : 'white', color: safePage <= 1 ? '#cbd5e1' : '#0f52ba', fontSize: '11.5px', fontWeight: 900, cursor: safePage <= 1 ? 'not-allowed' : 'pointer' }}>← Prev</button>
            <span style={{ fontSize: '11.5px', fontWeight: 800, color: '#64748b' }}>Page {safePage} of {pageCount}</span>
            <button onClick={() => setPage(p => Math.min(pageCount, p + 1))} disabled={safePage >= pageCount}
              style={{ padding: '8px 14px', borderRadius: '9px', border: '1px solid #e2e8f0', background: safePage >= pageCount ? '#f8fafc' : 'white', color: safePage >= pageCount ? '#cbd5e1' : '#0f52ba', fontSize: '11.5px', fontWeight: 900, cursor: safePage >= pageCount ? 'not-allowed' : 'pointer' }}>Next →</button>
          </div>
        )}
      </div>

      <div style={{ textAlign: 'center', fontSize: '11px', color: '#94a3b8', fontWeight: 700, margin: '22px 0 8px', letterSpacing: '0.5px' }}>
        Powered by <span style={{ color: '#0f52ba', fontWeight: 900 }}>NexEagle</span>
      </div>
    </Shell>
  );
}

const dateInput = { padding: '8px 10px', borderRadius: '9px', border: '1px solid #e2e8f0', fontSize: '12px', color: '#1e293b', outline: 'none' };

// Compact, animated thank-you: a slim greeting bar with an animated wave, the
// centre's note, and today's contribution as a chip.
function ThankYou({ doctor, centre, todayCount, todayEligible }) {
  return (
    <div className="nx-ty">
      <span className="nx-ty-wave">👋</span>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div className="nx-ty-title">Thank you, {doctor || 'Doctor'}</div>
        <div className="nx-ty-sub">{centre || 'Our centre'} is grateful for your trust — your contribution is always recognised here, transparently.</div>
      </div>
      {todayCount > 0 && (
        <span className="nx-ty-chip">✨ Today: {todayCount} · {inr(todayEligible)}</span>
      )}
    </div>
  );
}

// ── Advanced performance KPIs ───────────────────────────────────────────────
function Performance({ perf }) {
  return (
    <div style={{ marginBottom: '20px' }}>
      <div style={{ fontSize: '11px', fontWeight: 950, letterSpacing: '1px', color: '#64748b', textTransform: 'uppercase', margin: '0 2px 10px' }}>Your performance</div>
      <div className="nx-kpi-grid">
        {/* Completion rate */}
        <PCard accent="#0f52ba">
          <PHead icon="🎯" label="Completion rate" />
          <BigPct value={perf.completionRate} color="#0f52ba" />
          <Bar pct={perf.completionRate} color="#0f52ba" />
          <Sub>{perf.done} of {perf.total} studies reported</Sub>
        </PCard>

        {/* Payout rate */}
        <PCard accent="#16a34a">
          <PHead icon="💰" label="Payout rate" />
          <BigPct value={perf.payoutRate} color="#16a34a" />
          <Bar pct={perf.payoutRate} color="#16a34a" />
          <Sub>{inr(perf.paid)} received of {inr(perf.eligible)}</Sub>
        </PCard>

        {/* Incentive trend */}
        <PCard accent="#7c3aed">
          <PHead icon="📈" label="Incentive trend" />
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginTop: '4px' }}>
            <div style={{ fontSize: '24px', fontWeight: 950, color: '#0f172a', letterSpacing: '-0.5px' }}>{inr(perf.eligible)}</div>
            {perf.hasMomentum && (
              <span style={{ fontSize: '12px', fontWeight: 900, color: perf.momentum >= 0 ? '#16a34a' : '#dc2626' }}>{perf.momentum >= 0 ? '▲' : '▼'} {Math.abs(perf.momentum)}%</span>
            )}
          </div>
          {perf.series.length > 0 ? <Spark series={perf.series} /> : <div style={{ height: '34px' }} />}
          <Sub>{perf.total} referral{perf.total === 1 ? '' : 's'} in view{perf.hasMomentum ? ' · vs prev. month' : ''}</Sub>
        </PCard>

        {/* Modality mix + average */}
        <PCard accent="#0891b2">
          <PHead icon="🩻" label="Referral mix" />
          <div style={{ display: 'flex', flexDirection: 'column', gap: '7px', marginTop: '6px' }}>
            {perf.mods.length ? perf.mods.map(m => (
              <div key={m.name}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10.5px', fontWeight: 800, color: '#475569' }}>
                  <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '150px' }}>{m.name}</span>
                  <span>{m.count}</span>
                </div>
                <Bar pct={m.pct} color="#0891b2" thin />
              </div>
            )) : <Sub>No referrals yet</Sub>}
          </div>
          <Sub style={{ marginTop: '9px' }}>Avg {inr(Math.round(perf.avg))} per referral</Sub>
        </PCard>
      </div>
    </div>
  );
}

function PCard({ accent, children }) {
  return (
    <div style={{ background: 'white', border: '1px solid #e7ecf3', borderTop: `3px solid ${accent}`, borderRadius: '16px', padding: '16px 18px', boxShadow: '0 4px 18px rgba(15,23,42,0.04)' }}>
      {children}
    </div>
  );
}
function PHead({ icon, label }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
      <span style={{ fontSize: '15px' }}>{icon}</span>
      <span style={{ fontSize: '10px', fontWeight: 950, letterSpacing: '0.5px', color: '#64748b', textTransform: 'uppercase' }}>{label}</span>
    </div>
  );
}
function BigPct({ value, color }) {
  return <div style={{ fontSize: '28px', fontWeight: 950, color, marginTop: '6px', letterSpacing: '-0.6px', fontVariantNumeric: 'tabular-nums' }}>{value}%</div>;
}
function Bar({ pct, color, thin }) {
  return (
    <div style={{ height: thin ? '5px' : '7px', borderRadius: '999px', background: '#eef2f7', overflow: 'hidden', marginTop: thin ? '3px' : '8px' }}>
      <div style={{ width: `${Math.min(100, pct)}%`, height: '100%', background: color, borderRadius: '999px', transition: 'width 0.3s' }} />
    </div>
  );
}
function Sub({ children, style }) {
  return <div style={{ fontSize: '10.5px', fontWeight: 700, color: '#94a3b8', marginTop: '8px', ...style }}>{children}</div>;
}
function Spark({ series }) {
  const max = Math.max(1, ...series.map(s => s.inc));
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: '4px', height: '34px', marginTop: '10px' }}>
      {series.map((s, i) => (
        <div key={s.ym} title={`${monthLabel(s.ym)}: ${inr(s.inc)}`}
          style={{ flex: 1, height: `${Math.max(6, (s.inc / max) * 100)}%`, background: i === series.length - 1 ? '#7c3aed' : '#ddd6fe', borderRadius: '4px 4px 2px 2px', transition: 'height 0.3s' }} />
      ))}
    </div>
  );
}

// Self-service profile — a completion ring + an editor so the doctor keeps their
// own identity / location / specialty / degree current. Lives in the top-nav
// right corner. The ring shows what % of the profile is filled.
function ProfileButton({ id, token, data, setData }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: '', contact: '', email: '', location: '', specialty: '', degree: '' });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState('');

  // Completion across the six profile fields the doctor can fill.
  const completion = useMemo(() => {
    const has = (v) => !!String(v ?? '').trim();
    const fields = [
      ['Name', has(data.doctorName)],
      ['Mobile', has(data.doctorContact)],
      ['Email', has(data.doctorEmail)],
      ['Location', has(data.location)],
      ['Degree', has(data.degree)],
      ['Specialty', has(data.specialty)],
    ];
    const filled = fields.filter(f => f[1]).length;
    return {
      pct: Math.round((filled / fields.length) * 100),
      added: fields.filter(f => f[1]).map(f => f[0]),
      missing: fields.filter(f => !f[1]).map(f => f[0]),
    };
  }, [data]);
  const rc = ringColor(completion.pct);

  const openModal = () => {
    setForm({
      name: data.doctorName || '', contact: data.doctorContact || '', email: data.doctorEmail || '',
      location: data.location || '', specialty: data.specialty || '', degree: data.degree || '',
    });
    setErr(''); setSaved(false); setOpen(true);
  };

  const save = async () => {
    setSaving(true); setErr('');
    try {
      await apiClient.put(`/public/referral/${id}/profile`, {
        name: form.name, contact: form.contact, email: form.email,
        location: form.location, specialty: form.specialty, degree: form.degree,
      }, { params: token ? { token } : undefined });
      setData(prev => ({
        ...prev,
        doctorName: form.name.trim() || prev.doctorName, // never blank the name
        doctorContact: form.contact.replace(/\D/g, '') || null,
        doctorEmail: form.email.trim() || null,
        location: form.location.trim() || null, specialty: form.specialty.trim() || null, degree: form.degree.trim() || null,
      }));
      setSaved(true);
    } catch (e) {
      setErr(e?.response?.data?.error || 'Could not save. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const field = (label, key, ph, type = 'text') => (
    <div className="nxpf-field">
      <label>{label}</label>
      <input className="nxpf-input" type={type} value={form[key]} placeholder={ph}
        onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))} />
    </div>
  );

  return (
    <>
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: '11px' }}>
        {/* Completion ring (click to edit) */}
        <button onClick={openModal} title={completion.pct < 100 ? `Profile ${completion.pct}% complete` : 'Profile complete'}
          style={{ border: 'none', background: 'transparent', padding: 0, cursor: 'pointer', borderRadius: '50%', flexShrink: 0 }}>
          <div style={{ width: '46px', height: '46px', borderRadius: '50%', background: `conic-gradient(${rc} ${completion.pct * 3.6}deg, #e7ecf3 0)`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 950, color: rc }}>{completion.pct}%</div>
          </div>
        </button>
        {/* Added + missing details, right next to the percentage */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1px', minWidth: 0, maxWidth: '230px', lineHeight: 1.3 }}>
          <div style={{ fontSize: '10px', fontWeight: 950, color: '#475569', letterSpacing: '0.3px' }}>PROFILE {completion.pct}%</div>
          {completion.added.length > 0 && (
            <div style={{ fontSize: '9.5px', fontWeight: 800, color: '#16a34a' }}>✓ {completion.added.join(', ')}</div>
          )}
          {completion.missing.length > 0
            ? <div style={{ fontSize: '9.5px', fontWeight: 800, color: '#b45309' }}>⚠ Missing: {completion.missing.join(', ')}</div>
            : <div style={{ fontSize: '9.5px', fontWeight: 800, color: '#16a34a' }}>All details added</div>}
        </div>
        <button onClick={openModal} title="Update your profile"
          style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '9px 13px', borderRadius: '11px', border: '1px solid #bfdbfe', background: '#eff6ff', color: '#1d4ed8', fontSize: '11.5px', fontWeight: 900, cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0 }}>
          ✎ Update profile
        </button>
      </div>

      {open && (
        <div onClick={() => !saving && setOpen(false)} className="nxpf-overlay">
          <div onClick={e => e.stopPropagation()} className="nxpf-card">
            <div className="nxpf-head">
              <div className="nxpf-grip" />
              <div className="nxpf-head-l">
                <div className="nxpf-avatar">{((data.doctorName || 'D').trim().charAt(0) || 'D').toUpperCase()}</div>
                <div style={{ minWidth: 0 }}>
                  <div className="nxpf-eyebrow">YOUR PROFILE · {completion.pct}% COMPLETE</div>
                  <div className="nxpf-title">Update your details</div>
                </div>
              </div>
              <button onClick={() => setOpen(false)} className="nxpf-x" aria-label="Close">✕</button>
            </div>

            <div className="nxpf-body">
              {saved ? (
                <div className="nxpf-success">
                  <div className="nxpf-check">✓</div>
                  <div className="nxpf-success-t">Profile updated</div>
                  <div className="nxpf-success-s">Your details are now up to date.</div>
                  <button onClick={() => setOpen(false)} className="nxpf-btn-primary" style={{ flex: 'unset', marginTop: '18px', minWidth: '150px' }}>Done</button>
                </div>
              ) : (
                <>
                  <div className="nxpf-help">Keeping this current helps {data.centreName || 'the centre'} match every referral to you correctly.</div>
                  {completion.missing.length > 0 && (
                    <div className="nxpf-missing">Still to add: {completion.missing.join(' · ')}</div>
                  )}
                  <div className="nxpf-section">Identity &amp; contact</div>
                  {field('Full name', 'name', 'Dr. Your Name')}
                  <div className="nxpf-row">
                    {field('Mobile', 'contact', '10-digit mobile', 'tel')}
                    {field('Email', 'email', 'name@example.com', 'email')}
                  </div>
                  <div className="nxpf-section">Professional</div>
                  {field('Location', 'location', 'City / clinic address')}
                  <div className="nxpf-row">
                    {field('Degree', 'degree', 'e.g. MBBS, MD')}
                    {field('Specialty', 'specialty', 'e.g. Orthopaedics')}
                  </div>
                  {err && <div className="nxpf-err">⚠ {err}</div>}
                </>
              )}
            </div>

            {!saved && (
              <div className="nxpf-foot">
                <button onClick={() => setOpen(false)} disabled={saving} className="nxpf-btn-ghost">Cancel</button>
                <button onClick={save} disabled={saving} className="nxpf-btn-primary">{saving ? 'Saving…' : 'Save changes'}</button>
              </div>
            )}

            <style>{`
              .nxpf-overlay { position: fixed; inset: 0; background: rgba(8,12,30,0.55); -webkit-backdrop-filter: blur(6px); backdrop-filter: blur(6px); display: flex; align-items: center; justify-content: center; z-index: 1000; padding: 20px; animation: nxpfFade .2s ease-out; }
              .nxpf-card { width: 100%; max-width: 470px; background: #fff; border-radius: 24px; overflow: hidden; box-shadow: 0 40px 90px -20px rgba(2,6,23,0.55); display: flex; flex-direction: column; max-height: 90vh; animation: nxpfPop .26s cubic-bezier(0.16,1,0.3,1); font-family: system-ui, -apple-system, 'Segoe UI', sans-serif; }
              .nxpf-grip { display: none; }
              .nxpf-head { position: relative; padding: 22px 24px; background: linear-gradient(135deg,#0a1628 0%,#0f52ba 100%); color: #fff; display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-shrink: 0; }
              .nxpf-head-l { display: flex; align-items: center; gap: 13px; min-width: 0; }
              .nxpf-avatar { width: 44px; height: 44px; border-radius: 14px; background: rgba(255,255,255,0.16); border: 1px solid rgba(255,255,255,0.22); display: flex; align-items: center; justify-content: center; font-size: 19px; font-weight: 900; flex-shrink: 0; }
              .nxpf-eyebrow { font-size: 10px; font-weight: 900; letter-spacing: 1.8px; opacity: .72; }
              .nxpf-title { font-size: 18px; font-weight: 950; margin-top: 2px; letter-spacing: -0.3px; }
              .nxpf-x { border: none; background: rgba(255,255,255,0.14); width: 32px; height: 32px; border-radius: 50%; color: #fff; font-size: 14px; font-weight: 900; cursor: pointer; flex-shrink: 0; transition: background .15s; }
              .nxpf-x:hover { background: rgba(255,255,255,0.28); }
              .nxpf-body { padding: 20px 24px; overflow-y: auto; flex: 1; min-height: 0; display: flex; flex-direction: column; gap: 12px; }
              .nxpf-help { font-size: 11.5px; font-weight: 600; color: #94a3b8; line-height: 1.5; }
              .nxpf-missing { font-size: 11px; font-weight: 800; color: #b45309; background: #fffbeb; border: 1px solid #fde68a; padding: 9px 12px; border-radius: 11px; }
              .nxpf-section { font-size: 10px; font-weight: 950; letter-spacing: .8px; text-transform: uppercase; color: #0f52ba; margin-top: 6px; }
              .nxpf-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
              .nxpf-field { display: flex; flex-direction: column; min-width: 0; }
              .nxpf-field label { font-size: 10px; font-weight: 900; letter-spacing: .5px; text-transform: uppercase; color: #64748b; margin-bottom: 5px; }
              .nxpf-input { width: 100%; box-sizing: border-box; padding: 12px 13px; border-radius: 12px; border: 1.5px solid #e2e8f0; background: #f8fafc; font-size: 14px; font-weight: 600; color: #0f172a; outline: none; transition: border-color .15s, background .15s, box-shadow .15s; font-family: inherit; }
              .nxpf-input:focus { border-color: #0f52ba; background: #fff; box-shadow: 0 0 0 4px rgba(15,82,186,.1); }
              .nxpf-input::placeholder { color: #cbd5e1; font-weight: 600; }
              .nxpf-err { font-size: 11.5px; font-weight: 800; color: #b91c1c; background: #fef2f2; border: 1px solid #fecaca; padding: 9px 12px; border-radius: 11px; }
              .nxpf-foot { display: flex; gap: 10px; padding: 16px 24px 20px; border-top: 1px solid #f1f5f9; flex-shrink: 0; }
              .nxpf-btn-ghost { padding: 13px 18px; border-radius: 12px; border: 1.5px solid #e2e8f0; background: #fff; color: #64748b; font-size: 13px; font-weight: 900; cursor: pointer; transition: background .15s; font-family: inherit; }
              .nxpf-btn-ghost:hover { background: #f8fafc; }
              .nxpf-btn-primary { flex: 1; padding: 13px 18px; border-radius: 12px; border: none; background: linear-gradient(135deg,#0f52ba,#1d4ed8); color: #fff; font-size: 13px; font-weight: 950; cursor: pointer; box-shadow: 0 12px 26px -8px rgba(15,82,186,.6); transition: transform .12s, box-shadow .12s, opacity .15s; font-family: inherit; }
              .nxpf-btn-primary:hover { transform: translateY(-1px); }
              .nxpf-btn-primary:disabled { opacity: .55; cursor: not-allowed; box-shadow: none; transform: none; }
              .nxpf-success { text-align: center; padding: 22px 8px 10px; }
              .nxpf-check { width: 62px; height: 62px; margin: 0 auto; border-radius: 50%; background: #dcfce7; color: #16a34a; font-size: 32px; font-weight: 900; display: flex; align-items: center; justify-content: center; animation: nxpfPop .3s cubic-bezier(0.16,1,0.3,1); }
              .nxpf-success-t { font-size: 17px; font-weight: 950; color: #0f172a; margin-top: 14px; }
              .nxpf-success-s { font-size: 12px; font-weight: 600; color: #94a3b8; margin-top: 4px; }
              @keyframes nxpfFade { from { opacity: 0; } to { opacity: 1; } }
              @keyframes nxpfPop { from { opacity: 0; transform: translateY(14px) scale(.98); } to { opacity: 1; transform: none; } }
              @keyframes nxpfSheet { from { transform: translateY(100%); } to { transform: none; } }
              @media (max-width: 560px) {
                .nxpf-overlay { padding: 0; align-items: flex-end; }
                .nxpf-card { max-width: 100%; border-radius: 24px 24px 0 0; max-height: 94vh; animation: nxpfSheet .32s cubic-bezier(0.16,1,0.3,1); }
                .nxpf-grip { display: block; position: absolute; top: 8px; left: 50%; transform: translateX(-50%); width: 40px; height: 5px; border-radius: 999px; background: rgba(255,255,255,0.45); }
                .nxpf-head { padding-top: 24px; }
                .nxpf-foot { padding-bottom: calc(20px + env(safe-area-inset-bottom)); }
              }
            `}</style>
          </div>
        </div>
      )}
    </>
  );
}

// Gamified future cuts — "optimistic earnings" the doctor will unlock as the
// booked patients arrive. Deliberately playful, like a rewards tracker.
function Upcoming({ upcoming }) {
  return (
    <div style={{ marginBottom: '18px' }}>
      <div style={{ position: 'relative', overflow: 'hidden', borderRadius: '20px', padding: '22px 24px', background: 'linear-gradient(135deg,#1e1b4b 0%,#4c1d95 55%,#7c3aed 100%)', color: 'white', boxShadow: '0 16px 40px -12px rgba(76,29,149,0.5)' }}>
        <div style={{ position: 'absolute', top: '-40px', right: '-30px', width: '170px', height: '170px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(167,139,250,0.45), transparent 70%)', pointerEvents: 'none' }} />
        <div style={{ position: 'relative' }}>
          <div style={{ fontSize: '10px', fontWeight: 950, letterSpacing: '2px', opacity: 0.78 }}>🚀 UPCOMING · OPTIMISTIC CUTS</div>
          <div style={{ fontSize: '38px', fontWeight: 950, letterSpacing: '-1.2px', marginTop: '6px', lineHeight: 1 }}>{inr(upcoming.projected)}</div>
          <div style={{ fontSize: '11.5px', fontWeight: 700, opacity: 0.72, marginTop: '5px' }}>
            incoming across {upcoming.count} booked patient{upcoming.count === 1 ? '' : 's'} · next on {prettyDate(upcoming.next)}
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '12px', marginTop: '12px' }}>
        {upcoming.list.map((p, i) => (
          <div key={i} style={{ background: 'white', border: '1px dashed #ddd6fe', borderRadius: '14px', padding: '14px 16px', boxShadow: '0 4px 16px rgba(124,58,237,0.06)' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px' }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: '13px', fontWeight: 900, color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.patient}</div>
                <div style={{ fontSize: '10.5px', fontWeight: 700, color: '#94a3b8', marginTop: '2px' }}>{p.modality || '—'} · 🔒 unlocks {prettyDate(p.date)}</div>
              </div>
              <div style={{ fontSize: '14px', fontWeight: 950, color: '#6d28d9', flexShrink: 0 }}>{inr(p.eligible)}</div>
            </div>
          </div>
        ))}
      </div>

      <div style={{ textAlign: 'center', fontSize: '10.5px', fontWeight: 700, color: '#a78bfa', letterSpacing: '0.4px', marginTop: '12px' }}>
        ✨ These unlock automatically once each patient is served — keep referring to grow them.
      </div>
    </div>
  );
}

function Stat({ label, value, tone, icon }) {
  const T = {
    blue: { g1: '#eff6ff', g2: '#dbeafe', bd: '#bfdbfe', icbg: '#dbeafe', lb: '#1e40af', vl: '#1e3a8a' },
    green: { g1: '#f0fdf4', g2: '#dcfce7', bd: '#bbf7d0', icbg: '#dcfce7', lb: '#166534', vl: '#14532d' },
    amber: { g1: '#fffbeb', g2: '#fef3c7', bd: '#fde68a', icbg: '#fef3c7', lb: '#b45309', vl: '#92400e' },
    slate: { g1: '#f8fafc', g2: '#eef2f7', bd: '#e2e8f0', icbg: '#eef2f7', lb: '#475569', vl: '#0f172a' },
  }[tone] || {};
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '11px', borderRadius: '14px', padding: '11px 14px', background: `linear-gradient(135deg, ${T.g1} 0%, ${T.g2} 100%)`, border: `1px solid ${T.bd}`, boxShadow: '0 4px 14px rgba(15,23,42,0.04)' }}>
      <div style={{ width: '30px', height: '30px', borderRadius: '10px', background: T.icbg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '15px', flexShrink: 0 }}>{icon}</div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: '9px', fontWeight: 950, color: T.lb, letterSpacing: '0.4px', textTransform: 'uppercase', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</div>
        <div style={{ fontSize: '17px', fontWeight: 950, color: T.vl, letterSpacing: '-0.4px', fontVariantNumeric: 'tabular-nums', lineHeight: 1.15 }}>{value}</div>
      </div>
    </div>
  );
}

// Premium top nav: centre logo + name + location + the centre's contact, all on
// the LEFT to represent the centre professionally; the doctor's profile zone
// (completion ring + update) sits on the right. Full-width board.
function Shell({ children, centre, location, adminName, contact, email, headerAction }) {
  const hasContact = adminName || contact || email;
  return (
    <div style={{ position: 'fixed', inset: 0, overflowY: 'auto', WebkitOverflowScrolling: 'touch', textAlign: 'left', background: '#f6f8fb', fontFamily: 'system-ui, -apple-system, Segoe UI, sans-serif' }}>
      <style>{`
        .nx-kpi-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 14px; }
        @media (max-width: 768px) { .nx-kpi-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; } }
        .nx-ty { position: relative; display: flex; align-items: center; gap: 12px; border-radius: 16px; padding: 13px 18px; margin-bottom: 16px; background: linear-gradient(120deg,#0a1628 0%,#0f52ba 100%); color: #fff; box-shadow: 0 10px 28px -12px rgba(15,82,186,0.5); overflow: hidden; animation: nxTyIn .5s cubic-bezier(0.16,1,0.3,1); }
        .nx-ty-wave { font-size: 22px; display: inline-block; transform-origin: 70% 70%; animation: nxWave 2.6s ease-in-out infinite; flex-shrink: 0; }
        .nx-ty-title { font-size: 15px; font-weight: 950; letter-spacing: -0.2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .nx-ty-sub { font-size: 11px; font-weight: 600; color: rgba(255,255,255,0.8); margin-top: 2px; line-height: 1.45; }
        .nx-ty-chip { flex-shrink: 0; font-size: 11px; font-weight: 800; padding: 6px 11px; border-radius: 999px; background: rgba(255,255,255,0.15); border: 1px solid rgba(255,255,255,0.2); white-space: nowrap; }
        @keyframes nxTyIn { from { opacity: 0; transform: translateY(-10px); } to { opacity: 1; transform: none; } }
        @keyframes nxWave { 0%,60%,100% { transform: rotate(0); } 10% { transform: rotate(14deg); } 20% { transform: rotate(-8deg); } 30% { transform: rotate(14deg); } 40% { transform: rotate(-4deg); } 50% { transform: rotate(10deg); } }
        @media (max-width: 560px) { .nx-ty-sub { display: none; } }
      `}</style>
      <header style={{ background: 'white', borderBottom: '1px solid #e7ecf3', position: 'sticky', top: 0, zIndex: 50 }}>
        <div style={{ padding: '14px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap' }}>
          {/* LEFT: brand lockup (logo + NexEagle 1Rad, aligned) · centre identity */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px', minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
              <img src={`${import.meta.env.BASE_URL}Logo.png`} alt="NexEagle 1Rad" style={{ width: '42px', height: '42px', objectFit: 'contain', flexShrink: 0 }} />
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontSize: '16px', fontWeight: 950, color: '#0f172a', letterSpacing: '-0.3px' }}>NexEagle</span>
                <span style={{ fontSize: '11px', fontWeight: 950, letterSpacing: '0.5px', color: '#0f52ba', background: '#eff6ff', border: '1px solid #dbeafe', borderRadius: '6px', padding: '2px 7px' }}>1Rad</span>
              </div>
            </div>
            <div style={{ width: '1px', height: '34px', background: '#e7ecf3', flexShrink: 0 }} />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: '15px', fontWeight: 950, color: '#0f172a', letterSpacing: '-0.2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{centre || 'Diagnostic Centre'}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap', marginTop: '2px' }}>
                {location && <span style={{ fontSize: '11px', fontWeight: 700, color: '#94a3b8', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '240px' }}>📍 {location}</span>}
                {hasContact && (
                  <>
                    {adminName && <span style={{ fontSize: '11px', fontWeight: 800, color: '#475569', whiteSpace: 'nowrap' }}>👤 {adminName}</span>}
                    {contact && <a href={`tel:${contact}`} style={{ fontSize: '11px', fontWeight: 800, color: '#0f52ba', textDecoration: 'none', whiteSpace: 'nowrap' }}>📞 {contact}</a>}
                    {email && <a href={`mailto:${email}`} style={{ fontSize: '11px', fontWeight: 800, color: '#0f52ba', textDecoration: 'none', whiteSpace: 'nowrap' }}>✉️ {email}</a>}
                  </>
                )}
              </div>
            </div>
          </div>
          {/* RIGHT: doctor's profile zone */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexShrink: 0 }}>
            {headerAction}
          </div>
        </div>
      </header>
      <main style={{ padding: '22px 24px 44px' }}>{children}</main>
    </div>
  );
}

// 3-second branded splash — shows the centre's logo.
function Splash() {
  return (
    <div style={{ position: 'fixed', inset: 0, overflowY: 'auto', background: 'linear-gradient(135deg,#0a1628,#0f52ba)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'white', fontFamily: 'system-ui, -apple-system, Segoe UI, sans-serif', textAlign: 'center', padding: '24px' }}>
      <img src={`${import.meta.env.BASE_URL}Logo.png`} alt="Logo" style={{ width: '96px', height: '96px', objectFit: 'contain', background: 'white', borderRadius: '22px', padding: '12px', boxShadow: '0 20px 50px rgba(0,0,0,0.32)', animation: 'nxFloat 1.6s ease-in-out infinite' }} />
      <div style={{ fontSize: '15px', fontWeight: 700, color: 'rgba(255,255,255,0.9)', marginTop: '24px', maxWidth: '430px', lineHeight: 1.6, animation: 'nxRise 0.7s ease-out 0.25s both' }}>
        Welcome to your referral dashboard — thank you for partnering with us in better diagnostics.
      </div>
      <div style={{ marginTop: '26px', width: '120px', height: '4px', borderRadius: '99px', background: 'rgba(255,255,255,0.2)', overflow: 'hidden' }}>
        <div style={{ height: '100%', background: 'white', animation: 'nxBar 3s linear forwards' }} />
      </div>
      <div style={{ marginTop: '24px', fontSize: '15px', fontWeight: 900, letterSpacing: '2.5px', color: 'white' }}>
        <span style={{ opacity: 0.55, fontWeight: 800, fontSize: '11px' }}>POWERED BY </span>NEXEAGLE
      </div>
      <style>{`
        @keyframes nxFloat { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-12px); } }
        @keyframes nxRise { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: none; } }
        @keyframes nxBar { from { width: 0; } to { width: 100%; } }
      `}</style>
    </div>
  );
}
