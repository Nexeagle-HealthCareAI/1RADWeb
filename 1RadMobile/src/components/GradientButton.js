import React, { useRef } from 'react';
import { TouchableOpacity, Text, StyleSheet, Animated, ActivityIndicator } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS, SPACING, RADIUS, SHADOWS } from '../theme/TacticalTheme';

export default function GradientButton({
  title,
  icon: Icon,
  gradient = [COLORS.cyan, '#4facfe'],
  onPress,
  loading = false,
  disabled = false,
  style,
  textStyle,
  size = 'md', // sm, md, lg
  variant = 'solid', // solid, outline
}) {
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const handlePressIn = () => {
    Animated.spring(scaleAnim, {
      toValue: 0.95,
      useNativeDriver: true,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      tension: 50,
      friction: 7,
      useNativeDriver: true,
    }).start();
  };

  const sizes = {
    sm: { paddingVertical: 8, paddingHorizontal: 16, fontSize: 11 },
    md: { paddingVertical: 12, paddingHorizontal: 20, fontSize: 12 },
    lg: { paddingVertical: 16, paddingHorizontal: 24, fontSize: 14 },
  };

  const currentSize = sizes[size];

  if (variant === 'outline') {
    return (
      <Animated.View style={[{ transform: [{ scale: scaleAnim }] }, style]}>
        <TouchableOpacity
          style={[
            styles.button,
            styles.outlineButton,
            {
              paddingVertical: currentSize.paddingVertical,
              paddingHorizontal: currentSize.paddingHorizontal,
              borderColor: gradient[0],
            },
            disabled && styles.disabled,
          ]}
          onPress={onPress}
          onPressIn={handlePressIn}
          onPressOut={handlePressOut}
          disabled={disabled || loading}
          activeOpacity={0.8}
        >
          {loading ? (
            <ActivityIndicator size="small" color={gradient[0]} />
          ) : (
            <>
              {Icon && <Icon size={16} color={gradient[0]} style={styles.icon} />}
              <Text style={[styles.text, styles.outlineText, { fontSize: currentSize.fontSize, color: gradient[0] }, textStyle]}>
                {title}
              </Text>
            </>
          )}
        </TouchableOpacity>
      </Animated.View>
    );
  }

  return (
    <Animated.View style={[{ transform: [{ scale: scaleAnim }] }, style]}>
      <TouchableOpacity
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        disabled={disabled || loading}
        activeOpacity={0.8}
      >
        <LinearGradient
          colors={disabled ? ['#555', '#444'] : gradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={[
            styles.button,
            {
              paddingVertical: currentSize.paddingVertical,
              paddingHorizontal: currentSize.paddingHorizontal,
            },
            disabled && styles.disabled,
          ]}
        >
          {loading ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <>
              {Icon && <Icon size={16} color="#fff" style={styles.icon} />}
              <Text style={[styles.text, { fontSize: currentSize.fontSize }, textStyle]}>
                {title}
              </Text>
            </>
          )}
        </LinearGradient>
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: RADIUS.md,
    ...SHADOWS.cyan,
  },
  outlineButton: {
    backgroundColor: 'transparent',
    borderWidth: 2,
    shadowOpacity: 0,
    elevation: 0,
  },
  icon: {
    marginRight: SPACING.sm,
  },
  text: {
    color: '#fff',
    fontWeight: '900',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  outlineText: {
    fontWeight: '800',
  },
  disabled: {
    opacity: 0.5,
  },
});
