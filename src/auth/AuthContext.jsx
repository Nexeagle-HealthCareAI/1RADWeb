import { createContext, useState, useCallback, useEffect, useMemo, useRef } from 'react';
import apiClient from '../api/apiClient';
import { StudyPrefetcher } from '../utils/StudyPrefetcher';
import { DicomCache } from '../utils/DicomCache';

export const AuthContext = createContext(null);


const handleUserRoles = (profile) => {
  if (!profile) return [];
  const hubs = profile.authorizedHospitals || profile.AuthorizedHospitals || [];
  const roles = new Set();
  hubs.forEach(h => {
    // Collect roles from multiple possible keys used by backend DTOs
    const rawRoles = h.roleNames || h.RoleNames || h.roles || h.Roles || 
                    (h.roleName || h.RoleName ? (h.roleName || h.RoleName).split(',').map(r => r.trim()) : []);
    
    if (Array.isArray(rawRoles)) {
      rawRoles.forEach(r => {
        if (r) roles.add(String(r).replace(/\s+/g, '').toLowerCase());
      });
    }
  });
  return Array.from(roles).filter(Boolean);
};

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

  // --- INACTIVE SESSION MANAGEMENT ---
  const [showTimeoutModal, setShowTimeoutModal] = useState(false);
  const [timeoutCountdown, setTimeoutCountdown] = useState(120); // 2 minutes warning
  const idleTimerRef = useRef(null);
  const countdownTimerRef = useRef(null);

  const IDLE_LIMIT = 14 * 60 * 1000; // 14 minutes of inactivity before warning
  const COUNTDOWN_START = 60; // 1 minute warning countdown
  const lastActivityRef = useRef(Date.now());

  const [subscription, setSubscription] = useState(null);


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

  // Sync custom roles from backend to local cache whenever the active center changes
  const syncCustomRoles = async (hospitalId, tokenOverride) => {
    try {
      const headers = tokenOverride ? { Authorization: `Bearer ${tokenOverride}` } : {};
      const res = await apiClient.get('/CustomRoles', { headers });
      const mapped = res.data.map(r => ({
        roleId: r.roleId ?? r.RoleId,
        roleName: r.roleName ?? r.RoleName ?? '',
        description: r.description ?? r.Description ?? '',
        allowedRoutes: r.permissions ?? r.Permissions ?? []
      }));
      const key = `1rad_custom_roles_${String(hospitalId).toLowerCase()}`;
      localStorage.setItem(key, JSON.stringify(mapped));
      // Notify any listening components
      window.dispatchEvent(new Event('1rad_permissions_updated'));
    } catch (err) {
      console.warn('[AUTH] Background custom roles sync failed:', err);
    }
  };

  useEffect(() => {
    if (activeCenterId && (sessionStorage.getItem('1rad_token') || sessionStorage.getItem('1rad_initiation_token'))) {
      syncCustomRoles(activeCenterId);
    }
  }, [activeCenterId]);

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
      const normalizedRoles = (roles || []).map(r => String(r).replace(/\s+/g, '').toLowerCase()).filter(Boolean);
      
      const updatedUser = { 
        ...currentUser, 
        roles: normalizedRoles 
      };
      
      setCurrentUser(updatedUser);
      sessionStorage.setItem('1rad_user', JSON.stringify(updatedUser));
      
      // Ensure roles are synced before redirecting/resolving
      await syncCustomRoles(id, accessToken);

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
          ? rawRoles.map(r => String(r).replace(/\s+/g, '').toLowerCase()).filter(Boolean)
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
        // Optimization: Only update if content changed
        const hasCenterChanges = JSON.stringify(mappedCenters) !== JSON.stringify(centers);
        if (hasCenterChanges) {
          setCenters(mappedCenters);
        }

        const newRoles = [...new Set([...(currentUser?.roles || []), ...allRoles])].sort();
        const oldRoles = [...(currentUser?.roles || [])].sort();
        const hasRoleChanges = JSON.stringify(newRoles) !== JSON.stringify(oldRoles);

        if (hasRoleChanges) {
          setCurrentUser(prev => prev ? {
            ...prev,
            roles: newRoles
          } : null);
        }
      }

      return { success: true, centers: mappedCenters };
    } catch (err) {
      console.error('[AUTH] Hub refresh failure', err);
      return { success: false, error: 'Failed to synchronize institutional hubs.' };
    }
  }, []); // Stable callback

  const refreshSubscription = useCallback(async () => {
    if (!currentUser) return;
    try {
      // Tactical: Use relative path to BASE_URL to ensure api/v1 prefix is preserved
      const resp = await apiClient.get('subscriptions/status');
      setSubscription(resp.data);
    } catch (err) {
      if (err.response?.status === 404) {
        console.warn('[AUTH] Subscription endpoint not found. Ensure backend is deployed with SubscriptionsController.');
      } else {
        console.error('[AUTH] Subscription sync failure', err);
      }
    }
  }, [currentUser?.id]); // Depend on ID, not object reference

  // Synchronize Hub Discovery: Automatically refresh centers list when session starts
  useEffect(() => {
    if (currentUser?.id) {
      refreshCenters();
      refreshSubscription();
      // Kick off background pre-download of today's worklist for radiologists.
      // Guardrails (role, network, storage) live inside the prefetcher.
      StudyPrefetcher.start(currentUser);

      // Fix #3: Periodically re-check subscription status every 20 minutes so that
      // expiry is caught during long active sessions without requiring a page reload.
      const SUBSCRIPTION_POLL_INTERVAL = 20 * 60 * 1000; // 20 minutes
      const subscriptionPoller = setInterval(() => {
        refreshSubscription();
      }, SUBSCRIPTION_POLL_INTERVAL);

      return () => clearInterval(subscriptionPoller);
    } else {
      StudyPrefetcher.stop();
    }
  }, [currentUser?.id, refreshCenters, refreshSubscription]);

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

      const allRoles = handleUserRoles(userProfile);

      const mappedCenters = (userProfile.authorizedHospitals || userProfile.AuthorizedHospitals || []).map(h => {
        const centerRoles = h.roleNames || h.RoleNames || h.roles || h.Roles || (h.roleName || h.RoleName ? (h.roleName || h.RoleName).split(',') : []);
        const normalizedCenterRoles = centerRoles.map(r => String(r).replace(/\s+/g, '').toLowerCase()).filter(Boolean);
        
        return {
          id: String(h.hospitalId || h.HospitalId).toLowerCase(),
          name: h.hospitalName || h.HospitalName,
          groupName: h.groupName || h.GroupName || '',
          roles: normalizedCenterRoles,
          role: normalizedCenterRoles[0] || 'viewer',
          isAutoBillingEnabled: h.isAutoBillingEnabled || h.IsAutoBillingEnabled || false
        };
      });

      const user = {
        id: userProfile.userId || userProfile.UserId,
        name: userProfile.fullName || userProfile.FullName,
        email: userProfile.email || userProfile.Email,
        roles: allRoles
      };

      setCurrentUser(user);
      setCenters(mappedCenters);
      let defaultCenterId = mappedCenters.length > 0 ? mappedCenters[0].id : null;
      if (defaultCenterId) {
        setActiveCenterId(defaultCenterId);
        // Ensure roles are fully downloaded before login resolves
        await syncCustomRoles(defaultCenterId, accessToken);
      }

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

    // PHI hygiene: stop background downloads and purge the local DICOM cache on logout.
    StudyPrefetcher.stop();
    DicomCache.clear().catch(() => {});

    // Clear timers
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
    setShowTimeoutModal(false);
  }, []);

  const resetIdleTimer = useCallback(() => {
    if (!currentUser) return;
    
    // Reset state if modal was showing
    setShowTimeoutModal(false);
    setTimeoutCountdown(COUNTDOWN_START);

    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);

    idleTimerRef.current = setTimeout(() => {
      setShowTimeoutModal(true);
      startCountdown();
    }, IDLE_LIMIT);
  }, [currentUser]);

  const startCountdown = () => {
    if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
    
    let timeRemaining = COUNTDOWN_START;
    setTimeoutCountdown(timeRemaining);

    countdownTimerRef.current = setInterval(() => {
      timeRemaining -= 1;
      setTimeoutCountdown(timeRemaining);
      
      if (timeRemaining <= 0) {
        clearInterval(countdownTimerRef.current);
        logout();
      }
    }, 1000);
  };

  // Activity Listeners
  useEffect(() => {
    if (!currentUser) return;

    let lastActivity = Date.now();
    const throttleMs = 2000; // Only reset every 2 seconds

    const handleActivity = () => {
      const now = Date.now();
      if (now - lastActivityRef.current > throttleMs) {
        lastActivityRef.current = now;
        resetIdleTimer();
      }
    };

    const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart'];


    events.forEach(event => window.addEventListener(event, handleActivity));
    
    // Initial start
    resetIdleTimer();

    return () => {
      events.forEach(event => window.removeEventListener(event, handleActivity));
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
    };
  }, [currentUser, resetIdleTimer]);


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
        const allRoles = handleUserRoles(backendUser);
        const mappedCenters = (backendUser.authorizedHospitals || backendUser.AuthorizedHospitals || []).map(h => {
          const centerRoles = h.roleNames || h.RoleNames || h.roles || h.Roles || (h.roleName || h.RoleName ? (h.roleName || h.RoleName).split(',') : []);
          const normalizedCenterRoles = centerRoles.map(r => String(r).replace(/\s+/g, '').toLowerCase()).filter(Boolean);

          return {
            id: String(h.hospitalId || h.HospitalId).toLowerCase(),
            name: h.hospitalName || h.HospitalName,
            groupName: h.groupName || h.GroupName || '',
            roles: normalizedCenterRoles,
            role: normalizedCenterRoles[0] || 'viewer',
            isDefault: h.isDefault || h.IsDefault,
            isAutoBillingEnabled: h.isAutoBillingEnabled || h.IsAutoBillingEnabled || false
          };
        });

        const user = {
          id: backendUser.userId || backendUser.UserId,
          name: backendUser.fullName || backendUser.FullName,
          email: backendUser.email || backendUser.Email,
          mobile: backendUser.mobile || backendUser.Mobile,
          roles: allRoles
        };

        setCurrentUser(user);
        setCenters(mappedCenters);
        if (mappedCenters.length > 0) {
          const defaultCenter = mappedCenters.find(c => c.isDefault) || mappedCenters[0];
          setActiveCenterId(defaultCenter.id);
          // Block until custom roles are populated so immediate router checks pass
          await syncCustomRoles(defaultCenter.id, token);
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

  const contextualUser = useMemo(() => {
    if (!currentUser) return null;
    return {
      ...currentUser,
      roles: activeCenter?.roles || currentUser.roles || []
    };
  }, [currentUser, activeCenter]);

  return (
    <AuthContext.Provider value={{ 
      currentUser: contextualUser, 
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
      resetPassword,
      showTimeoutModal,
      timeoutCountdown,
      resetIdleTimer,
      subscription,
      refreshSubscription
    }}>
      {children}
    </AuthContext.Provider>
  );
}
