import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, Animated } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '../context/AuthContext';
import { COLORS, SPACING, RADIUS, SHADOWS } from '../theme/TacticalTheme';
import { Smartphone, Key, Lock, ArrowLeft } from 'lucide-react-native';

export default function ForgotPasswordScreen({ navigation }) {
  const { resetPassword, sendOtp, verifyOtp } = useAuth();
  
  const [step, setStep] = useState(1); // 1: Identify, 2: Verification, 3: Reset
  const [identifier, setIdentifier] = useState('');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Animation values
  const fadeAnim = useState(new Animated.Value(0))[0];
  const slideAnim = useState(new Animated.Value(50))[0];

  // Fade-in animation on mount
  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 600,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 500,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  // Reset animation when step changes
  useEffect(() => {
    fadeAnim.setValue(0);
    slideAnim.setValue(30);
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 400,
        useNativeDriver: true,
      }),
    ]).start();
  }, [step]);

  const handleIdentify = async () => {
    if (!identifier) {
      setError('INVALID PROTOCOL: Enter your identity code');
      return;
    }
    setLoading(true);
    setError('');
    
    // Send OTP for password reset
    const result = await sendOtp(identifier);
    setLoading(false);
    
    if (result.success) {
      setStep(2);
      setError('');
    } else {
      setError(result.error || 'Failed to send recovery code');
    }
  };

  const handleVerify = async () => {
    if (!code || code.length !== 6) {
      setError('INVALID CODE: Enter 6-digit verification code');
      return;
    }
    setLoading(true);
    setError('');
    
    const result = await verifyOtp(identifier, code);
    setLoading(false);
    
    if (result.success) {
      setStep(3);
      setError('');
    } else {
      setError(result.error || 'Verification failed');
    }
  };

  const handleReset = async () => {
    if (!newPassword || !confirmPassword) {
      setError('INCOMPLETE: Enter both password fields');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('SECURITY ALERT: Passwords do not match');
      return;
    }
    if (newPassword.length < 6) {
      setError('WEAK KEY: Password must be at least 6 characters');
      return;
    }
    
    setLoading(true);
    setError('');
    
    const result = await resetPassword(identifier, newPassword);
    setLoading(false);
    
    if (result.success) {
      // Show success and navigate to login
      navigation.navigate('Login');
    } else {
      setError(result.error || 'Password reset failed');
    }
  };

  const renderStep1 = () => (
    <Animated.View 
      style={[
        styles.stepContainer,
        {
          opacity: fadeAnim,
          transform: [{ translateY: slideAnim }],
        },
      ]}
    >
      <Text style={styles.stepLabel}>PHASE 1: IDENTIFY AGENT</Text>
      
      <View style={styles.inputGroup}>
        <Smartphone size={18} color={COLORS.cyan} style={styles.inputIcon} />
        <TextInput
          style={styles.input}
          placeholder="REGISTERED IDENT (EMAIL/MOBILE)"
          placeholderTextColor="rgba(255,255,255,0.4)"
          value={identifier}
          onChangeText={setIdentifier}
          autoCapitalize="none"
          keyboardType="email-address"
        />
      </View>

      <TouchableOpacity 
        style={[styles.actionBtn, loading && styles.actionBtnDisabled]} 
        onPress={handleIdentify}
        disabled={loading}
      >
        <LinearGradient 
          colors={[COLORS.cyan, '#4facfe']} 
          start={{ x: 0, y: 0 }} 
          end={{ x: 1, y: 0 }} 
          style={styles.gradientBtn}
        >
          <Text style={styles.btnText}>
            {loading ? 'ANALYZING...' : 'INITIALIZE RECOVERY'}
          </Text>
        </LinearGradient>
      </TouchableOpacity>
    </Animated.View>
  );

  const renderStep2 = () => (
    <Animated.View 
      style={[
        styles.stepContainer,
        {
          opacity: fadeAnim,
          transform: [{ translateY: slideAnim }],
        },
      ]}
    >
      <Text style={styles.stepLabel}>PHASE 2: SECURITY DECRYPT</Text>
      
      <View style={styles.inputGroup}>
        <Key size={18} color={COLORS.cyan} style={styles.inputIcon} />
        <TextInput
          style={[styles.input, styles.otpInput]}
          placeholder="0 0 0 0 0 0"
          placeholderTextColor="rgba(255,255,255,0.4)"
          value={code}
          onChangeText={setCode}
          keyboardType="number-pad"
          maxLength={6}
        />
      </View>

      <Text style={styles.helperText}>
        A TEMPORARY CODE HAS BEEN BEAMED TO YOUR DEVICE.
      </Text>

      <TouchableOpacity 
        style={[styles.actionBtn, loading && styles.actionBtnDisabled]} 
        onPress={handleVerify}
        disabled={loading}
      >
        <LinearGradient 
          colors={[COLORS.cyan, '#4facfe']} 
          start={{ x: 0, y: 0 }} 
          end={{ x: 1, y: 0 }} 
          style={styles.gradientBtn}
        >
          <Text style={styles.btnText}>
            {loading ? 'VERIFYING...' : 'VERIFY & CONTINUE'}
          </Text>
        </LinearGradient>
      </TouchableOpacity>

      <TouchableOpacity onPress={() => setStep(1)} style={styles.backButton}>
        <Text style={styles.backButtonText}>INCORRECT IDENT? RE-INITIALIZE</Text>
      </TouchableOpacity>
    </Animated.View>
  );

  const renderStep3 = () => (
    <Animated.View 
      style={[
        styles.stepContainer,
        {
          opacity: fadeAnim,
          transform: [{ translateY: slideAnim }],
        },
      ]}
    >
      <Text style={styles.stepLabel}>PHASE 3: RESTORE ACCESS KEY</Text>
      
      <View style={styles.inputGroup}>
        <Lock size={18} color={COLORS.cyan} style={styles.inputIcon} />
        <TextInput
          style={styles.input}
          placeholder="NEW SECURE KEY (PASSWORD)"
          placeholderTextColor="rgba(255,255,255,0.4)"
          value={newPassword}
          onChangeText={setNewPassword}
          secureTextEntry
        />
      </View>

      <View style={styles.inputGroup}>
        <Lock size={18} color={COLORS.cyan} style={styles.inputIcon} />
        <TextInput
          style={styles.input}
          placeholder="VERIFY NEW KEY"
          placeholderTextColor="rgba(255,255,255,0.4)"
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          secureTextEntry
        />
      </View>

      <TouchableOpacity 
        style={[styles.actionBtn, loading && styles.actionBtnDisabled]} 
        onPress={handleReset}
        disabled={loading}
      >
        <LinearGradient 
          colors={[COLORS.cyan, '#4facfe']} 
          start={{ x: 0, y: 0 }} 
          end={{ x: 1, y: 0 }} 
          style={styles.gradientBtn}
        >
          <Text style={styles.btnText}>
            {loading ? 'RESTORING...' : 'UPDATE SECURE KEY'}
          </Text>
        </LinearGradient>
      </TouchableOpacity>
    </Animated.View>
  );

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
      <LinearGradient colors={['#0b1120', '#061a40']} style={styles.bgGradient} />
      
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backIcon}>
          <ArrowLeft size={24} color={COLORS.cyan} />
        </TouchableOpacity>
        <Text style={styles.logo}>1<Text style={{ color: COLORS.cyan }}>RAD</Text></Text>
        <Text style={styles.title}>Access Recovery</Text>
        <Text style={styles.subtitle}>RECOVERY GRID</Text>
      </View>

      {/* Glass Card */}
      <View style={styles.glassCard}>
        <View style={styles.phaseIndicator}>
          <Text style={styles.phaseText}>
            PHASE {step}: {step === 1 ? 'IDENTIFY AGENT' : step === 2 ? 'SECURITY DECRYPT' : 'RESTORE ACCESS KEY'}
          </Text>
        </View>

        {step === 1 && renderStep1()}
        {step === 2 && renderStep2()}
        {step === 3 && renderStep3()}

        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        <View style={styles.divider} />

        <TouchableOpacity onPress={() => navigation.navigate('Login')}>
          <Text style={styles.returnLink}>RETURN TO COMMAND PORTAL</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    backgroundColor: COLORS.bgMain 
  },
  scrollContent: { 
    padding: SPACING.lg, 
    paddingBottom: 100 
  },
  bgGradient: { 
    ...StyleSheet.absoluteFillObject 
  },
  header: { 
    alignItems: 'center', 
    marginTop: 40, 
    marginBottom: 30,
    position: 'relative',
  },
  backIcon: {
    position: 'absolute',
    left: 0,
    top: 0,
    padding: 8,
  },
  logo: { 
    fontSize: 42, 
    fontWeight: '900', 
    color: '#fff', 
    letterSpacing: 2 
  },
  title: { 
    fontSize: 14, 
    color: 'rgba(255,255,255,0.4)', 
    fontWeight: '800', 
    textTransform: 'uppercase', 
    letterSpacing: 4, 
    marginTop: 8 
  },
  subtitle: {
    fontSize: 24,
    fontWeight: '900',
    color: '#fff',
    marginTop: 20,
  },
  glassCard: { 
    ...SHADOWS.glass, 
    padding: SPACING.xl, 
    borderRadius: RADIUS.lg 
  },
  phaseIndicator: {
    marginBottom: 30,
    alignItems: 'center',
  },
  phaseText: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.5)',
    fontWeight: '800',
    letterSpacing: 1,
    textAlign: 'center',
  },
  stepContainer: {
    width: '100%',
  },
  stepLabel: {
    fontSize: 10,
    color: COLORS.cyan,
    fontWeight: '900',
    letterSpacing: 2,
    marginBottom: 20,
    textAlign: 'center',
    textTransform: 'uppercase',
  },
  inputGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    borderRadius: RADIUS.md,
    marginBottom: 15,
    paddingHorizontal: 15,
  },
  inputIcon: { 
    marginRight: 10 
  },
  input: {
    flex: 1,
    height: 50,
    color: '#fff',
    fontSize: 13,
  },
  otpInput: {
    letterSpacing: 8,
    textAlign: 'center',
    fontWeight: '900',
    fontSize: 18,
  },
  helperText: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.4)',
    textAlign: 'center',
    marginBottom: 20,
    fontWeight: '600',
  },
  actionBtn: {
    marginTop: 10,
    borderRadius: RADIUS.md,
    overflow: 'hidden',
  },
  actionBtnDisabled: {
    opacity: 0.6,
  },
  gradientBtn: {
    paddingVertical: 15,
    alignItems: 'center',
  },
  btnText: { 
    color: COLORS.bgMain, 
    fontWeight: '900', 
    letterSpacing: 1,
    fontSize: 13,
  },
  backButton: {
    marginTop: 15,
    alignItems: 'center',
  },
  backButtonText: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.1)',
    marginVertical: 25,
  },
  returnLink: {
    color: COLORS.cyan,
    fontSize: 13,
    fontWeight: '800',
    textAlign: 'center',
    borderBottomWidth: 1,
    borderBottomColor: COLORS.cyan,
    alignSelf: 'center',
  },
  errorText: { 
    color: COLORS.error, 
    fontSize: 11, 
    textAlign: 'center', 
    marginTop: 15, 
    fontWeight: '700',
    backgroundColor: 'rgba(231, 76, 60, 0.1)',
    padding: 10,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: 'rgba(231, 76, 60, 0.2)',
  }
});
