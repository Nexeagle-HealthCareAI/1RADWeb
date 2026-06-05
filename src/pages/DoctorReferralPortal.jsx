// ════════════════════════════════════════════════════════════════════════════
//  DoctorReferralPortal.jsx — public /r/:id page for a referring doctor.
//
//  Opened from a personal capability link (signed token in ?t=). No login. The
//  doctor sees every patient they referred — masked identity, study status, and
//  their eligible / paid / outstanding referral amounts — with a date filter and
//  quick-glance stats. Premium, works on mobile + web.
// ════════════════════════════════════════════════════════════════════════════
import { useState, useEffect, useMemo } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import apiClient from '../api/apiClient';

const inr = (n) => `₹${(Number(n) || 0).toLocaleString('en-IN')}`;
const todayStr = () => new Date().toLocaleDateString('en-CA');
const STATUS_TONE = (s) => {
  const k = String(s || '').toLowerCase();
  if (k.includes('deliver') || k.includes('report') || k.includes('complete')) return { bg: '#dcfce7', fg: '#166534' };
  if (k.includes('scan') || k.includes('progress')) return { bg: '#fef3c7', fg: '#b45309' };
  if (k.includes('cancel')) return { bg: '#fee2e2', fg: '#991b1b' };
  return { bg: '#e0e7ff', fg: '#3730a3' };
};

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

  const filtered = useMemo(() => {
    const list = data?.patients || [];
    if (range === 'ALL') return list;
    const today = todayStr();
    const now = new Date();
    return list.filter(p => {
      if (!p.date) return false;
      if (range === 'TODAY') return p.date === today;
      if (range === 'WEEK') { const d = new Date(p.date); return (now - d) / 86400000 <= 7 && d <= now; }
      if (range === 'MONTH') return p.date.slice(0, 7) === today.slice(0, 7);
      if (range === 'CUSTOM') return (!cStart || p.date >= cStart) && (!cEnd || p.date <= cEnd);
      return true;
    });
  }, [data, range, cStart, cEnd]);

  // Stats reflect the active filter so the numbers match the table.
  const stats = useMemo(() => {
    const eligible = filtered.reduce((s, p) => s + (Number(p.eligible) || 0), 0);
    const paid = filtered.reduce((s, p) => s + (Number(p.paid) || 0), 0);
    const unpaid = filtered.reduce((s, p) => s + (Number(p.unpaid) || 0), 0);
    return { count: filtered.length, eligible, paid, unpaid };
  }, [filtered]);

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

  return (
    <Shell centre={data.centreName} doctor={data.doctorName}>
      {/* Quick-glance stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '12px', marginBottom: '18px' }}>
        <Stat label="Referred patients" value={stats.count} tone="blue" />
        <Stat label="Eligible referral" value={inr(stats.eligible)} tone="slate" />
        <Stat label="Received" value={inr(stats.paid)} tone="green" />
        <Stat label="Outstanding" value={inr(stats.unpaid)} tone="amber" />
      </div>

      {/* Date filter */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center', marginBottom: '14px' }}>
        {RANGES.map(([k, lbl]) => (
          <button key={k} onClick={() => setRange(k)}
            style={{ padding: '9px 14px', borderRadius: '999px', border: '1px solid', borderColor: range === k ? '#0f52ba' : '#e2e8f0', background: range === k ? '#0f52ba' : 'white', color: range === k ? 'white' : '#475569', fontSize: '12px', fontWeight: 800, cursor: 'pointer' }}>
            {lbl}
          </button>
        ))}
        {range === 'CUSTOM' && (
          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
            <input type="date" value={cStart} onChange={e => setCStart(e.target.value)} style={dateInput} />
            <span style={{ color: '#94a3b8' }}>→</span>
            <input type="date" value={cEnd} onChange={e => setCEnd(e.target.value)} style={dateInput} />
          </div>
        )}
        <span style={{ marginLeft: 'auto', fontSize: '12px', fontWeight: 700, color: '#94a3b8' }}>{filtered.length} record{filtered.length === 1 ? '' : 's'}</span>
      </div>

      {/* Patient table (scrolls on small screens) */}
      <div style={{ background: 'white', border: '1px solid #e7ecf3', borderRadius: '16px', overflow: 'hidden', boxShadow: '0 4px 18px rgba(15,23,42,0.05)' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '640px' }}>
            <thead style={{ background: 'linear-gradient(180deg,#f8fafc,#f1f5f9)' }}>
              <tr>
                {['Date', 'Patient', 'Study', 'Status', 'Eligible', 'Paid', 'Unpaid'].map((h, i) => (
                  <th key={h} style={{ padding: '12px 14px', textAlign: i >= 4 ? 'right' : 'left', fontSize: '10px', fontWeight: 950, color: '#64748b', letterSpacing: '0.6px', whiteSpace: 'nowrap', borderBottom: '1px solid #e7ecf3' }}>{h.toUpperCase()}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan="7" style={{ padding: '56px', textAlign: 'center', color: '#94a3b8', fontSize: '13px', fontWeight: 700 }}>No referrals in this period.</td></tr>
              ) : filtered.map((p, i) => {
                const tone = STATUS_TONE(p.status);
                return (
                  <tr key={i} style={{ borderTop: i === 0 ? 'none' : '1px solid #f1f5f9' }}>
                    <td style={{ padding: '13px 14px', fontSize: '12px', fontWeight: 700, color: '#334155', whiteSpace: 'nowrap' }}>{p.date}</td>
                    <td style={{ padding: '13px 14px', fontSize: '12.5px', fontWeight: 800, color: '#0f172a', whiteSpace: 'nowrap' }}>{p.patient}</td>
                    <td style={{ padding: '13px 14px', fontSize: '12px', fontWeight: 700, color: '#475569', whiteSpace: 'nowrap' }}>{p.modality}</td>
                    <td style={{ padding: '13px 14px' }}>
                      <span style={{ padding: '3px 9px', borderRadius: '999px', fontSize: '10px', fontWeight: 900, background: tone.bg, color: tone.fg, whiteSpace: 'nowrap' }}>{(p.status || '—').toUpperCase()}</span>
                    </td>
                    <td style={{ padding: '13px 14px', textAlign: 'right', fontSize: '12.5px', fontWeight: 800, color: '#0f172a', whiteSpace: 'nowrap' }}>{inr(p.eligible)}</td>
                    <td style={{ padding: '13px 14px', textAlign: 'right', fontSize: '12.5px', fontWeight: 800, color: '#166534', whiteSpace: 'nowrap' }}>{inr(p.paid)}</td>
                    <td style={{ padding: '13px 14px', textAlign: 'right', fontSize: '12.5px', fontWeight: 800, color: (Number(p.unpaid) || 0) > 0 ? '#b45309' : '#cbd5e1', whiteSpace: 'nowrap' }}>{inr(p.unpaid)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div style={{ textAlign: 'center', fontSize: '11px', color: '#94a3b8', fontWeight: 700, margin: '22px 0 8px', letterSpacing: '0.5px' }}>
        Powered by <span style={{ color: '#0f52ba', fontWeight: 900 }}>NexEagle</span> · patient identities are masked for privacy
      </div>
    </Shell>
  );
}

const dateInput = { padding: '8px 10px', borderRadius: '9px', border: '1px solid #e2e8f0', fontSize: '12px', color: '#1e293b', outline: 'none' };

function Stat({ label, value, tone }) {
  const T = {
    blue: { bg: '#eff6ff', bd: '#bfdbfe', lb: '#1e40af', vl: '#1e3a8a' },
    green: { bg: '#f0fdf4', bd: '#bbf7d0', lb: '#166534', vl: '#14532d' },
    amber: { bg: '#fffbeb', bd: '#fde68a', lb: '#b45309', vl: '#92400e' },
    slate: { bg: '#f8fafc', bd: '#e2e8f0', lb: '#475569', vl: '#0f172a' },
  }[tone] || {};
  return (
    <div style={{ background: T.bg, border: `1px solid ${T.bd}`, borderRadius: '16px', padding: '16px 18px' }}>
      <div style={{ fontSize: '10px', fontWeight: 950, color: T.lb, letterSpacing: '0.6px', textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontSize: '23px', fontWeight: 950, color: T.vl, marginTop: '6px', fontVariantNumeric: 'tabular-nums' }}>{value}</div>
    </div>
  );
}

// Shared page chrome: NexEagle brand bar + centre name.
function Shell({ children, centre, doctor }) {
  return (
    <div style={{ minHeight: '100vh', background: '#f1f5f9', fontFamily: 'system-ui, -apple-system, Segoe UI, sans-serif' }}>
      <div style={{ background: 'linear-gradient(120deg,#0a1628,#0f52ba)', color: 'white', padding: '20px 18px 26px' }}>
        <div style={{ maxWidth: '960px', margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ width: '34px', height: '34px', borderRadius: '10px', background: 'rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px' }}>🦅</div>
            <span style={{ fontSize: '17px', fontWeight: 950, letterSpacing: '0.5px' }}>NexEagle</span>
          </div>
          {centre && (
            <div style={{ marginTop: '16px' }}>
              <div style={{ fontSize: '11px', fontWeight: 800, color: 'rgba(255,255,255,0.6)', letterSpacing: '0.6px', textTransform: 'uppercase' }}>{centre}</div>
              <div style={{ fontSize: '22px', fontWeight: 950, marginTop: '3px' }}>Referral dashboard</div>
              {doctor && <div style={{ fontSize: '12.5px', fontWeight: 700, color: 'rgba(255,255,255,0.8)', marginTop: '3px' }}>{doctor}</div>}
            </div>
          )}
        </div>
      </div>
      <div style={{ maxWidth: '960px', margin: '0 auto', padding: '18px' }}>{children}</div>
    </div>
  );
}

// 3-second branded splash.
function Splash() {
  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg,#0a1628,#0f52ba)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'white', fontFamily: 'system-ui, -apple-system, Segoe UI, sans-serif', textAlign: 'center', padding: '24px' }}>
      <div style={{ fontSize: '64px', animation: 'nxFloat 1.6s ease-in-out infinite' }}>🦅</div>
      <div style={{ fontSize: '34px', fontWeight: 950, letterSpacing: '1px', marginTop: '14px', animation: 'nxRise 0.7s ease-out both' }}>NexEagle</div>
      <div style={{ fontSize: '13.5px', fontWeight: 600, color: 'rgba(255,255,255,0.82)', marginTop: '12px', maxWidth: '420px', lineHeight: 1.6, animation: 'nxRise 0.7s ease-out 0.25s both' }}>
        Trusted health-tech, built for the people who heal. Thank you for partnering with us in better diagnostics.
      </div>
      <div style={{ marginTop: '26px', width: '120px', height: '4px', borderRadius: '99px', background: 'rgba(255,255,255,0.2)', overflow: 'hidden' }}>
        <div style={{ height: '100%', background: 'white', animation: 'nxBar 3s linear forwards' }} />
      </div>
      <style>{`
        @keyframes nxFloat { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-12px); } }
        @keyframes nxRise { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: none; } }
        @keyframes nxBar { from { width: 0; } to { width: 100%; } }
      `}</style>
    </div>
  );
}
