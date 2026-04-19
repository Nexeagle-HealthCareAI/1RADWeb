import { createContext, useState, useCallback, useEffect, useMemo } from 'react';
import apiClient from '../api/apiClient';

export const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [centers, setCenters] = useState(() => {
    const stored = localStorage.getItem('1rad_centers');
    return stored ? JSON.parse(stored) : [];
  });

  const [activeCenterId, setActiveCenterId] = useState(() => {
    return localStorage.getItem('1rad_active_center_id') || (centers[0]?.id);
  });

  const [currentUser, setCurrentUser] = useState(() => {
    // Current session persistence
    const stored = sessionStorage.getItem('1rad_user');
    return stored ? JSON.parse(stored) : null;
  });

  // Sync users and centers to localStorage whenever they change
  useEffect(() => {
    try {
      localStorage.setItem('1rad_centers', JSON.stringify(centers));
      localStorage.setItem('1rad_active_center_id', activeCenterId);
    } catch (e) {
      if (e.name === 'QuotaExceededError') {
        alert('CRITICAL STORAGE ALERT: Your browser storage (5MB) is full. This is likely due to large clinical report formats. Please delete unused doctors or compress your medical images.');
        console.error('LocalStorage Quota Exceeded:', e);
      }
    }
  }, [centers, activeCenterId]);

  const activeCenter = useMemo(() => {
    return centers.find(c => c.id === activeCenterId) || centers[0];
  }, [centers, activeCenterId]);

  const switchCenter = useCallback(async (id) => {
    try {
      const response = await apiClient.post('/auth/switch-context', { targetHospitalId: id });
      const { success, accessToken, error } = response.data;

      if (!success) {
        alert(error || 'Failed to switch context');
        return;
      }

      // Update token for subsequent requests
      sessionStorage.setItem('1rad_token', accessToken);
      
      // Update local state
      setActiveCenterId(id);
      
      // Update currentUser roles based on the target center's role
      const targetCenter = centers.find(c => c.id === id);
      if (targetCenter && targetCenter.role) {
        setCurrentUser(prev => ({
          ...prev,
          roles: [targetCenter.role]
        }));
      }

      return { success: true, role: targetCenter?.role };
    } catch (err) {
      console.error('[AUTH] Context switch failure', err);
      alert('SECURITY ALERT: Context transition failed. Please re-login.');
    }
  }, [centers]);

  const login = useCallback(async (identifier, password) => {
    try {
      const response = await apiClient.post('/auth/login', { identifier, password });
      const { userProfile, accessToken, refreshToken, success, error, errorCode, accountStatus } = response.data;
      
      if (!success) return { 
        success: false, 
        error: error || 'Authentication failed.',
        errorCode,
        accountStatus
      };

      const user = {
        id: userProfile.userId,
        name: userProfile.fullName,
        email: userProfile.email,
        roles: userProfile.authorizedHospitals.map(h => h.roleName.toLowerCase())
      };

      const mappedCenters = userProfile.authorizedHospitals.map(h => ({
        id: h.hospitalId,
        name: h.hospitalName,
        role: h.roleName.toLowerCase()
      }));

      setCurrentUser(user);
      setCenters(mappedCenters);
      if (mappedCenters.length > 0) setActiveCenterId(mappedCenters[0].id);

      sessionStorage.setItem('1rad_user', JSON.stringify(user));
      sessionStorage.setItem('1rad_token', accessToken);
      localStorage.setItem('1rad_refresh_token', refreshToken);
      
      return { success: true, user };
    } catch (error) {
      const resp = error.response?.data;
      const errorMsg = resp?.error || resp?.message || resp?.detail || 'Authentication failed.';
      return { 
        success: false, 
        error: errorMsg,
        errorCode: resp?.errorCode,
        accountStatus: resp?.accountStatus
      };
    }
  }, []);

  const logout = useCallback(() => {
    setCurrentUser(null);
    sessionStorage.removeItem('1rad_user');
    sessionStorage.removeItem('1rad_token');
    sessionStorage.removeItem('1rad_initiation_token');
    localStorage.removeItem('1rad_refresh_token');
  }, []);

  const registerAdminDoctor = useCallback(async (userData) => {
    if (userData.password && userData.password.length < 6) {
      return { success: false, error: 'SECURITY PROTOCOL: Password must be at least 6 characters.' };
    }
    try {
      // Stage 2: Identity Setup
      const identityRes = await apiClient.post('/auth/identity-setup', {
        fullName: userData.fullName,
        email: userData.email,
        mobile: userData.mobile,
        password: userData.password
      });

      const { token: nextToken, userId, error: idError, errorCode: idCode } = identityRes.data;
      if (idError) return { success: false, error: idError, errorCode: idCode };
      
      sessionStorage.setItem('1rad_initiation_token', nextToken);

      // Stage 3: Infrastructure Deployment
      const roleNameMap = {
        'admindoctor': 'AdminDoctor',
        'administrator': 'Admin',
        'doctor': 'Doctor',
        'technician': 'Technician',
        'receptionist': 'Receptionist',
        'accountant': 'Accountant'
      };

      const deployRes = await apiClient.post('/auth/deploy-infrastructure', {
        userId: userId,
        chainId: null, // Guid
        chainName: userData.chainName || userData.centerName,
        hospitalName: userData.centerName,
        hospitalAddress: userData.centerAddress,
        roleName: roleNameMap[userData.role] || 'AdminDoctor',
        gstinNumber: userData.gstinNumber,
        registrationNumber: userData.registrationNumber,
        panNumber: userData.panNumber,
        nabhNumber: userData.nabhNumber,
        specialization: userData.specialization,
        degree: userData.degree,
        licenseNo: userData.licenseNo
      }, {
        headers: { Authorization: `Bearer ${nextToken}` }
      });

      const { success: dSuccess, error: dError, errorCode: dCode } = deployRes.data;
      if (!dSuccess) return { success: false, error: dError, errorCode: dCode };

      // After deployment, user needs to login or we auto-login
      return { success: true };
    } catch (error) {
      const resp = error.response?.data;
      const errorMsg = resp?.error || resp?.message || resp?.detail || 'Registration sequence failed.';
      return { 
        success: false, 
        error: errorMsg,
        errorCode: resp?.errorCode 
      };
    }
  }, []);

  const sendOtp = useCallback(async (identifier) => {
    try {
      const cleanMobile = identifier.replace(/\D/g, '');
      const response = await apiClient.post('/auth/otp/send', { mobile: cleanMobile });
      return { 
        success: true, 
        message: response.data.message 
      };
    } catch (error) {
      const errorMsg = error.response?.data?.error || error.response?.data?.message || error.response?.data?.detail || 'Failed to dispatch OTP.';
      return { 
        success: false, 
        error: errorMsg
      };
    }
  }, []);

  const verifyOtp = useCallback(async (identifier, code) => {
    try {
      const cleanMobile = identifier.replace(/\D/g, '');
      const response = await apiClient.post('/auth/otp/verify', { mobile: cleanMobile, code });
      const { success, token, refreshToken, user: backendUser, isRegistered, message } = response.data;

      if (!success) return { success: false, error: message || 'Verification failed.' };

      if (isRegistered) {
        const user = {
          id: backendUser.userId,
          name: backendUser.fullName,
          email: backendUser.email,
          mobile: backendUser.mobile,
          roles: backendUser.roleName.split(',').map(r => r.trim().toLowerCase())
        };

        const mappedCenters = (backendUser.authorizedHospitals || []).map(h => ({
          id: h.hospitalId,
          name: h.hospitalName,
          role: h.roleName.toLowerCase()
        }));

        setCurrentUser(user);
        setCenters(mappedCenters);
        if (mappedCenters.length > 0) {
          const defaultCenter = mappedCenters.find(c => c.isDefault) || mappedCenters[0];
          setActiveCenterId(defaultCenter.id);
        }

        sessionStorage.setItem('1rad_user', JSON.stringify(user));
        sessionStorage.setItem('1rad_token', token);
        localStorage.setItem('1rad_refresh_token', refreshToken);
        return { success: true, isRegistered: true, user };
      } else {
        // Registration path - store initiation token
        sessionStorage.setItem('1rad_initiation_token', token);
        return { success: true, isRegistered: false };
      }
    } catch (error) {
      const errorMsg = error.response?.data?.error || error.response?.data?.message || error.response?.data?.detail || 'Verification failed.';
      return { success: false, error: errorMsg };
    }
  }, []);

  const forgotPassword = useCallback(async (identifier) => {
    try {
      const response = await apiClient.post('/auth/forgot-password', { identifier });
      return { success: true, message: response.data.message };
    } catch (error) {
      const errorMsg = error.response?.data?.error || error.response?.data?.message || error.response?.data?.detail || 'Failed to initiate recovery.';
      return { success: false, error: errorMsg };
    }
  }, []);

  const verifyResetCode = useCallback(async (identifier, code) => {
    try {
      const response = await apiClient.post('/auth/verify-reset-code', { identifier, code });
      const { success, resetToken, error } = response.data;
      if (success) {
        sessionStorage.setItem('1rad_reset_token', resetToken);
        return { success: true };
      }
      return { success: false, error: error || 'Verification failed.' };
    } catch (error) {
      const errorMsg = error.response?.data?.error || error.response?.data?.message || error.response?.data?.detail || 'Verification failed.';
      return { success: false, error: errorMsg };
    }
  }, []);

  const resetPassword = useCallback(async (newPassword) => {
     const resetToken = sessionStorage.getItem('1rad_reset_token');
     if (!resetToken) return { success: false, error: 'Reset session expired. Please re-verify.' };
     
     try {
       await apiClient.post('/auth/reset-password', { resetToken, newPassword });
       sessionStorage.removeItem('1rad_reset_token'); // Clean up
       return { success: true };
     } catch (error) {
       const errorMsg = error.response?.data?.error || error.response?.data?.message || error.response?.data?.detail || 'Password reset failed.';
       return { success: false, error: errorMsg };
     }
  }, []);

  const createCenter = useCallback((centerData) => {
    const centerId = `C-${Date.now()}`;
    const newCenter = {
      id: centerId,
      ...centerData,
      status: 'active'
    };
    setCenters(prev => [...prev, newCenter]);
    setActiveCenterId(centerId);
    return { success: true, center: newCenter };
  }, []);

  // Check if there's at least one admin doctor registered
  const hasAdminDoctor = useMemo(() => {
    // For now, we'll assume there's always an admin doctor available
    // In a real implementation, this would check the backend or local storage
    // for existing admin doctor registrations
    return true;
  }, []);

  return (
    <AuthContext.Provider value={{ 
      currentUser, 
      centers,
      activeCenter,
      switchCenter,
      createCenter,
      hasAdminDoctor,
      login, 
      logout,
      registerAdminDoctor,
      sendOtp,
      verifyOtp,
      forgotPassword,
      verifyResetCode,
      resetPassword
    }}>
      {children}
    </AuthContext.Provider>
  );
}
