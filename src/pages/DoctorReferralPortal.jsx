// ════════════════════════════════════════════════════════════════════════════
//  DoctorReferralPortal.jsx — public /r/:id page for a referring doctor.
//
//  Opened from a personal capability link (signed token in ?t=). No login. The
//  doctor sees every patient they referred — masked identity, study status, and
//  their eligible / paid / outstanding referral amounts — plus a gamified view
//  of future ("optimistic") cuts, can edit their own profile, and gets a warm
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
  const [page, setPage] = useState(1); // patient table — 5 rows per page

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

  // Stats reflect the active filter so the numbers match the table.
  const stats = useMemo(() => {
    const eligible = filtered.reduce((s, p) => s + (Number(p.eligible) || 0), 0);
    const paid = filtered.reduce((s, p) => s + (Number(p.paid) || 0), 0);
    const unpaid = filtered.reduce((s, p) => s + (Number(p.unpaid) || 0), 0);
    return { count: filtered.length, eligible, paid, unpaid };
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
  const PAGE_SIZE = 5;
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const pageRows = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  return (
    <Shell centre={data.centreName} location={data.centreLocation} adminName={data.centreAdminName} contact={data.centreContact} email={data.centreEmail}
      headerAction={<ProfileButton id={id} token={token} data={data} setData={setData} />}>
      {/* Thank-you note */}
      <ThankYou doctor={data.doctorName} centre={data.centreName} todayCount={todayCount} todayEligible={todayEligible} />

      {/* Quick-glance stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px', marginBottom: '20px' }}>
        <Stat label="Referred patients" value={stats.count} tone="blue" icon="👥" />
        <Stat label="Eligible referral" value={inr(stats.eligible)} tone="slate" icon="💼" />
        <Stat label="Received" value={inr(stats.paid)} tone="green" icon="✅" />
        <Stat label="Outstanding" value={inr(stats.unpaid)} tone="amber" icon="⏳" />
      </div>

      {/* Gamified upcoming / optimistic cuts */}
      {upcoming.count > 0 && <Upcoming upcoming={upcoming} />}

      {/* Date filter */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center', marginBottom: '14px' }}>
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
                    <td style={{ padding: '13px 14px', textAlign: 'right', fontSize: '12.5px', fontWeight: 800, color: '#0f172a', whiteSpace: 'nowrap' }}>{inr(p.eligible)}</td>
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
        Powered by <span style={{ color: '#0f52ba', fontWeight: 900 }}>NexEagle</span> · patient identities are masked for privacy
      </div>
    </Shell>
  );
}

const dateInput = { padding: '8px 10px', borderRadius: '9px', border: '1px solid #e2e8f0', fontSize: '12px', color: '#1e293b', outline: 'none' };

// Warm, personalised thank-you with today's contribution at a glance.
function ThankYou({ doctor, centre, todayCount, todayEligible }) {
  return (
    <div style={{ position: 'relative', overflow: 'hidden', borderRadius: '20px', padding: '22px 24px', marginBottom: '18px', background: 'linear-gradient(120deg,#0a1628 0%,#0f52ba 100%)', color: 'white', boxShadow: '0 14px 36px -12px rgba(15,82,186,0.45)' }}>
      <div style={{ position: 'absolute', top: '-30px', right: '-20px', width: '160px', height: '160px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(96,165,250,0.4), transparent 70%)', pointerEvents: 'none' }} />
      <div style={{ position: 'relative' }}>
        <div style={{ fontSize: '26px' }}>🙏</div>
        <div style={{ fontSize: '19px', fontWeight: 950, marginTop: '6px', letterSpacing: '-0.3px' }}>Thank you, {doctor || 'Doctor'}</div>
        <div style={{ fontSize: '12.5px', fontWeight: 600, color: 'rgba(255,255,255,0.82)', marginTop: '5px', lineHeight: 1.6, maxWidth: '560px' }}>
          {centre || 'Our centre'} is grateful for your trust. Every patient you refer is cared for with the highest standard — and your contribution is always recognised here, transparently.
        </div>
        {todayCount > 0 && (
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', marginTop: '14px', padding: '7px 13px', borderRadius: '999px', background: 'rgba(255,255,255,0.14)', border: '1px solid rgba(255,255,255,0.18)', fontSize: '12px', fontWeight: 800 }}>
            ✨ Today: {todayCount} referral{todayCount === 1 ? '' : 's'} · {inr(todayEligible)} eligible
          </div>
        )}
      </div>
    </div>
  );
}

// Self-service profile — the doctor keeps their own location / specialty /
// degree current so the centre matches referrals to the right person.
// Profile editor — lives in the top-nav right corner: a compact button that
// opens a popup to update location / degree / specialty.
function ProfileButton({ id, token, data, setData }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: '', contact: '', email: '', location: '', specialty: '', degree: '' });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState('');

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
      <button onClick={openModal} title="Update your profile"
        style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '8px 13px', borderRadius: '10px', border: '1px solid #bfdbfe', background: '#eff6ff', color: '#1d4ed8', fontSize: '11.5px', fontWeight: 900, cursor: 'pointer', whiteSpace: 'nowrap' }}>
        ✎ Update profile
      </button>

      {open && (
        <div onClick={() => !saving && setOpen(false)} className="nxpf-overlay">
          <div onClick={e => e.stopPropagation()} className="nxpf-card">
            <div className="nxpf-head">
              <div className="nxpf-grip" />
              <div className="nxpf-head-l">
                <div className="nxpf-avatar">{((data.doctorName || 'D').trim().charAt(0) || 'D').toUpperCase()}</div>
                <div style={{ minWidth: 0 }}>
                  <div className="nxpf-eyebrow">YOUR PROFILE</div>
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
    <div
      style={{ position: 'relative', overflow: 'hidden', borderRadius: '18px', padding: '18px 20px', background: `linear-gradient(135deg, ${T.g1} 0%, ${T.g2} 100%)`, border: `1px solid ${T.bd}`, boxShadow: '0 6px 20px rgba(15,23,42,0.04)', transition: 'transform 0.18s, box-shadow 0.18s' }}
      onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-3px)'; e.currentTarget.style.boxShadow = '0 16px 34px rgba(15,23,42,0.10)'; }}
      onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = '0 6px 20px rgba(15,23,42,0.04)'; }}>
      <div style={{ position: 'absolute', top: '-26px', right: '-20px', width: '96px', height: '96px', borderRadius: '50%', background: 'rgba(255,255,255,0.55)', pointerEvents: 'none' }} />
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: '10px' }}>
        <div style={{ width: '38px', height: '38px', borderRadius: '12px', background: T.icbg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '19px', flexShrink: 0 }}>{icon}</div>
        <div style={{ fontSize: '10px', fontWeight: 950, color: T.lb, letterSpacing: '0.5px', textTransform: 'uppercase', lineHeight: 1.3 }}>{label}</div>
      </div>
      <div style={{ position: 'relative', fontSize: '30px', fontWeight: 950, color: T.vl, marginTop: '12px', letterSpacing: '-0.6px', fontVariantNumeric: 'tabular-nums' }}>{value}</div>
    </div>
  );
}

// Minimalistic, premium top nav: centre logo + name + location on the left;
// the centre admin's name, contact and email on the right. Full-width board.
function Shell({ children, centre, location, adminName, contact, email, headerAction }) {
  const hasContact = adminName || contact || email;
  return (
    <div style={{ position: 'fixed', inset: 0, overflowY: 'auto', WebkitOverflowScrolling: 'touch', textAlign: 'left', background: '#f6f8fb', fontFamily: 'system-ui, -apple-system, Segoe UI, sans-serif' }}>
      <header style={{ background: 'white', borderBottom: '1px solid #e7ecf3', position: 'sticky', top: 0, zIndex: 50 }}>
        <div style={{ padding: '12px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
            <img src={`${import.meta.env.BASE_URL}Logo.png`} alt={centre || 'Centre'} style={{ width: '42px', height: '42px', objectFit: 'contain', borderRadius: '11px', flexShrink: 0 }} />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: '16px', fontWeight: 950, color: '#0f172a', letterSpacing: '-0.3px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{centre || 'Diagnostic Centre'}</div>
              {location && <div style={{ fontSize: '11px', fontWeight: 700, color: '#94a3b8', marginTop: '1px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '340px' }}>📍 {location}</div>}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexShrink: 0 }}>
            {hasContact && (
              <div style={{ textAlign: 'right', minWidth: 0, padding: '7px 13px', borderRadius: '13px', background: '#f8fafc', border: '1px solid #eef2f7' }}>
                {adminName && <div style={{ fontSize: '12.5px', fontWeight: 900, color: '#0f172a', whiteSpace: 'nowrap' }}>{adminName}</div>}
                <div style={{ display: 'flex', gap: '14px', justifyContent: 'flex-end', marginTop: adminName ? '3px' : 0, flexWrap: 'wrap' }}>
                  {contact && <a href={`tel:${contact}`} style={{ fontSize: '11.5px', fontWeight: 800, color: '#0f52ba', textDecoration: 'none', whiteSpace: 'nowrap' }}>📞 {contact}</a>}
                  {email && <a href={`mailto:${email}`} style={{ fontSize: '11.5px', fontWeight: 800, color: '#0f52ba', textDecoration: 'none', whiteSpace: 'nowrap' }}>✉️ {email}</a>}
                </div>
              </div>
            )}
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
