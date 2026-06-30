import { useState, useEffect } from 'react';
import { useNavigate, useLocation, Navigate, Link } from 'react-router-dom';
import useAuth from '../auth/useAuth';
import PinSetupModal from '../auth/PinSetupModal';
import { ROLE_HOME, ROLE_LABELS, NAV_ITEMS } from '../data/roles';
import RadiologyWorkflowBG from '../components/RadiologyWorkflowBG';
import AuthErrorModal from '../components/AuthErrorModal';
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
  const { login, hasAdminDoctor, sendOtp, verifyOtp, currentUser, signInFromCache, enrollPin } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = location.state?.from?.pathname || '/';

  // Banner reason ferried in via the URL by the apiClient 401 handler when
  // the server-side session middleware revokes a token. We pull it from the
  // raw URL (rather than location.state) so a fresh tab opening this URL
  // also surfaces the banner.
  const urlReason = typeof window !== 'undefined'
    ? new URLSearchParams(window.location.search).get('reason')
    : null;
  const sessionBanner = urlReason === 'signed-out-elsewhere' ? {
    title: 'Signed out on another device',
    body: 'You were signed in on another device of the same type. The previous session here was ended. Sign in again to continue.',
  } : urlReason === 'session-upgraded' ? {
    title: 'Please sign in again',
    body: 'We upgraded the session security on this server. Sign in once to refresh your access — you won\'t need to do this again.',
  } : urlReason === 'session-expired' ? {
    title: 'Session ended',
    body: 'Your previous sign-in expired. Please sign in again to continue.',
  } : null;

  // If no AdminDoctor exists, redirect to register immediately
  // Temporarily disabled for development - you can always access login
  // if (!hasAdminDoctor) {
  //   return <Navigate to="/register" replace />;
  // }

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [otp, setOtp] = useState('');
  const [loginMode, setLoginMode] = useState('password'); // 'password' | 'otp' | 'pin'
  const [otpStep, setOtpStep] = useState('request'); // 'request' or 'verify'
  // PIN-unlock state (offline re-entry). Populated on mount from authDb.
  // pinUsers is the saved-PIN profile list; selecting one enables PIN entry.
  const [pinUsers, setPinUsers] = useState([]);          // [{userId, name, lockedUntilMs}]
  const [selectedPinUserId, setSelectedPinUserId] = useState(null);
  const [pinValue, setPinValue] = useState('');
  const [pinError, setPinError] = useState('');
  const [pinLockUntilMs, setPinLockUntilMs] = useState(0);
  const [pinLockNowTick, setPinLockNowTick] = useState(0);
  // PIN setup modal state (post-login prompt).
  const [pinSetupOpen, setPinSetupOpen] = useState(false);
  const [pinSetupUserId, setPinSetupUserId] = useState(null);
  const [pinSetupUserName, setPinSetupUserName] = useState('');
  const [postLoginRoles, setPostLoginRoles] = useState([]);
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
  // Premium error modal — surfaces login failures (wrong credentials,
  // unknown user, inactive account, OTP rejection) in a high-attention
  // overlay rather than an easy-to-miss inline band.
  const [errorModal, setErrorModal] = useState({ open: false });
  // Live connectivity — powers the "works offline" highlight on the sign-in
  // card so users are reassured the app keeps working without internet.
  const [isOnline, setIsOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine);

  useEffect(() => {
    const goOnline = () => setIsOnline(true);
    const goOffline = () => setIsOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

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

  // Detect saved-PIN profiles on this device. If any exist, default the
  // login mode to PIN entry. The user can switch to password/OTP via the
  // existing toggle row.
  useEffect(() => {
    let cancelled = false;
    import('../auth/pinAuth').then(({ listPinUsers }) => listPinUsers()).then((rows) => {
      if (cancelled) return;
      setPinUsers(rows);
      if (rows.length > 0) {
        setLoginMode('pin');
        setSelectedPinUserId(rows[0].userId);
        setPinLockUntilMs(rows[0].lockedUntilMs || 0);
      }
    }).catch(() => { /* no-op: fall back to password */ });
    return () => { cancelled = true; };
  }, []);

  // Tick every second while a lockout is active so the countdown UI updates.
  useEffect(() => {
    if (!pinLockUntilMs || pinLockUntilMs <= Date.now()) return undefined;
    const id = setInterval(() => setPinLockNowTick(t => (t + 1) | 0), 1000);
    return () => clearInterval(id);
  }, [pinLockUntilMs]);

  // PIN submit handler. Verifies via pinAuth, restores AuthContext via
  // signInFromCache on success, and surfaces lockout / wrong / expired
  // cases with the right messaging.
  const handlePinSubmit = async (e) => {
    e?.preventDefault?.();
    if (!selectedPinUserId) return;
    if (pinValue.length < 4) { setPinError('Enter your 4-digit PIN.'); return; }
    if (pinLockUntilMs > Date.now()) return; // safety; UI already disables submit
    setPinError('');
    setLoading(true);
    try {
      const { verifyPin } = await import('../auth/pinAuth');
      const r = await verifyPin(selectedPinUserId, pinValue);
      if (r.success) {
        const sr = signInFromCache(r.session);
        if (!sr.success) {
          setPinError(sr.error || 'Could not restore session.');
          return;
        }
        const target = resolveRedirectPath(sr.user?.roles);
        navigate(target, { replace: true });
        return;
      }
      if (r.reason === 'locked') {
        setPinLockUntilMs(r.lockUntilMs || 0);
        setPinError('');
      } else if (r.reason === 'wrong') {
        setPinError(`Wrong PIN. ${r.attemptsLeft} attempt${r.attemptsLeft === 1 ? '' : 's'} left.`);
      } else if (r.reason === 'removed') {
        // PIN slot wiped (lockout cap hit). Drop to password mode and
        // refresh the saved-PIN list so this user disappears from the UI.
        setPinError('Too many wrong attempts. Sign in with your password to continue.');
        setPinUsers(prev => prev.filter(u => u.userId !== selectedPinUserId));
        setSelectedPinUserId(null);
        setLoginMode('password');
      } else if (r.reason === 'session-expired') {
        setPinError('Your offline session has expired. Sign in with your password to renew.');
        setPinUsers(prev => prev.filter(u => u.userId !== selectedPinUserId));
        setSelectedPinUserId(null);
        setLoginMode('password');
      } else {
        setPinError('Could not verify PIN. Try again or use your password.');
      }
      setPinValue('');
    } finally {
      setLoading(false);
    }
  };

  const pinLockedSecondsLeft = pinLockUntilMs > Date.now()
    ? Math.max(0, Math.ceil((pinLockUntilMs - Date.now()) / 1000))
    : 0;
  // eslint-disable-next-line no-unused-vars
  const _pinTick = pinLockNowTick; // dependency for re-render during lockout

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

  // Build modal config from an auth failure. Different error codes map to
  // different copy + CTAs so the user gets a real next step instead of a
  // generic "something went wrong".
  const buildErrorModal = (result, { context }) => {
    const code = result.errorCode;
    if (code === 'USER_NOT_FOUND') {
      return {
        open: true,
        variant: 'info',
        title: 'No account for this identity',
        message: result.error || 'We could not find an account with this email or mobile.',
        identifiers: { email: identifier.includes('@') ? identifier : undefined, mobile: identifier.includes('@') ? undefined : identifier },
        primaryAction: { label: 'Register a new centre  →', onClick: () => navigate('/register', { state: { identifier, isFromLogin: true } }) },
        tertiaryAction: { label: 'Try a different email / mobile', onClick: () => setErrorModal({ open: false }) },
      };
    }
    if (code === 'ACCOUNT_INACTIVE') {
      return {
        open: true,
        variant: 'warn',
        title: 'Account awaiting verification',
        message: `Status: ${result.accountStatus?.toUpperCase() || 'PENDING'}. Please wait for an administrator to verify your account, or contact support if this is taking too long.`,
        primaryAction: { label: 'Got it', onClick: () => setErrorModal({ open: false }) },
        tertiaryAction: { label: 'Use a different account', onClick: () => setErrorModal({ open: false }) },
      };
    }
    // Generic credential failure / OTP failure / network failure.
    const isOtp = context === 'otp';
    return {
      open: true,
      variant: 'error',
      title: isOtp ? 'Verification failed' : 'Sign-in failed',
      message: result.error || (isOtp
        ? 'The code you entered did not match. Request a fresh code and try again.'
        : 'Wrong email/mobile or password. Please check and try again.'),
      primaryAction: { label: 'Try again', onClick: () => setErrorModal({ open: false }) },
      secondaryAction: !isOtp ? {
        label: 'Forgot password?',
        onClick: () => navigate('/forgot-password', { state: { identifier } }),
      } : undefined,
      tertiaryAction: { label: 'Register as a new centre', onClick: () => navigate('/register', { state: { identifier, isFromLogin: true } }) },
    };
  };

  const handleLogin = async (id, pwd) => {
    setLoading(true);
    setErrorCode(null);
    setAccountStatus(null);
    const result = await login(id, pwd);
    setLoading(false);
    if (result.success) {
      // Offer PIN setup ONCE per device per user. Skipped if the user has
      // already dismissed the prompt OR already has a PIN. Either way, the
      // post-setup navigation is the same as the legacy flow.
      try {
        const userId = result.user?.id;
        if (userId) {
          const [{ hasPin }, { isPinSetupDismissed }] = await Promise.all([
            import('../auth/pinAuth'),
            import('../auth/PinSetupModal'),
          ]);
          const [alreadyHasPin, dismissed] = await Promise.all([
            hasPin(userId),
            Promise.resolve(isPinSetupDismissed(userId)),
          ]);
          if (!alreadyHasPin && !dismissed) {
            setPostLoginRoles(result.user?.roles || []);
            setPinSetupUserId(userId);
            setPinSetupUserName(result.user?.name || '');
            setPinSetupOpen(true);
            return; // Modal handles its own navigation after enroll/skip.
          }
        }
      } catch (_) { /* fall through to navigation on any failure */ }
      const targetPath = resolveRedirectPath(result.user?.roles);
      navigate(targetPath, { replace: true });
    } else {
      setError(result.error);
      setErrorCode(result.errorCode);
      setAccountStatus(result.accountStatus);
      setErrorModal(buildErrorModal(result, { context: 'password' }));
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
      setErrorModal(buildErrorModal(result, { context: 'otp' }));
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
      setErrorModal(buildErrorModal(result, { context: 'otp' }));
    }
  };


  return (
    <div className="auth-immersive-container">
      <RadiologyWorkflowBG />
      <div className="immersive-brand">
        {/* ── Brand — top ── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '6px' }}>
          <img src={`${import.meta.env.BASE_URL}Logo.png`} alt="NexEagle" style={{
            width: '40px', height: '40px', objectFit: 'contain',
          }} />
          <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.15 }}>
            <span style={{ fontSize: '26px', fontWeight: 900, color: '#0f172a', letterSpacing: '-0.5px' }}>NexEagle</span>
            <span style={{ fontSize: '11px', fontWeight: 700, color: '#2563eb', letterSpacing: '3px' }}>1RAD</span>
          </div>
        </div>
        <div style={{ fontSize: '9px', fontWeight: 700, color: 'rgba(15,23,42,0.25)', letterSpacing: '3.5px', textTransform: 'uppercase', marginBottom: '0' }}>
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
                  background: '#2563eb', boxShadow: '0 0 6px #2563eb',
                }} />
                <span style={{
                  fontSize: '9px', fontWeight: 800, letterSpacing: '2.5px',
                  textTransform: 'uppercase', color: '#2563eb', opacity: 0.8,
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
                background: 'linear-gradient(to bottom, #2563eb, rgba(0,242,254,0.1))',
              }} />

              <p style={{
                fontSize: '15px', fontStyle: 'italic', fontWeight: 400,
                color: 'rgba(15,23,42,0.82)', lineHeight: 1.7,
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
              <span style={{ color: '#2563eb', fontSize: '15px', lineHeight: 1.4, flexShrink: 0, marginTop: '1px' }}>✦</span>
              <p style={{
                fontSize: '12px', color: 'rgba(15,23,42,0.7)',
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
                    background: i === quoteIndex ? '#2563eb' : 'rgba(0,242,254,0.18)',
                    transition: 'all 0.4s ease', cursor: 'pointer',
                    boxShadow: i === quoteIndex ? '0 0 8px rgba(0,242,254,0.5)' : 'none',
                  }}
                />
              ))}
              <span style={{ marginLeft: 'auto', fontSize: '9px', color: 'rgba(15,23,42,0.2)', fontVariantNumeric: 'tabular-nums' }}>
                {quoteIndex + 1} / {INDUSTRY_QUOTES.length}
              </span>
            </div>
          </div>
        </div>
        {/* end hero wrapper */}

      </div>
      {/* end immersive-brand */}

      <div className="glass-card">
        <div className="auth-header" style={{ textAlign: 'center', marginBottom: '30px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <img
            src={`${import.meta.env.BASE_URL}Logo.png`}
            alt="NexEagle"
            style={{
              width: '40px', height: '40px',
              objectFit: 'contain',
              marginBottom: '16px',
            }}
          />
          <h2 className="auth-title" style={{ color: '#0f172a', fontSize: '24px', fontWeight: 900 }}>Welcome Back</h2>
          <p className="auth-subtitle" style={{ color: 'rgba(15,23,42,0.5)', fontSize: '12px' }}>Sign in to your account to continue</p>
        </div>

        {/* ── Offline-ready highlight — reassures users the app keeps working
             without internet. Switches to a calm confirmation when offline. ── */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: '12px',
          padding: '11px 13px', marginBottom: '22px',
          background: isOnline ? 'rgba(0,242,254,0.06)' : 'rgba(16,185,129,0.12)',
          border: `1px solid ${isOnline ? 'rgba(0,242,254,0.18)' : 'rgba(16,185,129,0.40)'}`,
          borderRadius: '12px',
          transition: 'background 0.3s ease, border-color 0.3s ease',
        }}>
          <span style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: '34px', height: '34px', flexShrink: 0, borderRadius: '9px',
            background: isOnline ? 'rgba(0,242,254,0.12)' : 'rgba(16,185,129,0.20)',
            color: isOnline ? '#2563eb' : '#34d399',
            boxShadow: isOnline ? '0 0 14px rgba(0,242,254,0.25)' : '0 0 14px rgba(16,185,129,0.30)',
          }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                 strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242" />
              <path d="M12 12v9" />
              <path d="m8 17 4 4 4-4" />
            </svg>
          </span>
          <div style={{ lineHeight: 1.45 }}>
            <div style={{
              fontSize: '11px', fontWeight: 900, letterSpacing: '0.5px', textTransform: 'uppercase',
              color: isOnline ? '#2563eb' : '#34d399',
            }}>
              {isOnline ? 'Works fully offline' : 'You are offline — that is okay'}
            </div>
            <div style={{ fontSize: '11px', fontWeight: 500, color: 'rgba(15,23,42,0.62)' }}>
              {isOnline
                ? 'Sign in once and keep working without internet — everything syncs automatically when you reconnect.'
                : 'No internet needed. Sign in with your saved PIN and continue — your changes sync the moment you are back online.'}
            </div>
          </div>
        </div>

        <div className="login-mode-toggle" style={{ display: 'flex', gap: '10px', marginBottom: '25px', padding: '4px', background: 'rgba(15,23,42,0.05)', borderRadius: '10px' }}>
          {pinUsers.length > 0 && (
            <button
              type="button"
              onClick={() => { setLoginMode('pin'); setError(null); setPinError(''); }}
              className={`toggle-btn ${loginMode === 'pin' ? 'active' : ''}`}
              style={{
                flex: 1,
                padding: '12px',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
                fontSize: '11px',
                fontWeight: 800,
                transition: 'all 0.3s',
                background: loginMode === 'pin' ? '#2563eb' : 'transparent',
                color: loginMode === 'pin' ? '#ffffff' : '#0f172a',
                boxShadow: loginMode === 'pin' ? '0 0 15px rgba(37, 99, 235, 0.4)' : 'none',
              }}
            >PIN</button>
          )}
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
              background: loginMode === 'password' ? '#2563eb' : 'transparent', 
              color: loginMode === 'password' ? '#ffffff' : '#0f172a',
              boxShadow: loginMode === 'password' ? '0 0 15px rgba(37, 99, 235, 0.4)' : 'none'
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
              background: loginMode === 'otp' ? '#2563eb' : 'transparent', 
              color: loginMode === 'otp' ? '#ffffff' : '#0f172a',
              boxShadow: loginMode === 'otp' ? '0 0 15px rgba(37, 99, 235, 0.4)' : 'none'
            }}
          >
            OTP / SMS Code
          </button>
        </div>

        {sessionBanner && (
          <div role="alert" style={{
            background: '#fff7ed',
            border: '1px solid #fed7aa',
            borderLeft: '4px solid #ea580c',
            color: '#7c2d12',
            borderRadius: '10px',
            padding: '12px 14px',
            marginBottom: '16px',
            fontSize: '13px',
            lineHeight: 1.5,
          }}>
            <div style={{ fontWeight: 900, marginBottom: '4px', letterSpacing: '0.3px' }}>
              {sessionBanner.title}
            </div>
            <div style={{ fontWeight: 500 }}>{sessionBanner.body}</div>
          </div>
        )}

        {loginMode === 'pin' && (
          <form onSubmit={handlePinSubmit} className="auth-form" autoComplete="off">
            {pinUsers.length > 1 && (
              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 800, color: 'rgba(15,23,42,0.55)', textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: '8px' }}>
                  Saved account
                </label>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  {pinUsers.map(u => (
                    <button
                      key={u.userId}
                      type="button"
                      onClick={() => {
                        setSelectedPinUserId(u.userId);
                        setPinValue('');
                        setPinError('');
                        setPinLockUntilMs(u.lockedUntilMs || 0);
                      }}
                      style={{
                        background: selectedPinUserId === u.userId ? 'rgba(37, 99, 235, 0.18)' : 'rgba(15,23,42,0.05)',
                        color: '#0f172a',
                        border: selectedPinUserId === u.userId ? '1px solid #2563eb' : '1px solid rgba(15,23,42,0.12)',
                        padding: '8px 12px',
                        borderRadius: '8px',
                        fontSize: '12px',
                        fontWeight: 700,
                        cursor: 'pointer',
                      }}
                    >{u.name}</button>
                  ))}
                </div>
              </div>
            )}
            <div className="form-group" style={{ marginBottom: '6px' }}>
              <label>Quick-Unlock PIN</label>
              <input
                type="password"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={4}
                autoComplete="off"
                autoFocus
                value={pinValue}
                onChange={e => { setPinValue(e.target.value.replace(/\D/g, '').slice(0, 4)); setPinError(''); }}
                placeholder="• • • •"
                disabled={pinLockedSecondsLeft > 0 || loading}
                style={{
                  letterSpacing: '14px',
                  textAlign: 'center',
                  fontSize: '20px',
                  background: 'rgba(0, 0, 0, 0.35)',
                  color: '#0f172a',
                  border: '1px solid rgba(15, 23, 42, 0.15)',
                  borderRadius: '10px',
                  padding: '14px',
                  width: '100%',
                  boxSizing: 'border-box',
                  outline: 'none',
                }}
              />
            </div>
            {pinLockedSecondsLeft > 0 && (
              <div style={{ marginTop: '10px', padding: '10px 12px', background: 'rgba(220, 38, 38, 0.18)', border: '1px solid rgba(220, 38, 38, 0.35)', borderRadius: '8px', color: '#fecaca', fontSize: '12px', fontWeight: 600, lineHeight: 1.5 }}>
                Too many wrong attempts. Try again in {Math.floor(pinLockedSecondsLeft / 60)}:{String(pinLockedSecondsLeft % 60).padStart(2, '0')}.
              </div>
            )}
            {pinError && pinLockedSecondsLeft === 0 && (
              <div style={{ marginTop: '10px', fontSize: '12px', color: '#fca5a5', fontWeight: 600 }}>
                {pinError}
              </div>
            )}
            <button
              type="submit"
              disabled={loading || pinLockedSecondsLeft > 0 || pinValue.length < 4 || !selectedPinUserId}
              className="auth-submit"
              style={{ marginTop: '16px' }}
            >
              {loading ? 'Unlocking…' : 'Unlock'}
            </button>
            <div style={{ marginTop: '14px', textAlign: 'center' }}>
              <button
                type="button"
                onClick={() => { setLoginMode('password'); setPinError(''); }}
                style={{ background: 'transparent', border: 'none', color: '#2563eb', fontSize: '11px', fontWeight: 700, cursor: 'pointer', letterSpacing: '0.3px' }}
              >Use password instead</button>
            </div>
          </form>
        )}

        {loginMode !== 'pin' && (
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
                <Link to="/forgot-password" style={{ fontSize: '10px', color: '#2563eb', textDecoration: 'none', fontWeight: 800 }}>Forgot Password?</Link>
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
                <p style={{ fontSize: '10px', color: 'rgba(15,23,42,0.4)', marginTop: '8px', textAlign: 'center' }}>
                  Didn't receive the code? {countdown > 0 ? (
                    <span style={{ color: '#2563eb', fontWeight: 800 }}>Resend in 0:{countdown < 10 ? `0${countdown}` : countdown}</span>
                  ) : (
                    <button type="button" onClick={handleRequestOtp} style={{ background: 'none', border: 'none', color: '#2563eb', cursor: 'pointer', padding: 0, fontWeight: 800, fontSize: '10px', textDecoration: 'underline' }}>Resend OTP</button>
                  )}
                </p>
              </div>
            )
          )}

          {error && (
            <div className={`error-message ${errorCode === 'USER_NOT_FOUND' ? 'cta-error' : ''}`} 
                 style={{ 
                   background: errorCode === 'USER_NOT_FOUND' ? 'rgba(37, 99, 235, 0.1)' : 'rgba(231, 76, 60, 0.1)', 
                   color: errorCode === 'USER_NOT_FOUND' ? '#2563eb' : '#e74c3c', 
                   border: errorCode === 'USER_NOT_FOUND' ? '1px solid rgba(37, 99, 235, 0.2)' : '1px solid rgba(231, 76, 60, 0.2)',
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
                    background: '#2563eb', 
                    color: '#ffffff', 
                    border: 'none', 
                    padding: '8px 12px', 
                    borderRadius: '4px', 
                    fontSize: '10px', 
                    fontWeight: 900, 
                    cursor: 'pointer',
                    alignSelf: 'flex-start',
                    boxShadow: '0 0 10px rgba(37, 99, 235, 0.3)'
                  }}
                >
                  Register as a New Centre
                </button>
              )}

              {errorCode === 'ACCOUNT_INACTIVE' && (
                <p style={{ fontSize: '10px', opacity: 0.8, margin: 0 }}>
                  Account Status: <span style={{ fontWeight: 800, color: '#2563eb' }}>{accountStatus?.toUpperCase()}</span>. 
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
        )}

        <div className="neon-divider"></div>
        
        <div className="auth-footer" style={{ textAlign: 'center' }}>
           <p style={{ fontSize: '13px', fontWeight: 600, color: 'rgba(15,23,42,0.7)' }}>
              New centre? <Link to="/register" style={{ color: '#2563eb', textDecoration: 'none', borderBottom: '1px solid #2563eb' }}>Register here</Link>
           </p>
        </div>
      </div>

      <AuthErrorModal
        {...errorModal}
        onClose={() => setErrorModal({ open: false })}
      />

      <PinSetupModal
        open={pinSetupOpen}
        userId={pinSetupUserId}
        userName={pinSetupUserName}
        onEnroll={async (pin) => {
          const r = await enrollPin(pin);
          if (r?.success) {
            setPinSetupOpen(false);
            navigate(resolveRedirectPath(postLoginRoles), { replace: true });
          }
          return r;
        }}
        onDismiss={() => {
          setPinSetupOpen(false);
          navigate(resolveRedirectPath(postLoginRoles), { replace: true });
        }}
      />
    </div>
  );
}
