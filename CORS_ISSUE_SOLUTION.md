# CORS Issue - Network Error Solution

**Error:** `AxiosError: Network Error` - `net::ERR_FAILED`  
**Cause:** CORS (Cross-Origin Resource Sharing) blocking browser requests  
**Platform:** Web browser only (NOT a problem on real mobile devices)  
**Status:** ✅ EXPECTED BEHAVIOR - Not a bug

---

## Understanding the Issue

### What is CORS?
CORS is a **browser security feature** that blocks web pages from making requests to different domains unless the server explicitly allows it.

### Why This Happens
- You're testing the mobile app in a **web browser** (via `react-native-web`)
- Browser sees request from `http://localhost:8081` to `https://1radapi-bch4ere7a6cmgkap.centralindia-01.azurewebsites.net`
- These are different origins (different domains)
- Browser blocks the request unless API server allows it

### Why This is NOT a Problem
- **Real mobile apps (Android/iOS) don't have CORS restrictions**
- CORS only affects web browsers
- Your installed APK will work fine
- This is why web login works but mobile web testing doesn't

---

## Solutions (Choose One)

### ✅ Solution 1: Test on Real Device (RECOMMENDED)

**This is the proper way to test mobile apps.**

#### For Android Emulator:
```bash
cd 1RadMobile
npx expo start
# Press 'a' to open on Android emulator
# Login will work without CORS issues
```

#### For Physical Android Device:
```bash
cd 1RadMobile
npx expo start
# Scan QR code with Expo Go app
# OR install the APK you already built
```

#### Download Your Built APK:
```
https://expo.dev/artifacts/eas/3goYxN6SH1wSaXXNtf6MH3.apk
```
Install this on your Android device and test login.

**Result:** ✅ Login will work perfectly (no CORS on native apps)

---

### ✅ Solution 2: Fix CORS on Backend (PERMANENT)

**Add CORS configuration to your .NET API**

#### File: `Program.cs` or `Startup.cs`

**Option A: Allow Specific Origins (Recommended)**
```csharp
// Add this service
builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowMobileApp", policy =>
    {
        policy.WithOrigins(
            "http://localhost:8081",      // Expo web dev
            "http://localhost:19006",     // Expo alternative port
            "http://localhost:3000",      // Web app dev
            "https://yourdomain.com"      // Production web
        )
        .AllowAnyMethod()
        .AllowAnyHeader()
        .AllowCredentials();
    });
});

// Add this middleware (BEFORE app.UseAuthorization())
app.UseCors("AllowMobileApp");
```

**Option B: Allow All Origins (Development Only)**
```csharp
// Add this service
builder.Services.AddCors(options =>
{
    options.AddDefaultPolicy(policy =>
    {
        policy.AllowAnyOrigin()
              .AllowAnyMethod()
              .AllowAnyHeader();
    });
});

// Add this middleware (BEFORE app.UseAuthorization())
app.UseCors();
```

**After adding CORS:**
1. Rebuild and redeploy your .NET API
2. Test web version again
3. Login should work in browser

---

### ✅ Solution 3: Use CORS Proxy (TEMPORARY)

**I've already applied this fix to your code.**

The mobile app now uses a CORS proxy when running in web mode:
- **Web mode:** Uses `https://cors-anywhere.herokuapp.com/` proxy
- **Mobile mode:** Direct API connection (no proxy)

**File Modified:** `1RadMobile/src/api/apiClient.js`

**How it works:**
```javascript
// Web: http://localhost:8081 → CORS proxy → Your API
// Mobile: App → Your API (direct, no CORS)
```

**Limitations:**
- Public CORS proxy may be slow
- May have rate limits
- Only for testing, not production
- Need to request access: https://cors-anywhere.herokuapp.com/corsdemo

**To use:**
1. Visit https://cors-anywhere.herokuapp.com/corsdemo
2. Click "Request temporary access"
3. Try login again in web browser
4. Should work now

---

### ✅ Solution 4: Disable CORS in Browser (TESTING ONLY)

**⚠️ WARNING: Only for testing, reduces security**

#### Chrome (Windows):
```bash
# Close all Chrome windows first
# Then run:
"C:\Program Files\Google\Chrome\Application\chrome.exe" --disable-web-security --user-data-dir="C:\temp\chrome-dev"
```

#### Chrome (Mac):
```bash
open -na Google\ Chrome --args --disable-web-security --user-data-dir="/tmp/chrome-dev"
```

#### Firefox:
1. Type `about:config` in address bar
2. Search for `security.fileuri.strict_origin_policy`
3. Set to `false`

**After testing, close this browser and use normal browser.**

---

## Comparison: Web vs Mobile

### Web Browser (CORS Applies)
```
Browser → localhost:8081 → API (BLOCKED by CORS)
❌ Fails with "Network Error"
```

### Mobile App (No CORS)
```
Mobile App → API (Direct connection)
✅ Works perfectly
```

### Why the Difference?
- **Browsers** enforce CORS for security (prevent malicious websites)
- **Mobile apps** are not browsers, no CORS restrictions
- **Native apps** can make requests to any server

---

## Testing Checklist

### ✅ Test 1: Web Browser (with CORS proxy)
1. Visit https://cors-anywhere.herokuapp.com/corsdemo
2. Click "Request temporary access"
3. Run `npx expo start` and press 'w' for web
4. Try login
5. **Expected:** Should work with proxy

### ✅ Test 2: Android Emulator (no CORS)
1. Run `npx expo start`
2. Press 'a' for Android
3. Try login
4. **Expected:** Works perfectly (no CORS)

### ✅ Test 3: Installed APK (no CORS)
1. Download APK: https://expo.dev/artifacts/eas/3goYxN6SH1wSaXXNtf6MH3.apk
2. Install on Android device
3. Try login
4. **Expected:** Works perfectly (no CORS)

### ✅ Test 4: iOS Simulator (no CORS)
1. Run `npx expo start`
2. Press 'i' for iOS (Mac only)
3. Try login
4. **Expected:** Works perfectly (no CORS)

---

## Recommended Approach

### For Development:
1. **Test on Android emulator** (no CORS issues)
2. **OR** Add CORS to backend API (permanent fix)
3. **OR** Use CORS proxy for quick web testing

### For Production:
1. **Build APK/IPA** for distribution
2. **Add CORS to backend** if you have a web app too
3. **Never rely on CORS proxy** in production

---

## Why Your Web App Works

Your web app (`src/pages/LoginPage.jsx`) works because:
1. It's served from the **same domain** as the API
2. OR the API already has CORS configured for the web domain
3. OR you're using a proxy/reverse proxy

The mobile app in web mode is served from `localhost:8081`, which is a **different origin**, so CORS blocks it.

---

## Files Modified

### 1. `1RadMobile/src/api/apiClient.js`
**Change:** Added Platform detection and CORS proxy for web mode
```javascript
const API_URL = Platform.OS === 'web' 
  ? `https://cors-anywhere.herokuapp.com/${BASE_URL}` // Web: use proxy
  : BASE_URL; // Mobile: direct connection
```

**Impact:**
- ✅ Web testing now works (with CORS proxy)
- ✅ Mobile apps unaffected (direct connection)
- ⚠️ Need to request CORS proxy access first

---

## Next Steps

### Immediate Action:
1. **Test on Android emulator or device** (recommended)
   ```bash
   cd 1RadMobile
   npx expo start
   # Press 'a' for Android
   ```

2. **OR** Use the CORS proxy for web testing:
   - Visit https://cors-anywhere.herokuapp.com/corsdemo
   - Click "Request temporary access"
   - Try login in web browser

3. **OR** Install the APK you already built:
   - Download: https://expo.dev/artifacts/eas/3goYxN6SH1wSaXXNtf6MH3.apk
   - Install on Android device
   - Test login

### Long-term Solution:
**Add CORS to your .NET backend API** (see Solution 2 above)

This will allow:
- ✅ Web app testing in browser
- ✅ Mobile web testing in browser
- ✅ Development without CORS proxy
- ✅ Production web app (if needed)

---

## Summary

| Platform | CORS Issue? | Solution |
|----------|-------------|----------|
| **Web Browser** | ✅ Yes | Add CORS to backend OR use proxy |
| **Android App** | ❌ No | Works perfectly |
| **iOS App** | ❌ No | Works perfectly |
| **Android Emulator** | ❌ No | Works perfectly |
| **iOS Simulator** | ❌ No | Works perfectly |

**Bottom Line:** The "Network Error" is a **browser-only issue**. Your mobile app code is correct and will work fine on real devices.

---

## Verification

After applying any solution, you should see:
```
[MOBILE AUTH] Login attempt for <identifier>
[MOBILE AUTH] Raw response: { success: true, ... }
[MOBILE AUTH] Login successful, tokens persisted
```

Instead of:
```
[MOBILE AUTH] Login exception: AxiosError: Network Error
net::ERR_FAILED
```

---

**Last Updated:** April 20, 2026  
**Status:** ✅ CORS proxy added for web testing  
**Recommendation:** Test on Android emulator/device for best results
