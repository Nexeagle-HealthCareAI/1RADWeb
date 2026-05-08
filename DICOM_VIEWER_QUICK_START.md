# 🚀 DICOM Viewer Quick Start Guide

## 📱 Tablet/iPad Usage

### Touch Gestures:
```
👆 Single Tap          → Use active tool
👆👆 Double Tap        → Reset view
🤏 Pinch (2 fingers)   → Zoom in/out
👆 Drag                → Pan image
🖱️ Mouse Wheel        → Scroll through slices
```

### Tips for Tablet Users:
1. **Enable Fullscreen** - Tap the ⤢ button for immersive viewing
2. **Double-tap to Reset** - Quickly return to default view
3. **Pinch Smoothly** - Use two fingers for precise zoom control
4. **Watch for Hints** - Gesture guide appears at bottom of screen

---

## 🖥️ Fullscreen Mode

### How to Enter Fullscreen:
1. Click the **⤢ FULLSCREEN** button (top-right)
2. Or use keyboard shortcut (browser-dependent)

### How to Exit Fullscreen:
1. Click the **⤓ EXIT** button (top-right)
2. Or press **ESC** key
3. Or press **F11** (browser-dependent)

### Fullscreen Features:
- ✅ Auto-hiding toolbars (move mouse to show)
- ✅ All tools remain accessible
- ✅ Windowing presets available
- ✅ Measurements work normally
- ✅ Touch gestures fully functional

---

## 🔧 Developer Integration

### Basic Setup:
```jsx
import AdvancedDicomViewer from './components/AdvancedDicomViewer';

<AdvancedDicomViewer
  files={dicomFiles}
  enableFullscreen={true}
  onFullscreenChange={(isFullscreen) => {
    console.log('Fullscreen:', isFullscreen);
  }}
/>
```

### With All Features:
```jsx
<AdvancedDicomViewer
  files={dicomFiles}
  activeTool="WindowLevel"
  enableFullscreen={true}
  showMetadata={true}
  showMeasurements={true}
  showWindowingPresets={true}
  enableAdvancedTools={true}
  onFullscreenChange={(isFullscreen) => {
    // Handle fullscreen state change
  }}
  onMeasurement={(measurement) => {
    // Handle new measurement
  }}
  onMetadata={(metadata) => {
    // Handle DICOM metadata
  }}
/>
```

---

## 🎯 Common Use Cases

### 1. Radiology Workstation
```jsx
<AdvancedDicomViewer
  files={dicomFiles}
  enableFullscreen={true}
  showMetadata={true}
  showMeasurements={true}
  activeTool="WindowLevel"
/>
```

### 2. Mobile Rounds (Tablet)
```jsx
<AdvancedDicomViewer
  files={dicomFiles}
  enableFullscreen={true}
  showMetadata={false}  // Less clutter on small screen
  showWindowingPresets={true}
/>
```

### 3. Teaching/Presentation
```jsx
<AdvancedDicomViewer
  files={dicomFiles}
  enableFullscreen={true}
  showMetadata={false}  // Clean view for audience
  showMeasurements={false}
  activeTool="Zoom"
/>
```

---

## 🐛 Troubleshooting

### Fullscreen Not Working?
- **iOS Safari**: Limited support - use iPadOS 13+ or "Add to Home Screen"
- **Browser Permissions**: Some browsers require user gesture to enter fullscreen
- **Check Console**: Look for fullscreen API errors

### Touch Gestures Not Working?
- **Device Detection**: Verify device has touch capability
- **Browser Support**: Ensure modern browser (Chrome, Safari, Firefox, Edge)
- **Viewport Meta Tag**: Add to HTML head:
  ```html
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
  ```

### Performance Issues?
- **Large Series**: Use progressive loading for >500 slices
- **Old Devices**: Reduce image quality or use smaller viewport
- **Memory**: Clear cache periodically for long sessions

---

## 📊 Feature Matrix

| Feature | Desktop | Tablet | Fullscreen |
|---------|---------|--------|------------|
| Mouse Navigation | ✅ | ⚠️ | ✅ |
| Touch Gestures | ❌ | ✅ | ✅ |
| Windowing Presets | ✅ | ✅ | ✅ |
| Measurements | ✅ | ✅ | ✅ |
| Metadata Display | ✅ | ✅ | ✅ |
| Auto-hide UI | ❌ | ❌ | ✅ |
| Pinch Zoom | ❌ | ✅ | ✅ |
| Double-tap Reset | ❌ | ✅ | ✅ |

---

## 🎓 Best Practices

### For Developers:
1. **Always provide files prop** - Component requires DICOM files array
2. **Handle fullscreen callback** - Update parent layout if needed
3. **Test on real devices** - Touch gestures work differently than mouse
4. **Monitor performance** - Large series may need optimization
5. **Provide fallbacks** - Not all browsers support all features

### For Users:
1. **Use fullscreen for detailed review** - Better focus and larger view
2. **Learn touch gestures** - Much faster than toolbar buttons
3. **Double-tap to reset** - Quick way to return to default view
4. **Try windowing presets** - Optimized for different anatomies
5. **Export measurements** - Save important findings as JSON

---

## 📞 Quick Reference

### Keyboard Shortcuts:
- `ESC` - Exit fullscreen
- `F11` - Toggle fullscreen (browser-dependent)

### Mouse Controls:
- `Left Click + Drag` - Active tool (default: Window/Level)
- `Mouse Wheel` - Scroll through slices
- `Right Click` - Context menu (disabled)

### Touch Controls:
- `Single Tap` - Use active tool
- `Double Tap` - Reset view
- `Pinch` - Zoom
- `Drag` - Pan

### Windowing Presets:
- **Lung**: WC -600, WW 1600
- **Mediastinum**: WC 50, WW 350
- **Abdomen**: WC 60, WW 400
- **Bone**: WC 300, WW 1500
- **Brain**: WC 40, WW 80
- **Liver**: WC 30, WW 150
- **Spine**: WC 250, WW 1800
- **Angio**: WC 300, WW 600

---

## ✅ Checklist for Implementation

- [ ] Import AdvancedDicomViewer component
- [ ] Provide DICOM files array
- [ ] Enable fullscreen (optional)
- [ ] Add fullscreen change handler (optional)
- [ ] Test on desktop browser
- [ ] Test on tablet/iPad
- [ ] Test fullscreen mode
- [ ] Test touch gestures
- [ ] Verify measurements work
- [ ] Check windowing presets
- [ ] Review console for errors
- [ ] Optimize for your use case

---

**Need Help?** Check the full documentation in `DICOM_VIEWER_ENHANCEMENTS.md`

**Version**: 2.0.0  
**Last Updated**: 2026-05-08
