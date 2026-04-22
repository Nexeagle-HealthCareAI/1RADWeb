# 🚀 Build APK - Quick Guide

**Ready to build your 1RadMobile APK!**

---

## ✅ Pre-Build Checklist

- [x] Biometric features disabled
- [x] Syntax errors fixed (DashboardScreen)
- [x] Status values standardized
- [x] All features working
- [x] Ready to build!

---

## 🔧 Build Commands

### Option 1: EAS Build (Recommended)
```bash
cd 1RadMobile
eas build --platform android --profile preview
```

### Option 2: Local Build
```bash
cd 1RadMobile
npx expo run:android --variant release
```

---

## 📋 Build Steps

### Step 1: Navigate to Project
```bash
cd 1RadMobile
```

### Step 2: Check EAS Configuration
```bash
# View eas.json
cat eas.json
```

### Step 3: Start Build
```bash
# For preview APK (no Google Play)
eas build --platform android --profile preview

# For production APK
eas build --platform android --profile production
```

### Step 4: Wait for Build
- Build will run on Expo servers
- Takes 10-20 minutes
- You'll get a download link when done

---

## 🎯 What Profile to Use?

### Preview Profile (Recommended for Testing)
```bash
eas build --platform android --profile preview
```
- ✅ Generates APK file
- ✅ Can install directly on device
- ✅ No Google Play required
- ✅ Good for testing and distribution

### Production Profile (For Google Play)
```bash
eas build --platform android --profile production
```
- Generates AAB file
- Requires Google Play Console
- For official app store release

---

## 📱 After Build Completes

### Download APK
1. EAS will provide a download link
2. Download the APK file
3. Transfer to Android device
4. Install and test

### Install on Device
```bash
# Enable "Install from Unknown Sources" on device
# Then install APK:
adb install path/to/your-app.apk
```

---

## 🐛 Common Issues

### Issue 1: EAS not installed
```bash
npm install -g eas-cli
eas login
```

### Issue 2: Build fails
```bash
# Check logs
eas build:list

# View specific build
eas build:view [build-id]
```

### Issue 3: Android SDK issues
```bash
# Make sure Android SDK is installed
# Set ANDROID_HOME environment variable
```

---

## 🎉 Success!

When build completes:
1. Download APK from link
2. Install on Android device
3. Test all features
4. Distribute to users!

---

**Ready? Run this command:**
```bash
cd 1RadMobile && eas build --platform android --profile preview
```

**Good luck! 🚀**
