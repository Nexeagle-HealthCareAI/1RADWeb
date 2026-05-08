# 🎨 DICOM Viewer Visual Guide

## 📐 Layout Overview

### Normal Mode (Desktop)
```
┌─────────────────────────────────────────────────────────────┐
│ [Windowing Presets]                    [Metadata] [⤢ Full] │
│  Lung | Med | Abd | Bone | Brain...    Patient Info         │
│                                                               │
│                                                               │
│                    ┌─────────────────┐                       │
│                    │                 │                       │
│                    │   DICOM Image   │                       │
│                    │                 │                       │
│                    │    Viewport     │                       │
│                    │                 │                       │
│                    └─────────────────┘                       │
│                                                               │
│  [Measurements]                              [Slice: 1/50]   │
│  📏 Length: 45mm                                   │          │
│  ∠ Angle: 32°                                      │          │
│                                                    ▼          │
│  [☆ Key Image]                                               │
└─────────────────────────────────────────────────────────────┘
```

### Fullscreen Mode
```
┌─────────────────────────────────────────────────────────────┐
│                                                         [⤓]   │
│                                                               │
│                                                               │
│                                                               │
│                    ┌─────────────────┐                       │
│                    │                 │                       │
│                    │                 │                       │
│                    │   DICOM Image   │                       │
│                    │   (Maximized)   │                       │
│                    │                 │                       │
│                    │                 │                       │
│                    └─────────────────┘                       │
│                                                               │
│                                                               │
│                                              [Slice: 1/50]   │
│                                                    │          │
│  (Toolbars auto-hide after 3s)                    ▼          │
│  (Move mouse to show)                                        │
└─────────────────────────────────────────────────────────────┘
```

### Tablet Mode
```
┌───────────────────────────────────────┐
│ [Presets]          [Info] [⤢]         │
│  Lung  Med  Abd                       │
│  Bone  Brain                          │
│                                       │
│        ┌─────────────────┐            │
│        │                 │            │
│        │   DICOM Image   │            │
│        │                 │            │
│        │   (Touch Area)  │            │
│        │                 │            │
│        └─────────────────┘            │
│                                       │
│  👆 Double-tap • 🤏 Pinch • 👆 Swipe │
│                                       │
│  [Measurements]      [Slice: 1/50]   │
└───────────────────────────────────────┘
```

---

## 🎯 UI Elements

### Fullscreen Button States

**Normal Mode:**
```
┌──────────────┐
│ ⤢ FULLSCREEN │  ← Click to enter fullscreen
└──────────────┘
```

**Fullscreen Mode:**
```
┌──────────┐
│ ⤓ EXIT   │  ← Click to exit fullscreen
└──────────┘
```

**Tablet Mode:**
```
┌─────┐
│  ⤢  │  ← Larger touch target
└─────┘
```

---

## 📱 Touch Gesture Indicators

### Gesture Hint Overlay (Tablet)
```
┌─────────────────────────────────────────────────────────┐
│                                                         │
│                    [DICOM Image]                        │
│                                                         │
│  ┌───────────────────────────────────────────────────┐ │
│  │ 👆 Double-tap: Reset • 🤏 Pinch: Zoom • 👆 Swipe │ │
│  └───────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

### Touch Gestures Visual

**Single Tap:**
```
    👆
    │
    ▼
[Viewport]
```
*Action: Use active tool*

**Double Tap:**
```
  👆 👆
  │  │
  ▼  ▼
[Viewport]
```
*Action: Reset view*

**Pinch Zoom:**
```
  👆    👆
   \  /
    \/
[Viewport]
    /\
   /  \
  👆    👆
```
*Action: Zoom in/out*

**Drag/Pan:**
```
    👆
    │→→→
    ▼
[Viewport]
```
*Action: Pan image*

---

## 🎨 Windowing Presets Bar

### Desktop Layout:
```
┌────────────────────────────────────────────────────────┐
│ [Default] [Lung] [Med] [Abd] [Bone] [Brain] [Liver]  │
│ [Spine] [Angio] [Pediatric]                           │
└────────────────────────────────────────────────────────┘
```

### Tablet Layout (Wrapped):
```
┌──────────────────────────────┐
│ [Default] [Lung] [Med] [Abd] │
│ [Bone] [Brain] [Liver]       │
│ [Spine] [Angio] [Pediatric]  │
└──────────────────────────────┘
```

### Active Preset:
```
┌────────────────────────────────────────────────────────┐
│ [Default] [Lung] [Med] [Abd] [Bone] [Brain] [Liver]  │
│           ^^^^^^                                       │
│           Active (Blue highlight)                      │
└────────────────────────────────────────────────────────┘
```

---

## 📊 Metadata Overlay

### Collapsed State:
```
┌─────────────────────┐
│ PATIENT INFO  [MORE]│
│ Name: John Doe      │
│ ID: 12345           │
│ Modality: CT        │
│ Image: 1 / 50       │
└─────────────────────┘
```

### Expanded State:
```
┌─────────────────────┐
│ PATIENT INFO  [HIDE]│
│ Name: John Doe      │
│ ID: 12345           │
│ Modality: CT        │
│ Image: 1 / 50       │
│ ─────────────────── │
│ Study: 2026-05-08   │
│ Series: Chest CT    │
│ Matrix: 512 × 512   │
│ Thickness: 5.0 mm   │
│ Spacing: 0.5 mm     │
│ W/L: 400/40         │
└─────────────────────┘
```

---

## 📏 Measurements Panel

### Collapsed:
```
┌──────────────────────────┐
│ MEASUREMENTS (3) [▶][💾][🗑️]│
└──────────────────────────┘
```

### Expanded:
```
┌──────────────────────────────────┐
│ MEASUREMENTS (3) [▼][💾][🗑️]     │
│ ──────────────────────────────── │
│ LengthTool              [✕]      │
│ 📏 Length: 45.23 mm              │
│ 10:23:45 AM                      │
│ ──────────────────────────────── │
│ AngleTool               [✕]      │
│ ∠ Angle: 32.5°                   │
│ 10:24:12 AM                      │
│ ──────────────────────────────── │
│ EllipticalROITool       [✕]      │
│ ⬜ Area: 234.56 mm²              │
│ 📊 Mean: 45.2 HU                 │
│ σ StdDev: 12.3                   │
│ 10:25:03 AM                      │
│ ──────────────────────────────── │
│ Showing last 10 of 3             │
└──────────────────────────────────┘
```

---

## 🎚️ Slice Navigator

### Vertical Slider (Right Side):
```
        │
        │
        ●  ← Current slice indicator
        │
        │
        │
        │
        │
        │
        │
        │
        │
        
   [1 / 50]  ← Slice counter
```

---

## 🔘 Button States

### Normal Button:
```
┌──────────┐
│  Button  │
└──────────┘
```

### Hover State:
```
┌──────────┐
│  Button  │  ← Lighter background
└──────────┘
```

### Active State:
```
┌──────────┐
│  Button  │  ← Blue background
└──────────┘
```

### Disabled State:
```
┌──────────┐
│  Button  │  ← Gray, no cursor
└──────────┘
```

---

## 🎭 Auto-Hide Behavior (Fullscreen)

### Visible (User Active):
```
┌─────────────────────────────────────────────────────────────┐
│ [Presets]                              [Metadata] [⤓ Exit]  │
│                                                               │
│                    [DICOM Image]                             │
│                                                               │
│  [Measurements]                              [Slice: 1/50]   │
└─────────────────────────────────────────────────────────────┘
```

### Hidden (Idle 3+ seconds):
```
┌─────────────────────────────────────────────────────────────┐
│                                                         [⤓]   │
│                                                               │
│                                                               │
│                    [DICOM Image]                             │
│                                                               │
│                                                               │
│                                              [Slice: 1/50]   │
└─────────────────────────────────────────────────────────────┘
```

---

## 🎨 Color Scheme

### Primary Colors:
```
Background:     #000000 (Black)
Primary Blue:   #0f52ba (Medical Blue)
Light Blue:     #3b82f6 (Accent)
Success Green:  #10b981 (Measurements)
Warning Yellow: #fbbf24 (Key Images)
Error Red:      #ef4444 (Errors)
```

### UI Elements:
```
Overlay BG:     rgba(15, 23, 42, 0.9)
Border:         rgba(255, 255, 255, 0.1)
Text Primary:   #ffffff (White)
Text Secondary: #94a3b8 (Gray)
Text Tertiary:  #64748b (Dark Gray)
```

---

## 📐 Responsive Breakpoints

### Desktop (>1366px):
- Compact controls
- Mouse-optimized
- All features visible
- Horizontal layout

### Tablet (768px - 1366px):
- Larger touch targets
- Wrapped toolbars
- Touch gestures enabled
- Gesture hints visible

### Mobile (<768px):
- Not primary target
- Basic functionality
- Simplified UI
- Portrait orientation

---

## 🎯 Interactive States

### Loading State:
```
┌─────────────────────────────────────┐
│                                     │
│           ⚙️ Loading...             │
│     PARSING_DIAGNOSTIC_DATA         │
│                                     │
└─────────────────────────────────────┘
```

### Error State:
```
┌─────────────────────────────────────┐
│                                     │
│              ⚠️                     │
│         Engine Error                │
│   DICOM PARSE ERROR: Invalid file  │
│                                     │
└─────────────────────────────────────┘
```

### Ready State:
```
┌─────────────────────────────────────┐
│ [Controls]              [Metadata]  │
│                                     │
│        [DICOM Image Rendered]       │
│                                     │
│ [Tools]                  [Slider]   │
└─────────────────────────────────────┘
```

---

## 🔄 State Transitions

### Normal → Fullscreen:
```
[Normal Mode]
     │
     │ Click ⤢ button
     ▼
[Transition: 300ms]
     │
     ▼
[Fullscreen Mode]
     │
     │ Auto-hide toolbars (3s)
     ▼
[Fullscreen (Clean)]
```

### Fullscreen → Normal:
```
[Fullscreen Mode]
     │
     │ Click ⤓ button or ESC
     ▼
[Transition: 300ms]
     │
     ▼
[Normal Mode]
```

### Idle → Active (Fullscreen):
```
[Toolbars Hidden]
     │
     │ Mouse move or touch
     ▼
[Fade In: 300ms]
     │
     ▼
[Toolbars Visible]
     │
     │ Idle 3 seconds
     ▼
[Fade Out: 300ms]
     │
     ▼
[Toolbars Hidden]
```

---

## 📱 Device-Specific Layouts

### iPad Pro (12.9"):
```
┌─────────────────────────────────────────────────────┐
│ [Presets: Wrapped]              [Metadata] [⤢]     │
│                                                     │
│              [Large DICOM Viewport]                 │
│                                                     │
│ [Measurements]                      [Slice: 1/50]  │
│ 👆 Double-tap: Reset • 🤏 Pinch: Zoom • 👆 Swipe  │
└─────────────────────────────────────────────────────┘
```

### iPad Mini (8.3"):
```
┌───────────────────────────────────┐
│ [Presets]      [Info] [⤢]         │
│                                   │
│     [Medium DICOM Viewport]       │
│                                   │
│ [Measurements]    [Slice: 1/50]   │
│ 👆 Double-tap • 🤏 Pinch          │
└───────────────────────────────────┘
```

### Desktop (1920x1080):
```
┌─────────────────────────────────────────────────────────────┐
│ [All Presets Horizontal]                [Metadata] [⤢ Full] │
│                                                               │
│                  [Large DICOM Viewport]                       │
│                                                               │
│ [Measurements Panel]                        [Slice: 1/50]    │
└─────────────────────────────────────────────────────────────┘
```

---

## 🎬 Animation Timings

```
Fullscreen Toggle:    300ms ease-in-out
Toolbar Fade:         300ms ease-in-out
Button Hover:         200ms ease
Preset Selection:     200ms ease
Measurement Add:      150ms ease-out
Slice Change:         100ms linear
Pinch Zoom:           0ms (immediate, 60fps)
```

---

## 🎨 Visual Hierarchy

### Z-Index Layers:
```
Layer 10000: Fullscreen Container
Layer 200:   Fullscreen Button
Layer 100:   Overlays (Metadata, Measurements, Presets)
Layer 10:    Key Image Button, Sync Indicator
Layer 5:     Canvas Container
Layer 1:     Background
```

---

## 📊 Component Tree

```
AdvancedDicomViewer
├── Fullscreen Container (ref: fullscreenContainerRef)
│   └── Main Container (ref: containerRef)
│       ├── Loading Overlay
│       ├── Fullscreen Button
│       ├── Tablet Gesture Hint
│       ├── Windowing Presets Toolbar
│       ├── Metadata Overlay
│       │   ├── Patient Info
│       │   └── Extended DICOM Tags (toggleable)
│       ├── Pixel Probe Display
│       ├── Image Statistics Panel
│       ├── Measurements Panel
│       │   ├── Measurement List
│       │   └── Action Buttons (Export, Clear)
│       ├── Canvas Container (ref: elementRef)
│       │   └── Cornerstone3D Viewport
│       ├── Slice Navigator (Vertical Slider)
│       ├── Sync Indicator
│       └── Key Image Toggle Button
```

---

## 🎯 Touch Target Sizes

### Desktop:
- Buttons: 32px × 24px (min)
- Preset Buttons: 60px × 24px
- Icons: 16px × 16px

### Tablet:
- Buttons: 44px × 44px (min) ✅ Apple HIG
- Preset Buttons: 80px × 36px
- Icons: 20px × 20px

### Fullscreen Button:
- Desktop: 100px × 32px
- Tablet: 44px × 44px (icon only)

---

## 🎨 Typography

### Font Families:
```
Primary:    'Inter', sans-serif
Monospace:  'Courier New', monospace (metadata)
```

### Font Sizes:
```
Desktop:
- Headers:      10px - 12px
- Body:         9px - 10px
- Small:        8px

Tablet:
- Headers:      12px - 14px
- Body:         11px - 12px
- Small:        10px
```

### Font Weights:
```
Normal:     400
Bold:       700
Extra Bold: 800
Black:      900 (headers)
```

---

This visual guide provides a comprehensive overview of the enhanced DICOM viewer's UI/UX design, layout, and interactive elements across different devices and modes.

**Version**: 2.0.0  
**Last Updated**: 2026-05-08
