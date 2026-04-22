import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS, SPACING, RADIUS, SHADOWS } from '../theme/TacticalTheme';
import {
  Shield,
  Calendar,
  DollarSign,
  Scan,
  Stethoscope
} from 'lucide-react-native';

export default function BottomNavBar({ userRole = 'doctor' }) {
  const navigation = useNavigation();
  const route = useRoute();

  // Define navigation items - 5 fixed tabs for all users
  const getNavItems = () => {
    const baseItems = [
      {
        name: 'AdminBoard',
        label: 'COMMAND\nCENTRE',
        icon: Shield,
        route: 'AdminBoard',
        roles: ['admindoctor', 'admin', 'receptionist', 'doctor', 'technician']
      },
      {
        name: 'Appointments',
        label: 'MISSION\nSCHEDULER',
        icon: Calendar,
        route: 'Appointments',
        roles: ['admindoctor', 'admin', 'receptionist', 'doctor', 'technician']
      },
      {
        name: 'Finance',
        label: 'FINANCE',
        icon: DollarSign,
        route: 'Finance',
        roles: ['admindoctor', 'admin', 'receptionist', 'doctor', 'technician']
      },
      {
        name: 'ScanningBay',
        label: 'SCANNING\nBAY',
        icon: Scan,
        route: 'ScanningBay',
        roles: ['admindoctor', 'admin', 'receptionist', 'doctor', 'technician']
      },
      {
        name: 'Doctor',
        label: 'DOCTOR',
        icon: Stethoscope,
        route: 'Doctor',
        roles: ['admindoctor', 'admin', 'receptionist', 'doctor', 'technician']
      }
    ];

    // Show all items to all users
    return baseItems;
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
                    size={18} 
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
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    marginBottom: 2,
  },
  iconContainerActive: {
    backgroundColor: 'rgba(0, 242, 254, 0.1)',
  },
  label: {
    fontSize: 7,
    fontWeight: '800',
    color: COLORS.textSecondary,
    letterSpacing: 0.3,
    textAlign: 'center',
    lineHeight: 10,
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
