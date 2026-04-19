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
          
          {/* NexEagle Logo - Eagle Icon */}
          <View style={styles.eagleLogo}>
            <View style={styles.eagleWing}>
              <View style={styles.wingLeft} />
              <View style={styles.wingRight} />
            </View>
            <View style={styles.eagleBody}>
              <View style={styles.eagleHead} />
              <View style={styles.eagleTail} />
            </View>
            <View style={styles.eagleEye} />
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
            NEX<Text style={styles.companyNameHighlight}>EAGLE</Text>
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
          <Text style={styles.tagline}>RADIOLOGY COMMAND SYSTEM</Text>
          <Text style={styles.subTagline}>Powered by 1RAD Technology</Text>
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
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: COLORS.cyan,
    opacity: 0.3,
  },
  eagleLogo: {
    width: 120,
    height: 120,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  eagleWing: {
    position: 'absolute',
    width: 100,
    height: 60,
    top: 20,
  },
  wingLeft: {
    position: 'absolute',
    left: 0,
    width: 45,
    height: 30,
    backgroundColor: COLORS.cyan,
    borderTopLeftRadius: 30,
    borderBottomLeftRadius: 15,
    transform: [{ rotate: '-20deg' }],
  },
  wingRight: {
    position: 'absolute',
    right: 0,
    width: 45,
    height: 30,
    backgroundColor: COLORS.cyan,
    borderTopRightRadius: 30,
    borderBottomRightRadius: 15,
    transform: [{ rotate: '20deg' }],
  },
  eagleBody: {
    width: 30,
    height: 50,
    backgroundColor: COLORS.cyan,
    borderRadius: 15,
    marginTop: 30,
  },
  eagleHead: {
    width: 25,
    height: 25,
    backgroundColor: COLORS.cyan,
    borderRadius: 12.5,
    position: 'absolute',
    top: -10,
    left: 2.5,
  },
  eagleTail: {
    width: 20,
    height: 15,
    backgroundColor: COLORS.cyan,
    position: 'absolute',
    bottom: -8,
    left: 5,
    borderBottomLeftRadius: 10,
    borderBottomRightRadius: 10,
  },
  eagleEye: {
    width: 6,
    height: 6,
    backgroundColor: '#0b1120',
    borderRadius: 3,
    position: 'absolute',
    top: 48,
    left: 62,
  },
  
  // Company name styles
  companyNameContainer: {
    alignItems: 'center',
    marginBottom: 30,
  },
  companyName: {
    fontSize: 48,
    fontWeight: '900',
    color: '#ffffff',
    letterSpacing: 4,
    textAlign: 'center',
  },
  companyNameHighlight: {
    color: COLORS.cyan,
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
    fontSize: 14,
    fontWeight: '800',
    color: COLORS.cyan,
    letterSpacing: 3,
    textAlign: 'center',
    marginBottom: 8,
  },
  subTagline: {
    fontSize: 11,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.5)',
    letterSpacing: 2,
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
