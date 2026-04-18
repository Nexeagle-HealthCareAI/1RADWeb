import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Dimensions, Image } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS } from '../theme/TacticalTheme';

const { width } = Dimensions.get('window');

export default function SplashScreen({ onFinish }) {
  const logoFade = useRef(new Animated.Value(0)).current;
  const logoScale = useRef(new Animated.Value(0.8)).current;
  const textFade = useRef(new Animated.Value(0)).current;
  const textSlide = useRef(new Animated.Value(20)).current;

  useEffect(() => {
    Animated.sequence([
      // 1. Logo Pulse & Fade In
      Animated.parallel([
        Animated.timing(logoFade, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
        }),
        Animated.spring(logoScale, {
          toValue: 1,
          friction: 4,
          useNativeDriver: true,
        }),
      ]),
      // 2. Text Reveal
      Animated.parallel([
        Animated.timing(textFade, {
          toValue: 1,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.timing(textSlide, {
          toValue: 0,
          duration: 800,
          useNativeDriver: true,
        }),
      ]),
      // 3. Pause and Exit
      Animated.delay(1500),
    ]).start(() => onFinish && onFinish());
  }, []);

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={['#0b1120', '#061a40']}
        style={styles.background}
      >
        <Animated.View style={[
          styles.logoContainer, 
          { opacity: logoFade, transform: [{ scale: logoScale }] }
        ]}>
          <Image 
            source={require('../../assets/logo.png')} 
            style={styles.logo}
            resizeMode="contain"
          />
        </Animated.View>

        <Animated.View style={[
          styles.textContainer,
          { opacity: textFade, transform: [{ translateY: textSlide }] }
        ]}>
          <Text style={styles.brandText}>
            NEX<Text style={{ color: COLORS.cyan }}>EGALE</Text>
          </Text>
          <View style={styles.scannerLine} />
          <Text style={styles.tagline}>1RAD CLINICAL COMMAND HUB</Text>
        </Animated.View>
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  background: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoContainer: {
    width: 120,
    height: 120,
    marginBottom: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logo: {
    width: '100%',
    height: '100%',
  },
  textContainer: {
    alignItems: 'center',
  },
  brandText: {
    fontSize: 32,
    fontWeight: '900',
    color: '#fff',
    letterSpacing: 4,
  },
  tagline: {
    fontSize: 10,
    color: COLORS.cyan,
    fontWeight: '900',
    letterSpacing: 2,
    marginTop: 10,
    opacity: 0.8,
  },
  scannerLine: {
    width: 150,
    height: 1,
    backgroundColor: COLORS.cyan,
    marginTop: 12,
    shadowColor: COLORS.cyan,
    shadowOpacity: 0.8,
    shadowRadius: 5,
    elevation: 5,
  }
});
