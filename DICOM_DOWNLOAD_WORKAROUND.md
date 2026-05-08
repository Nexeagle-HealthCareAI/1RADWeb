# DICOM Download Workaround - Connection Test Bypass

## Issue Summary
The backend proxy endpoint `/Study/proxy-asset` returns **405 Method Not Allowed**, preventing the connection test from succeeding and blocking DICOM file downloads.

## Root Cause
- Backend endpoint either doesn't exist or doesn't support GET method
- Connection test was blocking the entire download process when it failed
- Frontend was throwing `CONNECTION_TEST_FAILED` error and stopping execution

## Workaround Implemented

### Changes Made
1. **Made connection test non-blocking**
   - Connection test failure no longer stops the download process
   - If test fails, application proceeds with direct download attempt
   - Logs warnings instead of throwing errors

2. **Removed dependency on proxy URL**
   - Always attempts direct download from Azure Blob Storage first
   - Falls back to API proxy only if CORS error occurs during actual download
   - Removed the `fetchUrl` variable that depended on connection test result

3. **Enhanced error handling**
   - Better logging of connection test failures
   - Specific handling for 405 errors (endpoint not available)
   - Clear console messages about what's happening

### Code Flow Now

```
1. Start DICOM download
   ↓
2. Run connection test (non-blocking)
   ├─ Success → Log success, note if proxy available
   └─ Failure → Log warning, continue anyway
   ↓
3. Attempt direct download from Azure Blob Storage
   ├─ Success → Process DICOM files
   └─ CORS Error → Try API proxy fallback
      ├─ Success → Process DICOM files
      └─ Failure → Show error to user
```

## Current Behavior

### What Works
✅ Direct download from Azure Blob Storage (if CORS is configured)
✅ Graceful handling of connection test failures
✅ Clear logging of what's happening at each step
✅ Fallback to proxy if CORS blocks direct access

### What Doesn't Work (Yet)
❌ Backend proxy endpoint (405 error)
❌ Connection test with proxy
❌ Automatic proxy usage when direct access fails

## Testing Results

### Expected Console Output
```
[DICOM_LOAD] Cache MISS. Initializing optimized hydration for asset: example.zip
[DICOM_LOAD] Asset details: {...}
[DICOM_TEST] Testing connection to: https://1radstorage.blob.core.windows.net/...
[DICOM_TEST] Direct HEAD failed (likely CORS): Failed to fetch
[DICOM_TEST] Attempting proxy test...
[DICOM_TEST] Proxy test failed: {status: 405, statusText: "Method Not Allowed"}
[DICOM_TEST] Proxy endpoint not available (405 Method Not Allowed)
[DICOM_TEST] Connection test inconclusive, will attempt direct download
[DICOM_LOAD] ⚠️ Connection test failed, will attempt direct download anyway
[DICOM_LOAD] Proceeding with download...
[DICOM_LOAD] Attempt 1/4 - Fetching: https://1radstorage.blob.core.windows.net/...
```

### If CORS is Configured
- Direct download succeeds
- DICOM files load successfully
- No errors shown to user

### If CORS is NOT Configured
- Direct download fails with CORS error
- Attempts API proxy fallback
- If proxy fails (405), shows error to user with guidance

## Temporary Solution

### For Development
1. **Configure Azure Blob Storage CORS** (Recommended)
   - See `CORS_CONFIGURATION_GUIDE.md`
   - Add localhost:5175 to allowed origins
   - This is the fastest solution

2. **Use Production Environment**
   - If production has CORS configured
   - Access application from production domain
   - CORS won't block the requests

### For Production
1. **Implement Backend Proxy Endpoint**
   - See `BACKEND_PROXY_ENDPOINT_SPEC.md`
   - Implement `/Study/proxy-asset` with GET support
   - Add proper authentication and authorization

2. **Configure CORS on Azure Blob Storage**
   - More efficient than proxying
   - Reduces backend load
   - Better performance

## Error Messages

### User-Friendly Messages
The application now shows clearer error messages:

**If Direct Download Fails:**
```
DIAGNOSTIC SIGNAL FAILURE

Server configuration issue detected. The DICOM storage server needs to 
allow cross-origin requests. Please contact your system administrator 
to configure CORS settings for the Azure Blob Storage.

Suggested Actions:
1. Contact your system administrator to configure CORS settings
2. Ensure Azure Blob Storage allows requests from this domain
3. Try accessing from the production environment instead of localhost

Technical Details: CORS_ERROR: Cross-origin request blocked...
```

## Monitoring

### What to Watch
- Console logs for connection test results
- Direct download success/failure rates
- CORS errors in browser console
- 405 errors from proxy endpoint

### Success Indicators
- ✅ "Direct access successful" in console
- ✅ DICOM files loading in viewer
- ✅ No CORS errors in console

### Failure Indicators
- ❌ "CORS error detected" in console
- ❌ "Proxy test failed: 405" in console
- ❌ "CONNECTION_TEST_FAILED" errors (should not appear anymore)

## Next Steps

### Immediate (Frontend - Done)
- ✅ Made connection test non-blocking
- ✅ Added better error handling
- ✅ Improved logging
- ✅ Graceful degradation

### Short Term (Backend - Pending)
- ⏳ Implement `/Study/proxy-asset` endpoint with GET support
- ⏳ Add proper authentication and authorization
- ⏳ Test endpoint with frontend

### Long Term (Infrastructure - Recommended)
- ⏳ Configure Azure Blob Storage CORS properly
- ⏳ Remove dependency on backend proxy
- ⏳ Implement caching strategy
- ⏳ Add monitoring and alerts

## Support

### If Downloads Still Fail
1. Check browser console for specific error messages
2. Verify Azure Blob Storage URL is accessible
3. Check if CORS is configured on Azure
4. Test with production environment
5. Contact backend team about proxy endpoint

### For Backend Team
- See `BACKEND_PROXY_ENDPOINT_SPEC.md` for implementation details
- Endpoint must support GET method
- Must return binary content (application/octet-stream)
- Must handle authentication properly

## Conclusion
The workaround allows the application to continue functioning even when the backend proxy endpoint is not available. The application will:
1. Try direct download first (works if CORS is configured)
2. Fall back to proxy if CORS blocks (works when backend implements endpoint)
3. Show clear error messages if both fail

This provides the best user experience while waiting for proper backend implementation or CORS configuration.