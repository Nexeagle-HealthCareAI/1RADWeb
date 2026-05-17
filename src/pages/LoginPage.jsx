import { useState, useEffect } from 'react';
import { useNavigate, useLocation, Navigate, Link } from 'react-router-dom';
import useAuth from '../auth/useAuth';
import { ROLE_HOME, ROLE_LABELS } from '../data/roles';
import RadiologyWorkflowBG from '../components/RadiologyWorkflowBG';
import TacticalWorkflow from '../components/TacticalWorkflow';
import '../styles/global.css';

export default function LoginPage() {
  const { login, hasAdminDoctor, sendOtp, verifyOtp, currentUser } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = location.state?.from?.pathname || '/';

  // If no AdminDoctor exists, redirect to register immediately
  // Temporarily disabled for development - you can always access login
  // if (!hasAdminDoctor) {
  //   return <Navigate to="/register" replace />;
  // }

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [otp, setOtp] = useState('');
  const [loginMode, setLoginMode] = useState('password'); // 'password' or 'otp'
  const [otpStep, setOtpStep] = useState('request'); // 'request' or 'verify'
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [timerId, setTimerId] = useState(null);
  const [errorCode, setErrorCode] = useState(null);
  const [accountStatus, setAccountStatus] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);

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
  
  useEffect(() => {
    if (location.state?.message) {
      setSuccessMessage(location.state.message);
      // Optional: Clear state after showing
      window.history.replaceState({}, document.title);
    }
  }, [location.state]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    if (loginMode === 'password') {
      await handleLogin(identifier, password);
    } else if (otpStep === 'request') {
      await handleRequestOtp();
    } else {
      await handleVerifyOtp();
    }
  };

  const handleLogin = async (id, pwd) => {
    setLoading(true);
    setErrorCode(null);
    setAccountStatus(null);
    const result = await login(id, pwd);
    setLoading(false);
    if (result.success) {
      const home = ROLE_HOME[result.user.roles?.[0]] || '/';
      navigate(from === '/' ? home : from, { replace: true });
    } else {
      setError(result.error);
      setErrorCode(result.errorCode);
      setAccountStatus(result.accountStatus);
    }
  };

  const handleRequestOtp = async () => {
    if (!identifier) return setError('Enter your ID (Mobile/Email) first');
    setLoading(true);
    const result = await sendOtp(identifier);
    setLoading(false);
    if (result.success) {
      setOtpStep('verify');
      setError(null);
      startCountdown();
    } else {
      setError(result.error);
    }
  };

  const handleVerifyOtp = async () => {
    setLoading(true);
    const result = await verifyOtp(identifier, otp);
    setLoading(false);
    if (result.success) {
      if (result.isRegistered) {
        const home = ROLE_HOME[currentUser?.roles?.[0]] || '/';
        navigate(from === '/' ? home : from, { replace: true });
      } else {
        // Dual-path: New user detected, route to registration
        navigate('/register', { state: { identifier, isFromLogin: true } });
      }
    } else {
      setError(result.error);
    }
  };


  return (
    <div className="auth-immersive-container">
      <RadiologyWorkflowBG />
      <div className="immersive-brand">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-start', marginBottom: '15px' }}>
          <img
            src="/Logo.png"
            alt="NexEagle"
            style={{
              width: '48px', height: '48px',
              objectFit: 'contain', flexShrink: 0, borderRadius: '12px',
              boxShadow: '0 8px 24px rgba(0, 242, 254, 0.3)'
            }}
          />
          <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.15, marginLeft: '16px' }}>
            <span style={{ fontSize: '32px', fontWeight: 900, color: '#ffffff', letterSpacing: '-0.5px' }}>NexEagle</span>
            <span style={{ fontSize: '14px', fontWeight: 700, color: '#00f2fe', letterSpacing: '2px', textTransform: 'uppercase' }}>1Rad</span>
          </div>
        </div>
        <div className="immersive-tagline">Radiology Management System</div>
        
        {/* Tactical Pipeline View */}
        <TacticalWorkflow />
      </div>

      <div className="glass-card">
        <div className="auth-header" style={{ textAlign: 'center', marginBottom: '30px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <img
            src="/Logo.png"
            alt="NexEagle"
            style={{
              width: '40px', height: '40px',
              objectFit: 'contain', borderRadius: '10px',
              marginBottom: '16px',
              boxShadow: '0 4px 16px rgba(0, 0, 0, 0.2)'
            }}
          />
          <h2 className="auth-title" style={{ color: '#fff', fontSize: '24px', fontWeight: 900 }}>Welcome Back</h2>
          <p className="auth-subtitle" style={{ color: 'rgba(255,255,255,0.5)', fontSize: '12px' }}>Sign in to your account to continue</p>
        </div>

        <div className="login-mode-toggle" style={{ display: 'flex', gap: '10px', marginBottom: '25px', padding: '4px', background: 'rgba(255,255,255,0.05)', borderRadius: '10px' }}>
          <button 
            type="button"
            onClick={() => { setLoginMode('password'); setError(null); }}
            className={`toggle-btn ${loginMode === 'password' ? 'active' : ''}`}
            style={{ 
              flex: 1, 
              padding: '12px', 
              border: 'none', 
              borderRadius: '8px', 
              cursor: 'pointer', 
              fontSize: '11px', 
              fontWeight: 800, 
              transition: 'all 0.3s', 
              background: loginMode === 'password' ? '#00f2fe' : 'transparent', 
              color: loginMode === 'password' ? '#060a12' : '#fff',
              boxShadow: loginMode === 'password' ? '0 0 15px rgba(0, 242, 254, 0.4)' : 'none'
            }}
          >
            Password
          </button>
          <button 
            type="button"
            onClick={() => { setLoginMode('otp'); setError(null); }}
            className={`toggle-btn ${loginMode === 'otp' ? 'active' : ''}`}
            style={{ 
              flex: 1, 
              padding: '12px', 
              border: 'none', 
              borderRadius: '8px', 
              cursor: 'pointer', 
              fontSize: '11px', 
              fontWeight: 800, 
              transition: 'all 0.3s', 
              background: loginMode === 'otp' ? '#00f2fe' : 'transparent', 
              color: loginMode === 'otp' ? '#060a12' : '#fff',
              boxShadow: loginMode === 'otp' ? '0 0 15px rgba(0, 242, 254, 0.4)' : 'none'
            }}
          >
            OTP / SMS Code
          </button>
        </div>

        <form onSubmit={handleSubmit} className="auth-form">
          <div className="form-group">
            <label>Email or Mobile Number</label>
            <input
              type="text"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              placeholder="e.g. admin@1rad.com"
              required
              disabled={loginMode === 'otp' && otpStep === 'verify'}
            />
          </div>
          
          {loginMode === 'password' ? (
            <div className="form-group">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <label>Password</label>
                <Link to="/forgot-password" style={{ fontSize: '10px', color: '#00f2fe', textDecoration: 'none', fontWeight: 800 }}>Forgot Password?</Link>
              </div>
              <div style={{ position: 'relative' }}>
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                />
                <button 
                  type="button" 
                  onClick={() => setShowPassword(!showPassword)}
                  style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', fontSize: '14px', padding: 0, opacity: 0.6 }}
                >
                  {showPassword ? '👁️' : '👁️‍🗨️'}
                </button>
              </div>
            </div>
          ) : (
            otpStep === 'verify' && (
              <div className="form-group animate-in">
                <label>Enter the 6-digit OTP sent to you</label>
                <input
                  type="text"
                  maxLength="6"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value)}
                  placeholder="0 0 0 0 0 0"
                  style={{ letterSpacing: '8px', textAlign: 'center', fontWeight: 900, fontSize: '18px' }}
                  required
                />
                <p style={{ fontSize: '10px', color: 'rgba(255,255,255,0.4)', marginTop: '8px', textAlign: 'center' }}>
                  Didn't receive the code? {countdown > 0 ? (
                    <span style={{ color: '#00f2fe', fontWeight: 800 }}>Resend in 0:{countdown < 10 ? `0${countdown}` : countdown}</span>
                  ) : (
                    <button type="button" onClick={handleRequestOtp} style={{ background: 'none', border: 'none', color: '#00f2fe', cursor: 'pointer', padding: 0, fontWeight: 800, fontSize: '10px', textDecoration: 'underline' }}>Resend OTP</button>
                  )}
                </p>
              </div>
            )
          )}

          {error && (
            <div className={`error-message ${errorCode === 'USER_NOT_FOUND' ? 'cta-error' : ''}`} 
                 style={{ 
                   background: errorCode === 'USER_NOT_FOUND' ? 'rgba(0, 242, 254, 0.1)' : 'rgba(231, 76, 60, 0.1)', 
                   color: errorCode === 'USER_NOT_FOUND' ? '#00f2fe' : '#e74c3c', 
                   border: errorCode === 'USER_NOT_FOUND' ? '1px solid rgba(0, 242, 254, 0.2)' : '1px solid rgba(231, 76, 60, 0.2)',
                   padding: '15px',
                   borderRadius: '8px',
                   marginBottom: '20px',
                   display: 'flex',
                   flexDirection: 'column',
                   gap: '10px'
                 }}>
              <span style={{ fontSize: '11px', fontWeight: 600 }}>{error}</span>
              
              {errorCode === 'USER_NOT_FOUND' && (
                <button 
                  type="button" 
                  onClick={() => navigate('/register', { state: { identifier, isFromLogin: true } })}
                  style={{ 
                    background: '#00f2fe', 
                    color: '#060a12', 
                    border: 'none', 
                    padding: '8px 12px', 
                    borderRadius: '4px', 
                    fontSize: '10px', 
                    fontWeight: 900, 
                    cursor: 'pointer',
                    alignSelf: 'flex-start',
                    boxShadow: '0 0 10px rgba(0, 242, 254, 0.3)'
                  }}
                >
                  Register as a New Centre
                </button>
              )}

              {errorCode === 'ACCOUNT_INACTIVE' && (
                <p style={{ fontSize: '10px', opacity: 0.8, margin: 0 }}>
                  Account Status: <span style={{ fontWeight: 800, color: '#00f2fe' }}>{accountStatus?.toUpperCase()}</span>. 
                  Please wait for your account to be verified by the administrator.
                </p>
              )}
            </div>
          )}

          {successMessage && (
            <div className="success-message animate-in" 
                 style={{ 
                   background: 'rgba(40, 167, 69, 0.1)', 
                   color: '#28a745', 
                   border: '1px solid rgba(40, 167, 69, 0.2)',
                   padding: '15px',
                   borderRadius: '8px',
                   marginBottom: '20px',
                   display: 'flex',
                   alignItems: 'center',
                   gap: '10px'
                 }}>
              <span style={{ fontSize: '18px' }}>✓</span>
              <span style={{ fontSize: '11px', fontWeight: 600 }}>{successMessage}</span>
            </div>
          )}

          <button type="submit" className="btn-primary btn-block gamified-btn" disabled={loading} style={{ marginTop: '10px' }}>
            {loading ? 'Signing In...' : (
              loginMode === 'password' ? 'Sign In' : 
              (otpStep === 'request' ? 'Send OTP' : 'Verify & Sign In')
            )}
          </button>
        </form>

        <div className="neon-divider"></div>
        
        <div className="auth-footer" style={{ textAlign: 'center' }}>
           <p style={{ fontSize: '13px', fontWeight: 600, color: 'rgba(255,255,255,0.7)' }}>
              New centre? <Link to="/register" style={{ color: '#00f2fe', textDecoration: 'none', borderBottom: '1px solid #00f2fe' }}>Register here</Link>
           </p>
        </div>
      </div>
    </div>
  );
}
