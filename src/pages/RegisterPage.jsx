import { useState, useEffect } from 'react';
import { useNavigate, Link, Navigate } from 'react-router-dom';
import useAuth from '../auth/useAuth';
import RadiologyWorkflowBG from '../components/RadiologyWorkflowBG';
import TacticalWorkflow from '../components/TacticalWorkflow';
import '../styles/global.css';

export default function RegisterPage() {
  const { registerAdminDoctor, sendOtp, verifyOtp } = useAuth();
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    role: 'admindoctor', // 'admin' or 'admindoctor'
    mobile: '',
    otp: '',
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
    specialization: '',
    licenseNo: '',
    degree: '',
    centerName: '',
    chainName: '',
    centerAddress: '',
    gstinNumber: '',
    registrationNumber: '',
    panNumber: '',
    nabhNumber: ''
  });

  const [step, setStep] = useState(1);
  const [isOtpSent, setIsOtpSent] = useState(false);
  const [isOtpVerified, setIsOtpVerified] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [errorCode, setErrorCode] = useState(null);

  // GSTIN validation helper
  const validateGSTIN = (gstin) => {
    if (!gstin) return true; // Optional field
    const gstinRegex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
    return gstinRegex.test(gstin);
  };

  // PAN validation helper
  const validatePAN = (pan) => {
    if (!pan) return true; // Optional field
    const panRegex = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;
    return panRegex.test(pan);
  };

  // Timer cleanup and management
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

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerId) clearInterval(timerId);
    };
  }, [timerId]);

  const handleSendOtp = async (e) => {
    e.preventDefault();
    setError(null);
    if (!formData.mobile || formData.mobile.length < 10) {
      return setError('INVALID PROTOCOL: Please enter a valid 10-digit mobile number.');
    }
    setLoading(true);
    const result = await sendOtp(formData.mobile);
    setLoading(false);
    if (result.success) {
      if (result.message && result.message.toLowerCase().includes('already registered')) {
        setError(result.message);
        return;
      }
      setIsOtpSent(true);
      setError('');
      startCountdown();
    } else {
      setError(result.error);
    }
  };

  const handleVerifyOtp = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const result = await verifyOtp(formData.mobile, formData.otp);
    setLoading(false);
    
    if (result.success) {
      if (result.type === 'Login') {
        // Edge case: user actually exists, redirect back to login or auto-login
        navigate('/login', { state: { from: { pathname: '/' } } });
      } else {
        setIsOtpVerified(true);
        setStep(2);
      }
    } else {
      setError(result.error);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    
    if (step === 2) {
      if (!formData.name || !formData.email || !formData.password) {
        return setError('IDENTITY INCOMPLETE: Please finalize master credentials.');
      }
      if (formData.password.length < 6) {
        return setError('SECURITY PROTOCOL: Password must be at least 6 characters.');
      }
      if (formData.password !== formData.confirmPassword) {
        return setError('SECURITY ALERT: Secret mismatch. Verification failed.');
      }
      // If role is admin, skip clinical setup and go to step 4
      setStep(formData.role === 'admindoctor' ? 3 : 4);
      return;
    }

    if (step === 3) {
      if (!formData.specialization || !formData.licenseNo || !formData.degree) {
        return setError('CLINICAL CREDENTIALS MISSING: CMO identity requires medical registration data.');
      }
      setStep(4);
      return;
    }

    if (step === 4) {
      if (!formData.centerName || !formData.centerAddress) {
        return setError('INFRASTRUCTURE INCOMPLETE: Deploy center details before finalization.');
      }
      
      // Validate GSTIN format if provided
      if (formData.gstinNumber && !validateGSTIN(formData.gstinNumber)) {
        return setError('INVALID GSTIN FORMAT: Please enter a valid 15-digit GSTIN number.');
      }
      
      // Validate PAN format if provided
      if (formData.panNumber && !validatePAN(formData.panNumber)) {
        return setError('INVALID PAN FORMAT: Please enter a valid 10-digit PAN number.');
      }

      setLoading(true);
      const result = await registerAdminDoctor({
        fullName: formData.name,
        email: formData.email,
        mobile: formData.mobile,
        password: formData.password,
        centerName: formData.centerName,
        centerAddress: formData.centerAddress,
        gstinNumber: formData.gstinNumber,
        registrationNumber: formData.registrationNumber,
        panNumber: formData.panNumber,
        nabhNumber: formData.nabhNumber,
        specialization: formData.specialization,
        degree: formData.degree,
        licenseNo: formData.licenseNo
      });
      setLoading(false);

      if (result.success) {
        navigate('/login', { state: { message: 'Registration successful! Please login with your new credentials.' } });
      } else {
        setError(result.error);
        setErrorCode(result.errorCode);
      }
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
        <div className="immersive-tagline">1Rad Infrastructure Setup</div>
        <TacticalWorkflow />
      </div>

      <div className="glass-card" style={{ maxWidth: '600px' }}>
        <div className="auth-header" style={{ textAlign: 'center', marginBottom: '30px' }}>
           <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginBottom: '15px' }}>
              <div style={{ width: '25px', height: '6px', background: '#00f2fe', borderRadius: '3px', boxShadow: '0 0 10px rgba(0, 242, 254, 0.5)' }}></div>
              <div style={{ width: '25px', height: '6px', background: step >= 2 ? '#00f2fe' : 'rgba(255,255,255,0.1)', borderRadius: '3px', boxShadow: step >= 2 ? '0 0 10px rgba(0, 242, 254, 0.5)' : 'none' }}></div>
              <div style={{ width: '25px', height: '6px', background: step >= 3 ? '#00f2fe' : 'rgba(255,255,255,0.1)', borderRadius: '3px', boxShadow: step >= 3 ? '0 0 10px rgba(0, 242, 254, 0.5)' : 'none' }}></div>
              <div style={{ width: '25px', height: '6px', background: step >= 4 ? '#00f2fe' : 'rgba(255,255,255,0.1)', borderRadius: '3px', boxShadow: step >= 4 ? '0 0 10px rgba(0, 242, 254, 0.5)' : 'none' }}></div>
           </div>
           <h2 className="auth-title" style={{ color: '#fff', fontSize: '24px', fontWeight: 900 }}>INITIALIZE 1RAD</h2>
           <p className="auth-subtitle" style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '1px', color: '#00f2fe', fontWeight: 900 }}>
             {step === 1 ? 'CONTACT VERIFICATION' : step === 2 ? 'MASTER IDENTITY' : step === 3 ? 'CLINICAL SETUP' : 'INFRASTRUCTURE'}
           </p>
        </div>

        <form onSubmit={step === 1 ? (isOtpSent ? handleVerifyOtp : handleSendOtp) : handleSubmit} className="auth-form">
          {step === 1 && (
             <div className="wizard-step animate-in">
                <div style={{ marginBottom: '25px' }}>
                  <label style={{ fontSize: '10px', color: '#888', letterSpacing: '2px', display: 'block', marginBottom: '12px' }}>DEPLOYMENT PROTOCOL</label>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                    <button 
                      type="button" 
                      onClick={() => setFormData({...formData, role: 'admindoctor'})}
                      style={{ 
                        padding: '15px', borderRadius: '12px', border: '1px solid',
                        borderColor: formData.role === 'admindoctor' ? '#00f2fe' : 'rgba(255,255,255,0.1)',
                        background: formData.role === 'admindoctor' ? 'rgba(0, 242, 254, 0.1)' : 'transparent',
                        color: formData.role === 'admindoctor' ? '#00f2fe' : 'rgba(255,255,255,0.6)',
                        fontSize: '11px', fontWeight: 900, cursor: 'pointer', transition: 'all 0.2s'
                      }}
                    >
                      CHIEF MEDICAL OFFICER
                    </button>
                    <button 
                      type="button" 
                      onClick={() => setFormData({...formData, role: 'admin'})}
                      style={{ 
                        padding: '15px', borderRadius: '12px', border: '1px solid',
                        borderColor: formData.role === 'admin' ? '#00f2fe' : 'rgba(255,255,255,0.1)',
                        background: formData.role === 'admin' ? 'rgba(0, 242, 254, 0.1)' : 'transparent',
                        color: formData.role === 'admin' ? '#00f2fe' : 'rgba(255,255,255,0.6)',
                        fontSize: '11px', fontWeight: 900, cursor: 'pointer', transition: 'all 0.2s'
                      }}
                    >
                      OPERATIONS DIRECTOR
                    </button>
                  </div>
                </div>

                <div className="form-group" style={{ marginBottom: '20px' }}>
                  <label>MOBILE NUMBER</label>
                  <div style={{ position: 'relative' }}>
                    <input 
                      type="tel" 
                      required 
                      disabled={isOtpSent}
                      value={formData.mobile}
                      onChange={e => setFormData({...formData, mobile: e.target.value})}
                      placeholder="9876543210"
                      style={{ paddingLeft: '45px', opacity: isOtpSent ? 0.6 : 1 }}
                    />
                    <span style={{ position: 'absolute', left: '15px', top: '50%', transform: 'translateY(-50%)', opacity: 0.4 }}>🇮🇳</span>
                  </div>
                </div>

                {isOtpSent && (
                  <div className="form-group animate-slide-up" style={{ marginBottom: '25px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                      <label style={{ marginBottom: 0 }}>TACTICAL PASSCODE</label>
                      {countdown > 0 ? (
                        <span style={{ fontSize: '10px', color: '#00f2fe', fontWeight: 900 }}>REGENERATE IN {countdown}S</span>
                      ) : (
                        <button type="button" onClick={handleSendOtp} style={{ background: 'none', border: 'none', color: '#00f2fe', fontSize: '10px', fontWeight: 900, cursor: 'pointer', textDecoration: 'underline' }}>RESEND CODE</button>
                      )}
                    </div>
                    <input 
                      type="text" 
                      required 
                      maxLength="6"
                      autoFocus
                      value={formData.otp}
                      onChange={e => setFormData({...formData, otp: e.target.value})}
                      placeholder="ENTER 6-DIGIT CODE"
                      style={{ textAlign: 'center', letterSpacing: '8px', fontSize: '18px', fontWeight: 900 }}
                    />
                  </div>
                )}

                <button type="submit" className="btn-primary gamified-btn" disabled={loading} style={{ width: '100%', padding: '18px', fontWeight: 900 }}>
                  {loading ? (isOtpSent ? 'VERIFYING...' : 'DISPATCHING...') : (isOtpSent ? 'VERIFY IDENTITY →' : 'AUTHORIZE CONTACT →')}
                </button>
             </div>
          )}

          {step === 2 && (
             <div className="wizard-step animate-in">
                <div className="form-group" style={{ marginBottom: '15px' }}>
                  <label>FULL LEGAL NAME</label>
                  <input 
                    type="text" 
                    required 
                    value={formData.name}
                    onChange={e => setFormData({...formData, name: e.target.value})}
                    placeholder="e.g. Dr. Arjun Mehta"
                  />
                </div>

                <div className="form-group" style={{ marginBottom: '15px' }}>
                  <label>EMAIL ADDRESS</label>
                  <input 
                    type="email" 
                    required 
                    value={formData.email}
                    onChange={e => setFormData({...formData, email: e.target.value})}
                    placeholder="doctor@center.com"
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginBottom: '25px' }}>
                  <div className="form-group">
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
                        style={{
                          position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)',
                          background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', fontSize: '14px'
                        }}
                      >
                        {showPassword ? '👁️' : '🔒'}
                      </button>
                    </div>
                  </div>
                  <div className="form-group">
                    <label>VERIFY SECRET</label>
                    <div style={{ position: 'relative' }}>
                      <input 
                        type={showPassword ? "text" : "password"} 
                        required 
                        value={formData.confirmPassword}
                        onChange={e => setFormData({...formData, confirmPassword: e.target.value})}
                        placeholder="••••••••"
                      />
                    </div>
                  </div>
                </div>

                <button type="submit" className="btn-primary gamified-btn" style={{ width: '100%', padding: '18px', fontWeight: 900 }}>
                  PROCEED TO CLINICAL SETUP →
                </button>
             </div>
          )}

          {step === 3 && (
             <div className="wizard-step animate-in">
                <div style={{ 
                  background: 'rgba(0, 242, 254, 0.05)', 
                  padding: '30px', 
                  borderRadius: '24px', 
                  marginBottom: '25px', 
                  border: '1px solid rgba(0, 242, 254, 0.1)',
                  position: 'relative',
                  overflow: 'hidden'
                }}>
                  <div style={{ position: 'absolute', top: 0, right: 0, padding: '20px', opacity: 0.1, fontSize: '40px' }}>🩺</div>
                  <p style={{ fontSize: '10px', fontWeight: 950, color: '#00f2fe', marginBottom: '15px', textTransform: 'uppercase', letterSpacing: '2px' }}>CLINICAL AUTHORIZATION</p>
                  
                  <div className="form-group" style={{ marginBottom: '20px' }}>
                    <label style={{ color: 'rgba(255,255,255,0.5)', fontSize: '10px' }}>PRIMARY SPECIALIZATION</label>
                    <input 
                      type="text" 
                      required 
                      value={formData.specialization}
                      onChange={e => setFormData({...formData, specialization: e.target.value})}
                      placeholder="e.g. Neuroradiologist"
                    />
                  </div>
                  
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                    <div className="form-group">
                      <label style={{ color: 'rgba(255,255,255,0.5)', fontSize: '10px' }}>MEDICAL REG #</label>
                      <input 
                        type="text" 
                        required 
                        value={formData.licenseNo}
                        onChange={e => setFormData({...formData, licenseNo: e.target.value})}
                        placeholder="Reg-894-0"
                      />
                    </div>
                    <div className="form-group">
                      <label style={{ color: 'rgba(255,255,255,0.5)', fontSize: '10px' }}>PRIMARY DEGREE</label>
                      <input 
                        type="text" 
                        required 
                        value={formData.degree}
                        onChange={e => setFormData({...formData, degree: e.target.value})}
                        placeholder="MBBS, MD"
                      />
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '10px' }}>
                  <button type="button" onClick={() => setStep(2)} className="btn-logout" style={{ flex: 1, padding: '15px', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.7)' }}>
                    PREVIOUS
                  </button>
                  <button type="submit" className="btn-primary gamified-btn" style={{ flex: 2, padding: '15px', fontWeight: 900 }}>
                    DEPLOY INFRASTRUCTURE →
                  </button>
                </div>
             </div>
          )}

          {step === 4 && (
             <div className="wizard-step animate-in">
                <div style={{ marginBottom: '25px' }}>
                  <div className="form-group" style={{ marginBottom: '15px' }}>
                    <label>INSTITUTION NAME</label>
                    <div style={{ position: 'relative' }}>
                      <input 
                        type="text" 
                        required 
                        value={formData.centerName}
                        onChange={e => setFormData({...formData, centerName: e.target.value})}
                        placeholder="e.g. City Diagnostic Center"
                        style={{ paddingLeft: '40px' }}
                      />
                      <span style={{ position: 'absolute', left: '15px', top: '50%', transform: 'translateY(-50%)', opacity: 0.4, fontSize: '14px' }}>🏢</span>
                    </div>
                  </div>

                  <div className="form-group" style={{ marginBottom: '15px' }}>
                    <label style={{ fontSize: '11px' }}>INSTITUTIONAL GROUP / CHAIN (OPTIONAL)</label>
                    <div style={{ position: 'relative' }}>
                      <input 
                        type="text" 
                        value={formData.chainName}
                        onChange={e => setFormData({...formData, chainName: e.target.value})}
                        placeholder="e.g. Apollo Groups (Leave blank if single center)"
                        style={{ paddingLeft: '40px' }}
                      />
                      <span style={{ position: 'absolute', left: '15px', top: '50%', transform: 'translateY(-50%)', opacity: 0.4, fontSize: '14px' }}>🔗</span>
                    </div>
                  </div>
                  
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginBottom: '15px' }}>
                    <div className="form-group">
                      <label style={{ fontSize: '11px' }}>GSTIN NUMBER</label>
                      <div style={{ position: 'relative' }}>
                        <input 
                          type="text" 
                          value={formData.gstinNumber}
                          onChange={e => setFormData({...formData, gstinNumber: e.target.value.toUpperCase()})}
                          placeholder="e.g. 22AAAAA0000A1Z5"
                          maxLength="15"
                          style={{ 
                            paddingLeft: '35px', 
                            textTransform: 'uppercase',
                            borderColor: formData.gstinNumber && !validateGSTIN(formData.gstinNumber) 
                              ? 'rgba(231, 76, 60, 0.5)' 
                              : formData.gstinNumber && validateGSTIN(formData.gstinNumber)
                              ? 'rgba(40, 167, 69, 0.5)'
                              : 'rgba(255, 255, 255, 0.1)'
                          }}
                        />
                        <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', opacity: 0.4, fontSize: '12px' }}>🏛️</span>
                        {formData.gstinNumber && (
                          <span style={{ 
                            position: 'absolute', 
                            right: '12px', 
                            top: '50%', 
                            transform: 'translateY(-50%)', 
                            fontSize: '12px',
                            color: validateGSTIN(formData.gstinNumber) ? '#28a745' : '#e74c3c'
                          }}>
                            {validateGSTIN(formData.gstinNumber) ? '✓' : '✗'}
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: '9px', color: 'rgba(255,255,255,0.4)', marginTop: '4px', fontStyle: 'italic' }}>
                        Optional - For tax compliance
                      </div>
                    </div>
                    <div className="form-group">
                      <label style={{ fontSize: '11px' }}>HOSPITAL REG #</label>
                      <div style={{ position: 'relative' }}>
                        <input 
                          type="text" 
                          value={formData.registrationNumber}
                          onChange={e => setFormData({...formData, registrationNumber: e.target.value.toUpperCase()})}
                          placeholder="e.g. HOS/2024/001234"
                          style={{ paddingLeft: '35px', textTransform: 'uppercase' }}
                        />
                        <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', opacity: 0.4, fontSize: '12px' }}>📋</span>
                      </div>
                      <div style={{ fontSize: '9px', color: 'rgba(255,255,255,0.4)', marginTop: '4px', fontStyle: 'italic' }}>
                        State health dept. registration
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginBottom: '15px' }}>
                    <div className="form-group">
                      <label style={{ fontSize: '11px' }}>PAN NUMBER</label>
                      <div style={{ position: 'relative' }}>
                        <input 
                          type="text" 
                          value={formData.panNumber}
                          onChange={e => setFormData({...formData, panNumber: e.target.value.toUpperCase()})}
                          placeholder="e.g. ABCDE1234F"
                          maxLength="10"
                          style={{ 
                            paddingLeft: '35px', 
                            textTransform: 'uppercase',
                            borderColor: formData.panNumber && !validatePAN(formData.panNumber) 
                              ? 'rgba(231, 76, 60, 0.5)' 
                              : formData.panNumber && validatePAN(formData.panNumber)
                              ? 'rgba(40, 167, 69, 0.5)'
                              : 'rgba(255, 255, 255, 0.1)'
                          }}
                        />
                        <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', opacity: 0.4, fontSize: '12px' }}>💳</span>
                        {formData.panNumber && (
                          <span style={{ 
                            position: 'absolute', 
                            right: '12px', 
                            top: '50%', 
                            transform: 'translateY(-50%)', 
                            fontSize: '12px',
                            color: validatePAN(formData.panNumber) ? '#28a745' : '#e74c3c'
                          }}>
                            {validatePAN(formData.panNumber) ? '✓' : '✗'}
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: '9px', color: 'rgba(255,255,255,0.4)', marginTop: '4px', fontStyle: 'italic' }}>
                        Optional - IT Department ID
                      </div>
                    </div>
                    <div className="form-group">
                      <label style={{ fontSize: '11px' }}>NABH/NABL #</label>
                      <div style={{ position: 'relative' }}>
                        <input 
                          type="text" 
                          value={formData.nabhNumber}
                          onChange={e => setFormData({...formData, nabhNumber: e.target.value.toUpperCase()})}
                          placeholder="e.g. H-2022-1234"
                          style={{ paddingLeft: '35px', textTransform: 'uppercase' }}
                        />
                        <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', opacity: 0.4, fontSize: '12px' }}>🎖️</span>
                      </div>
                      <div style={{ fontSize: '9px', color: 'rgba(255,255,255,0.4)', marginTop: '4px', fontStyle: 'italic' }}>
                        Quality accreditation number
                      </div>
                    </div>
                  </div>

                  <div className="form-group">
                    <label>CENTER ADDRESS</label>
                    <div style={{ position: 'relative' }}>
                      <textarea 
                        required 
                        value={formData.centerAddress}
                        onChange={e => setFormData({...formData, centerAddress: e.target.value})}
                        placeholder="Enter the clinical facility's physical infrastructure location..."
                        rows="3"
                        style={{ 
                          width: '100%', 
                          padding: '14px 14px 14px 40px', 
                          background: 'rgba(255, 255, 255, 0.05)', 
                          border: '1px solid rgba(255, 255, 255, 0.1)', 
                          borderRadius: '12px',
                          color: 'white',
                          fontFamily: 'inherit',
                          fontSize: '13px',
                          lineHeight: '1.6',
                          resize: 'none',
                          transition: 'all 0.3s ease'
                        }}
                        onFocus={(e) => {
                          e.target.style.borderColor = 'rgba(0, 242, 254, 0.5)';
                          e.target.style.boxShadow = '0 0 15px rgba(0, 242, 254, 0.1)';
                        }}
                        onBlur={(e) => {
                          e.target.style.borderColor = 'rgba(255, 255, 255, 0.1)';
                          e.target.style.boxShadow = 'none';
                        }}
                      />
                      <span style={{ position: 'absolute', left: '15px', top: '16px', opacity: 0.4, fontSize: '14px' }}>📍</span>
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '10px' }}>
                  <button type="button" onClick={() => setStep(formData.role === 'admindoctor' ? 3 : 2)} className="btn-logout" style={{ flex: 1, padding: '15px', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.7)' }}>
                    PREVIOUS
                  </button>
                  <button type="submit" className="btn-primary gamified-btn" style={{ flex: 2, padding: '15px', fontWeight: 900 }}>
                    FINALIZE DEPLOYMENT
                  </button>
                </div>
             </div>
          )}

          {error && (
            <div className="error-message" 
                 style={{ 
                   marginTop: '15px', 
                   background: errorCode === 'IDENTITY_ALREADY_ACTIVE' ? 'rgba(0, 242, 254, 0.1)' : 'rgba(231, 76, 60, 0.1)', 
                   color: errorCode === 'IDENTITY_ALREADY_ACTIVE' ? '#00f2fe' : '#e74c3c',
                   border: errorCode === 'IDENTITY_ALREADY_ACTIVE' ? '1px solid rgba(0, 242, 254, 0.2)' : '1px solid rgba(231, 76, 60, 0.2)',
                   padding: '15px',
                   borderRadius: '12px',
                   display: 'flex',
                   flexDirection: 'column',
                   gap: '10px'
                 }}>
              <span style={{ fontSize: '12px', fontWeight: 600 }}>{error}</span>
              
              {errorCode === 'IDENTITY_ALREADY_ACTIVE' && (
                <button 
                  type="button" 
                  onClick={() => navigate('/login', { state: { identifier: formData.mobile } })}
                  style={{ 
                    background: '#00f2fe', 
                    color: '#060a12', 
                    border: 'none', 
                    padding: '8px 12px', 
                    borderRadius: '6px', 
                    fontSize: '10px', 
                    fontWeight: 900, 
                    cursor: 'pointer',
                    alignSelf: 'flex-start',
                    boxShadow: '0 0 10px rgba(0, 242, 254, 0.3)'
                  }}
                >
                  RETURN TO LOGIN PORTAL
                </button>
              )}

              {errorCode === 'ROLE_NOT_FOUND' && (
                <p style={{ fontSize: '10px', opacity: 0.8, margin: 0 }}>
                  The selected role <span style={{ fontWeight: 800 }}>{formData.role}</span> is not available in the current baseline. 
                  Please select Chief Medical Officer or Operations Director.
                </p>
              )}
            </div>
          )}

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
