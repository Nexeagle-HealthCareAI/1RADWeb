# Quick Test Instructions - Slice Navigation Fix

## What Was Fixed
1. **Removed conflicting wheel handler** - Was blocking Cornerstone's StackScroll tool
2. **Added auto-focus** - Keyboard navigation now works automatically
3. **Enhanced event cleanup** - Proper cleanup when switching series
4. **Added debug logging** - Detailed console output for troubleshooting
5. **Exposed debug variables** - Can test navigation manually in console

## Quick Test (2 minutes)

### Test 1: Mouse Wheel Navigation
1. Open the DICOM viewer with any study
2. **Scroll mouse wheel** up and down
3. ✅ **Expected**: Slices change smoothly
4. ❌ **If not working**: Open console (F12) and look for errors

### Test 2: Keyboard Navigation  
1. Click anywhere on the DICOM image
2. **Press Arrow Down** key
3. ✅ **Expected**: Next slice appears
4. **Press Arrow Up** key
5. ✅ **Expected**: Previous slice appears

### Test 3: Button Navigation
1. Look for the vertical slider on the right side
2. Find the **▲ and ▼ buttons** near the slider
3. **Click ▼ button**
4. ✅ **Expected**: Next slice appears
5. **Click ▲ button**
6. ✅ **Expected**: Previous slice appears

### Test 4: Series Switching (Multi-Series Studies)
1. Load a study with **8+ series** (like the ACQUISITION_SERIES study)
2. Click **"Full View"** button
3. Verify you see **"SERIES 1/8"** in the header
4. **Test wheel/keyboard/buttons** - should work
5. Click **▶ (Next Series)** button
6. Verify it shows **"SERIES 2/8"** and slice counter resets to **"1 / X"**
7. **Test wheel/keyboard/buttons again** - should still work
8. ✅ **Expected**: Navigation works in all series

## Console Commands for Manual Testing

If navigation doesn't work, open browser console (F12) and try:

### Check if viewport is ready:
```javascript
console.log('Viewport:', window.cornerstoneViewport);
console.log('Stack data:', window.cornerstoneViewport?.getStackData());
```

### Manually change slice:
```javascript
// Change to slice 5
window.cornerstoneViewport?.setImageIdIndex(5);
window.cornerstoneViewport?.render();
```

### Check tool status:
```javascript
console.log('Tool group:', window.cornerstoneToolGroup);
console.log('Active tool:', window.cornerstoneToolGroup?.getActivePrimaryMouseButtonTool());
```

### Force focus on viewer:
```javascript
window.cornerstoneElementRef?.focus();
console.log('Focused element:', document.activeElement);
```

## What to Look For in Console

### ✅ Success Messages:
```
[DICOM] ✅ StackScroll tool activated successfully with Wheel binding
[DICOM] Element focused for keyboard navigation
[DICOM] STACK_NEW_IMAGE event: {imageIdIndex: X}
[DICOM] Slice changed via event: X/Y
```

### ❌ Error Messages:
```
[DICOM] ❌ Failed to activate StackScroll tool
[DICOM] ❌ Slider slice navigation failed
[DICOM] ⚠️ Viewport not available for slice navigation
```

## If Still Not Working

### Quick Fixes to Try:
1. **Refresh the page** (F5) - Sometimes state gets stuck
2. **Click on the image** - Ensures element has focus
3. **Try different navigation method** - If wheel doesn't work, try buttons
4. **Check console for errors** - Red error messages indicate the problem

### Report These Details:
1. Which navigation method doesn't work? (wheel/keyboard/buttons/slider)
2. Does it work on the first series but not after switching?
3. Any error messages in console?
4. What does `window.cornerstoneViewport?.getStackData()` show?

## Expected Console Output (Working)

When you scroll the mouse wheel, you should see:
```
[DICOM] Wheel event detected: {deltaY: 100, ctrlKey: false, shiftKey: false, currentIndex: 0, totalFiles: 150}
[DICOM] STACK_NEW_IMAGE event: {imageIdIndex: 1, ...}
[DICOM] Slice changed via event: 2/150
```

When you press Arrow Down, you should see:
```
[DICOM] Keyboard slice navigation (ArrowDown): 2/150
```

When you click Next button, you should see:
```
[DICOM] Next button clicked: 2/150
[DICOM] ✅ Next slice navigation successful
```

## Files Modified
- `src/components/AdvancedDicomViewer.jsx` - Main viewer component
- `src/pages/DicomViewerPage.jsx` - Full view page with series selector

## Rollback if Needed
If this breaks something, the main change to revert is:
- Uncomment the manual wheel handler (lines 476-512 in AdvancedDicomViewer.jsx)
- Remove the auto-focus code (lines 460-465)
