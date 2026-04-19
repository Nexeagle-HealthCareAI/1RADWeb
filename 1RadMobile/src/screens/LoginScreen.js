import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Dimensions, Animated } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '../context/AuthContext';
import { COLORS, SPACING, RADIUS, SHADOWS } from '../theme/TacticalTheme';
import { Shield, Lock, Smartphone, Key, Eye, EyeOff } from 'lucide-react-native';

const { width } = Dimensions.get('window');

export default function LoginScreen({ navigation, route }) {
  const { login, sendOtp, verifyOtp } = useAuth();
  
  // UI State
  const [loginMode, setLoginMode] = useState('password'); // 'password' | 'otp'
  const [otpStep, setOtpStep] = useState('request'); // 'request' | 'verify'
  
  // Form State
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [otp, setOtp] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [countdown, setCountdown] = useState(0);

  // Animation values
  const fadeAnim = useState(new Animated.Value(0))[0];
  const slideAnim = useState(new Animated.Value(50))[0];
  const otpFieldAnim = useState(new Animated.Value(0))[0];

  // Countdown timer for OTP resend
  useEffect(() => {
    let timer;
    if (countdown > 0) {
      timer = setInterval(() => setCountdown(prev => prev - 1), 1000);
    }
    return () => clearInterval(timer);
  }, [countdown]);

  // Initial fade-in animation
  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 800,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 600,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  // OTP field slide-in animation
  useEffect(() => {
    if (loginMode === 'otp' && otpStep === 'verify') {
      Animated.spring(otpFieldAnim, {
        toValue: 1,
        tension: 50,
        friction: 7,
        useNativeDriver: true,
      }).start();
    } else {
      otpFieldAnim.setValue(0);
    }
  }, [loginMode, otpStep]);

  const [errorCode, setErrorCode] = useState(null);
  const [accountStatus, setAccountStatus] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);

  useEffect(() => {
    if (route.params?.message) {
      setSuccessMessage(route.params.message);
    }
  }, [route.params]);

  const handlePasswordLogin = async () => {
    if (!identifier || !password) {
      setError('INCOMPLETE CREDENTIALS: Enter both ID and password');
      return;
    }
    setLoading(true);
    setError('');
    setErrorCode(null);
    setAccountStatus(null);
    const result = await login(identifier, password);
    setLoading(false);
    if (!result.success) {
      setError(result.error || 'AUTHENTICATION FAILED');
      setErrorCode(result.errorCode);
      setAccountStatus(result.accountStatus);
    }
  };

  const handleRequestOtp = async () => {
    if (!identifier) {
      setError('INVALID PROTOCOL: Enter your ID (Mobile/Email) first');
      return;
    }
    setLoading(true);
    setError('');
    const result = await sendOtp(identifier);
    setLoading(false);
    if (result.success) {
      setOtpStep('verify');
      setCountdown(30);
      setError('');
    } else {
      setError(result.error || 'Failed to dispatch OTP');
    }
  };

  const handleVerifyOtp = async () => {
    if (!otp || otp.length !== 6) {
      setError('INVALID CODE: Enter 6-digit OTP');
      return;
    }
    setLoading(true);
    setError('');
    const result = await verifyOtp(identifier, otp);
    setLoading(false);
    if (result.success) {
      if (result.isRegistered) {
        // OTP Login successful
        // AuthContext handles state; Navigation will occur via observer/parent
      } else {
        // New user detected, route to registration
        navigation.navigate('Register');
      }
    } else {
      setError(result.error || 'Verification failed');
    }
  };

  return (
    <View style={styles.container}>
      <LinearGradient colors={['#0b1120', '#061a40']} style={styles.background}>
        <View style={styles.heroContent}>
          <Text style={styles.logo}>1<Text style={{ color: COLORS.cyan }}>RAD</Text></Text>
          <Text style={styles.title}>Clinical Command</Text>
          <Text style={styles.subtitle}>VERIFY CREDENTIALS TO ENTER THE GRID</Text>
        </View>

        <View style={styles.glassCard}>
          {/* Login Mode Toggle */}
          <View style={styles.modeToggle}>
            <TouchableOpacity 
              style={[styles.toggleBtn, loginMode === 'password' && styles.toggleBtnActive]}
              onPress={() => { setLoginMode('password'); setError(''); setOtpStep('request'); }}
            >
              <Text style={[styles.toggleBtnText, loginMode === 'password' && styles.toggleBtnTextActive]}>
                SECURE KEY
              </Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={[styles.toggleBtn, loginMode === 'otp' && styles.toggleBtnActive]}
              onPress={() => { setLoginMode('otp'); setError(''); setPassword(''); }}
            >
              <Text style={[styles.toggleBtnText, loginMode === 'otp' && styles.toggleBtnTextActive]}>
                ONE-TIME PASS
              </Text>
            </TouchableOpacity>
          </View>

          {/* Identifier Input (Always shown) */}
          <View style={styles.inputGroup}>
            <Smartphone size={18} color={COLORS.cyan} style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder="IDENT CODE (EMAIL/MOBILE)"
              placeholderTextColor="rgba(255,255,255,0.4)"
              value={identifier}
              onChangeText={setIdentifier}
              autoCapitalize="none"
              editable={!(loginMode === 'otp' && otpStep === 'verify')}
            />
          </View>

          {/* Password Mode */}
          {loginMode === 'password' && (
            <>
              <View style={styles.inputGroup}>
                <Lock size={18} color={COLORS.cyan} style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="SECURE KEY (PASSWORD)"
                  placeholderTextColor="rgba(255,255,255,0.4)"
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!showPassword}
                />
                <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
                  {showPassword ? (
                    <Eye size={18} color="rgba(255,255,255,0.6)" />
                  ) : (
                    <EyeOff size={18} color="rgba(255,255,255,0.6)" />
                  )}
                </TouchableOpacity>
              </View>
              
              <TouchableOpacity onPress={() => navigation.navigate('ForgotPassword')}>
                <Text style={styles.forgotLink}>FORGOT KEY?</Text>
              </TouchableOpacity>

              <TouchableOpacity 
                style={[styles.loginBtn, loading && styles.loginBtnDisabled]} 
                onPress={handlePasswordLogin}
                disabled={loading}
              >
                <LinearGradient 
                  colors={[COLORS.cyan, '#4facfe']} 
                  start={{ x: 0, y: 0 }} 
                  end={{ x: 1, y: 0 }} 
                  style={styles.gradientBtn}
                >
                  <Text style={styles.btnText}>
                    {loading ? 'INITIALIZING...' : 'ACCESS THE GRID'}
                  </Text>
                </LinearGradient>
              </TouchableOpacity>
            </>
          )}

          {/* OTP Mode */}
          {loginMode === 'otp' && (
            <>
              {otpStep === 'verify' && (
                <View style={styles.inputGroup}>
                  <Key size={18} color={COLORS.cyan} style={styles.inputIcon} />
                  <TextInput
                    style={[styles.input, styles.otpInput]}
                    placeholder="0 0 0 0 0 0"
                    placeholderTextColor="rgba(255,255,255,0.4)"
                    value={otp}
                    onChangeText={setOtp}
                    keyboardType="number-pad"
                    maxLength={6}
                  />
                </View>
              )}

              {otpStep === 'verify' && (
                <View style={styles.resendContainer}>
                  <Text style={styles.resendText}>
                    DIDN'T RECEIVE CODE?{' '}
                    {countdown > 0 ? (
                      <Text style={styles.countdownText}>RESEND IN 0:{countdown < 10 ? `0${countdown}` : countdown}</Text>
                    ) : (
                      <Text style={styles.resendLink} onPress={handleRequestOtp}>RESEND NOW</Text>
                    )}
                  </Text>
                </View>
              )}

              <TouchableOpacity 
                style={[styles.loginBtn, loading && styles.loginBtnDisabled]} 
                onPress={otpStep === 'request' ? handleRequestOtp : handleVerifyOtp}
                disabled={loading}
              >
                <LinearGradient 
                  colors={[COLORS.cyan, '#4facfe']} 
                  start={{ x: 0, y: 0 }} 
                  end={{ x: 1, y: 0 }} 
                  style={styles.gradientBtn}
                >
                  <Text style={styles.btnText}>
                    {loading ? 'PROCESSING...' : (otpStep === 'request' ? 'REQUEST PASSCODE' : 'VERIFY & ENTER')}
                  </Text>
                </LinearGradient>
              </TouchableOpacity>
            </>
          )}

          {error ? (
            <View style={styles.errorContainer}>
              <Text style={styles.errorText}>{error}</Text>
              
              {errorCode === 'USER_NOT_FOUND' && (
                <TouchableOpacity 
                  style={styles.errorCTA} 
                  onPress={() => navigation.navigate('Register', { identifier, isFromLogin: true })}
                >
                  <Text style={styles.errorCTAText}>INITIALIZE NEW REGISTRATION</Text>
                </TouchableOpacity>
              )}

              {errorCode === 'ACCOUNT_INACTIVE' && (
                <Text style={styles.statusSubtext}>
                  ACCOUNT STATE: <Text style={{ color: COLORS.cyan, fontWeight: '900' }}>{accountStatus?.toUpperCase()}</Text>
                </Text>
              )}
            </View>
          ) : null}

          {successMessage && (
            <View style={styles.successContainer}>
              <Text style={styles.successText}>✓ {successMessage}</Text>
            </View>
          )}
          
          <View style={styles.divider} />
          
          <TouchableOpacity 
            style={styles.registerLink} 
            onPress={() => navigation.navigate('Register')}
          >
            <Text style={styles.linkText}>
              NEW CENTER? <Text style={{ color: COLORS.cyan, fontWeight: '900' }}>REGISTER FOR 1RAD</Text>
            </Text>
          </TouchableOpacity>
        </View>
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  background: { flex: 1, justifyContent: 'center', padding: SPACING.lg },
  heroContent: { alignItems: 'center', marginBottom: 40 },
  logo: { fontSize: 42, fontWeight: '900', color: '#fff', letterSpacing: 2 },
  title: { fontSize: 18, fontWeight: '700', color: 'rgba(255,255,255,0.8)', textTransform: 'uppercase', letterSpacing: 1, marginTop: 4 },
  subtitle: { fontSize: 10, color: 'rgba(255,255,255,0.5)', marginTop: 8, letterSpacing: 1 },
  glassCard: {
    ...SHADOWS.glass,
    padding: SPACING.xl,
    borderRadius: RADIUS.lg,
  },
  modeToggle: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 25,
    padding: 4,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 10,
  },
  toggleBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toggleBtnActive: {
    backgroundColor: COLORS.cyan,
    ...SHADOWS.cyan,
  },
  toggleBtnText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: 0.5,
  },
  toggleBtnTextActive: {
    color: COLORS.bgMain,
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
  inputIcon: { marginRight: 10 },
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
  forgotLink: {
    fontSize: 10,
    color: COLORS.cyan,
    textAlign: 'right',
    marginBottom: 15,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  resendContainer: {
    marginBottom: 15,
  },
  resendText: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.4)',
    textAlign: 'center',
  },
  countdownText: {
    color: COLORS.cyan,
    fontWeight: '900',
  },
  resendLink: {
    color: COLORS.cyan,
    fontWeight: '900',
    textDecorationLine: 'underline',
  },
  loginBtn: {
    marginTop: 10,
    borderRadius: RADIUS.md,
    overflow: 'hidden',
  },
  loginBtnDisabled: {
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
  divider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.1)',
    marginVertical: 25,
  },
  registerLink: { 
    alignItems: 'center',
  },
  linkText: { 
    color: 'rgba(255,255,255,0.7)', 
    fontSize: 13,
    fontWeight: '600',
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
  },
  errorContainer: {
    marginTop: 15,
    backgroundColor: 'rgba(231, 76, 60, 0.1)',
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: 'rgba(231, 76, 60, 0.2)',
    overflow: 'hidden',
  },
  errorCTA: {
    backgroundColor: COLORS.cyan,
    padding: 10,
    alignItems: 'center',
  },
  errorCTAText: {
    color: COLORS.bgMain,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  statusSubtext: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.6)',
    textAlign: 'center',
    padding: 10,
    paddingTop: 0,
    fontStyle: 'italic',
  },
  successContainer: {
    marginTop: 15,
    backgroundColor: 'rgba(40, 167, 69, 0.1)',
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: 'rgba(40, 167, 69, 0.2)',
    padding: 12,
  },
  successText: {
    color: '#28a745',
    fontSize: 11,
    fontWeight: '700',
    textAlign: 'center',
  }
});

