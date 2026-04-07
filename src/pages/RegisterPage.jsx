import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import useAuth from '../auth/useAuth';
import '../styles/global.css';

export default function RegisterPage() {
  const { registerAdminDoctor } = useAuth();
  const navigate = useNavigate();
  
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    mobile: '',
    password: '',
    confirmPassword: '',
    specialization: '',
    licenseNo: '',
    degree: '',
    centerName: '',
    centerAddress: ''
  });

  const [step, setStep] = useState(1);
  const [error, setError] = useState('');

  const handleNext = (e) => {
    e.preventDefault();
    if (!formData.name || !formData.email || !formData.mobile || !formData.password) {
      return setError('Please complete all identification fields');
    }
    if (formData.password !== formData.confirmPassword) {
      return setError('Passwords do not match');
    }
    setError('');
    setStep(2);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!formData.centerName || !formData.centerAddress || !formData.specialization) {
      return setError('Please complete all clinical infrastructure fields');
    }
    
    const { confirmPassword, ...userData } = formData;
    registerAdminDoctor(userData);
    navigate('/login');
  };

  return (
    <div className="auth-split-container">
      {/* Left side: Brand/Hero section */}
      <div className="auth-hero-section">
        <div className="hero-content">
          <div className="hero-logo">eR</div>
          <h1 className="hero-title">Setup your <span className="highlight">Command Center</span></h1>
          <p className="hero-description">Welcome to easyRAD. Initialize your hospital or clinic profile and create the master administrator account.</p>
          <div className="hero-stats" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div className="stat-pill">Level: Institution Admin</div>
            <div className="stat-pill" style={{ background: step === 2 ? '#2ecc71' : '#f1f2f6' }}>Phase: {step === 1 ? 'Identity' : 'Infrastructure'}</div>
            <div className="stat-pill">System: Verified</div>
          </div>
        </div>
        <div className="hero-gradient-overlay"></div>
      </div>

      {/* Right side: Register Card */}
      <div className="auth-right-panel" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="auth-card gamified-card" style={{ width: '100%', maxWidth: '500px', padding: '40px' }}>
          <div className="auth-header" style={{ textAlign: 'center', marginBottom: '30px' }}>
             <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginBottom: '15px' }}>
                <div style={{ width: '40px', height: '6px', background: '#0f52ba', borderRadius: '3px' }}></div>
                <div style={{ width: '40px', height: '6px', background: step === 2 ? '#0f52ba' : '#eee', borderRadius: '3px' }}></div>
             </div>
             <h2 className="auth-title">Initialize easyRAD</h2>
             <p className="auth-subtitle" style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '1px', color: '#0f52ba', fontWeight: 900 }}>Step {step}: {step === 1 ? 'Master Account Identity' : 'Institutional Setup'}</p>
          </div>

          <form onSubmit={step === 1 ? handleNext : handleSubmit} className="auth-form">
            {step === 1 && (
               <div className="wizard-step animate-in">
                  <div className="form-group" style={{ marginBottom: '20px' }}>
                    <label style={{ fontSize: '10px', fontWeight: 800, textTransform: 'uppercase', color: '#888' }}>Full Legal Name</label>
                    <input 
                      type="text" 
                      required 
                      value={formData.name}
                      onChange={e => setFormData({...formData, name: e.target.value})}
                      placeholder="e.g. Dr. Arjun Mehta"
                      style={{ padding: '12px' }}
                    />
                  </div>

                  <div className="input-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '15px', marginBottom: '20px' }}>
                    <div className="form-group">
                      <label style={{ fontSize: '10px', fontWeight: 800, textTransform: 'uppercase', color: '#888' }}>Email Address</label>
                      <input 
                        type="email" 
                        required 
                        value={formData.email}
                        onChange={e => setFormData({...formData, email: e.target.value})}
                        placeholder="doctor@center.com"
                        style={{ padding: '12px' }}
                      />
                    </div>
                    <div className="form-group">
                      <label style={{ fontSize: '10px', fontWeight: 800, textTransform: 'uppercase', color: '#888' }}>Mobile Number</label>
                      <input 
                        type="tel" 
                        required 
                        value={formData.mobile}
                        onChange={e => setFormData({...formData, mobile: e.target.value})}
                        placeholder="9876543210"
                        style={{ padding: '12px' }}
                      />
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginBottom: '25px' }}>
                    <div className="form-group">
                      <label style={{ fontSize: '10px', fontWeight: 800, textTransform: 'uppercase', color: '#888' }}>System Password</label>
                      <input 
                        type="password" 
                        required 
                        value={formData.password}
                        onChange={e => setFormData({...formData, password: e.target.value})}
                        style={{ padding: '12px' }}
                      />
                    </div>
                    <div className="form-group">
                      <label style={{ fontSize: '10px', fontWeight: 800, textTransform: 'uppercase', color: '#888' }}>Verify Secret</label>
                      <input 
                        type="password" 
                        required 
                        value={formData.confirmPassword}
                        onChange={e => setFormData({...formData, confirmPassword: e.target.value})}
                        style={{ padding: '12px' }}
                      />
                    </div>
                  </div>

                  <button type="submit" className="btn-primary gamified-btn" style={{ width: '100%', padding: '18px', fontWeight: 900 }}>
                    NEXT: CLINICAL DETAILS →
                  </button>
               </div>
            )}

            {step === 2 && (
               <div className="wizard-step animate-in">
                  <div style={{ background: '#f0f7ff', padding: '15px', borderRadius: '10px', marginBottom: '20px', border: '1px solid #e0eefc' }}>
                    <p style={{ fontSize: '10px', fontWeight: 900, color: '#0f52ba', marginBottom: '8px', textTransform: 'uppercase' }}>Clinical Credentials</p>
                    <div className="form-group" style={{ marginBottom: '12px' }}>
                      <label style={{ fontSize: '11px' }}>Primary Specialization</label>
                      <input 
                        type="text" 
                        required 
                        value={formData.specialization}
                        onChange={e => setFormData({...formData, specialization: e.target.value})}
                        placeholder="e.g. Neuroradiologist"
                        style={{ padding: '10px', fontSize: '13px' }}
                      />
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                      <div className="form-group">
                        <label style={{ fontSize: '11px' }}>Medical Reg #</label>
                        <input 
                          type="text" 
                          required 
                          value={formData.licenseNo}
                          onChange={e => setFormData({...formData, licenseNo: e.target.value})}
                          placeholder="Reg-894-0"
                          style={{ padding: '10px', fontSize: '13px' }}
                        />
                      </div>
                      <div className="form-group">
                        <label style={{ fontSize: '11px' }}>Primary Degree</label>
                        <input 
                          type="text" 
                          required 
                          value={formData.degree}
                          onChange={e => setFormData({...formData, degree: e.target.value})}
                          placeholder="MBBS, MD"
                          style={{ padding: '10px', fontSize: '13px' }}
                        />
                      </div>
                    </div>
                  </div>

                  <div style={{ marginBottom: '25px' }}>
                    <div className="form-group" style={{ marginBottom: '15px' }}>
                      <label style={{ fontSize: '10px', fontWeight: 800, textTransform: 'uppercase', color: '#888' }}>Institution Name</label>
                      <input 
                        type="text" 
                        required 
                        value={formData.centerName}
                        onChange={e => setFormData({...formData, centerName: e.target.value})}
                        placeholder="e.g. City Diagnostic Center"
                        style={{ padding: '12px' }}
                      />
                    </div>
                    <div className="form-group">
                      <label style={{ fontSize: '10px', fontWeight: 800, textTransform: 'uppercase', color: '#888' }}>Center Address</label>
                      <textarea 
                        required 
                        value={formData.centerAddress}
                        onChange={e => setFormData({...formData, centerAddress: e.target.value})}
                        rows="2"
                        style={{ width: '100%', padding: '12px', border: '1px solid #ddd', borderRadius: '8px' }}
                      />
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '10px' }}>
                    <button type="button" onClick={() => setStep(1)} className="btn-logout" style={{ flex: 1, padding: '15px' }}>
                      BACK
                    </button>
                    <button type="submit" className="btn-primary gamified-btn" style={{ flex: 2, padding: '15px', fontWeight: 900 }}>
                      FINALIZE DEPLOYMENT
                    </button>
                  </div>
               </div>
            )}

            {error && <div className="error-message" style={{ marginTop: '15px', padding: '10px', background: '#fff5f5', color: '#e74c3c', borderRadius: '6px', fontSize: '12px', textAlign: 'center', border: '1px solid #fed7d7' }}>{error}</div>}

            <div style={{ marginTop: '25px', textAlign: 'center', borderTop: '1px solid #eee', paddingTop: '20px' }}>
               <p style={{ fontSize: '13px', color: '#888' }}>
                  Already have a registered center? <Link to="/login" style={{ color: '#0f52ba', textDecoration: 'none', fontWeight: 800 }}>BACK TO COMMAND CENTER</Link>
               </p>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
