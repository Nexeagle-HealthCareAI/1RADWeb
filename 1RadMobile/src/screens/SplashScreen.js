import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Dimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS } from '../theme/TacticalTheme';

const { width, height } = Dimensions.get('window');

export default function SplashScreen({ navigation }) {
  // Animation values
  const logoScale = useRef(new Animated.Value(0)).current;
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const logoRotate = useRef(new Animated.Value(0)).current;
  
  const companyNameOpacity = useRef(new Animated.Value(0)).current;
  const companyNameSlide = useRef(new Animated.Value(50)).current;
  
  const taglineOpacity = useRef(new Animated.Value(0)).current;
  const taglineSlide = useRef(new Animated.Value(30)).current;
  
  const glowPulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Start animation sequence
    Animated.sequence([
      // 1. Logo appears with scale and rotation
      Animated.parallel([
        Animated.spring(logoScale, {
          toValue: 1,
          tension: 50,
          friction: 7,
          useNativeDriver: true,
        }),
        Animated.timing(logoOpacity, {
          toValue: 1,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.timing(logoRotate, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
        }),
      ]),
      
      // 2. Company name slides in
      Animated.delay(200),
      Animated.parallel([
        Animated.timing(companyNameOpacity, {
          toValue: 1,
          duration: 600,
          useNativeDriver: true,
        }),
        Animated.spring(companyNameSlide, {
          toValue: 0,
          tension: 50,
          friction: 8,
          useNativeDriver: true,
        }),
      ]),
      
      // 3. Tagline appears
      Animated.delay(300),
      Animated.parallel([
        Animated.timing(taglineOpacity, {
          toValue: 1,
          duration: 500,
          useNativeDriver: true,
        }),
        Animated.spring(taglineSlide, {
          toValue: 0,
          tension: 50,
          friction: 8,
          useNativeDriver: true,
        }),
      ]),
      
      // 4. Hold for a moment
      Animated.delay(1000),
    ]).start(() => {
      // Navigate to Login after animation completes
      navigation.replace('Login');
    });

    // Continuous glow pulse animation
    Animated.loop(
      Animated.sequence([
        Animated.timing(glowPulse, {
          toValue: 1,
          duration: 1500,
          useNativeDriver: true,
        }),
        Animated.timing(glowPulse, {
          toValue: 0,
          duration: 1500,
          useNativeDriver: true,
        }),
      ])
    ).start();
  }, []);

  const logoRotateInterpolate = logoRotate.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  const glowOpacity = glowPulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.3, 0.8],
  });

  const glowScale = glowPulse.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.2],
  });

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={['#0b1120', '#061a40', '#0b1120']}
        style={styles.gradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      />

      {/* Animated background particles */}
      <View style={styles.particlesContainer}>
        {[...Array(20)].map((_, i) => (
          <View
            key={i}
            style={[
              styles.particle,
              {
                left: `${Math.random() * 100}%`,
                top: `${Math.random() * 100}%`,
                width: Math.random() * 3 + 1,
                height: Math.random() * 3 + 1,
                opacity: Math.random() * 0.5 + 0.2,
              },
            ]}
          />
        ))}
      </View>

      {/* Main content */}
      <View style={styles.content}>
        {/* Logo with glow effect */}
        <Animated.View
          style={[
            styles.logoContainer,
            {
              opacity: logoOpacity,
              transform: [
                { scale: logoScale },
                { rotate: logoRotateInterpolate },
              ],
            },
          ]}
        >
          {/* Glow effect */}
          <Animated.View
            style={[
              styles.logoGlow,
              {
                opacity: glowOpacity,
                transform: [{ scale: glowScale }],
              },
            ]}
          />
          
          {/* 1RAD Logo */}
          <View style={styles.radLogo}>
            <Text style={styles.radLogoText}>
              1<Text style={styles.radLogoAccent}>RAD</Text>
            </Text>
          </View>
        </Animated.View>

        {/* Company Name */}
        <Animated.View
          style={[
            styles.companyNameContainer,
            {
              opacity: companyNameOpacity,
              transform: [{ translateY: companyNameSlide }],
            },
          ]}
        >
          <Text style={styles.companyName}>
            CLINICAL COMMAND CENTER
          </Text>
          <View style={styles.underline} />
        </Animated.View>

        {/* Tagline */}
        <Animated.View
          style={[
            styles.taglineContainer,
            {
              opacity: taglineOpacity,
              transform: [{ translateY: taglineSlide }],
            },
          ]}
        >
          <Text style={styles.tagline}>RADIOLOGY MANAGEMENT SYSTEM</Text>
          <View style={styles.nexEagleBadge}>
            <View style={styles.nexEagleIcon}>
              <View style={styles.miniEagleWing}>
                <View style={styles.miniWingLeft} />
                <View style={styles.miniWingRight} />
              </View>
            </View>
            <Text style={styles.subTagline}>Powered by NexEagle</Text>
          </View>
        </Animated.View>

        {/* Loading indicator */}
        <Animated.View
          style={[
            styles.loadingContainer,
            { opacity: taglineOpacity },
          ]}
        >
          <View style={styles.loadingBar}>
            <Animated.View
              style={[
                styles.loadingProgress,
                {
                  width: glowPulse.interpolate({
                    inputRange: [0, 1],
                    outputRange: ['0%', '100%'],
                  }),
                },
              ]}
            />
          </View>
          <Text style={styles.loadingText}>INITIALIZING SYSTEM...</Text>
        </Animated.View>
      </View>

      {/* Bottom branding */}
      <Animated.View
        style={[
          styles.bottomBranding,
          { opacity: taglineOpacity },
        ]}
      >
        <Text style={styles.versionText}>Version 1.0.0</Text>
        <Text style={styles.copyrightText}>© 2026 NexEagle Technologies</Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0b1120',
  },
  gradient: {
    ...StyleSheet.absoluteFillObject,
  },
  particlesContainer: {
    ...StyleSheet.absoluteFillObject,
  },
  particle: {
    position: 'absolute',
    backgroundColor: COLORS.cyan,
    borderRadius: 50,
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
  },
  
  // Logo styles
  logoContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 60,
  },
  logoGlow: {
    position: 'absolute',
    width: 250,
    height: 250,
    borderRadius: 125,
    backgroundColor: COLORS.cyan,
    opacity: 0.3,
  },
  radLogo: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 30,
    paddingVertical: 20,
  },
  radLogoText: {
    fontSize: 80,
    fontWeight: '900',
    color: '#ffffff',
    letterSpacing: 4,
    textShadowColor: COLORS.cyan,
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 20,
  },
  radLogoAccent: {
    color: COLORS.cyan,
  },
  
  // Company name styles
  companyNameContainer: {
    alignItems: 'center',
    marginBottom: 30,
  },
  companyName: {
    fontSize: 24,
    fontWeight: '900',
    color: '#ffffff',
    letterSpacing: 3,
    textAlign: 'center',
  },
  underline: {
    width: 120,
    height: 3,
    backgroundColor: COLORS.cyan,
    marginTop: 10,
    borderRadius: 2,
  },
  
  // Tagline styles
  taglineContainer: {
    alignItems: 'center',
    marginBottom: 60,
  },
  tagline: {
    fontSize: 12,
    fontWeight: '800',
    color: 'rgba(255, 255, 255, 0.6)',
    letterSpacing: 2,
    textAlign: 'center',
    marginBottom: 20,
  },
  nexEagleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(0, 242, 254, 0.2)',
  },
  nexEagleIcon: {
    width: 20,
    height: 20,
    marginRight: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  miniEagleWing: {
    width: 20,
    height: 12,
    position: 'relative',
  },
  miniWingLeft: {
    position: 'absolute',
    left: 0,
    width: 9,
    height: 8,
    backgroundColor: COLORS.cyan,
    borderTopLeftRadius: 8,
    borderBottomLeftRadius: 4,
    transform: [{ rotate: '-25deg' }],
  },
  miniWingRight: {
    position: 'absolute',
    right: 0,
    width: 9,
    height: 8,
    backgroundColor: COLORS.cyan,
    borderTopRightRadius: 8,
    borderBottomRightRadius: 4,
    transform: [{ rotate: '25deg' }],
  },
  subTagline: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.cyan,
    letterSpacing: 1.5,
    textAlign: 'center',
  },
  
  // Loading styles
  loadingContainer: {
    alignItems: 'center',
    width: '100%',
  },
  loadingBar: {
    width: 200,
    height: 3,
    backgroundColor: 'rgba(0, 242, 254, 0.2)',
    borderRadius: 2,
    overflow: 'hidden',
    marginBottom: 15,
  },
  loadingProgress: {
    height: '100%',
    backgroundColor: COLORS.cyan,
    borderRadius: 2,
  },
  loadingText: {
    fontSize: 10,
    fontWeight: '700',
    color: 'rgba(255, 255, 255, 0.4)',
    letterSpacing: 2,
  },
  
  // Bottom branding
  bottomBranding: {
    position: 'absolute',
    bottom: 40,
    alignItems: 'center',
    width: '100%',
  },
  versionText: {
    fontSize: 10,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.3)',
    marginBottom: 5,
  },
  copyrightText: {
    fontSize: 10,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.3)',
  },
});
