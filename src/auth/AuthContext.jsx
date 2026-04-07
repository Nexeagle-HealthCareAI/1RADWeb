import { createContext, useState, useCallback, useEffect, useMemo } from 'react';
import { MOCK_USERS } from './mockUsers';

export const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [users, setUsers] = useState(() => {
    // Persistent user store across reloads
    const storedUsers = localStorage.getItem('easyrad_users');
    const parsed = storedUsers ? JSON.parse(storedUsers) : [];
    
    // Auto-sync missing mock users (e.g. newly added roles/demo accounts)
    const combined = [...parsed];
    MOCK_USERS.forEach(mock => {
      if (!combined.some(u => u.email === mock.email)) {
        combined.push(mock);
      }
    });

    return combined.length > 0 ? combined : MOCK_USERS;
  });

  const [currentUser, setCurrentUser] = useState(() => {
    // Current session persistence
    const stored = sessionStorage.getItem('easyrad_user');
    return stored ? JSON.parse(stored) : null;
  });

  // Sync users to localStorage whenever they change
  useEffect(() => {
    try {
      localStorage.setItem('easyrad_users', JSON.stringify(users));
    } catch (e) {
      if (e.name === 'QuotaExceededError') {
        alert('CRITICAL STORAGE ALERT: Your browser storage (5MB) is full. This is likely due to large clinical report formats. Please delete unused doctors or compress your medical images.');
        console.error('LocalStorage Quota Exceeded:', e);
      }
    }
  }, [users]);

  // Derived check for the initial registration flow
  const hasAdminDoctor = useMemo(() => {
    return users.some(u => u.role === 'admindoctor');
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
      setCurrentUser(user);
      sessionStorage.setItem('easyrad_user', JSON.stringify(user));
      return { success: true, user };
    }
    return { success: false, error: 'Invalid credentials. Please try again.' };
  }, [users]);

  const logout = useCallback(() => {
    setCurrentUser(null);
    sessionStorage.removeItem('easyrad_user');
  }, []);

  const registerAdminDoctor = useCallback((userData) => {
    const newUser = {
      ...userData,
      id: Date.now(),
      role: 'admindoctor',
      status: 'active',
      createdDate: new Date().toISOString().split('T')[0]
    };
    setUsers(prev => [...prev, newUser]);
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
      sessionStorage.setItem('easyrad_user', JSON.stringify(updatedUser));
    }
    
    return { success: true };
  }, [currentUser]);

  const deleteUser = useCallback((id) => {
    setUsers(prev => prev.filter(u => u.id !== id));
    return { success: true };
  }, []);

  return (
    <AuthContext.Provider value={{ 
      users, 
      currentUser, 
      hasAdminDoctor, 
      login, 
      logout,
      registerAdminDoctor,
      createUser,
      updateUser,
      deleteUser
    }}>
      {children}
    </AuthContext.Provider>
  );
}
