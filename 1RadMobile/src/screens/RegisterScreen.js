import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, Dimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '../context/AuthContext';
import { COLORS, SPACING, RADIUS, SHADOWS } from '../theme/TacticalTheme';
import { User, Mail, Smartphone, Key, Award, MapPin, Building, FileText, Lock } from 'lucide-react-native';

const { width } = Dimensions.get('window');

export default function RegisterScreen({ navigation }) {
  const { sendOtp, verifyOtp, registerUser } = useAuth();
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState({
    role: 'admindoctor',
    mobile: '',
    otp: '',
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
    specialization: '',
    licenseNo: '',
    degree: '',
    centerName: '',
    centerAddress: '',
    gstinNumber: '',
    registrationNumber: '',
    panNumber: '',
    nabhNumber: ''
  });

  const [isOtpSent, setIsOtpSent] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // GSTIN validation helper
  const validateGSTIN = (gstin) => {
    if (!gstin) return true; // Optional field
    const gstinRegex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
    return gstinRegex.test(gstin);
  };

  // PAN validation helper
  const validatePAN = (pan) => {
    if (!pan) return true; // Optional field
    const panRegex = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;
    return panRegex.test(pan);
  };

  useEffect(() => {
    let timer;
    if (countdown > 0) {
      timer = setInterval(() => setCountdown(prev => prev - 1), 1000);
    }
    return () => clearInterval(timer);
  }, [countdown]);

  const handleSendOtp = async () => {
    if (!formData.mobile || formData.mobile.length < 10) {
      return setError('INVALID PROTOCOL: Enter valid 10-digit mobile.');
    }
    setLoading(true);
    const result = await sendOtp(formData.mobile);
    setLoading(false);
    if (result.success) {
      setIsOtpSent(true);
      setCountdown(30);
      setError('');
    } else {
      setError(result.error || 'Failed to send OTP');
    }
  };

  const handleVerifyOtp = async () => {
    setLoading(true);
    const result = await verifyOtp(formData.mobile, formData.otp);
    setLoading(false);
    if (result.success) {
      if (result.type === 'Login') {
        // User already exists, navigate to login
        navigation.navigate('Login');
      } else {
        setStep(2);
        setError('');
      }
    } else {
      setError(result.error);
    }
  };

  const handleIdentitySubmit = () => {
    if (!formData.name || !formData.email || !formData.password) {
      return setError('INCOMPLETE IDENTITY: All primary fields mandatory.');
    }
    if (formData.password !== formData.confirmPassword) {
      return setError('SECURITY ALERT: Access keys do not match.');
    }
    setStep(3);
    setError('');
  };

  const handleFinalSubmit = async () => {
    if (!formData.centerName || !formData.centerAddress) {
      return setError('INFRASTRUCTURE MISSING: Deploy center details.');
    }
    
    // Validate GSTIN format if provided
    if (formData.gstinNumber && !validateGSTIN(formData.gstinNumber)) {
      return setError('INVALID GSTIN FORMAT: Please enter a valid 15-digit GSTIN number.');
    }
    
    // Validate PAN format if provided
    if (formData.panNumber && !validatePAN(formData.panNumber)) {
      return setError('INVALID PAN FORMAT: Please enter a valid 10-digit PAN number.');
    }
    
    if (formData.role === 'admindoctor' && (!formData.specialization || !formData.licenseNo || !formData.degree)) {
      return setError('CLINICAL CREDENTIALS MISSING: CMO identity requires medical registration data.');
    }
    
    setLoading(true);
    const result = await registerUser({
      ...formData,
      name: formData.name,
      panNumber: formData.panNumber,
      nabhNumber: formData.nabhNumber
    });
    setLoading(false);
    
    if (result.success) {
      navigation.navigate('Login');
    } else {
      setError(result.error || 'Registration failed');
    }
  };

  const renderStep1 = () => (
    <View style={styles.wizardContent}>
      <Text style={styles.hudLabel}>STEP 1: IDENTITY AUTHENTICATION</Text>
      
      <View style={styles.rolePicker}>
        <TouchableOpacity 
          style={[styles.roleBtn, formData.role === 'admindoctor' && styles.roleBtnActive]}
          onPress={() => setFormData({...formData, role: 'admindoctor'})}
        >
          <Award size={16} color={formData.role === 'admindoctor' ? COLORS.cyan : COLORS.textSecondary} />
          <Text style={[styles.roleBtnText, formData.role === 'admindoctor' && { color: COLORS.cyan }]}>CMO</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.roleBtn, formData.role === 'admin' && styles.roleBtnActive]}
          onPress={() => setFormData({...formData, role: 'admin'})}
        >
          <User size={16} color={formData.role === 'admin' ? COLORS.cyan : COLORS.textSecondary} />
          <Text style={[styles.roleBtnText, formData.role === 'admin' && { color: COLORS.cyan }]}>ADMIN</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.inputGroup}>
        <Smartphone size={18} color={COLORS.cyan} style={styles.inputIcon} />
        <TextInput
          style={styles.input}
          placeholder="MOBILE NUMBER"
          placeholderTextColor="rgba(255,255,255,0.4)"
          keyboardType="phone-pad"
          value={formData.mobile}
          onChangeText={text => setFormData({...formData, mobile: text})}
          disabled={isOtpSent}
        />
      </View>

      {isOtpSent && (
        <View style={styles.inputGroup}>
          <Key size={18} color={COLORS.cyan} style={styles.inputIcon} />
          <TextInput
            style={styles.input}
            placeholder="6-DIGIT PASSCODE"
            placeholderTextColor="rgba(255,255,255,0.4)"
            keyboardType="number-pad"
            value={formData.otp}
            onChangeText={text => setFormData({...formData, otp: text})}
          />
        </View>
      )}

      <TouchableOpacity 
        style={[styles.actionBtn, loading && styles.actionBtnDisabled]} 
        onPress={isOtpSent ? handleVerifyOtp : handleSendOtp}
        disabled={loading}
      >
        <Text style={styles.btnText}>
          {loading ? 'PROCESSING...' : (isOtpSent ? 'VERIFY IDENTITY →' : 'AUTHORIZE CONTACT →')}
        </Text>
      </TouchableOpacity>
    </View>
  );

  const renderStep2 = () => (
    <View style={styles.wizardContent}>
      <Text style={styles.hudLabel}>STEP 2: MASTER IDENTITY</Text>
      
      <View style={styles.inputGroup}>
        <User size={18} color={COLORS.cyan} style={styles.inputIcon} />
        <TextInput
          style={styles.input}
          placeholder="FULL LEGAL NAME"
          placeholderTextColor="rgba(255,255,255,0.4)"
          value={formData.name}
          onChangeText={text => setFormData({...formData, name: text})}
        />
      </View>

      <View style={styles.inputGroup}>
        <Mail size={18} color={COLORS.cyan} style={styles.inputIcon} />
        <TextInput
          style={styles.input}
          placeholder="EMAIL ADDRESS"
          placeholderTextColor="rgba(255,255,255,0.4)"
          value={formData.email}
          onChangeText={text => setFormData({...formData, email: text})}
          autoCapitalize="none"
          keyboardType="email-address"
        />
      </View>

      <View style={styles.inputGroup}>
        <Lock size={18} color={COLORS.cyan} style={styles.inputIcon} />
        <TextInput
          style={styles.input}
          placeholder="SYSTEM ACCESS KEY"
          placeholderTextColor="rgba(255,255,255,0.4)"
          secureTextEntry={!showPassword}
          value={formData.password}
          onChangeText={text => setFormData({...formData, password: text})}
        />
        <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
          <Text style={styles.passwordToggle}>{showPassword ? '👁️' : '👁️‍🗨️'}</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.inputGroup}>
        <Lock size={18} color={COLORS.cyan} style={styles.inputIcon} />
        <TextInput
          style={styles.input}
          placeholder="VERIFY SECRET"
          placeholderTextColor="rgba(255,255,255,0.4)"
          secureTextEntry={!showPassword}
          value={formData.confirmPassword}
          onChangeText={text => setFormData({...formData, confirmPassword: text})}
        />
      </View>

      <TouchableOpacity 
        style={[styles.actionBtn, loading && styles.actionBtnDisabled]} 
        onPress={handleIdentitySubmit}
        disabled={loading}
      >
        <Text style={styles.btnText}>
          {loading ? 'PROCESSING...' : 'NEXT PHASE →'}
        </Text>
      </TouchableOpacity>
    </View>
  );

  const renderStep3 = () => (
    <View style={styles.wizardContent}>
      <Text style={styles.hudLabel}>STEP 3: CLINICAL INFRASTRUCTURE</Text>
      
      {formData.role === 'admindoctor' && (
        <View style={styles.clinicalBox}>
          <Text style={styles.subLabel}>MEDICAL CREDENTIALS</Text>
          <View style={styles.inputGroup}>
            <Award size={18} color={COLORS.cyan} style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder="SPECIALIZATION"
              placeholderTextColor="rgba(255,255,255,0.4)"
              value={formData.specialization}
              onChangeText={text => setFormData({...formData, specialization: text})}
            />
          </View>
          <View style={styles.inputGroup}>
            <FileText size={18} color={COLORS.cyan} style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder="PRIMARY DEGREE"
              placeholderTextColor="rgba(255,255,255,0.4)"
              value={formData.degree}
              onChangeText={text => setFormData({...formData, degree: text})}
            />
          </View>
          <View style={styles.inputGroup}>
            <Award size={18} color={COLORS.cyan} style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder="MEDICAL LICENSE #"
              placeholderTextColor="rgba(255,255,255,0.4)"
              value={formData.licenseNo}
              onChangeText={text => setFormData({...formData, licenseNo: text})}
            />
          </View>
        </View>
      )}

      <View style={styles.inputGroup}>
        <Building size={18} color={COLORS.cyan} style={styles.inputIcon} />
        <TextInput
          style={styles.input}
          placeholder="CENTER NAME"
          placeholderTextColor="rgba(255,255,255,0.4)"
          value={formData.centerName}
          onChangeText={text => setFormData({...formData, centerName: text})}
        />
      </View>

      <View style={styles.businessFieldsContainer}>
        <Text style={styles.subLabel}>BUSINESS REGISTRATION (OPTIONAL)</Text>
        <View style={styles.inputGroup}>
          <FileText size={18} color={COLORS.gold} style={styles.inputIcon} />
          <TextInput
            style={[styles.input, { 
              borderColor: formData.gstinNumber && !validateGSTIN(formData.gstinNumber) 
                ? COLORS.error 
                : formData.gstinNumber && validateGSTIN(formData.gstinNumber)
                ? COLORS.success
                : 'transparent'
            }]}
            placeholder="GSTIN NUMBER"
            placeholderTextColor="rgba(255,255,255,0.4)"
            value={formData.gstinNumber}
            onChangeText={text => setFormData({...formData, gstinNumber: text.toUpperCase()})}
            maxLength={15}
            autoCapitalize="characters"
          />
          {formData.gstinNumber && (
            <Text style={[styles.validationIcon, { 
              color: validateGSTIN(formData.gstinNumber) ? COLORS.success : COLORS.error 
            }]}>
              {validateGSTIN(formData.gstinNumber) ? '✓' : '✗'}
            </Text>
          )}
        </View>
        <Text style={styles.fieldHint}>e.g. 22AAAAA0000A1Z5 - For tax compliance</Text>
        
        <View style={styles.inputGroup}>
          <FileText size={18} color={COLORS.gold} style={styles.inputIcon} />
          <TextInput
            style={styles.input}
            placeholder="HOSPITAL REG #"
            placeholderTextColor="rgba(255,255,255,0.4)"
            value={formData.registrationNumber}
            onChangeText={text => setFormData({...formData, registrationNumber: text.toUpperCase()})}
            autoCapitalize="characters"
          />
        </View>
        <Text style={styles.fieldHint}>State health dept. registration</Text>

        <View style={styles.inputGroup}>
          <FileText size={18} color={COLORS.gold} style={styles.inputIcon} />
          <TextInput
            style={[styles.input, { 
              borderColor: formData.panNumber && !validatePAN(formData.panNumber) 
                ? COLORS.error 
                : formData.panNumber && validatePAN(formData.panNumber)
                ? COLORS.success
                : 'transparent'
            }]}
            placeholder="PAN NUMBER"
            placeholderTextColor="rgba(255,255,255,0.4)"
            value={formData.panNumber}
            onChangeText={text => setFormData({...formData, panNumber: text.toUpperCase()})}
            maxLength={10}
            autoCapitalize="characters"
          />
          {formData.panNumber && (
            <Text style={[styles.validationIcon, { 
              color: validatePAN(formData.panNumber) ? COLORS.success : COLORS.error 
            }]}>
              {validatePAN(formData.panNumber) ? '✓' : '✗'}
            </Text>
          )}
        </View>
        <Text style={styles.fieldHint}>e.g. ABCDE1234F - IT Department ID</Text>

        <View style={styles.inputGroup}>
          <FileText size={18} color={COLORS.gold} style={styles.inputIcon} />
          <TextInput
            style={styles.input}
            placeholder="NABH/NABL #"
            placeholderTextColor="rgba(255,255,255,0.4)"
            value={formData.nabhNumber}
            onChangeText={text => setFormData({...formData, nabhNumber: text.toUpperCase()})}
            autoCapitalize="characters"
          />
        </View>
        <Text style={styles.fieldHint}>Quality accreditation number</Text>
      </View>

      <View style={styles.inputGroupLarge}>
        <MapPin size={18} color={COLORS.cyan} style={styles.inputIconLarge} />
        <TextInput
          style={styles.inputLarge}
          placeholder="CENTER ADDRESS"
          placeholderTextColor="rgba(255,255,255,0.4)"
          multiline
          numberOfLines={3}
          value={formData.centerAddress}
          onChangeText={text => setFormData({...formData, centerAddress: text})}
        />
      </View>

      <TouchableOpacity 
        style={[styles.actionBtn, loading && styles.actionBtnDisabled]} 
        onPress={handleFinalSubmit}
        disabled={loading}
      >
        <Text style={styles.btnText}>
          {loading ? 'DEPLOYING...' : 'FINALIZE DEPLOYMENT →'}
        </Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
      <LinearGradient colors={['#0b1120', '#061a40']} style={styles.bgGradient} />
      
      <View style={styles.header}>
        <Text style={styles.logo}>1<Text style={{ color: COLORS.cyan }}>RAD</Text></Text>
        <Text style={styles.title}>Infrastructure Setup</Text>
        
        <View style={styles.progressContainer}>
           {[1,2,3].map(i => (
             <View key={i} style={[styles.progressDot, step >= i && { backgroundColor: COLORS.cyan, ...SHADOWS.cyan }]} />
           ))}
        </View>
      </View>

      <View style={styles.glassCard}>
        {step === 1 && renderStep1()}
        {step === 2 && renderStep2()}
        {step === 3 && renderStep3()}
        
        {error ? <Text style={styles.errorText}>{error}</Text> : null}
      </View>

      <TouchableOpacity style={styles.backBtn} onPress={() => step > 1 ? setStep(step - 1) : navigation.goBack()}>
        <Text style={styles.backText}>{step > 1 ? 'PREVIOUS STEP' : 'CANCEL SETUP'}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bgMain },
  scrollContent: { padding: SPACING.lg, paddingBottom: 100 },
  bgGradient: { ...StyleSheet.absoluteFillObject },
  header: { alignItems: 'center', marginTop: 40, marginBottom: 30 },
  logo: { fontSize: 32, fontWeight: '900', color: '#fff' },
  title: { fontSize: 12, color: COLORS.cyan, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1, marginTop: 4 },
  progressContainer: { flexDirection: 'row', gap: 10, marginTop: 20 },
  progressDot: { width: 30, height: 4, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 2 },
  glassCard: { ...SHADOWS.glass, padding: SPACING.lg, borderRadius: RADIUS.lg },
  hudLabel: { fontSize: 10, color: COLORS.cyan, fontWeight: '900', letterSpacing: 2, marginBottom: 20, textAlign: 'center' },
  rolePicker: { flexDirection: 'row', gap: 10, marginBottom: 20 },
  roleBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', height: 45, borderRadius: RADIUS.md, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', paddingHorizontal: 10 },
  roleBtnActive: { borderColor: COLORS.cyan, backgroundColor: 'rgba(0, 242, 254, 0.1)' },
  roleBtnText: { color: COLORS.textSecondary, fontWeight: '900', fontSize: 11, marginLeft: 8 },
  inputGroup: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', borderRadius: RADIUS.md, marginBottom: 15, paddingHorizontal: 15 },
  inputIcon: { marginRight: 10 },
  input: { flex: 1, height: 45, color: '#fff', fontSize: 13 },
  inputGroupLarge: { flexDirection: 'row', backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', borderRadius: RADIUS.md, marginBottom: 15, paddingHorizontal: 15, paddingTop: 12 },
  inputIconLarge: { marginRight: 10, marginTop: 2 },
  inputLarge: { flex: 1, minHeight: 80, color: '#fff', fontSize: 13, textAlignVertical: 'top' },
  actionBtn: { height: 50, backgroundColor: COLORS.cyan, borderRadius: RADIUS.md, alignItems: 'center', justifyContent: 'center', marginTop: 10 },
  actionBtnDisabled: { opacity: 0.6 },
  btnText: { color: COLORS.bgMain, fontWeight: '900', fontSize: 13, letterSpacing: 1 },
  passwordToggle: { fontSize: 18, marginLeft: 8 },
  clinicalBox: { padding: 15, backgroundColor: 'rgba(0, 242, 254, 0.05)', borderRadius: RADIUS.md, marginBottom: 15, borderLeftWidth: 3, borderLeftColor: COLORS.cyan },
  businessFieldsContainer: { padding: 15, backgroundColor: 'rgba(251, 191, 36, 0.05)', borderRadius: RADIUS.md, marginBottom: 15, borderLeftWidth: 3, borderLeftColor: COLORS.gold },
  subLabel: { fontSize: 9, fontWeight: '900', color: COLORS.cyan, marginBottom: 12, letterSpacing: 1 },
  fieldHint: { fontSize: 8, color: 'rgba(255,255,255,0.4)', marginBottom: 10, fontStyle: 'italic', marginLeft: 28 },
  validationIcon: { fontSize: 16, fontWeight: '900', marginLeft: 8 },
  backBtn: { marginTop: 30, alignItems: 'center' },
  backText: { color: 'rgba(255,255,255,0.5)', fontSize: 11, fontWeight: '700' },
  errorText: { color: COLORS.error, fontSize: 11, textAlign: 'center', marginTop: 15, fontWeight: '700' }
});
