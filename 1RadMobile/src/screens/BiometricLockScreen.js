import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Alert,
  Animated,
  Image,
} from 'react-native';
import { Fingerprint, Lock, Shield } from 'lucide-react-native';
import { COLORS, SPACING, RADIUS, SHADOWS } from '../theme/TacticalTheme';
import BiometricService from '../services/BiometricService';

export default function BiometricLockScreen({ onUnlock }) {
  const [showPasscodeInput, setShowPasscodeInput] = useState(false);
  const [passcode, setPasscode] = useState('');
  const [biometricType, setBiometricType] = useState('Biometric');
  const [attempts, setAttempts] = useState(0);
  const [shakeAnimation] = useState(new Animated.Value(0));

  useEffect(() => {
    initializeAuth();
  }, []);

  const initializeAuth = async () => {
    const type = await BiometricService.getBiometricTypeName();
    setBiometricType(type);

    // Auto-trigger biometric if enabled
    const biometricEnabled = await BiometricService.isBiometricEnabled();
    if (biometricEnabled) {
      setTimeout(() => {
        handleBiometricAuth();
      }, 500);
    } else {
      // Show passcode input if biometric not enabled
      setShowPasscodeInput(true);
    }
  };

  const handleBiometricAuth = async () => {
    const result = await BiometricService.authenticateWithBiometrics(
      'Unlock 1RadMobile'
    );

    if (result.success) {
      onUnlock();
    } else {
      // Show passcode option
      setShowPasscodeInput(true);
    }
  };

  const handlePasscodeSubmit = async () => {
    if (passcode.length < 4) {
      Alert.alert('Error', 'Please enter your passcode');
      return;
    }

    const isValid = await BiometricService.verifyPasscode(passcode);
    
    if (isValid) {
      onUnlock();
    } else {
      setAttempts(attempts + 1);
      setPasscode('');
      shakeInput();
      
      if (attempts >= 2) {
        Alert.alert(
          'Too Many Attempts',
          'Please try again or use biometric authentication',
          [
            {
              text: 'Use Biometric',
              onPress: handleBiometricAuth,
            },
            {
              text: 'Try Again',
              style: 'cancel',
            },
          ]
        );
      } else {
        Alert.alert('Error', 'Incorrect passcode. Please try again.');
      }
    }
  };

  const shakeInput = () => {
    Animated.sequence([
      Animated.timing(shakeAnimation, { toValue: 10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnimation, { toValue: -10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnimation, { toValue: 10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnimation, { toValue: 0, duration: 50, useNativeDriver: true }),
    ]).start();
  };

  return (
    <View style={styles.container}>
      {/* Logo/Header */}
      <View style={styles.header}>
        <View style={styles.logoContainer}>
          <Shield size={64} color={COLORS.cyan} strokeWidth={2} />
        </View>
        <Text style={styles.appName}>1RAD MOBILE</Text>
        <Text style={styles.subtitle}>CLINICAL COMMAND CENTER</Text>
      </View>

      {/* Lock Icon */}
      <View style={styles.lockContainer}>
        {showPasscodeInput ? (
          <Lock size={80} color={COLORS.cyan} strokeWidth={1.5} />
        ) : (
          <Fingerprint size={80} color={COLORS.cyan} strokeWidth={1.5} />
        )}
      </View>

      {/* Authentication Section */}
      <View style={styles.authSection}>
        {!showPasscodeInput ? (
          <>
            <Text style={styles.authTitle}>Unlock with {biometricType}</Text>
            <Text style={styles.authSubtitle}>
              Touch the sensor to authenticate
            </Text>

            <TouchableOpacity
              style={styles.biometricButton}
              onPress={handleBiometricAuth}
            >
              <Fingerprint size={24} color={COLORS.bgCard} />
              <Text style={styles.biometricButtonText}>
                USE {biometricType.toUpperCase()}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.passcodeLink}
              onPress={() => setShowPasscodeInput(true)}
            >
              <Text style={styles.passcodeLinkText}>Use Passcode Instead</Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            <Text style={styles.authTitle}>Enter Passcode</Text>
            <Text style={styles.authSubtitle}>
              Enter your 4-6 digit passcode
            </Text>

            <Animated.View
              style={[
                styles.passcodeInputContainer,
                { transform: [{ translateX: shakeAnimation }] },
              ]}
            >
              <TextInput
                style={styles.passcodeInput}
                value={passcode}
                onChangeText={setPasscode}
                secureTextEntry
                keyboardType="numeric"
                maxLength={6}
                placeholder="••••••"
                placeholderTextColor={COLORS.textSecondary}
                autoFocus
                onSubmitEditing={handlePasscodeSubmit}
              />
            </Animated.View>

            <TouchableOpacity
              style={styles.submitButton}
              onPress={handlePasscodeSubmit}
            >
              <Text style={styles.submitButtonText}>UNLOCK</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.biometricLink}
              onPress={async () => {
                const biometricEnabled = await BiometricService.isBiometricEnabled();
                if (biometricEnabled) {
                  setShowPasscodeInput(false);
                  setTimeout(handleBiometricAuth, 300);
                } else {
                  Alert.alert(
                    'Biometric Not Enabled',
                    'Please enable biometric authentication in settings'
                  );
                }
              }}
            >
              <Fingerprint size={16} color={COLORS.cyan} />
              <Text style={styles.biometricLinkText}>
                Use {biometricType} Instead
              </Text>
            </TouchableOpacity>
          </>
        )}
      </View>

      {/* Footer */}
      <View style={styles.footer}>
        <Text style={styles.footerText}>
          Secured by 1Rad Security System
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bgMain,
    justifyContent: 'space-between',
  },
  header: {
    alignItems: 'center',
    paddingTop: 80,
  },
  logoContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: COLORS.cyan + '10',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.lg,
    borderWidth: 2,
    borderColor: COLORS.cyan + '40',
  },
  appName: {
    fontSize: 32,
    fontWeight: '900',
    color: COLORS.textPrimary,
    letterSpacing: 2,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.textSecondary,
    letterSpacing: 2,
  },
  lockContainer: {
    alignItems: 'center',
    marginVertical: SPACING.xl,
  },
  authSection: {
    paddingHorizontal: SPACING.xl,
    alignItems: 'center',
  },
  authTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: COLORS.textPrimary,
    marginBottom: SPACING.sm,
    textAlign: 'center',
  },
  authSubtitle: {
    fontSize: 14,
    color: COLORS.textSecondary,
    marginBottom: SPACING.xl,
    textAlign: 'center',
  },
  biometricButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.cyan,
    paddingVertical: SPACING.lg,
    paddingHorizontal: SPACING.xl * 2,
    borderRadius: RADIUS.lg,
    ...SHADOWS.cyan,
    marginBottom: SPACING.lg,
  },
  biometricButtonText: {
    fontSize: 14,
    fontWeight: '900',
    color: COLORS.bgCard,
    marginLeft: SPACING.md,
    letterSpacing: 1,
  },
  passcodeLink: {
    paddingVertical: SPACING.md,
  },
  passcodeLinkText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.cyan,
  },
  passcodeInputContainer: {
    width: '100%',
    marginBottom: SPACING.lg,
  },
  passcodeInput: {
    backgroundColor: COLORS.bgCard,
    borderWidth: 2,
    borderColor: COLORS.cyan,
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    fontSize: 24,
    color: COLORS.textPrimary,
    textAlign: 'center',
    fontWeight: '700',
    letterSpacing: 8,
  },
  submitButton: {
    backgroundColor: COLORS.cyan,
    paddingVertical: SPACING.lg,
    paddingHorizontal: SPACING.xl * 3,
    borderRadius: RADIUS.lg,
    ...SHADOWS.cyan,
    marginBottom: SPACING.lg,
  },
  submitButtonText: {
    fontSize: 14,
    fontWeight: '900',
    color: COLORS.bgCard,
    letterSpacing: 1,
  },
  biometricLink: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.md,
  },
  biometricLinkText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.cyan,
    marginLeft: SPACING.sm,
  },
  footer: {
    alignItems: 'center',
    paddingBottom: SPACING.xl,
  },
  footerText: {
    fontSize: 11,
    color: COLORS.textSecondary,
    fontWeight: '600',
  },
});
