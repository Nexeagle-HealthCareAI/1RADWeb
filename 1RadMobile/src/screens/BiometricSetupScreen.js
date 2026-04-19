import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Switch,
  Alert,
  ScrollView,
  TextInput,
  Modal,
} from 'react-native';
import { Shield, Lock, Fingerprint, Eye, ChevronRight } from 'lucide-react-native';
import { COLORS, SPACING, RADIUS, SHADOWS } from '../theme/TacticalTheme';
import BiometricService from '../services/BiometricService';

export default function BiometricSetupScreen({ navigation }) {
  const [biometricSupported, setBiometricSupported] = useState(false);
  const [biometricEnrolled, setBiometricEnrolled] = useState(false);
  const [biometricEnabled, setBiometricEnabled] = useState(false);
  const [biometricType, setBiometricType] = useState('Biometric');
  const [hasPasscode, setHasPasscode] = useState(false);
  
  // Passcode modal state
  const [showPasscodeModal, setShowPasscodeModal] = useState(false);
  const [passcodeMode, setPasscodeMode] = useState('set'); // 'set', 'verify', 'change'
  const [passcode, setPasscode] = useState('');
  const [confirmPasscode, setConfirmPasscode] = useState('');
  const [currentPasscode, setCurrentPasscode] = useState('');

  useEffect(() => {
    checkBiometricStatus();
  }, []);

  const checkBiometricStatus = async () => {
    const supported = await BiometricService.isBiometricSupported();
    const enrolled = await BiometricService.isBiometricEnrolled();
    const enabled = await BiometricService.isBiometricEnabled();
    const type = await BiometricService.getBiometricTypeName();
    const passcodeSet = await BiometricService.hasPasscode();

    setBiometricSupported(supported);
    setBiometricEnrolled(enrolled);
    setBiometricEnabled(enabled);
    setBiometricType(type);
    setHasPasscode(passcodeSet);
  };

  const handleBiometricToggle = async (value) => {
    if (value) {
      // Enable biometric
      if (!biometricEnrolled) {
        Alert.alert(
          'Biometric Not Set Up',
          `Please set up ${biometricType} in your device settings first.`,
          [{ text: 'OK' }]
        );
        return;
      }

      // Test biometric authentication
      const result = await BiometricService.authenticateWithBiometrics(
        `Enable ${biometricType} for 1RadMobile`
      );

      if (result.success) {
        await BiometricService.enableBiometric();
        setBiometricEnabled(true);
        Alert.alert('Success', `${biometricType} authentication enabled!`);
      } else {
        Alert.alert('Failed', 'Biometric authentication failed. Please try again.');
      }
    } else {
      // Disable biometric
      Alert.alert(
        'Disable Biometric',
        `Are you sure you want to disable ${biometricType} authentication?`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Disable',
            style: 'destructive',
            onPress: async () => {
              await BiometricService.disableBiometric();
              setBiometricEnabled(false);
            },
          },
        ]
      );
    }
  };

  const handleSetPasscode = () => {
    setPasscodeMode('set');
    setPasscode('');
    setConfirmPasscode('');
    setShowPasscodeModal(true);
  };

  const handleChangePasscode = () => {
    setPasscodeMode('change');
    setCurrentPasscode('');
    setPasscode('');
    setConfirmPasscode('');
    setShowPasscodeModal(true);
  };

  const handleRemovePasscode = () => {
    Alert.alert(
      'Remove Passcode',
      'Are you sure you want to remove your passcode?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            await BiometricService.removePasscode();
            setHasPasscode(false);
            Alert.alert('Success', 'Passcode removed successfully');
          },
        },
      ]
    );
  };

  const handlePasscodeSubmit = async () => {
    if (passcodeMode === 'change') {
      // Verify current passcode first
      const isValid = await BiometricService.verifyPasscode(currentPasscode);
      if (!isValid) {
        Alert.alert('Error', 'Current passcode is incorrect');
        return;
      }
    }

    // Validate new passcode
    if (passcode.length < 4) {
      Alert.alert('Error', 'Passcode must be at least 4 digits');
      return;
    }

    if (passcode !== confirmPasscode) {
      Alert.alert('Error', 'Passcodes do not match');
      return;
    }

    // Save passcode
    const success = await BiometricService.setPasscode(passcode);
    if (success) {
      setHasPasscode(true);
      setShowPasscodeModal(false);
      Alert.alert('Success', 'Passcode set successfully');
    } else {
      Alert.alert('Error', 'Failed to set passcode');
    }
  };

  const renderPasscodeModal = () => (
    <Modal
      visible={showPasscodeModal}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={() => setShowPasscodeModal(false)}
    >
      <View style={styles.modalContainer}>
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>
            {passcodeMode === 'set' ? 'Set Passcode' : 'Change Passcode'}
          </Text>
          <TouchableOpacity onPress={() => setShowPasscodeModal(false)}>
            <Text style={styles.modalClose}>✕</Text>
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.modalContent}>
          {passcodeMode === 'change' && (
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>CURRENT PASSCODE</Text>
              <TextInput
                style={styles.input}
                value={currentPasscode}
                onChangeText={setCurrentPasscode}
                secureTextEntry
                keyboardType="numeric"
                maxLength={6}
                placeholder="Enter current passcode"
                placeholderTextColor={COLORS.textSecondary}
              />
            </View>
          )}

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>NEW PASSCODE</Text>
            <TextInput
              style={styles.input}
              value={passcode}
              onChangeText={setPasscode}
              secureTextEntry
              keyboardType="numeric"
              maxLength={6}
              placeholder="Enter 4-6 digit passcode"
              placeholderTextColor={COLORS.textSecondary}
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>CONFIRM PASSCODE</Text>
            <TextInput
              style={styles.input}
              value={confirmPasscode}
              onChangeText={setConfirmPasscode}
              secureTextEntry
              keyboardType="numeric"
              maxLength={6}
              placeholder="Re-enter passcode"
              placeholderTextColor={COLORS.textSecondary}
            />
          </View>

          <TouchableOpacity
            style={styles.submitButton}
            onPress={handlePasscodeSubmit}
          >
            <Text style={styles.submitButtonText}>
              {passcodeMode === 'set' ? 'SET PASSCODE' : 'CHANGE PASSCODE'}
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    </Modal>
  );

  return (
    <ScrollView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Shield size={32} color={COLORS.cyan} />
        <Text style={styles.headerTitle}>Security Settings</Text>
        <Text style={styles.headerSubtitle}>
          Protect your account with biometric authentication and passcode
        </Text>
      </View>

      {/* Biometric Section */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Fingerprint size={20} color={COLORS.cyan} />
          <Text style={styles.sectionTitle}>Biometric Authentication</Text>
        </View>

        {!biometricSupported ? (
          <View style={styles.infoCard}>
            <Text style={styles.infoText}>
              Biometric authentication is not supported on this device
            </Text>
          </View>
        ) : !biometricEnrolled ? (
          <View style={styles.infoCard}>
            <Text style={styles.infoText}>
              No {biometricType.toLowerCase()} enrolled. Please set up {biometricType.toLowerCase()} in your device settings.
            </Text>
          </View>
        ) : (
          <View style={styles.settingCard}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingLabel}>Enable {biometricType}</Text>
              <Text style={styles.settingDescription}>
                Use {biometricType.toLowerCase()} to quickly access the app
              </Text>
            </View>
            <Switch
              value={biometricEnabled}
              onValueChange={handleBiometricToggle}
              trackColor={{ false: COLORS.border, true: COLORS.cyan + '40' }}
              thumbColor={biometricEnabled ? COLORS.cyan : COLORS.textSecondary}
            />
          </View>
        )}

        {biometricEnabled && (
          <TouchableOpacity
            style={styles.testButton}
            onPress={async () => {
              const result = await BiometricService.authenticateWithBiometrics(
                'Test biometric authentication'
              );
              if (result.success) {
                Alert.alert('Success', 'Biometric authentication successful!');
              } else {
                Alert.alert('Failed', 'Biometric authentication failed');
              }
            }}
          >
            <Eye size={16} color={COLORS.cyan} />
            <Text style={styles.testButtonText}>Test {biometricType}</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Passcode Section */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Lock size={20} color={COLORS.cyan} />
          <Text style={styles.sectionTitle}>Passcode</Text>
        </View>

        {!hasPasscode ? (
          <TouchableOpacity
            style={styles.actionCard}
            onPress={handleSetPasscode}
          >
            <View style={styles.actionInfo}>
              <Text style={styles.actionLabel}>Set Passcode</Text>
              <Text style={styles.actionDescription}>
                Create a 4-6 digit passcode for additional security
              </Text>
            </View>
            <ChevronRight size={20} color={COLORS.textSecondary} />
          </TouchableOpacity>
        ) : (
          <>
            <View style={styles.infoCard}>
              <Text style={styles.infoTextSuccess}>
                ✓ Passcode is enabled
              </Text>
            </View>

            <TouchableOpacity
              style={styles.actionCard}
              onPress={handleChangePasscode}
            >
              <View style={styles.actionInfo}>
                <Text style={styles.actionLabel}>Change Passcode</Text>
                <Text style={styles.actionDescription}>
                  Update your current passcode
                </Text>
              </View>
              <ChevronRight size={20} color={COLORS.textSecondary} />
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.actionCard, styles.dangerCard]}
              onPress={handleRemovePasscode}
            >
              <View style={styles.actionInfo}>
                <Text style={[styles.actionLabel, styles.dangerText]}>
                  Remove Passcode
                </Text>
                <Text style={styles.actionDescription}>
                  Disable passcode protection
                </Text>
              </View>
              <ChevronRight size={20} color={COLORS.error} />
            </TouchableOpacity>
          </>
        )}
      </View>

      {/* Info Section */}
      <View style={styles.infoSection}>
        <Text style={styles.infoSectionTitle}>Security Tips</Text>
        <Text style={styles.infoSectionText}>
          • Enable biometric authentication for quick and secure access
        </Text>
        <Text style={styles.infoSectionText}>
          • Set a strong passcode as a backup authentication method
        </Text>
        <Text style={styles.infoSectionText}>
          • Never share your passcode with anyone
        </Text>
        <Text style={styles.infoSectionText}>
          • Change your passcode regularly for better security
        </Text>
      </View>

      {renderPasscodeModal()}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bgMain,
  },
  header: {
    padding: SPACING.xl,
    alignItems: 'center',
    backgroundColor: COLORS.bgCard,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '900',
    color: COLORS.textPrimary,
    marginTop: SPACING.md,
    letterSpacing: 1,
  },
  headerSubtitle: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginTop: SPACING.sm,
    textAlign: 'center',
    paddingHorizontal: SPACING.lg,
  },
  section: {
    padding: SPACING.lg,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.textPrimary,
    marginLeft: SPACING.sm,
    letterSpacing: 0.5,
  },
  settingCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.bgCard,
    padding: SPACING.lg,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  settingInfo: {
    flex: 1,
    marginRight: SPACING.md,
  },
  settingLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginBottom: 4,
  },
  settingDescription: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  infoCard: {
    backgroundColor: COLORS.bgCard,
    padding: SPACING.lg,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  infoText: {
    fontSize: 13,
    color: COLORS.textSecondary,
    textAlign: 'center',
  },
  infoTextSuccess: {
    fontSize: 13,
    color: COLORS.success,
    textAlign: 'center',
    fontWeight: '600',
  },
  testButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.cyan + '10',
    padding: SPACING.md,
    borderRadius: RADIUS.md,
    marginTop: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.cyan + '40',
  },
  testButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.cyan,
    marginLeft: SPACING.sm,
  },
  actionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.bgCard,
    padding: SPACING.lg,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: SPACING.md,
  },
  dangerCard: {
    borderColor: COLORS.error + '40',
    backgroundColor: COLORS.error + '05',
  },
  actionInfo: {
    flex: 1,
  },
  actionLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginBottom: 4,
  },
  dangerText: {
    color: COLORS.error,
  },
  actionDescription: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  infoSection: {
    padding: SPACING.xl,
  },
  infoSectionTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: COLORS.textPrimary,
    marginBottom: SPACING.md,
    letterSpacing: 0.5,
  },
  infoSectionText: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginBottom: SPACING.sm,
    lineHeight: 20,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: COLORS.bgMain,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: SPACING.lg,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    backgroundColor: COLORS.bgCard,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: COLORS.textPrimary,
  },
  modalClose: {
    fontSize: 24,
    color: COLORS.textSecondary,
  },
  modalContent: {
    flex: 1,
    padding: SPACING.lg,
  },
  inputGroup: {
    marginBottom: SPACING.lg,
  },
  inputLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: COLORS.textSecondary,
    marginBottom: SPACING.sm,
    letterSpacing: 1,
  },
  input: {
    backgroundColor: COLORS.bgCard,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    fontSize: 16,
    color: COLORS.textPrimary,
    fontWeight: '600',
  },
  submitButton: {
    backgroundColor: COLORS.cyan,
    padding: SPACING.lg,
    borderRadius: RADIUS.lg,
    alignItems: 'center',
    marginTop: SPACING.lg,
    ...SHADOWS.cyan,
  },
  submitButtonText: {
    fontSize: 14,
    fontWeight: '900',
    color: COLORS.bgCard,
    letterSpacing: 1,
  },
});
