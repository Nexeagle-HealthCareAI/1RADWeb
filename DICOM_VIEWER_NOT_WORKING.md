# DICOM Viewer Not Working - Diagnostic Guide

## What to Check

### Step 1: Open Browser Console (F12)
Look for error messages. Common errors:

#### Error A: "Cannot read property 'files' of undefined"
**Cause**: Navigation state not passed
**Solution**: You need to navigate to the viewer from ReportingPage, not directly via URL

#### Error B: "files is not defined" or "files is null"
**Cause**: No DICOM files provided
**Solution**: Click "Full View" button from ReportingPage, don't type URL directly

#### Error C: "Cornerstone initialization failed"
**Cause**: Cornerstone library not loaded
**Solution**: Check network tab for failed script loads

#### Error D: Blank white page
**Cause**: JavaScript error preventing render
**Solution**: Check console for the specific error

### Step 2: Check How You're Accessing the Page

#### ❌ WRONG WAY:
Typing `http://localhost:5173/dicom-viewer` directly in browser
- This won't work because no files are passed
- The viewer needs DICOM files to display

#### ✅ CORRECT WAY:
1. Go to ReportingPage: `http://localhost:5173/reporting/[appointmentId]`
2. Upload a DICOM ZIP file OR load existing study
3. Click the **"FULL VIEW"** button
4. This navigates to dicom-viewer WITH the files

### Step 3: Check Console Messages

When you click "Full View", you should see:
```
[FULL VIEW] Button clicked
[FULL VIEW] uploadedFiles.length: X
[FULL VIEW] Valid series count: X
[FULL VIEW] Navigating to DICOM viewer with ALL series
[DICOM VIEWER] Component mounted with state: {...}
[DICOM VIEWER] Files length: X
```

If you see:
```
[DICOM VIEWER] Component mounted with state: null
[DICOM VIEWER] Files length: 0
```
Then no files were passed.

## Quick Fix

### If you typed the URL directly:
1. Go back to ReportingPage
2. Load a study
3. Click "FULL VIEW" button

### If you clicked "Full View" but it's not working:
1. Open console (F12)
2. Copy the error message
3. Share it so I can help

### If the page is blank:
1. Check console for errors
2. Try refreshing (F5)
3. Try clearing cache (Ctrl+Shift+R)

## Test Commands

Open console and run:

```javascript
// Check if React Router passed state
console.log('Location state:', window.location);

// Check if files exist
console.log('Has files:', !!window.cornerstoneViewport);
```

## Common Solutions

### Solution 1: Navigate Properly
Don't type URL directly. Use the "Full View" button.

### Solution 2: Clear Cache
```
Ctrl + Shift + R (Windows)
Cmd + Shift + R (Mac)
```

### Solution 3: Check Network
Open Network tab (F12 → Network)
Look for failed requests (red)

### Solution 4: Restart Dev Server
```
Ctrl + C (stop server)
npm run dev (start again)
```

## What Information I Need

To help you, please provide:

1. **How did you access the page?**
   - Typed URL directly?
   - Clicked "Full View" button?

2. **What do you see?**
   - Blank white page?
   - Error message?
   - Partial page?

3. **Console errors** (F12):
   - Copy/paste the red error messages

4. **Console logs**:
   - Look for [DICOM VIEWER] messages
   - What does it say about files?

This will help me identify the exact issue!
