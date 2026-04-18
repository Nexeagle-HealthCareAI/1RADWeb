# 1RadMobile APK Build Guide 📱

## 🎯 Overview
This guide provides multiple methods to build an APK file for your 1RadMobile React Native app.

---

## 🚀 Method 1: EAS Build (Recommended)

EAS Build is Expo's cloud-based build service that handles all the complexity for you.

### **Step 1: Install EAS CLI**
```bash
npm install -g @expo/eas-cli
```

### **Step 2: Login to Expo**
```bash
eas login
```

### **Step 3: Configure EAS Build**
```bash
cd 1RadMobile
eas build:configure
```

### **Step 4: Build APK**
```bash
# For development build
eas build --platform android --profile development

# For production build  
eas build --platform android --profile production
```

### **Step 5: Download APK**
- EAS will provide a download link when build completes
- You can also check builds at: https://expo.dev/accounts/[your-username]/projects/1radmobile/builds

---

## 🔧 Method 2: Local Build (Manual Fix Required)

### **Current Issue**
The local build is failing due to a corrupted Gradle cache. Here's how to fix it:

### **Step 1: Clean Everything**
```bash
cd 1RadMobile

# Delete node_modules and reinstall
rm -rf node_modules
npm install

# Delete Android build cache
rm -rf android/.gradle
rm -rf android/app/build
rm -rf android/build

# Clear Expo cache
npx expo r -c
```

### **Step 2: Fix Gradle Cache (Windows)**
```powershell
# Stop all Java processes
taskkill /f /im java.exe

# Delete global Gradle cache
Remove-Item -Recurse -Force $env:USERPROFILE\.gradle\caches
Remove-Item -Recurse -Force $env:USERPROFILE\.gradle\daemon

# Restart computer (recommended)
```

### **Step 3: Regenerate Android Project**
```bash
npx expo prebuild --platform android --clean
```

### **Step 4: Build APK**
```bash
cd android
./gradlew assembleRelease
```

### **Step 5: Find Your APK**
The APK will be located at:
```
1RadMobile/android/app/build/outputs/apk/release/app-release.apk
```

---

## 🛠️ Method 3: Alternative Local Build

If Gradle continues to have issues, try this alternative:

### **Step 1: Use Expo Development Build**
```bash
cd 1RadMobile
npx expo install expo-dev-client
npx expo run:android --variant release --no-install --no-bundler
```

### **Step 2: Manual Gradle Build**
```bash
cd android
./gradlew clean
./gradlew assembleRelease --no-daemon --no-build-cache
```

---

## 🐛 Troubleshooting

### **Java Version Issues**
Your system shows Java 24, but React Native works best with Java 17 or 21:

```bash
# Check Java version
java -version

# If using Java 24, consider downgrading to Java 17 LTS
# Download from: https://adoptium.net/temurin/releases/
```

### **Gradle Daemon Issues**
```bash
# Stop all Gradle daemons
./gradlew --stop

# Build with fresh daemon
./gradlew assembleRelease --no-daemon
```

### **Emulator Storage Issues**
If you see storage errors:
```bash
# Clean emulator data
$ANDROID_HOME/emulator/emulator -avd Pixel_9_API_35 -wipe-data
```

### **React Native Reanimated Issues**
The app uses react-native-reanimated 3.16.1 which should be compatible. If you see reanimated errors:

```bash
# Clear Metro cache
npx expo r -c

# Rebuild with clean cache
npx expo run:android --clear
```

---

## 📦 Build Configuration

### **Current App Configuration**
- **Package Name**: `com.tasnoori.x1RadMobile`
- **App Name**: 1RadMobile
- **Version**: 1.0.0
- **Target SDK**: 36
- **Min SDK**: 24

### **Build Variants**
- **Debug**: `./gradlew assembleDebug`
- **Release**: `./gradlew assembleRelease`

### **APK Locations**
- **Debug APK**: `android/app/build/outputs/apk/debug/app-debug.apk`
- **Release APK**: `android/app/build/outputs/apk/release/app-release.apk`

---

## 🎯 Recommended Approach

**For immediate APK**: Use **Method 1 (EAS Build)** - it's the most reliable and handles all dependencies automatically.

**For local development**: Fix the Gradle cache issues using **Method 2** steps 1-2, then use **Method 3** for building.

---

## 🔍 Verification Steps

After building, verify your APK:

### **Check APK Info**
```bash
# Using aapt (Android Asset Packaging Tool)
aapt dump badging app-release.apk

# Check APK size
ls -lh app-release.apk
```

### **Install on Device**
```bash
# Install via ADB
adb install app-release.apk

# Or transfer to device and install manually
```

---

## 📱 App Features Included

Your APK will include all the implemented features:

✅ **Authentication System** - Login, Register, Forgot Password  
✅ **Navigation System** - Drawer navigation with role-based access  
✅ **Admin Board** - Personnel management, Intelligence analytics, Referral Intel  
✅ **Appointment Board** - Complete appointment management system  
✅ **Registration Forms** - GSTIN, PAN, NABH compliance fields  
✅ **Tactical UI Theme** - Military-inspired design system  
✅ **Real-time Updates** - Live data synchronization  
✅ **Print System** - Thermal token generation  
✅ **Multi-step Workflows** - Complex booking and management flows  

---

## 🚨 Important Notes

1. **Signing**: Release APKs need to be signed for production. EAS Build handles this automatically.

2. **Permissions**: The app requires internet permissions for API calls.

3. **API Endpoint**: Currently configured for: `https://1radapi-bch4ere7a6cmgkap.centralindia-01.azurewebsites.net/api/v1`

4. **Testing**: Test the APK on multiple devices before distribution.

5. **Updates**: For OTA updates, consider using Expo Updates service.

---

**Build Date**: 2026-04-19  
**Status**: Ready for Build  
**Recommended Method**: EAS Build (Cloud)  
**Alternative**: Local build after Gradle cache fix  

The app is fully implemented and ready for APK generation using any of the above methods!