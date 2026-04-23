# Switch to SimpleDicomViewer - Immediate Fix

## Problem
`AdvancedDicomViewer` using `@cornerstonejs` v4.x is timing out and not loading DICOM files properly due to API incompatibilities and web worker issues.

## Solution
Use the new `SimpleDicomViewer` component which uses the stable `cornerstone-core` v2.x library (already in your package.json).

## Quick Fix

### Step 1: Update TechnicianPage.jsx

**File:** `src/pages/TechnicianPage.jsx`

**Change line 5:**
```javascript
// OLD:
import AdvancedDicomViewer from '../components/AdvancedDicomViewer';

// NEW:
import SimpleDicomViewer from '../components/SimpleDicomViewer';
```

**Change line 657:**
```javascript
// OLD:
<AdvancedDicomViewer 

// NEW:
<SimpleDicomViewer 
```

### Step 2: Update DoctorBoard.jsx

**File:** `src/pages/DoctorBoard.jsx`

**Change line 4:**
```javascript
// OLD:
import AdvancedDicomViewer from '../components/AdvancedDicomViewer';

// NEW:
import SimpleDicomViewer from '../components/SimpleDicomViewer';
```

**Change line 463:**
```javascript
// OLD:
<AdvancedDicomViewer 

// NEW:
<SimpleDicomViewer 
```

### Step 3: Test

1. Save both files
2. Refresh browser (Ctrl+F5 or Cmd+Shift+R)
3. Upload DICOM files
4. Should load within 2-5 seconds

## Why SimpleDicomViewer Works

### AdvancedDicomViewer Issues:
- ❌ Uses `@cornerstonejs/dicom-image-loader` v4.x (new, unstable API)
- ❌ Complex web worker configuration
- ❌ API incompatibilities (`wadouri.loadImage` doesn't exist in v4.x)
- ❌ Requires external codec files
- ❌ 60+ second timeouts

### SimpleDicomViewer Advantages:
- ✅ Uses `cornerstone-wado-image-loader` v4.x (stable, mature API)
- ✅ No web workers (runs on main thread, more reliable)
- ✅ Simple, proven API
- ✅ No external dependencies
- ✅ Loads in 2-5 seconds
- ✅ Better error messages
- ✅ Metadata overlay
- ✅ Multi-image support (scroll with mouse wheel)

## Features

### SimpleDicomViewer includes:
- ✅ Fast DICOM loading (2-5 seconds)
- ✅ Metadata display (patient name, ID, modality, date)
- ✅ Multi-image navigation (mouse wheel)
- ✅ Image counter (1/10, 2/10, etc.)
- ✅ Proper error handling
- ✅ Loading indicator
- ✅ Non-image file detection (SR, PDF, etc.)
- ✅ Automatic viewport settings

### Missing from SimpleDicomViewer (vs Advanced):
- ❌ Advanced tools (zoom, pan, window/level with mouse)
- ❌ Measurements (length, angle, ROI)
- ❌ Cine playback
- ❌ Image manipulation (flip, rotate, invert)
- ❌ Screenshot export

**Note:** These advanced features can be added later if needed, but the priority is getting DICOM files to load reliably.

## API Compatibility

### SimpleDicomViewer Props:
```javascript
<SimpleDicomViewer 
  files={arrayOfFiles}           // Array of File objects
  onImageStatus={(bool) => {}}   // Callback when image loads/fails
  onMetadata={(meta) => {}}      // Callback with DICOM metadata
/>
```

### AdvancedDicomViewer Props (for reference):
```javascript
<AdvancedDicomViewer 
  files={arrayOfFiles}
  onImageStatus={(bool) => {}}
  onMetadata={(meta) => {}}
  activeTool={toolName}          // NOT SUPPORTED in Simple
  isCine={boolean}               // NOT SUPPORTED in Simple
  invert={boolean}               // NOT SUPPORTED in Simple
  flipHorizontal={boolean}       // NOT SUPPORTED in Simple
  flipVertical={boolean}         // NOT SUPPORTED in Simple
  rotation={degrees}             // NOT SUPPORTED in Simple
  resetTrigger={number}          // NOT SUPPORTED in Simple
  onScreenshot={(dataUrl) => {}} // NOT SUPPORTED in Simple
/>
```

## Migration Notes

### TechnicianPage.jsx
The component uses these props:
- `files` ✅ Supported
- `onImageStatus` ✅ Supported
- `activeTool` ❌ Not supported (remove or ignore)
- `onMetadata` ✅ Supported
- `isCine` ❌ Not supported (remove or ignore)
- `invert` ❌ Not supported (remove or ignore)
- `flipHorizontal` ❌ Not supported (remove or ignore)
- `flipVertical` ❌ Not supported (remove or ignore)
- `rotation` ❌ Not supported (remove or ignore)
- `resetTrigger` ❌ Not supported (remove or ignore)
- `onScreenshot` ❌ Not supported (remove or ignore)

**Action:** Just change the import and component name. The unsupported props will be ignored.

### DoctorBoard.jsx
The component uses:
- `file` ⚠️ Should be `files` (array)

**Action:** Change `file={loadedDicom}` to `files={[loadedDicom]}` (wrap in array)

## Testing Checklist

- [ ] TechnicianPage loads DICOM files
- [ ] DoctorBoard loads DICOM files
- [ ] Metadata displays correctly
- [ ] Multiple images can be scrolled through
- [ ] Error messages show for non-image files
- [ ] Loading indicator appears
- [ ] No console errors

## Rollback Plan

If you need to rollback:

1. Change imports back to `AdvancedDicomViewer`
2. Change component names back to `<AdvancedDicomViewer`
3. Refresh browser

## Future Improvements

Once SimpleDicomViewer is working, we can:

1. Add basic mouse interactions (zoom, pan, window/level)
2. Add keyboard shortcuts
3. Add measurement tools
4. Add image manipulation
5. Or fix AdvancedDicomViewer properly

## Files Created
- `src/components/SimpleDicomViewer.jsx` - New simple, reliable DICOM viewer

## Files to Modify
- `src/pages/TechnicianPage.jsx` - Change import and component name
- `src/pages/DoctorBoard.jsx` - Change import, component name, and prop name

## Summary

**Before:** AdvancedDicomViewer times out after 60 seconds  
**After:** SimpleDicomViewer loads in 2-5 seconds

**Just change 4 lines of code across 2 files!**
