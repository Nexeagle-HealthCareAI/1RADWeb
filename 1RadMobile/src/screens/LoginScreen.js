import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, Dimensions, Image, KeyboardAvoidingView,
  Platform, ScrollView, ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '../context/AuthContext';
import { SPACING, RADIUS, SHADOWS } from '../theme/TacticalTheme';
import { Lock, Smartphone, Key, Eye, EyeOff } from 'lucide-react-native';

const { width } = Dimensions.get('window');

// ── Brand colours (aligned with web sidebar) ──────────────────────────────────
const C = {
  navy:       '#0a1628',
  navyDeep:   '#061220',
  blue:       '#3b82f6',
  blueBright: '#60a5fa',
  surface:    'rgba(255,255,255,0.06)',
  border:     'rgba(255,255,255,0.10)',
  textHigh:   'rgba(255,255,255,0.92)',
  textMid:    'rgba(255,255,255,0.55)',
  textLow:    'rgba(255,255,255,0.30)',
  error:      '#f87171',
  errorBg:    'rgba(248,113,113,0.10)',
  success:    '#34d399',
  successBg:  'rgba(52,211,153,0.10)',
};

export default function LoginScreen({ navigation, route }) {
  const { login, sendOtp, verifyOtp } = useAuth();

  const [loginMode, setLoginMode]   = useState('password'); // 'password' | 'otp'
  const [otpStep,   setOtpStep]     = useState('request');  // 'request'  | 'verify'

  const [identifier,    setIdentifier]    = useState('');
  const [password,      setPassword]      = useState('');
  const [otp,           setOtp]           = useState('');
  const [showPassword,  setShowPassword]  = useState(false);
  const [loading,       setLoading]       = useState(false);
  const [error,         setError]         = useState('');
  const [countdown,     setCountdown]     = useState(0);
  const [errorCode,     setErrorCode]     = useState(null);
  const [accountStatus, setAccountStatus] = useState(null);
  const [successMsg,    setSuccessMsg]    = useState(null);

  useEffect(() => {
    let t;
    if (countdown > 0) t = setInterval(() => setCountdown(p => p - 1), 1000);
    return () => clearInterval(t);
  }, [countdown]);

  useEffect(() => {
    if (route.params?.message) setSuccessMsg(route.params.message);
  }, [route.params]);

  const handlePasswordLogin = async () => {
    if (!identifier || !password) {
      setError('Please enter both your ID and password.');
      return;
    }
    setLoading(true); setError(''); setErrorCode(null); setAccountStatus(null);
    const res = await login(identifier, password);
    setLoading(false);
    if (!res.success) {
      setError(res.error || 'Sign in failed. Please try again.');
      setErrorCode(res.errorCode);
      setAccountStatus(res.accountStatus);
    }
  };

  const handleRequestOtp = async () => {
    if (!identifier) { setError('Enter your email or mobile number first.'); return; }
    setLoading(true); setError('');
    const res = await sendOtp(identifier);
    setLoading(false);
    if (res.success) { setOtpStep('verify'); setCountdown(30); }
    else setError(res.error || 'Failed to send code. Try again.');
  };

  const handleVerifyOtp = async () => {
    if (!otp || otp.length !== 6) { setError('Please enter the 6-digit code.'); return; }
    setLoading(true); setError('');
    const res = await verifyOtp(identifier, otp);
    setLoading(false);
    if (res.success) {
      if (!res.isRegistered) navigation.navigate('Register');
    } else {
      setError(res.error || 'Verification failed. Check the code and try again.');
    }
  };

  const switchMode = (mode) => {
    setLoginMode(mode);
    setError('');
    setOtpStep('request');
    setPassword('');
    setOtp('');
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <LinearGradient
        colors={[C.navy, C.navyDeep]}
        style={styles.bg}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* ── Brand ── */}
          <View style={styles.brand}>
            <Image
              source={require('../../assets/logo.png')}
              style={styles.logo}
              resizeMode="contain"
            />
            <View style={styles.brandText}>
              <Text style={styles.brandName}>NexEagle</Text>
              <Text style={styles.brandSub}>1Rad Platform</Text>
            </View>
          </View>

          <Text style={styles.headline}>Welcome back</Text>
          <Text style={styles.tagline}>Sign in to continue to your workspace</Text>

          {/* ── Card ── */}
          <View style={styles.card}>

            {/* Mode toggle */}
            <View style={styles.toggle}>
              {['password', 'otp'].map(mode => (
                <TouchableOpacity
                  key={mode}
                  style={[styles.toggleBtn, loginMode === mode && styles.toggleBtnActive]}
                  onPress={() => switchMode(mode)}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.toggleTxt, loginMode === mode && styles.toggleTxtActive]}>
                    {mode === 'password' ? 'Password' : 'OTP'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Identifier */}
            <View style={styles.inputRow}>
              <Smartphone size={17} color={C.blueBright} style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="Email or mobile number"
                placeholderTextColor={C.textLow}
                value={identifier}
                onChangeText={setIdentifier}
                autoCapitalize="none"
                keyboardType="email-address"
                editable={!(loginMode === 'otp' && otpStep === 'verify')}
              />
            </View>

            {/* Password mode */}
            {loginMode === 'password' && (
              <>
                <View style={styles.inputRow}>
                  <Lock size={17} color={C.blueBright} style={styles.inputIcon} />
                  <TextInput
                    style={styles.input}
                    placeholder="Password"
                    placeholderTextColor={C.textLow}
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry={!showPassword}
                  />
                  <TouchableOpacity onPress={() => setShowPassword(v => !v)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    {showPassword
                      ? <Eye    size={17} color={C.textMid} />
                      : <EyeOff size={17} color={C.textMid} />
                    }
                  </TouchableOpacity>
                </View>

                <TouchableOpacity
                  onPress={() => navigation.navigate('ForgotPassword')}
                  style={{ alignSelf: 'flex-end', marginBottom: 18 }}
                >
                  <Text style={styles.forgotLink}>Forgot password?</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.primaryBtn, loading && styles.btnDisabled]}
                  onPress={handlePasswordLogin}
                  disabled={loading}
                  activeOpacity={0.85}
                >
                  <LinearGradient
                    colors={['#3b82f6', '#1d4ed8']}
                    start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                    style={styles.gradientBtn}
                  >
                    {loading
                      ? <ActivityIndicator color="#fff" size="small" />
                      : <Text style={styles.primaryBtnTxt}>Sign in</Text>
                    }
                  </LinearGradient>
                </TouchableOpacity>
              </>
            )}

            {/* OTP mode */}
            {loginMode === 'otp' && (
              <>
                {otpStep === 'verify' && (
                  <>
                    <View style={styles.inputRow}>
                      <Key size={17} color={C.blueBright} style={styles.inputIcon} />
                      <TextInput
                        style={[styles.input, styles.otpInput]}
                        placeholder="000000"
                        placeholderTextColor={C.textLow}
                        value={otp}
                        onChangeText={setOtp}
                        keyboardType="number-pad"
                        maxLength={6}
                        autoFocus
                      />
                    </View>

                    <View style={styles.resendRow}>
                      <Text style={styles.resendLabel}>Didn't receive a code? </Text>
                      {countdown > 0 ? (
                        <Text style={styles.countdown}>
                          Resend in 0:{countdown < 10 ? `0${countdown}` : countdown}
                        </Text>
                      ) : (
                        <Text style={styles.resendLink} onPress={handleRequestOtp}>
                          Resend
                        </Text>
                      )}
                    </View>
                  </>
                )}

                <TouchableOpacity
                  style={[styles.primaryBtn, loading && styles.btnDisabled]}
                  onPress={otpStep === 'request' ? handleRequestOtp : handleVerifyOtp}
                  disabled={loading}
                  activeOpacity={0.85}
                >
                  <LinearGradient
                    colors={['#3b82f6', '#1d4ed8']}
                    start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                    style={styles.gradientBtn}
                  >
                    {loading ? (
                      <ActivityIndicator color="#fff" size="small" />
                    ) : (
                      <Text style={styles.primaryBtnTxt}>
                        {otpStep === 'request' ? 'Send code' : 'Verify & sign in'}
                      </Text>
                    )}
                  </LinearGradient>
                </TouchableOpacity>
              </>
            )}

            {/* Error */}
            {!!error && (
              <View style={styles.errorBox}>
                <Text style={styles.errorTxt}>{error}</Text>
                {errorCode === 'USER_NOT_FOUND' && (
                  <TouchableOpacity
                    style={styles.errorAction}
                    onPress={() => navigation.navigate('Register', { identifier, isFromLogin: true })}
                  >
                    <Text style={styles.errorActionTxt}>Create an account</Text>
                  </TouchableOpacity>
                )}
                {errorCode === 'ACCOUNT_INACTIVE' && (
                  <Text style={styles.errorSubtxt}>
                    Account status: <Text style={{ color: C.blueBright, fontWeight: '700' }}>
                      {accountStatus?.toLowerCase()}
                    </Text>
                  </Text>
                )}
              </View>
            )}

            {/* Success */}
            {!!successMsg && (
              <View style={styles.successBox}>
                <Text style={styles.successTxt}>✓ {successMsg}</Text>
              </View>
            )}

            {/* Divider */}
            <View style={styles.divider} />

            <TouchableOpacity onPress={() => navigation.navigate('Register')} activeOpacity={0.8}>
              <Text style={styles.registerLink}>
                Don't have an account?{' '}
                <Text style={{ color: C.blueBright, fontWeight: '700' }}>Register</Text>
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </LinearGradient>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  bg:       { flex: 1 },
  scroll:   { flexGrow: 1, justifyContent: 'center', padding: SPACING.lg, paddingTop: 60, paddingBottom: 40 },

  // Brand
  brand:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: 24, gap: 12 },
  logo:        { width: 44, height: 44, borderRadius: 10 },
  brandText:   { gap: 2 },
  brandName:   { fontSize: 20, fontWeight: '700', color: 'rgba(255,255,255,0.94)', letterSpacing: -0.3 },
  brandSub:    { fontSize: 11, fontWeight: '600', color: C.blueBright, letterSpacing: 0.3 },

  headline: { fontSize: 26, fontWeight: '700', color: C.textHigh, textAlign: 'center', letterSpacing: -0.4 },
  tagline:  { fontSize: 13, color: C.textMid, textAlign: 'center', marginTop: 6, marginBottom: 28 },

  // Card
  card: {
    backgroundColor: 'rgba(15,30,58,0.85)',
    borderRadius: 18,
    padding: SPACING.xl,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.09)',
    ...SHADOWS.glass,
  },

  // Mode toggle
  toggle:          { flexDirection: 'row', backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 10, padding: 4, marginBottom: 22 },
  toggleBtn:       { flex: 1, paddingVertical: 10, borderRadius: 8, alignItems: 'center' },
  toggleBtnActive: { backgroundColor: C.blue },
  toggleTxt:       { fontSize: 13, fontWeight: '600', color: C.textMid },
  toggleTxtActive: { color: '#fff', fontWeight: '700' },

  // Input
  inputRow:  { flexDirection: 'row', alignItems: 'center', backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 12, marginBottom: 14, paddingHorizontal: 14, minHeight: 52 },
  inputIcon: { marginRight: 10 },
  input:     { flex: 1, color: C.textHigh, fontSize: 14, paddingVertical: 0 },
  otpInput:  { letterSpacing: 10, textAlign: 'center', fontWeight: '700', fontSize: 20 },

  forgotLink: { fontSize: 12, color: C.blueBright, fontWeight: '600' },

  // Buttons
  primaryBtn:    { borderRadius: 12, overflow: 'hidden', marginTop: 4 },
  btnDisabled:   { opacity: 0.6 },
  gradientBtn:   { paddingVertical: 15, alignItems: 'center', justifyContent: 'center', minHeight: 52 },
  primaryBtnTxt: { color: '#fff', fontWeight: '700', fontSize: 14, letterSpacing: 0.2 },

  // Resend
  resendRow:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  resendLabel: { fontSize: 12, color: C.textMid },
  countdown:   { fontSize: 12, color: C.blueBright, fontWeight: '600' },
  resendLink:  { fontSize: 12, color: C.blueBright, fontWeight: '700', textDecorationLine: 'underline' },

  // Error / Success
  errorBox:       { marginTop: 14, backgroundColor: C.errorBg, borderRadius: 10, borderWidth: 1, borderColor: 'rgba(248,113,113,0.2)', overflow: 'hidden' },
  errorTxt:       { color: C.error, fontSize: 12, fontWeight: '600', padding: 12, paddingBottom: 8 },
  errorSubtxt:    { fontSize: 11, color: C.textMid, paddingHorizontal: 12, paddingBottom: 10 },
  errorAction:    { backgroundColor: C.blue, padding: 10, alignItems: 'center' },
  errorActionTxt: { color: '#fff', fontSize: 12, fontWeight: '700' },

  successBox: { marginTop: 14, backgroundColor: C.successBg, borderRadius: 10, borderWidth: 1, borderColor: 'rgba(52,211,153,0.2)', padding: 12 },
  successTxt: { color: C.success, fontSize: 12, fontWeight: '600', textAlign: 'center' },

  divider:      { height: 1, backgroundColor: 'rgba(255,255,255,0.08)', marginVertical: 22 },
  registerLink: { fontSize: 13, color: C.textMid, textAlign: 'center' },
});
