import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS, SPACING, RADIUS, SHADOWS } from '../theme/TacticalTheme';

export default function AnimatedStatCard({ 
  title, 
  value, 
  icon: Icon, 
  color = COLORS.cyan,
  gradient = [COLORS.cyan, '#4facfe'],
  onPress,
  animated = true,
  suffix = '',
  pulse = false
}) {
  const scaleAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const countAnim = useRef(new Animated.Value(0)).current;
  const displayValue = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Initial scale animation
    Animated.spring(scaleAnim, {
      toValue: 1,
      tension: 50,
      friction: 7,
      useNativeDriver: true,
    }).start();

    // Count up animation for numbers
    if (typeof value === 'number' && animated) {
      Animated.timing(countAnim, {
        toValue: value,
        duration: 1000,
        useNativeDriver: false,
      }).start();
    }

    // Pulse animation for live indicators
    if (pulse) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.1,
            duration: 1000,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 1000,
            useNativeDriver: true,
          }),
        ])
      ).start();
    }
  }, [value, animated, pulse]);

  const handlePress = () => {
    // Press animation
    Animated.sequence([
      Animated.timing(scaleAnim, {
        toValue: 0.95,
        duration: 100,
        useNativeDriver: true,
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        tension: 50,
        friction: 7,
        useNativeDriver: true,
      }),
    ]).start();

    if (onPress) onPress();
  };

  // Format animated value
  const animatedValue = typeof value === 'number' && animated
    ? countAnim.interpolate({
        inputRange: [0, value],
        outputRange: [0, value],
      })
    : null;

  return (
    <Animated.View style={[styles.container, { transform: [{ scale: scaleAnim }] }]}>
      <TouchableOpacity 
        style={styles.touchable} 
        onPress={handlePress}
        activeOpacity={0.8}
      >
        <LinearGradient
          colors={['rgba(255, 255, 255, 0.05)', 'rgba(255, 255, 255, 0.02)']}
          style={styles.card}
        >
          {/* Icon with gradient background */}
          <Animated.View style={[styles.iconContainer, { transform: [{ scale: pulseAnim }] }]}>
            <LinearGradient
              colors={gradient}
              style={styles.iconGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            >
              <Icon size={24} color="#fff" />
            </LinearGradient>
          </Animated.View>

          {/* Value */}
          <View style={styles.valueContainer}>
            {typeof value === 'number' && animated ? (
              <Animated.Text style={styles.value}>
                {animatedValue ? Math.round(animatedValue.__getValue()) : value}
                {suffix}
              </Animated.Text>
            ) : (
              <Text style={styles.value}>{value}{suffix}</Text>
            )}
          </View>

          {/* Title */}
          <Text style={styles.title} numberOfLines={2}>{title}</Text>

          {/* Glow effect */}
          <View style={[styles.glow, { backgroundColor: color }]} />
        </LinearGradient>
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    minWidth: 150,
  },
  touchable: {
    flex: 1,
  },
  card: {
    flex: 1,
    padding: SPACING.lg,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 140,
    overflow: 'hidden',
    ...SHADOWS.md,
  },
  iconContainer: {
    marginBottom: SPACING.md,
  },
  iconGradient: {
    width: 56,
    height: 56,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    ...SHADOWS.cyan,
  },
  valueContainer: {
    marginBottom: SPACING.xs,
  },
  value: {
    fontSize: 28,
    fontWeight: '900',
    color: '#fff',
    letterSpacing: 1,
  },
  title: {
    fontSize: 10,
    fontWeight: '800',
    color: 'rgba(255, 255, 255, 0.6)',
    textAlign: 'center',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  glow: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 2,
    opacity: 0.5,
  },
});
