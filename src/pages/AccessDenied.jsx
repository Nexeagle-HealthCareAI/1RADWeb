import { useNavigate } from 'react-router-dom';
import useAuth from '../auth/useAuth';
import { ROLE_HOME, getRolePermissions } from '../data/roles';
import '../styles/global.css';

export default function AccessDenied() {
  const { currentUser, activeCenter } = useAuth();
  const navigate = useNavigate();

  const handleGoHome = () => {
    if (!currentUser) { navigate('/login'); return; }
    const roles = currentUser.roles || [];
    // Prefer a system role's home; otherwise (custom roles) jump to the FIRST
    // route the user actually has permission for so the button never bounces
    // back to this page.
    const systemHome = roles.map(r => ROLE_HOME[r]).find(Boolean);
    if (systemHome) { navigate(systemHome); return; }
    for (const r of roles) {
      const perms = getRolePermissions(r, activeCenter?.id);
      if (perms && perms.length > 0) { navigate(perms[0]); return; }
    }
    navigate('/');
  };

  return (
    <div className="auth-container">
      <div className="auth-card" style={{ textAlign: 'center', maxWidth: '400px' }}>
        <div style={{ fontSize: '64px', marginBottom: '20px' }}>🚫</div>
        <h1 className="auth-title">Access Denied</h1>
        <p className="auth-subtitle">
          You do not have permission to access this page. 
          This area is restricted to authorized roles only.
        </p>
        
        <button 
          onClick={handleGoHome} 
          className="btn-primary" 
          style={{ width: '100%', marginTop: '20px' }}
        >
          Go to My Dashboard
        </button>
      </div>
    </div>
  );
}
