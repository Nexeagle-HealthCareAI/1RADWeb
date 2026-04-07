import { useNavigate } from 'react-router-dom';
import useAuth from '../auth/useAuth';
import { ROLE_HOME } from '../data/roles';
import '../styles/global.css';

export default function AccessDenied() {
  const { currentUser } = useAuth();
  const navigate = useNavigate();

  const handleGoHome = () => {
    if (currentUser) {
      navigate(ROLE_HOME[currentUser.role] || '/');
    } else {
      navigate('/login');
    }
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
