import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { COLORS, SPACING, RADIUS } from '../theme/TacticalTheme';
import { DollarSign } from 'lucide-react-native';
import BottomNavBar from '../components/BottomNavBar';
import { useAuth } from '../context/AuthContext';

export default function FinanceScreen() {
  const { user } = useAuth();

  return (
    <View style={styles.container}>
      <ScrollView style={styles.content} contentContainerStyle={styles.scrollContent}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.iconContainer}>
            <DollarSign size={32} color={COLORS.cyan} strokeWidth={2.5} />
          </View>
          <Text style={styles.title}>FINANCE MODULE</Text>
          <Text style={styles.subtitle}>Financial Operations & Billing</Text>
        </View>

        {/* Coming Soon */}
        <View style={styles.comingSoon}>
          <Text style={styles.comingSoonText}>🚧 UNDER CONSTRUCTION 🚧</Text>
          <Text style={styles.comingSoonSubtext}>
            This module is currently being developed and will be available soon.
          </Text>
        </View>

        {/* Feature List */}
        <View style={styles.featureList}>
          <Text style={styles.featureTitle}>UPCOMING FEATURES:</Text>
          <View style={styles.featureItem}>
            <Text style={styles.featureBullet}>•</Text>
            <Text style={styles.featureText}>Billing & Invoicing</Text>
          </View>
          <View style={styles.featureItem}>
            <Text style={styles.featureBullet}>•</Text>
            <Text style={styles.featureText}>Payment Processing</Text>
          </View>
          <View style={styles.featureItem}>
            <Text style={styles.featureBullet}>•</Text>
            <Text style={styles.featureText}>Financial Reports</Text>
          </View>
          <View style={styles.featureItem}>
            <Text style={styles.featureBullet}>•</Text>
            <Text style={styles.featureText}>Revenue Analytics</Text>
          </View>
          <View style={styles.featureItem}>
            <Text style={styles.featureBullet}>•</Text>
            <Text style={styles.featureText}>Insurance Claims</Text>
          </View>
        </View>

        <View style={{ height: 100 }} />
      </ScrollView>

      <BottomNavBar userRole={user?.roles?.[0] || 'doctor'} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bgMain,
  },
  content: {
    flex: 1,
  },
  scrollContent: {
    padding: SPACING.lg,
  },
  header: {
    alignItems: 'center',
    marginBottom: 40,
    marginTop: 20,
  },
  iconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(0, 242, 254, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    borderWidth: 2,
    borderColor: 'rgba(0, 242, 254, 0.3)',
  },
  title: {
    fontSize: 24,
    fontWeight: '900',
    color: '#fff',
    letterSpacing: 1,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textSecondary,
    letterSpacing: 0.5,
  },
  comingSoon: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    padding: SPACING.xl,
    borderRadius: RADIUS.lg,
    alignItems: 'center',
    marginBottom: 30,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  comingSoonText: {
    fontSize: 16,
    fontWeight: '900',
    color: COLORS.gold,
    letterSpacing: 1,
    marginBottom: 12,
  },
  comingSoonSubtext: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 18,
  },
  featureList: {
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    padding: SPACING.lg,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  featureTitle: {
    fontSize: 11,
    fontWeight: '900',
    color: COLORS.cyan,
    letterSpacing: 1,
    marginBottom: 16,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  featureBullet: {
    fontSize: 16,
    color: COLORS.cyan,
    marginRight: 12,
    fontWeight: '900',
  },
  featureText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textPrimary,
    letterSpacing: 0.3,
  },
});
