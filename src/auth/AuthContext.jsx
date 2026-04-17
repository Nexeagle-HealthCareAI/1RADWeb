import { createContext, useState, useCallback, useEffect, useMemo } from 'react';
import { MOCK_USERS } from './mockUsers';

const MOCK_CENTERS = [
  { id: 'C001', name: 'City Diagnostic Center', address: '123 Healthcare Blvd, Medical District', status: 'active' },
  { id: 'C002', name: 'Metro Imaging Hub', address: '456 Tech Park, North Wing', status: 'active' },
  { id: 'C003', name: 'Downtown Scan Lab', address: '789 Central Ave, Ground Floor', status: 'active' }
];

export const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [centers, setCenters] = useState(() => {
    const stored = localStorage.getItem('1rad_centers');
    return stored ? JSON.parse(stored) : MOCK_CENTERS;
  });

  const [activeCenterId, setActiveCenterId] = useState(() => {
    return localStorage.getItem('1rad_active_center_id') || (centers[0]?.id);
  });
  const [users, setUsers] = useState(() => {
    // Persistent user store across reloads
    const storedUsers = localStorage.getItem('1rad_users');
    const parsed = storedUsers ? JSON.parse(storedUsers) : [];
    
    // Auto-sync missing mock users and migrate old 'role' to 'roles'
    const combined = [...parsed];
    
    // Migration: Convert old singular 'role' to plural 'roles' array
    combined.forEach(u => {
      if (u.role && !u.roles) {
        u.roles = [u.role];
        delete u.role;
      }
    });

    MOCK_USERS.forEach(mock => {
      const existingIndex = combined.findIndex(u => u.email === mock.email);
      if (existingIndex === -1) {
        combined.push(mock);
      } else {
        // Sync mock updates (like new roles) to existing accounts
        combined[existingIndex] = { ...combined[existingIndex], ...mock };
      }
    });

    return combined;
  });

  const [currentUser, setCurrentUser] = useState(() => {
    // Current session persistence
    const stored = sessionStorage.getItem('1rad_user');
    return stored ? JSON.parse(stored) : null;
  });

  // Sync users and centers to localStorage whenever they change
  useEffect(() => {
    try {
      localStorage.setItem('1rad_users', JSON.stringify(users));
      localStorage.setItem('1rad_centers', JSON.stringify(centers));
      localStorage.setItem('1rad_active_center_id', activeCenterId);
    } catch (e) {
      if (e.name === 'QuotaExceededError') {
        alert('CRITICAL STORAGE ALERT: Your browser storage (5MB) is full. This is likely due to large clinical report formats. Please delete unused doctors or compress your medical images.');
        console.error('LocalStorage Quota Exceeded:', e);
      }
    }
  }, [users, centers, activeCenterId]);

  const activeCenter = useMemo(() => {
    return centers.find(c => c.id === activeCenterId) || centers[0];
  }, [centers, activeCenterId]);

  const switchCenter = useCallback((id) => {
    setActiveCenterId(id);
  }, []);

  // Derived check for the initial registration flow
  const hasAdminDoctor = useMemo(() => {
    return users.some(u => u.roles && u.roles.includes('admindoctor'));
  }, [users]);

  const login = useCallback((identifier, password) => {
    // Check against email or mobile
    const user = users.find(u => 
      (u.email === identifier || u.mobile === identifier) && 
      u.password === password
    );
    
    if (user) {
      if (user.status === 'inactive') {
        return { success: false, error: 'Your account is inactive. Please contact your administrator.' };
      }
      
      const lastLogin = new Date().toLocaleString();
      const updatedUser = { ...user, lastLogin };
      
      // Persist to total users list
      setUsers(prev => prev.map(u => u.id === user.id ? updatedUser : u));
      
      setCurrentUser(updatedUser);
      sessionStorage.setItem('1rad_user', JSON.stringify(updatedUser));
      return { success: true, user: updatedUser };
    }
    return { success: false, error: 'Invalid credentials. Please try again.' };
  }, [users]);

  const logout = useCallback(() => {
    setCurrentUser(null);
    sessionStorage.removeItem('1rad_user');
  }, []);

  const registerAdminDoctor = useCallback((userData) => {
    const centerId = `C-${Date.now()}`;
    const newCenter = {
      id: centerId,
      name: userData.centerName || 'My Clinical Hub',
      address: userData.centerAddress || 'Universal Address',
      status: 'active'
    };

    const newUser = {
      ...userData,
      id: Date.now(),
      roles: ['admindoctor'],
      status: 'active',
      createdDate: new Date().toISOString().split('T')[0]
    };

    setCenters(prev => [...prev, newCenter]);
    setUsers(prev => [...prev, newUser]);
    setActiveCenterId(centerId);
    
    return { success: true };
  }, []);

  const createUser = useCallback((userData) => {
    const newUser = {
      ...userData,
      id: Date.now(),
      status: userData.status || 'active',
      createdDate: new Date().toISOString().split('T')[0]
    };
    setUsers(prev => [...prev, newUser]);
    return { success: true };
  }, []);

  const updateUser = useCallback((id, updates) => {
    setUsers(prev => prev.map(u => u.id === id ? { ...u, ...updates } : u));
    
    // If the updated user is the current user, sync the session
    if (currentUser && currentUser.id === id) {
      const updatedUser = { ...currentUser, ...updates };
      setCurrentUser(updatedUser);
      sessionStorage.setItem('1rad_user', JSON.stringify(updatedUser));
    }
    
    return { success: true };
  }, [currentUser]);

  const deleteUser = useCallback((id) => {
    setUsers(prev => prev.filter(u => u.id !== id));
    return { success: true };
  }, []);

  const sendOtp = useCallback((identifier) => {
    console.log(`[AUTH] OTP requested for: ${identifier}. Code sent: 123456`);
    return { success: true };
  }, []);

  const verifyOtp = useCallback((identifier, code) => {
    if (code === '123456') {
      const user = users.find(u => u.email === identifier || u.mobile === identifier);
      if (user) {
        setCurrentUser(user);
        sessionStorage.setItem('1rad_user', JSON.stringify(user));
        return { success: true, user };
      }
      return { success: false, error: 'User not found in system.' };
    }
    return { success: false, error: 'Invalid passcode.' };
  }, [users]);

  const resetPassword = useCallback((identifier, newPassword) => {
    const userIndex = users.findIndex(u => u.email === identifier || u.mobile === identifier);
    if (userIndex !== -1) {
      const updatedUsers = [...users];
      updatedUsers[userIndex] = { ...updatedUsers[userIndex], password: newPassword };
      setUsers(updatedUsers);
      return { success: true };
    }
    return { success: false, error: 'User identification failed during reset.' };
  }, [users]);

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

  return (
    <AuthContext.Provider value={{ 
      users, 
      currentUser, 
      hasAdminDoctor, 
      centers,
      activeCenter,
      switchCenter,
      createCenter,
      login, 
      logout,
      registerAdminDoctor,
      createUser,
      updateUser,
      deleteUser,
      sendOtp,
      verifyOtp,
      resetPassword
    }}>
      {children}
    </AuthContext.Provider>
  );
}
