# 🚀 Build APK Preview - Step by Step

**Date:** April 22, 2026  
**App Version:** 1.0.0  
**Build Type:** Preview APK  
**Status:** Ready to Build

---

## ✅ Pre-Build Checklist

### Configuration Files
- ✅ `package.json` - All dependencies updated
- ✅ `eas.json` - Build profiles configured
- ✅ `app.json` - App metadata set
- ✅ EAS Project ID: `3ca3af4b-6b75-402c-8837-fbb90f3d974e`

### Recent Changes
- ✅ Bottom navigation redesigned (5 tabs)
- ✅ Drawer navigation removed
- ✅ 3 new placeholder screens created
- ✅ Role-based routing working
- ✅ No diagnostic errors

### Dependencies
- ✅ React Native: 0.76.9
- ✅ Expo SDK: ~52.0.7
- ✅ React Native Reanimated: ~3.16.0
- ✅ Navigation: Stack-based

---

## 🚀 Build Commands

### Option 1: Preview Build (Recommended)
```bash
cd 1RadMobile
eas build --platform android --profile preview
```

**What this does:**
- Builds APK for Android
- Uses preview profile (internal distribution)
- Creates installable APK file
- Provides download link

**Build Time:** ~10-15 minutes

---

### Option 2: Development Build
```bash
cd 1RadMobile
eas build --platform android --profile development
```

**What this does:**
- Builds development client
- Includes debugging tools
- Larger file size
- Good for testing

**Build Time:** ~10-15 minutes

---

### Option 3: Production Build
```bash
cd 1RadMobile
eas build --platform android --profile production
```

**What this does:**
- Optimized production build
- Smaller file size
- No debugging tools
- Ready for Play Store

**Build Time:** ~15-20 minutes

---

## 📋 Step-by-Step Instructions

### Step 1: Open Terminal
```bash
# Navigate to project directory
cd 1RadMobile
```

### Step 2: Verify EAS CLI is Installed
```bash
# Check if EAS CLI is installed
eas --version

# If not installed, install it
npm install -g eas-cli
```

### Step 3: Login to Expo Account
```bash
# Login (if not already logged in)
eas login

# Enter your Expo credentials
# Email: your-email@example.com
# Password: your-password
```

### Step 4: Start the Build
```bash
# Build preview APK
eas build --platform android --profile preview
```

### Step 5: Wait for Build
```
✓ Compiling project
✓ Building Android app
✓ Uploading build artifacts
✓ Build complete!
```

### Step 6: Download APK
```
Build URL: https://expo.dev/accounts/[account]/projects/1RadMobile/builds/[build-id]

Download link will be provided in terminal
```

---

## 🎯 What to Expect

### Build Process
1. **Validation** (1 min)
   - Checks configuration
   - Validates dependencies
   - Verifies credentials

2. **Compilation** (5-8 min)
   - Compiles JavaScript
   - Bundles assets
   - Optimizes code

3. **Android Build** (3-5 min)
   - Gradle build
   - APK generation
   - Signing

4. **Upload** (1-2 min)
   - Uploads to Expo servers
   - Generates download link

**Total Time:** ~10-15 minutes

---

## 📱 After Build Completes

### You'll Receive:
1. **Build URL** - View build details on Expo dashboard
2. **Download Link** - Direct APK download link
3. **QR Code** - Scan to install on device
4. **Build ID** - For tracking and reference

### Installing APK:

#### Method 1: Direct Download on Device
1. Open build URL on your Android device
2. Tap "Download APK"
3. Allow installation from unknown sources
4. Install the app

#### Method 2: Transfer via USB
1. Download APK to computer
2. Connect Android device via USB
3. Copy APK to device
4. Open file manager on device
5. Tap APK to install

#### Method 3: ADB Install
```bash
# Download APK first, then:
adb install path/to/app.apk
```

---

## 🔧 Build Configuration

### Preview Profile (eas.json)
```json
{
  "preview": {
    "distribution": "internal",
    "android": {
      "buildType": "apk"
    }
  }
}
```

**Settings:**
- Distribution: Internal (not for Play Store)
- Build Type: APK (installable file)
- Optimization: Balanced

### App Configuration (app.json)
```json
{
  "name": "1RAD",
  "version": "1.0.0",
  "android": {
    "package": "com.tasnoori.x1RadMobile"
  }
}
```

---

## 🐛 Troubleshooting

### Issue 1: EAS CLI Not Found
```bash
# Install EAS CLI globally
npm install -g eas-cli

# Verify installation
eas --version
```

### Issue 2: Not Logged In
```bash
# Login to Expo
eas login

# Check login status
eas whoami
```

### Issue 3: Build Failed - Dependencies
```bash
# Clear node modules and reinstall
cd 1RadMobile
rm -rf node_modules
npm install

# Try build again
eas build --platform android --profile preview
```

### Issue 4: Build Failed - Gradle
```bash
# Clear Expo cache
cd 1RadMobile
npx expo start --clear

# Try build again
eas build --platform android --profile preview
```

### Issue 5: Project Not Configured
```bash
# Configure EAS project
cd 1RadMobile
eas build:configure

# Follow prompts
# Then try build again
```

---

## 📊 Build Output

### What You'll Get:
```
Build Details:
├── Build ID: abc123def456
├── Platform: Android
├── Profile: preview
├── Status: Finished
├── APK Size: ~50-80 MB
├── Download URL: https://expo.dev/...
└── Expires: 30 days
```

### APK Details:
- **Package:** com.tasnoori.x1RadMobile
- **Version:** 1.0.0
- **Version Code:** 1
- **Min SDK:** 21 (Android 5.0)
- **Target SDK:** 34 (Android 14)

---

## 🎉 Success Indicators

### Build Successful When You See:
```
✓ Build finished
✓ APK: https://expo.dev/accounts/.../builds/.../download

Install the app on your Android device:
https://expo.dev/artifacts/eas/[artifact-id].apk
```

### In Expo Dashboard:
- Build status: ✅ Finished
- Download button available
- QR code displayed
- Build logs accessible

---

## 📱 Testing the APK

### After Installation:
1. **Launch App**
   - Tap 1RAD icon
   - Should show splash screen
   - Then login screen

2. **Test Login**
   - Enter credentials
   - Verify authentication works
   - Check role-based routing

3. **Test Navigation**
   - Verify all 5 bottom tabs visible
   - Tap each tab
   - Verify screens load

4. **Test Features**
   - AdminBoard (if admin)
   - Appointments list
   - Create appointment
   - Edit appointment
   - Cancel appointment

5. **Test Placeholders**
   - Finance screen
   - Scanning Bay screen
   - Doctor screen
   - Verify "Under Construction" message

---

## 🔐 Security Notes

### Preview Build:
- ✅ Signed with Expo credentials
- ✅ Secure token storage
- ✅ HTTPS API calls
- ⚠️ Debug mode enabled
- ⚠️ Not Play Store ready

### For Production:
- Generate your own keystore
- Sign with your credentials
- Disable debug mode
- Enable ProGuard
- Submit to Play Store

---

## 📞 Support

### If Build Fails:
1. Check build logs in Expo dashboard
2. Look for error messages in terminal
3. Verify all dependencies installed
4. Check internet connection
5. Try clearing cache and rebuilding

### Common Error Messages:

**"Project not configured"**
→ Run `eas build:configure`

**"Not authenticated"**
→ Run `eas login`

**"Build failed: Gradle error"**
→ Check Android configuration in app.json

**"Network error"**
→ Check internet connection, try again

---

## 🎯 Quick Reference

### Essential Commands:
```bash
# Navigate to project
cd 1RadMobile

# Install EAS CLI
npm install -g eas-cli

# Login
eas login

# Build preview APK
eas build --platform android --profile preview

# Check build status
eas build:list

# View build details
eas build:view [build-id]
```

---

## ✅ Ready to Build!

Everything is configured and ready. Run this command to start:

```bash
cd 1RadMobile
eas build --platform android --profile preview
```

The build will take approximately 10-15 minutes. You'll receive a download link when complete.

---

**Build Guide Version:** 1.0  
**Last Updated:** April 22, 2026  
**Status:** ✅ Ready to Execute  
**Estimated Time:** 10-15 minutes
