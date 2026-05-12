import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import useAuth from '../auth/useAuth';
import RadiologyWorkflowBG from '../components/RadiologyWorkflowBG';
import TacticalWorkflow from '../components/TacticalWorkflow';
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
    if (!identifier) return setError('Please enter your identity code');
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
    if (!code) return setError('Please enter the verification code');
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
    if (newPassword !== confirmPassword) return setError('Passwords do not match');
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
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-start', marginBottom: '5px' }}>
          <div className="immersive-logo" style={{ 
            background: 'linear-gradient(135deg, #00f2fe 0%, #0f52ba 100%)',
            boxShadow: '0 0 20px rgba(0, 242, 254, 0.4)', 
            height: '32px', width: '32px', 
            marginRight: '15px', 
            display: 'flex', 
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: '8px',
            color: 'white',
            fontWeight: 950,
            fontSize: '14px'
          }}>
            1R
          </div>
          <div className="immersive-logo-text" style={{ fontSize: '26px', fontWeight: 950, color: 'white', letterSpacing: '3px', lineHeight: 1 }}>
            1<span style={{ color: '#00f2fe' }}>RAD</span>
          </div>
        </div>
        <div className="immersive-tagline">1Rad Access Recovery</div>
        <TacticalWorkflow />
      </div>

      <div className="glass-card">
        <div className="auth-header" style={{ textAlign: 'center', marginBottom: '30px' }}>
          <h2 className="auth-title" style={{ color: '#fff', fontSize: '24px', fontWeight: 900 }}>RECOVERY GRID</h2>
          <p className="auth-subtitle" style={{ color: 'rgba(255,255,255,0.5)', fontSize: '11px', letterSpacing: '1px' }}>
            PHASE {step}: {step === 1 ? 'IDENTIFY AGENT' : step === 2 ? 'SECURITY DECRYPT' : 'RESTORE ACCESS KEY'}
          </p>
        </div>

        {step === 1 && (
          <form onSubmit={handleIdentify} className="auth-form animate-in">
            <div className="form-group">
              <label>REGISTERED IDENT (EMAIL/MOBILE)</label>
              <input
                type="text"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                placeholder="e.g. admin@1rad.com"
                required
              />
            </div>
            {error && <div className="error-message" style={{ background: 'rgba(231, 76, 60, 0.1)', color: '#e74c3c' }}>{error}</div>}
            <button type="submit" className="btn-primary btn-block gamified-btn" disabled={loading} style={{ marginTop: '10px' }}>
              {loading ? 'ANALYZING...' : 'INITIALIZE RECOVERY'}
            </button>
          </form>
        )}

        {step === 2 && (
          <form onSubmit={handleVerify} className="auth-form animate-in">
            <div className="form-group">
              <label>DECRYPTION CODE</label>
              <input
                type="text"
                maxLength="6"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="0 0 0 0 0 0"
                style={{ letterSpacing: '8px', textAlign: 'center', fontWeight: 900, fontSize: '18px' }}
                required
              />
              <p style={{ fontSize: '10px', color: 'rgba(255,255,255,0.4)', marginTop: '12px', textAlign: 'center' }}>
                A TEMPORARY CODE HAS BEEN BEAMED TO YOUR DEVICE.{' '}
                {countdown > 0 ? (
                  <span style={{ color: '#00f2fe', fontWeight: 800 }}>RESEND IN 0:{countdown < 10 ? `0${countdown}` : countdown}</span>
                ) : (
                  <button type="button" onClick={handleIdentify} style={{ background: 'none', border: 'none', color: '#00f2fe', cursor: 'pointer', padding: 0, fontWeight: 800, fontSize: '10px', textDecoration: 'underline' }}>RESEND NOW</button>
                )}
              </p>
            </div>
            {error && <div className="error-message" style={{ background: 'rgba(231, 76, 60, 0.1)', color: '#e74c3c' }}>{error}</div>}
            <button type="submit" className="btn-primary btn-block gamified-btn" disabled={loading}>
              {loading ? 'VERIFYING...' : 'VERIFY & CONTINUE'}
            </button>
            <button type="button" onClick={() => setStep(1)} style={{ width: '100%', marginTop: '15px', color: 'rgba(255,255,255,0.4)', background: 'none', border: 'none', cursor: 'pointer', fontSize: '11px', fontWeight: 800 }}>
              INCORRECT IDENT? RE-INITIALIZE
            </button>
          </form>
        )}

        {step === 3 && (
          <form onSubmit={handleReset} className="auth-form animate-in">
            <div className="form-group">
              <label>NEW SECURE KEY (PASSWORD)</label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="••••••••"
                required
              />
            </div>
            <div className="form-group">
              <label>VERIFY NEW KEY</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                required
              />
            </div>
            {error && <div className="error-message" style={{ background: 'rgba(231, 76, 60, 0.1)', color: '#e74c3c' }}>{error}</div>}
            <button type="submit" className="btn-primary btn-block gamified-btn" disabled={loading} style={{ marginTop: '10px' }}>
              {loading ? 'RESTORING...' : 'UPDATE SECURE KEY'}
            </button>
          </form>
        )}

        <div className="neon-divider"></div>

        <div className="auth-footer" style={{ textAlign: 'center' }}>
          <Link to="/login" style={{ color: '#00f2fe', textDecoration: 'none', fontSize: '13px', fontWeight: 800, borderBottom: '1px solid #00f2fe' }}>
            RETURN TO COMMAND PORTAL
          </Link>
        </div>
      </div>

      {showSuccess && (
        <div className="success-overlay animate-in" style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(11, 17, 32, 0.95)',
          backdropFilter: 'blur(10px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          animation: 'fade-in 0.5s ease-out'
        }}>
          <div className="success-card glass-card" style={{
            textAlign: 'center',
            padding: '40px',
            maxWidth: '400px',
            border: '1px solid rgba(0, 242, 254, 0.3)',
            boxShadow: '0 0 30px rgba(0, 242, 254, 0.2)'
          }}>
            <div className="success-icon" style={{
              width: '80px',
              height: '80px',
              borderRadius: '50%',
              background: 'rgba(0, 242, 254, 0.1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 20px',
              border: '2px solid #00f2fe',
              boxShadow: '0 0 20px rgba(0, 242, 254, 0.3)'
            }}>
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#00f2fe" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                <polyline points="22 4 12 14.01 9 11.01"></polyline>
              </svg>
            </div>
            <h2 style={{ color: 'white', fontWeight: 950, letterSpacing: '2px', marginBottom: '10px' }}>ACCESS RESTORED</h2>
            <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: '14px', lineHeight: 1.6, marginBottom: '30px' }}>
              Your secure access keys have been updated. You can now login with your new credentials.
            </p>
            <button 
              onClick={() => navigate('/login')}
              className="btn-primary btn-block gamified-btn"
              style={{ padding: '15px' }}
            >
              PROCEED TO COMMAND PORTAL
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
