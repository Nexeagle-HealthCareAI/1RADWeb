import React, { useState, useEffect } from 'react';
import { createStackNavigator } from '@react-navigation/stack';
import { NavigationContainer } from '@react-navigation/native';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Modal } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { COLORS, SPACING, RADIUS } from '../theme/TacticalTheme';
import { 
  LogOut, 
  ChevronDown,
  X
} from 'lucide-react-native';
import AuthNavigationHandler from './AuthNavigationHandler';
import ErrorBoundary from '../components/ErrorBoundary';

// Screens
import SplashScreen from '../screens/SplashScreen';
import LoginScreen from '../screens/LoginScreen';
import RegisterScreen from '../screens/RegisterScreen';
import ForgotPasswordScreen from '../screens/ForgotPasswordScreen';
import AppointmentsScreen from '../screens/AppointmentsScreen';
import CreateAppointmentScreen from '../screens/CreateAppointmentScreen';
import EditAppointmentScreen from '../screens/EditAppointmentScreen';
import AdminBoardScreen from '../screens/AdminBoardScreen';
import FinanceScreen from '../screens/FinanceScreen';
import ScanningBayScreen from '../screens/ScanningBayScreen';
import DoctorScreen from '../screens/DoctorScreen';
import BiometricLockScreen from '../screens/BiometricLockScreen';

const Stack = createStackNavigator();

// Remove drawer navigation items - now using bottom tabs only
// Navigation modal will be created separately

function AuthStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen name="Register" component={RegisterScreen} />
      <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
    </Stack.Navigator>
  );
}

function AppointmentStack() {
  return (
    <Stack.Navigator 
      screenOptions={{
        headerStyle: { 
          backgroundColor: COLORS.bgSidebar, 
          borderBottomWidth: 1, 
          borderBottomColor: COLORS.border 
        },
        headerTintColor: COLORS.cyan,
        headerTitleStyle: {
          fontWeight: '900',
          letterSpacing: 1
        }
      }}
    >
      <Stack.Screen 
        name="AppointmentsList" 
        component={AppointmentsScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen 
        name="CreateAppointment" 
        component={CreateAppointmentScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen 
        name="EditAppointment" 
        component={EditAppointmentScreen}
        options={{ headerShown: false }}
      />
    </Stack.Navigator>
  );
}

function MainStack() {
  const { user } = useAuth();
  
  // Determine initial route based on user role
  const getInitialRoute = () => {
    const userRoles = user?.roles || [];
    
    // Admin users go directly to AdminBoard
    if (userRoles.some(role => ['admin', 'admindoctor'].includes(role))) {
      return 'AdminBoard';
    }
    
    // Receptionist and other users go to Appointments
    return 'Appointments';
  };
  
  return (
    <Stack.Navigator
      initialRouteName={getInitialRoute()}
      screenOptions={{
        headerShown: false,
        cardStyle: { backgroundColor: COLORS.bgMain }
      }}
    >
      <Stack.Screen name="AdminBoard" component={AdminBoardScreen} />
      <Stack.Screen name="Appointments" component={AppointmentStack} />
      <Stack.Screen name="Finance" component={FinanceScreen} />
      <Stack.Screen name="ScanningBay" component={ScanningBayScreen} />
      <Stack.Screen name="Doctor" component={DoctorScreen} />
    </Stack.Navigator>
  );
}

function RootStack() {
  const { user } = useAuth();
  const [isLocked, setIsLocked] = React.useState(false);
  const [needsAuth, setNeedsAuth] = React.useState(false);
  const [isChecking, setIsChecking] = React.useState(true);

  React.useEffect(() => {
    checkAuthRequirement();
  }, [user]);

  const checkAuthRequirement = async () => {
    setIsChecking(true);
    
    if (user) {
      // Biometric/Passcode authentication disabled for now
      // const BiometricService = require('../services/BiometricService').default;
      // const biometricEnabled = await BiometricService.isBiometricEnabled();
      // const hasPasscode = await BiometricService.hasPasscode();
      
      // const authRequired = biometricEnabled || hasPasscode;
      const authRequired = false; // Disabled biometric authentication
      setNeedsAuth(authRequired);
      setIsLocked(authRequired);
      
      console.log('[NAV] Auth check - User:', !!user, 'Auth required:', authRequired, '(Biometric disabled)');
    } else {
      // No user logged in - no biometric needed
      setNeedsAuth(false);
      setIsLocked(false);
      console.log('[NAV] Auth check - No user, no lock needed');
    }
    
    setIsChecking(false);
  };

  // Show lock screen ONLY if:
  // 1. User is logged in
  // 2. Biometric/passcode is enabled
  // 3. Screen is currently locked
  // 4. Not still checking
  if (user && needsAuth && isLocked && !isChecking) {
    console.log('[NAV] Showing biometric lock screen');
    return <BiometricLockScreen onUnlock={() => {
      console.log('[NAV] Biometric unlocked');
      setIsLocked(false);
    }} />;
  }

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Splash" component={SplashScreen} />
      <Stack.Screen name="Auth" component={AuthStack} />
      <Stack.Screen name="Main" component={MainStack} />
    </Stack.Navigator>
  );
}

export default function AppNavigator() {
  return (
    <ErrorBoundary>
      <NavigationContainer>
        <RootStack />
        <AuthNavigationHandler />
      </NavigationContainer>
    </ErrorBoundary>
  );
}

// Removed drawer styles - using bottom navigation only
