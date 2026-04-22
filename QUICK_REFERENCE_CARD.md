# 📱 1Rad Mobile App - Quick Reference Card

**Version:** 1.0.0  
**Status:** ✅ Ready for APK Build  
**Last Updated:** April 22, 2026

---

## 🚀 Quick Start

### Build APK (Fastest Method)
```bash
cd 1RadMobile
eas build --platform android --profile preview
```

### Test Locally
```bash
cd 1RadMobile
npx expo start
# Scan QR code with Expo Go app
```

---

## 👥 User Roles & Routing

| Role | Initial Screen | Access Level |
|------|---------------|--------------|
| `admin` | AdminBoard | Full |
| `admindoctor` | AdminBoard | Full |
| `receptionist` | Appointments | Limited |
| `doctor` | Appointments | Medium |
| `technician` | Appointments | Basic |

---

## 📂 Key Files

### Navigation
- `src/navigation/AppNavigator.js` - Main navigation & routing
- `src/components/BottomNavBar.js` - Bottom navigation bar

### Screens
- `src/screens/AppointmentsScreen.js` - Primary screen (most users)
- `src/screens/AdminBoardScreen.js` - Admin primary screen
- `src/screens/LoginScreen.js` - Authentication
- `src/screens/DashboardScreen.js` - ⚠️ Disabled (preserved)

### Context
- `src/context/AuthContext.js` - User auth & roles
- `src/context/AppointmentContext.js` - Appointment data

---

## 🔧 Recent Changes

### ✅ Completed
1. **Build Error Fix** - Updated react-native-reanimated to 3.16.0
2. **Appointment Sync** - Phase 1 complete (status sync, edit, cancel)
3. **Biometric Removal** - Disabled for simplicity
4. **Dashboard Removal** - Role-based direct routing

### ⚠️ Disabled Features
- Dashboard screen (can re-enable)
- Biometric authentication (can re-enable)

---

## 🎯 Navigation Flow

```
Login → Role Check → Admin? → AdminBoard
                           → Other? → Appointments
```

---

## 📊 Appointment Status Values

**Standardized (lowercase):**
- `scheduled` - Appointment booked
- `confirmed` - Patient confirmed
- `in_progress` - Currently happening
- `completed` - Finished
- `cancelled` - Cancelled

---

## 🔐 API Configuration

**Base URL:**
```
https://1radapi-bch4ere7a6cmgkap.centralindia-01.azurewebsites.net/api/v1
```

**Key Endpoints:**
- `/auth/login` - User login
- `/auth/otp/send` - Send OTP
- `/auth/otp/verify` - Verify OTP
- `/appointments` - Appointment CRUD
- `/auth/switch-context` - Switch center

---

## 🧪 Testing Checklist

### Quick Test
- [ ] Login as admin → lands on AdminBoard ✓
- [ ] Login as receptionist → lands on Appointments ✓
- [ ] Create appointment ✓
- [ ] Edit appointment ✓
- [ ] Cancel appointment ✓
- [ ] Logout ✓

---

## 📚 Documentation Files

### Implementation
- `DASHBOARD_REMOVAL_COMPLETE.md` - Dashboard removal details
- `APPOINTMENT_SYNC_PHASE1_COMPLETE.md` - Appointment sync
- `BIOMETRIC_REMOVAL_SUMMARY.md` - Biometric removal

### Build & Deploy
- `BUILD_APK_READY.md` - Complete build guide
- `APK_BUILD_GUIDE.md` - Detailed instructions

### Reference
- `MOBILE_APP_STATUS_SUMMARY.md` - Complete app status
- `NAVIGATION_FLOW_DIAGRAM.md` - Navigation architecture
- `TASK_COMPLETE_DASHBOARD_REMOVAL.md` - Task completion

---

## 🐛 Troubleshooting

### Build Fails
```bash
cd 1RadMobile/android
./gradlew clean
cd ..
npx expo start --clear
```

### Metro Issues
```bash
npx expo start --clear
# or
npx react-native start --reset-cache
```

### Dependencies Issues
```bash
rm -rf node_modules package-lock.json
npm install
```

---

## 🔄 Rollback Dashboard

### Quick Rollback
1. Uncomment Dashboard import in `AppNavigator.js`
2. Uncomment Dashboard screen registration
3. Change `initialRouteName` to `"Dashboard"`
4. Add Dashboard back to `BottomNavBar.js`

**Time:** ~5 minutes

---

## 📞 Quick Commands

### Install Dependencies
```bash
cd 1RadMobile && npm install
```

### Start Development
```bash
cd 1RadMobile && npx expo start
```

### Build APK (EAS)
```bash
cd 1RadMobile && eas build --platform android
```

### Build APK (Local)
```bash
cd 1RadMobile/android && ./gradlew assembleDebug
```

### Clear Cache
```bash
cd 1RadMobile && npx expo start --clear
```

### Check Diagnostics
```bash
cd 1RadMobile && npm run lint
```

---

## 🎨 Theme Colors

```javascript
Primary: #00F2FE (Cyan)
Background: #0B1120 (Dark)
Sidebar: #0A0E1A (Darker)
Success: #2ecc71 (Green)
Error: #e74c3c (Red)
Warning: #f39c12 (Orange)
```

---

## 📦 Package Info

```json
{
  "name": "1RadMobile",
  "version": "1.0.0",
  "package": "com.tasnoori.x1RadMobile"
}
```

---

## ✅ Status Summary

```
✅ Build errors fixed
✅ Appointment sync working
✅ Role-based routing implemented
✅ Dashboard removed
✅ Biometric disabled
✅ No diagnostic errors
✅ Ready for APK build
```

---

## 🚀 Next Action

**Build the APK now!**

```bash
cd 1RadMobile
eas build --platform android --profile preview
```

Or see `BUILD_APK_READY.md` for detailed instructions.

---

**Quick Reference Card v1.0**  
**For:** 1Rad Mobile App  
**Date:** April 22, 2026  
**Status:** ✅ Production Ready
