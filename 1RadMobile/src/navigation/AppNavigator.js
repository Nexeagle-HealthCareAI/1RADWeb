import React, { useState, useEffect } from 'react';
import { createStackNavigator } from '@react-navigation/stack';
import { createDrawerNavigator } from '@react-navigation/drawer';
import { NavigationContainer } from '@react-navigation/native';
import { View, Text, StyleSheet, TouchableOpacity, Image, ScrollView } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { COLORS, SPACING, RADIUS, SHADOWS } from '../theme/TacticalTheme';
import { 
  Home, 
  Calendar, 
  Shield, 
  LogOut, 
  User,
  Activity,
  Building2,
  ChevronDown
} from 'lucide-react-native';
import AuthNavigationHandler from './AuthNavigationHandler';

// Screens
import SplashScreen from '../screens/SplashScreen';
import LoginScreen from '../screens/LoginScreen';
import RegisterScreen from '../screens/RegisterScreen';
import ForgotPasswordScreen from '../screens/ForgotPasswordScreen';
import DashboardScreen from '../screens/DashboardScreen';
import AppointmentsScreen from '../screens/AppointmentsScreen';
import CreateAppointmentScreen from '../screens/CreateAppointmentScreen';
import EditAppointmentScreen from '../screens/EditAppointmentScreen';
import AdminBoardScreen from '../screens/AdminBoardScreen';
import BiometricSetupScreen from '../screens/BiometricSetupScreen';
import BiometricLockScreen from '../screens/BiometricLockScreen';

const Stack = createStackNavigator();
const Drawer = createDrawerNavigator();

// Role-based navigation items (matching web)
const NAV_ITEMS = [
  {
    label: 'COMMAND CENTER',
    screen: 'AdminBoard',
    icon: '🏢',
    allowedRoles: ['admindoctor', 'admin'],
  },
  {
    label: 'MISSION SCHEDULER',
    screen: 'Appointments',
    icon: '📡',
    allowedRoles: ['admindoctor', 'admin', 'receptionist'],
  },
  {
    label: 'SECURITY SETTINGS',
    screen: 'BiometricSetup',
    icon: '🔐',
    allowedRoles: ['admindoctor', 'admin', 'receptionist', 'doctor'],
  },
];

// Custom Drawer Content (matching web sidebar)
function CustomDrawerContent({ navigation }) {
  const { user, isAdmin, logout, centers, activeCenter, switchCenter } = useAuth();
  const [isCenterSwitcherOpen, setIsCenterSwitcherOpen] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());

  // Update time every second
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const userRoles = user?.roles || [];
  const isAdminUser = userRoles.some(role => ['admin', 'admindoctor'].includes(role));
  
  const allowedNavItems = NAV_ITEMS.filter((item) =>
    item.allowedRoles.some(role => userRoles.includes(role))
  );

  const formattedTime = currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const formattedDate = currentTime.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' });

  const activeCenterObj = centers.find(c => c.id === activeCenter) || centers[0];

  const handleCenterSwitch = async (centerId) => {
    if (activeCenter === centerId || switching) return;
    setSwitching(true);
    await switchCenter(centerId);
    setSwitching(false);
    setIsCenterSwitcherOpen(false);
  };

  return (
    <View style={styles.drawerContainer}>
      {/* Header with Logo and Brand */}
      <View style={styles.drawerHeader}>
        <View style={styles.brandContainer}>
          <View style={styles.logoContainer}>
            <Text style={styles.logoText}>1<Text style={styles.logoAccent}>RAD</Text></Text>
          </View>
          <View style={styles.brandTextContainer}>
            <Text style={styles.brandSubtitle}>COMMAND v2.0</Text>
          </View>
        </View>
      </View>

      <ScrollView style={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Center Switcher (Admin Only) */}
        {isAdminUser && centers && centers.length > 0 && (
          <View style={styles.centerSwitcherSection}>
            <TouchableOpacity 
              style={styles.centerSwitcherButton}
              onPress={() => setIsCenterSwitcherOpen(!isCenterSwitcherOpen)}
            >
              <View style={[styles.statusDot, switching && styles.statusDotSwitching]} />
              <View style={styles.centerInfo}>
                <Text style={styles.centerLabel}>
                  {switching ? 'RECONFIGURING HUB...' : 'DEPLOYED HUB'}
                </Text>
                <Text style={styles.centerName} numberOfLines={1}>
                  {activeCenterObj?.name?.toUpperCase() || 'NO CENTER'}
                </Text>
              </View>
              <ChevronDown 
                size={12} 
                color={COLORS.textSecondary} 
                style={{ transform: [{ rotate: isCenterSwitcherOpen ? '180deg' : '0deg' }] }}
              />
            </TouchableOpacity>

            {isCenterSwitcherOpen && (
              <View style={styles.centerDropdown}>
                <Text style={styles.dropdownHeader}>AUTHORIZED HUBS</Text>
                {centers.map(center => (
                  <TouchableOpacity
                    key={center.id}
                    style={[
                      styles.centerOption,
                      activeCenter === center.id && styles.centerOptionActive
                    ]}
                    onPress={() => handleCenterSwitch(center.id)}
                    disabled={switching || activeCenter === center.id}
                  >
                    <View style={[
                      styles.centerOptionDot,
                      activeCenter === center.id && styles.centerOptionDotActive
                    ]} />
                    <Text style={styles.centerOptionText} numberOfLines={1}>
                      {center.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>
        )}

        {/* Navigation Items */}
        <View style={styles.menuItems}>
          {allowedNavItems.map((item) => (
            <TouchableOpacity
              key={item.screen}
              style={styles.menuItem}
              onPress={() => {
                navigation.navigate(item.screen);
                setIsCenterSwitcherOpen(false);
              }}
            >
              <View style={styles.menuIconContainer}>
                <Text style={styles.menuIcon}>{item.icon}</Text>
              </View>
              <Text style={styles.menuItemText}>{item.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>

      {/* Time Display (matching web top nav) */}
      <View style={styles.timeDisplay}>
        <Text style={styles.timeText}>{formattedTime}</Text>
        <Text style={styles.dateText}>{formattedDate}</Text>
      </View>

      {/* Footer with Logout */}
      <View style={styles.drawerFooter}>
        <TouchableOpacity style={styles.logoutButton} onPress={logout}>
          <LogOut size={16} color={COLORS.error} />
          <Text style={styles.logoutText}>TERMINATE</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

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

function MainDrawer() {
  return (
    <Drawer.Navigator
      drawerContent={(props) => <CustomDrawerContent {...props} />}
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
        },
        drawerStyle: {
          backgroundColor: COLORS.bgSidebar,
          width: 280,
        },
        sceneContainerStyle: {
          backgroundColor: COLORS.bgMain,
        }
      }}
    >
      <Drawer.Screen 
        name="Dashboard" 
        component={DashboardScreen}
        options={{
          title: 'TACTICAL HUB'
        }}
      />
      <Drawer.Screen 
        name="Appointments" 
        component={AppointmentStack}
        options={{
          title: 'APPOINTMENTS'
        }}
      />
      <Drawer.Screen 
        name="AdminBoard" 
        component={AdminBoardScreen}
        options={{
          title: 'ADMIN BOARD'
        }}
      />
      <Drawer.Screen 
        name="BiometricSetup" 
        component={BiometricSetupScreen}
        options={{
          title: 'SECURITY SETTINGS'
        }}
      />
    </Drawer.Navigator>
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
      // User is logged in - check if biometric/passcode is enabled
      const BiometricService = require('../services/BiometricService').default;
      const biometricEnabled = await BiometricService.isBiometricEnabled();
      const hasPasscode = await BiometricService.hasPasscode();
      
      const authRequired = biometricEnabled || hasPasscode;
      setNeedsAuth(authRequired);
      setIsLocked(authRequired);
      
      console.log('[NAV] Auth check - User:', !!user, 'Auth required:', authRequired);
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
      <Stack.Screen name="Main" component={MainDrawer} />
    </Stack.Navigator>
  );
}
  }

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Splash" component={SplashScreen} />
      <Stack.Screen name="Auth" component={AuthStack} />
      <Stack.Screen name="Main" component={MainDrawer} />
    </Stack.Navigator>
  );
}

export default function AppNavigator() {
  return (
    <NavigationContainer>
      <RootStack />
      <AuthNavigationHandler />
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  drawerContainer: {
    flex: 1,
    backgroundColor: COLORS.bgSidebar,
  },
  drawerHeader: {
    padding: SPACING.lg,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  brandContainer: {
    alignItems: 'center',
  },
  logoContainer: {
    marginBottom: 8,
  },
  logoText: {
    fontSize: 32,
    fontWeight: '900',
    color: '#fff',
    letterSpacing: 2,
  },
  logoAccent: {
    color: COLORS.cyan,
  },
  brandTextContainer: {
    alignItems: 'center',
  },
  brandSubtitle: {
    fontSize: 9,
    fontWeight: '900',
    color: COLORS.cyan,
    opacity: 0.7,
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  scrollContent: {
    flex: 1,
  },
  centerSwitcherSection: {
    padding: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  centerSwitcherButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    padding: SPACING.md,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#2ecc71',
    marginRight: SPACING.sm,
  },
  statusDotSwitching: {
    backgroundColor: '#f39c12',
  },
  centerInfo: {
    flex: 1,
  },
  centerLabel: {
    fontSize: 7,
    fontWeight: '900',
    color: 'rgba(255, 255, 255, 0.4)',
    letterSpacing: 1,
    marginBottom: 2,
  },
  centerName: {
    fontSize: 11,
    fontWeight: '900',
    color: '#fff',
    letterSpacing: 0.5,
  },
  centerDropdown: {
    marginTop: SPACING.sm,
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderRadius: RADIUS.md,
    padding: SPACING.sm,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  dropdownHeader: {
    fontSize: 8,
    fontWeight: '900',
    color: COLORS.cyan,
    letterSpacing: 1.5,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
    marginBottom: SPACING.xs,
  },
  centerOption: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: SPACING.sm,
    borderRadius: RADIUS.sm,
    marginBottom: 2,
  },
  centerOptionActive: {
    backgroundColor: 'rgba(0, 242, 254, 0.1)',
  },
  centerOptionDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    marginRight: SPACING.sm,
  },
  centerOptionDotActive: {
    backgroundColor: '#2ecc71',
  },
  centerOptionText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#fff',
    flex: 1,
  },
  menuItems: {
    paddingTop: SPACING.md,
    paddingHorizontal: SPACING.sm,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    marginBottom: 4,
    borderRadius: RADIUS.md,
    backgroundColor: 'transparent',
  },
  menuIconContainer: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: SPACING.md,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  menuIcon: {
    fontSize: 16,
  },
  menuItemText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textPrimary,
    letterSpacing: 0.5,
    flex: 1,
  },
  timeDisplay: {
    padding: SPACING.md,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.1)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
    alignItems: 'center',
  },
  timeText: {
    fontSize: 16,
    fontWeight: '900',
    color: COLORS.cyan,
    letterSpacing: 1,
  },
  dateText: {
    fontSize: 9,
    fontWeight: '800',
    color: 'rgba(255, 255, 255, 0.5)',
    letterSpacing: 1,
    marginTop: 2,
    textTransform: 'uppercase',
  },
  drawerFooter: {
    padding: SPACING.md,
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.md,
    backgroundColor: 'rgba(231, 76, 60, 0.05)',
    borderWidth: 1,
    borderColor: 'rgba(231, 76, 60, 0.2)',
  },
  logoutText: {
    color: COLORS.error,
    fontWeight: '900',
    fontSize: 11,
    letterSpacing: 1,
    marginLeft: SPACING.sm,
  },
});
