import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { COLORS, SPACING, RADIUS } from '../theme/TacticalTheme';
import GradientButton from './GradientButton';

export default function EmptyState({
  icon: Icon,
  title,
  subtitle,
  actionText,
  onAction,
  animated = true,
}) {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;
  const iconScale = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (animated) {
      Animated.sequence([
        Animated.parallel([
          Animated.spring(iconScale, {
            toValue: 1,
            tension: 50,
            friction: 7,
            useNativeDriver: true,
          }),
          Animated.timing(fadeAnim, {
            toValue: 1,
            duration: 600,
            useNativeDriver: true,
          }),
        ]),
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: 400,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      fadeAnim.setValue(1);
      slideAnim.setValue(0);
      iconScale.setValue(1);
    }
  }, [animated]);

  return (
    <Animated.View 
      style={[
        styles.container,
        {
          opacity: fadeAnim,
          transform: [{ translateY: slideAnim }],
        },
      ]}
    >
      {Icon && (
        <Animated.View 
          style={[
            styles.iconContainer,
            { transform: [{ scale: iconScale }] },
          ]}
        >
          <View style={styles.iconBackground}>
            <Icon size={48} color={COLORS.cyan} />
          </View>
        </Animated.View>
      )}

      <Text style={styles.title}>{title}</Text>
      
      {subtitle && (
        <Text style={styles.subtitle}>{subtitle}</Text>
      )}

      {actionText && onAction && (
        <View style={styles.actionContainer}>
          <GradientButton
            title={actionText}
            onPress={onAction}
            size="md"
          />
        </View>
      )}

      {/* Decorative elements */}
      <View style={styles.decorativeCircle1} />
      <View style={styles.decorativeCircle2} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    paddingHorizontal: SPACING.xl,
    position: 'relative',
  },
  iconContainer: {
    marginBottom: SPACING.lg,
  },
  iconBackground: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: 'rgba(0, 242, 254, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(0, 242, 254, 0.2)',
  },
  title: {
    fontSize: 18,
    fontWeight: '900',
    color: '#fff',
    textAlign: 'center',
    marginBottom: SPACING.sm,
    letterSpacing: 0.5,
  },
  subtitle: {
    fontSize: 13,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.5)',
    textAlign: 'center',
    marginBottom: SPACING.lg,
    lineHeight: 20,
  },
  actionContainer: {
    marginTop: SPACING.md,
    width: '100%',
    maxWidth: 250,
  },
  decorativeCircle1: {
    position: 'absolute',
    top: 20,
    right: 20,
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'rgba(0, 242, 254, 0.05)',
    borderWidth: 1,
    borderColor: 'rgba(0, 242, 254, 0.1)',
  },
  decorativeCircle2: {
    position: 'absolute',
    bottom: 30,
    left: 30,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0, 242, 254, 0.05)',
    borderWidth: 1,
    borderColor: 'rgba(0, 242, 254, 0.1)',
  },
});
