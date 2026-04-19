import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';

const PASSCODE_KEY = 'user_passcode';
const BIOMETRIC_ENABLED_KEY = 'biometric_enabled';
const USER_CREDENTIALS_KEY = 'user_credentials';

class BiometricService {
  /**
   * Check if device supports biometric authentication
   */
  async isBiometricSupported() {
    try {
      const compatible = await LocalAuthentication.hasHardwareAsync();
      return compatible;
    } catch (error) {
      console.error('Error checking biometric support:', error);
      return false;
    }
  }

  /**
   * Check if biometric authentication is enrolled (fingerprint/face registered)
   */
  async isBiometricEnrolled() {
    try {
      const enrolled = await LocalAuthentication.isEnrolledAsync();
      return enrolled;
    } catch (error) {
      console.error('Error checking biometric enrollment:', error);
      return false;
    }
  }

  /**
   * Get available biometric types
   */
  async getSupportedBiometricTypes() {
    try {
      const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
      return types;
    } catch (error) {
      console.error('Error getting biometric types:', error);
      return [];
    }
  }

  /**
   * Get biometric type name for display
   */
  async getBiometricTypeName() {
    const types = await this.getSupportedBiometricTypes();
    
    if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) {
      return 'Face ID';
    } else if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) {
      return 'Fingerprint';
    } else if (types.includes(LocalAuthentication.AuthenticationType.IRIS)) {
      return 'Iris';
    }
    return 'Biometric';
  }

  /**
   * Authenticate using biometrics
   */
  async authenticateWithBiometrics(promptMessage = 'Authenticate to continue') {
    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage,
        fallbackLabel: 'Use Passcode',
        disableDeviceFallback: false,
        cancelLabel: 'Cancel',
      });

      return {
        success: result.success,
        error: result.error,
      };
    } catch (error) {
      console.error('Biometric authentication error:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Enable biometric authentication
   */
  async enableBiometric() {
    try {
      await SecureStore.setItemAsync(BIOMETRIC_ENABLED_KEY, 'true');
      return true;
    } catch (error) {
      console.error('Error enabling biometric:', error);
      return false;
    }
  }

  /**
   * Disable biometric authentication
   */
  async disableBiometric() {
    try {
      await SecureStore.deleteItemAsync(BIOMETRIC_ENABLED_KEY);
      return true;
    } catch (error) {
      console.error('Error disabling biometric:', error);
      return false;
    }
  }

  /**
   * Check if biometric is enabled
   */
  async isBiometricEnabled() {
    try {
      const enabled = await SecureStore.getItemAsync(BIOMETRIC_ENABLED_KEY);
      return enabled === 'true';
    } catch (error) {
      console.error('Error checking biometric status:', error);
      return false;
    }
  }

  /**
   * Set passcode
   */
  async setPasscode(passcode) {
    try {
      await SecureStore.setItemAsync(PASSCODE_KEY, passcode);
      return true;
    } catch (error) {
      console.error('Error setting passcode:', error);
      return false;
    }
  }

  /**
   * Verify passcode
   */
  async verifyPasscode(passcode) {
    try {
      const storedPasscode = await SecureStore.getItemAsync(PASSCODE_KEY);
      return storedPasscode === passcode;
    } catch (error) {
      console.error('Error verifying passcode:', error);
      return false;
    }
  }

  /**
   * Check if passcode is set
   */
  async hasPasscode() {
    try {
      const passcode = await SecureStore.getItemAsync(PASSCODE_KEY);
      return passcode !== null;
    } catch (error) {
      console.error('Error checking passcode:', error);
      return false;
    }
  }

  /**
   * Remove passcode
   */
  async removePasscode() {
    try {
      await SecureStore.deleteItemAsync(PASSCODE_KEY);
      return true;
    } catch (error) {
      console.error('Error removing passcode:', error);
      return false;
    }
  }

  /**
   * Save user credentials securely (for biometric login)
   */
  async saveCredentials(username, password) {
    try {
      const credentials = JSON.stringify({ username, password });
      await SecureStore.setItemAsync(USER_CREDENTIALS_KEY, credentials);
      return true;
    } catch (error) {
      console.error('Error saving credentials:', error);
      return false;
    }
  }

  /**
   * Get saved credentials
   */
  async getCredentials() {
    try {
      const credentials = await SecureStore.getItemAsync(USER_CREDENTIALS_KEY);
      if (credentials) {
        return JSON.parse(credentials);
      }
      return null;
    } catch (error) {
      console.error('Error getting credentials:', error);
      return null;
    }
  }

  /**
   * Clear saved credentials
   */
  async clearCredentials() {
    try {
      await SecureStore.deleteItemAsync(USER_CREDENTIALS_KEY);
      return true;
    } catch (error) {
      console.error('Error clearing credentials:', error);
      return false;
    }
  }

  /**
   * Complete authentication flow (biometric or passcode)
   */
  async authenticate(options = {}) {
    const {
      promptMessage = 'Authenticate to access 1RadMobile',
      allowPasscode = true,
    } = options;

    // Check if biometric is enabled
    const biometricEnabled = await this.isBiometricEnabled();
    const biometricAvailable = await this.isBiometricEnrolled();

    if (biometricEnabled && biometricAvailable) {
      // Try biometric first
      const result = await this.authenticateWithBiometrics(promptMessage);
      if (result.success) {
        return { success: true, method: 'biometric' };
      }
      
      // If biometric fails and passcode is allowed, fall back to passcode
      if (allowPasscode) {
        return { success: false, method: 'passcode_required' };
      }
    }

    // Check if passcode is set
    const hasPasscode = await this.hasPasscode();
    if (hasPasscode && allowPasscode) {
      return { success: false, method: 'passcode_required' };
    }

    return { success: false, method: 'none' };
  }
}

export default new BiometricService();
