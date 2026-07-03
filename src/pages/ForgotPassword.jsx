import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import useAuth from '../auth/useAuth';
import RadiologyWorkflowBG from '../components/RadiologyWorkflowBG';
import '../styles/global.css';

export default function ForgotPassword() {
  const { forgotPassword, verifyResetCode, resetPassword } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState(1); // 1: Identify, 2: Verification, 3: Reset
  const [identifier, setIdentifier] = useState('');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [showSuccess, setShowSuccess] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [timerId, setTimerId] = useState(null);

  const isEmailIdentifier = identifier.includes('@');
  const maskedDestination = (() => {
    if (!identifier) return '';
    if (isEmailIdentifier) {
      const [name, domain] = identifier.split('@');
      const masked = name.length <= 2 ? name[0] + '*' : name[0] + '***' + name.slice(-1);
      return `${masked}@${domain}`;
    }
    const digits = identifier.replace(/\D/g, '');
    if (digits.length < 4) return digits;
    return digits.slice(0, 2) + '****' + digits.slice(-2);
  })();

  const startCountdown = () => {
    if (timerId) clearInterval(timerId);
    setCountdown(30);
    const id = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          clearInterval(id);
          setTimerId(null);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    setTimerId(id);
  };

  useEffect(() => {
    return () => {
      if (timerId) clearInterval(timerId);
    };
  }, [timerId]);

  const handleIdentify = async (e) => {
    e.preventDefault();
    if (!identifier) return setError('Please enter your email or mobile number.');
    setLoading(true);
    setError(null);
    const result = await forgotPassword(identifier);
    setLoading(false);
    if (result.success) {
      setStep(2);
      startCountdown();
    } else {
      setError(result.error);
    }
  };

  const handleVerify = async (e) => {
    e.preventDefault();
    if (!code) return setError('Please enter the verification code.');
    setLoading(true);
    setError(null);
    const result = await verifyResetCode(identifier, code);
    setLoading(false);
    if (result.success) {
      setStep(3);
    } else {
      setError(result.error);
    }
  };

  const handleReset = async (e) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) return setError('Passwords do not match.');
    setLoading(true);
    setError(null);
    const result = await resetPassword(newPassword);
    setLoading(false);
    if (result.success) {
      setShowSuccess(true);
    } else {
      setError(result.error || 'Password reset failed.');
    }
  };

  return (
    <div className="auth-immersive-container">
      <RadiologyWorkflowBG />
      
      <div className="immersive-brand">
        {/* Brand Top */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '6px' }}>
          <img src={`${import.meta.env.BASE_URL}Logo.png`} alt="NexEagle" style={{
            width: '40px', height: '40px', objectFit: 'contain',
          }} />
          <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.15 }}>
            <span style={{ fontSize: '26px', fontWeight: 900, color: '#0f172a', letterSpacing: '-0.5px' }}>NexEagle</span>
            <span style={{ fontSize: '11px', fontWeight: 700, color: '#2563eb', letterSpacing: '3px' }}>1RAD</span>
          </div>
        </div>
        <div style={{ fontSize: '10px', fontWeight: 800, color: 'rgba(15,23,42,0.65)', letterSpacing: '3.5px', textTransform: 'uppercase', marginBottom: '0' }}>
          Account Recovery
        </div>

        {/* Informational Hero */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', paddingTop: '8px', paddingBottom: '24px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div style={{ position: 'relative', paddingLeft: '18px' }}>
              <div style={{
                position: 'absolute', left: 0, top: '4px', bottom: '4px',
                width: '3px', borderRadius: '2px',
                background: 'linear-gradient(to bottom, #2563eb, rgba(37,99,235,0.2))',
              }} />
              <p style={{
                fontSize: '16px', fontWeight: 500,
                color: 'rgba(15,23,42,0.95)', lineHeight: 1.7,
                margin: 0,
              }}>
                Securely recover access to your account and get back to managing your radiology workflow.
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="glass-card">
        <div className="auth-header" style={{ textAlign: 'center', marginBottom: '30px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <img
            src={`${import.meta.env.BASE_URL}Logo.png`}
            alt="NexEagle"
            style={{ width: '40px', height: '40px', objectFit: 'contain', marginBottom: '16px' }}
          />
          <h2 className="auth-title" style={{ color: '#0f172a', fontSize: '24px', fontWeight: 900 }}>Reset Password</h2>
          <p className="auth-subtitle" style={{ color: 'rgba(15,23,42,0.75)', fontSize: '13px', fontWeight: 500 }}>
            {step === 1 ? "Enter your details to receive a code" : step === 2 ? "Verify your identity" : "Create a new password"}
          </p>
        </div>

        {step === 1 && (
          <form onSubmit={handleIdentify} className="auth-form animate-in">
            <div className="form-group" style={{ marginBottom: '16px' }}>
              <label className="premium-label-light">Email or Mobile Number</label>
              <input
                type="text"
                className="premium-input-light"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                placeholder="e.g. admin@1rad.com"
                required
              />
            </div>
            {error && (
              <div style={{ marginBottom: '16px', padding: '10px 12px', background: 'rgba(220, 38, 38, 0.1)', border: '1px solid rgba(220, 38, 38, 0.2)', borderRadius: '8px', color: '#dc2626', fontSize: '12px', fontWeight: 600 }}>
                {error}
              </div>
            )}
            <button type="submit" className="premium-btn-light" disabled={loading} style={{ marginTop: '10px' }}>
              {loading ? 'Sending...' : 'Send Verification Code'}
            </button>
          </form>
        )}

        {step === 2 && (
          <form onSubmit={handleVerify} className="auth-form animate-in">
            <div className="form-group" style={{ marginBottom: '16px' }}>
              <label className="premium-label-light">Verification Code</label>
              <input
                type="text"
                className="premium-input-light"
                maxLength="6"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="0 0 0 0 0 0"
                style={{ letterSpacing: '8px', textAlign: 'center', fontWeight: 900, fontSize: '18px' }}
                required
              />
              <p style={{ fontSize: '11px', color: 'rgba(15,23,42,0.75)', marginTop: '12px', textAlign: 'center', fontWeight: 500 }}>
                Code sent to your {isEmailIdentifier ? 'email' : 'mobile'}
                {maskedDestination && (
                  <> &mdash; <strong style={{ color: '#0f172a' }}>{maskedDestination}</strong></>
                )}
                .{' '}
                {countdown > 0 ? (
                  <span style={{ color: '#2563eb', fontWeight: 700 }}>Resend in 0:{countdown < 10 ? `0${countdown}` : countdown}</span>
                ) : (
                  <button type="button" onClick={handleIdentify} style={{ background: 'none', border: 'none', color: '#2563eb', cursor: 'pointer', padding: 0, fontWeight: 700, fontSize: '11px', textDecoration: 'underline' }}>Resend now</button>
                )}
              </p>
            </div>
            {error && (
              <div style={{ marginBottom: '16px', padding: '10px 12px', background: 'rgba(220, 38, 38, 0.1)', border: '1px solid rgba(220, 38, 38, 0.2)', borderRadius: '8px', color: '#dc2626', fontSize: '12px', fontWeight: 600 }}>
                {error}
              </div>
            )}
            <button type="submit" className="premium-btn-light" disabled={loading}>
              {loading ? 'Verifying...' : 'Verify Code'}
            </button>
            <div style={{ textAlign: 'center', marginTop: '16px' }}>
              <button type="button" onClick={() => setStep(1)} style={{ color: '#2563eb', background: 'none', border: 'none', cursor: 'pointer', fontSize: '11px', fontWeight: 700 }}>
                Use a different email/mobile
              </button>
            </div>
          </form>
        )}

        {step === 3 && (
          <form onSubmit={handleReset} className="auth-form animate-in">
            <div className="form-group" style={{ marginBottom: '16px' }}>
              <label className="premium-label-light">New Password</label>
              <input
                type="password"
                className="premium-input-light"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="••••••••"
                required
              />
            </div>
            <div className="form-group" style={{ marginBottom: '16px' }}>
              <label className="premium-label-light">Confirm New Password</label>
              <input
                type="password"
                className="premium-input-light"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                required
              />
            </div>
            {error && (
              <div style={{ marginBottom: '16px', padding: '10px 12px', background: 'rgba(220, 38, 38, 0.1)', border: '1px solid rgba(220, 38, 38, 0.2)', borderRadius: '8px', color: '#dc2626', fontSize: '12px', fontWeight: 600 }}>
                {error}
              </div>
            )}
            <button type="submit" className="premium-btn-light" disabled={loading} style={{ marginTop: '10px' }}>
              {loading ? 'Updating...' : 'Update Password'}
            </button>
          </form>
        )}

        <div style={{ marginTop: '24px', textAlign: 'center', borderTop: '1px solid rgba(15,23,42,0.1)', paddingTop: '16px' }}>
          <Link to="/login" style={{ color: '#2563eb', textDecoration: 'none', fontSize: '12px', fontWeight: 700 }}>
            Return to Sign In
          </Link>
        </div>
      </div>

      {showSuccess && (
        <div className="success-overlay animate-in" style={{
          position: 'fixed', inset: 0,
          background: 'rgba(15,23,42,0.85)',
          backdropFilter: 'blur(10px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 1000,
        }}>
          <div style={{
            textAlign: 'center', padding: '40px', maxWidth: '400px', width: '90%',
            background: '#ffffff', borderRadius: '24px',
            boxShadow: '0 20px 40px rgba(0, 0, 0, 0.2)'
          }}>
            <div style={{
              width: '64px', height: '64px', borderRadius: '50%',
              background: 'rgba(37,99,235,0.1)', display: 'flex',
              alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 20px', color: '#2563eb'
            }}>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                <polyline points="22 4 12 14.01 9 11.01"></polyline>
              </svg>
            </div>
            <h2 style={{ color: '#0f172a', fontWeight: 900, fontSize: '20px', marginBottom: '10px' }}>Password Updated</h2>
            <p style={{ color: 'rgba(15,23,42,0.7)', fontSize: '14px', lineHeight: 1.6, marginBottom: '30px' }}>
              Your password has been successfully reset. You can now sign in using your new credentials.
            </p>
            <button 
              onClick={() => navigate('/login')}
              className="premium-btn-light"
            >
              Go to Sign In
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
