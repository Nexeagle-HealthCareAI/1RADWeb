import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import useAuth from '../auth/useAuth';
import RadiologyWorkflowBG from '../components/RadiologyWorkflowBG';
import '../styles/global.css';

// ── Shared field styles ───────────────────────────────────────────────────────
const inputBase = {
  width: '100%',
  padding: '11px 14px',
  background: 'rgba(255,255,255,0.05)',
  border: '1px solid rgba(255,255,255,0.10)',
  borderRadius: '10px',
  color: 'white',
  fontSize: '13px',
  outline: 'none',
  fontFamily: '"Segoe UI", system-ui, sans-serif',
  boxSizing: 'border-box',
  transition: 'border-color 0.2s',
};

const labelBase = {
  display: 'block',
  fontSize: '11px',
  fontWeight: 600,
  color: 'rgba(255,255,255,0.50)',
  marginBottom: '6px',
  letterSpacing: '0.3px',
  fontFamily: '"Segoe UI", system-ui, sans-serif',
};

function Field({ label, children }) {
  return (
    <div style={{ marginBottom: '14px' }}>
      {label && <label style={labelBase}>{label}</label>}
      {children}
    </div>
  );
}

function Input({ label, ...props }) {
  const [focused, setFocused] = useState(false);
  return (
    <Field label={label}>
      <input
        {...props}
        style={{
          ...inputBase,
          borderColor: focused ? 'rgba(96,165,250,0.5)' : 'rgba(255,255,255,0.10)',
          ...(props.style || {}),
        }}
        onFocus={e => { setFocused(true); props.onFocus?.(e); }}
        onBlur={e => { setFocused(false); props.onBlur?.(e); }}
      />
    </Field>
  );
}

function PrimaryBtn({ children, disabled, ...props }) {
  return (
    <button
      {...props}
      disabled={disabled}
      style={{
        width: '100%', padding: '13px',
        background: disabled ? 'rgba(59,130,246,0.5)' : '#3b82f6',
        border: 'none', borderRadius: '10px',
        color: 'white', fontSize: '13px', fontWeight: 700,
        cursor: disabled ? 'not-allowed' : 'pointer',
        fontFamily: '"Segoe UI", system-ui, sans-serif',
        transition: 'background 0.15s',
      }}
    >{children}</button>
  );
}

const STEP_LABELS = ['Verify contact', 'Your details', 'Clinical info', 'Centre details'];

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
  });

  const [step,          setStep]         = useState(1);
  const [isOtpSent,     setIsOtpSent]    = useState(false);
  const [countdown,     setCountdown]    = useState(0);
  const [error,         setError]        = useState('');
  const [loading,       setLoading]      = useState(false);
  const [showPassword,  setShowPassword] = useState(false);
  const [errorCode,     setErrorCode]    = useState(null);
  const [timerId,       setTimerId]      = useState(null);

  const set = (key, val) => setFormData(p => ({ ...p, [key]: val }));

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
      else { setStep(2); }
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
      setStep(formData.role === 'admindoctor' ? 3 : 4); return;
    }
    if (step === 3) {
      if (!formData.specialization || !formData.licenseNo || !formData.degree)
        return setError('Please complete all clinical credential fields.');
      setStep(4); return;
    }
    if (step === 4) {
      if (!formData.centerName || !formData.centerAddress)
        return setError('Centre name and address are required.');
      if (!validateGSTIN(formData.gstinNumber))
        return setError('Invalid GSTIN format. Expected: 22AAAAA0000A1Z5');
      if (!validatePAN(formData.panNumber))
        return setError('Invalid PAN format. Expected: ABCDE1234F');
      setLoading(true);
      const res = await registerAdminDoctor({
        fullName: formData.name, email: formData.email, mobile: formData.mobile,
        password: formData.password, centerName: formData.centerName,
        centerAddress: formData.centerAddress, gstinNumber: formData.gstinNumber,
        registrationNumber: formData.registrationNumber, panNumber: formData.panNumber,
        nabhNumber: formData.nabhNumber, specialization: formData.specialization,
        degree: formData.degree, licenseNo: formData.licenseNo,
      });
      setLoading(false);
      if (res.success) navigate('/login', { state: { message: 'Account created! Please sign in.' } });
      else { setError(res.error); setErrorCode(res.errorCode); }
    }
  };

  // ── Progress dots ──────────────────────────────────────────────────────────
  const StepDots = () => (
    <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', marginBottom: '18px' }}>
      {[1, 2, 3, 4].map(n => (
        <div key={n} style={{
          height: '5px', width: step >= n ? '24px' : '16px',
          borderRadius: '3px',
          background: step >= n ? '#3b82f6' : 'rgba(255,255,255,0.12)',
          transition: 'all 0.25s',
        }} />
      ))}
    </div>
  );

  return (
    <div className="auth-immersive-container">
      <RadiologyWorkflowBG />

      {/* ── Left panel ── */}
      <div className="immersive-brand">
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
          <img
            src="/Logo.png"
            alt="NexEagle"
            style={{ width: '40px', height: '40px', objectFit: 'contain', borderRadius: '8px' }}
          />
          <div>
            <div style={{ fontSize: '22px', fontWeight: 700, color: 'white', letterSpacing: '-0.3px', lineHeight: 1.2 }}>
              NexEagle
            </div>
            <div style={{ fontSize: '11px', fontWeight: 600, color: '#60a5fa', letterSpacing: '0.3px' }}>
              1Rad
            </div>
          </div>
        </div>
        <div className="immersive-tagline" style={{ color: 'rgba(255,255,255,0.55)', fontSize: '13px', marginTop: '4px' }}>
          Radiology management platform
        </div>

        {/* Steps overview */}
        <div style={{ marginTop: '32px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {STEP_LABELS.map((label, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{
                width: '22px', height: '22px', borderRadius: '50%', flexShrink: 0,
                background: step > i + 1 ? '#3b82f6' : step === i + 1 ? 'rgba(59,130,246,0.3)' : 'rgba(255,255,255,0.08)',
                border: step === i + 1 ? '2px solid #3b82f6' : '2px solid transparent',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '10px', fontWeight: 700, color: step > i + 1 ? 'white' : step === i + 1 ? '#60a5fa' : 'rgba(255,255,255,0.3)',
              }}>
                {step > i + 1 ? '✓' : i + 1}
              </div>
              <span style={{
                fontSize: '13px', fontWeight: step === i + 1 ? 600 : 400,
                color: step === i + 1 ? 'rgba(255,255,255,0.90)' : 'rgba(255,255,255,0.35)',
                fontFamily: '"Segoe UI", sans-serif',
              }}>{label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Form card ── */}
      <div className="glass-card" style={{ maxWidth: '540px' }}>
        <StepDots />

        <div style={{ textAlign: 'center', marginBottom: '24px' }}>
          <h2 style={{ fontSize: '20px', fontWeight: 700, color: 'white', margin: '0 0 4px', fontFamily: '"Segoe UI", sans-serif' }}>
            {step === 1 ? 'Create your account' :
             step === 2 ? 'Your details' :
             step === 3 ? 'Clinical information' : 'Centre details'}
          </h2>
          <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.45)', margin: 0, fontFamily: '"Segoe UI", sans-serif' }}>
            Step {step} of {formData.role === 'admindoctor' ? 4 : 3} — {STEP_LABELS[step - 1]}
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
                    <label style={labelBase}>Verification code</label>
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
                    value={formData.otp}
                    onChange={e => set('otp', e.target.value)}
                    placeholder="6-digit code"
                    style={{ ...inputBase, textAlign: 'center', letterSpacing: '10px', fontSize: '20px', fontWeight: 700 }}
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
                  <label style={labelBase}>Password</label>
                  <div style={{ position: 'relative' }}>
                    <input
                      type={showPassword ? 'text' : 'password'} required
                      value={formData.password}
                      onChange={e => set('password', e.target.value)}
                      placeholder="Min. 6 characters"
                      style={{ ...inputBase, paddingRight: '40px' }}
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
              <div style={{ background: 'rgba(59,130,246,0.06)', border: '1px solid rgba(59,130,246,0.15)', borderRadius: '12px', padding: '20px', marginBottom: '16px' }}>
                <p style={{ fontSize: '11px', fontWeight: 700, color: '#60a5fa', marginBottom: '14px', textTransform: 'uppercase', letterSpacing: '0.6px', fontFamily: '"Segoe UI", sans-serif' }}>Clinical credentials</p>
                <Input label="Primary specialization" type="text" required value={formData.specialization} onChange={e => set('specialization', e.target.value)} placeholder="e.g. Neuroradiologist" />
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <Input label="Medical reg. no." type="text" required value={formData.licenseNo} onChange={e => set('licenseNo', e.target.value)} placeholder="Reg-894-0" />
                  <Input label="Degree" type="text" required value={formData.degree} onChange={e => set('degree', e.target.value)} placeholder="MBBS, MD" />
                </div>
              </div>

              <div style={{ display: 'flex', gap: '10px' }}>
                <button type="button" onClick={() => setStep(2)} style={{ flex: 1, padding: '12px', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '10px', background: 'transparent', color: 'rgba(255,255,255,0.60)', cursor: 'pointer', fontSize: '13px', fontFamily: '"Segoe UI", sans-serif' }}>
                  Back
                </button>
                <div style={{ flex: 2 }}><PrimaryBtn type="submit">Continue</PrimaryBtn></div>
              </div>
            </div>
          )}

          {/* ── Step 4: Centre ── */}
          {step === 4 && (
            <div>
              <Input label="Centre name" type="text" required value={formData.centerName} onChange={e => set('centerName', e.target.value)} placeholder="e.g. City Diagnostic Centre" />
              <Input label="Group / chain (optional)" type="text" value={formData.chainName} onChange={e => set('chainName', e.target.value)} placeholder="e.g. Apollo Group" />

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div style={{ marginBottom: '14px' }}>
                  <label style={labelBase}>GSTIN <span style={{ opacity: 0.5, fontWeight: 400 }}>(optional)</span></label>
                  <div style={{ position: 'relative' }}>
                    <input
                      type="text" value={formData.gstinNumber} maxLength={15}
                      onChange={e => set('gstinNumber', e.target.value.toUpperCase())}
                      placeholder="22AAAAA0000A1Z5"
                      style={{
                        ...inputBase, textTransform: 'uppercase',
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
                  <label style={labelBase}>PAN <span style={{ opacity: 0.5, fontWeight: 400 }}>(optional)</span></label>
                  <div style={{ position: 'relative' }}>
                    <input
                      type="text" value={formData.panNumber} maxLength={10}
                      onChange={e => set('panNumber', e.target.value.toUpperCase())}
                      placeholder="ABCDE1234F"
                      style={{
                        ...inputBase, textTransform: 'uppercase',
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
                  value={formData.centerAddress}
                  onChange={e => set('centerAddress', e.target.value)}
                  placeholder="Full physical address of the facility"
                  style={{ ...inputBase, resize: 'none', lineHeight: '1.6' }}
                  onFocus={e => { e.target.style.borderColor = 'rgba(96,165,250,0.5)'; }}
                  onBlur={e => { e.target.style.borderColor = 'rgba(255,255,255,0.10)'; }}
                />
              </Field>

              <div style={{ display: 'flex', gap: '10px' }}>
                <button type="button" onClick={() => setStep(formData.role === 'admindoctor' ? 3 : 2)} style={{ flex: 1, padding: '12px', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '10px', background: 'transparent', color: 'rgba(255,255,255,0.60)', cursor: 'pointer', fontSize: '13px', fontFamily: '"Segoe UI", sans-serif' }}>
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
  );
}
