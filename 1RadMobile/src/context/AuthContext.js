import React, { createContext, useState, useContext, useCallback, useEffect } from 'react';
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

  // Sync token with apiClient
  useEffect(() => {
    if (token) {
      apiClient.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    } else {
      delete apiClient.defaults.headers.common['Authorization'];
    }
  }, [token]);

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
        throw new Error(data.error || `HTTP ${response.status}`);
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
      const response = await apiClient.post('/auth/otp/verify', { identifier: mobile, otp: code });
      const { type, token: authToken, user: userData } = response.data;
      
      if (type === 'Login') {
        setToken(authToken);
        setUser(userData);
        setIsAdmin(userData.roles?.includes('admin') || userData.roles?.includes('admindoctor'));
        return { success: true, type: 'Login', user: userData };
      } else {
        return { success: true, type: 'Register', token: authToken };
      }
    } catch (error) {
      console.error('[MOBILE AUTH] Verification failed:', error);
      return { success: false, error: error.response?.data?.error || 'Verification failed.' };
    }
  }, []);

  const login = useCallback(async (identifier, password) => {
    console.log(`[MOBILE AUTH] Login attempt for ${identifier}`);
    try {
      const response = await apiClient.post('/auth/login', { identifier, password });
      const { user: userData, token: authToken, centers: userCenters, activeCenter: userActiveCenter } = response.data;
      
      setToken(authToken);
      setUser(userData);
      setIsAdmin(userData.roles?.includes('admin') || userData.roles?.includes('admindoctor'));
      
      if (userCenters) setCenters(userCenters);
      if (userActiveCenter) setActiveCenter(userActiveCenter);
      
      return { success: true, user: userData };
    } catch (error) {
      console.error('[MOBILE AUTH] Login failed:', error);
      return { success: false, error: error.response?.data?.error || 'Authentication failed.' };
    }
  }, []);

  const logout = useCallback(() => {
    setUser(null);
    setIsAdmin(false);
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
        return { success: false, error: identityResult.error };
      }

      // Stage 3: Infrastructure Deployment
      const deployResult = await apiCall('/auth/deploy-infrastructure', {
        method: 'POST',
        body: JSON.stringify({
          centerName: userData.centerName,
          centerAddress: userData.centerAddress,
          gstinNumber: userData.gstinNumber,
          registrationNumber: userData.registrationNumber,
          panNumber: userData.panNumber,
          nabhNumber: userData.nabhNumber,
          specialization: userData.specialization,
          degree: userData.degree,
          licenseNo: userData.licenseNo
        }),
        headers: {
          'Authorization': `Bearer ${identityResult.data.token}`,
        },
      });

      if (deployResult.success) {
        console.log('[MOBILE AUTH] Registration completed successfully');
        return { success: true };
      } else {
        return { success: false, error: deployResult.error };
      }
    } catch (error) {
      console.error('[MOBILE AUTH] Registration failed:', error);
      return { success: false, error: 'Registration sequence failed.' };
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
      registerUser
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
