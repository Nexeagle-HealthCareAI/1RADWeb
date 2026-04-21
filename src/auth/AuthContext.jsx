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
      const { success, accessToken, roles, error } = response.data;

      if (!success) {
        alert(error || 'Failed to switch context');
        return;
      }

      // 1. Update token for subsequent security-validated requests
      sessionStorage.setItem('1rad_token', accessToken);
      
      // 2. Lock the active Hub ID in storage to ensure persistence after reload
      localStorage.setItem('1rad_active_center_id', id);
      setActiveCenterId(id);
      
      // 3. Synchronize currentUser with roles returned by the backend
      // We normalize roles to lowercase to match the application's security checks
      const normalizedRoles = (roles || []).map(r => String(r).trim().toLowerCase()).filter(Boolean);
      
      const updatedUser = { 
        ...currentUser, 
        roles: normalizedRoles 
      };
      
      setCurrentUser(updatedUser);
      sessionStorage.setItem('1rad_user', JSON.stringify(updatedUser));

      return { success: true, roles: normalizedRoles };
    } catch (err) {
      console.error('[AUTH] Context switch failure', err);
      return { success: false, error: 'SECURITY ALERT: Context transition failed. Please re-login.' };
    }
  }, [currentUser]);

  const refreshCenters = useCallback(async () => {
    try {
      const resp = await apiClient.get('/auth/hubs');
      const data = resp.data || {};
      
      // Handle both wrapped { success, hospitals } and direct [hospitals] responses
      // Also account for different possible keys (hospitals, hubs, authorizedHubs, authorizedHospitals)
      const hospitals = Array.isArray(data) 
        ? data 
        : (data.hospitals || data.Hospitals || data.authorizedHospitals || data.AuthorizedHospitals || data.hubs || data.Hubs || data.authorizedHubs || data.AuthorizedHubs || []);
      
      const isSuccess = Array.isArray(data) 
        ? true 
        : (data.success !== undefined ? data.success : (data.Success !== undefined ? data.Success : true));

      if (!isSuccess || (!Array.isArray(data) && !data.hospitals && !data.Hospitals && !data.authorizedHospitals && !data.AuthorizedHospitals && !data.hubs && !data.Hubs && !data.authorizedHubs && !data.AuthorizedHubs)) {
        console.warn('[AUTH] Hub synchronization returned empty or failed state');
        // If it failed but we have data in localStorage, don't wipe it
        if (!isSuccess && centers.length > 0) return { success: false };
      }

      const allRoles = [];
      const mappedCenters = (hospitals || []).map(h => {
        if (!h) return null;
        const rawRoles = h.roleNames || h.RoleNames || h.roles || h.Roles || (h.roleName || h.RoleName ? (h.roleName || h.RoleName).split(',') : []);
        const normalizedRoles = Array.isArray(rawRoles) 
          ? rawRoles.map(r => String(r).trim().toLowerCase()).filter(Boolean)
          : [];
          
        allRoles.push(...normalizedRoles);
        
        const hId = h.hospitalId || h.HospitalId || h.id || h.Id;
        if (!hId) return null;

        return {
          id: String(hId).toLowerCase(),
          name: h.hospitalName || h.HospitalName || h.name || h.Name || 'Unnamed Hub',
          groupId: h.groupId || h.GroupId || h.HospitalGroupId || '',
          groupName: h.groupName || h.GroupName || h.group || '',
          roles: normalizedRoles,
          role: normalizedRoles[0] || 'viewer',
          isDefault: h.isDefault || h.IsDefault,
          isAutoBillingEnabled: h.isAutoBillingEnabled || h.IsAutoBillingEnabled || false
        };
      }).filter(Boolean);

      if (mappedCenters.length > 0) {
        setCenters(mappedCenters);
        setCurrentUser(prev => prev ? {
          ...prev,
          roles: [...new Set([...(prev.roles || []), ...allRoles])]
        } : null);
      }

      return { success: true, centers: mappedCenters };
    } catch (err) {
      console.error('[AUTH] Hub refresh failure', err);
      return { success: false, error: 'Failed to synchronize institutional hubs.' };
    }
  }, [centers.length]);

  // Synchronize Hub Discovery: Automatically refresh centers list when session starts
  useEffect(() => {
    if (currentUser?.id) {
      refreshCenters();
    }
  }, [currentUser?.id, refreshCenters]);

  const login = useCallback(async (identifier, password) => {
    try {
      const resp = await apiClient.post('/auth/login', { identifier, password });
      const data = resp.data || {};
      
      const isSuccess = data.success || data.Success;
      const userProfile = data.userProfile || data.UserProfile;
      
      if (!isSuccess || !userProfile) {
        return { 
          success: false, 
          error: data.error || data.Error || 'Authentication failed.',
          errorCode: data.errorCode || data.ErrorCode,
          accountStatus: data.accountStatus || data.AccountStatus
        };
      }

      const accessToken = data.accessToken || data.AccessToken;
      const refreshToken = data.refreshToken || data.RefreshToken;

      // CRITICAL: Persist credentials BEFORE triggering state updates that rely on the token
      sessionStorage.setItem('1rad_token', accessToken);
      localStorage.setItem('1rad_refresh_token', refreshToken);

      const allRoles = [];
      const authorizedHubs = userProfile.authorizedHospitals || userProfile.AuthorizedHospitals || [];

      const mappedCenters = authorizedHubs.map(h => {
        const rawRoles = h.roleNames || h.RoleNames || (h.roleName || h.RoleName ? (h.roleName || h.RoleName).split(',') : []);
        const normalizedRoles = rawRoles.map(r => r.trim().toLowerCase()).filter(Boolean);
        allRoles.push(...normalizedRoles);
        
        return {
          id: String(h.hospitalId || h.HospitalId).toLowerCase(),
          name: h.hospitalName || h.HospitalName,
          groupName: h.groupName || h.GroupName || '',
          roles: normalizedRoles,
          role: normalizedRoles[0] || 'viewer',
          isAutoBillingEnabled: h.isAutoBillingEnabled || h.IsAutoBillingEnabled || false
        };
      });

      const user = {
        id: userProfile.userId || userProfile.UserId,
        name: userProfile.fullName || userProfile.FullName,
        email: userProfile.email || userProfile.Email,
        roles: [...new Set(allRoles)]
      };

      setCurrentUser(user);
      setCenters(mappedCenters);
      if (mappedCenters.length > 0) setActiveCenterId(mappedCenters[0].id);

      sessionStorage.setItem('1rad_user', JSON.stringify(user));
      
      return { success: true, user };
    } catch (error) {
      const respData = error.response?.data || {};
      return { 
        success: false, 
        error: respData.error || respData.message || 'Authentication failed.',
        errorCode: respData.errorCode || respData.ErrorCode,
        accountStatus: respData.accountStatus || respData.AccountStatus
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
        const allRoles = [];
        const mappedCenters = (backendUser.authorizedHospitals || backendUser.AuthorizedHospitals || []).map(h => {
          const rawRoles = h.roleNames || h.RoleNames || (h.roleName || h.RoleName ? (h.roleName || h.RoleName).split(',') : []);
          const normalizedRoles = rawRoles.map(r => r.trim().toLowerCase()).filter(Boolean);
          allRoles.push(...normalizedRoles);
          return {
            id: h.hospitalId || h.HospitalId,
            name: h.hospitalName || h.HospitalName,
            groupName: h.groupName || h.GroupName || '',
            roles: normalizedRoles,
            role: normalizedRoles[0] || 'viewer',
            isDefault: h.isDefault || h.IsDefault,
            isAutoBillingEnabled: h.isAutoBillingEnabled || h.IsAutoBillingEnabled || false
          };
        });

        const user = {
          id: backendUser.userId || backendUser.UserId,
          name: backendUser.fullName || backendUser.FullName,
          email: backendUser.email || backendUser.Email,
          mobile: backendUser.mobile || backendUser.Mobile,
          roles: [...new Set(allRoles)]
        };

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
      const data = response.data || {};
      const success = data.success || data.Success;
      const resetToken = data.resetToken || data.ResetToken;
      const error = data.error || data.Error;
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
      hasAdminDoctor,
      login, 
      logout,
      refreshCenters,
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
