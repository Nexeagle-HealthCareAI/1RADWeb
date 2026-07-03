import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import useAuth from '../auth/useAuth';
import apiClient from '../api/apiClient';
import RadiologyWorkflowBG from '../components/RadiologyWorkflowBG';
import AuthErrorModal from '../components/AuthErrorModal';
import '../styles/global.css';

// ── Shared field styles ───────────────────────────────────────────────────────
// We now use global CSS classes (.premium-input, .premium-label, .premium-btn)
// to ensure consistency across the auth forms.

function Field({ label, children }) {
  return (
    <div style={{ marginBottom: '14px' }}>
      {label && <label className="premium-label">{label}</label>}
      {children}
    </div>
  );
}

function Input({ label, ...props }) {
  return (
    <Field label={label}>
      <input
        {...props}
        className="premium-input"
        style={props.style || {}}
      />
    </Field>
  );
}

// Product packages (SKUs). `modules` is the value stored on the subscription;
// reporting is included in all three.
const PACKAGES = [
  {
    modules: 'RIS,PACS', edition: 'RIS+PACS',
    name: 'RIS + Cloud PACS',
    tag: 'Recommended',
    blurb: 'The full product — patient workflow plus cloud imaging.',
    includes: ['Appointments, worklist & billing', 'Cloud DICOM storage + web viewer', 'Modality bridge upload', 'Reporting'],
  },
  {
    modules: 'RIS', edition: 'RIS',
    name: 'RIS only',
    blurb: 'Run your centre’s workflow; store images locally.',
    includes: ['Appointments, worklist & billing', 'Referrals', 'Attach PDF/JPG to visits', 'Reporting', 'No cloud DICOM upload/viewer'],
  },
  {
    modules: 'PACS', edition: 'PACS',
    name: 'Cloud PACS only',
    blurb: 'Teleradiology — receive, view and report studies. No scheduling.',
    includes: ['Cloud DICOM storage + web viewer', 'Modality bridge upload', 'Reporting on studies', 'No appointment/billing workflow'],
  },
];

const fmtINR = (n) => '₹' + Number(n || 0).toLocaleString('en-IN');

function PackageCard({ pkg, plan, cycle, selected, onSelect }) {
  return (
    <button type="button" onClick={onSelect}
      style={{
        textAlign: 'left', width: '100%', padding: '12px 14px', borderRadius: '12px', cursor: 'pointer',
        border: `1.5px solid ${selected ? 'rgba(96,165,250,0.8)' : 'rgba(255,255,255,0.10)'}`,
        background: selected ? 'rgba(96,165,250,0.10)' : 'rgba(255,255,255,0.02)',
        transition: 'all 0.15s ease',
      }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
        <span style={{
          width: '16px', height: '16px', borderRadius: '50%', flexShrink: 0,
          border: `2px solid ${selected ? '#60a5fa' : 'rgba(255,255,255,0.3)'}`,
          background: selected ? '#60a5fa' : 'transparent',
        }} />
        <strong style={{ color: '#e6ebf2', fontSize: '14px' }}>{pkg.name}</strong>
        {pkg.tag && <span style={{ fontSize: '10px', fontWeight: 700, color: '#34d399', border: '1px solid rgba(52,211,153,0.4)', borderRadius: '6px', padding: '1px 6px' }}>{pkg.tag}</span>}
        {plan && (
          <span style={{ marginLeft: 'auto', textAlign: 'right' }}>
            <span style={{ color: '#8a94a6', fontSize: '10px' }}>from </span>
            <span style={{ color: '#e6ebf2', fontSize: '15px', fontWeight: 700 }}>{fmtINR(plan.price)}</span>
            <span style={{ color: '#8a94a6', fontSize: '11px' }}>/{cycle === 'Yearly' ? 'yr' : 'mo'}</span>
          </span>
        )}
      </div>
      <div style={{ color: '#9aa4b2', fontSize: '12px', marginLeft: '24px', marginBottom: '6px' }}>
        {pkg.blurb}
        {plan?.includedStorageGb ? <span style={{ color: '#8a94a6' }}> · {plan.includedStorageGb}GB incl. (+{fmtINR(plan.perGbOveragePrice)}/GB)</span> : null}
      </div>
      <ul style={{ margin: 0, paddingLeft: '40px', color: '#8a94a6', fontSize: '11.5px', lineHeight: 1.5 }}>
        {pkg.includes.map((f, i) => <li key={i}>{f}</li>)}
      </ul>
      <div style={{ color: '#6b7280', fontSize: '10px', marginLeft: '24px', marginTop: '4px' }}>14-day free trial — pay after.</div>
    </button>
  );
}

function PrimaryBtn({ children, disabled, ...props }) {
  return (
    <button
      {...props}
      disabled={disabled}
      className="premium-btn"
    >{children}</button>
  );
}

const STEP_LABELS = ['Verify contact', 'Your details', 'Clinical info', 'Centre details', 'Choose plan'];

export default function RegisterPage() {
  const { registerAdminDoctor, sendOtp, verifyOtp } = useAuth();
  const navigate = useNavigate();

  const [formData, setFormData] = useState({
    role: 'admindoctor',
    mobile: '', otp: '', name: '', email: '',
    password: '', confirmPassword: '',
    specialization: '', licenseNo: '', degree: '',
    centerName: '', chainName: '', centerAddress: '',
    gstinNumber: '', registrationNumber: '', panNumber: '', nabhNumber: '',
    // Chosen product package (SKU) + billing cycle. Defaults to the full product.
    modules: 'RIS,PACS',
    cycle: 'Monthly',
  });
  // Plans fetched for pricing display (public endpoint).
  const [plans, setPlans] = useState([]);
  useEffect(() => {
    apiClient.get('/subscriptions/plans')
      .then(r => setPlans(r?.data?.data || []))
      .catch(() => setPlans([]));
  }, []);
  // The plan matching a package's edition at the selected cycle.
  const planFor = (edition) => plans.find(p => p.edition === edition && p.name === formData.cycle);

  const [step,          setStep]         = useState(1);
  const [isOtpSent,     setIsOtpSent]    = useState(false);
  const [countdown,     setCountdown]    = useState(0);
  const [error,         setError]        = useState('');
  const [loading,       setLoading]      = useState(false);
  const [showPassword,  setShowPassword] = useState(false);
  const [errorCode,     setErrorCode]    = useState(null);
  const [timerId,       setTimerId]      = useState(null);
  // Celebration overlay shown after a successful registration.
  // Holds the redirect on a beat so the user gets a moment of payoff
  // before being sent to the login screen.
  const [welcome,       setWelcome]      = useState({ open: false });
  // Modal shown when the identity (email/mobile) collides with an Active
  // user. The inline error band was easy to miss at the bottom of step 4,
  // so we surface it as a blocking dialog with explicit next-step CTAs.
  const [identityClash, setIdentityClash] = useState({ open: false, message: '' });
  // Per-step achievement reward — a unique celebratory burst when the user
  // completes a step, so the signup feels like levelling up rather than a chore.
  const [reward, setReward] = useState(null); // { title, sub, pct, emoji }

  const set = (key, val) => setFormData(p => ({ ...p, [key]: val }));

  // Role-aware step sequence: Operations Directors skip the clinical step.
  // `step` stays an absolute id (1..5); the sequence drives numbering/progress.
  const stepSeq = formData.role === 'admindoctor' ? [1, 2, 3, 4, 5] : [1, 2, 4, 5];
  const stepIndex = Math.max(0, stepSeq.indexOf(step));

  // Motivational copy per completed step — keyed by the absolute step id.
  const STEP_REWARDS = {
    1: { emoji: '🎯', title: 'Mobile verified!', sub: "You're officially on the grid." },
    2: { emoji: '🔐', title: 'Identity secured!', sub: 'Your account is taking shape.' },
    3: { emoji: '🩺', title: 'Credentials locked in!', sub: 'Doctor mode activated.' },
    4: { emoji: '🏥', title: 'Centre registered!', sub: 'One last step — pick your plan.' },
  };
  // Fire the reward for `completedStep`, auto-dismiss after a beat. `pct` is how
  // far through the (role-aware) sequence the user now is.
  const celebrate = (completedStep) => {
    const r = STEP_REWARDS[completedStep];
    if (!r) return;
    const doneCount = stepSeq.filter(n => n <= completedStep).length;
    const pct = Math.round((doneCount / stepSeq.length) * 100);
    setReward({ ...r, pct });
    setTimeout(() => setReward(null), 2200);
  };

  const validateGSTIN = g => !g || /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(g);
  const validatePAN   = p => !p || /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(p);

  const startCountdown = () => {
    if (timerId) clearInterval(timerId);
    setCountdown(30);
    const id = setInterval(() => {
      setCountdown(p => { if (p <= 1) { clearInterval(id); setTimerId(null); return 0; } return p - 1; });
    }, 1000);
    setTimerId(id);
  };

  useEffect(() => () => { if (timerId) clearInterval(timerId); }, [timerId]);

  const handleSendOtp = async e => {
    e.preventDefault(); setError('');
    if (!formData.mobile || formData.mobile.length < 10)
      return setError('Enter a valid 10-digit mobile number.');
    setLoading(true);
    const res = await sendOtp(formData.mobile);
    setLoading(false);
    if (res.success) {
      if (res.message?.toLowerCase().includes('already registered')) return setError(res.message);
      setIsOtpSent(true); startCountdown();
    } else setError(res.error);
  };

  const handleVerifyOtp = async e => {
    e.preventDefault(); setError(''); setLoading(true);
    const res = await verifyOtp(formData.mobile, formData.otp);
    setLoading(false);
    if (res.success) {
      if (res.type === 'Login') navigate('/login');
      else { celebrate(1); setStep(2); }
    } else setError(res.error);
  };

  const handleSubmit = async e => {
    e.preventDefault(); setError('');
    if (step === 2) {
      if (!formData.name || !formData.email || !formData.password)
        return setError('Please fill in all required fields.');
      if (formData.password.length < 6)
        return setError('Password must be at least 6 characters.');
      if (formData.password !== formData.confirmPassword)
        return setError('Passwords do not match.');
      celebrate(2); setStep(formData.role === 'admindoctor' ? 3 : 4); return;
    }
    if (step === 3) {
      if (!formData.specialization || !formData.licenseNo || !formData.degree)
        return setError('Please complete all clinical credential fields.');
      celebrate(3); setStep(4); return;
    }
    if (step === 4) {
      // Centre details first — validate, then move on to plan selection.
      if (!formData.centerName || !formData.centerAddress)
        return setError('Centre name and address are required.');
      if (!validateGSTIN(formData.gstinNumber))
        return setError('Invalid GSTIN format. Expected: 22AAAAA0000A1Z5');
      if (!validatePAN(formData.panNumber))
        return setError('Invalid PAN format. Expected: ABCDE1234F');
      celebrate(4); setStep(5); return;
    }
    if (step === 5) {
      // Plan step — a package always has a default selection; submit registration.
      setLoading(true);
      const res = await registerAdminDoctor({
        fullName: formData.name, email: formData.email, mobile: formData.mobile,
        password: formData.password, centerName: formData.centerName,
        centerAddress: formData.centerAddress, gstinNumber: formData.gstinNumber,
        registrationNumber: formData.registrationNumber, panNumber: formData.panNumber,
        nabhNumber: formData.nabhNumber, specialization: formData.specialization,
        degree: formData.degree, licenseNo: formData.licenseNo,
        modules: formData.modules,
      });
      setLoading(false);
      if (res.success) {
        // Show celebration overlay — it auto-redirects after a short
        // countdown OR when the user clicks "Sign in".
        setWelcome({
          open: true,
          name: formData.name,
          centerName: formData.centerName,
          mobile: formData.mobile,
        });
      } else {
        setError(res.error); setErrorCode(res.errorCode);
        if (res.errorCode === 'IDENTITY_ALREADY_ACTIVE' || res.errorCode === 'ALREADY_REGISTERED') {
          setIdentityClash({ open: true, message: res.error });
        }
      }
    }
  };

  // ── Progress dots ──────────────────────────────────────────────────────────
  const StepDots = () => (
    <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', marginBottom: '18px' }}>
      {stepSeq.map(n => (
        <div key={n} style={{
          height: '5px', width: step >= n ? '24px' : '16px',
          borderRadius: '3px',
          background: step >= n ? '#3b82f6' : 'rgba(255,255,255,0.12)',
          transition: 'all 0.25s',
        }} />
      ))}
    </div>
  );

  const overallPct = Math.round(((stepIndex) / stepSeq.length) * 100);

  return (
    <div className="auth-immersive-container" style={{ display: 'block', overflowY: 'auto', padding: '0', background: '#f1f5f9' }}>
      <RadiologyWorkflowBG />

      {/* Premium animated background — soft brand-coloured glow orbs drifting
          behind the panel + a subtle grid sheen, for a richer, less-flat feel. */}
      <div style={{ position: 'fixed', inset: 0, zIndex: 2, pointerEvents: 'none', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: '-12%', left: '-8%', width: 520, height: 520, borderRadius: '50%', background: 'radial-gradient(circle, rgba(56,189,248,0.18), transparent 65%)', filter: 'blur(40px)', animation: 'regOrbA 16s ease-in-out infinite' }} />
        <div style={{ position: 'absolute', bottom: '-15%', right: '-10%', width: 600, height: 600, borderRadius: '50%', background: 'radial-gradient(circle, rgba(167,139,250,0.16), transparent 65%)', filter: 'blur(46px)', animation: 'regOrbB 20s ease-in-out infinite' }} />
        <div style={{ position: 'absolute', top: '40%', left: '55%', width: 380, height: 380, borderRadius: '50%', background: 'radial-gradient(circle, rgba(52,211,153,0.10), transparent 65%)', filter: 'blur(40px)', animation: 'regOrbA 24s ease-in-out infinite reverse' }} />
        <div style={{ position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(rgba(255,255,255,0.025) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px)', backgroundSize: '46px 46px', maskImage: 'radial-gradient(ellipse at center, black 30%, transparent 75%)', WebkitMaskImage: 'radial-gradient(ellipse at center, black 30%, transparent 75%)' }} />
        <style>{`
          @keyframes regOrbA { 0%,100% { transform: translate(0,0); } 50% { transform: translate(40px, 30px); } }
          @keyframes regOrbB { 0%,100% { transform: translate(0,0); } 50% { transform: translate(-50px, -34px); } }
        `}</style>
      </div>

      {/* Full-screen centred wide panel (replaces the cramped 1/3 side card). */}
      <div style={{
        position: 'relative', zIndex: 20, minHeight: '100vh',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 'clamp(16px, 3vw, 40px)', boxSizing: 'border-box',
      }}>
        <div style={{
          width: '100%', maxWidth: '900px',
          background: 'rgba(15,23,42,0.85)',
          backdropFilter: 'blur(24px) saturate(180%)', WebkitBackdropFilter: 'blur(24px) saturate(180%)',
          border: '1px solid rgba(255,255,255,0.15)', borderRadius: '26px',
          boxShadow: '0 40px 100px -20px rgba(0,0,0,0.8)',
          padding: 'clamp(24px, 4vw, 48px)', boxSizing: 'border-box',
        }}>
          {/* Brand header + live step counter */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '14px', marginBottom: '22px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <img src={`${import.meta.env.BASE_URL}Logo.png`} alt="NexEagle" style={{ width: '42px', height: '42px', objectFit: 'contain', borderRadius: '10px', background: 'rgba(255,255,255,0.06)', padding: '4px' }} />
              <div>
                <div style={{ fontSize: '21px', fontWeight: 800, color: 'white', letterSpacing: '-0.3px', lineHeight: 1.1 }}>NexEagle</div>
                <div style={{ fontSize: '11px', fontWeight: 700, color: '#60a5fa', letterSpacing: '1.5px' }}>1Rad</div>
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '11px', fontWeight: 800, color: '#60a5fa', letterSpacing: '1px' }}>STEP {stepIndex + 1} OF {stepSeq.length}</div>
              <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.55)', fontWeight: 600 }}>{STEP_LABELS[step - 1]}</div>
            </div>
          </div>

          {/* Premium segmented progress with milestone ticks */}
          <div style={{ display: 'flex', gap: '6px', marginBottom: '6px' }}>
            {stepSeq.map((n, i) => {
              const done = step > n, current = step === n;
              return (
                <div key={n} style={{ flex: 1, height: '6px', borderRadius: '99px', overflow: 'hidden', background: 'rgba(255,255,255,0.10)' }}>
                  <div style={{
                    height: '100%', borderRadius: '99px',
                    width: done ? '100%' : current ? '55%' : '0%',
                    background: 'linear-gradient(90deg, #38bdf8, #3b82f6)',
                    boxShadow: (done || current) ? '0 0 12px rgba(56,189,248,0.6)' : 'none',
                    transition: 'width 0.5s cubic-bezier(0.4,0,0.2,1)',
                  }} />
                </div>
              );
            })}
          </div>
          <div style={{ textAlign: 'right', fontSize: '10px', fontWeight: 800, color: 'rgba(255,255,255,0.4)', letterSpacing: '1px', marginBottom: '22px' }}>
            {overallPct}% COMPLETE
          </div>

          <div style={{ textAlign: 'center', marginBottom: '24px' }}>
          <h2 style={{ fontSize: '24px', fontWeight: 800, color: 'white', margin: '0 0 4px', fontFamily: '"Segoe UI", sans-serif', letterSpacing: '-0.4px' }}>
            {step === 1 ? 'Create your account' :
             step === 2 ? 'Your details' :
             step === 3 ? 'Clinical information' :
             step === 4 ? 'Centre details' : 'Choose your plan'}
          </h2>
          <p style={{ fontSize: '14px', color: 'rgba(255,255,255,0.85)', margin: 0, fontFamily: '"Segoe UI", sans-serif' }}>
            Step {stepIndex + 1} of {stepSeq.length} — {STEP_LABELS[step - 1]}
          </p>
        </div>

        <form onSubmit={step === 1 ? (isOtpSent ? handleVerifyOtp : handleSendOtp) : handleSubmit}>

          {/* ── Step 1: Contact verification ── */}
          {step === 1 && (
            <div>
              <Field label="Account type">
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  {[
                    { val: 'admindoctor', label: 'Chief Medical Officer' },
                    { val: 'admin',       label: 'Operations Director' },
                  ].map(({ val, label }) => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => set('role', val)}
                      style={{
                        padding: '12px 10px', borderRadius: '10px', border: '1px solid',
                        borderColor: formData.role === val ? '#3b82f6' : 'rgba(255,255,255,0.10)',
                        background: formData.role === val ? 'rgba(59,130,246,0.12)' : 'transparent',
                        color: formData.role === val ? '#60a5fa' : 'rgba(255,255,255,0.50)',
                        fontSize: '12px', fontWeight: 600, cursor: 'pointer',
                        fontFamily: '"Segoe UI", sans-serif', transition: 'all 0.15s',
                      }}
                    >{label}</button>
                  ))}
                </div>
              </Field>

              <Input
                label="Mobile number"
                type="tel" required
                disabled={isOtpSent}
                value={formData.mobile}
                onChange={e => set('mobile', e.target.value)}
                placeholder="e.g. 9876543210"
                style={{ opacity: isOtpSent ? 0.6 : 1 }}
              />

              {isOtpSent && (
                <div style={{ marginBottom: '14px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                    <label className="premium-label">Verification code</label>
                    {countdown > 0 ? (
                      <span style={{ fontSize: '11px', color: '#60a5fa', fontWeight: 600 }}>
                        Resend in {countdown}s
                      </span>
                    ) : (
                      <button type="button" onClick={handleSendOtp} style={{ background: 'none', border: 'none', color: '#60a5fa', fontSize: '11px', fontWeight: 700, cursor: 'pointer', textDecoration: 'underline' }}>
                        Resend code
                      </button>
                    )}
                  </div>
                  <input
                    type="text" required maxLength="6" autoFocus
                    className="premium-input"
                    value={formData.otp}
                    onChange={e => set('otp', e.target.value)}
                    placeholder="6-digit code"
                    style={{ textAlign: 'center', letterSpacing: '10px', fontSize: '20px', fontWeight: 700 }}
                  />
                </div>
              )}

              <PrimaryBtn type="submit" disabled={loading}>
                {loading
                  ? (isOtpSent ? 'Verifying...' : 'Sending...')
                  : (isOtpSent ? 'Verify & continue' : 'Send verification code')}
              </PrimaryBtn>
            </div>
          )}

          {/* ── Step 2: Identity ── */}
          {step === 2 && (
            <div>
              <Input label="Full name" type="text" required value={formData.name} onChange={e => set('name', e.target.value)} placeholder="e.g. Dr. Arjun Mehta" />
              <Input label="Email address" type="email" required value={formData.email} onChange={e => set('email', e.target.value)} placeholder="doctor@centre.com" />

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div style={{ marginBottom: '14px' }}>
                  <label className="premium-label">Password</label>
                  <div style={{ position: 'relative' }}>
                    <input
                      type={showPassword ? 'text' : 'password'} required
                      className="premium-input"
                      value={formData.password}
                      onChange={e => set('password', e.target.value)}
                      placeholder="Min. 6 characters"
                      style={{ paddingRight: '40px' }}
                    />
                    <button type="button" onClick={() => setShowPassword(v => !v)} style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'rgba(255,255,255,0.35)', cursor: 'pointer', fontSize: '14px' }}>
                      {showPassword ? '👁️' : '🔒'}
                    </button>
                  </div>
                </div>
                <Input label="Confirm password" type={showPassword ? 'text' : 'password'} required value={formData.confirmPassword} onChange={e => set('confirmPassword', e.target.value)} placeholder="Repeat password" />
              </div>

              <PrimaryBtn type="submit">Continue</PrimaryBtn>
            </div>
          )}

          {/* ── Step 3: Clinical ── */}
          {step === 3 && (
            <div>
              <div style={{ background: 'rgba(59,130,246,0.12)', border: '1px solid rgba(59,130,246,0.3)', borderRadius: '12px', padding: '20px', marginBottom: '16px' }}>
                <p style={{ fontSize: '13px', fontWeight: 700, color: '#93c5fd', marginBottom: '14px', textTransform: 'uppercase', letterSpacing: '0.6px', fontFamily: '"Segoe UI", sans-serif' }}>Clinical credentials</p>
                <Input label="Primary specialization" type="text" required value={formData.specialization} onChange={e => set('specialization', e.target.value)} placeholder="e.g. Neuroradiologist" />
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <Input label="Medical reg. no." type="text" required value={formData.licenseNo} onChange={e => set('licenseNo', e.target.value)} placeholder="Reg-894-0" />
                  <Input label="Degree" type="text" required value={formData.degree} onChange={e => set('degree', e.target.value)} placeholder="MBBS, MD" />
                </div>
              </div>

              <div style={{ display: 'flex', gap: '10px' }}>
                <button type="button" onClick={() => setStep(2)} style={{ flex: 1, padding: '12px', border: '1px solid rgba(255,255,255,0.3)', borderRadius: '10px', background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.9)', cursor: 'pointer', fontSize: '14px', fontWeight: 600, fontFamily: '"Segoe UI", sans-serif' }}>
                  Back
                </button>
                <div style={{ flex: 2 }}><PrimaryBtn type="submit">Continue</PrimaryBtn></div>
              </div>
            </div>
          )}

          {/* ── Step 4: Centre details ── */}
          {step === 4 && (
            <div>
              <Input label="Centre name" type="text" required value={formData.centerName} onChange={e => set('centerName', e.target.value)} placeholder="e.g. City Diagnostic Centre" />
              <Input label="Group / chain (optional)" type="text" value={formData.chainName} onChange={e => set('chainName', e.target.value)} placeholder="e.g. Apollo Group" />

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div style={{ marginBottom: '14px' }}>
                  <label className="premium-label">GSTIN <span style={{ opacity: 0.5, fontWeight: 400 }}>(optional)</span></label>
                  <div style={{ position: 'relative' }}>
                    <input
                      type="text" value={formData.gstinNumber} maxLength={15}
                      className="premium-input"
                      onChange={e => set('gstinNumber', e.target.value.toUpperCase())}
                      placeholder="22AAAAA0000A1Z5"
                      style={{
                        textTransform: 'uppercase',
                        borderColor: formData.gstinNumber
                          ? (validateGSTIN(formData.gstinNumber) ? 'rgba(52,211,153,0.4)' : 'rgba(248,113,113,0.4)')
                          : 'rgba(255,255,255,0.10)',
                      }}
                    />
                    {formData.gstinNumber && (
                      <span style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', fontSize: '12px', color: validateGSTIN(formData.gstinNumber) ? '#34d399' : '#f87171' }}>
                        {validateGSTIN(formData.gstinNumber) ? '✓' : '✗'}
                      </span>
                    )}
                  </div>
                </div>
                <Input label={<>Hospital reg. no. <span style={{ opacity: 0.5, fontWeight: 400 }}>(optional)</span></>} type="text" value={formData.registrationNumber} onChange={e => set('registrationNumber', e.target.value.toUpperCase())} placeholder="HOS/2024/001234" />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div style={{ marginBottom: '14px' }}>
                  <label className="premium-label">PAN <span style={{ opacity: 0.5, fontWeight: 400 }}>(optional)</span></label>
                  <div style={{ position: 'relative' }}>
                    <input
                      type="text" value={formData.panNumber} maxLength={10}
                      className="premium-input"
                      onChange={e => set('panNumber', e.target.value.toUpperCase())}
                      placeholder="ABCDE1234F"
                      style={{
                        textTransform: 'uppercase',
                        borderColor: formData.panNumber
                          ? (validatePAN(formData.panNumber) ? 'rgba(52,211,153,0.4)' : 'rgba(248,113,113,0.4)')
                          : 'rgba(255,255,255,0.10)',
                      }}
                    />
                    {formData.panNumber && (
                      <span style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', fontSize: '12px', color: validatePAN(formData.panNumber) ? '#34d399' : '#f87171' }}>
                        {validatePAN(formData.panNumber) ? '✓' : '✗'}
                      </span>
                    )}
                  </div>
                </div>
                <Input label={<>NABH / NABL no. <span style={{ opacity: 0.5, fontWeight: 400 }}>(optional)</span></>} type="text" value={formData.nabhNumber} onChange={e => set('nabhNumber', e.target.value.toUpperCase())} placeholder="H-2022-1234" />
              </div>

              <Field label="Centre address">
                <textarea
                  required rows={3}
                  className="premium-input"
                  value={formData.centerAddress}
                  onChange={e => set('centerAddress', e.target.value)}
                  placeholder="Full physical address of the facility"
                  style={{ resize: 'none', lineHeight: '1.6' }}
                />
              </Field>

              <div style={{ display: 'flex', gap: '10px' }}>
                <button type="button" onClick={() => setStep(formData.role === 'admindoctor' ? 3 : 2)} style={{ flex: 1, padding: '12px', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '10px', background: 'transparent', color: 'rgba(255,255,255,0.60)', cursor: 'pointer', fontSize: '13px', fontFamily: '"Segoe UI", sans-serif' }}>
                  Back
                </button>
                <div style={{ flex: 2 }}><PrimaryBtn type="submit">Continue</PrimaryBtn></div>
              </div>
            </div>
          )}

          {/* ── Step 5: Choose plan ── */}
          {step === 5 && (
            <div>
              {/* Lightweight product picker — just choose the SKU; the full tier
                  pricing lives on the Subscription page after sign-in. Reporting
                  is included in all three; the differentiators are scheduling
                  (RIS) and cloud DICOM storage/viewer (PACS). */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                <label style={{ ...labelBase, marginBottom: 0 }}>Pick what fits your centre</label>
                {/* Monthly / Yearly toggle drives the "from" price shown on each card. */}
                <div style={{ display: 'inline-flex', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '8px', overflow: 'hidden' }}>
                  {['Monthly', 'Yearly'].map(c => (
                    <button key={c} type="button" onClick={() => set('cycle', c)}
                      style={{
                        padding: '4px 12px', fontSize: '12px', cursor: 'pointer', border: 'none',
                        background: formData.cycle === c ? '#60a5fa' : 'transparent',
                        color: formData.cycle === c ? '#fff' : '#9aa4b2',
                      }}>
                      {c}{c === 'Yearly' ? ' · 10% off' : ''}
                    </button>
                  ))}
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(248px, 1fr))', gap: '12px', marginBottom: '12px', alignItems: 'stretch' }}>
                {PACKAGES.map(p => (
                  <PackageCard key={p.modules} pkg={p} plan={planFor(p.edition)} cycle={formData.cycle}
                    selected={formData.modules === p.modules}
                    onSelect={() => set('modules', p.modules)} />
                ))}
              </div>

              {/* Full tier pricing is on the Subscription page after sign-in. */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(96,165,250,0.06)', border: '1px solid rgba(96,165,250,0.15)', borderRadius: '10px', padding: '10px 12px', marginBottom: '16px' }}>
                <span style={{ fontSize: '14px' }}>💡</span>
                <span style={{ fontSize: '11.5px', color: '#9aa4b2', lineHeight: 1.5, fontFamily: '"Segoe UI", sans-serif' }}>
                  Start free for 14 days — no payment now. Full tier pricing (Starter / Growth / Clinic) and pay-per-study are on the Subscription page after you sign in.
                </span>
              </div>

              <div style={{ display: 'flex', gap: '10px' }}>
                <button type="button" onClick={() => setStep(4)} style={{ flex: 1, padding: '12px', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '10px', background: 'transparent', color: 'rgba(255,255,255,0.60)', cursor: 'pointer', fontSize: '13px', fontFamily: '"Segoe UI", sans-serif' }}>
                  Back
                </button>
                <div style={{ flex: 2 }}><PrimaryBtn type="submit" disabled={loading}>{loading ? 'Creating account...' : 'Create account'}</PrimaryBtn></div>
              </div>
            </div>
          )}

          {/* ── Error ── */}
          {error && (
            <div style={{ marginTop: '14px', background: errorCode === 'IDENTITY_ALREADY_ACTIVE' ? 'rgba(59,130,246,0.08)' : 'rgba(248,113,113,0.08)', border: `1px solid ${errorCode === 'IDENTITY_ALREADY_ACTIVE' ? 'rgba(59,130,246,0.2)' : 'rgba(248,113,113,0.2)'}`, borderRadius: '10px', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <span style={{ fontSize: '12px', fontWeight: 600, color: errorCode === 'IDENTITY_ALREADY_ACTIVE' ? '#60a5fa' : '#f87171', fontFamily: '"Segoe UI", sans-serif' }}>
                {error}
              </span>
              {errorCode === 'IDENTITY_ALREADY_ACTIVE' && (
                <button type="button" onClick={() => navigate('/login', { state: { identifier: formData.mobile } })} style={{ alignSelf: 'flex-start', background: '#3b82f6', color: 'white', border: 'none', padding: '6px 12px', borderRadius: '6px', fontSize: '11px', fontWeight: 700, cursor: 'pointer' }}>
                  Sign in instead
                </button>
              )}
            </div>
          )}

          <div style={{ height: '1px', background: 'rgba(255,255,255,0.08)', margin: '22px 0' }} />

          <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.45)', textAlign: 'center', fontFamily: '"Segoe UI", sans-serif' }}>
            Already have an account?{' '}
            <Link to="/login" style={{ color: '#60a5fa', textDecoration: 'none', fontWeight: 700 }}>
              Sign in
            </Link>
          </p>
        </form>
        </div>
      </div>

      {/* Per-step achievement reward */}
      {reward && <StepReward {...reward} />}

      <AuthErrorModal
        open={identityClash.open}
        variant="info"
        title="This identity is already registered"
        message={identityClash.message || 'An active account already exists for this email or mobile number.'}
        identifiers={{ email: formData.email, mobile: formData.mobile }}
        primaryAction={{
          label: 'Sign in instead  →',
          onClick: () => navigate('/login', { state: { identifier: formData.mobile || formData.email } }),
        }}
        secondaryAction={{
          label: 'Forgot password?',
          onClick: () => navigate('/forgot-password', { state: { identifier: formData.email || formData.mobile } }),
        }}
        tertiaryAction={{
          label: 'Use a different email / mobile',
          onClick: () => {
            setIdentityClash({ open: false, message: '' });
            setError(''); setErrorCode(null);
            setStep(2);
            // Clear only the colliding fields so the user can retry with a
            // different identity; keep the centre details they already typed.
            setFormData(p => ({ ...p, email: '', password: '', confirmPassword: '' }));
          },
        }}
        onClose={() => setIdentityClash({ open: false, message: '' })}
      />

      {welcome.open && (
        <WelcomeCelebration
          name={welcome.name}
          centerName={welcome.centerName}
          onContinue={() =>
            navigate('/login', {
              state: {
                identifier: welcome.mobile,
                message: 'Account created! Please sign in.',
              },
            })
          }
        />
      )}
    </div>
  );
}

/**
 * WelcomeCelebration — full-screen success overlay shown after a brand-new
 * account is created. Auto-redirects to /login after AUTO_REDIRECT_MS, OR
 * immediately when the user clicks the CTA. Designed to feel like a moment
 * of payoff: confetti, animated check, glow ring, premium typography.
 */
function WelcomeCelebration({ name, centerName, onContinue }) {
  const AUTO_REDIRECT_MS = 8000;
  const [remaining, setRemaining] = useState(Math.ceil(AUTO_REDIRECT_MS / 1000));

  useEffect(() => {
    if (remaining <= 0) { onContinue?.(); return; }
    const t = setTimeout(() => setRemaining(r => r - 1), 1000);
    return () => clearTimeout(t);
  }, [remaining, onContinue]);

  // Stable confetti pieces — generated once per mount.
  const [confetti] = useState(() =>
    Array.from({ length: 36 }, (_, i) => ({
      id: i,
      left:        Math.random() * 100,
      delay:       Math.random() * 1.5,
      duration:    2.5 + Math.random() * 2,
      rotation:    Math.random() * 360,
      color:       ['#60a5fa', '#34d399', '#fbbf24', '#f472b6', '#a78bfa', '#fb7185'][i % 6],
      size:        6 + Math.random() * 6,
      borderRadius: Math.random() > 0.5 ? '50%' : '2px',
    }))
  );

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed', inset: 0, zIndex: 100050,
        background: 'radial-gradient(ellipse at center, rgba(15,23,42,0.92) 0%, rgba(2,6,23,0.98) 100%)',
        backdropFilter: 'blur(18px)', WebkitBackdropFilter: 'blur(18px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        animation: 'wcFade 320ms cubic-bezier(0.16, 1, 0.3, 1)',
        overflow: 'hidden',
        fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif',
      }}
    >
      {/* ── Confetti layer ─────────────────────────────────────── */}
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden' }}>
        {confetti.map(c => (
          <span key={c.id} style={{
            position: 'absolute',
            top: '-20px',
            left: `${c.left}%`,
            width: `${c.size}px`, height: `${c.size}px`,
            background: c.color,
            borderRadius: c.borderRadius,
            opacity: 0.9,
            transform: `rotate(${c.rotation}deg)`,
            animation: `wcConfetti ${c.duration}s ${c.delay}s cubic-bezier(0.25, 1, 0.5, 1) forwards`,
          }} />
        ))}
      </div>

      {/* ── Celebration card ───────────────────────────────────── */}
      <div style={{
        position: 'relative',
        width: '90%', maxWidth: '480px',
        background: 'linear-gradient(160deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.01) 100%)',
        border: '1px solid rgba(255,255,255,0.10)',
        borderRadius: '24px',
        padding: '48px 36px 36px',
        textAlign: 'center',
        boxShadow:
          '0 30px 70px -20px rgba(59, 130, 246, 0.35), ' +
          '0 0 0 1px rgba(255,255,255,0.04), ' +
          'inset 0 1px 0 rgba(255,255,255,0.06)',
        animation: 'wcPop 480ms cubic-bezier(0.34, 1.56, 0.64, 1)',
        backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
      }}>
        {/* Animated glow ring + check */}
        <div style={{
          position: 'relative',
          width: '88px', height: '88px',
          margin: '0 auto 26px',
        }}>
          <div style={{
            position: 'absolute', inset: '-12px',
            borderRadius: '50%',
            background: 'conic-gradient(from 90deg, #60a5fa, #a78bfa, #f472b6, #60a5fa)',
            opacity: 0.35,
            filter: 'blur(14px)',
            animation: 'wcGlow 3s ease-in-out infinite',
          }} />
          <div style={{
            position: 'relative',
            width: '88px', height: '88px', borderRadius: '50%',
            background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 10px 30px -5px rgba(16, 185, 129, 0.55), inset 0 1px 0 rgba(255,255,255,0.25)',
          }}>
            <svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" style={{
                strokeDasharray: 28,
                strokeDashoffset: 28,
                animation: 'wcCheck 600ms 280ms cubic-bezier(0.65, 0, 0.35, 1) forwards',
              }} />
            </svg>
          </div>
        </div>

        {/* "WELCOME ABOARD" badge */}
        <div style={{
          display: 'inline-block',
          padding: '5px 14px',
          background: 'linear-gradient(135deg, rgba(96,165,250,0.18), rgba(167,139,250,0.18))',
          border: '1px solid rgba(96,165,250,0.30)',
          borderRadius: '999px',
          marginBottom: '14px',
        }}>
          <span style={{
            fontSize: '10px', fontWeight: 800, color: '#93c5fd',
            letterSpacing: '2px', textTransform: 'uppercase',
          }}>
            🎉  Welcome Aboard
          </span>
        </div>

        <h1 style={{
          fontSize: '26px', fontWeight: 800, color: '#ffffff',
          margin: '0 0 10px',
          letterSpacing: '-0.4px',
          lineHeight: 1.2,
        }}>
          Hi {name?.split(' ')[0] || 'there'} — your workspace is ready
        </h1>

        <p style={{
          fontSize: '14px', color: 'rgba(255,255,255,0.62)',
          margin: '0 0 8px',
          lineHeight: 1.55,
        }}>
          <strong style={{ color: '#a78bfa' }}>{centerName || 'Your clinical hub'}</strong> has been provisioned on the 1Rad grid.
        </p>
        <p style={{
          fontSize: '13px', color: 'rgba(255,255,255,0.45)',
          margin: '0 0 30px',
          lineHeight: 1.55,
        }}>
          Sign in to start dictating reports, managing studies, and inviting your team.
        </p>

        {/* Primary CTA */}
        <button
          onClick={onContinue}
          style={{
            width: '100%', padding: '14px',
            background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
            color: 'white', border: 'none',
            borderRadius: '12px',
            fontSize: '13px', fontWeight: 800,
            letterSpacing: '0.8px',
            cursor: 'pointer',
            boxShadow: '0 10px 24px -6px rgba(59,130,246,0.55), inset 0 1px 0 rgba(255,255,255,0.20)',
            transition: 'transform 0.18s, box-shadow 0.18s',
            fontFamily: 'inherit',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.transform = 'translateY(-1px)';
            e.currentTarget.style.boxShadow = '0 14px 30px -6px rgba(59,130,246,0.65), inset 0 1px 0 rgba(255,255,255,0.25)';
          }}
          onMouseLeave={e => {
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.boxShadow = '0 10px 24px -6px rgba(59,130,246,0.55), inset 0 1px 0 rgba(255,255,255,0.20)';
          }}
        >
          CONTINUE TO SIGN IN  →
        </button>

        {/* Auto-redirect hint */}
        <div style={{
          marginTop: '14px',
          fontSize: '11px', color: 'rgba(255,255,255,0.35)',
          letterSpacing: '0.4px',
        }}>
          Redirecting automatically in <span style={{ color: '#93c5fd', fontWeight: 700 }}>{remaining}s</span>
        </div>
      </div>

      <style>{`
        @keyframes wcFade {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        @keyframes wcPop {
          0%   { opacity: 0; transform: scale(0.88) translateY(16px); }
          100% { opacity: 1; transform: scale(1)    translateY(0); }
        }
        @keyframes wcCheck {
          to { stroke-dashoffset: 0; }
        }
        @keyframes wcGlow {
          0%, 100% { opacity: 0.30; transform: scale(1); }
          50%      { opacity: 0.55; transform: scale(1.12); }
        }
        @keyframes wcConfetti {
          0%   { transform: translateY(0)     rotate(0deg);   opacity: 1; }
          100% { transform: translateY(110vh) rotate(720deg); opacity: 0; }
        }
      `}</style>
    </div>
  );
}

/**
 * StepReward — a brief, non-blocking "achievement unlocked" burst shown each
 * time the user completes a registration step. A medal stamps in over radiating
 * energy rings + a sparkle burst, with a motivational line and the running
 * setup %. Non-interactive (pointer-events:none) so the next step is already
 * usable underneath. Auto-dismissed by the parent after ~1.7s.
 */
function StepReward({ emoji, title, sub, pct }) {
  const sparks = Array.from({ length: 14 }, (_, i) => ({ id: i, angle: (i * (360 / 14)) * (Math.PI / 180), color: ['#38bdf8', '#a78bfa', '#34d399', '#fbbf24', '#f472b6'][i % 5], dist: 120 + (i % 3) * 26 }));
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 100040, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none', animation: 'srFade 0.22s ease' }}>
      {/* Strong dark scrim so the achievement reads clearly over the form. */}
      <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse at center, rgba(2,6,23,0.78) 0%, rgba(2,6,23,0.92) 100%)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)' }} />

      {/* Glassy achievement card — gives the burst definition + premium feel. */}
      <div style={{
        position: 'relative', width: '90%', maxWidth: 380, textAlign: 'center',
        background: 'linear-gradient(160deg, rgba(30,41,59,0.85), rgba(15,23,42,0.92))',
        border: '1px solid rgba(56,189,248,0.28)', borderRadius: 26,
        padding: '40px 30px 30px',
        boxShadow: '0 40px 90px -20px rgba(2,6,23,0.85), 0 0 0 1px rgba(255,255,255,0.04), inset 0 1px 0 rgba(255,255,255,0.08)',
        animation: 'srPop 0.5s cubic-bezier(0.34,1.56,0.64,1)',
      }}>
        {/* Top conic glow accent */}
        <div style={{ position: 'absolute', top: -1, left: '15%', right: '15%', height: 3, borderRadius: 99, background: 'linear-gradient(90deg, transparent, #38bdf8, #a78bfa, transparent)' }} />

        {/* Medal + radiating rings + sparkles */}
        <div style={{ position: 'relative', width: 104, height: 104, margin: '0 auto 22px' }}>
          {[0, 0.16, 0.32].map((d, i) => (
            <span key={i} style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: '2.5px solid rgba(56,189,248,0.55)', animation: `srRing 1.2s ${d}s cubic-bezier(0.2,0.8,0.2,1) forwards` }} />
          ))}
          {sparks.map((s) => (
            <span key={s.id} style={{ position: 'absolute', top: '50%', left: '50%', width: 8, height: 8, marginTop: -4, marginLeft: -4, borderRadius: '50%', background: s.color, boxShadow: `0 0 8px ${s.color}`, '--dx': `${Math.cos(s.angle) * s.dist}px`, '--dy': `${Math.sin(s.angle) * s.dist}px`, animation: 'srSpark 1s 0.08s ease-out forwards' }} />
          ))}
          <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: 'linear-gradient(135deg, #38bdf8, #2563eb)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 48, boxShadow: '0 16px 44px -8px rgba(37,99,235,0.85), inset 0 2px 0 rgba(255,255,255,0.35)', animation: 'srStamp 0.6s cubic-bezier(0.34,1.56,0.64,1)' }}>
            {emoji}
          </div>
        </div>

        <div style={{ animation: 'srRise 0.5s 0.18s both' }}>
          <div style={{ display: 'inline-block', padding: '5px 16px', borderRadius: 999, background: 'rgba(56,189,248,0.18)', border: '1px solid rgba(56,189,248,0.4)', fontSize: 10, fontWeight: 900, letterSpacing: 2.5, color: '#7dd3fc', marginBottom: 14 }}>
            ★ ACHIEVEMENT UNLOCKED
          </div>
          <div style={{ fontSize: 26, fontWeight: 900, color: 'white', letterSpacing: '-0.5px', marginBottom: 8, lineHeight: 1.1 }}>{title}</div>
          <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.78)', marginBottom: 22, lineHeight: 1.5 }}>{sub}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ flex: 1, height: 8, borderRadius: 99, background: 'rgba(255,255,255,0.12)', overflow: 'hidden' }}>
              <div style={{ width: `${pct}%`, height: '100%', borderRadius: 99, background: 'linear-gradient(90deg,#34d399,#38bdf8)', boxShadow: '0 0 12px rgba(56,189,248,0.7)', animation: 'srBar 0.7s 0.2s ease both' }} />
            </div>
            <span style={{ fontSize: 14, fontWeight: 900, color: '#34d399', minWidth: 64, textAlign: 'right' }}>{pct}% done</span>
          </div>
        </div>
      </div>
      <style>{`
        @keyframes srFade { from { opacity: 0 } to { opacity: 1 } }
        @keyframes srPop  { 0% { opacity: 0; transform: scale(0.85) translateY(20px); } 100% { opacity: 1; transform: scale(1) translateY(0); } }
        @keyframes srStamp { 0% { opacity: 0; transform: scale(0) rotate(-30deg); } 60% { opacity: 1; transform: scale(1.14) rotate(7deg); } 100% { transform: scale(1) rotate(0); } }
        @keyframes srRing { 0% { opacity: 0.95; transform: scale(0.5); } 100% { opacity: 0; transform: scale(2.6); } }
        @keyframes srSpark { 0% { opacity: 1; transform: translate(0,0) scale(1.2); } 100% { opacity: 0; transform: translate(var(--dx), var(--dy)) scale(0.2); } }
        @keyframes srRise { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes srBar  { from { width: 0; } }
      `}</style>
    </div>
  );
}
