import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, Alert } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { COLORS } from '../theme/TacticalTheme';

/**
 * DEBUG SCREEN - Use this to test API connectivity and login
 * Add this to your navigation temporarily to debug login issues
 */
export default function LoginDebugScreen() {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [logs, setLogs] = useState([]);

  const addLog = (message, type = 'info') => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs(prev => [...prev, { timestamp, message, type }]);
    console.log(`[DEBUG ${type.toUpperCase()}] ${message}`);
  };

  const clearLogs = () => setLogs([]);

  // Test 1: Check API Connectivity
  const testConnectivity = async () => {
    addLog('Testing API connectivity...', 'info');
    try {
      const response = await fetch('https://1radapi-bch4ere7a6cmgkap.centralindia-01.azurewebsites.net/api/v1/auth/login', {
        method: 'OPTIONS'
      });
      addLog(`API reachable - Status: ${response.status}`, 'success');
    } catch (error) {
      addLog(`API unreachable - Error: ${error.message}`, 'error');
    }
  };

  // Test 2: Test Direct Login (without AuthContext)
  const testDirectLogin = async () => {
    if (!identifier || !password) {
      Alert.alert('Error', 'Enter both identifier and password');
      return;
    }

    addLog(`Testing direct login for: ${identifier}`, 'info');
    
    try {
      const response = await fetch('https://1radapi-bch4ere7a6cmgkap.centralindia-01.azurewebsites.net/api/v1/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          identifier: identifier,
          password: password
        })
      });

      addLog(`Response status: ${response.status}`, 'info');
      
      const data = await response.json();
      addLog(`Response data: ${JSON.stringify(data, null, 2)}`, 'info');

      if (data.success || data.Success) {
        addLog('✅ Login successful!', 'success');
        addLog(`User: ${data.userProfile?.fullName || data.UserProfile?.FullName}`, 'success');
        addLog(`Token received: ${data.accessToken ? 'Yes' : 'No'}`, 'success');
      } else {
        addLog(`❌ Login failed: ${data.error || data.Error}`, 'error');
        addLog(`Error code: ${data.errorCode || data.ErrorCode}`, 'error');
      }
    } catch (error) {
      addLog(`❌ Exception: ${error.message}`, 'error');
      addLog(`Stack: ${error.stack}`, 'error');
    }
  };

  // Test 3: Check Stored Tokens
  const checkStoredTokens = async () => {
    addLog('Checking stored tokens...', 'info');
    try {
      const token = await SecureStore.getItemAsync('1rad_token');
      const refreshToken = await SecureStore.getItemAsync('1rad_refresh_token');
      const user = await SecureStore.getItemAsync('1rad_user');
      
      addLog(`Access Token: ${token ? 'EXISTS' : 'NOT FOUND'}`, token ? 'success' : 'error');
      addLog(`Refresh Token: ${refreshToken ? 'EXISTS' : 'NOT FOUND'}`, refreshToken ? 'success' : 'error');
      addLog(`User Data: ${user ? 'EXISTS' : 'NOT FOUND'}`, user ? 'success' : 'error');
      
      if (user) {
        addLog(`User: ${JSON.parse(user).name}`, 'info');
      }
    } catch (error) {
      addLog(`Error checking tokens: ${error.message}`, 'error');
    }
  };

  // Test 4: Clear All Stored Data
  const clearStoredData = async () => {
    addLog('Clearing all stored data...', 'info');
    try {
      await SecureStore.deleteItemAsync('1rad_token');
      await SecureStore.deleteItemAsync('1rad_refresh_token');
      await SecureStore.deleteItemAsync('1rad_user');
      await SecureStore.deleteItemAsync('1rad_centers');
      await SecureStore.deleteItemAsync('1rad_active_center_id');
      addLog('✅ All data cleared', 'success');
    } catch (error) {
      addLog(`Error clearing data: ${error.message}`, 'error');
    }
  };

  // Test 5: Test with Axios (like AuthContext)
  const testWithAxios = async () => {
    if (!identifier || !password) {
      Alert.alert('Error', 'Enter both identifier and password');
      return;
    }

    addLog('Testing with Axios (like AuthContext)...', 'info');
    
    try {
      const apiClient = require('../api/apiClient').default;
      const response = await apiClient.post('/auth/login', {
        identifier: identifier,
        password: password
      });

      addLog(`Axios response: ${JSON.stringify(response.data, null, 2)}`, 'info');
      
      if (response.data.success || response.data.Success) {
        addLog('✅ Axios login successful!', 'success');
      } else {
        addLog(`❌ Axios login failed`, 'error');
      }
    } catch (error) {
      addLog(`❌ Axios exception: ${error.message}`, 'error');
      if (error.response) {
        addLog(`Response data: ${JSON.stringify(error.response.data, null, 2)}`, 'error');
      }
    }
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>🔍 Login Debug Tool</Text>
        <Text style={styles.subtitle}>Test API connectivity and login</Text>
      </View>

      {/* Input Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Test Credentials</Text>
        <TextInput
          style={styles.input}
          placeholder="Identifier (email/mobile)"
          placeholderTextColor="rgba(255,255,255,0.4)"
          value={identifier}
          onChangeText={setIdentifier}
          autoCapitalize="none"
        />
        <TextInput
          style={styles.input}
          placeholder="Password"
          placeholderTextColor="rgba(255,255,255,0.4)"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
        />
      </View>

      {/* Test Buttons */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Run Tests</Text>
        
        <TouchableOpacity style={styles.button} onPress={testConnectivity}>
          <Text style={styles.buttonText}>1. Test API Connectivity</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.button} onPress={testDirectLogin}>
          <Text style={styles.buttonText}>2. Test Direct Login (Fetch)</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.button} onPress={testWithAxios}>
          <Text style={styles.buttonText}>3. Test Login with Axios</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.button} onPress={checkStoredTokens}>
          <Text style={styles.buttonText}>4. Check Stored Tokens</Text>
        </TouchableOpacity>

        <TouchableOpacity style={[styles.button, styles.dangerButton]} onPress={clearStoredData}>
          <Text style={styles.buttonText}>5. Clear All Data</Text>
        </TouchableOpacity>

        <TouchableOpacity style={[styles.button, styles.secondaryButton]} onPress={clearLogs}>
          <Text style={styles.buttonText}>Clear Logs</Text>
        </TouchableOpacity>
      </View>

      {/* Logs Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Logs ({logs.length})</Text>
        <View style={styles.logsContainer}>
          {logs.length === 0 ? (
            <Text style={styles.noLogs}>No logs yet. Run a test above.</Text>
          ) : (
            logs.map((log, index) => (
              <View key={index} style={styles.logItem}>
                <Text style={styles.logTimestamp}>{log.timestamp}</Text>
                <Text style={[
                  styles.logMessage,
                  log.type === 'error' && styles.logError,
                  log.type === 'success' && styles.logSuccess
                ]}>
                  {log.message}
                </Text>
              </View>
            ))
          )}
        </View>
      </View>

      <View style={styles.footer}>
        <Text style={styles.footerText}>
          Use this screen to debug login issues.{'\n'}
          Compare results with web login.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0b1120',
  },
  header: {
    padding: 20,
    paddingTop: 60,
    backgroundColor: 'rgba(0, 242, 254, 0.1)',
    borderBottomWidth: 1,
    borderBottomColor: COLORS.cyan,
  },
  title: {
    fontSize: 24,
    fontWeight: '900',
    color: '#fff',
    marginBottom: 5,
  },
  subtitle: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.6)',
  },
  section: {
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: COLORS.cyan,
    marginBottom: 15,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  input: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    borderRadius: 8,
    padding: 15,
    color: '#fff',
    fontSize: 14,
    marginBottom: 10,
  },
  button: {
    backgroundColor: COLORS.cyan,
    padding: 15,
    borderRadius: 8,
    marginBottom: 10,
    alignItems: 'center',
  },
  secondaryButton: {
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  dangerButton: {
    backgroundColor: '#e74c3c',
  },
  buttonText: {
    color: '#0b1120',
    fontWeight: '800',
    fontSize: 12,
    letterSpacing: 0.5,
  },
  logsContainer: {
    backgroundColor: 'rgba(0,0,0,0.3)',
    borderRadius: 8,
    padding: 10,
    maxHeight: 400,
  },
  noLogs: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 12,
    textAlign: 'center',
    padding: 20,
  },
  logItem: {
    marginBottom: 10,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  logTimestamp: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.4)',
    marginBottom: 3,
  },
  logMessage: {
    fontSize: 11,
    color: '#fff',
    fontFamily: 'monospace',
  },
  logError: {
    color: '#e74c3c',
  },
  logSuccess: {
    color: '#2ecc71',
  },
  footer: {
    padding: 20,
    paddingBottom: 40,
  },
  footerText: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.4)',
    textAlign: 'center',
    lineHeight: 18,
  },
});
