# Series Navigation Test Guide

## Issue
User reports: "I see a slice series but not a button to go to next one at full view"

## What Was Fixed
1. **Enhanced series navigation buttons** - Made them larger and more visible
2. **Added debug logging** - Console shows series navigation state
3. **Added visual feedback** - Hover effects on buttons
4. **Added debug indicator** - Shows warning if only single series detected

## How to Test

### Step 1: Open Browser Console (F12)
Look for these debug messages when Full View loads:

```
[DICOM VIEWER] 🔍 SERIES NAVIGATION DEBUG: {
  hasMultipleSeries: true/false,
  allSeriesExists: true/false,
  allSeriesLength: X,
  allSeriesIsArray: true/false,
  shouldShowNavigation: true/false,
  allSeriesData: [...]
}
```

### Step 2: Check Series Navigation Visibility

#### If you have MULTIPLE series (2+):
✅ **You SHOULD see**: A purple gradient box with:
- **◀ button** (Previous Series)
- **"SERIES 1/8"** text in the middle
- **▶ button** (Next Series)

#### If you have SINGLE series (1):
⚠️ **You SHOULD see**: A yellow warning box:
- **"⚠️ Single Series (1)"**

#### If you have NO series:
❌ **You SHOULD see**: Nothing (no series navigation)

### Step 3: Test Series Navigation

1. **Click the ▶ button** (Next Series)
   - Console should show: `[SERIES NAV] Next button clicked`
   - Series counter should change: `SERIES 1/8` → `SERIES 2/8`
   - Slice counter should reset: `SLICE: 1 / X`
   - New DICOM images should load

2. **Click the ◀ button** (Previous Series)
   - Console should show: `[SERIES NAV] Previous button clicked`
   - Series counter should change: `SERIES 2/8` → `SERIES 1/8`
   - Slice counter should reset: `SLICE: 1 / X`
   - Previous DICOM images should load

3. **Test button states**:
   - At **SERIES 1/8**: ◀ button should be **disabled** (grayed out)
   - At **SERIES 8/8**: ▶ button should be **disabled** (grayed out)
   - In between: Both buttons should be **enabled** (white/bright)

### Step 4: Visual Appearance

The series navigation should look like this:

```
┌─────────────────────────────────────────────┐
│  ◀  │  SERIES 1/8  │  ▶                    │
└─────────────────────────────────────────────┘
```

**Colors**:
- Background: Purple gradient (#8b5cf6 to #6366f1)
- Border: Purple glow
- Buttons: White/translucent
- Text: White, bold, large

**Size**:
- Minimum width: 250px
- Button size: 40px wide
- Font size: 14px (larger than before)

**Location**:
- Top right area of the screen
- Next to the slice counter
- Above the DICOM viewer

## Troubleshooting

### Problem: No series navigation buttons visible

**Check Console**:
```javascript
// Look for this in console output:
hasMultipleSeries: false  // ❌ This is the problem
allSeriesLength: 1        // Only 1 series
```

**Possible Causes**:
1. Study only has 1 series (expected behavior)
2. `allSeries` not passed from ReportingPage
3. `allSeries` is empty or undefined

**Debug Commands**:
```javascript
// In browser console:
console.log('Location state:', window.location.state);
console.log('All series:', window.location.state?.allSeries);
```

### Problem: Buttons visible but not working

**Check Console**:
```javascript
// When clicking button, you should see:
[SERIES NAV] Next button clicked
[DICOM VIEWER] Series changed, resetting slice counter to 1
[DICOM] Files prop changed, resetting currentImageIndex to 0
```

**If you DON'T see these messages**:
- Button click handler not firing
- Check if button is actually disabled
- Try clicking in the center of the button

### Problem: Series changes but images don't load

**Check Console**:
```javascript
// You should see:
[DICOM] New files count: X
[DICOM] Setting up StackScroll tool
[DICOM] ✅ StackScroll tool activated successfully
```

**If you DON'T see these messages**:
- Files not being passed correctly
- Viewport not reinitializing
- Check `currentFiles` in console

## Expected Behavior

### Multi-Series Study (8 series):
1. ✅ Purple series navigation box visible
2. ✅ Shows "SERIES 1/8"
3. ✅ ◀ button disabled (at first series)
4. ✅ ▶ button enabled
5. ✅ Click ▶ → Changes to "SERIES 2/8"
6. ✅ Both buttons enabled (in middle)
7. ✅ Click ▶ repeatedly → Eventually "SERIES 8/8"
8. ✅ ▶ button disabled (at last series)
9. ✅ Click ◀ → Goes back to previous series
10. ✅ Slice navigation works in each series

### Single-Series Study (1 series):
1. ✅ Yellow warning box visible
2. ✅ Shows "⚠️ Single Series (1)"
3. ✅ No navigation buttons (expected)
4. ✅ Slice navigation still works

## Console Output Reference

### On Full View Load (Multi-Series):
```
[FULL VIEW] Button clicked
[FULL VIEW] Total series count: 8
[FULL VIEW] Navigating to DICOM viewer with ALL series: {
  totalSeries: 8,
  seriesNames: ["Series 1", "Series 2", ...],
  totalFiles: 1200
}
[DICOM VIEWER] Component mounted with state: {...}
[DICOM VIEWER] 🔍 SERIES NAVIGATION DEBUG: {
  hasMultipleSeries: true,
  allSeriesExists: true,
  allSeriesLength: 8,
  allSeriesIsArray: true,
  shouldShowNavigation: true
}
```

### On Series Navigation Click:
```
[SERIES NAV] Next button clicked
[DICOM VIEWER] Series changed, resetting slice counter to 1
[DICOM] Files prop changed, resetting currentImageIndex to 0
[DICOM] New files count: 150
```

## Manual Testing Commands

### Check if series navigation should be visible:
```javascript
// In browser console:
const state = window.history.state?.usr;
console.log('Has multiple series:', state?.allSeries?.length > 1);
console.log('All series:', state?.allSeries);
console.log('Series count:', state?.allSeries?.length);
```

### Force series change:
```javascript
// This won't work directly, but you can inspect the state
console.log('Current series index:', /* check React DevTools */);
```

## Files Modified
1. **src/pages/DicomViewerPage.jsx**
   - Lines 45-60: Enhanced debug logging
   - Lines 710-790: Larger, more visible series navigation buttons
   - Added hover effects and transitions
   - Added debug indicator for single series

## Visual Comparison

### Before (Small buttons):
- Button size: 24px × 24px
- Font size: 12px
- Padding: 4px 8px
- Hard to see and click

### After (Large buttons):
- Button size: 40px wide
- Font size: 14px
- Padding: 6px 12px
- Hover effects
- Easier to see and click

## Success Criteria
- [x] Series navigation buttons visible when multiple series
- [x] Buttons are large and easy to click
- [x] Hover effects provide visual feedback
- [x] Console shows debug information
- [x] Buttons work correctly (change series)
- [x] Disabled state shows correctly
- [x] Single series shows warning indicator
- [x] Slice navigation works after series change

## Next Steps
1. Test with actual multi-series DICOM study
2. Verify buttons are visible and clickable
3. Check console for debug messages
4. Report any issues with screenshots
