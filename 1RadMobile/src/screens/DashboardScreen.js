import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Dimensions } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { useAppointments } from '../context/AppointmentContext';
import { COLORS, SPACING, RADIUS, SHADOWS } from '../theme/TacticalTheme';
import { Activity, Users, Calendar, Settings, LogOut, ChevronRight, Plus, Shield } from 'lucide-react-native';

const { width } = Dimensions.get('window');

export default function DashboardScreen({ navigation }) {
  const { user, isAdmin, logout } = useAuth();
  const { getTodayAppointments, getUpcomingAppointments } = useAppointments();

  const todayAppointments = getTodayAppointments();
  const upcomingAppointments = getUpcomingAppointments();

  const MISSION_CARDS = [
    { 
      title: 'TODAY\'S APPOINTMENTS', 
      icon: Calendar, 
      color: COLORS.cyan, 
      count: todayAppointments.length,
      onPress: () => navigation.navigate('Appointments')
    },
    { 
      title: 'UPCOMING MISSIONS', 
      icon: Activity, 
      color: COLORS.indigo, 
      count: upcomingAppointments.length,
      onPress: () => navigation.navigate('Appointments')
    },
    { 
      title: 'TACTICAL HUB', 
      icon: Users, 
      color: COLORS.gold, 
      count: 'LIVE',
      onPress: () => {}
    },
  ];

  // Add Admin Board card if user is admin
  if (isAdmin) {
    MISSION_CARDS.push({
      title: 'ADMIN BOARD',
      icon: Shield,
      color: COLORS.error,
      count: 'CTRL',
      onPress: () => navigation.navigate('AdminBoard')
    });
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
      <View style={styles.header}>
        <Text style={styles.welcomeText}>WELCOME, MISSION LEADER</Text>
        <Text style={styles.userName}>{user?.name || 'IDENTITY UNKNOWN'}</Text>
      </View>

      <View style={styles.statsGrid}>
        {MISSION_CARDS.map((card, idx) => (
          <TouchableOpacity key={idx} style={styles.statCard} onPress={card.onPress}>
            <View style={[styles.iconContainer, { backgroundColor: card.color + '20' }]}>
              <card.icon size={20} color={card.color} />
            </View>
            <Text style={styles.statCount}>{card.count}</Text>
            <Text style={styles.statTitle}>{card.title}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Quick Actions */}
      <View style={styles.quickActions}>
        <Text style={styles.sectionLabel}>QUICK ACTIONS</Text>
        
        <TouchableOpacity 
          style={styles.actionButton}
          onPress={() => navigation.navigate('Appointments', { 
            screen: 'CreateAppointment' 
          })}
        >
          <Plus size={16} color={COLORS.bgMain} />
          <Text style={styles.actionButtonText}>NEW APPOINTMENT</Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={[styles.actionButton, styles.secondaryAction]}
          onPress={() => navigation.navigate('Appointments')}
        >
          <Calendar size={16} color={COLORS.cyan} />
          <Text style={[styles.actionButtonText, { color: COLORS.cyan }]}>
            VIEW ALL APPOINTMENTS
          </Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.sectionLabel}>TODAY'S OPERATIONAL QUEUE</Text>
      
      {todayAppointments.length === 0 ? (
        <View style={styles.emptyQueue}>
          <Calendar size={32} color={COLORS.textSecondary} />
          <Text style={styles.emptyQueueText}>NO MISSIONS SCHEDULED</Text>
          <Text style={styles.emptyQueueSubtext}>All clear for today</Text>
        </View>
      ) : (
        todayAppointments.slice(0, 3).map((appointment, i) => (
          <TouchableOpacity 
            key={appointment.id} 
            style={styles.queueItem}
            onPress={() => navigation.navigate('Appointments')}
          >
            <View style={styles.queueInfo}>
              <Text style={styles.queueTitle}>
                {appointment.patientName} - {appointment.type}
              </Text>
              <Text style={styles.queueSubtitle}>
                {appointment.time} • {appointment.doctor} • {appointment.status.toUpperCase()}
              </Text>
            </View>
            <ChevronRight size={16} color="rgba(255,255,255,0.3)" />
          </TouchableOpacity>
        ))
      )}

      {todayAppointments.length > 3 && (
        <TouchableOpacity 
          style={styles.viewMoreButton}
          onPress={() => navigation.navigate('Appointments')}
        >
          <Text style={styles.viewMoreText}>
            VIEW ALL {todayAppointments.length} APPOINTMENTS
          </Text>
        </TouchableOpacity>
      )}

      <TouchableOpacity style={styles.logoutBtn} onPress={logout}>
        <LogOut size={16} color={COLORS.error} />
        <Text style={styles.logoutText}>TERMINATE SESSION</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bgMain },
  scrollContent: { padding: SPACING.lg },
  header: { marginBottom: 30, marginTop: 10 },
  welcomeText: { fontSize: 10, color: COLORS.cyan, fontWeight: '900', letterSpacing: 2 },
  userName: { fontSize: 24, color: '#fff', fontWeight: '900', marginTop: 4 },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 30 },
  statCard: { 
    flex: 1, 
    minWidth: (width - SPACING.lg * 2 - 12) / 2,
    ...SHADOWS.glass, 
    padding: 15, 
    borderRadius: RADIUS.lg, 
    alignItems: 'center' 
  },
  iconContainer: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  statCount: { fontSize: 18, color: '#fff', fontWeight: '900' },
  statTitle: { fontSize: 8, color: 'rgba(255,255,255,0.5)', fontWeight: '700', marginTop: 4, textAlign: 'center' },
  quickActions: { marginBottom: 30 },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.cyan,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: RADIUS.md,
    marginBottom: 10,
    ...SHADOWS.cyan,
  },
  secondaryAction: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: COLORS.cyan,
  },
  actionButtonText: {
    color: COLORS.bgMain,
    fontWeight: '900',
    fontSize: 12,
    letterSpacing: 1,
    marginLeft: 8,
  },
  sectionLabel: { fontSize: 10, color: 'rgba(255,255,255,0.4)', fontWeight: '900', letterSpacing: 2, marginBottom: 15 },
  queueItem: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    backgroundColor: 'rgba(255,255,255,0.03)', 
    padding: 15, 
    borderRadius: RADIUS.md, 
    marginBottom: 10,
    borderLeftWidth: 2,
    borderLeftColor: COLORS.indigo
  },
  queueInfo: { flex: 1 },
  queueTitle: { color: '#fff', fontSize: 13, fontWeight: '700' },
  queueSubtitle: { color: 'rgba(255,255,255,0.4)', fontSize: 11, marginTop: 2 },
  emptyQueue: {
    alignItems: 'center',
    paddingVertical: 40,
    opacity: 0.6,
  },
  emptyQueueText: {
    color: COLORS.textSecondary,
    fontSize: 14,
    fontWeight: '700',
    marginTop: 10,
  },
  emptyQueueSubtext: {
    color: COLORS.textSecondary,
    fontSize: 11,
    marginTop: 4,
  },
  viewMoreButton: {
    alignItems: 'center',
    paddingVertical: 10,
    marginBottom: 20,
  },
  viewMoreText: {
    color: COLORS.cyan,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
  },
  logoutBtn: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    justifyContent: 'center', 
    marginTop: 40, 
    gap: 10,
    padding: 15,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: 'rgba(220, 53, 69, 0.2)'
  },
  logoutText: { color: COLORS.error, fontWeight: '900', fontSize: 11, letterSpacing: 1 }
});
