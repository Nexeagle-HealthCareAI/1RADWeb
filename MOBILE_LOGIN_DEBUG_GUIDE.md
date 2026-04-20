# Mobile Login Debug Guide

**Issue:** Unable to login on mobile app with credentials that work on website  
**Date:** April 20, 2026  
**Status:** 🔍 INVESTIGATING

---

## Critical Bug Fixed

### Bug 1: Incorrect Role Mapping ✅ FIXED
**Location:** `1RadMobile/src/context/AuthContext.js` - `login()` function  
**Problem:** 
```javascript
// OLD (WRONG) - Only took first hospital's role and tried to split it
roles: (userProfile.authorizedHospitals || userProfile.AuthorizedHospitals)[0]?.roleName?.split(',').map(r => r.trim().toLowerCase()) || []

// NEW (CORRECT) - Maps all hospitals' roles like web version
roles: authorizedHospitals.map(h => (h.roleName || h.RoleName).toLowerCase())
```

**Impact:** This could cause login to fail if role mapping was incorrect

### Bug 2: Missing Null Checks ✅ FIXED
**Problem:** Code didn't check if `userProfile` or `accessToken` existed before proceeding  
**Fix:** Added validation:
```javascript
if (success === false || !userProfile || !accessToken) {
  return { success: false, error: error || 'Authentication failed.' };
}
```

### Bug 3: Enhanced Error Logging ✅ ADDED
**Added comprehensive logging to help debug:**
- Raw API response logging
- Parsed field logging
- Network error detection
- Detailed error stack traces

---

## How to Debug the Login Issue

### Step 1: Check Console Logs
When you try to login on mobile, check the console/logs for these messages:

```
[MOBILE AUTH] Login attempt for <your-identifier>
[MOBILE AUTH] Raw response: { ... }
[MOBILE AUTH] Parsed - success: true/false, userProfile: true/false, accessToken: true/false
[MOBILE AUTH] Authorized hospitals: <number>
[MOBILE AUTH] Mapped user: { ... }
[MOBILE AUTH] Mapped centers: <number>
[MOBILE AUTH] Active center set: <center-name>
[MOBILE AUTH] Login successful, tokens persisted
```

### Step 2: Check for Error Messages
If login fails, look for these error logs:

```
[MOBILE AUTH] Login failed - success: false, error: <error-message>
[MOBILE AUTH] Login exception: <error>
[MOBILE AUTH] Error response data: { ... }
```

### Step 3: Common Issues & Solutions

#### Issue 1: Network Error
**Symptoms:**
```
[MOBILE AUTH] Login exception: Network Error
error: 'Network connection failed. Please check your internet connection.'
```

**Solutions:**
- Check if mobile device has internet connection
- Verify API URL is accessible from mobile network
- Check if firewall/VPN is blocking the connection
- Try switching between WiFi and mobile data

#### Issue 2: CORS Error (Android/iOS specific)
**Symptoms:**
```
Error: Network request failed
Access to fetch blocked by CORS policy
```

**Solutions:**
- CORS should not affect mobile apps (only browsers)
- If you see this, the app might be running in Expo Go web mode
- Build and install the APK instead

#### Issue 3: SSL/Certificate Error
**Symptoms:**
```
Error: SSL handshake failed
Certificate verification failed
```

**Solutions:**
- Backend API uses HTTPS - ensure certificate is valid
- Check if device date/time is correct
- Try accessing API URL in mobile browser first

#### Issue 4: Backend Response Format Mismatch
**Symptoms:**
```
[MOBILE AUTH] Parsed - success: undefined, userProfile: false, accessToken: false
```

**Solutions:**
- Backend might be returning different field names
- Check raw response in logs
- Mobile code now supports both camelCase and PascalCase

#### Issue 5: Empty Response
**Symptoms:**
```
[MOBILE AUTH] Raw response: {}
or
[MOBILE AUTH] Raw response: null
```

**Solutions:**
- Backend might not be responding correctly
- Check backend logs for errors
- Verify API endpoint is correct

---

## Testing Checklist

### ✅ Pre-Test Setup
- [ ] Mobile device has internet connection
- [ ] Can access https://1radapi-bch4ere7a6cmgkap.centralindia-01.azurewebsites.net in mobile browser
- [ ] Using the latest APK build (after fixes)
- [ ] Console/logs are visible (use `npx expo start` or `adb logcat` for Android)

### ✅ Test Scenarios

#### Test 1: Password Login
1. Open mobile app
2. Select "SECURE KEY" mode
3. Enter identifier: `<your-email-or-mobile>`
4. Enter password: `<your-password>`
5. Click "ACCESS THE GRID"
6. **Expected:** Login successful, navigate to home
7. **If fails:** Check console logs and note error message

#### Test 2: OTP Login
1. Open mobile app
2. Select "ONE-TIME PASS" mode
3. Enter mobile number
4. Click "REQUEST PASSCODE"
5. Enter 6-digit OTP
6. Click "VERIFY & ENTER"
7. **Expected:** Login successful
8. **If fails:** Check console logs

#### Test 3: Compare with Web
1. Login on website with same credentials
2. Open browser DevTools → Network tab
3. Find `/auth/login` request
4. Compare request body with mobile logs
5. Compare response with mobile logs
6. **Look for differences in:**
   - Request format
   - Response format
   - Field names (camelCase vs PascalCase)

---

## API Request Comparison

### Web Request (Working)
```json
POST https://1radapi-bch4ere7a6cmgkap.centralindia-01.azurewebsites.net/api/v1/auth/login
Content-Type: application/json

{
  "identifier": "admin@1rad.com",
  "password": "your-password"
}
```

### Mobile Request (Should be identical)
```json
POST https://1radapi-bch4ere7a6cmgkap.centralindia-01.azurewebsites.net/api/v1/auth/login
Content-Type: application/json

{
  "identifier": "admin@1rad.com",
  "password": "your-password"
}
```

**They should be IDENTICAL!**

---

## Expected Response Format

### Successful Login Response
```json
{
  "success": true,
  "userProfile": {
    "userId": "guid",
    "fullName": "User Name",
    "email": "user@example.com",
    "authorizedHospitals": [
      {
        "hospitalId": "guid",
        "hospitalName": "Hospital Name",
        "roleName": "AdminDoctor",
        "isDefault": true
      }
    ]
  },
  "accessToken": "jwt-token-here",
  "refreshToken": "refresh-token-here"
}
```

### Failed Login Response
```json
{
  "success": false,
  "error": "Invalid credentials",
  "errorCode": "INVALID_CREDENTIALS"
}
```

---

## How to View Mobile Logs

### For Expo Development Build
```bash
# In terminal
cd 1RadMobile
npx expo start

# Then press 'a' for Android or 'i' for iOS
# Logs will appear in terminal
```

### For Android APK (Installed)
```bash
# Connect device via USB
# Enable USB debugging on device
adb logcat | grep "MOBILE AUTH"
```

### For iOS (Installed)
```bash
# Use Xcode Console or
# Connect device and use Console app on Mac
```

---

## Quick Fix Checklist

If login still fails after the fixes, try these:

### 1. Clear App Data
```javascript
// Add this to LoginScreen temporarily for testing
import * as SecureStore from 'expo-secure-store';

const clearAllData = async () => {
  await SecureStore.deleteItemAsync('1rad_token');
  await SecureStore.deleteItemAsync('1rad_refresh_token');
  await SecureStore.deleteItemAsync('1rad_user');
  await SecureStore.deleteItemAsync('1rad_centers');
  await SecureStore.deleteItemAsync('1rad_active_center_id');
  console.log('All data cleared');
};
```

### 2. Test API Directly
```javascript
// Add this test function to LoginScreen
const testApiDirectly = async () => {
  try {
    const response = await fetch('https://1radapi-bch4ere7a6cmgkap.centralindia-01.azurewebsites.net/api/v1/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        identifier: 'your-email',
        password: 'your-password'
      })
    });
    const data = await response.json();
    console.log('Direct API test:', JSON.stringify(data, null, 2));
  } catch (error) {
    console.error('Direct API test failed:', error);
  }
};
```

### 3. Verify API Client Configuration
Check `1RadMobile/src/api/apiClient.js`:
```javascript
// Should have:
baseURL: 'https://1radapi-bch4ere7a6cmgkap.centralindia-01.azurewebsites.net/api/v1'
```

---

## Next Steps

1. **Rebuild the app** with the fixes:
   ```bash
   cd 1RadMobile
   eas build --platform android --profile production
   ```

2. **Install the new APK** on your device

3. **Try logging in** and check the console logs

4. **Report back** with:
   - Error message shown on screen (if any)
   - Console logs (especially lines with `[MOBILE AUTH]`)
   - Whether you can access the API URL in mobile browser
   - Network type (WiFi or mobile data)

---

## Contact Information

If issue persists, provide:
1. Screenshot of error on mobile
2. Console logs (all lines with `[MOBILE AUTH]`)
3. Confirmation that web login works with same credentials
4. Mobile device type (Android/iOS version)
5. Network connection type

---

**Last Updated:** April 20, 2026  
**Status:** Fixes applied, awaiting test results
