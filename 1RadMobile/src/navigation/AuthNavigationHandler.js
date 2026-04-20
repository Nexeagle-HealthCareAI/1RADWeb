import { useEffect } from 'react';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';

/**
 * AuthNavigationHandler
 * Automatically navigates to Main screen when user logs in
 * and to Auth screen when user logs out
 */
export default function AuthNavigationHandler() {
  const { user } = useAuth();
  const navigation = useNavigation();

  useEffect(() => {
    console.log('[AUTH NAV] User state changed:', !!user);
    
    if (user) {
      // User is logged in - navigate to Main
      console.log('[AUTH NAV] Navigating to Main screen');
      navigation.reset({
        index: 0,
        routes: [{ name: 'Main' }],
      });
    }
  }, [user, navigation]);

  return null; // This component doesn't render anything
}
