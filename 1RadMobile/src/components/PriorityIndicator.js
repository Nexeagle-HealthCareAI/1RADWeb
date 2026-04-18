import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { COLORS, SPACING, RADIUS } from '../theme/TacticalTheme';
import { AlertTriangle, AlertCircle, Info, Minus } from 'lucide-react-native';

export default function PriorityIndicator({ priority, showLabel = true, size = 16 }) {
  const getPriorityConfig = (priority) => {
    switch (priority?.toLowerCase()) {
      case 'urgent':
        return {
          color: COLORS.error,
          icon: AlertTriangle,
          label: 'URGENT',
          bgColor: COLORS.error + '20'
        };
      case 'high':
        return {
          color: COLORS.gold,
          icon: AlertCircle,
          label: 'HIGH',
          bgColor: COLORS.gold + '20'
        };
      case 'medium':
        return {
          color: COLORS.cyan,
          icon: Info,
          label: 'MEDIUM',
          bgColor: COLORS.cyan + '20'
        };
      case 'low':
        return {
          color: COLORS.textSecondary,
          icon: Minus,
          label: 'LOW',
          bgColor: COLORS.textSecondary + '20'
        };
      default:
        return {
          color: COLORS.textSecondary,
          icon: Minus,
          label: 'NORMAL',
          bgColor: COLORS.textSecondary + '20'
        };
    }
  };

  const config = getPriorityConfig(priority);
  const Icon = config.icon;

  if (!showLabel) {
    return (
      <View style={[styles.iconOnly, { backgroundColor: config.bgColor }]}>
        <Icon size={size} color={config.color} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: config.bgColor }]}>
      <Icon size={12} color={config.color} />
      <Text style={[styles.label, { color: config.color }]}>
        {config.label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: RADIUS.sm,
    alignSelf: 'flex-start',
  },
  iconOnly: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontSize: 9,
    fontWeight: '700',
    marginLeft: 4,
    letterSpacing: 0.5,
  },
});