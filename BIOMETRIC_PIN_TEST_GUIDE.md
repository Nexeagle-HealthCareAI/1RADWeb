# 1RAD Mobile - Biometric & PIN Authentication Test Guide

**Date:** April 19, 2026  
**Features:** Fingerprint, Face ID, PIN/Passcode  
**Status:** ✅ Fully Implemented

---

## 🔐 Security Features Overview

### Available Authentication Methods:

1. **Biometric Authentication**
   - Fingerprint (Android/iOS)
   - Face ID (iOS)
   - Iris (Samsung devices)

2. **PIN/Passcode**
   - 4-6 digit passcode
   - Encrypted storage
   - Fallback option

3. **Combined Security**
   - Biometric + PIN backup
   - Auto-fallback on biometric failure

---

## 📋 Implementation Status

### ✅ Completed Features:

| Feature | Status | Location |
|---------|--------|----------|
| Biometric Service | ✅ Complete | `src/services/BiometricService.js` |
| Lock Screen | ✅ Complete | `src/screens/BiometricLockScreen.js` |
| Settings Screen | ✅ Complete | `src/screens/BiometricSetupScreen.js` |
| Secure Storage | ✅ Complete | expo-secure-store |
| Auto-trigger | ✅ Complete | AppNavigator.js |
| Fallback Logic | ✅ Complete | BiometricLockScreen.js |

---

## 🧪 Testing Checklist

### 1. Initial Setup Testing

#### Test 1.1: Enable Fingerprint
```
Steps:
1. Open app
2. Navigate to Settings → Security Settings
3. Toggle "Enable Fingerprint" ON
4. System prompts for fingerprint
5. Place finger on sensor
6. Verify success message

Expected Result:
✅ Fingerprint enabled
✅ Success alert shown
✅ Toggle stays ON
```

#### Test 1.2: Set PIN/Passcode
```
Steps:
1. Go to Security Settings
2. Tap "Set Passcode"
3. Enter 4-6 digit code (e.g., 1234)
4. Confirm passcode
5. Verify success message

Expected Result:
✅ Passcode saved
✅ "Change Passcode" option appears
✅ "Remove Passcode" option appears
```

---

### 2. Lock Screen Testing

#### Test 2.1: Fingerprint Unlock
```
Steps:
1. Close app completely
2. Reopen app
3. See splash screen (5 seconds)
4. Lock screen appears
5. Fingerprint prompt shows
6. Place finger on sensor

Expected Result:
✅ Lock screen shows fingerprint icon
✅ Biometric prompt appears
✅ Successful scan unlocks app
✅ User enters dashboard
```

#### Test 2.2: PIN Unlock
```
Steps:
1. Close and reopen app
2. On lock screen, tap "Use Passcode Instead"
3. Enter your passcode
4. Tap "UNLOCK"

Expected Result:
✅ Passcode input appears
✅ Correct passcode unlocks app
✅ Wrong passcode shows error
✅ Input shakes on wrong attempt
```

#### Test 2.3: Biometric Failure Fallback
```
Steps:
1. Reopen app
2. When fingerprint prompt appears
3. Use wrong finger or cancel
4. Observe fallback behavior

Expected Result:
✅ Shows "Use Passcode Instead" option
✅ Can switch to passcode input
✅ Passcode works as backup
```

---

### 3. Settings Management Testing

#### Test 3.1: Change Passcode
```
Steps:
1. Go to Security Settings
2. Tap "Change Passcode"
3. Enter current passcode
4. Enter new passcode
5. Confirm new passcode

Expected Result:
✅ Current passcode verified
✅ New passcode saved
✅ Old passcode no longer works
✅ New passcode unlocks app
```

#### Test 3.2: Remove Passcode
```
Steps:
1. Go to Security Settings
2. Tap "Remove Passcode"
3. Confirm removal

Expected Result:
✅ Confirmation dialog appears
✅ Passcode removed
✅ Lock screen no longer shows on app open
✅ "Set Passcode" option reappears
```

#### Test 3.3: Disable Fingerprint
```
Steps:
1. Go to Security Settings
2. Toggle "Enable Fingerprint" OFF
3. Confirm disable

Expected Result:
✅ Confirmation dialog appears
✅ Fingerprint disabled
✅ Lock screen no longer shows on app open
✅ Can re-enable later
```

---

### 4. Edge Cases Testing

#### Test 4.1: Multiple Wrong Attempts
```
Steps:
1. Open app to lock screen
2. Enter wrong passcode 3 times
3. Observe behavior

Expected Result:
✅ Error message after each attempt
✅ Input shakes on wrong entry
✅ After 3 attempts, suggests biometric
✅ Can still try again
```

#### Test 4.2: No Biometric Hardware
```
Steps:
1. Test on device without fingerprint sensor
2. Go to Security Settings
3. Check biometric option

Expected Result:
✅ Shows "Biometric not supported" message
✅ Passcode option still available
✅ No crash or error
```

#### Test 4.3: Biometric Not Enrolled
```
Steps:
1. Remove all fingerprints from device settings
2. Try to enable biometric in app
3. Observe behavior

Expected Result:
✅ Shows alert: "Please set up fingerprint in device settings"
✅ Toggle doesn't enable
✅ Directs user to device settings
```

---

### 5. User Flow Testing

#### Test 5.1: First Time User
```
Flow:
1. Install app
2. Register/Login
3. No lock screen (security not set)
4. Go to Settings → Security
5. Enable fingerprint
6. Set passcode
7. Close app
8. Reopen app
9. Lock screen appears

Expected Result:
✅ Smooth onboarding
✅ Clear instructions
✅ Security optional (not forced)
✅ Lock screen works after setup
```

#### Test 5.2: Returning User
```
Flow:
1. User has fingerprint enabled
2. Close app
3. Reopen app
4. Splash screen (5 seconds)
5. Lock screen appears
6. Fingerprint prompt auto-shows
7. Scan finger
8. Enter dashboard

Expected Result:
✅ Quick unlock process
✅ Auto-trigger biometric
✅ No manual tap needed
✅ Smooth transition
```

---

## 🔍 Technical Verification

### Check 1: Secure Storage
```javascript
// Verify data is encrypted
// Location: BiometricService.js

✅ Uses expo-secure-store
✅ Passcode encrypted
✅ Credentials encrypted
✅ Keys properly named
```

### Check 2: Biometric Types
```javascript
// Verify all types supported
// Location: BiometricService.js

✅ Fingerprint detection
✅ Face ID detection
✅ Iris detection
✅ Proper naming
```

### Check 3: Navigation Flow
```javascript
// Verify lock screen integration
// Location: AppNavigator.js

✅ Checks if auth enabled
✅ Shows lock screen when needed
✅ Bypasses when disabled
✅ Proper unlock callback
```

---

## 📱 Device-Specific Testing

### Android Devices:
```
Test on:
- Samsung (Fingerprint + Iris)
- Google Pixel (Fingerprint)
- OnePlus (In-display fingerprint)
- Budget phones (No biometric)

Verify:
✅ Fingerprint works
✅ Fallback to PIN works
✅ No crashes
✅ Proper prompts
```

### iOS Devices:
```
Test on:
- iPhone with Face ID
- iPhone with Touch ID
- iPad with Touch ID

Verify:
✅ Face ID works
✅ Touch ID works
✅ Fallback to passcode
✅ Proper iOS prompts
```

---

## 🐛 Known Issues & Solutions

### Issue 1: Biometric Prompt Not Showing
**Cause:** Device doesn't have biometric enrolled  
**Solution:** Check `isBiometricEnrolled()` before enabling

### Issue 2: Lock Screen Not Appearing
**Cause:** Neither biometric nor passcode enabled  
**Solution:** Check both flags in AppNavigator

### Issue 3: Passcode Not Saving
**Cause:** SecureStore permission issue  
**Solution:** Verify expo-secure-store plugin in app.json

---

## ✅ Final Verification Checklist

Before releasing:

### Functionality:
- [ ] Fingerprint enable/disable works
- [ ] Passcode set/change/remove works
- [ ] Lock screen appears on app open
- [ ] Biometric unlock works
- [ ] PIN unlock works
- [ ] Fallback logic works
- [ ] Multiple attempts handled
- [ ] Settings UI functional

### Security:
- [ ] Passcode encrypted in SecureStore
- [ ] No passcode in logs
- [ ] Proper error messages
- [ ] No security bypass possible
- [ ] Credentials properly stored

### UX:
- [ ] Clear instructions
- [ ] Smooth animations
- [ ] Proper error messages
- [ ] Intuitive flow
- [ ] Accessible design

### Edge Cases:
- [ ] No biometric hardware handled
- [ ] Biometric not enrolled handled
- [ ] Wrong passcode handled
- [ ] App backgrounding handled
- [ ] Device restart handled

---

## 🎯 Test Scenarios

### Scenario 1: Security-Conscious User
```
User wants maximum security:
1. Enable fingerprint ✅
2. Set 6-digit passcode ✅
3. Test both methods ✅
4. Verify lock on every open ✅
```

### Scenario 2: Convenience User
```
User wants quick access:
1. Enable fingerprint only ✅
2. No passcode set ✅
3. Quick unlock with finger ✅
4. No PIN fallback needed ✅
```

### Scenario 3: PIN-Only User
```
User prefers PIN:
1. Don't enable biometric ✅
2. Set 4-digit PIN ✅
3. Unlock with PIN only ✅
4. Works on any device ✅
```

---

## 📊 Performance Metrics

### Expected Performance:

| Action | Time | Acceptable |
|--------|------|------------|
| Fingerprint scan | <1s | ✅ |
| PIN entry | 2-3s | ✅ |
| Lock screen load | <500ms | ✅ |
| Settings save | <200ms | ✅ |
| Biometric enable | 1-2s | ✅ |

---

## 🔐 Security Best Practices

### Implemented:
✅ Encrypted storage (SecureStore)
✅ No plaintext passwords
✅ Secure biometric API
✅ Proper error handling
✅ No security logs
✅ Timeout on failures

### Recommended:
- Regular security audits
- Update expo-local-authentication
- Monitor for vulnerabilities
- User education on security

---

## 📝 User Documentation

### How to Enable Fingerprint:
```
1. Open 1RAD app
2. Tap menu (☰)
3. Select "Security Settings"
4. Toggle "Enable Fingerprint" ON
5. Scan your finger when prompted
6. Done! App is now secured
```

### How to Set PIN:
```
1. Go to Security Settings
2. Tap "Set Passcode"
3. Enter 4-6 digit code
4. Confirm your code
5. Done! PIN is set
```

### How to Unlock:
```
With Fingerprint:
- Open app
- Place finger on sensor
- Unlocked!

With PIN:
- Open app
- Tap "Use Passcode"
- Enter your PIN
- Tap "UNLOCK"
```

---

## 🆘 Troubleshooting

### Problem: Fingerprint not working
**Solutions:**
1. Check device has fingerprint sensor
2. Verify fingerprint enrolled in device settings
3. Clean fingerprint sensor
4. Try re-enabling in app settings

### Problem: Forgot PIN
**Solutions:**
1. Use fingerprint if enabled
2. Reinstall app (will lose data)
3. Contact support

### Problem: Lock screen not showing
**Solutions:**
1. Check if security is enabled in settings
2. Verify both biometric and PIN are disabled
3. Restart app

---

## ✅ Test Results Template

```
Date: ___________
Tester: ___________
Device: ___________
OS Version: ___________

Fingerprint Enable:     [ ] Pass  [ ] Fail
Fingerprint Unlock:     [ ] Pass  [ ] Fail
PIN Set:                [ ] Pass  [ ] Fail
PIN Unlock:             [ ] Pass  [ ] Fail
Fallback Logic:         [ ] Pass  [ ] Fail
Settings Management:    [ ] Pass  [ ] Fail
Edge Cases:             [ ] Pass  [ ] Fail

Notes:
_________________________________
_________________________________
_________________________________

Overall Status:         [ ] Pass  [ ] Fail
```

---

**Status:** ✅ Ready for Testing  
**Next Step:** Build APK and test on physical devices

