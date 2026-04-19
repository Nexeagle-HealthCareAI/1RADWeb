# 🚀 Build 1RAD Mobile APK - Step by Step Guide

**Date:** April 19, 2026  
**App Version:** 1.0.0  
**Build Method:** EAS Build (Cloud Build - Recommended)

---

## ✅ Prerequisites Check

Before building, ensure you have:

- [x] Expo account (sign up at https://expo.dev)
- [x] EAS CLI installed globally
- [x] Internet connection
- [x] Project configured with EAS

---

## 🎯 Quick Build (Recommended)

### Option 1: Production APK (For Distribution)

```bash
cd 1RadMobile
eas build --platform android --profile production
```

**Build Time:** ~10-15 minutes  
**Output:** Production-ready APK  
**Signed:** Yes (automatically)

---

### Option 2: Preview APK (For Testing)

```bash
cd 1RadMobile
eas build --platform android --profile preview
```

**Build Time:** ~10-15 minutes  
**Output:** Internal testing APK  
**Signed:** Yes (automatically)

---

## 📋 Detailed Build Steps

### Step 1: Open Terminal in Project Directory

```bash
cd C:\Users\mtnoo\OneDrive\Desktop\EasyHMS\1RadMobile
```

### Step 2: Login to Expo (if not already logged in)

```bash
eas login
```

Enter your Expo credentials when prompted.

### Step 3: Check EAS Configuration

```bash
eas build:configure
```

This will verify your `eas.json` configuration.

### Step 4: Start the Build

```bash
eas build --platform android --profile production
```

### Step 5: Monitor Build Progress

The CLI will show you:
- Build ID
- Build URL (to monitor in browser)
- Estimated time remaining

Example output:
```
✔ Build started, it may take a few minutes to complete.
Build ID: 84291e0c-bc32-4e24-afb6-bcc3487a7cad
Build URL: https://expo.dev/accounts/tasnoori/projects/1RadMobile/builds/...

You can monitor the build at the URL above.
```

### Step 6: Download APK

Once complete, you'll get:
- Download link in terminal
- Email notification (if enabled)
- APK available in Expo dashboard

---

## 🔧 Build Profiles Explained

### 1. **Production Profile** (Recommended for Release)
```json
"production": {
  "android": {
    "buildType": "apk"
  }
}
```

**Use for:**
- Final release to users
- Play Store submission
- Production deployment

**Features:**
- Optimized and minified
- ProGuard enabled
- Signed with production keystore

---

### 2. **Preview Profile** (For Internal Testing)
```json
"preview": {
  "distribution": "internal",
  "android": {
    "buildType": "apk"
  }
}
```

**Use for:**
- Internal team testing
- QA testing
- Beta testing

**Features:**
- Faster build time
- Internal distribution only
- Signed with preview keystore

---

### 3. **Development Profile** (For Development)
```json
"development": {
  "developmentClient": true,
  "distribution": "internal",
  "android": {
    "gradleCommand": ":app:assembleDebug",
    "buildType": "apk"
  }
}
```

**Use for:**
- Development builds
- Debugging
- Testing new features

**Features:**
- Debug mode enabled
- Development client included
- Not optimized

---

## 📱 Installing the APK

### On Physical Device:

1. **Download APK** from build URL
2. **Transfer to phone** via USB or cloud storage
3. **Enable Unknown Sources:**
   - Settings → Security → Unknown Sources → Enable
4. **Install APK:**
   - Open file manager
   - Tap the APK file
   - Tap "Install"
5. **Open app** from app drawer

### On Emulator:

```bash
adb install path/to/your-app.apk
```

---

## 🎨 Build Configuration Details

### Current App Configuration:

```json
{
  "name": "1RadMobile",
  "slug": "1RadMobile",
  "version": "1.0.0",
  "package": "com.tasnoori.x1RadMobile",
  "projectId": "3ca3af4b-6b75-402c-8837-fbb90f3d974e"
}
```

### Build Features:
- ✅ Splash screen configured
- ✅ App icon configured
- ✅ Adaptive icon for Android
- ✅ Secure storage plugin enabled
- ✅ Edge-to-edge display enabled

---

## 🔍 Troubleshooting

### Issue 1: "eas: command not found"

**Solution:**
```bash
npm install -g eas-cli
```

---

### Issue 2: "Not logged in"

**Solution:**
```bash
eas login
```

---

### Issue 3: "Build failed"

**Check:**
1. Internet connection
2. Expo account status
3. Build logs in Expo dashboard
4. Package.json dependencies

**View detailed logs:**
```bash
eas build:list
```

---

### Issue 4: "Java version mismatch" (Local builds only)

**Solution:**
Use EAS cloud build instead (recommended)

---

## 📊 Build Status Tracking

### Check Build Status:

```bash
eas build:list
```

### View Specific Build:

```bash
eas build:view BUILD_ID
```

### Cancel Build:

```bash
eas build:cancel BUILD_ID
```

---

## 🌐 Access Build Dashboard

Visit: https://expo.dev/accounts/tasnoori/projects/1RadMobile/builds

Here you can:
- Monitor active builds
- Download completed builds
- View build logs
- Manage build history

---

## 📦 Build Output

### What You'll Get:

1. **APK File** (~50-80 MB)
   - Filename: `build-[timestamp].apk`
   - Signed and ready to install

2. **Build Metadata**
   - Build ID
   - Build date/time
   - Git commit hash
   - Dependencies list

3. **Build Logs**
   - Complete build output
   - Error messages (if any)
   - Warnings

---

## 🚀 Quick Commands Reference

```bash
# Login to Expo
eas login

# Build production APK
eas build --platform android --profile production

# Build preview APK
eas build --platform android --profile preview

# List all builds
eas build:list

# View build details
eas build:view BUILD_ID

# Download APK
# (Use the download link from build completion)

# Check EAS CLI version
eas --version

# Update EAS CLI
npm install -g eas-cli@latest
```

---

## 📝 Build Checklist

Before building, verify:

- [ ] All code changes committed
- [ ] Dependencies installed (`npm install`)
- [ ] No TypeScript/ESLint errors
- [ ] App tested in development mode
- [ ] Version number updated in `app.json`
- [ ] Splash screen and icons configured
- [ ] API endpoints configured correctly
- [ ] Logged into Expo account

---

## 🎯 Recommended Build Command

For your first build, use:

```bash
cd 1RadMobile
eas build --platform android --profile production
```

This will:
1. ✅ Create production-ready APK
2. ✅ Optimize and minify code
3. ✅ Sign with production certificate
4. ✅ Enable ProGuard
5. ✅ Generate source maps

**Estimated Time:** 10-15 minutes

---

## 📱 Testing the APK

### Before Distribution:

1. **Install on test device**
2. **Test all features:**
   - [ ] Login/Registration
   - [ ] OTP verification
   - [ ] Appointment creation
   - [ ] Patient search
   - [ ] Admin board (if admin)
   - [ ] Biometric authentication
   - [ ] Network connectivity
3. **Check performance:**
   - [ ] App load time
   - [ ] Screen transitions
   - [ ] API response times
4. **Test edge cases:**
   - [ ] No internet connection
   - [ ] Invalid credentials
   - [ ] Empty states
   - [ ] Error handling

---

## 🔐 Security Notes

### APK Signing:

- EAS automatically signs your APK
- Keystore managed by Expo
- Consistent signing across builds

### For Play Store:

If you plan to publish to Google Play Store:

```bash
eas build --platform android --profile production
```

Then submit:

```bash
eas submit --platform android
```

---

## 📈 Build History

### Your Previous Build:

**Build ID:** `84291e0c-bc32-4e24-afb6-bcc3487a7cad`  
**Status:** Completed  
**Profile:** Production  
**Date:** April 19, 2026

**Access:** https://expo.dev/accounts/tasnoori/projects/1RadMobile/builds/84291e0c-bc32-4e24-afb6-bcc3487a7cad

---

## 🎉 Success Indicators

Build is successful when you see:

```
✔ Build finished
✔ APK: https://expo.dev/artifacts/eas/...
✔ Build ID: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
```

You'll also receive:
- Email notification
- Download link
- Build artifacts

---

## 🆘 Need Help?

### Resources:

- **EAS Build Docs:** https://docs.expo.dev/build/introduction/
- **Expo Forums:** https://forums.expo.dev/
- **Discord:** https://chat.expo.dev/

### Common Issues:

1. **Build taking too long?**
   - Normal: 10-15 minutes
   - Check build queue status

2. **Build failed?**
   - Check build logs
   - Verify dependencies
   - Check network connection

3. **Can't download APK?**
   - Check email for link
   - Visit Expo dashboard
   - Use `eas build:list` command

---

## 🎯 Next Steps After Build

1. **Download APK** from build URL
2. **Test on device** thoroughly
3. **Share with team** for testing
4. **Collect feedback**
5. **Fix any issues**
6. **Build again** if needed
7. **Distribute** to users

---

## 📞 Support

For build issues specific to this project:
- Check `build_error.log` in project root
- Review `APK_BUILD_GUIDE.md` for detailed troubleshooting
- Contact: tasnoori (project owner)

---

**Ready to build? Run this command:**

```bash
cd 1RadMobile && eas build --platform android --profile production
```

🚀 **Good luck with your build!**

