import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS, SPACING, RADIUS, SHADOWS } from '../theme/TacticalTheme';
import {
  LayoutDashboard,
  Calendar,
  Users,
  FileText,
  Shield,
  Settings
} from 'lucide-react-native';

export default function BottomNavBar({ userRole = 'doctor' }) {
  const navigation = useNavigation();
  const route = useRoute();

  // Define navigation items based on role
  const getNavItems = () => {
    const baseItems = [
      {
        name: 'Dashboard',
        label: 'COMMAND',
        icon: LayoutDashboard,
        route: 'Dashboard',
        roles: ['doctor', 'admindoctor', 'admin', 'technician', 'receptionist']
      },
      {
        name: 'Appointments',
        label: 'MISSIONS',
        icon: Calendar,
        route: 'Appointments',
        roles: ['doctor', 'admindoctor', 'admin', 'technician', 'receptionist']
      },
      {
        name: 'Patients',
        label: 'REGISTRY',
        icon: Users,
        route: 'Patients',
        roles: ['doctor', 'admindoctor', 'admin', 'receptionist']
      },
      {
        name: 'Reports',
        label: 'INTEL',
        icon: FileText,
        route: 'Reports',
        roles: ['doctor', 'admindoctor', 'admin']
      },
      {
        name: 'AdminBoard',
        label: 'ADMIN',
        icon: Shield,
        route: 'AdminBoard',
        roles: ['admindoctor', 'admin']
      }
    ];

    // Filter items based on user role
    return baseItems.filter(item => item.roles.includes(userRole));
  };

  const navItems = getNavItems();
  const currentRoute = route.name;

  const handleNavigation = (routeName) => {
    if (currentRoute !== routeName) {
      navigation.navigate(routeName);
    }
  };

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={['rgba(11, 17, 32, 0.95)', 'rgba(11, 17, 32, 0.98)']}
        style={styles.gradient}
      >
        <View style={styles.navContainer}>
          {navItems.map((item, index) => {
            const isActive = currentRoute === item.route;
            const Icon = item.icon;

            return (
              <TouchableOpacity
                key={item.name}
                style={styles.navItem}
                onPress={() => handleNavigation(item.route)}
                activeOpacity={0.7}
              >
                {isActive && (
                  <LinearGradient
                    colors={[COLORS.cyan, '#4facfe']}
                    style={styles.activeIndicator}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                  />
                )}
                
                <View style={[
                  styles.iconContainer,
                  isActive && styles.iconContainerActive
                ]}>
                  <Icon 
                    size={20} 
                    color={isActive ? COLORS.cyan : COLORS.textSecondary} 
                    strokeWidth={isActive ? 2.5 : 2}
                  />
                </View>
                
                <Text style={[
                  styles.label,
                  isActive && styles.labelActive
                ]}>
                  {item.label}
                </Text>

                {isActive && (
                  <View style={styles.activeDot} />
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      </LinearGradient>

      {/* Safe area for devices with notch/home indicator */}
      {Platform.OS === 'ios' && <View style={styles.safeArea} />}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 1000,
  },
  gradient: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(0, 242, 254, 0.1)',
    ...SHADOWS.lg,
  },
  navContainer: {
    flexDirection: 'row',
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.sm,
    paddingBottom: Platform.OS === 'ios' ? SPACING.xs : SPACING.sm,
  },
  navItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.sm,
    position: 'relative',
  },
  activeIndicator: {
    position: 'absolute',
    top: 0,
    left: '20%',
    right: '20%',
    height: 3,
    borderRadius: 2,
  },
  iconContainer: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    marginBottom: 4,
  },
  iconContainerActive: {
    backgroundColor: 'rgba(0, 242, 254, 0.1)',
  },
  label: {
    fontSize: 9,
    fontWeight: '800',
    color: COLORS.textSecondary,
    letterSpacing: 0.5,
    textAlign: 'center',
  },
  labelActive: {
    color: COLORS.cyan,
    fontWeight: '900',
  },
  activeDot: {
    position: 'absolute',
    bottom: 4,
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: COLORS.cyan,
  },
  safeArea: {
    height: 20,
    backgroundColor: 'rgba(11, 17, 32, 0.98)',
  },
});
