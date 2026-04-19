# 📥 Install Java 17 - Step by Step

## 🎯 Quick Installation Guide

### **Step 1: Download Java 17**

Click this link to download:
👉 **https://adoptium.net/temurin/releases/?version=17**

**Select these options on the download page:**
- Operating System: **Windows**
- Architecture: **x64**
- Package Type: **JDK**
- Version: **17 - LTS**

**Direct Download Link:**
👉 **https://github.com/adoptium/temurin17-binaries/releases/download/jdk-17.0.13%2B11/OpenJDK17U-jdk_x64_windows_hotspot_17.0.13_11.msi**

---

### **Step 2: Install Java 17**

1. **Run the downloaded `.msi` file**
2. **Click "Next"** on the welcome screen
3. **IMPORTANT**: On the "Custom Setup" screen, make sure these are checked:
   - ✅ **Set JAVA_HOME variable** (click to enable if not checked)
   - ✅ **JavaSoft (Oracle) registry keys** (click to enable if not checked)
   - ✅ **Add to PATH** (click to enable if not checked)
4. **Click "Next"** and then **"Install"**
5. **Wait for installation** to complete
6. **Click "Finish"**

---

### **Step 3: Set Java 17 as Default**

After installation, you need to set Java 17 as the default:

#### **Option A: Using Environment Variables (Permanent)**

1. Press **Windows Key + R**
2. Type: `sysdm.cpl` and press Enter
3. Click **"Advanced"** tab
4. Click **"Environment Variables"**
5. Under **"System variables"**, find **JAVA_HOME**:
   - If it exists: Click **"Edit"** and change to: `C:\Program Files\Eclipse Adoptium\jdk-17.0.13.11-hotspot`
   - If it doesn't exist: Click **"New"** and add:
     - Variable name: `JAVA_HOME`
     - Variable value: `C:\Program Files\Eclipse Adoptium\jdk-17.0.13.11-hotspot`
6. Find **Path** in System variables:
   - Click **"Edit"**
   - Move `%JAVA_HOME%\bin` to the **TOP** of the list (or add it if not there)
   - Remove or move down any Java 24 paths
7. Click **"OK"** on all windows
8. **Close and reopen PowerShell**

#### **Option B: Using PowerShell (Temporary - For This Session)**

```powershell
# Set Java 17 for current session
$env:JAVA_HOME = "C:\Program Files\Eclipse Adoptium\jdk-17.0.13.11-hotspot"
$env:PATH = "$env:JAVA_HOME\bin;$env:PATH"
```

---

### **Step 4: Verify Installation**

**Close all PowerShell windows and open a NEW one**, then run:

```powershell
java -version
```

**You should see:**
```
openjdk version "17.0.13" 2024-10-15
OpenJDK Runtime Environment Temurin-17.0.13+11 (build 17.0.13+11)
OpenJDK 64-Bit Server VM Temurin-17.0.13+11 (build 17.0.13+11, mixed mode, sharing)
```

**Also verify JAVA_HOME:**
```powershell
echo $env:JAVA_HOME
```

**Should show:**
```
C:\Program Files\Eclipse Adoptium\jdk-17.0.13.11-hotspot
```

---

## ✅ After Java 17 is Installed

Once you see Java 17 in the version check, run:

```powershell
cd C:\Users\mtnoo\OneDrive\Desktop\1Rad\easyrad\1RadMobile
.\build-apk.bat
```

Or manually:

```powershell
cd C:\Users\mtnoo\OneDrive\Desktop\1Rad\easyrad\1RadMobile\android
./gradlew assembleRelease --no-daemon
```

---

## 🔧 Troubleshooting

### **Still showing Java 24 after installation?**

1. **Close ALL PowerShell/Command Prompt windows**
2. **Restart your computer** (recommended)
3. **Open NEW PowerShell**
4. **Run**: `java -version`

### **Can't find Java 17 installation folder?**

Check these locations:
- `C:\Program Files\Eclipse Adoptium\jdk-17.0.13.11-hotspot`
- `C:\Program Files\Eclipse Adoptium\jdk-17*`
- `C:\Program Files\Java\jdk-17*`

### **Installation failed?**

1. **Uninstall Java 24** first (optional but recommended):
   - Go to **Settings** → **Apps** → Find **Java** → **Uninstall**
2. **Restart computer**
3. **Install Java 17** again

---

## 📋 Quick Checklist

- [ ] Downloaded Java 17 from Adoptium
- [ ] Installed with JAVA_HOME and PATH options checked
- [ ] Set JAVA_HOME environment variable
- [ ] Moved Java 17 to top of PATH
- [ ] Closed and reopened PowerShell
- [ ] Verified: `java -version` shows 17.x
- [ ] Verified: `echo $env:JAVA_HOME` shows Java 17 path
- [ ] Ready to build APK!

---

## 🚀 Next: Build Your APK

Once Java 17 is verified, you're ready to build:

```powershell
# Navigate to project
cd C:\Users\mtnoo\OneDrive\Desktop\1Rad\easyrad\1RadMobile

# Run the build script
.\build-apk.bat

# Choose option 2 for Release APK
```

**Your APK will be at:**
```
android\app\build\outputs\apk\release\app-release.apk
```

---

**Need help?** Let me know what step you're on and I'll assist!
