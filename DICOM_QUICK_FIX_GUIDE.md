# DICOM Timeout - Quick Fix Guide

## Problem
Getting timeout errors when loading DICOM files:
```
Error: Timeout: Decoder took too long (Possible CDN/Network Delay)
```

## Quick Solution

### Option 1: Disable Web Workers (Most Reliable)
Open `src/components/AdvancedDicomViewer.jsx` and change line 31:

```javascript
// Change this:
USE_WEB_WORKERS: true,

// To this:
USE_WEB_WORKERS: false,
```

**Result:** More reliable loading, slightly slower for large files.

### Option 2: Increase Timeout (Keep Workers)
Open `src/components/AdvancedDicomViewer.jsx` and change line 37:

```javascript
// Change this:
INITIAL_LOAD_TIMEOUT: 60000, // 60 seconds

// To this:
INITIAL_LOAD_TIMEOUT: 120000, // 120 seconds (2 minutes)
```

**Result:** Gives more time for large/compressed files to load.

### Option 3: Both (Maximum Compatibility)
```javascript
USE_WEB_WORKERS: false,
INITIAL_LOAD_TIMEOUT: 120000, // 2 minutes
```

**Result:** Most reliable, works with almost any DICOM file.

## What Changed?

### Before:
- ❌ 25 second timeout (too short)
- ❌ 7 web workers (too many, caused issues)
- ❌ CDN dependency for codecs
- ❌ No retry logic
- ❌ Poor error messages

### After:
- ✅ 60 second timeout (configurable)
- ✅ 1 web worker (configurable, can disable)
- ✅ Local workers (no CDN dependency)
- ✅ Automatic retry without workers
- ✅ Detailed error messages with solutions

## Configuration Location

File: `src/components/AdvancedDicomViewer.jsx`
Lines: 28-45

```javascript
const DICOM_CONFIG = {
  USE_WEB_WORKERS: true,        // Line 31 - Set to false to disable
  MAX_WEB_WORKERS: 1,            // Line 34 - Number of workers
  INITIAL_LOAD_TIMEOUT: 60000,   // Line 37 - First attempt timeout
  RETRY_TIMEOUT: 30000,          // Line 40 - Retry timeout
  DEBUG_LOGGING: true            // Line 43 - Console logging
};
```

## Testing

1. **Save the file** after making changes
2. **Refresh your browser** (Ctrl+F5 or Cmd+Shift+R)
3. **Upload a DICOM file**
4. **Check browser console** (F12) for detailed logs

### Expected Console Output (Success):
```
[DICOM] Initializing with config: {maxWebWorkers: 0, ...}
[DICOM] Cornerstone3D Core & Loader Fully Initialized
[DICOM] Attempting decode (sync): wadouri:blob:...
[DICOM] First image loaded successfully
```

### If Still Timing Out:
```
[DICOM] First attempt timed out, retrying without web workers...
[DICOM] First image loaded successfully
```

## Recommended Settings by Use Case

### Production (Balanced):
```javascript
USE_WEB_WORKERS: true,
MAX_WEB_WORKERS: 1,
INITIAL_LOAD_TIMEOUT: 60000,
RETRY_TIMEOUT: 30000,
DEBUG_LOGGING: false
```

### Development/Testing:
```javascript
USE_WEB_WORKERS: false,
MAX_WEB_WORKERS: 0,
INITIAL_LOAD_TIMEOUT: 120000,
RETRY_TIMEOUT: 60000,
DEBUG_LOGGING: true
```

### High-Performance (Fast Network):
```javascript
USE_WEB_WORKERS: true,
MAX_WEB_WORKERS: 2,
INITIAL_LOAD_TIMEOUT: 30000,
RETRY_TIMEOUT: 15000,
DEBUG_LOGGING: false
```

## Still Having Issues?

1. **Check file format**: Use uncompressed DICOM files
2. **Check file size**: Files >100MB may need longer timeouts
3. **Check browser**: Chrome/Edge work best
4. **Check console**: Look for specific error messages
5. **Try different file**: Test with a small, uncompressed DICOM

## Need Help?

Check the detailed documentation:
- `DICOM_TIMEOUT_FIX.md` - Complete technical details
- `DICOM_VIEWER_FIX.md` - Original viewer binding fix

## Summary

The timeout issue is now fixed with:
1. ✅ Configurable timeouts (60s default, was 25s)
2. ✅ Reduced web workers (1 default, was 7)
3. ✅ Automatic retry without workers
4. ✅ Better error messages
5. ✅ Easy configuration at top of file

**Just change `USE_WEB_WORKERS: false` if you want the most reliable setup!**
