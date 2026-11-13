import { useNavigate } from 'react-router-dom';
import useAuth from '../auth/useAuth';
import { ROLE_HOME, getRolePermissions } from '../data/roles';
import '../styles/global.css';

export default function AccessDenied() {
  const { currentUser, activeCenter, logout } = useAuth();
  const navigate = useNavigate();

  // Work out whether this user actually has a reachable home. If they don't
  // (e.g. a custom-role user whose permissions aren't resolving), a "Go to
  // Dashboard" button would just bounce back here — so we hide it and only
  // offer the way out: sign in as someone else.
  const roles = currentUser?.roles || [];
  const systemHome = roles.map(r => ROLE_HOME[r]).find(Boolean);
  let firstPermitted = null;
  if (!systemHome) {
    for (const r of roles) {
      const perms = getRolePermissions(r, activeCenter?.id);
      if (perms && perms.length > 0) { firstPermitted = perms[0]; break; }
    }
  }
  const home = systemHome || firstPermitted;

  const goHome = () => { if (home) navigate(home); };

  const backToLogin = () => {
    // Clear the current session so the login screen is a clean slate, then go.
    try { logout(); } catch { /* best effort */ }
    navigate('/login');
  };

  return (
    <div className="auth-container">
      <div className="auth-card" style={{ textAlign: 'center', maxWidth: '400px' }}>
        <div style={{ fontSize: '64px', marginBottom: '20px' }}>🚫</div>
        <h1 className="auth-title">Not available for your role</h1>
        <p className="auth-subtitle">
          This page is not part of your work in 1Rad. Ask your centre admin if you need it.
        </p>

        {/* Main way out: back to a page they can open, still signed in.
            Only offered when there is one. */}
        {home && (
          <button
            onClick={goHome}
            className="btn-primary"
            style={{ width: '100%', marginTop: '20px' }}
          >
            Go to my home page
          </button>
        )}

        {/* Signing out is the fallback — for when someone else should sign in. */}
        <button
          onClick={backToLogin}
          className="btn-logout"
          style={{ width: '100%', marginTop: '12px' }}
        >
          Sign in as someone else
        </button>
      </div>
    </div>
  );
}
