import { useState, useEffect } from 'react';
import { useNavigate, useLocation, Navigate, Link } from 'react-router-dom';
import useAuth from '../auth/useAuth';
import { ROLE_HOME, ROLE_LABELS, NAV_ITEMS } from '../data/roles';
import RadiologyWorkflowBG from '../components/RadiologyWorkflowBG';
import TacticalWorkflow from '../components/TacticalWorkflow';
import '../styles/global.css';

const INDUSTRY_QUOTES = [
  {
    title: "Report delays",
    problem: "You finished the scan hours ago. The report is still sitting in a queue — the surgeon is waiting, the patient is anxious.",
    solution: "1rad's smart worklist prioritises critical cases automatically, cutting average report turnaround by up to 40%.",
  },
  {
    title: "Radiologist shortage",
    problem: "One radiologist for every 1,00,000 patients in India. The gap doesn't shrink — it just moves to the next shift.",
    solution: "Teleradiology tools on 1rad connect Tier 2 & 3 hospitals to qualified radiologists anywhere in India, 24/7.",
  },
  {
    title: "Burnout & overload",
    problem: "100 scans before noon. You're reading fast, but you know speed and accuracy are at war with each other.",
    solution: "AI-assisted pre-reads flag abnormalities first so you review what matters, not everything.",
  },
  {
    title: "Integration chaos",
    problem: "Three systems, two logins, one missing image. Every workaround you build today becomes tomorrow's bottleneck.",
    solution: "1rad unifies RIS, PACS, and reporting in one platform — no toggling, no lost studies.",
  },
  {
    title: "Tier 2/3 access gap",
    problem: "In smaller cities, patients wait days for a specialist read that a metro hospital gets in 2 hours.",
    solution: "Cloud-based remote reporting on 1rad brings specialist reads to any district hospital within the hour.",
  },
  {
    title: "Career & earnings",
    problem: "You trained for years, but your earnings don't reflect your expertise — and there's no visibility into your output.",
    solution: "1rad's RVU dashboard gives radiologists transparent productivity tracking and data to negotiate fairly.",
  },
];

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
  const [quoteIndex, setQuoteIndex] = useState(0);
  const [quoteFading, setQuoteFading] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => {
      setQuoteFading(true);
      setTimeout(() => {
        setQuoteIndex(prev => (prev + 1) % INDUSTRY_QUOTES.length);
        setQuoteFading(false);
      }, 400);
    }, 6000);
    return () => clearInterval(interval);
  }, []);

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

  const resolveRedirectPath = (userRoles) => {
    const rolesList = userRoles || [];
    const home = ROLE_HOME[rolesList[0]] || '/';
    if (from === '/') return home;
    
    // Check if the user is allowed to access the 'from' path
    const matchingNavItem = NAV_ITEMS.find(item => from.startsWith(item.route));
    if (matchingNavItem) {
      const isAllowed = matchingNavItem.allowedRoles.some(role => rolesList.includes(role));
      if (!isAllowed) return home;
    } else {
      // Safe fallback for custom routes/endpoints (e.g. admin actions)
      const isAdminRoute = from.startsWith('/admin-board') || from.startsWith('/subscription') || from.startsWith('/dicom-bridge');
      const hasAdminRole = rolesList.includes('admin') || rolesList.includes('admindoctor');
      if (isAdminRoute && !hasAdminRole) {
        return home;
      }
    }
    return from;
  };

  const handleLogin = async (id, pwd) => {
    setLoading(true);
    setErrorCode(null);
    setAccountStatus(null);
    const result = await login(id, pwd);
    setLoading(false);
    if (result.success) {
      const targetPath = resolveRedirectPath(result.user?.roles);
      navigate(targetPath, { replace: true });
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
        const targetPath = resolveRedirectPath(result.user?.roles);
        navigate(targetPath, { replace: true });
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
        {/* ── Brand — top ── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '6px' }}>
          <img src="/Logo.png" alt="NexEagle" style={{
            width: '40px', height: '40px', objectFit: 'contain',
            borderRadius: '10px', boxShadow: '0 8px 24px rgba(0,242,254,0.3)',
          }} />
          <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.15 }}>
            <span style={{ fontSize: '26px', fontWeight: 900, color: '#fff', letterSpacing: '-0.5px' }}>NexEagle</span>
            <span style={{ fontSize: '11px', fontWeight: 700, color: '#00f2fe', letterSpacing: '3px' }}>1RAD</span>
          </div>
        </div>
        <div style={{ fontSize: '9px', fontWeight: 700, color: 'rgba(255,255,255,0.25)', letterSpacing: '3.5px', textTransform: 'uppercase', marginBottom: '0' }}>
          Radiology Management System
        </div>

        {/* ── Hero Quote — takes all available centre space ── */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', paddingTop: '8px', paddingBottom: '24px' }}>

          {/* Clickable quote card */}
          <div
            onClick={() => {
              setQuoteFading(true);
              setTimeout(() => {
                setQuoteIndex(prev => (prev + 1) % INDUSTRY_QUOTES.length);
                setQuoteFading(false);
              }, 350);
            }}
            style={{
              transition: 'opacity 0.35s ease',
              opacity: quoteFading ? 0 : 1,
              cursor: 'pointer',
              userSelect: 'none',
              display: 'flex',
              flexDirection: 'column',
              gap: '20px',
            }}
          >
            {/* Category chip + next hint */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{
                  width: '4px', height: '4px', borderRadius: '50%',
                  background: '#00f2fe', boxShadow: '0 0 6px #00f2fe',
                }} />
                <span style={{
                  fontSize: '9px', fontWeight: 800, letterSpacing: '2.5px',
                  textTransform: 'uppercase', color: '#00f2fe', opacity: 0.8,
                }}>
                  {INDUSTRY_QUOTES[quoteIndex].title}
                </span>
              </div>
              <span style={{ fontSize: '9px', color: 'rgba(0,242,254,0.35)', letterSpacing: '1px', display: 'flex', alignItems: 'center', gap: '2px' }}>
                tap for next <span style={{ fontSize: '13px' }}>›</span>
              </span>
            </div>

            {/* Big decorative quote */}
            <div style={{ position: 'relative', paddingLeft: '18px' }}>
              {/* Large " mark */}
              <span style={{
                position: 'absolute', top: '-18px', left: '-4px',
                fontSize: '72px', fontFamily: 'Georgia, serif',
                color: 'rgba(0,242,254,0.12)', lineHeight: 1,
                userSelect: 'none', pointerEvents: 'none',
              }}>&ldquo;</span>

              {/* Left accent line */}
              <div style={{
                position: 'absolute', left: 0, top: '4px', bottom: '4px',
                width: '2px', borderRadius: '2px',
                background: 'linear-gradient(to bottom, #00f2fe, rgba(0,242,254,0.1))',
              }} />

              <p style={{
                fontSize: '15px', fontStyle: 'italic', fontWeight: 400,
                color: 'rgba(255,255,255,0.82)', lineHeight: 1.7,
                margin: 0,
              }}>
                {INDUSTRY_QUOTES[quoteIndex].problem}
              </p>
            </div>

            {/* Solution — highlighted box */}
            <div style={{
              background: 'rgba(0,242,254,0.06)',
              border: '1px solid rgba(0,242,254,0.15)',
              borderRadius: '10px',
              padding: '14px 16px',
              display: 'flex',
              gap: '10px',
              alignItems: 'flex-start',
            }}>
              <span style={{ color: '#00f2fe', fontSize: '15px', lineHeight: 1.4, flexShrink: 0, marginTop: '1px' }}>✦</span>
              <p style={{
                fontSize: '12px', color: 'rgba(255,255,255,0.7)',
                lineHeight: 1.65, margin: 0, fontWeight: 400,
              }}>
                {INDUSTRY_QUOTES[quoteIndex].solution}
              </p>
            </div>

            {/* Progress dots */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              {INDUSTRY_QUOTES.map((_, i) => (
                <div
                  key={i}
                  onClick={(e) => {
                    e.stopPropagation();
                    setQuoteFading(true);
                    setTimeout(() => { setQuoteIndex(i); setQuoteFading(false); }, 300);
                  }}
                  style={{
                    width: i === quoteIndex ? '22px' : '5px',
                    height: '4px', borderRadius: '2px',
                    background: i === quoteIndex ? '#00f2fe' : 'rgba(0,242,254,0.18)',
                    transition: 'all 0.4s ease', cursor: 'pointer',
                    boxShadow: i === quoteIndex ? '0 0 8px rgba(0,242,254,0.5)' : 'none',
                  }}
                />
              ))}
              <span style={{ marginLeft: 'auto', fontSize: '9px', color: 'rgba(255,255,255,0.2)', fontVariantNumeric: 'tabular-nums' }}>
                {quoteIndex + 1} / {INDUSTRY_QUOTES.length}
              </span>
            </div>
          </div>
        </div>
        {/* end hero wrapper */}

        {/* ── Pipeline strip — ambient footer ── */}
        <div style={{
          borderTop: '1px solid rgba(255,255,255,0.05)',
          paddingTop: '16px',
        }}>
          <TacticalWorkflow />
        </div>
      </div>
      {/* end immersive-brand */}

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
