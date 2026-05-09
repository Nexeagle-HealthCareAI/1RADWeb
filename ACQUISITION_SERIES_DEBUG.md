# ACQUISITION_SERIES (8) Debug Guide

## Your Situation
You see "ACQUISITION_SERIES (8)" which indicates 8 series, but you don't see navigation buttons in Full View.

## Quick Diagnostic Steps

### Step 1: Check Browser Console (F12)
When you click the **FULL VIEW** button, look for these messages:

```
[FULL VIEW] Button clicked
[FULL VIEW] uploadedFiles.length: X  ← Should be 8
[FULL VIEW] Valid series count: X    ← Should be 8
[FULL VIEW] Series 1: {name: "...", rawFilesCount: X}
[FULL VIEW] Series 2: {name: "...", rawFilesCount: X}
...
[FULL VIEW] Series 8: {name: "...", rawFilesCount: X}
```

### Step 2: Check What's Being Passed
Look for this message:
```
[FULL VIEW] 🚀 Navigation state being passed: {
  "allSeriesCount": 8,  ← Should be 8
  "filesCount": X,
  "seriesName": "8 Series Available",
  "activeSeriesIndex": 0
}
```

### Step 3: Check DicomViewerPage
After Full View opens, look for:
```
[DICOM VIEWER] 🔍 SERIES NAVIGATION DEBUG: {
  hasMultipleSeries: true,  ← Should be true
  allSeriesLength: 8,       ← Should be 8
  shouldShowNavigation: true ← Should be true
}
```

## Possible Issues

### Issue 1: Only 1 Series in uploadedFiles
**Symptom**: Console shows `uploadedFiles.length: 1`

**Cause**: All 8 series were combined into a single series object

**Check**:
```
[FULL VIEW] Series 1: {name: "...", rawFilesCount: 1200}
```
If you see ONE series with MANY files (e.g., 1200 files), this means all series were merged.

**Solution**: The ZIP processing needs to keep series separate. Check `DicomPerformanceOptimizer.js`.

### Issue 2: Series Missing rawFiles
**Symptom**: Console shows `Valid series count: 0` or less than 8

**Cause**: Some series don't have `rawFiles` property populated

**Check**:
```
[FULL VIEW] Series 1: {hasRawFiles: false, rawFilesCount: 0}
```

**Solution**: Series need to be hydrated (loaded) before Full View.

### Issue 3: Navigation State Not Passed
**Symptom**: DicomViewerPage shows `allSeriesLength: undefined`

**Cause**: Navigation state lost during routing

**Check**: Look for navigation state in console

**Solution**: Verify React Router is passing state correctly.

## What You Should See

### In ReportingPage (Before Full View):
```
┌─────────────────────────────────────┐
│ S1 │ S2 │ S3 │ S4 │ S5 │ S6 │ S7 │ S8 │  ← Series sidebar
└─────────────────────────────────────┘
```
You should see 8 series buttons (S1-S8) on the left side.

### Console Output (When Clicking Full View):
```
[FULL VIEW] uploadedFiles.length: 8
[FULL VIEW] Valid series count: 8
[FULL VIEW] Series 1: {name: "Patient - Series 1", rawFilesCount: 150}
[FULL VIEW] Series 2: {name: "Patient - Series 2", rawFilesCount: 150}
[FULL VIEW] Series 3: {name: "Patient - Series 3", rawFilesCount: 150}
[FULL VIEW] Series 4: {name: "Patient - Series 4", rawFilesCount: 150}
[FULL VIEW] Series 5: {name: "Patient - Series 5", rawFilesCount: 150}
[FULL VIEW] Series 6: {name: "Patient - Series 6", rawFilesCount: 150}
[FULL VIEW] Series 7: {name: "Patient - Series 7", rawFilesCount: 150}
[FULL VIEW] Series 8: {name: "Patient - Series 8", rawFilesCount: 150}
[FULL VIEW] 🚀 Navigation state being passed: {
  "allSeriesCount": 8,
  "filesCount": 150,
  "seriesName": "8 Series Available"
}
```

### In DicomViewerPage (After Full View Opens):
```
[DICOM VIEWER] 🔍 SERIES NAVIGATION DEBUG: {
  hasMultipleSeries: true,
  allSeriesLength: 8,
  shouldShowNavigation: true
}
```

### Visual (Top Right):
```
┌─────────────────────────────┐
│  ◀  │  SERIES 1/8  │  ▶    │  ← Should see this
└─────────────────────────────┘
```

## Manual Test Commands

### Check uploadedFiles in ReportingPage:
Open console and type:
```javascript
// This won't work directly, but check the console logs when clicking Full View
```

### Check if series are separate:
Look for the series sidebar on the left. If you see S1, S2, S3... S8, then you have 8 separate series.

### Check navigation state in DicomViewerPage:
After Full View opens, type in console:
```javascript
// Check React DevTools or look for console logs
```

## Expected vs Actual

### Expected (8 Separate Series):
```
uploadedFiles = [
  { name: "Series 1", rawFiles: [150 files] },
  { name: "Series 2", rawFiles: [150 files] },
  { name: "Series 3", rawFiles: [150 files] },
  { name: "Series 4", rawFiles: [150 files] },
  { name: "Series 5", rawFiles: [150 files] },
  { name: "Series 6", rawFiles: [150 files] },
  { name: "Series 7", rawFiles: [150 files] },
  { name: "Series 8", rawFiles: [150 files] }
]
```

### Actual (If Merged):
```
uploadedFiles = [
  { name: "ACQUISITION_SERIES", rawFiles: [1200 files] }
]
```

## Next Steps

1. **Click FULL VIEW button**
2. **Open browser console (F12)**
3. **Look for the log messages above**
4. **Copy and paste the console output**
5. **Share the output so we can diagnose**

## Key Questions to Answer

1. **How many series buttons (S1, S2, etc.) do you see on the left sidebar?**
   - If you see 8 buttons → Series are separate ✅
   - If you see 1 button → Series were merged ❌

2. **What does console show for `uploadedFiles.length`?**
   - Should be 8
   - If it's 1, series were merged

3. **What does console show for `Valid series count`?**
   - Should be 8
   - If less, some series are missing rawFiles

4. **What does console show for `allSeriesCount` in navigation state?**
   - Should be 8
   - If undefined or 1, navigation state is wrong

5. **Do you see the purple series navigation box in Full View?**
   - Yes → Good, buttons should be there
   - No → Check console for `hasMultipleSeries: false`

## Files to Check
- `src/pages/ReportingPage.jsx` - Full View button handler
- `src/pages/DicomViewerPage.jsx` - Series navigation display
- `src/utils/DicomPerformanceOptimizer.js` - ZIP processing (series separation)
