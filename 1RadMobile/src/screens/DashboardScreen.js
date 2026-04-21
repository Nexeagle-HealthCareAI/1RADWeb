import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Dimensions, RefreshControl, Animated } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '../context/AuthContext';
import { useAppointments } from '../context/AppointmentContext';
import { COLORS, SPACING, RADIUS, SHADOWS } from '../theme/TacticalTheme';
import { Activity, Users, Calendar, Settings, LogOut, ChevronRight, Plus, Shield, TrendingUp } from 'lucide-react-native';
import AnimatedStatCard from '../components/AnimatedStatCard';
import GradientButton from '../components/GradientButton';
import EmptyState from '../components/EmptyState';
import BottomNavBar from '../components/BottomNavBar';

const { width } = Dimensions.get('window');

export default function DashboardScreen({ navigation }) {
  const { user, isAdmin, logout, centers, activeCenter } = useAuth();
  const { getTodayAppointments, getUpcomingAppointments } = useAppointments();
  const [refreshing, setRefreshing] = useState(false);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;

  const activeHub = centers.find(c => c.id === activeCenter) || centers[0];
  const todayAppointments = getTodayAppointments();
  const upcomingAppointments = getUpcomingAppointments();

  useEffect(() => {
    // Initial animation
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 600,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 500,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    // Simulate data refresh
    await new Promise(resolve => setTimeout(resolve, 1500));
    setRefreshing(false);
  };

  const MISSION_CARDS = [
    { 
      title: 'TODAY\'S APPOINTMENTS', 
      icon: Calendar, 
      color: COLORS.cyan, 
      gradient: [COLORS.cyan, '#4facfe'],
      count: todayAppointments.length,
      onPress: () => navigation.navigate('Appointments'),
      pulse: false
    },
    { 
      title: 'UPCOMING MISSIONS', 
      icon: Activity, 
      color: COLORS.indigo, 
      gradient: ['#667eea', '#764ba2'],
      count: upcomingAppointments.length,
      onPress: () => navigation.navigate('Appointments'),
      pulse: false
    },
    { 
      title: 'ACTIVE PATIENTS', 
      icon: Users, 
      color: COLORS.gold, 
      gradient: ['#f093fb', '#f5576c'],
      count: 24,
      onPress: () => {},
      pulse: false
    },
    { 
      title: 'SYSTEM STATUS', 
      icon: TrendingUp, 
      color: '#2ecc71', 
      gradient: ['#2ecc71', '#27ae60'],
      count: 'LIVE',
      onPress: () => {},
      pulse: true
    },
  ];

  // Add Admin Board card if user is admin
  if (isAdmin) {
    MISSION_CARDS.push({
      title: 'ADMIN CONTROL',
      icon: Shield,
      color: COLORS.error,
      gradient: ['#e74c3c', '#c0392b'],
      count: 'CTRL',
      onPress: () => navigation.navigate('AdminBoard'),
      pulse: false
    });
  }

  return (
    <ScrollView 
      style={styles.container} 
      contentContainerStyle={styles.scrollContent}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={COLORS.cyan}
          colors={[COLORS.cyan]}
        />
      }
    >
      {/* Animated Header */}
      <Animated.View 
        style={[
          styles.header,
          {
            opacity: fadeAnim,
            transform: [{ translateY: slideAnim }],
          },
        ]}
      >
        <LinearGradient
          colors={['rgba(0, 242, 254, 0.1)', 'transparent']}
          style={styles.headerGradient}
        >
          <View style={styles.hubContainer}>
            <Shield size={12} color={COLORS.cyan} />
            <Text style={styles.hubText}>{activeHub?.name?.toUpperCase() || 'SELECT HUB'}</Text>
            <View style={styles.statusDot} />
          </View>
          <Text style={styles.welcomeText}>WELCOME, MISSION LEADER</Text>
          <Text style={styles.userName}>{user?.name || 'IDENTITY UNKNOWN'}</Text>
          <Text style={styles.timestamp}>
            {new Date().toLocaleDateString('en-US', { 
              weekday: 'long', 
              year: 'numeric', 
              month: 'long', 
              day: 'numeric' 
            })}
          </Text>
        </LinearGradient>
      </Animated.View>

      {/* Stats Grid with Animated Cards */}
      <View style={styles.statsGrid}>
        {MISSION_CARDS.map((card, idx) => (
          <AnimatedStatCard
            key={idx}
            title={card.title}
            value={card.count}
            icon={card.icon}
            color={card.color}
            gradient={card.gradient}
            onPress={card.onPress}
            animated={true}
            pulse={card.pulse}
          />
        ))}
      </View>

      {/* Quick Actions */}
      <View style={styles.quickActions}>
        <Text style={styles.sectionLabel}>⚡ QUICK ACTIONS</Text>
        
        <GradientButton
          title="NEW APPOINTMENT"
          icon={Plus}
          gradient={[COLORS.cyan, '#4facfe']}
          onPress={() => navigation.navigate('Appointments', { 
            screen: 'CreateAppointment' 
          })}
          size="lg"
        />

        <View style={{ height: SPACING.sm }} />

        <GradientButton
          title="VIEW ALL APPOINTMENTS"
          icon={Calendar}
          gradient={[COLORS.cyan, '#4facfe']}
          onPress={() => navigation.navigate('Appointments')}
          size="md"
          variant="outline"
        />
      </View>

      {/* Today's Queue */}
      <View style={styles.queueSection}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionLabel}>📡 TODAY'S OPERATIONAL QUEUE</Text>
          <Text style={styles.queueCount}>{todayAppointments.length}</Text>
        </View>
        
        {todayAppointments.length === 0 ? (
          <EmptyState
            icon={Calendar}
            title="No Missions Scheduled"
            subtitle="All clear for today. Create a new appointment to get started."
            actionText="NEW APPOINTMENT"
            onAction={() => navigation.navigate('Appointments', { 
              screen: 'CreateAppointment' 
            })}
          />
        ) : (
          <>
            {todayAppointments.slice(0, 3).map((appointment, i) => (
              <TouchableOpacity 
                key={appointment.id} 
                style={styles.queueItem}
                onPress={() => navigation.navigate('Appointments')}
                activeOpacity={0.7}
              >
                <LinearGradient
                  colors={['rgba(255, 255, 255, 0.05)', 'rgba(255, 255, 255, 0.02)']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.queueItemGradient}
                >
                  <View style={[styles.statusIndicator, { backgroundColor: getStatusColor(appointment.status) }]} />
                  <View style={styles.queueInfo}>
                    <Text style={styles.queueTitle}>
                      {appointment.patientName}
                    </Text>
                    <Text style={styles.queueType}>{appointment.type}</Text>
                    <Text style={styles.queueSubtitle}>
                      {appointment.time} • {appointment.doctor}
                    </Text>
                  </View>
                  <View style={styles.queueStatus}>
                    <Text style={[styles.statusBadge, { backgroundColor: getStatusColor(appointment.status) + '20', color: getStatusColor(appointment.status) }]}>
                      {appointment.status.toUpperCase()}
                    </Text>
                    <ChevronRight size={16} color="rgba(255,255,255,0.3)" />
                  </View>
                </LinearGradient>
              </TouchableOpacity>
            ))}

            {todayAppointments.length > 3 && (
              <TouchableOpacity 
                style={styles.viewMoreButton}
                onPress={() => navigation.navigate('Appointments')}
              >
                <Text style={styles.viewMoreText}>
                  VIEW ALL {todayAppointments.length} APPOINTMENTS →
                </Text>
              </TouchableOpacity>
            )}
          </>
        )}
      </View>

      {/* Logout Button */}
      <TouchableOpacity style={styles.logoutBtn} onPress={logout}>
        <LogOut size={16} color={COLORS.error} />
        <Text style={styles.logoutText}>TERMINATE SESSION</Text>
      </TouchableOpacity>

      {/* Bottom Spacing for Navigation Bar */}
      <View style={{ height: 100 }} />
    </ScrollView>
    
    {/* Bottom Navigation Bar */}
    <BottomNavBar userRole={user?.roles?.[0] || 'doctor'} />
  );
}

function getStatusColor(status) {
  const colors = {
    pending: '#f39c12',
    confirmed: '#3498db',
    completed: '#2ecc71',
    cancelled: '#e74c3c',
  };
  return colors[status.toLowerCase()] || '#95a5a6';
}

const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    backgroundColor: COLORS.bgMain 
  },
  scrollContent: { 
    padding: SPACING.lg 
  },
  header: { 
    marginBottom: 30, 
    marginTop: 10,
    borderRadius: RADIUS.lg,
    overflow: 'hidden',
  },
  headerGradient: {
    padding: SPACING.lg,
  },
  hubContainer: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    gap: 6, 
    backgroundColor: 'rgba(0, 242, 254, 0.15)', 
    paddingHorizontal: 12, 
    paddingVertical: 6, 
    borderRadius: 20,
    alignSelf: 'flex-start',
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(0, 242, 254, 0.3)',
    ...SHADOWS.cyan,
  },
  hubText: { 
    fontSize: 9, 
    color: COLORS.cyan, 
    fontWeight: '900', 
    letterSpacing: 1 
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#2ecc71',
    marginLeft: 4,
  },
  welcomeText: { 
    fontSize: 10, 
    color: COLORS.cyan, 
    fontWeight: '900', 
    letterSpacing: 2,
    opacity: 0.8,
  },
  userName: { 
    fontSize: 28, 
    color: '#fff', 
    fontWeight: '900', 
    marginTop: 4,
    letterSpacing: 0.5,
  },
  timestamp: {
    fontSize: 11,
    color: 'rgba(255, 255, 255, 0.4)',
    fontWeight: '600',
    marginTop: 8,
  },
  statsGrid: { 
    flexDirection: 'row', 
    flexWrap: 'wrap', 
    gap: 12, 
    marginBottom: 30 
  },
  quickActions: { 
    marginBottom: 30 
  },
  sectionLabel: { 
    fontSize: 10, 
    color: 'rgba(255,255,255,0.5)', 
    fontWeight: '900', 
    letterSpacing: 2, 
    marginBottom: 15,
    textTransform: 'uppercase',
  },
  queueSection: {
    marginBottom: 30,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 15,
  },
  queueCount: {
    fontSize: 14,
    fontWeight: '900',
    color: COLORS.cyan,
    backgroundColor: 'rgba(0, 242, 254, 0.1)',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(0, 242, 254, 0.2)',
  },
  queueItem: { 
    marginBottom: 12,
    borderRadius: RADIUS.md,
    overflow: 'hidden',
    ...SHADOWS.md,
  },
  queueItemGradient: {
    flexDirection: 'row', 
    alignItems: 'center', 
    padding: 16, 
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  statusIndicator: {
    width: 4,
    height: '100%',
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
  },
  queueInfo: { 
    flex: 1,
    paddingLeft: 12,
  },
  queueTitle: { 
    color: '#fff', 
    fontSize: 15, 
    fontWeight: '800',
    marginBottom: 4,
  },
  queueType: {
    color: COLORS.cyan,
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 4,
  },
  queueSubtitle: { 
    color: 'rgba(255,255,255,0.5)', 
    fontSize: 11,
    fontWeight: '600',
  },
  queueStatus: {
    alignItems: 'flex-end',
    gap: 8,
  },
  statusBadge: {
    fontSize: 9,
    fontWeight: '900',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    letterSpacing: 0.5,
  },
  viewMoreButton: {
    alignItems: 'center',
    paddingVertical: 12,
    marginTop: 8,
  },
  viewMoreText: {
    color: COLORS.cyan,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
  },
  logoutBtn: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    justifyContent: 'center', 
    marginTop: 20, 
    gap: 10,
    padding: 16,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: 'rgba(231, 76, 60, 0.3)',
    backgroundColor: 'rgba(231, 76, 60, 0.05)',
  },
  logoutText: { 
    color: COLORS.error, 
    fontWeight: '900', 
    fontSize: 11, 
    letterSpacing: 1 
  }
});
