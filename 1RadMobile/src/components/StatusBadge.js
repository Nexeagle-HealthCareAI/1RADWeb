import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { COLORS, SPACING, RADIUS } from '../theme/TacticalTheme';

export default function StatusBadge({ status, size = 'medium' }) {
  const getStatusColor = (status) => {
    switch (status?.toLowerCase()) {
      case 'confirmed': return COLORS.success;
      case 'scheduled': return COLORS.cyan;
      case 'pending': return COLORS.gold;
      case 'cancelled': return COLORS.error;
      case 'completed': return COLORS.indigo;
      default: return COLORS.textSecondary;
    }
  };

  const sizeStyles = {
    small: { paddingHorizontal: 6, paddingVertical: 2, fontSize: 8 },
    medium: { paddingHorizontal: 8, paddingVertical: 4, fontSize: 9 },
    large: { paddingHorizontal: 10, paddingVertical: 6, fontSize: 10 }
  };

  const color = getStatusColor(status);
  const sizeStyle = sizeStyles[size];

  return (
    <View style={[
      styles.badge,
      { 
        backgroundColor: color + '20',
        borderColor: color + '40',
        paddingHorizontal: sizeStyle.paddingHorizontal,
        paddingVertical: sizeStyle.paddingVertical
      }
    ]}>
      <Text style={[
        styles.badgeText,
        { 
          color: color,
          fontSize: sizeStyle.fontSize
        }
      ]}>
        {status?.toUpperCase() || 'UNKNOWN'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    alignSelf: 'flex-start',
  },
  badgeText: {
    fontWeight: '700',
    letterSpacing: 0.5,
  },
});