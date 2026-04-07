import { useState } from 'react';
import { useNavigate, useLocation, Navigate, Link } from 'react-router-dom';
import useAuth from '../auth/useAuth';
import { ROLE_HOME, ROLE_LABELS } from '../data/roles';
import '../styles/global.css';

export default function LoginPage() {
  const { login, hasAdminDoctor } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = location.state?.from?.pathname || '/';

  // If no AdminDoctor exists, redirect to register immediately
  if (!hasAdminDoctor) {
    return <Navigate to="/register" replace />;
  }

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);

  const handleSubmit = (e) => {
    e.preventDefault();
    handleLogin(identifier, password);
  };

  const handleLogin = (id, pwd) => {
    const result = login(id, pwd);
    if (result.success) {
      const home = ROLE_HOME[result.user.role] || '/';
      navigate(from === '/' ? home : from, { replace: true });
    } else {
      setError(result.error);
    }
  };

  const demoLogin = (demoId, demoPwd) => {
    setIdentifier(demoId);
    setPassword(demoPwd);
    handleLogin(demoId, demoPwd);
  };

  return (
    <div className="auth-split-container">
      {/* Left side: Brand/Hero section */}
      <div className="auth-hero-section">
        <div className="hero-content">
          <div className="hero-logo">eR</div>
          <h1 className="hero-title">Welcome to <span className="highlight">easyRAD</span></h1>
          <p className="hero-description">The ultimate command center for modern radiology. Manage cases, track volume, and lead your team with precision.</p>
          <div className="hero-stats">
            <div className="stat-pill">Online Now: 42 Doctors</div>
            <div className="stat-pill">Studies Today: 1,204</div>
          </div>
        </div>
        <div className="hero-gradient-overlay"></div>
      </div>

      {/* Right side: Login Card */}
      <div className="auth-right-panel">
        <div className="auth-card gamified-card">
          <div className="auth-header">
            <h2 className="auth-title">Agent Portal</h2>
            <p className="auth-subtitle">Verify your credentials to enter the grid</p>
          </div>

          <form onSubmit={handleSubmit} className="auth-form">
            <div className="form-group">
              <label>Ident Code (Email/Mobile)</label>
              <input
                type="text"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                placeholder="e.g. admin@easyrad.com"
                required
              />
            </div>
            <div className="form-group">
              <label>Secure Key (Password)</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
              />
            </div>

            {error && <div className="error-message">{error}</div>}

            <button type="submit" className="btn-primary btn-block gamified-btn">
              Authenticate Account
            </button>
          </form>

          <div className="demo-accounts-section">
            <p className="demo-label">Select Agent Class (Quick Access):</p>
            <div className="demo-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
              <button onClick={() => demoLogin('master@easyrad.com', 'master123')} className="demo-card-btn" style={{ gridColumn: 'span 3', background: '#fff5f5', borderColor: '#feb2b2' }}>
                <span className="demo-role" style={{ color: '#c53030' }}>Super Admin (AdminDoctor)</span>
                <span className="demo-lvl">Lv.99 (Max)</span>
              </button>
              <button onClick={() => demoLogin('admin@easyrad.com', 'admin123')} className="demo-card-btn">
                <span className="demo-role">Admin</span>
                <span className="demo-lvl">Lv.80</span>
              </button>
              <button onClick={() => demoLogin('frontdesk@easyrad.com', 'desk123')} className="demo-card-btn">
                <span className="demo-role">Reception</span>
                <span className="demo-lvl">Lv.12</span>
              </button>
              <button onClick={() => demoLogin('tech@easyrad.com', 'tech123')} className="demo-card-btn">
                <span className="demo-role">Technician</span>
                <span className="demo-lvl">Lv.25</span>
              </button>
              <button onClick={() => demoLogin('doctor@easyrad.com', 'doc123')} className="demo-card-btn">
                <span className="demo-role">Doctor</span>
                <span className="demo-lvl">Lv.50</span>
              </button>
            </div>
          </div>
          
          <div className="auth-footer" style={{ marginTop: '20px', textAlign: 'center' }}>
             <p style={{ fontSize: '11px', color: '#888', marginBottom: '8px' }}>Need assistance? Contact System Command.</p>
             <p style={{ fontSize: '13px', fontWeight: 600 }}>
                New center? <Link to="/register" style={{ color: '#0052cc', textDecoration: 'none' }}>Register for easyRAD</Link>
             </p>
          </div>
        </div>
      </div>
    </div>
  );
}
