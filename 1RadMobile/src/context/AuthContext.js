import React, { createContext, useState, useContext, useCallback, useEffect } from 'react';
import * as SecureStore from 'expo-secure-store';
import apiClient from '../api/apiClient';

const AuthContext = createContext(null);

// API Configuration
const API_BASE_URL = 'https://1radapi-bch4ere7a6cmgkap.centralindia-01.azurewebsites.net/api/v1';

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [centers, setCenters] = useState([]);
  const [activeCenter, setActiveCenter] = useState(null);

  // Restoration Logic: Load session on startup
  useEffect(() => {
    async function restoreSession() {
      try {
        const storedToken = await SecureStore.getItemAsync('1rad_token');
        const storedUser = await SecureStore.getItemAsync('1rad_user');
        const storedCenters = await SecureStore.getItemAsync('1rad_centers');
        const storedActiveCenterId = await SecureStore.getItemAsync('1rad_active_center_id');

        if (storedToken) setToken(storedToken);
        if (storedUser) {
          const parsedUser = JSON.parse(storedUser);
          setUser(parsedUser);
          setIsAdmin(parsedUser.roles?.some(r => ['admin', 'admindoctor'].includes(r.toLowerCase())));
        }
        if (storedCenters) setCenters(JSON.parse(storedCenters));
        if (storedActiveCenterId) setActiveCenter(storedActiveCenterId);
      } catch (err) {
        console.error('[MOBILE AUTH] Session restoration failed:', err);
      }
    }
    restoreSession();
  }, []);

  // API Helper function
  const apiCall = async (endpoint, options = {}) => {
    try {
      const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        headers: {
          'Content-Type': 'application/json',
          ...options.headers,
        },
        ...options,
      });

      const data = await response.json();
      
      if (!response.ok) {
        return { 
          success: false, 
          error: data.error || data.Error || `HTTP ${response.status}`,
          errorCode: data.errorCode || data.ErrorCode,
          accountStatus: data.accountStatus || data.AccountStatus
        };
      }
      
      return { success: true, data };
    } catch (error) {
      console.error(`[MOBILE API] ${endpoint} failed:`, error);
      return { success: false, error: error.message };
    }
  };

  const sendOtp = useCallback(async (mobile) => {
    console.log(`[MOBILE AUTH] Sending OTP to ${mobile}`);
    const result = await apiCall('/auth/otp/send', {
      method: 'POST',
      body: JSON.stringify({ mobile }),
    });
    
    if (result.success) {
      console.log(`[MOBILE AUTH] OTP sent successfully`);
      return { success: true };
    } else {
      return { success: false, error: 'Failed to dispatch OTP.' };
    }
  }, []);

  const verifyOtp = useCallback(async (mobile, code) => {
    console.log(`[MOBILE AUTH] Verifying OTP for ${mobile}`);
    try {
      const response = await apiClient.post('/auth/otp/verify', { mobile, code }); // Backend expects mobile/code
        const data = response.data;
        const isRegistered = data.isRegistered !== undefined ? data.isRegistered : data.IsRegistered;
        const authToken = data.token || data.Token;
        const refreshToken = data.refreshToken || data.RefreshToken;
        const backendUser = data.user || data.User;
        
        if (isRegistered && backendUser) {
          const mappedUser = {
            id: backendUser.userId || backendUser.UserId,
            name: backendUser.fullName || backendUser.FullName,
            email: backendUser.email || backendUser.Email,
            mobile: backendUser.mobile || backendUser.Mobile,
            roles: (backendUser.roleName || backendUser.RoleName)?.split(',').map(r => r.trim().toLowerCase()) || []
          };
  
          const mappedCenters = (backendUser.authorizedHospitals || backendUser.AuthorizedHospitals || []).map(h => ({
            id: h.hospitalId || h.HospitalId,
            name: h.hospitalName || h.HospitalName,
            role: (h.roleName || h.RoleName)?.toLowerCase(),
            isDefault: h.isDefault !== undefined ? h.isDefault : h.IsDefault
          }));
  
          setToken(authToken);
          setUser(mappedUser);
          setCenters(mappedCenters);
          
          const defaultCenter = mappedCenters.find(c => c.isDefault) || mappedCenters[0];
          if (defaultCenter) setActiveCenter(defaultCenter.id);
  
          setIsAdmin(mappedUser.roles.some(r => ['admin', 'admindoctor'].includes(r)));
  
          // Persist
          await SecureStore.setItemAsync('1rad_token', authToken);
          await SecureStore.setItemAsync('1rad_refresh_token', refreshToken);
          await SecureStore.setItemAsync('1rad_user', JSON.stringify(mappedUser));
          await SecureStore.setItemAsync('1rad_centers', JSON.stringify(mappedCenters));
          if (defaultCenter) await SecureStore.setItemAsync('1rad_active_center_id', defaultCenter.id);
  
          return { success: true, isRegistered: true, user: mappedUser };
        } else {
          // Not registered
          return { success: true, isRegistered: false, token: authToken };
        }
    } catch (error) {
      console.error('[MOBILE AUTH] Verification failed:', error);
      return { success: false, error: error.response?.data?.message || 'Verification failed.' };
    }
  }, []);

  const login = useCallback(async (identifier, password) => {
    console.log(`[MOBILE AUTH] Login attempt for ${identifier}`);
    try {
      const response = await apiClient.post('/auth/login', { identifier, password });
      
      // Support both camelCase and PascalCase
      const data = response.data;
      const success = data.success !== undefined ? data.success : data.Success;
      const error = data.error || data.Error;
      const errorCode = data.errorCode || data.ErrorCode;
      const accountStatus = data.accountStatus || data.AccountStatus;
      const userProfile = data.userProfile || data.UserProfile;
      const accessToken = data.accessToken || data.AccessToken;
      const refreshToken = data.refreshToken || data.RefreshToken;
      
      if (success === false) {
        return { 
          success: false, 
          error: error || 'Authentication failed.', 
          errorCode, 
          accountStatus 
        };
      }

      const mappedUser = {
        id: userProfile.userId || userProfile.UserId,
        name: userProfile.fullName || userProfile.FullName,
        email: userProfile.email || userProfile.Email,
        roles: (userProfile.authorizedHospitals || userProfile.AuthorizedHospitals)[0]?.roleName?.split(',').map(r => r.trim().toLowerCase()) || []
      };

      const mappedCenters = (userProfile.authorizedHospitals || userProfile.AuthorizedHospitals).map(h => ({
        id: h.hospitalId || h.HospitalId,
        name: h.hospitalName || h.HospitalName,
        role: (h.roleName || h.RoleName).toLowerCase(),
        isDefault: h.isDefault !== undefined ? h.isDefault : h.IsDefault
      }));

      setToken(accessToken);
      setUser(mappedUser);
      setCenters(mappedCenters);
      
      const defaultCenter = mappedCenters.find(c => c.isDefault) || mappedCenters[0];
      if (defaultCenter) setActiveCenter(defaultCenter.id);

      setIsAdmin(mappedUser.roles.some(r => ['admin', 'admindoctor'].includes(r)));

      // Persist
      await SecureStore.setItemAsync('1rad_token', accessToken);
      await SecureStore.setItemAsync('1rad_refresh_token', refreshToken);
      await SecureStore.setItemAsync('1rad_user', JSON.stringify(mappedUser));
      await SecureStore.setItemAsync('1rad_centers', JSON.stringify(mappedCenters));
      if (defaultCenter) await SecureStore.setItemAsync('1rad_active_center_id', defaultCenter.id);
      
      return { success: true, user: mappedUser };
    } catch (error) {
      console.error('[MOBILE AUTH] Login failed:', error);
      const resp = error.response?.data;
      if (resp) {
        console.log('[MOBILE AUTH] Error details:', JSON.stringify(resp));
      }
      
      return { 
        success: false, 
        error: resp?.error || resp?.Error || 'Authentication failed.',
        errorCode: resp?.errorCode || resp?.ErrorCode,
        accountStatus: resp?.accountStatus || resp?.AccountStatus
      };
    }
  }, []);

  const logout = useCallback(async () => {
    setUser(null);
    setToken(null);
    setCenters([]);
    setActiveCenter(null);
    setIsAdmin(false);
    await SecureStore.deleteItemAsync('1rad_token');
    await SecureStore.deleteItemAsync('1rad_refresh_token');
    await SecureStore.deleteItemAsync('1rad_user');
    await SecureStore.deleteItemAsync('1rad_centers');
    await SecureStore.deleteItemAsync('1rad_active_center_id');
  }, []);

  const registerUser = useCallback(async (userData) => {
    console.log('[MOBILE AUTH] Registering User:', userData);
    
    try {
      // Stage 2: Identity Setup
      const identityResult = await apiCall('/auth/identity-setup', {
        method: 'POST',
        body: JSON.stringify({
          fullName: userData.name,
          email: userData.email,
          mobile: userData.mobile,
          password: userData.password
        }),
      });

      if (!identityResult.success) {
        return { 
          success: false, 
          error: identityResult.error, 
          errorCode: identityResult.errorCode 
        };
      }

      // Stage 3: Infrastructure Deployment
      const deployResult = await apiCall('/auth/deploy-infrastructure', {
        method: 'POST',
        body: JSON.stringify({
          userId: identityResult.data.userId,
          chainName: userData.chainName || userData.centerName,
          hospitalName: userData.centerName,
          hospitalAddress: userData.centerAddress,
          gstin: userData.gstinNumber,
          registrationNumber: userData.registrationNumber,
          pan: userData.panNumber,
          nabhNumber: userData.nabhNumber,
          specialization: userData.specialization,
          degree: userData.degree,
          licenseNo: userData.licenseNo,
          roleName: userData.role === 'admindoctor' ? 'AdminDoctor' : 'Admin'
        }),
        headers: {
          'Authorization': `Bearer ${identityResult.data.token}`,
        },
      });

      if (deployResult.success) {
        console.log('[MOBILE AUTH] Registration completed successfully');
        return { success: true };
      } else {
        return { 
          success: false, 
          error: deployResult.error, 
          errorCode: deployResult.errorCode 
        };
      }
    } catch (error) {
      console.error('[MOBILE AUTH] Registration failed:', error);
      return { success: false, error: 'Registration sequence failed.' };
    }
  }, []);

  const switchCenter = useCallback(async (hospitalId) => {
    try {
      const response = await apiClient.post('/auth/switch-context', { targetHospitalId: hospitalId });
      const { accessToken, roles } = response.data;
      
      setToken(accessToken);
      await SecureStore.setItemAsync('1rad_token', accessToken);
      
      setUser(prev => ({
        ...prev,
        roles: roles.map(r => r.toLowerCase())
      }));
      
      setActiveCenter(hospitalId);
      await SecureStore.setItemAsync('1rad_active_center_id', hospitalId);
      
      return { success: true, role: roles[0]?.toLowerCase() };
    } catch (error) {
      console.error('[MOBILE AUTH] Context switch failed:', error);
      return { success: false };
    }
  }, []);

  return (
    <AuthContext.Provider value={{ 
      user, 
      token,
      isAdmin, 
      centers,
      activeCenter,
      sendOtp, 
      verifyOtp, 
      login, 
      logout,
      registerUser,
      switchCenter
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
}
