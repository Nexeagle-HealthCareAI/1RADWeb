# 1RAD Mobile - App Icon Setup Guide

**Updated:** April 19, 2026  
**App Name:** 1RAD  
**Icon Design:** 1RAD text with logo.png

---

## 📱 Current Configuration

### App.json Settings:
```json
{
  "name": "1RAD",
  "icon": "./assets/logo.png",
  "android": {
    "adaptiveIcon": {
      "foregroundImage": "./assets/logo.png",
      "backgroundColor": "#0b1120"
    }
  }
}
```

---

## 🎨 App Icon Design Requirements

### What Users Will See:

**On Home Screen:**
```
┌─────────────┐
│             │
│   [LOGO]    │  ← Your logo.png
│    1RAD     │  ← App name below icon
│             │
└─────────────┘
```

**App Name Displayed:** "1RAD"

---

## 📐 Icon Specifications

### Required Sizes:

| Platform | Size | File |
|----------|------|------|
| iOS | 1024x1024 | icon.png |
| Android | 1024x1024 | logo.png |
| Android Adaptive | 1024x1024 | logo.png (foreground) |

### Design Guidelines:

1. **Size:** 1024x1024 pixels (minimum)
2. **Format:** PNG with transparency
3. **Safe Area:** Keep important content in center 80%
4. **Background:** Transparent or solid color
5. **Text:** Should be readable at small sizes

---

## 🎨 Recommended Icon Design

### Option 1: Logo Only
```
┌─────────────────┐
│                 │
│   [NexEagle]    │  ← Your logo.png
│     Logo        │     (Eagle design)
│                 │
└─────────────────┘
```

**Pros:**
- Clean, professional
- Recognizable brand
- Works at all sizes

---

### Option 2: Logo + 1RAD Text
```
┌─────────────────┐
│   [NexEagle]    │  ← Logo at top
│     Logo        │
│                 │
│      1RAD       │  ← Text at bottom
└─────────────────┘
```

**Pros:**
- Shows both brands
- Clear app identity
- Informative

---

### Option 3: 1RAD Text Only (Current)
```
┌─────────────────┐
│                 │
│      1RAD       │  ← Large text
│   [Cyan Glow]   │     With effects
│                 │
└─────────────────┘
```

**Pros:**
- Simple, direct
- Easy to read
- Minimal design

---

## 🛠️ How to Create Your Icon

### Method 1: Using Figma (Recommended)

1. **Create New File:**
   - Size: 1024x1024 px
   - Background: Dark blue (#0b1120) or transparent

2. **Add Logo:**
   - Import your logo.png
   - Center it
   - Scale to fit (leave 10% margin)

3. **Add 1RAD Text (Optional):**
   - Font: Bold, 900 weight
   - Size: ~200px
   - Color: White with cyan accent
   - Position: Below logo or centered

4. **Export:**
   - Format: PNG
   - Size: 1024x1024
   - Name: logo.png
   - Save to: `1RadMobile/assets/`

---

### Method 2: Using Photoshop

1. **New Document:**
   - Width: 1024px
   - Height: 1024px
   - Resolution: 72 DPI
   - Color Mode: RGB
   - Background: Transparent or #0b1120

2. **Add Logo:**
   - Place your logo
   - Center align
   - Scale proportionally

3. **Add Text Layer:**
   - Text: "1RAD"
   - Font: Bold
   - Size: 200px
   - Color: #FFFFFF (white)
   - Effect: Outer glow (cyan)

4. **Export:**
   - File → Export → Export As
   - Format: PNG
   - Size: 1024x1024
   - Save as: logo.png

---

### Method 3: Using Online Tools

**Recommended Tools:**
- **Canva:** https://www.canva.com/
- **Figma:** https://www.figma.com/
- **Adobe Express:** https://www.adobe.com/express/

**Steps:**
1. Create 1024x1024 canvas
2. Add your logo
3. Add "1RAD" text
4. Download as PNG
5. Replace `assets/logo.png`

---

## 📱 Android Adaptive Icon

### What is Adaptive Icon?

Android uses a two-layer system:
- **Foreground:** Your logo (logo.png)
- **Background:** Solid color (#0b1120)

### How It Looks:

```
Different Shapes on Different Devices:

Circle:     Square:     Rounded:    Squircle:
  ●●●         ████        ▄▄▄▄        ╭───╮
 ●●●●●        ████        ████        │   │
●●●●●●●       ████        ████        │   │
 ●●●●●        ████        ▀▀▀▀        ╰───╯
  ●●●
```

### Safe Zone:

Keep your logo in the center 66% of the canvas:
```
┌─────────────────┐
│ ┌─────────────┐ │ ← 10% margin
│ │             │ │
│ │   [LOGO]    │ │ ← Safe zone
│ │             │ │
│ └─────────────┘ │
└─────────────────┘
```

---

## 🎨 Color Scheme

### Current Configuration:

| Element | Color | Hex Code |
|---------|-------|----------|
| Background | Dark Blue | #0b1120 |
| Logo | (Your design) | - |
| Text (1RAD) | White | #FFFFFF |
| Accent | Cyan | #00F2FE |

---

## ✅ Icon Checklist

Before building the APK, ensure:

- [ ] logo.png is 1024x1024 pixels
- [ ] Logo is centered with proper margins
- [ ] Text is readable at small sizes (48x48)
- [ ] Background color matches app theme
- [ ] PNG has transparency (if needed)
- [ ] File size is reasonable (<500KB)
- [ ] Icon looks good on dark/light backgrounds
- [ ] Tested on different Android shapes

---

## 🧪 Testing Your Icon

### Preview at Different Sizes:

```bash
# Install ImageMagick (if not installed)
# Then resize to test:

convert logo.png -resize 48x48 logo-48.png
convert logo.png -resize 72x72 logo-72.png
convert logo.png -resize 96x96 logo-96.png
convert logo.png -resize 144x144 logo-144.png
```

### Check Readability:
- Open each size
- Verify logo is clear
- Verify text is readable
- Check colors are visible

---

## 📂 File Structure

```
1RadMobile/
├── assets/
│   ├── logo.png          ← Main app icon (1024x1024)
│   ├── icon.png          ← iOS icon (backup)
│   ├── adaptive-icon.png ← Android adaptive (backup)
│   ├── splash-icon.png   ← Splash screen (backup)
│   └── favicon.png       ← Web favicon
└── app.json              ← Configuration file
```

---

## 🚀 After Creating Icon

### Step 1: Replace File
```bash
# Save your new icon as:
1RadMobile/assets/logo.png
```

### Step 2: Verify Configuration
```bash
# Check app.json has:
"icon": "./assets/logo.png"
"adaptiveIcon": {
  "foregroundImage": "./assets/logo.png",
  "backgroundColor": "#0b1120"
}
```

### Step 3: Build APK
```bash
cd 1RadMobile
eas build --platform android --profile production
```

### Step 4: Test on Device
- Install APK
- Check home screen icon
- Verify app name shows "1RAD"
- Test on different launchers

---

## 🎯 Design Tips

### Do's:
✅ Keep it simple and recognizable
✅ Use high contrast colors
✅ Make it scalable
✅ Test at small sizes
✅ Use vector graphics if possible
✅ Keep important elements centered

### Don'ts:
❌ Don't use too much detail
❌ Don't use thin lines
❌ Don't use small text
❌ Don't use gradients (if possible)
❌ Don't use photos
❌ Don't fill entire canvas

---

## 📱 How It Will Appear

### On Android Home Screen:
```
┌─────┐  ┌─────┐  ┌─────┐
│     │  │     │  │     │
│ 📱  │  │ 🎵  │  │[LOGO]│ ← Your icon
│     │  │     │  │     │
└─────┘  └─────┘  └─────┘
 Phone    Music     1RAD  ← App name
```

### In App Drawer:
```
┌──────────────────────┐
│  [LOGO]  1RAD        │ ← Your app
│  [📱]    Phone       │
│  [🎵]    Music       │
│  [📧]    Email       │
└──────────────────────┘
```

### In Recent Apps:
```
┌─────────────────┐
│   [LOGO]        │ ← Icon
│                 │
│   1RAD          │ ← Name
│                 │
│   [App Screen]  │
└─────────────────┘
```

---

## 🔧 Quick Icon Generator

If you need a quick icon, use this template:

### Text-Based Icon (No Design Skills Needed):

1. **Go to:** https://www.canva.com/
2. **Create:** 1024x1024 design
3. **Background:** Dark blue (#0b1120)
4. **Add Text:** "1RAD"
   - Font: Impact or Arial Black
   - Size: 200px
   - Color: White
   - Effect: Glow (cyan)
5. **Download:** PNG
6. **Save as:** logo.png

---

## 📊 Icon Sizes Generated by EAS

When you build with EAS, it automatically generates:

### Android:
- mdpi: 48x48
- hdpi: 72x72
- xhdpi: 96x96
- xxhdpi: 144x144
- xxxhdpi: 192x192

### iOS:
- 20x20 to 1024x1024 (all required sizes)

**You only need to provide:** 1024x1024 PNG

---

## 🎨 Example Icon Designs

### Design 1: Minimal
```
┌─────────────┐
│             │
│    1RAD     │  ← Large text
│             │     Simple
└─────────────┘
```

### Design 2: Logo + Text
```
┌─────────────┐
│   [Eagle]   │  ← Logo top
│             │
│    1RAD     │  ← Text bottom
└─────────────┘
```

### Design 3: Badge Style
```
┌─────────────┐
│  ┌───────┐  │
│  │ 1RAD  │  │  ← Badge/shield
│  └───────┘  │     shape
└─────────────┘
```

---

## 🆘 Troubleshooting

### Issue 1: Icon looks blurry
**Solution:** Ensure logo.png is exactly 1024x1024 pixels

### Issue 2: Icon is cut off
**Solution:** Add more margin (10-15% on all sides)

### Issue 3: Text not readable
**Solution:** Increase font size or use bolder font

### Issue 4: Wrong colors
**Solution:** Check color mode is RGB, not CMYK

---

## 📞 Need Help?

### Resources:
- **Icon Generator:** https://icon.kitchen/
- **Figma Templates:** https://www.figma.com/community
- **Canva:** https://www.canva.com/

### Quick Fix:
If you don't have a custom icon ready, the current logo.png will be used. Make sure it's:
- 1024x1024 pixels
- PNG format
- Looks good at small sizes

---

## ✅ Final Checklist

Before building:

- [x] logo.png exists in assets folder
- [x] app.json configured correctly
- [x] App name set to "1RAD"
- [x] Background color set to #0b1120
- [ ] Icon tested at small sizes
- [ ] Icon looks professional
- [ ] Ready to build APK

---

**Current Status:** ✅ Configured  
**Next Step:** Build APK with `eas build --platform android --profile production`

