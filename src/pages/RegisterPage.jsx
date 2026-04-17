import { useState } from 'react';
import { useNavigate, Link, Navigate } from 'react-router-dom';
import useAuth from '../auth/useAuth';
import RadiologyWorkflowBG from '../components/RadiologyWorkflowBG';
import TacticalWorkflow from '../components/TacticalWorkflow';
import '../styles/global.css';

export default function RegisterPage() {
  const { registerAdminDoctor, hasAdminDoctor } = useAuth();
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
  const [showPassword, setShowPassword] = useState(false);

  const handleNext = (e) => {
    e.preventDefault();
    const { name, email, mobile, password, confirmPassword } = formData;
    
    if (!name || !email || !mobile || !password || !confirmPassword) {
      return setError('CRITICAL: All identification fields are mandatory for master identity setup.');
    }
    
    if (password !== confirmPassword) {
      return setError('SECURITY ALERT: Passwords do not match. Verification failed.');
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
    <div className="auth-immersive-container">
      <RadiologyWorkflowBG />
      <div className="immersive-brand">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-start', marginBottom: '5px' }}>
          <div className="immersive-logo" style={{ background: 'transparent', boxShadow: 'none', height: '28px', width: 'auto', marginRight: '12px', display: 'flex', alignItems: 'center' }}>
            <img src="/Logo.png" alt="NexEgale" style={{ height: '100%', width: 'auto', objectFit: 'contain' }} />
          </div>
          <div className="immersive-logo-text" style={{ fontSize: '24px', fontWeight: 950, color: 'white', letterSpacing: '2px', lineHeight: 1 }}>
            NEX<span style={{ color: '#00f2fe' }}>EGALE</span>
          </div>
        </div>
        <div className="immersive-tagline">1Rad Infrastructure Setup</div>
        <TacticalWorkflow />
      </div>

      <div className="glass-card" style={{ maxWidth: '600px' }}>
        <div className="auth-header" style={{ textAlign: 'center', marginBottom: '30px' }}>
           <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginBottom: '15px' }}>
              <div style={{ width: '40px', height: '6px', background: '#00f2fe', borderRadius: '3px', boxShadow: '0 0 10px rgba(0, 242, 254, 0.5)' }}></div>
              <div style={{ width: '40px', height: '6px', background: step === 2 ? '#00f2fe' : 'rgba(255,255,255,0.1)', borderRadius: '3px', boxShadow: step === 2 ? '0 0 10px rgba(0, 242, 254, 0.5)' : 'none' }}></div>
           </div>
           <h2 className="auth-title" style={{ color: '#fff', fontSize: '24px', fontWeight: 900 }}>INITIALIZE 1RAD</h2>
           <p className="auth-subtitle" style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '1px', color: '#00f2fe', fontWeight: 900 }}>
             STEP {step}: {step === 1 ? 'MASTER IDENTITY' : 'INFRASTRUCTURE'}
           </p>
        </div>

        <form onSubmit={step === 1 ? handleNext : handleSubmit} className="auth-form">
          {step === 1 && (
             <div className="wizard-step animate-in">
                <div className="form-group" style={{ marginBottom: '20px' }}>
                  <label>FULL LEGAL NAME</label>
                  <input 
                    type="text" 
                    required 
                    value={formData.name}
                    onChange={e => setFormData({...formData, name: e.target.value})}
                    placeholder="e.g. Dr. Arjun Mehta"
                  />
                </div>

                <div className="input-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginBottom: '20px' }}>
                  <div className="form-group">
                    <label>EMAIL ADDRESS</label>
                    <input 
                      type="email" 
                      required 
                      value={formData.email}
                      onChange={e => setFormData({...formData, email: e.target.value})}
                      placeholder="doctor@center.com"
                    />
                  </div>
                  <div className="form-group">
                    <label>MOBILE NUMBER</label>
                    <input 
                      type="tel" 
                      required 
                      value={formData.mobile}
                      onChange={e => setFormData({...formData, mobile: e.target.value})}
                      placeholder="9876543210"
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginBottom: '25px' }}>
                  <div className="form-group" style={{ position: 'relative' }}>
                    <label>SYSTEM ACCESS KEY</label>
                    <div style={{ position: 'relative' }}>
                      <input 
                        type={showPassword ? "text" : "password"} 
                        required 
                        value={formData.password}
                        onChange={e => setFormData({...formData, password: e.target.value})}
                        placeholder="••••••••"
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
                  <div className="form-group" style={{ position: 'relative' }}>
                    <label>VERIFY SECRET</label>
                    <div style={{ position: 'relative' }}>
                      <input 
                        type={showPassword ? "text" : "password"} 
                        required 
                        value={formData.confirmPassword}
                        onChange={e => setFormData({...formData, confirmPassword: e.target.value})}
                        placeholder="••••••••"
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
                </div>

                <button type="submit" className="btn-primary gamified-btn" style={{ width: '100%', padding: '18px', fontWeight: 900 }}>
                  PROCEED TO CLINICAL SETUP →
                </button>
             </div>
          )}

          {step === 2 && (
             <div className="wizard-step animate-in">
                <div style={{ background: 'rgba(0, 242, 254, 0.05)', padding: '20px', borderRadius: '15px', marginBottom: '20px', border: '1px solid rgba(0, 242, 254, 0.1)' }}>
                  <p style={{ fontSize: '10px', fontWeight: 900, color: '#00f2fe', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '1px' }}>CLINICAL CREDENTIALS</p>
                  <div className="form-group" style={{ marginBottom: '15px' }}>
                    <label style={{ fontSize: '11px' }}>PRIMARY SPECIALIZATION</label>
                    <input 
                      type="text" 
                      required 
                      value={formData.specialization}
                      onChange={e => setFormData({...formData, specialization: e.target.value})}
                      placeholder="e.g. Neuroradiologist"
                      style={{ fontSize: '13px' }}
                    />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <div className="form-group">
                      <label style={{ fontSize: '11px' }}>MEDICAL REG #</label>
                      <input 
                        type="text" 
                        required 
                        value={formData.licenseNo}
                        onChange={e => setFormData({...formData, licenseNo: e.target.value})}
                        placeholder="Reg-894-0"
                        style={{ fontSize: '13px' }}
                      />
                    </div>
                    <div className="form-group">
                      <label style={{ fontSize: '11px' }}>PRIMARY DEGREE</label>
                      <input 
                        type="text" 
                        required 
                        value={formData.degree}
                        onChange={e => setFormData({...formData, degree: e.target.value})}
                        placeholder="MBBS, MD"
                        style={{ fontSize: '13px' }}
                      />
                    </div>
                  </div>
                </div>

                <div style={{ marginBottom: '25px' }}>
                  <div className="form-group" style={{ marginBottom: '15px' }}>
                    <label>INSTITUTION NAME</label>
                    <input 
                      type="text" 
                      required 
                      value={formData.centerName}
                      onChange={e => setFormData({...formData, centerName: e.target.value})}
                      placeholder="e.g. City Diagnostic Center"
                    />
                  </div>
                  <div className="form-group">
                    <label>CENTER ADDRESS</label>
                    <textarea 
                      required 
                      value={formData.centerAddress}
                      onChange={e => setFormData({...formData, centerAddress: e.target.value})}
                      rows="2"
                      style={{ 
                        width: '100%', 
                        padding: '12px', 
                        background: 'rgba(255, 255, 255, 0.05)', 
                        border: '1px solid rgba(255, 255, 255, 0.1)', 
                        borderRadius: '8px',
                        color: 'white',
                        fontFamily: 'inherit'
                      }}
                    />
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '10px' }}>
                  <button type="button" onClick={() => setStep(1)} className="btn-logout" style={{ flex: 1, padding: '15px', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.7)' }}>
                    PREVIOUS
                  </button>
                  <button type="submit" className="btn-primary gamified-btn" style={{ flex: 2, padding: '15px', fontWeight: 900 }}>
                    FINALIZE DEPLOYMENT
                  </button>
                </div>
             </div>
          )}

          {error && <div className="error-message" style={{ marginTop: '15px', background: 'rgba(231, 76, 60, 0.1)', color: '#e74c3c' }}>{error}</div>}

          <div className="neon-divider"></div>

          <div style={{ textAlign: 'center' }}>
             <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.6)' }}>
                ALREADY REGISTERED? <Link to="/login" style={{ color: '#00f2fe', textDecoration: 'none', fontWeight: 800, borderBottom: '1px solid #00f2fe' }}>RETURN TO PORTAL</Link>
             </p>
          </div>
        </form>
      </div>
    </div>
  );
}
