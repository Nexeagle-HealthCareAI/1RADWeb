# Testing Guide - DICOM Upload and Full View Fixes

## Quick Test Checklist

### ✅ Test 1: TechnicianPage File Upload (Should Work Now)

**Steps:**
1. Navigate to TechnicianPage
2. Click on a study to open workspace
3. Click "IMPORT" button
4. Select a ZIP file containing DICOM images
5. Wait for processing to complete

**Expected Results:**
- ✅ Progress indicator shows: "processing: X/Y files (Z series found)"
- ✅ Files are extracted and displayed in the asset list
- ✅ Console shows: `[TECH] Processing statistics: {totalFiles, validFiles, corruptedFiles}`
- ✅ If corrupted files found, alert shows statistics
- ✅ DICOM viewer displays the first series automatically

**If It Fails:**
- Check console for `[TECH] Optimized ZIP extraction failed` error
- Look for the specific error message
- Verify the ZIP file contains valid DICOM files

---

### ⏳ Test 2: ReportingPage Remote File Loading (Requires Backend Fix)

**Steps:**
1. Navigate to DoctorBoard
2. Click "EXECUTE REPORTER" on an appointment with DICOM files
3. Wait for ReportingPage to load
4. Watch the DICOM viewer area

**Expected Results:**
- ✅ Console shows: `[DICOM_LOAD] Checking persistent cache for asset: <id>`
- ✅ Console shows: `[DICOM_LOAD] Proceeding with download...`
- ✅ Console shows: `[DICOM_LOAD] Binary stream received. Size: X MB`
- ✅ Console shows: `[DICOM_LOAD] Optimized processing complete`
- ✅ DICOM viewer displays images
- ✅ Slice counter shows: "SLICE: 1 / X"

**If It Fails:**
Check console for these errors:

**Error 1: 405 Method Not Allowed**
```
Failed to load resource: the server responded with a status of 405 (Method Not Allowed)
[DICOM_LOAD] Optimized hydration failure Error: CONNECTION_TEST_FAILED
```
**Solution**: Backend team needs to fix `/Study/proxy-asset` endpoint

**Error 2: CORS Error**
```
Access to fetch at 'https://1radstorage.blob.core.windows.net/...' from origin 'http://localhost:3000' has been blocked by CORS policy
```
**Solution**: Configure Azure Blob Storage CORS settings

**Error 3: Network Error**
```
[DICOM_LOAD] Optimized hydration failure Error: NETWORK_ERROR
```
**Solution**: Check internet connection, verify blob URL is accessible

---

### ⏳ Test 3: Full View Navigation (Requires Test 2 to Pass)

**Steps:**
1. After files load in ReportingPage (Test 2)
2. Click "FULL VIEW" button in DICOM viewer controls
3. Wait for navigation

**Expected Results:**
- ✅ Console shows: `[FULL VIEW] Button clicked`
- ✅ Console shows: `[FULL VIEW] uploadedFiles: [...]` (not empty)
- ✅ Console shows: `[FULL VIEW] Navigating to DICOM viewer with state: {...}`
- ✅ Page navigates to `/dicom-viewer`
- ✅ Full-screen DICOM viewer opens
- ✅ All slices are visible
- ✅ Slice counter shows correct total
- ✅ Tools are accessible

**If It Fails:**
Check console for these errors:

**Error 1: No Files Available**
```
[FULL VIEW] No DICOM files available
[FULL VIEW] uploadedFiles.length: 0
```
**Solution**: Files didn't load (go back to Test 2)

**Error 2: Navigation State Lost**
```
[DICOM VIEWER] ❌ No files available!
```
**Solution**: Files were loaded but not passed correctly (check navigation state)

---

## Detailed Testing Scenarios

### Scenario 1: Upload Valid DICOM ZIP

**Test File**: ZIP containing 100+ DICOM images from single study

**Steps:**
1. TechnicianPage → Open workspace
2. Click IMPORT → Select ZIP file
3. Watch processing

**Expected Console Output:**
```
[TECH] New series discovered: T1 AXIAL
[TECH] New series discovered: T2 SAGITTAL
[TECH] Processing result: {type: "object", hasSeries: true, seriesCount: 2, stats: {...}}
[TECH] Processing statistics: {totalFiles: 150, validFiles: 150, corruptedFiles: 0, skippedFiles: 0}
```

**Expected UI:**
- Progress bar shows processing
- 2 series appear in asset list
- First series loads in viewer
- Slice counter shows: "1 / 75"

---

### Scenario 2: Upload ZIP with Corrupted Files

**Test File**: ZIP with mix of valid and corrupted DICOM files

**Steps:**
1. TechnicianPage → Open workspace
2. Click IMPORT → Select ZIP file
3. Watch processing

**Expected Console Output:**
```
[DICOM_OPTIMIZER] Corrupted file detected: file_005.dcm - CORRUPTED_FILE: ...
[TECH] Processing statistics: {totalFiles: 100, validFiles: 95, corruptedFiles: 5, skippedFiles: 0}
[TECH] ⚠️ Eliminated 5 corrupted files from upload
```

**Expected UI:**
- Alert shows: "Study loaded successfully! ✅ Valid files: 95 ⚠️ Corrupted files eliminated: 5"
- Only valid files are displayed
- Viewer works normally with valid files

---

### Scenario 3: Upload Empty or Invalid ZIP

**Test File**: Empty ZIP or ZIP with no DICOM files

**Steps:**
1. TechnicianPage → Open workspace
2. Click IMPORT → Select ZIP file
3. Watch processing

**Expected Console Output:**
```
[TECH] Processing result: {type: "object", hasSeries: true, seriesCount: 0, stats: {...}}
[TECH] Optimized ZIP extraction failed Error: NO_DICOM_SERIES: No valid DICOM images found
```

**Expected UI:**
- Alert shows: "NO_DICOM_SERIES: No valid DICOM images found in the uploaded file"
- No files added to asset list

---

### Scenario 4: Remote File Loading (Backend Dependent)

**Prerequisites**: 
- Appointment must have DICOM files uploaded
- Backend `/Study/proxy-asset` endpoint must work
- OR Azure Blob Storage CORS must be configured

**Steps:**
1. DoctorBoard → Click "EXECUTE REPORTER"
2. ReportingPage loads
3. Watch DICOM viewer area

**Expected Console Output (Success):**
```
[1RAD] Found 1 existing study assets
[1RAD] Processed assets: [{id: "...", name: "...", remoteUrl: "...", needsHydration: true}]
[1RAD] Auto-hydrating first asset: BRAIN.zip
[DICOM_LOAD] Checking persistent cache for asset: ...
[DICOM_LOAD] Cache MISS. Initializing optimized hydration...
[DICOM_LOAD] Testing asset connectivity...
[DICOM_LOAD] ✅ Connection test passed (UseProxy: false)
[DICOM_LOAD] Proceeding with download...
[DICOM_LOAD] Binary stream received. Size: 45.23 MB
[DICOM_LOAD] Processing statistics: {totalFiles: 150, validFiles: 150, corruptedFiles: 0}
[DICOM_LOAD] Optimized processing complete. Discovered 1 valid diagnostic series.
```

**Expected Console Output (Failure - 405):**
```
[DICOM_LOAD] Testing asset connectivity...
Failed to load resource: the server responded with a status of 405 (Method Not Allowed)
[DICOM_LOAD] ⚠️ Connection test failed, will attempt direct download anyway
[DICOM_LOAD] Proceeding with download...
[DICOM_LOAD] Optimized hydration failure Error: CORS_ERROR: Cross-origin request blocked
```

**Expected Console Output (Failure - CORS):**
```
Access to fetch at 'https://1radstorage.blob.core.windows.net/...' has been blocked by CORS policy
[DICOM_LOAD] CORS error detected, trying API proxy fallback...
[DICOM_LOAD] API proxy failed: Request failed with status code 405
[DICOM_LOAD] Optimized hydration failure Error: CORS_ERROR: Cross-origin request blocked
```

---

## Debug Commands

### Check Current State

**In Browser Console:**
```javascript
// Check if files are loaded
console.log('uploadedFiles:', uploadedFiles);
console.log('uploadedFiles.length:', uploadedFiles.length);
console.log('activeAssetIndex:', activeAssetIndex);
console.log('Current asset:', uploadedFiles[activeAssetIndex]);
console.log('rawFiles:', uploadedFiles[activeAssetIndex]?.rawFiles);
console.log('needsHydration:', uploadedFiles[activeAssetIndex]?.needsHydration);
```

### Check Network Requests

**In Browser DevTools → Network Tab:**
1. Filter by "proxy-asset" or "blob.core.windows.net"
2. Look for failed requests (red)
3. Click on request to see details:
   - Request Method (should be GET)
   - Status Code (200 = success, 405 = wrong method, 403 = forbidden, 404 = not found)
   - Response Headers (check CORS headers)
   - Response Body (check error message)

### Check CORS Headers

**Required Response Headers:**
```
Access-Control-Allow-Origin: * (or your domain)
Access-Control-Allow-Methods: GET, HEAD, OPTIONS
Access-Control-Allow-Headers: *
```

**If Missing**: Configure Azure Blob Storage CORS

---

## Common Issues and Solutions

### Issue 1: "classifiedAssets.map is not a function"
**Status**: ✅ FIXED
**Solution**: Already applied in TechnicianPage.jsx
**Test**: Upload ZIP file in TechnicianPage

### Issue 2: "uploadedFiles.length: 0"
**Status**: ⏳ REQUIRES BACKEND FIX
**Cause**: Files not loading due to 405 or CORS error
**Solution**: 
1. Fix backend `/Study/proxy-asset` endpoint
2. OR configure Azure Blob Storage CORS
**Test**: Load appointment in ReportingPage

### Issue 3: "405 Method Not Allowed"
**Status**: ⏳ REQUIRES BACKEND FIX
**Cause**: Proxy endpoint doesn't exist or wrong HTTP method
**Solution**: Backend team needs to implement/fix endpoint
**Endpoint Spec**: See `BACKEND_PROXY_ENDPOINT_SPEC.md`

### Issue 4: "CORS policy blocked"
**Status**: ⏳ REQUIRES AZURE CONFIG
**Cause**: Azure Blob Storage doesn't allow cross-origin requests
**Solution**: Configure CORS in Azure Portal
**Guide**: See `CORS_CONFIGURATION_GUIDE.md`

### Issue 5: "No DICOM files available for full-screen viewing"
**Status**: ⏳ DEPENDS ON ISSUE 2
**Cause**: Files didn't load (uploadedFiles is empty)
**Solution**: Fix Issue 2 first, then test Full View

---

## Success Indicators

### TechnicianPage Upload
✅ No console errors
✅ Files appear in asset list
✅ Viewer displays images
✅ Slice navigation works
✅ Statistics shown if corrupted files found

### ReportingPage Loading
✅ Console shows hydration progress
✅ No 405 or CORS errors
✅ Files appear in viewer
✅ uploadedFiles state populated
✅ Full View button enabled

### Full View Navigation
✅ Navigation succeeds
✅ DicomViewerPage opens
✅ All slices visible
✅ Tools work correctly
✅ Back button returns to reporting

---

## Reporting Issues

When reporting issues, include:

1. **Which test scenario** you were running
2. **Console logs** (copy all `[TECH]`, `[DICOM_LOAD]`, `[FULL VIEW]` messages)
3. **Network tab** (screenshot of failed requests)
4. **Error messages** (exact text from alerts or console)
5. **Browser and version** (Chrome 120, Firefox 121, etc.)
6. **Environment** (localhost, staging, production)

### Example Issue Report

```
Test: Scenario 4 - Remote File Loading
Environment: localhost:3000
Browser: Chrome 120

Console Output:
[DICOM_LOAD] Testing asset connectivity...
Failed to load resource: 405 (Method Not Allowed)
[DICOM_LOAD] Optimized hydration failure Error: CORS_ERROR

Network Tab:
GET /api/v1/Study/proxy-asset?url=... → 405 Method Not Allowed

Expected: Files should load
Actual: Files don't load, uploadedFiles.length = 0
```

---

## Next Steps After Testing

### If TechnicianPage Works (Expected)
✅ Mark Issue 1 as resolved
✅ Document any edge cases found
✅ Move to testing ReportingPage

### If ReportingPage Fails (Expected)
1. Document exact error (405 or CORS)
2. Share with backend team
3. Provide endpoint specification
4. Wait for backend fix
5. Retest after fix

### If Full View Fails
1. Verify ReportingPage loaded files successfully
2. Check console logs for navigation state
3. Verify DicomViewerPage receives files
4. Report specific failure point

---

## Contact

For technical support:
- Check documentation in project root
- Review console logs for detailed errors
- Share debug information with team
- Reference this testing guide for context
